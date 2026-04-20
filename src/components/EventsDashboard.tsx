import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { UserProfile, HotelEvent, Company } from '../types';
import {
  Calendar as CalendarIcon,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Users,
  Clock,
  MapPin,
  FileText,
  DollarSign,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  Filter,
  MoreVertical,
  X,
  Edit2,
  Printer,
  Download,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, startOfToday, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const EVENT_TYPES = ['Corporativo', 'Social', 'Casamento', 'Batizado', 'Formatura', 'Exposição', 'Outro'];
const HALLS = ['Salão Búzios', 'Salão Rio das Ostras', 'Salão Cabo Frio', 'Sala de Reunião', 'Salão Sétimo Andar', 'Rooftop'];

export default function EventsDashboard({ profile }: { profile: UserProfile }) {
  const [activeTab, setActiveTab] = useState<'calendar' | 'register'>('calendar');
  const [events, setEvents] = useState<HotelEvent[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingEvent, setViewingEvent] = useState<HotelEvent | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cancelModal, setCancelModal] = useState<{ event: HotelEvent; reason: string } | null>(null);

  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));

  // Registration form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    start_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: format(new Date(), 'yyyy-MM-dd'),
    start_time: '08:00',
    end_time: '18:00',
    hall_name: HALLS[0],
    event_type: EVENT_TYPES[0],
    attendees_count: 0,
    total_value: 0,
    items_included: '',
    client_profile: '',
    client_category: 'Pessoa física' as HotelEvent['client_category'],
    check_info: '',
    staff_roadmap: '',
    important_notes: '',
    company_id: '',
    status: 'planned' as HotelEvent['status']
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // Sync: ensure every active event has an OS number and a linked fatura
      try {
        const { error: syncErr } = await supabase.rpc('sync_faturas');
        if (syncErr) console.warn('sync_faturas rpc error (non-fatal):', syncErr);
      } catch (e) {
        console.warn('sync_faturas failed (non-fatal):', e);
      }

      const { data: eventsData, error: eventsError } = await supabase
        .from('hotel_events')
        .select('*')
        .order('start_date');

      const { data: companiesData } = await supabase
        .from('companies')
        .select('*')
        .order('name');

      if (eventsError) {
        console.warn("hotel_events error:", eventsError);
        setEvents([]);
      } else {
        setEvents(eventsData || []);
      }

      if (companiesData) setCompanies(companiesData);
    } catch (error) {
      console.error("Error fetching events:", error);
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingId) {
        const { error } = await supabase
          .from('hotel_events')
          .update(formData)
          .eq('id', editingId);

        if (error) throw error;
        toast.success('Evento atualizado com sucesso!');
        setEditingId(null);
      } else {
        const osNumber = `OS-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
        const newEvent = {
          ...formData,
          os_number: osNumber,
          created_at: new Date().toISOString(),
          created_by: profile.id
        };

        const { error } = await supabase.from('hotel_events').insert([newEvent]);

        if (error) throw error;

        // Create fatura/OS in Faturas & Arquivos
        const { error: faturaError } = await supabase.from('files').insert([{
          type: 'Fatura Evento',
          category: 'Fatura Evento',
          original_name: `OS ${osNumber} - ${newEvent.name}`,
          storage_path: `eventos/${osNumber}`,
          amount: newEvent.total_value,
          period: format(new Date(newEvent.start_date), 'yyyy-MM'),
          due_date: newEvent.start_date,
          status: 'PENDING',
          upload_date: new Date().toISOString(),
          uploader_id: profile.id,
          company_id: newEvent.company_id || null,
          event_os_number: osNumber,
          reservation_code: osNumber,
        }]);
        if (faturaError) {
          console.error('Erro ao criar fatura do evento:', faturaError);
          toast.warning('Evento criado, mas houve falha ao gerar a fatura. Verifique em Faturas & Arquivos.');
        } else {
          toast.success('Evento cadastrado e O.S. gerada com sucesso!');
        }
      }

      setFormData({
        name: '',
        description: '',
        start_date: format(new Date(), 'yyyy-MM-dd'),
        end_date: format(new Date(), 'yyyy-MM-dd'),
        start_time: '08:00',
        end_time: '18:00',
        hall_name: HALLS[0],
        event_type: EVENT_TYPES[0],
        attendees_count: 0,
        total_value: 0,
        items_included: '',
        client_profile: '',
        client_category: 'Pessoa física',
        check_info: '',
        staff_roadmap: '',
        important_notes: '',
        company_id: '',
        status: 'planned'
      });
      setActiveTab('calendar');
      fetchData();
    } catch (error) {
      console.error("Error saving event:", error);
      toast.error('Erro ao salvar evento.');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (event: HotelEvent) => {
    setFormData({
      name: event.name,
      description: event.description || '',
      start_date: event.start_date,
      end_date: event.end_date,
      start_time: event.start_time || '08:00',
      end_time: event.end_time || '18:00',
      hall_name: event.hall_name,
      event_type: event.event_type,
      attendees_count: event.attendees_count,
      total_value: event.total_value,
      items_included: event.items_included || '',
      client_profile: event.client_profile || '',
      client_category: event.client_category || 'Pessoa física',
      check_info: event.check_info || '',
      staff_roadmap: event.staff_roadmap || '',
      important_notes: event.important_notes || '',
      company_id: event.company_id || '',
      status: event.status
    });
    setEditingId(event.id);
    setActiveTab('register');
    setViewingEvent(null);
  };

  const handleCancel = (event: HotelEvent) => {
    setCancelModal({ event, reason: '' });
  };

  const confirmCancel = async () => {
    if (!cancelModal) return;
    const { event, reason } = cancelModal;
    if (!reason.trim()) {
      toast.error('É necessário informar um motivo para o cancelamento.');
      return;
    }
    setCancelModal(null);
    setLoading(true);
    try {
      const { error: rpcError } = await supabase.rpc('cancel_event', {
        p_event_id: event.id,
        p_reason: reason,
      });
      if (rpcError) throw rpcError;

      toast.success('Evento e fatura cancelados com sucesso!');
      setViewingEvent(null);
      fetchData();
    } catch (error: any) {
      console.error('Error cancelling event:', error);
      const msg = error?.message || String(error);
      if (msg.includes('no column') || msg.includes('no such column')) {
        toast.error('Banco de dados desatualizado. Reinicie o servidor.');
      } else if (msg.includes('não encontrado') || msg.includes('404')) {
        toast.error('Evento não encontrado no banco de dados.');
      } else {
        toast.error(`Erro ao cancelar: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadContract = async (event: HotelEvent) => {
    const element = document.getElementById('contract-pdf-template');
    if (!element) {
      toast.error('Template para PDF não encontrado.');
      return;
    }

    setLoading(true);
    const toastId = toast.loading('Gerando PDF do contrato...');

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`CONTRATO_${event.os_number || 'EVENTO'}.pdf`);

      toast.success('Contrato em PDF gerado com sucesso!', { id: toastId });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Falha ao gerar o PDF. Tente novamente.', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth)
  });

  const nextMonth = () => setCurrentMonth(addDays(endOfMonth(currentMonth), 1));
  const prevMonth = () => setCurrentMonth(addDays(startOfMonth(currentMonth), -1));

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-900">Gestão de Eventos</h1>
          <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest mt-1">Planejamento • Reservas de Salão • O.S.</p>
        </div>

        <div className="flex gap-1 p-1 bg-neutral-100 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('calendar')}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'calendar' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
          >
            Calendário
          </button>
          <button
            onClick={() => setActiveTab('register')}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'register' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
          >
            Novo Evento / O.S.
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'calendar' ? (
          <motion.div
            key="calendar"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            <div className="bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl font-black text-gray-900 capitalize">
                    {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
                  </h2>
                  <div className="flex gap-1">
                    <button onClick={prevMonth} className="p-2 hover:bg-neutral-50 rounded-lg transition-colors border border-neutral-100"><ChevronLeft className="w-4 h-4" /></button>
                    <button onClick={nextMonth} className="p-2 hover:bg-neutral-50 rounded-lg transition-colors border border-neutral-100"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex items-center gap-2 px-3 py-1 bg-neutral-50 rounded-full border border-neutral-100">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <span className="text-[10px] font-bold text-neutral-500 uppercase">Confirmado</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 bg-neutral-50 rounded-full border border-neutral-100">
                    <div className="w-2 h-2 bg-amber-500 rounded-full" />
                    <span className="text-[10px] font-bold text-neutral-500 uppercase">Planejado</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 bg-neutral-50 rounded-full border border-neutral-100">
                    <div className="w-2 h-2 bg-neutral-400 rounded-full" />
                    <span className="text-[10px] font-bold text-neutral-500 uppercase">Cancelado</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-px bg-neutral-200 rounded-2xl overflow-hidden border border-neutral-200">
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map(day => (
                  <div key={day} className="bg-neutral-50 p-4 text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">{day}</p>
                  </div>
                ))}

                {/* Pad empty days at start of month */}
                {Array.from({ length: startOfMonth(currentMonth).getDay() }).map((_, i) => (
                  <div key={`empty-${i}`} className="bg-white p-4 h-32 opacity-50" />
                ))}

                {days.map(day => {
                  const dayEvents = events.filter(e => isSameDay(parseISO(e.start_date), day));
                  return (
                    <div key={day.toString()} className={`bg-white p-4 h-32 border-t border-r last:border-r-0 border-neutral-100 hover:bg-neutral-50 transition-colors group relative ${isToday(day) ? 'bg-blue-50/30' : ''}`}>
                      <span className={`text-sm font-black ${isToday(day) ? 'text-blue-600 bg-blue-100 w-8 h-8 flex items-center justify-center rounded-full -ml-1 -mt-1' : 'text-neutral-400'}`}>
                        {format(day, 'd')}
                      </span>

                      <div className="mt-2 space-y-1">
                        {dayEvents.map(event => (
                          <button
                            key={event.id}
                            onClick={() => setViewingEvent(event)}
                            className={`w-full text-left p-1.5 rounded-lg text-[9px] font-bold truncate transition-all flex items-center gap-1.5 ${
                              event.status === 'cancelled'
                                ? 'bg-neutral-100 text-neutral-400 border border-neutral-200 line-through'
                                : event.status === 'confirmed'
                                  ? 'bg-green-50 text-green-700 border border-green-100'
                                  : 'bg-amber-50 text-amber-700 border border-amber-100'
                            }`}
                          >
                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${event.status === 'cancelled' ? 'bg-neutral-400' : event.status === 'confirmed' ? 'bg-green-500' : 'bg-amber-500'}`} />
                            {event.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Event List Card */}
            <div className="bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm">
               <h3 className="text-lg font-black text-gray-900 mb-6 flex items-center gap-2">
                 <Clock className="w-5 h-5 text-primary" />
                 Próximos Eventos
               </h3>
               <div className="space-y-4">
                  {events.length > 0 ? (
                    events.map(event => (
                      <div key={event.id} className={`flex items-center justify-between p-4 rounded-2xl border transition-all group ${event.status === 'cancelled' ? 'bg-neutral-50 border-neutral-200 opacity-60' : 'bg-neutral-50 border-neutral-100 hover:border-primary'}`}>
                        <div className="flex items-center gap-4">
                           <div className="w-12 h-12 rounded-xl bg-white border border-neutral-200 flex flex-col items-center justify-center">
                              <span className="text-[10px] font-black uppercase text-neutral-400 leading-none mb-0.5">{format(parseISO(event.start_date), 'MMM', { locale: ptBR })}</span>
                              <span className="text-lg font-black text-neutral-900 leading-none">{format(parseISO(event.start_date), 'dd')}</span>
                           </div>
                           <div>
                              <div className="flex items-center gap-2">
                                <h4 className={`font-black ${event.status === 'cancelled' ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>{event.name}</h4>
                                {event.status === 'cancelled' && (
                                  <span className="px-2 py-0.5 bg-red-100 text-red-500 text-[9px] font-black uppercase rounded-full">Cancelado</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1">
                                 <span className="flex items-center gap-1 text-[10px] font-bold text-neutral-500 uppercase">
                                    <MapPin className="w-3 h-3 text-neutral-400" />
                                    {event.hall_name}
                                 </span>
                                 <span className="flex items-center gap-1 text-[10px] font-bold text-neutral-500 uppercase">
                                    <Users className="w-3 h-3 text-neutral-400" />
                                    {event.attendees_count} pessoas
                                 </span>
                              </div>
                           </div>
                        </div>
                        <div className="flex items-center gap-4">
                           <div className="text-right">
                              <p className="text-[10px] font-black uppercase text-neutral-400 mb-0.5">O.S. Numero</p>
                              <p className="text-xs font-bold text-neutral-900">{event.os_number}</p>
                           </div>
                           <button
                            onClick={() => setViewingEvent(event)}
                            className="p-3 bg-white hover:bg-neutral-900 hover:text-white rounded-xl border border-neutral-200 transition-all shadow-sm"
                           >
                              <ArrowRight className="w-4 h-4" />
                           </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-20 text-center">
                       <p className="text-neutral-400 font-bold italic">Nenhum evento registrado no momento.</p>
                    </div>
                  )}
               </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="register"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start"
          >
            {/* Form */}
            <div className="xl:col-span-5 space-y-6">
              <div className="bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Nome do Evento</label>
                       <input
                         required
                         value={formData.name}
                         onChange={e => setFormData({...formData, name: e.target.value})}
                         className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary/10 outline-none font-bold"
                         placeholder="Ex: Workshop de Liderança"
                       />
                    </div>

                    <div>
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Local (Salão)</label>
                       <select
                         value={formData.hall_name}
                         onChange={e => setFormData({...formData, hall_name: e.target.value})}
                         className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-bold"
                       >
                         {HALLS.map(h => <option key={h} value={h}>{h}</option>)}
                       </select>
                    </div>

                    <div>
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Tipo de Evento</label>
                       <select
                         value={formData.event_type}
                         onChange={e => setFormData({...formData, event_type: e.target.value})}
                         className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-bold"
                       >
                         {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                       </select>
                    </div>

                    <div>
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Data de Início</label>
                       <input
                         type="date"
                         required
                         value={formData.start_date}
                         onChange={e => setFormData({...formData, start_date: e.target.value, end_date: e.target.value})}
                         className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-bold"
                       />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                       <div>
                          <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Início</label>
                          <input
                            type="time"
                            value={formData.start_time}
                            onChange={e => setFormData({...formData, start_time: e.target.value})}
                            className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-bold"
                          />
                       </div>
                       <div>
                          <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Fim</label>
                          <input
                            type="time"
                            value={formData.end_time}
                            onChange={e => setFormData({...formData, end_time: e.target.value})}
                            className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-bold"
                          />
                       </div>
                    </div>

                    <div>
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Número de Participantes</label>
                       <div className="relative">
                          <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                          <input
                            type="number"
                            required
                            value={formData.attendees_count}
                            onChange={e => setFormData({...formData, attendees_count: parseInt(e.target.value)})}
                            className="w-full pl-12 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-bold"
                            placeholder="0"
                          />
                       </div>
                    </div>

                    <div>
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Valor do Contrato (R$)</label>
                       <div className="relative">
                          <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                          <input
                            type="number"
                            required
                            value={formData.total_value}
                            onChange={e => setFormData({...formData, total_value: parseFloat(e.target.value)})}
                            className="w-full pl-12 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-bold"
                            placeholder="0,00"
                          />
                       </div>
                    </div>

                    <div>
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Perfil do Contratante</label>
                       <select
                         value={formData.client_category}
                         onChange={e => setFormData({...formData, client_category: e.target.value as any})}
                         className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-bold"
                       >
                         <option value="Pessoa física">Pessoa física</option>
                         <option value="Empresa">Empresa</option>
                         <option value="Agência">Agência</option>
                       </select>
                    </div>

                    <div>
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Perfil do Evento / Cliente</label>
                       <input
                         value={formData.client_profile}
                         onChange={e => setFormData({...formData, client_profile: e.target.value})}
                         className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-bold"
                         placeholder="Ex: Noivos em pré-casamento"
                       />
                    </div>

                    <div>
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Observações de Check-in/out</label>
                       <input
                         value={formData.check_info}
                         onChange={e => setFormData({...formData, check_info: e.target.value})}
                         className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-bold"
                         placeholder="Ex: Check-in sexta / Check-out sábado"
                       />
                    </div>

                    <div className="md:col-span-2">
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Observações Importantes (Bullet points)</label>
                       <textarea
                         value={formData.important_notes}
                         onChange={e => setFormData({...formData, important_notes: e.target.value})}
                         className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-bold h-24"
                         placeholder="• Item 1&#10;• Item 2"
                       />
                    </div>

                    <div className="md:col-span-2">
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Passo-a-passo para Colaboradores (Cronograma)</label>
                       <textarea
                         value={formData.staff_roadmap}
                         onChange={e => setFormData({...formData, staff_roadmap: e.target.value})}
                         className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-bold h-48"
                         placeholder="Dia 14/09/2025&#10;Recepção VIP&#10;- Hospedagem: Descrição...&#10;- Brinde: Descrição..."
                       />
                    </div>

                    <div className="md:col-span-2">
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Itens Inclusos (Separe por vírgula)</label>
                       <textarea
                         value={formData.items_included}
                         onChange={e => setFormData({...formData, items_included: e.target.value})}
                         className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-bold h-24"
                         placeholder="Ex: Projetor, Coffee Break, Welcome Drink..."
                       />
                    </div>

                    <div className="md:col-span-2">
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Empresa Contratante</label>
                       <select
                         value={formData.company_id}
                         onChange={e => setFormData({...formData, company_id: e.target.value})}
                         className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-bold"
                       >
                         <option value="">Particular / Pessoa Física</option>
                         {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                       </select>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-neutral-100 flex justify-end">
                     <button
                       type="submit"
                       disabled={loading}
                       className="px-8 py-3 bg-neutral-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-neutral-800 transition-all flex items-center gap-2 shadow-lg shadow-neutral-900/10"
                     >
                       {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                         <>
                           <CheckCircle2 className="w-4 h-4" />
                           Cadastrar Evento & Gerar O.S.
                         </>
                       )}
                     </button>
                  </div>
                </form>
               </div>
            </div>

            {/* O.S. Live Preview */}
            <div className="xl:col-span-7 space-y-6">
               <div className="bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm sticky top-24 overflow-hidden relative">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-12 -mt-12" />

                  <div className="relative z-10">
                     <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                           <FileText className="w-6 h-6 text-primary" />
                           <h3 className="text-sm font-black text-neutral-900 uppercase">Visualização da O.S. (A4)</h3>
                        </div>
                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-3 py-1 bg-neutral-100 rounded-full">Papel A4 - {formData.client_category}</span>
                        <button
                          onClick={async () => {
                            const el = document.getElementById('contract-pdf-template');
                            if (!el) return;
                            const { default: html2canvas } = await import('html2canvas');
                            const { default: jsPDF } = await import('jspdf');
                            const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
                            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                            const props = pdf.getImageProperties(canvas.toDataURL('image/png'));
                            const w = pdf.internal.pageSize.getWidth();
                            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, (props.height * w) / props.width);
                            pdf.save(`OS_PREVIEW_${format(new Date(), 'ddMMyyyy')}.pdf`);
                          }}
                          className="p-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-all"
                          title="Gerar PDF da O.S."
                        >
                           <Printer className="w-4 h-4" />
                        </button>
                     </div>

                     {/* ── A4 Live Preview ── */}
                     <div className="mx-auto max-w-[794px] overflow-y-auto" style={{ fontFamily: 'Arial, sans-serif', color: '#111111', backgroundColor: '#FFFFFF', boxShadow: '0 4px 24px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.08)' }}>

                       {/* ══ HEADER ══ */}
                       <div style={{ backgroundColor: '#111111' }}>
                         <div style={{ height: '5px', backgroundColor: '#000000' }} />
                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '26px 48px 20px' }}>
                           <div>
                             <div style={{ fontSize: '22px', fontWeight: '900', color: '#FFFFFF', letterSpacing: '0.28em', textTransform: 'uppercase', lineHeight: 1 }}>Royal Macaé</div>
                             <div style={{ fontSize: '7.5px', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.65em', fontWeight: '600', textTransform: 'uppercase', marginTop: '5px' }}>Palace  ·  Hotel</div>
                             <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '8px' }}>
                               <div style={{ height: '1px', width: '18px', background: 'rgba(255,255,255,0.25)' }} />
                               <div style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'rgba(255,255,255,0.4)' }} />
                               <div style={{ height: '1px', width: '18px', background: 'rgba(255,255,255,0.25)' }} />
                             </div>
                           </div>
                           <div style={{ textAlign: 'right', lineHeight: '1.8' }}>
                             <div style={{ fontSize: '11px', fontWeight: '700', color: 'rgba(255,255,255,0.9)' }}>(22) 2123-9650</div>
                             <div style={{ fontSize: '8.5px', color: 'rgba(255,255,255,0.4)' }}>eventos@royalmacae.com.br</div>
                             <div style={{ fontSize: '8.5px', color: 'rgba(255,255,255,0.4)' }}>www.royalmacae.com.br</div>
                             <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.25)', marginTop: '1px' }}>Av. Atlântica, 1642 — Cavaleiros, Macaé / RJ</div>
                           </div>
                         </div>
                         <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.35)', padding: '13px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                           <div>
                             <div style={{ fontSize: '7px', fontWeight: '800', letterSpacing: '0.6em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: '3px' }}>Documento Oficial</div>
                             <div style={{ fontSize: '18px', fontWeight: '900', letterSpacing: '0.2em', color: '#FFFFFF', textTransform: 'uppercase' }}>Ordem de Serviço</div>
                           </div>
                           <div style={{ textAlign: 'right' }}>
                             <div style={{ fontSize: '7px', fontWeight: '800', letterSpacing: '0.5em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: '3px' }}>Número O.S.</div>
                             <div style={{ fontSize: '17px', fontWeight: '900', fontFamily: 'monospace', color: '#FFFFFF', letterSpacing: '0.08em' }}>— pendente —</div>
                             <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', marginTop: '2px' }}>{format(new Date(), 'dd/MM/yyyy')}</div>
                           </div>
                         </div>
                         <div style={{ height: '3px', backgroundColor: '#000000' }} />
                       </div>

                       {/* ══ EVENT NAME ══ */}
                       <div style={{ padding: '26px 48px 22px', backgroundColor: '#FFFFFF', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                         <div style={{ width: '4px', minHeight: '52px', backgroundColor: '#111111', borderRadius: '2px', flexShrink: 0, marginTop: '2px' }} />
                         <div style={{ flex: 1 }}>
                           <div style={{ fontSize: '7px', fontWeight: '900', letterSpacing: '0.48em', color: '#6B7280', textTransform: 'uppercase', marginBottom: '8px' }}>Nome do Evento</div>
                           <div style={{ fontSize: '24px', fontWeight: '900', color: '#111111', letterSpacing: '-0.01em', lineHeight: '1.12' }}>{formData.name || '—'}</div>
                         </div>
                         <div style={{ padding: '4px 12px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '999px', fontSize: '8px', fontWeight: '800', color: '#374151', letterSpacing: '0.22em', textTransform: 'uppercase', whiteSpace: 'nowrap', marginTop: '4px' }}>{formData.event_type}</div>
                       </div>

                       {/* ══ INFO GRID ══ */}
                       <div style={{ padding: '22px 48px', backgroundColor: '#F9FAFB' }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                           <div style={{ height: '1px', width: '20px', background: '#9CA3AF' }} />
                           <div style={{ fontSize: '7px', fontWeight: '900', letterSpacing: '0.45em', color: '#374151', textTransform: 'uppercase' }}>Detalhes do Evento</div>
                           <div style={{ flex: 1, height: '1px', background: '#E5E7EB' }} />
                         </div>
                         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: '#D1D5DB', borderRadius: '6px', overflow: 'hidden', border: '1px solid #D1D5DB' }}>
                           {[
                             { label: 'Contratante', value: formData.client_category || '—' },
                             { label: 'Tipo de Evento', value: formData.event_type || '—' },
                             { label: 'Local / Salão', value: formData.hall_name || '—' },
                             { label: 'Data de Início', value: formData.start_date ? format(parseISO(formData.start_date), 'dd/MM/yyyy') : '—' },
                             { label: 'Data de Término', value: formData.end_date ? format(parseISO(formData.end_date), 'dd/MM/yyyy') : '—' },
                             { label: 'Horário', value: formData.start_time && formData.end_time ? `${formData.start_time} – ${formData.end_time}` : '—' },
                             { label: 'Participantes', value: formData.attendees_count ? `${formData.attendees_count} pessoas` : '—' },
                             { label: 'Perfil do Contratante', value: formData.client_profile || '—' },
                             { label: 'Valor do Contrato', value: formData.total_value ? formData.total_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—' },
                           ].map((f, i) => (
                             <div key={i} style={{ padding: '13px 15px', backgroundColor: i % 2 === 0 ? '#F9FAFB' : '#FFFFFF' }}>
                               <div style={{ fontSize: '7px', fontWeight: '900', letterSpacing: '0.3em', color: '#6B7280', marginBottom: '4px', textTransform: 'uppercase' }}>{f.label}</div>
                               <div style={{ fontSize: '12px', fontWeight: '700', color: '#111111' }}>{f.value}</div>
                             </div>
                           ))}
                         </div>
                       </div>

                       {/* ══ SERVICES ══ */}
                       {formData.items_included && (
                         <div style={{ padding: '18px 48px 22px', backgroundColor: '#FFFFFF', borderTop: '1px solid #E5E7EB' }}>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                             <div style={{ height: '1px', width: '20px', background: '#9CA3AF' }} />
                             <div style={{ fontSize: '7px', fontWeight: '900', letterSpacing: '0.45em', color: '#374151', textTransform: 'uppercase' }}>Serviços & Itens Inclusos</div>
                             <div style={{ flex: 1, height: '1px', background: '#E5E7EB' }} />
                           </div>
                           <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                             {formData.items_included.split(',').map((item, i) => item.trim() && (
                               <span key={i} style={{ padding: '5px 13px', fontSize: '8px', fontWeight: '700', border: '1px solid #374151', color: '#374151', backgroundColor: '#F3F4F6', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{item.trim()}</span>
                             ))}
                           </div>
                         </div>
                       )}

                       {/* ══ IMPORTANT NOTES ══ */}
                       {formData.important_notes && (
                         <div style={{ padding: '18px 48px 22px', backgroundColor: '#F9FAFB', borderTop: '1px solid #E5E7EB' }}>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                             <div style={{ height: '1px', width: '20px', background: '#9CA3AF' }} />
                             <div style={{ fontSize: '7px', fontWeight: '900', letterSpacing: '0.45em', color: '#374151', textTransform: 'uppercase' }}>Observações Importantes</div>
                             <div style={{ flex: 1, height: '1px', background: '#E5E7EB' }} />
                           </div>
                           <div style={{ paddingLeft: '14px', borderLeft: '2px solid #9CA3AF', fontSize: '10px', color: '#374151', lineHeight: '1.85', whiteSpace: 'pre-line' }}>{formData.important_notes}</div>
                         </div>
                       )}

                       {/* ══ STAFF ROADMAP ══ */}
                       <div style={{ padding: '18px 48px 22px', backgroundColor: '#FFFFFF', borderTop: '1px solid #E5E7EB' }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                           <div style={{ height: '1px', width: '20px', background: '#9CA3AF' }} />
                           <div style={{ fontSize: '7px', fontWeight: '900', letterSpacing: '0.45em', color: '#374151', textTransform: 'uppercase' }}>Passo a Passo — Equipe</div>
                           <div style={{ flex: 1, height: '1px', background: '#E5E7EB' }} />
                         </div>
                         <div style={{ paddingLeft: '14px', borderLeft: '2px solid #D1D5DB', fontSize: '10px', color: '#374151', lineHeight: '1.9', whiteSpace: 'pre-line' }}>{formData.staff_roadmap || 'Nenhum cronograma definido.'}</div>
                       </div>

                       {/* ══ SIGNATURE ══ */}
                       <div style={{ padding: '28px 48px 24px', backgroundColor: '#F9FAFB', borderTop: '1px solid #E5E7EB' }}>
                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px' }}>
                           {['Responsável pelo Evento', 'Contratante'].map((label) => (
                             <div key={label}>
                               <div style={{ height: '46px', borderBottom: '1px solid #111111', marginBottom: '10px', position: 'relative' }}>
                                 <div style={{ position: 'absolute', bottom: '-3px', left: 0, width: '5px', height: '5px', borderRadius: '50%', background: '#111111' }} />
                                 <div style={{ position: 'absolute', bottom: '-3px', right: 0, width: '5px', height: '5px', borderRadius: '50%', background: '#111111' }} />
                               </div>
                               <div style={{ fontSize: '8px', fontWeight: '800', letterSpacing: '0.24em', color: '#6B7280', textTransform: 'uppercase', marginBottom: '4px' }}>{label}</div>
                               <div style={{ fontSize: '8px', color: '#9CA3AF' }}>Data: ____/____/________</div>
                             </div>
                           ))}
                         </div>
                       </div>

                       {/* ══ FOOTER ══ */}
                       <div style={{ backgroundColor: '#111111', padding: '13px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
                         <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', backgroundColor: '#000000' }} />
                         <div style={{ fontSize: '8px', fontWeight: '900', letterSpacing: '0.52em', color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase' }}>Royal Macaé Palace</div>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                           <div style={{ height: '1px', width: '16px', background: 'rgba(255,255,255,0.25)' }} />
                           <span style={{ fontSize: '8px', fontWeight: '400', color: 'rgba(255,255,255,0.35)', fontStyle: 'italic', letterSpacing: '0.18em' }}>Excelência em cada detalhe</span>
                           <div style={{ height: '1px', width: '16px', background: 'rgba(255,255,255,0.25)' }} />
                         </div>
                       </div>

                     </div>
                     {/* end A4 preview */}

                     <p className="text-[10px] text-neutral-400 font-bold mt-6 italic">Ao salvar, o valor de {formData.total_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} será provisionado no faturamento para a data de início do evento.</p>
                  </div>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Event Details Modal */}
      <AnimatePresence>
         {viewingEvent && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm">
               <motion.div
                 initial={{ opacity: 0, scale: 0.9 }}
                 animate={{ opacity: 1, scale: 1 }}
                 exit={{ opacity: 0, scale: 0.9 }}
                 className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden overflow-y-auto max-h-[90vh]"
               >
                  <div className="p-8 bg-neutral-900 text-white relative">
                     <button
                       onClick={() => setViewingEvent(null)}
                       className="absolute top-6 right-6 p-2 hover:bg-white/10 rounded-xl transition-all"
                     >
                        <X className="w-6 h-6" />
                     </button>
                     <div className="flex items-center gap-3 mb-2">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                          viewingEvent.status === 'confirmed'  ? 'bg-green-500/20 text-green-400'
                          : viewingEvent.status === 'cancelled' ? 'bg-red-500/20 text-red-400'
                          : 'bg-amber-500/20 text-amber-400'
                        }`}>
                           {viewingEvent.status === 'confirmed' ? 'Confirmado' : viewingEvent.status === 'cancelled' ? 'Cancelado' : 'Planejado'}
                        </span>
                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{viewingEvent.os_number}</span>
                     </div>
                     <h2 className="text-3xl font-black tracking-tight">{viewingEvent.name}</h2>
                     <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mt-1">Projeto do Evento • Detalhes da O.S.</p>
                     <div className="flex flex-wrap items-center gap-6 mt-6">
                        <div className="flex items-center gap-2">
                           <CalendarIcon className="w-4 h-4 text-white/40" />
                           <span className="text-xs font-bold">{format(parseISO(viewingEvent.start_date), 'dd MMMM yyyy', { locale: ptBR })}</span>
                        </div>
                        <div className="flex items-center gap-2">
                           <Clock className="w-4 h-4 text-white/40" />
                           <span className="text-xs font-bold">{viewingEvent.start_time} - {viewingEvent.end_time}</span>
                        </div>
                        <div className="flex items-center gap-2">
                           <MapPin className="w-4 h-4 text-white/40" />
                           <span className="text-xs font-bold">{viewingEvent.hall_name}</span>
                        </div>
                     </div>
                  </div>

                  <div className="p-8 space-y-8 bg-neutral-50/50">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                           <div className="bg-white p-6 rounded-3xl border border-neutral-200">
                              <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-4">Informações do Projeto</h4>
                              <div className="space-y-3">
                                 <div className="flex justify-between border-b border-neutral-50 pb-2">
                                    <span className="text-[10px] font-bold text-neutral-400 uppercase">Contratante</span>
                                    <span className="text-xs font-black text-neutral-900">{viewingEvent.client_category || '---'}</span>
                                 </div>
                                 <div className="flex justify-between border-b border-neutral-50 pb-2">
                                    <span className="text-[10px] font-bold text-neutral-400 uppercase">Perfil</span>
                                    <span className="text-xs font-black text-neutral-900">{viewingEvent.client_profile || '---'}</span>
                                 </div>
                                 <div className="flex justify-between border-b border-neutral-50 pb-2">
                                    <span className="text-[10px] font-bold text-neutral-400 uppercase">Participantes</span>
                                    <span className="text-xs font-black text-neutral-900">{viewingEvent.attendees_count} pessoas</span>
                                 </div>
                                 <div className="flex justify-between border-b border-neutral-50 pb-2">
                                    <span className="text-[10px] font-bold text-neutral-400 uppercase">Valor do Contrato</span>
                                    <span className="text-xs font-black text-primary font-mono">{viewingEvent.total_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                 </div>
                                 <div className="flex justify-between">
                                    <span className="text-[10px] font-bold text-neutral-400 uppercase">Check Info</span>
                                    <span className="text-xs font-black text-neutral-900 italic">{viewingEvent.check_info || '---'}</span>
                                 </div>
                              </div>
                           </div>

                           <div className="bg-white p-6 rounded-3xl border border-neutral-200">
                              <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-4">Serviços Inclusos</h4>
                              <div className="flex flex-wrap gap-2">
                                 {viewingEvent.items_included?.split(',').map((item, i) => (
                                    <div key={i} className="px-3 py-1.5 bg-neutral-50 rounded-xl text-[9px] font-black text-neutral-600 uppercase tracking-tighter border border-neutral-100">
                                       {item.trim()}
                                    </div>
                                 ))}
                              </div>
                           </div>

                           {viewingEvent.important_notes && (
                              <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100">
                                 <h4 className="text-[10px] font-black uppercase text-amber-600 tracking-widest mb-3">Observações Importantes</h4>
                                 <p className="text-xs font-bold text-amber-900/70 whitespace-pre-line leading-relaxed italic">
                                    {viewingEvent.important_notes}
                                 </p>
                              </div>
                           )}
                        </div>

                        <div>
                           <div className="bg-white p-6 rounded-3xl border border-neutral-200 h-full">
                              <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-4">Passo-a-passo (Equipe)</h4>
                              <div className="text-xs font-medium text-neutral-800 whitespace-pre-line leading-relaxed max-h-[400px] overflow-y-auto custom-scrollbar">
                                 {viewingEvent.staff_roadmap || 'Nenhum cronograma registrado.'}
                              </div>
                           </div>
                        </div>
                     </div>

                     {viewingEvent.status === 'cancelled' && viewingEvent.cancel_reason && (
                       <div className="p-4 bg-red-50 border border-red-100 rounded-2xl">
                         <p className="text-[10px] font-black uppercase text-red-500 tracking-widest mb-1">Motivo do Cancelamento</p>
                         <p className="text-xs font-bold text-red-800">{viewingEvent.cancel_reason}</p>
                         {viewingEvent.cancelled_at && (
                           <p className="text-[10px] text-red-400 mt-1">
                             {new Date(viewingEvent.cancelled_at).toLocaleString('pt-BR')}
                           </p>
                         )}
                       </div>
                     )}

                     <div className="pt-8 border-t border-neutral-100 flex items-center justify-between no-print">
                        <div className="flex gap-2">
                           {viewingEvent.status !== 'cancelled' && (
                             <button
                               onClick={() => handleEdit(viewingEvent)}
                               className="flex items-center gap-2 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 rounded-xl text-xs font-bold transition-all"
                             >
                               <Edit2 className="w-3 h-3" />
                               Editar Evento
                             </button>
                           )}
                           {viewingEvent.status !== 'cancelled' && (profile.role === 'admin' || profile.permissions?.canCancelEvents) && (
                             <button
                               onClick={() => handleCancel(viewingEvent)}
                               className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold transition-all"
                             >
                               <X className="w-3 h-3" />
                               Cancelar Evento
                             </button>
                           )}
                           <button
                             onClick={() => handleDownloadContract(viewingEvent)}
                             className="flex items-center gap-2 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 rounded-xl text-xs font-bold transition-all"
                           >
                              <Printer className="w-3 h-3" />
                              Imprimir O.S.
                           </button>
                        </div>
                        <button
                           onClick={() => handleDownloadContract(viewingEvent)}
                           className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-xl text-xs font-bold hover:bg-neutral-800 transition-all"
                         >
                           <Download className="w-3 h-3" />
                           Baixar O.S. em PDF
                        </button>
                     </div>
                  </div>
               </motion.div>
            </div>
         )}
      </AnimatePresence>

      {/* Hidden PDF Template - rendered off-screen for html2canvas */}
      {(viewingEvent || (activeTab === 'register' && formData.name)) && (() => {
        const d = viewingEvent || formData as any;
        const infoRows = [
          ['Contratante', d.client_category || '—'],
          ['Tipo de Evento', d.event_type || '—'],
          ['Local / Salão', d.hall_name || '—'],
          ['Data de Início', d.start_date ? format(parseISO(d.start_date), 'dd/MM/yyyy') : '—'],
          ['Data de Término', d.end_date ? format(parseISO(d.end_date), 'dd/MM/yyyy') : '—'],
          ['Horário', (d.start_time && d.end_time) ? `${d.start_time} – ${d.end_time}` : '—'],
          ['Participantes', d.attendees_count ? `${d.attendees_count} pessoas` : '—'],
          ['Perfil do Contratante', d.client_profile || '—'],
          ['Valor do Contrato', d.total_value ? Number(d.total_value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'],
        ];
        return (
          <div className="fixed -left-[9999px] top-0 overflow-hidden pointer-events-none">
            <div id="contract-pdf-template" style={{ backgroundColor: '#FAFAF7', color: '#111827', fontFamily: 'Arial, sans-serif', width: '794px', minHeight: '1123px' }}>

              {/* ══ HEADER ══ */}
              <div style={{ background: '#111111', position: 'relative' }}>
                {/* Top line */}
                <div style={{ height: '4px', background: '#000000' }} />
                {/* Letterhead */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '26px 48px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
                    <div>
                      <div style={{ fontSize: '20px', fontWeight: '900', color: '#FFFFFF', letterSpacing: '0.28em', textTransform: 'uppercase', lineHeight: 1, margin: 0 }}>Royal Macaé</div>
                      <div style={{ fontSize: '7.5px', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.65em', fontWeight: '700', textTransform: 'uppercase', marginTop: '5px' }}>Palace  ·  Hotel</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '9px' }}>
                        <div style={{ height: '1px', width: '18px', background: 'rgba(255,255,255,0.3)' }} />
                        <div style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'rgba(255,255,255,0.4)' }} />
                        <div style={{ height: '1px', width: '18px', background: 'rgba(255,255,255,0.3)' }} />
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', lineHeight: '1.8' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: 'rgba(255,255,255,0.9)', margin: 0 }}>(22) 2123-9650</div>
                    <div style={{ fontSize: '8.5px', color: 'rgba(255,255,255,0.45)', margin: 0 }}>eventos@royalmacae.com.br</div>
                    <div style={{ fontSize: '8.5px', color: 'rgba(255,255,255,0.45)', margin: 0 }}>www.royalmacae.com.br</div>
                    <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.3)', margin: 0 }}>Av. Atlântica, 1642 — Cavaleiros, Macaé / RJ</div>
                  </div>
                </div>
                {/* OS Title band */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.35)', padding: '13px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '7px', fontWeight: '800', letterSpacing: '0.6em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: '4px' }}>Documento Oficial</div>
                    <div style={{ fontSize: '17px', fontWeight: '900', letterSpacing: '0.2em', color: '#ffffff', textTransform: 'uppercase', margin: 0 }}>Ordem de Serviço</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '7px', fontWeight: '800', letterSpacing: '0.5em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: '4px' }}>Número O.S.</div>
                    <div style={{ fontSize: '17px', fontWeight: '900', fontFamily: 'monospace', color: '#FFFFFF', letterSpacing: '0.08em', margin: 0 }}>{d.os_number || '—'}</div>
                    <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', marginTop: '3px' }}>{format(new Date(), 'dd/MM/yyyy')}</div>
                  </div>
                </div>
                {/* Bottom line */}
                <div style={{ height: '3px', background: '#000000' }} />
              </div>

              {/* ══ EVENT NAME ══ */}
              <div style={{ padding: '28px 48px 22px', backgroundColor: '#ffffff', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'flex-start', gap: '18px' }}>
                <div style={{ width: '4px', minHeight: '52px', background: '#111111', borderRadius: '2px', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '8px', fontWeight: '900', letterSpacing: '0.48em', color: '#6B7280', textTransform: 'uppercase', marginBottom: '9px' }}>Nome do Evento</div>
                  <div style={{ fontSize: '25px', fontWeight: '900', color: '#111111', letterSpacing: '-0.01em', lineHeight: '1.12', margin: 0 }}>{d.name || '—'}</div>
                </div>
                <div style={{ padding: '5px 13px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '999px', fontSize: '8px', fontWeight: '800', color: '#374151', letterSpacing: '0.22em', textTransform: 'uppercase', whiteSpace: 'nowrap', marginTop: '4px' }}>{d.event_type || '—'}</div>
              </div>

              {/* ══ INFO GRID ══ */}
              <div style={{ padding: '22px 48px', backgroundColor: '#F9FAFB' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                  <div style={{ height: '1px', width: '20px', background: '#9CA3AF' }} />
                  <div style={{ fontSize: '7px', fontWeight: '900', letterSpacing: '0.45em', color: '#374151', textTransform: 'uppercase', margin: 0 }}>Detalhes do Evento</div>
                  <div style={{ flex: 1, height: '1px', background: '#E5E7EB' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: '#D1D5DB', borderRadius: '8px', overflow: 'hidden', border: '1px solid #D1D5DB' }}>
                  {infoRows.map(([label, value], i) => (
                    <div key={i} style={{ padding: '14px 16px', backgroundColor: i % 2 === 0 ? '#F9FAFB' : '#ffffff' }}>
                      <div style={{ fontSize: '7px', fontWeight: '900', letterSpacing: '0.3em', color: '#6B7280', marginBottom: '5px', textTransform: 'uppercase' }}>{label}</div>
                      <div style={{ fontSize: '12px', fontWeight: '700', color: '#111111', margin: 0 }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ══ SERVICES ══ */}
              {d.items_included && (
                <div style={{ padding: '20px 48px 22px', backgroundColor: '#ffffff', borderTop: '1px solid #E5E7EB' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ height: '1px', width: '20px', background: '#9CA3AF' }} />
                    <div style={{ fontSize: '7px', fontWeight: '900', letterSpacing: '0.45em', color: '#374151', textTransform: 'uppercase', margin: 0 }}>Serviços & Itens Inclusos</div>
                    <div style={{ flex: 1, height: '1px', background: '#E5E7EB' }} />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {d.items_included.split(',').map((item: string, i: number) => item.trim() && (
                      <span key={i} style={{ padding: '5px 14px', fontSize: '8px', fontWeight: '800', border: '1px solid #374151', color: '#374151', backgroundColor: '#F3F4F6', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{item.trim()}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* ══ IMPORTANT NOTES ══ */}
              {d.important_notes && (
                <div style={{ padding: '20px 48px 22px', backgroundColor: '#F9FAFB', borderTop: '1px solid #E5E7EB' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ height: '1px', width: '20px', background: '#9CA3AF' }} />
                    <div style={{ fontSize: '7px', fontWeight: '900', letterSpacing: '0.45em', color: '#374151', textTransform: 'uppercase', margin: 0 }}>Observações Importantes</div>
                    <div style={{ flex: 1, height: '1px', background: '#E5E7EB' }} />
                  </div>
                  <div style={{ paddingLeft: '14px', borderLeft: '2px solid #9CA3AF', fontSize: '10px', color: '#374151', lineHeight: '1.85', whiteSpace: 'pre-line' }}>{d.important_notes}</div>
                </div>
              )}

              {/* ══ STAFF ROADMAP ══ */}
              <div style={{ padding: '20px 48px 22px', backgroundColor: '#ffffff', borderTop: '1px solid #E5E7EB' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                  <div style={{ height: '1px', width: '20px', background: '#9CA3AF' }} />
                  <div style={{ fontSize: '7px', fontWeight: '900', letterSpacing: '0.45em', color: '#374151', textTransform: 'uppercase', margin: 0 }}>Passo a Passo — Equipe</div>
                  <div style={{ flex: 1, height: '1px', background: '#E5E7EB' }} />
                </div>
                <div style={{ paddingLeft: '14px', borderLeft: '2px solid #D1D5DB', fontSize: '10px', color: '#374151', lineHeight: '1.9', whiteSpace: 'pre-line' }}>{d.staff_roadmap || 'Nenhum cronograma definido.'}</div>
              </div>

              {/* ══ SIGNATURE ══ */}
              <div style={{ padding: '30px 48px 26px', backgroundColor: '#F9FAFB', borderTop: '1px solid #E5E7EB' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px' }}>
                  {['Responsável pelo Evento', 'Contratante'].map((label) => (
                    <div key={label}>
                      <div style={{ height: '48px', borderBottom: '1px solid #374151', marginBottom: '10px', position: 'relative' }}>
                        <div style={{ position: 'absolute', bottom: '-3px', left: 0, width: '5px', height: '5px', borderRadius: '50%', background: '#374151' }} />
                        <div style={{ position: 'absolute', bottom: '-3px', right: 0, width: '5px', height: '5px', borderRadius: '50%', background: '#374151' }} />
                      </div>
                      <div style={{ fontSize: '8px', fontWeight: '800', letterSpacing: '0.24em', color: '#6B7280', textTransform: 'uppercase', marginBottom: '4px' }}>{label}</div>
                      <div style={{ fontSize: '8px', color: '#9CA3AF', margin: 0 }}>Data: ____/____/________</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ══ FOOTER ══ */}
              <div style={{ background: '#111111', padding: '14px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: '#000000' }} />
                <div style={{ fontSize: '8px', fontWeight: '900', letterSpacing: '0.52em', color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', margin: 0 }}>Royal Macaé Palace</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                  <div style={{ height: '1px', width: '16px', background: 'rgba(255,255,255,0.3)' }} />
                  <span style={{ fontSize: '8px', fontWeight: '400', color: 'rgba(255,255,255,0.45)', fontStyle: 'italic', letterSpacing: '0.18em' }}>Excelência em cada detalhe</span>
                  <div style={{ height: '1px', width: '16px', background: 'rgba(255,255,255,0.3)' }} />
                </div>
              </div>

            </div>
          </div>
        );
      })()}

      {/* Cancel Event Modal */}
      {cancelModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-neutral-100">
              <h3 className="text-base font-bold text-neutral-900">Cancelar Evento</h3>
              <p className="text-sm text-neutral-500 mt-1">{cancelModal.event.name}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-neutral-500 uppercase block mb-1">Motivo do Cancelamento</label>
                <textarea
                  autoFocus
                  rows={3}
                  value={cancelModal.reason}
                  onChange={(e) => setCancelModal({ ...cancelModal, reason: e.target.value })}
                  placeholder="Informe o motivo..."
                  className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setCancelModal(null)}
                  className="flex-1 px-4 py-2 text-sm font-bold text-neutral-600 hover:bg-neutral-100 rounded-xl transition-all"
                >
                  Voltar
                </button>
                <button
                  onClick={confirmCancel}
                  disabled={!cancelModal.reason.trim()}
                  className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 transition-all disabled:opacity-40"
                >
                  Confirmar Cancelamento
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
