import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { UserProfile, Reservation, Company, ReservationRequest } from '../types';
import { Plus, Search, Calendar, ChevronLeft, ChevronRight, User, Hash, Clock, CheckCircle, XCircle, MoreVertical, Filter, Loader2, X as CloseIcon, Check, X, LogOut, FileText, Printer, Phone, Building2, Users, DollarSign, IdCard, Bed, AlertCircle } from 'lucide-react';
import ReservationVoucher from './ReservationVoucher';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { format, addDays, startOfToday, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { logAudit, sendNotification } from '../lib/audit';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell, Legend } from 'recharts';

type Room = {
  id: string;
  room_number: string;
  floor: number;
  category: string;
  status: 'available' | 'occupied' | 'maintenance' | 'reserved';
};

const normalizeCategory = (c: string) =>
  (c || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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
  const [activeSubTab, setActiveSubTab] = useState<'map' | 'requests' | 'ocupacao'>('map');
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reservationRequests, setReservationRequests] = useState<ReservationRequest[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
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
    fiscal_data: '',
    room_number: '',
    check_in: format(new Date(), 'yyyy-MM-dd'),
    check_out: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
    status: 'CONFIRMED' as Reservation['status'],
    company_id: '',
    total_amount: 0,
    reservation_code: '',
    cost_center: '',
    billing_obs: '',
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
    const [resResult, compResult, reqResult, usersResult, roomsResult] = await Promise.all([
      supabase.from('reservations').select('*').order('check_in'),
      supabase.from('companies').select('*').order('name'),
      supabase.from('reservation_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*'),
      supabase.from('rooms').select('*').order('room_number')
    ]);

    if (resResult.data) setReservations(resResult.data);
    if (compResult.data) setCompanies(compResult.data);
    if (reqResult.data) setReservationRequests(reqResult.data);
    if (usersResult.data) setUsers(usersResult.data);
    if (roomsResult.data) setRooms(roomsResult.data);
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

  async function handleCancelReservation(reservation: Reservation) {
    const reason = window.prompt(`Motivo do cancelamento da reserva ${reservation.reservation_code} (${reservation.guest_name}):`);
    if (reason === null) return;
    if (!reason.trim()) { toast.error('Informe o motivo do cancelamento.'); return; }
    try {
      const isoTs = new Date().toISOString();
      const { error } = await supabase.from('reservations').update({
        status: 'CANCELLED',
        cancel_reason: reason.trim(),
        cancelled_at: isoTs,
        updated_at: isoTs,
      }).eq('id', reservation.id);
      if (error) throw error;

      await logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Reserva cancelada',
        details: `${reservation.guest_name} · ${reservation.reservation_code} · Motivo: ${reason.trim()}`,
        type: 'update',
      });

      toast.success('Reserva cancelada.');
      fetchData();
    } catch (err: any) {
      toast.error('Erro ao cancelar reserva: ' + (err?.message || 'falha'));
    }
  }

  async function handleNoShowReservation(reservation: Reservation) {
    const reason = window.prompt(`Marcar como No Show — reserva ${reservation.reservation_code} (${reservation.guest_name}). Motivo/Observação:`);
    if (reason === null) return;
    try {
      const isoTs = new Date().toISOString();
      const { error } = await supabase.from('reservations').update({
        status: 'NO_SHOW',
        no_show_at: isoTs,
        no_show_reason: reason.trim() || null,
        updated_at: isoTs,
      }).eq('id', reservation.id);
      if (error) throw error;

      await logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Reserva marcada como No Show',
        details: `${reservation.guest_name} · ${reservation.reservation_code}${reason.trim() ? ` · ${reason.trim()}` : ''}`,
        type: 'update',
      });

      toast.success('Reserva marcada como No Show.');
      fetchData();
    } catch (err: any) {
      toast.error('Erro ao marcar No Show: ' + (err?.message || 'falha'));
    }
  }

  function resetForm() {
    setFormData({
      guest_name: '',
      contact_phone: '',
      fiscal_data: '',
      room_number: '',
      check_in: format(new Date(), 'yyyy-MM-dd'),
      check_out: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
      status: 'CONFIRMED',
      company_id: '',
      total_amount: 0,
      reservation_code: '',
      cost_center: '',
      billing_obs: '',
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

  const statusColors: Record<Reservation['status'], string> = {
    PENDING: 'bg-emerald-100 text-emerald-700',
    CONFIRMED: 'bg-emerald-100 text-emerald-700',
    CHECKED_IN: 'bg-blue-100 text-blue-700',
    CHECKED_OUT: 'bg-neutral-100 text-neutral-600',
    CANCELLED: 'bg-red-100 text-red-700',
    NO_SHOW: 'bg-orange-100 text-orange-700',
  };

  const statusLabels: Record<Reservation['status'], string> = {
    PENDING: 'Ativa',
    CONFIRMED: 'Ativa',
    CHECKED_IN: 'Em Hospedagem',
    CHECKED_OUT: 'Finalizada',
    CANCELLED: 'Cancelada',
    NO_SHOW: 'No Show',
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
        <button
          onClick={() => setActiveSubTab('ocupacao')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
            activeSubTab === 'ocupacao' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          Ocupação
        </button>
      </div>

      {activeSubTab !== 'ocupacao' && (
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
      )}

      {activeSubTab === 'ocupacao' && (
        <OcupacaoPanel reservations={reservations} rooms={rooms} />
      )}

      {activeSubTab !== 'ocupacao' && (
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
                        {(res.status === 'CONFIRMED' || res.status === 'PENDING') && (
                          <>
                            <button
                              onClick={() => handleNoShowReservation(res)}
                              className="p-2 text-neutral-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-all"
                              title="Marcar como No Show"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleCancelReservation(res)}
                              className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              title="Cancelar reserva"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {res.status === 'CHECKED_IN' && (
                          <button
                            onClick={() => handleCheckoutReservation(res)}
                            className="p-2 text-neutral-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="Realizar Checkout / Faturar"
                          >
                            <LogOut className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {voucherReservation && (
        <ReservationVoucher
          reservation={voucherReservation}
          company={companies.find(c => c.id === voucherReservation.company_id)}
          onClose={() => setVoucherReservation(null)}
        />
      )}

      <AnimatePresence>
        {isModalOpen && (
          <NovaReservaModal
            companies={companies}
            rooms={rooms}
            onCancel={() => setIsModalOpen(false)}
            onConfirm={async (data) => {
              setLoading(true);
              try {
                const resCode = generateReservationCode();
                const nights = Math.max(1, Math.round((new Date(data.check_out).getTime() - new Date(data.check_in).getTime()) / 86400000));
                const { error } = await supabase.from('reservations').insert([{
                  ...data,
                  reservation_code: resCode,
                  status: 'CONFIRMED',
                  total_amount: nights * data.tariff,
                  created_at: new Date().toISOString(),
                }]);
                if (error) throw error;
                toast.success('Reserva confirmada com sucesso');
                setIsModalOpen(false);
                fetchData();
              } catch {
                toast.error('Erro ao salvar reserva');
              } finally {
                setLoading(false);
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function NovaReservaModal({
  companies, rooms, onCancel, onConfirm,
}: {
  companies: Company[];
  rooms: Room[];
  onCancel: () => void;
  onConfirm: (data: {
    guest_name: string;
    contact_phone: string;
    fiscal_data: string;
    company_id: string;
    check_in: string;
    check_out: string;
    category: string;
    tariff: number;
    guests_per_uh: number;
    payment_method: 'BILLED' | 'VIRTUAL_CARD';
    room_number: string;
    cost_center: string;
    billing_obs: string;
    iss_tax: number;
    service_tax: number;
  }) => Promise<void>;
}) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');

  const [guestName, setGuestName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [fiscalData, setFiscalData] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [checkIn, setCheckIn] = useState(today);
  const [checkOut, setCheckOut] = useState(tomorrow);
  const [category, setCategory] = useState('executivo');
  const [tariff, setTariff] = useState(0);
  const [guestsPerUh, setGuestsPerUh] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<'BILLED' | 'VIRTUAL_CARD'>('BILLED');
  const [selectedRoom, setSelectedRoom] = useState('');
  const [manualRoom, setManualRoom] = useState('');
  const [costCenter, setCostCenter] = useState('');
  const [billingObs, setBillingObs] = useState('');
  const [issEnabled, setIssEnabled] = useState(false);
  const [serviceEnabled, setServiceEnabled] = useState(false);
  const [issRate, setIssRate] = useState(3.75);
  const [serviceRate, setServiceRate] = useState(10);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('id', 'fiscal_settings').maybeSingle().then(({ data }) => {
      if (data?.value) {
        try {
          const p = JSON.parse(data.value);
          if (p.iss_rate != null) setIssRate(p.iss_rate);
          if (p.service_tax_rate != null) setServiceRate(p.service_tax_rate);
        } catch { /* usa defaults */ }
      }
    });
  }, []);

  const nights = Math.max(1, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000));
  const subtotal = nights * tariff;
  const issAmount = issEnabled ? subtotal * issRate / 100 : 0;
  const serviceAmount = serviceEnabled ? subtotal * serviceRate / 100 : 0;
  const forecast = subtotal + issAmount + serviceAmount;
  const effectiveRoom = selectedRoom || manualRoom.trim();

  // Para reserva futura, mostra todos os quartos (não bloqueia por disponibilidade)
  const allRooms = rooms.filter(r => r.room_number !== '');
  const byFloor = allRooms.reduce<Record<number, Room[]>>((acc, r) => {
    (acc[r.floor] ??= []).push(r);
    return acc;
  }, {});

  async function submit() {
    if (!guestName.trim()) { toast.error('Informe o nome do hóspede.'); return; }
    if (new Date(checkOut) <= new Date(checkIn)) { toast.error('Check-out deve ser depois do check-in.'); return; }
    if (!(tariff > 0)) { toast.error('Informe o valor da diária.'); return; }
    if (!effectiveRoom) { toast.error('Selecione ou informe o número da UH.'); return; }
    setSubmitting(true);
    try {
      await onConfirm({
        guest_name: guestName.trim(),
        contact_phone: contactPhone.trim(),
        fiscal_data: fiscalData.trim(),
        company_id: companyId,
        check_in: checkIn,
        check_out: checkOut,
        category,
        tariff,
        guests_per_uh: guestsPerUh,
        payment_method: paymentMethod,
        room_number: effectiveRoom,
        cost_center: costCenter.trim(),
        billing_obs: billingObs.trim(),
        iss_tax: issEnabled ? issRate : 0,
        service_tax: serviceEnabled ? serviceRate : 0,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-3xl max-h-[92vh] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
      >
        <div className="p-6 border-b border-neutral-100 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-bold text-neutral-900">Nova Reserva</h3>
            </div>
            <p className="text-sm text-neutral-500 mt-1">
              Registre uma reserva confirmada. O hóspede aparecerá na fila de check-in na data de entrada.
            </p>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-neutral-100 rounded-full">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-5">
          {/* Hóspede */}
          <div>
            <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-3">Hóspede</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Nome completo</label>
                <div className="relative mt-1">
                  <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                  <input type="text" value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="Nome do hóspede"
                    className="w-full pl-8 pr-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10" />
                </div>
              </div>
              <div>
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Telefone</label>
                <div className="relative mt-1">
                  <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                  <input type="text" value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="(22) 0000-0000"
                    className="w-full pl-8 pr-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10" />
                </div>
              </div>
              <div>
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">CPF / Documento</label>
                <div className="relative mt-1">
                  <IdCard className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                  <input type="text" value={fiscalData} onChange={e => setFiscalData(e.target.value)} placeholder="000.000.000-00"
                    className="w-full pl-8 pr-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10" />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">
                  Empresa <span className="text-neutral-400 font-normal normal-case">(opcional)</span>
                </label>
                <div className="relative mt-1">
                  <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                  <select value={companyId} onChange={e => setCompanyId(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10">
                    <option value="">Particular (Sem Empresa)</option>
                    {companies.filter(c => c.slug !== 'walk-in').sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Estadia */}
          <div>
            <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-3">Estadia</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Entrada</label>
                <input type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)}
                  className="mt-1 w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10" />
              </div>
              <div>
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Saída</label>
                <input type="date" value={checkOut} onChange={e => setCheckOut(e.target.value)}
                  className="mt-1 w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10" />
              </div>
              <div className="col-span-2">
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Categoria</label>
                <select value={category} onChange={e => { setCategory(e.target.value); setSelectedRoom(''); }}
                  className="mt-1 w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10">
                  <option value="executivo">Executivo</option>
                  <option value="master">Master</option>
                  <option value="suite presidencial">Suíte Presidencial</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Hóspedes</label>
                <input type="number" min={1} step={1} value={guestsPerUh} onChange={e => setGuestsPerUh(Number(e.target.value))}
                  className="mt-1 w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 tabular-nums" />
              </div>
              <div>
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Diária (R$)</label>
                <div className="relative mt-1">
                  <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                  <input type="number" min={0} step="0.01" value={tariff} onChange={e => setTariff(Number(e.target.value))}
                    className="w-full pl-8 pr-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 tabular-nums" />
                </div>
              </div>
              <div className="col-span-2">
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Pagamento</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as 'BILLED' | 'VIRTUAL_CARD')}
                  className="mt-1 w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10">
                  <option value="BILLED">Faturado</option>
                  <option value="VIRTUAL_CARD">Cartão / À vista</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Centro de Custo</label>
                <input type="text" value={costCenter} onChange={e => setCostCenter(e.target.value)}
                  className="mt-1 w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10" />
              </div>
              <div className="col-span-2 sm:col-span-4">
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Observações</label>
                <textarea value={billingObs} onChange={e => setBillingObs(e.target.value)} rows={2}
                  placeholder="Instruções especiais, restrições, solicitações..."
                  className="mt-1 w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 resize-none" />
              </div>
            </div>

            <div className="mt-3 bg-neutral-50 border border-neutral-200 rounded-lg px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-neutral-600">
                <span>{nights} diária{nights === 1 ? '' : 's'} × {formatBRL(tariff)}</span>
                <span className="tabular-nums">{formatBRL(subtotal)}</span>
              </div>
              {issEnabled && <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>ISS ({issRate}%)</span>
                <span className="tabular-nums">+ {formatBRL(issAmount)}</span>
              </div>}
              {serviceEnabled && <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>Taxa de Serviço ({serviceRate}%)</span>
                <span className="tabular-nums">+ {formatBRL(serviceAmount)}</span>
              </div>}
              <div className="flex items-center justify-between pt-1.5 border-t border-neutral-200">
                <span className="text-xs font-bold text-neutral-700">Total previsto</span>
                <span className="text-sm font-bold text-neutral-900 tabular-nums">{formatBRL(forecast)}</span>
              </div>
            </div>
          </div>

          {/* Impostos */}
          <div>
            <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-3">Impostos e Taxas</h4>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setIssEnabled(v => !v)}
                className={`flex-1 flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all ${issEnabled ? 'border-blue-500 bg-blue-50' : 'border-neutral-200 bg-white hover:border-neutral-300'}`}
              >
                <div className="text-left">
                  <p className={`text-xs font-bold ${issEnabled ? 'text-blue-700' : 'text-neutral-700'}`}>ISS</p>
                  <p className={`text-[10px] ${issEnabled ? 'text-blue-500' : 'text-neutral-400'}`}>{issRate}% · Municipal</p>
                </div>
                <div className={`w-9 h-5 rounded-full transition-all relative ${issEnabled ? 'bg-blue-500' : 'bg-neutral-200'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${issEnabled ? 'left-4' : 'left-0.5'}`} />
                </div>
              </button>
              <button
                type="button"
                onClick={() => setServiceEnabled(v => !v)}
                className={`flex-1 flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all ${serviceEnabled ? 'border-purple-500 bg-purple-50' : 'border-neutral-200 bg-white hover:border-neutral-300'}`}
              >
                <div className="text-left">
                  <p className={`text-xs font-bold ${serviceEnabled ? 'text-purple-700' : 'text-neutral-700'}`}>Taxa Serviço</p>
                  <p className={`text-[10px] ${serviceEnabled ? 'text-purple-500' : 'text-neutral-400'}`}>{serviceRate}% · Hoteleiro</p>
                </div>
                <div className={`w-9 h-5 rounded-full transition-all relative ${serviceEnabled ? 'bg-purple-500' : 'bg-neutral-200'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${serviceEnabled ? 'left-4' : 'left-0.5'}`} />
                </div>
              </button>
            </div>
          </div>

          {/* Seleção de UH */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                UH da Reserva
              </h4>
              {allRooms.length > 0 && (
                <span className="text-[10px] font-bold text-neutral-400">
                  {allRooms.length} UH{allRooms.length === 1 ? '' : 's'} cadastrada{allRooms.length === 1 ? '' : 's'}
                </span>
              )}
            </div>

            {allRooms.length > 0 ? (
              <div className="space-y-3 max-h-48 overflow-auto border border-neutral-200 rounded-xl p-3">
                {Object.keys(byFloor).map(Number).sort((a, b) => a - b).map(floor => (
                  <div key={floor}>
                    <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5">{floor}º Andar</p>
                    <div className="grid grid-cols-5 sm:grid-cols-8 gap-1.5">
                      {byFloor[floor].sort((a, b) => a.room_number.localeCompare(b.room_number)).map(room => {
                        const isSelected = selectedRoom === room.room_number;
                        const isOccupied = room.status === 'occupied';
                        const cat = normalizeCategory(room.category || '');
                        const isSameCat = normalizeCategory(category) === cat;
                        return (
                          <button key={room.id}
                            onClick={() => { setSelectedRoom(room.room_number); setManualRoom(''); }}
                            title={`UH ${room.room_number}${isOccupied ? ' · ocupada' : ''}${!isSameCat ? ` · ${room.category}` : ''}`}
                            className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-xs font-bold border transition-all ${
                              isSelected
                                ? 'bg-neutral-900 text-white border-neutral-900'
                                : isOccupied
                                  ? 'bg-red-50 text-red-400 border-red-200 hover:border-red-400'
                                  : !isSameCat
                                    ? 'bg-purple-50 text-purple-700 border-purple-200 hover:border-purple-400'
                                    : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400'
                            }`}
                          >
                            <Bed className="w-3 h-3 mb-0.5" />
                            {room.room_number}
                            {isOccupied && !isSelected && <span className="text-[8px] leading-none text-red-400">ocup.</span>}
                            {!isSameCat && !isOccupied && !isSelected && <span className="text-[8px] leading-none text-purple-500">↕</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 bg-neutral-50 border border-neutral-200 rounded-xl">
                <AlertCircle className="w-4 h-4 text-neutral-400" />
                <p className="text-xs text-neutral-600">Nenhuma UH cadastrada ainda. Digite o número manualmente abaixo.</p>
              </div>
            )}

            <div className="mt-3">
              <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">
                {allRooms.length > 0 ? 'Ou informe o número da UH manualmente' : 'Número da UH'}
              </label>
              <div className="relative mt-1">
                <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                <input type="text" value={manualRoom} onChange={e => { setManualRoom(e.target.value); setSelectedRoom(''); }}
                  placeholder="Ex: 101"
                  className="w-full pl-8 pr-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10" />
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-neutral-100 flex gap-3 bg-neutral-50">
          <button onClick={onCancel} disabled={submitting} className="flex-1 px-4 py-2 text-sm font-bold text-neutral-600 disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={submit} disabled={submitting || !effectiveRoom}
            className="flex-1 px-4 py-2 bg-neutral-900 text-white text-sm font-bold rounded-xl shadow-lg shadow-neutral-900/20 disabled:opacity-50 flex items-center justify-center gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Confirmar Reserva{effectiveRoom ? ` · UH ${effectiveRoom}` : ''}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function OcupacaoPanel({
  reservations, rooms,
}: {
  reservations: Reservation[];
  rooms: Room[];
}) {
  const [horizonDays, setHorizonDays] = useState<number>(30);
  const [startOffsetDays, setStartOffsetDays] = useState<number>(0);

  const physicalRooms = rooms.filter(r => !['CC', 'ADM'].includes(r.room_number));
  const capacityByCategory: Record<string, number> = physicalRooms.reduce((acc, r) => {
    const k = normalizeCategory(r.category);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const totalCapacity = physicalRooms.length;

  const activeReservations = reservations.filter(r =>
    r.status === 'CONFIRMED' ||
    r.status === 'PENDING' ||
    r.status === 'CHECKED_IN'
  );

  const today = startOfToday();
  const data = Array.from({ length: horizonDays }, (_, i) => {
    const day = addDays(today, i + startOffsetDays);
    const dayISO = format(day, 'yyyy-MM-dd');

    const occupied = activeReservations.filter(r =>
      (r.check_in || '') <= dayISO && (r.check_out || '') > dayISO
    );

    const byCat: Record<string, number> = {};
    occupied.forEach(r => {
      const k = normalizeCategory(r.category || '');
      byCat[k] = (byCat[k] || 0) + 1;
    });

    const total = occupied.length;
    const pct = totalCapacity > 0 ? Math.round((total / totalCapacity) * 100) : 0;
    const overbooked = total > totalCapacity;
    const overbookedCategories = Object.entries(byCat)
      .filter(([k, v]) => v > (capacityByCategory[k] || 0))
      .map(([k]) => k);

    return {
      dateISO: dayISO,
      label: format(day, 'dd/MM'),
      dayOfWeek: format(day, 'EEE', { locale: ptBR }),
      total,
      pct,
      capacity: totalCapacity,
      overbooked,
      overbookedCategories,
      executivo: byCat['executivo'] || 0,
      master: byCat['master'] || 0,
      suite: byCat['suite presidencial'] || 0,
    };
  });

  const overbookedDays = data.filter(d => d.overbooked).length;
  const avgOccupancy = data.length > 0
    ? Math.round(data.reduce((s, d) => s + d.pct, 0) / data.length)
    : 0;
  const peakDay = data.reduce((best, d) => (d.total > (best?.total ?? -1) ? d : best), data[0]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-neutral-200 rounded-2xl p-4">
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Capacidade total</p>
          <p className="text-2xl font-bold text-neutral-900 mt-1 tabular-nums">{totalCapacity}</p>
          <p className="text-[10px] text-neutral-500 mt-0.5">
            Exec {capacityByCategory['executivo'] || 0} · Mst {capacityByCategory['master'] || 0} · Suíte {capacityByCategory['suite presidencial'] || 0}
          </p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-2xl p-4">
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Ocupação média</p>
          <p className="text-2xl font-bold text-neutral-900 mt-1 tabular-nums">{avgOccupancy}%</p>
          <p className="text-[10px] text-neutral-500 mt-0.5">próximos {horizonDays} dias</p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-2xl p-4">
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Pico previsto</p>
          <p className="text-2xl font-bold text-neutral-900 mt-1 tabular-nums">
            {peakDay ? `${peakDay.total}/${totalCapacity}` : '—'}
          </p>
          <p className="text-[10px] text-neutral-500 mt-0.5">
            {peakDay ? `${peakDay.label} (${peakDay.dayOfWeek})` : '—'}
          </p>
        </div>
        <div className={`border rounded-2xl p-4 ${overbookedDays > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-neutral-200'}`}>
          <p className={`text-[10px] font-bold uppercase tracking-widest ${overbookedDays > 0 ? 'text-red-700' : 'text-neutral-500'}`}>
            Dias em overbooking
          </p>
          <p className={`text-2xl font-bold mt-1 tabular-nums ${overbookedDays > 0 ? 'text-red-700' : 'text-neutral-900'}`}>
            {overbookedDays}
          </p>
          <p className="text-[10px] text-neutral-500 mt-0.5">
            {overbookedDays > 0 ? 'verificar categorias' : 'sem conflitos'}
          </p>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-neutral-900">Ocupação diária prevista</h3>
            <p className="text-[11px] text-neutral-500">
              {format(addDays(today, startOffsetDays), 'dd/MM/yyyy')} → {format(addDays(today, startOffsetDays + horizonDays - 1), 'dd/MM/yyyy')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-lg">
              {[15, 30, 60, 90].map(d => (
                <button
                  key={d}
                  onClick={() => setHorizonDays(d)}
                  className={`px-3 py-1 rounded text-[10px] font-bold ${horizonDays === d ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'}`}
                >
                  {d}d
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setStartOffsetDays(v => Math.max(-30, v - horizonDays))}
                className="p-1.5 rounded-lg hover:bg-neutral-100 border border-neutral-200"
                title="Período anterior"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setStartOffsetDays(0)}
                className="px-3 py-1.5 rounded-lg border border-neutral-200 text-[10px] font-bold hover:bg-neutral-50"
              >
                Hoje
              </button>
              <button
                onClick={() => setStartOffsetDays(v => v + horizonDays)}
                className="p-1.5 rounded-lg hover:bg-neutral-100 border border-neutral-200"
                title="Próximo período"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div style={{ width: '100%', height: 320 }}>
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: '#737373' }}
                interval={horizonDays > 30 ? 2 : 0}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#737373' }}
                allowDecimals={false}
                domain={[0, (dataMax: number) => Math.max(dataMax, totalCapacity)]}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const d: any = payload[0].payload;
                  return (
                    <div className="bg-white border border-neutral-200 rounded-lg p-3 shadow-lg text-xs">
                      <p className="font-bold text-neutral-900">{d.label} · {d.dayOfWeek}</p>
                      <p className="text-neutral-600 mt-1">
                        Ocupação: <b className={d.overbooked ? 'text-red-600' : 'text-neutral-900'}>{d.total}/{d.capacity}</b> ({d.pct}%)
                      </p>
                      <div className="text-[10px] text-neutral-500 mt-1">
                        Exec {d.executivo} · Mst {d.master} · Suíte {d.suite}
                      </div>
                      {d.overbooked && (
                        <p className="text-[10px] text-red-600 font-bold mt-1">
                          ⚠ Overbooking{d.overbookedCategories.length > 0 ? ` · ${d.overbookedCategories.join(', ')}` : ''}
                        </p>
                      )}
                    </div>
                  );
                }}
              />
              <ReferenceLine y={totalCapacity} stroke="#dc2626" strokeDasharray="4 4" label={{ value: `Capacidade ${totalCapacity}`, fill: '#dc2626', fontSize: 10, position: 'insideTopRight' }} />
              <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.overbooked ? '#dc2626' : d.pct >= 85 ? '#f59e0b' : '#171717'} />
                ))}
              </Bar>
              <Legend
                verticalAlign="bottom"
                height={24}
                payload={[
                  { value: 'Ocupação normal', type: 'square', color: '#171717' },
                  { value: 'Alta (≥85%)', type: 'square', color: '#f59e0b' },
                  { value: 'Overbooking', type: 'square', color: '#dc2626' },
                ]}
                wrapperStyle={{ fontSize: 10 }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-2xl p-5">
        <h3 className="text-sm font-bold text-neutral-900 mb-3">Ocupação por categoria</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[9px] font-bold text-neutral-500 uppercase tracking-widest border-b border-neutral-200">
                <th className="py-2 pr-3">Data</th>
                <th className="py-2 px-3 text-right">Total</th>
                <th className="py-2 px-3 text-right">Executivo</th>
                <th className="py-2 px-3 text-right">Master</th>
                <th className="py-2 px-3 text-right">Suíte</th>
                <th className="py-2 pl-3 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {data.map(d => (
                <tr key={d.dateISO} className={`border-b border-neutral-100 ${d.overbooked ? 'bg-red-50' : ''}`}>
                  <td className="py-1.5 pr-3 font-bold text-neutral-700">
                    {d.label} <span className="text-neutral-400 font-normal">· {d.dayOfWeek}</span>
                  </td>
                  <td className={`py-1.5 px-3 text-right tabular-nums font-bold ${d.overbooked ? 'text-red-700' : 'text-neutral-900'}`}>
                    {d.total}/{d.capacity}
                  </td>
                  <td className={`py-1.5 px-3 text-right tabular-nums ${d.executivo > (capacityByCategory['executivo'] || 0) ? 'text-red-700 font-bold' : 'text-neutral-600'}`}>
                    {d.executivo}/{capacityByCategory['executivo'] || 0}
                  </td>
                  <td className={`py-1.5 px-3 text-right tabular-nums ${d.master > (capacityByCategory['master'] || 0) ? 'text-red-700 font-bold' : 'text-neutral-600'}`}>
                    {d.master}/{capacityByCategory['master'] || 0}
                  </td>
                  <td className={`py-1.5 px-3 text-right tabular-nums ${d.suite > (capacityByCategory['suite presidencial'] || 0) ? 'text-red-700 font-bold' : 'text-neutral-600'}`}>
                    {d.suite}/{capacityByCategory['suite presidencial'] || 0}
                  </td>
                  <td className={`py-1.5 pl-3 text-right tabular-nums font-bold ${d.overbooked ? 'text-red-700' : d.pct >= 85 ? 'text-amber-700' : 'text-neutral-900'}`}>
                    {d.pct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
