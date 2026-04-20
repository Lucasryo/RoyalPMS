import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { FiscalFile, UserProfile } from '../types';
import { 
  Search, Filter, Clock, AlertTriangle, CheckCircle2, 
  ArrowRight, MessageSquare, History, User, Building2,
  ChevronRight, ArrowUpRight, Plus, FilePlus, X as CloseIcon, Loader2, Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { Company } from '../types';

interface InvoiceTrackerProps {
  profile: UserProfile;
}

const STAGES = [
  { id: 'reception', label: 'Recepção', color: 'blue' },
  { id: 'reservations', label: 'Reservas', color: 'purple' },
  { id: 'finance', label: 'Financeiro / Faturamento', color: 'amber' },
  { id: 'completed', label: 'Concluído', color: 'green' }
];

const FILE_TYPES = ['NF', 'DANFE', 'FATURA', 'RECIBO', 'OUTROS'];

export default function InvoiceTracker({ profile }: InvoiceTrackerProps) {
  const [invoices, setInvoices] = useState<FiscalFile[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newInvoiceData, setNewInvoiceData] = useState({
    companyId: '',
    type: 'NF',
    notes: '',
    nh: '',
    sector: 'reception',
    file: null as File | null
  });

  useEffect(() => {
    fetchInvoices();
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase.from('companies').select('*').order('name');
      if (error) throw error;
      if (data) setCompanies(data);
    } catch (error) {
      console.error('Error fetching companies:', error);
    }
  };

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('files')
        .select('*')
        .not('tracking_stage', 'is', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      if (data) {
        setInvoices(data.map((f: any) => ({
          ...f,
          originalName: f.original_name,
          companyId: f.company_id,
          uploadDate: f.created_at,
          upload_date: f.created_at // Ensure both are present for compatibility
        } as FiscalFile)));
      }
    } catch (error) {
      console.error('Error fetching invoices for tracking:', error);
      toast.error('Erro ao carregar notas para rastreio');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTracking = async (id: string, stage: string, status: string, notes: string) => {
    setUpdatingId(id);
    try {
      const updateData = {
        tracking_stage: stage,
        tracking_status: status,
        tracking_notes: notes,
        tracking_updated_at: new Date().toISOString(),
        tracking_updated_by: profile.name
      };

      const { error } = await supabase
        .from('files')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, ...updateData } : inv));
      toast.success('Status de rastreio atualizado!');
    } catch (error) {
      console.error('Error updating tracking:', error);
      toast.error('Erro ao atualizar rastreio');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCreateInvoice = async () => {
    if (!newInvoiceData.nh) {
      toast.error('Preencha o número da NH');
      return;
    }

    setIsCreating(true);
    try {
      let filePath = '';
      let originalName = `NH ${newInvoiceData.nh}`;

      if (newInvoiceData.file) {
        const fileExt = newInvoiceData.file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        filePath = `${newInvoiceData.companyId}/${fileName}`;
        originalName = newInvoiceData.file.name;

        const { error: uploadError } = await supabase.storage
          .from('files')
          .upload(filePath, newInvoiceData.file);

        if (uploadError) throw uploadError;
      }

      const { data, error } = await supabase
        .from('files')
        .insert([{
          company_id: newInvoiceData.companyId || null,
          type: newInvoiceData.type,
          original_name: originalName,
          storage_path: filePath,
          nh: newInvoiceData.nh,
          uploader_id: profile.id,
          tracking_stage: newInvoiceData.sector,
          tracking_status: 'pending',
          tracking_notes: newInvoiceData.notes,
          tracking_updated_at: new Date().toISOString(),
          tracking_updated_by: profile.name,
          period: new Date().toISOString().slice(0, 7),
          upload_date: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;

      if (data) {
        const newInvoice = {
          ...data,
          originalName: data.original_name,
          companyId: data.company_id,
          uploadDate: data.created_at,
          upload_date: data.created_at
        } as FiscalFile;
        setInvoices(prev => [newInvoice, ...prev]);
      }

      toast.success('Nota adicionada ao fluxo de rastreio!');
      setIsAddModalOpen(false);
      setNewInvoiceData({ companyId: '', type: 'NF', notes: '', nh: '', sector: 'reception', file: null });
    } catch (error: any) {
      console.error('Error creating tracked invoice:', error);
      toast.error('Erro ao adicionar nota: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setIsCreating(false);
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = 
      inv.original_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.nh?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStage = selectedStage === 'all' || inv.tracking_stage === selectedStage;
    const matchesStatus = selectedStatus === 'all' || inv.tracking_status === selectedStatus;
    // Only track specific types if needed, or all files? 
    // User said "notas", usually NF, FATURA, etc.
    return matchesSearch && matchesStage && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-neutral-900 flex items-center gap-2 italic">
            RASTREIO<span className="text-primary not-italic">DE NOTAS</span>
          </h2>
          <p className="text-xs text-neutral-500 font-bold uppercase tracking-widest mt-1">
            Gestão de fluxo e liberação de documentos
          </p>
        </div>

        <div className="flex bg-neutral-100 p-1 rounded-xl shadow-inner">
          {['all', 'pending', 'blocked', 'ok'].map(status => (
            <button
              key={status}
              onClick={() => setSelectedStatus(status)}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                selectedStatus === status 
                  ? 'bg-white text-neutral-900 shadow-sm' 
                  : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              {status === 'all' ? 'Todos' : status === 'pending' ? 'Pendentes' : status === 'blocked' ? 'Travadas' : 'Liberadas'}
            </button>
          ))}
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="bg-primary text-neutral-900 px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-primary/20 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Adicionar Nota
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Buscar por nome da nota ou empresa..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-neutral-200 rounded-2xl text-sm focus:ring-2 focus:ring-primary/10 outline-none transition-all shadow-sm"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <select
            value={selectedStage}
            onChange={(e) => setSelectedStage(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-neutral-200 rounded-2xl text-sm appearance-none focus:ring-2 focus:ring-primary/10 outline-none transition-all shadow-sm"
          >
            <option value="all">Todas as Etapas</option>
            {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-4">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
            <History className="w-8 h-8 text-primary" />
          </motion.div>
          <p className="text-xs font-black uppercase tracking-widest text-neutral-400">Sincronizando fluxo...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredInvoices.map((inv) => (
              <motion.div
                key={inv.id}
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all group"
              >
                <div className="p-5 flex flex-col lg:flex-row items-start lg:items-center gap-6">
                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="p-2 bg-neutral-50 rounded-lg group-hover:bg-primary/5 transition-colors">
                        <Building2 className="w-4 h-4 text-neutral-400 group-hover:text-primary transition-colors" />
                      </div>
                      <h3 className="text-sm font-bold text-neutral-900 truncate">
                        {inv.original_name} {inv.nh && <span className="text-primary ml-2 uppercase opacity-50 font-black">NH: {inv.nh}</span>}
                      </h3>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] font-bold text-neutral-400 uppercase tracking-tight ml-10">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {inv.upload_date ? new Date(inv.upload_date).toLocaleDateString() : 'Data N/D'}</span>
                      <span className="flex items-center gap-1"><User className="w-3 h-3" /> {inv.type}</span>
                    </div>
                  </div>

                  {/* Tracking Visualizer */}
                  <div className="flex items-center gap-1 w-full lg:w-auto overflow-x-auto no-scrollbar py-2">
                    {STAGES.map((s, idx) => {
                      const isActive = inv.tracking_stage === s.id;
                      const isPast = STAGES.findIndex(x => x.id === inv.tracking_stage) > idx;
                      const isNext = STAGES.findIndex(x => x.id === inv.tracking_stage) === idx - 1;
                      
                      return (
                        <React.Fragment key={s.id}>
                          <div className={`flex flex-col items-center shrink-0 ${isActive ? 'opacity-100' : 'opacity-40'}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                              isActive ? 'bg-primary border-primary text-white scale-110 shadow-lg shadow-primary/20' : 
                              isPast ? 'bg-green-500 border-green-500 text-white' : 'bg-neutral-50 border-neutral-200 text-neutral-400'
                            }`}>
                              {isPast ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                            </div>
                            <span className="text-[9px] font-black uppercase mt-1 text-center max-w-[60px] leading-tight">
                              {s.label.split(' ')[0]}
                            </span>
                          </div>
                          {idx < STAGES.length - 1 && (
                            <div className={`h-[1px] w-8 lg:w-12 mx-1 shrink-0 ${isPast ? 'bg-green-500' : 'bg-neutral-200'}`} />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3 w-full lg:w-auto shrink-0 border-t lg:border-t-0 pt-4 lg:pt-0">
                    <div className="flex-1 lg:flex-none">
                      <select
                        value={inv.tracking_status || 'pending'}
                        onChange={(e) => handleUpdateTracking(inv.id, inv.tracking_stage || 'reception', e.target.value, inv.tracking_notes || '')}
                        className={`w-full lg:w-32 px-3 py-2 rounded-xl text-xs font-bold border outline-none transition-all ${
                          inv.tracking_status === 'ok' ? 'bg-green-50 border-green-200 text-green-700' :
                          inv.tracking_status === 'blocked' ? 'bg-red-50 border-red-200 text-red-700' :
                          'bg-neutral-50 border-neutral-200 text-neutral-600'
                        }`}
                      >
                        <option value="pending">Pendente</option>
                        <option value="ok">Liberado</option>
                        <option value="blocked">Travado</option>
                      </select>
                    </div>

                    <button
                      disabled={updatingId === inv.id || inv.tracking_stage === 'completed'}
                      onClick={() => {
                        const currentIdx = STAGES.findIndex(s => s.id === (inv.tracking_stage || 'reception'));
                        const nextStage = STAGES[currentIdx + 1]?.id;
                        if (nextStage) {
                          handleUpdateTracking(inv.id, nextStage, 'pending', inv.tracking_notes || '');
                        }
                      }}
                      className="flex items-center gap-2 bg-neutral-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-neutral-800 transition-all disabled:opacity-30 disabled:grayscale"
                    >
                      Avançar <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Footer Notes/Help */}
                <div className="bg-neutral-50/50 p-3 border-t border-neutral-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                  <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="flex items-center gap-2 text-[10px] text-neutral-500 font-bold uppercase">
                      <MessageSquare className="w-3 h-3" />
                      <input 
                        type="text"
                        placeholder="Adicionar observação..."
                        defaultValue={inv.tracking_notes || ''}
                        onBlur={(e) => handleUpdateTracking(inv.id, inv.tracking_stage || 'reception', inv.tracking_status || 'pending', e.target.value)}
                        className="bg-transparent border-none focus:ring-0 outline-none w-full md:w-64 placeholder:opacity-50"
                      />
                    </div>
                  </div>
                  
                  {inv.tracking_updated_at && (
                    <div className="flex items-center gap-2 text-[9px] text-neutral-400 font-bold uppercase italic">
                      <History className="w-3 h-3" />
                      Última atualização por {inv.tracking_updated_by} em {new Date(inv.tracking_updated_at).toLocaleString()}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {filteredInvoices.length === 0 && (
            <div className="py-20 text-center bg-white border-2 border-dashed border-neutral-100 rounded-3xl">
              <div className="p-4 bg-neutral-50 rounded-full inline-block mb-4">
                <Search className="w-10 h-10 text-neutral-200" />
              </div>
              <p className="text-sm font-bold text-neutral-400 uppercase tracking-widest">Nenhuma nota encontrada no fluxo</p>
            </div>
          )}
        </div>
      )}

      {/* Add Invoice Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-neutral-200"
            >
              <div className="p-6 border-b border-neutral-100 flex justify-between items-center bg-white">
                <div>
                  <h3 className="text-xl font-black text-neutral-900 italic">ADICIONAR <span className="text-primary not-italic">NOTA AO FLUXO</span></h3>
                  <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest leading-none mt-1">Início do Rastreio • Multi-Setor</p>
                </div>
                <button 
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-2 hover:bg-neutral-100 rounded-xl transition-all"
                >
                  <CloseIcon className="w-5 h-5 text-neutral-400" />
                </button>
              </div>

              <div className="p-8 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">NH (Nº Hospedagem)</label>
                    <input
                      type="text"
                      placeholder="Nº da NH..."
                      value={newInvoiceData.nh}
                      onChange={(e) => setNewInvoiceData(prev => ({ ...prev, nh: e.target.value }))}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm focus:ring-2 focus:ring-primary/10 outline-none transition-all shadow-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Empresa Destinatária</label>
                    <select
                      value={newInvoiceData.companyId}
                      onChange={(e) => setNewInvoiceData(prev => ({ ...prev, companyId: e.target.value }))}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm focus:ring-2 focus:ring-primary/10 outline-none transition-all shadow-sm"
                    >
                      <option value="">Selecione...</option>
                      {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Tipo Documento</label>
                    <select
                      value={newInvoiceData.type}
                      onChange={(e) => setNewInvoiceData(prev => ({ ...prev, type: e.target.value }))}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm focus:ring-2 focus:ring-primary/10 outline-none transition-all shadow-sm"
                    >
                      {FILE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Início no Setor</label>
                    <select
                      value={newInvoiceData.sector}
                      onChange={(e) => setNewInvoiceData(prev => ({ ...prev, sector: e.target.value }))}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm focus:ring-2 focus:ring-primary/10 outline-none transition-all shadow-sm"
                    >
                      {STAGES.filter(s => s.id !== 'completed').map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Arquivo (Opcional)</label>
                  <div className="relative">
                    <input
                      type="file"
                      onChange={(e) => setNewInvoiceData(prev => ({ ...prev, file: e.target.files?.[0] || null }))}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-2xl text-xs font-bold text-neutral-500 flex items-center gap-2 truncate">
                      <Upload className="w-4 h-4 shrink-0" />
                      {newInvoiceData.file ? newInvoiceData.file.name : 'Clique para anexar comprovante'}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Motivo do Rastreio (Observação)</label>
                  <textarea
                    rows={2}
                    placeholder="Descreva o motivo ou problema..."
                    value={newInvoiceData.notes}
                    onChange={(e) => setNewInvoiceData(prev => ({ ...prev, notes: e.target.value }))}
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm focus:ring-2 focus:ring-primary/10 outline-none transition-all shadow-sm resize-none"
                  />
                </div>

                <button
                  onClick={handleCreateInvoice}
                  disabled={isCreating || !newInvoiceData.nh}
                  className="w-full py-4 bg-neutral-900 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-neutral-800 transition-all shadow-xl shadow-neutral-900/20 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <FilePlus className="w-4 h-4" /> 
                      Iniciar Fluxo de Rastreio
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
