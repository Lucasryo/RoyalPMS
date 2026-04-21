import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { UserProfile, Reservation, Company, ReservationRequest } from '../types';
import { Plus, Search, Calendar, ChevronLeft, ChevronRight, User, Hash, Clock, CheckCircle, XCircle, MoreVertical, Filter, Loader2, X as CloseIcon, Check, X, LogOut, FileText, Printer, Phone, Building2, Users } from 'lucide-react';
import ReservationVoucher from './ReservationVoucher';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { format, addDays, startOfToday, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { logAudit, sendNotification } from '../lib/audit';

const slugifySegment = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

const buildAutoInvoiceHtml = ({
  companyName,
  companyCnpj,
  guestName,
  reservationCode,
  checkIn,
  checkOut,
  amount,
  dueDate
}: {
  companyName: string;
  companyCnpj?: string;
  guestName: string;
  reservationCode: string;
  checkIn: string;
  checkOut: string;
  amount: number;
  dueDate: string;
}) => `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Fatura ${reservationCode}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111827; margin: 32px; }
    .card { border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px; margin-bottom: 24px; }
    .muted { color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
    .value { font-size: 28px; font-weight: 700; color: #b45309; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    td, th { border: 1px solid #e5e7eb; padding: 12px; text-align: left; }
    th { background: #f9fafb; }
  </style>
</head>
<body>
  <div class="card">
    <div class="muted">Fatura Automatica de Checkout</div>
    <h1>Reserva ${reservationCode}</h1>
    <p>Empresa: <strong>${companyName}</strong></p>
    <p>CNPJ: <strong>${companyCnpj || 'Nao informado'}</strong></p>
    <p>Hospede principal: <strong>${guestName}</strong></p>
  </div>

  <div class="card">
    <div class="muted">Resumo</div>
    <div class="value">${amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
    <table>
      <tbody>
        <tr>
          <th>Check-in</th>
          <td>${new Date(checkIn + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
        </tr>
        <tr>
          <th>Check-out</th>
          <td>${new Date(checkOut + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
        </tr>
        <tr>
          <th>Vencimento</th>
          <td>${new Date(dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <p class="muted">Documento gerado automaticamente pelo sistema no checkout.</p>
</body>
</html>`;

export default function ReservationsDashboard({ profile }: { profile: UserProfile }) {
  const [activeSubTab, setActiveSubTab] = useState<'map' | 'requests'>('requests');
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reservationRequests, setReservationRequests] = useState<ReservationRequest[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(startOfToday());
  const [searchTerm, setSearchTerm] = useState('');
  const [voucherReservation, setVoucherReservation] = useState<Reservation | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    guest_name: '',
    contact_phone: '',
    room_number: '',
    check_in: format(new Date(), 'yyyy-MM-dd'),
    check_out: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
    status: 'CONFIRMED' as Reservation['status'],
    company_id: '',
    total_amount: 0,
    reservation_code: '',
    cost_center: '',
    tariff: 0,
    category: 'executivo',
    guests_per_uh: 1,
    iss_tax: 5,
    service_tax: 10,
    payment_method: 'BILLED' as 'BILLED' | 'VIRTUAL_CARD'
  });

  useEffect(() => {
    fetchData();
    const resChannel = supabase.channel('reservations-sync').on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, fetchData).subscribe();
    const reqChannel = supabase.channel('requests-sync').on('postgres_changes', { event: '*', schema: 'public', table: 'reservation_requests' }, fetchData).subscribe();
    return () => { 
      supabase.removeChannel(resChannel);
      supabase.removeChannel(reqChannel);
    };
  }, []);

  async function fetchData() {
    setLoading(true);
    const [resResult, compResult, reqResult, usersResult] = await Promise.all([
      supabase.from('reservations').select('*').order('check_in'),
      supabase.from('companies').select('*').order('name'),
      supabase.from('reservation_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*')
    ]);

    if (resResult.data) setReservations(resResult.data);
    if (compResult.data) setCompanies(compResult.data);
    if (reqResult.data) setReservationRequests(reqResult.data);
    if (usersResult.data) setUsers(usersResult.data);
    setLoading(false);
  }

  const generateReservationCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'RYL-';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const resCode = formData.reservation_code || generateReservationCode();
      const { error } = await supabase
        .from('reservations')
        .insert([{ 
          ...formData, 
          reservation_code: resCode,
          created_at: new Date().toISOString() 
        }]);

      if (error) throw error;
      toast.success('Reserva cadastrada com sucesso');
      setIsModalOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error('Erro ao salvar reserva');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  const handleApproveReservation = async (request: ReservationRequest) => {
    try {
      setLoading(true);
      const { id: _reqId, ...requestData } = request as any;
      const { data: reservation, error: approveError } = await supabase
        .from('reservations')
        .insert([{
          ...requestData,
          status: 'CONFIRMED',
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (approveError) throw approveError;
      if (!reservation) throw new Error('Falha ao criar reserva: resposta vazia do servidor.');

      await supabase
        .from('reservation_requests')
        .delete()
        .eq('id', request.id);

      toast.success('Reserva aprovada com sucesso!');
      fetchData();

      // Notify User
      const userProfile = users.find(u => u.name === request.requested_by);
      if (userProfile) {
        await sendNotification({
          user_id: userProfile.id,
          title: 'Reserva Aprovada',
          message: `Sua solicitação de reserva (Ref: ${request.reservation_code}) foi aprovada!`,
          link: '/dashboard'
        });
      }

      await logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Aprovação de Reserva',
        details: `Reserva Code: ${request.reservation_code}, Hóspede: ${request.guest_name}`,
        type: 'update'
      });
    } catch (error) {
      console.error("Error approving reservation:", error);
      toast.error('Erro ao aprovar reserva.');
    } finally {
      setLoading(false);
    }
  };

  const handleRejectReservation = async (requestId: string, code: string, requesterName: string) => {
    if (!window.confirm('Deseja realmente rejeitar esta solicitação?')) return;
    try {
      setLoading(true);
      await supabase
        .from('reservation_requests')
        .update({ status: 'REJECTED' })
        .eq('id', requestId);

      toast.success('Solicitação rejeitada.');
      fetchData();

      const userProfile = users.find(u => u.name === requesterName);
      if (userProfile) {
        await sendNotification({
          user_id: userProfile.id,
          title: 'Reserva Rejeitada',
          message: `Infelizmente sua solicitação de reserva (Ref: ${code}) não pôde ser atendida.`,
          link: '/dashboard'
        });
      }

      await logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Rejeição de Reserva',
        details: `Reserva Code: ${code}, Solicitante: ${requesterName}`,
        type: 'update'
      });
    } catch (error) {
      toast.error('Erro ao rejeitar solicitação.');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckoutReservation = async (reservation: Reservation) => {
    if (!window.confirm(`Deseja realizar o checkout da reserva ${reservation.reservation_code}? Um arquivo de faturamento será gerado automaticamente.`)) return;
    try {
      setLoading(true);
      const company = companies.find(c => c.id === reservation.company_id);
      const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const invoiceFileName = `fatura_checkout_${reservation.reservation_code}.html`;
      const companySegment = company?.id || slugifySegment(company?.name || 'particular') || 'particular';
      const period = new Date().toISOString().slice(0, 7);
      const [year, month] = period.split('-');
      const storagePath = `empresas/${companySegment}/${year}/${month}/faturas/${invoiceFileName}`;
      const invoiceHtml = buildAutoInvoiceHtml({
        companyName: company?.name || 'Cliente Particular',
        companyCnpj: company?.cnpj,
        guestName: reservation.guest_name,
        reservationCode: reservation.reservation_code,
        checkIn: reservation.check_in,
        checkOut: reservation.check_out,
        amount: reservation.total_amount,
        dueDate
      });
      const invoiceBlob = new Blob([invoiceHtml], { type: 'text/html;charset=utf-8' });

      const { error: uploadError } = await supabase.storage
        .from('files')
        .upload(storagePath, invoiceBlob);

      if (uploadError) throw uploadError;

      // 1. Create the fiscal file (invoice)
      const fiscalFile = {
        company_id: reservation.company_id,
        original_name: invoiceFileName,
        type: 'FATURA',
        period,
        due_date: dueDate,
        amount: reservation.total_amount,
        status: 'PENDING',
        category: 'Hospedagem',
        uploader_id: profile.id,
        upload_date: new Date().toISOString(),
        storage_path: storagePath,
        viewed_by_client: false,
        created_at: new Date().toISOString(),
        reservation_code: reservation.reservation_code,
        tracking_stage: 'finance',
        tracking_status: 'pending',
        tracking_notes: `Fatura automática gerada no checkout da reserva ${reservation.reservation_code}.`,
        tracking_updated_at: new Date().toISOString(),
        tracking_updated_by: profile.name
      };

      const { error: fileError } = await supabase.from('files').insert([fiscalFile]);
      if (fileError) throw fileError;

      // 2. Update reservation status
      await supabase
        .from('reservations')
        .update({ status: 'CHECKED_OUT' })
        .eq('id', reservation.id);

      const companyUsers = users.filter(u => u.company_id === reservation.company_id);
      for (const user of companyUsers) {
        await sendNotification({
          user_id: user.id,
          title: 'Fatura Gerada no Checkout',
          message: `A reserva ${reservation.reservation_code} foi faturada e o documento já está disponível no portal.`,
          link: '/dashboard'
        });
      }

      toast.success('Checkout realizado e fatura gerada com o código ' + reservation.reservation_code);
      fetchData();

      await logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Checkout de Reserva',
        details: `Reserva Code: ${reservation.reservation_code}, Fatura Gerada em ${storagePath}.`,
        type: 'update'
      });
    } catch (error) {
      console.error("Error in checkout:", error);
      toast.error('Erro ao realizar checkout.');
    } finally {
      setLoading(false);
    }
  };

  function resetForm() {
    setFormData({
      guest_name: '',
      contact_phone: '',
      room_number: '',
      check_in: format(new Date(), 'yyyy-MM-dd'),
      check_out: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
      status: 'CONFIRMED',
      company_id: '',
      total_amount: 0,
      reservation_code: '',
      cost_center: '',
      tariff: 0,
      category: 'executivo',
      guests_per_uh: 1,
      iss_tax: 5,
      service_tax: 10,
      payment_method: 'BILLED'
    });
  }

  const filteredReservations = reservations.filter(r => 
    r.guest_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.room_number || '').includes(searchTerm) ||
    r.reservation_code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const statusColors = {
    PENDING: 'bg-amber-100 text-amber-700',
    CONFIRMED: 'bg-blue-100 text-blue-700',
    CHECKED_IN: 'bg-green-100 text-green-700',
    CHECKED_OUT: 'bg-neutral-100 text-neutral-600',
    CANCELLED: 'bg-red-100 text-red-700'
  };

  const statusLabels = {
    PENDING: 'Pendente',
    CONFIRMED: 'Confirmada',
    CHECKED_IN: 'In House',
    CHECKED_OUT: 'Faturada',
    CANCELLED: 'Cancelada'
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">Gestão de Reservas</h2>
          <p className="text-sm text-neutral-500">Controle de solicitações, ocupação e faturamento automático.</p>
        </div>
        <button
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="flex items-center gap-2 bg-neutral-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-neutral-800 transition-all shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Nova Reserva
        </button>
      </div>

      <div className="flex bg-neutral-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveSubTab('requests')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
            activeSubTab === 'requests' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          Solicitações em Análise
          {reservationRequests.filter(r => r.status === 'REQUESTED').length > 0 && (
            <span className="w-5 h-5 bg-red-600 text-white text-[10px] rounded-full flex items-center justify-center">
              {reservationRequests.filter(r => r.status === 'REQUESTED').length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveSubTab('map')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
            activeSubTab === 'map' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          Mapa / Reservas Ativas
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Buscar por hóspede, quarto ou código..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
        {activeSubTab === 'requests' ? (
          <div className="divide-y divide-neutral-100">
            {reservationRequests.length === 0 ? (
              <div className="p-20 text-center text-neutral-400 italic">Nenhuma solicitação pendente no momento.</div>
            ) : (
              reservationRequests.map(req => (
                <div key={req.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:bg-neutral-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                      <Clock className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-neutral-900">{req.guest_name}</h4>
                      <p className="text-xs text-neutral-500 font-medium">Solicitado por: {req.requested_by} ({companies.find(c => c.id === req.company_id)?.name})</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-tighter">REF: {req.reservation_code}</span>
                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded truncate">{req.category}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-8">
                    <div className="flex gap-4 border-l border-neutral-100 pl-8">
                      <div className="text-center">
                        <p className="text-[9px] font-bold text-neutral-400 uppercase">Check-in</p>
                        <p className="text-sm font-bold text-neutral-900">{format(new Date(req.check_in + 'T12:00:00'), 'dd/MM/yy')}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] font-bold text-neutral-400 uppercase">Check-out</p>
                        <p className="text-sm font-bold text-neutral-900">{format(new Date(req.check_out + 'T12:00:00'), 'dd/MM/yy')}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                       <button 
                        onClick={() => handleApproveReservation(req)}
                        className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all shadow-sm"
                        title="Aprovar Reserva"
                       >
                         <Check className="w-4 h-4" />
                       </button>
                       <button 
                        onClick={() => handleRejectReservation(req.id!, req.reservation_code, req.requested_by!)}
                        className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all shadow-sm"
                        title="Rejeitar Solicitação"
                       >
                         <X className="w-4 h-4" />
                       </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-neutral-50 text-neutral-500 text-[10px] font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Ref/Quarto</th>
                  <th className="px-6 py-4">Hóspede</th>
                  <th className="px-6 py-4">Estadia</th>
                  <th className="px-6 py-4">Empresa / Faturamento</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredReservations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-20 text-center text-neutral-400 italic">Nenhuma reserva encontrada para os critérios de busca.</td>
                  </tr>
                ) : filteredReservations.map(res => (
                  <tr key={res.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-neutral-400 uppercase leading-none mb-1">{res.reservation_code}</span>
                        <div className="flex items-center gap-2">
                          <Hash className="w-3 h-3 text-neutral-400" />
                          <span className="text-sm font-bold text-neutral-900">{res.room_number || '---'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-neutral-900">{res.guest_name}</span>
                        <span className="text-[10px] text-neutral-400 uppercase font-medium">{res.category}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-neutral-400 font-bold uppercase">In</span>
                          <span className="text-xs font-medium">{format(new Date(res.check_in + 'T12:00:00'), 'dd/MM')}</span>
                        </div>
                        <div className="h-px w-4 bg-neutral-200" />
                        <div className="flex flex-col">
                          <span className="text-[10px] text-neutral-400 font-bold uppercase">Out</span>
                          <span className="text-xs font-medium">{format(new Date(res.check_out + 'T12:00:00'), 'dd/MM')}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs text-neutral-600">
                        {companies.find(c => c.id === res.company_id)?.name || 'Particular'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-[9px] font-bold uppercase ${statusColors[res.status]}`}>
                        {statusLabels[res.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setVoucherReservation(res)}
                          className="p-2 text-neutral-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-all"
                          title="Imprimir Voucher"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        {res.status !== 'CHECKED_OUT' && (
                          <button
                            onClick={() => handleCheckoutReservation(res)}
                            className="p-2 text-neutral-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="Realizar Checkout / Faturar"
                          >
                            <LogOut className="w-4 h-4" />
                          </button>
                        )}
                        <button className="p-2 text-neutral-400 hover:text-neutral-900 transition-colors">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {voucherReservation && (
        <ReservationVoucher
          reservation={voucherReservation}
          company={companies.find(c => c.id === voucherReservation.company_id)}
          onClose={() => setVoucherReservation(null)}
        />
      )}

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-neutral-100 flex justify-between items-center">
                <h3 className="text-lg font-bold text-neutral-900">Nova Reserva Manual</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-neutral-100 rounded-full"><CloseIcon className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
                {/* Hóspede */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-500 uppercase">Hóspede Principal *</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                      <input required value={formData.guest_name} onChange={e => setFormData({ ...formData, guest_name: e.target.value })} className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10" placeholder="Nome completo" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-500 uppercase">Telefone de Contato</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                      <input value={formData.contact_phone} onChange={e => setFormData({ ...formData, contact_phone: e.target.value })} className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10" placeholder="(00) 00000-0000" />
                    </div>
                  </div>
                </div>

                {/* Empresa e Categoria */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-500 uppercase">Empresa / Convênio</label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                      <select value={formData.company_id} onChange={e => setFormData({ ...formData, company_id: e.target.value })} className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 appearance-none">
                        <option value="">Particular (Sem Empresa)</option>
                        {companies.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-500 uppercase">Categoria *</label>
                    <select required value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10">
                      <option value="executivo">Executivo</option>
                      <option value="luxo">Luxo</option>
                      <option value="super_luxo">Super Luxo</option>
                      <option value="standard">Standard</option>
                    </select>
                  </div>
                </div>

                {/* Datas */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-500 uppercase">Check-in *</label>
                    <input type="date" required value={formData.check_in} onChange={e => setFormData({ ...formData, check_in: e.target.value })} className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-500 uppercase">Check-out *</label>
                    <input type="date" required value={formData.check_out} onChange={e => setFormData({ ...formData, check_out: e.target.value })} className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10" />
                  </div>
                </div>

                {/* Quarto, Tarifa, Hóspedes */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-500 uppercase">Nº do Quarto *</label>
                    <div className="relative">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                      <input required value={formData.room_number} onChange={e => setFormData({ ...formData, room_number: e.target.value })} className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10" placeholder="Ex: 101" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-500 uppercase">Tarifa Diária (R$) *</label>
                    <input type="number" step="0.01" min="0" required value={formData.tariff || ''} onChange={e => setFormData({ ...formData, tariff: parseFloat(e.target.value) || 0 })} className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10" placeholder="0,00" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-500 uppercase">Hóspedes / UH</label>
                    <div className="relative">
                      <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                      <input type="number" min="1" max="10" value={formData.guests_per_uh} onChange={e => setFormData({ ...formData, guests_per_uh: parseInt(e.target.value) || 1 })} className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10" />
                    </div>
                  </div>
                </div>

                {/* Pagamento e Centro de Custo */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-500 uppercase">Forma de Pagamento</label>
                    <select value={formData.payment_method} onChange={e => setFormData({ ...formData, payment_method: e.target.value as 'BILLED' | 'VIRTUAL_CARD' })} className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10">
                      <option value="BILLED">Faturado (Empresa)</option>
                      <option value="VIRTUAL_CARD">Cartão / Particular</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-500 uppercase">Centro de Custo</label>
                    <input value={formData.cost_center} onChange={e => setFormData({ ...formData, cost_center: e.target.value })} className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10" placeholder="Ex: DIRETORIA, RH..." />
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-neutral-100">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2.5 text-sm font-bold text-neutral-600 border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-all">Cancelar</button>
                  <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 bg-neutral-900 text-white text-sm font-bold rounded-xl shadow-lg shadow-neutral-900/20 flex items-center justify-center gap-2 hover:bg-neutral-800 transition-all">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    Confirmar Reserva
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
