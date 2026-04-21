import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { UserProfile, Reservation, Company } from '../types';
import { LogIn, LogOut, Receipt, Loader2, Search, User, Hash, Building2, CalendarDays, X as CloseIcon, Bed, Check, AlertCircle, Plus, Trash2, DollarSign, Printer, FileText, UserPlus, Phone, IdCard, Settings, ArrowRightLeft, RotateCcw, Briefcase, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { format, differenceInCalendarDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { logAudit } from '../lib/audit';

type SubTab = 'checkin' | 'contas' | 'historico' | 'configuracoes';

type ConfigSubTab = 'especiais' | 'reabrir' | 'transfer-uh' | 'transfer-lanc';

type Room = {
  id: string;
  room_number: string;
  floor: number;
  category: string;
  status: 'available' | 'occupied' | 'maintenance' | 'reserved';
  is_virtual?: boolean;
};

const SYSTEM_RESERVATION_CODES = new Set(['SYS-CC', 'SYS-ADM']);
const VIRTUAL_ROOM_NUMBERS = new Set(['CC', 'ADM']);

const normalizeCategory = (c: string) =>
  (c || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const CATEGORY_LABELS: Record<string, string> = {
  executivo: 'Executivo',
  master: 'Master',
  'suite presidencial': 'Suíte Presidencial',
};

type ChargeType = 'diaria' | 'servico' | 'alimento' | 'bebida' | 'lavanderia' | 'estorno' | 'outro';

type FolioCharge = {
  id: string;
  reservation_id: string;
  room_number: string | null;
  charge_date: string;
  description: string;
  quantity: number;
  unit_value: number;
  total_value: number;
  charge_type: ChargeType;
  posted_by: string | null;
  created_at: string;
};

const CHARGE_TYPE_LABELS: Record<ChargeType, string> = {
  diaria: 'Diária',
  servico: 'Serviço',
  alimento: 'Alimento',
  bebida: 'Bebida',
  lavanderia: 'Lavanderia',
  estorno: 'Estorno',
  outro: 'Outro',
};

const CHARGE_TYPE_COLORS: Record<ChargeType, string> = {
  diaria: 'bg-neutral-900 text-white',
  servico: 'bg-blue-100 text-blue-800',
  alimento: 'bg-amber-100 text-amber-800',
  bebida: 'bg-purple-100 text-purple-800',
  lavanderia: 'bg-cyan-100 text-cyan-800',
  estorno: 'bg-red-100 text-red-800',
  outro: 'bg-neutral-100 text-neutral-700',
};

const formatBRL = (n: number) =>
  `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CheckInOutDashboard({ profile }: { profile: UserProfile }) {
  const [activeTab, setActiveTab] = useState<SubTab>('checkin');
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [checkinTarget, setCheckinTarget] = useState<Reservation | null>(null);
  const [folioTarget, setFolioTarget] = useState<Reservation | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<Reservation | null>(null);
  const [notaTarget, setNotaTarget] = useState<Reservation | null>(null);
  const [notaMode, setNotaMode] = useState<'final' | 'extract'>('final');
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [allCharges, setAllCharges] = useState<FolioCharge[]>([]);
  const [configTab, setConfigTab] = useState<ConfigSubTab>('especiais');

  const chargesOf = (reservationId: string) => allCharges.filter(c => c.reservation_id === reservationId);
  const folioTotal = (reservationId: string) =>
    chargesOf(reservationId).reduce((sum, c) => sum + Number(c.total_value || 0), 0);

  async function addCharge(reservationId: string, data: {
    charge_type: ChargeType;
    description: string;
    quantity: number;
    unit_value: number;
    charge_date: string;
    room_number?: string | null;
  }) {
    const signedUnit = data.charge_type === 'estorno'
      ? -Math.abs(data.unit_value)
      : Math.abs(data.unit_value);

    const { error } = await supabase.from('folio_charges').insert([{
      reservation_id: reservationId,
      room_number: data.room_number ?? null,
      charge_date: data.charge_date,
      description: data.description,
      quantity: data.quantity,
      unit_value: signedUnit,
      charge_type: data.charge_type,
      posted_by: profile.id,
    }]);

    if (error) {
      toast.error('Erro ao lançar: ' + error.message);
      return;
    }

    await logAudit({
      user_id: profile.id,
      user_name: profile.name,
      action: 'Lançamento no folio',
      details: `${data.description} · ${formatBRL(signedUnit * data.quantity)}`,
      type: 'create',
    });

    toast.success('Lançamento adicionado.');
    await fetchAll();
  }

  async function removeCharge(charge: FolioCharge) {
    if (!confirm(`Remover "${charge.description}" do folio?`)) return;
    const { error } = await supabase.from('folio_charges').delete().eq('id', charge.id);
    if (error) {
      toast.error('Erro ao remover: ' + error.message);
      return;
    }
    await logAudit({
      user_id: profile.id,
      user_name: profile.name,
      action: 'Estorno de lançamento',
      details: `${charge.description} · ${formatBRL(charge.total_value)}`,
      type: 'delete',
    });
    toast.success('Lançamento removido.');
    await fetchAll();
  }

  function openExtract(reservation: Reservation) {
    setNotaMode('extract');
    setNotaTarget(reservation);
  }

  function openFinalNota(reservation: Reservation) {
    setNotaMode('final');
    setNotaTarget(reservation);
  }

  async function handleCheckIn(reservation: Reservation, roomNumber: string, checkedInAt: string) {
    try {
      const isoTs = new Date(checkedInAt).toISOString();

      const { error: e1 } = await supabase.from('reservations').update({
        status: 'CHECKED_IN',
        room_number: roomNumber,
        checked_in_at: isoTs,
        updated_at: isoTs,
      }).eq('id', reservation.id);
      if (e1) throw e1;

      const { error: e2 } = await supabase.from('rooms').update({
        status: 'occupied',
        updated_at: isoTs,
      }).eq('room_number', roomNumber);
      if (e2) throw e2;

      const nights = Math.max(
        1,
        differenceInCalendarDays(new Date(reservation.check_out), new Date(reservation.check_in))
      );
      const dailyRate = Number(reservation.tariff || 0);
      const charges: any[] = [];
      for (let i = 0; i < nights; i++) {
        const d = new Date(reservation.check_in);
        d.setDate(d.getDate() + i);
        charges.push({
          reservation_id: reservation.id,
          room_number: roomNumber,
          charge_date: d.toISOString().slice(0, 10),
          description: `Diária ${format(d, 'dd/MM/yyyy')}`,
          quantity: 1,
          unit_value: dailyRate,
          charge_type: 'diaria',
          posted_by: profile.id,
        });
      }
      if (charges.length > 0) {
        const { error: e3 } = await supabase.from('folio_charges').insert(charges);
        if (e3) throw e3;
      }

      await logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Check-in realizado',
        details: `${reservation.guest_name} · UH ${roomNumber} · ${nights} diária(s)`,
        type: 'update',
      });

      toast.success(`Check-in realizado para UH ${roomNumber}`);
      setCheckinTarget(null);
      fetchAll();
    } catch (err: any) {
      toast.error('Erro no check-in: ' + (err.message || 'falha'));
    }
  }

  async function handleCheckOut(reservation: Reservation, checkedOutAt: string) {
    try {
      const isoTs = new Date(checkedOutAt).toISOString();

      const { error: e1 } = await supabase.from('reservations').update({
        status: 'CHECKED_OUT',
        checked_out_at: isoTs,
        updated_at: isoTs,
      }).eq('id', reservation.id);
      if (e1) throw e1;

      if (reservation.room_number) {
        const { error: e2 } = await supabase.from('rooms').update({
          status: 'available',
          updated_at: isoTs,
        }).eq('room_number', reservation.room_number);
        if (e2) throw e2;
      }

      await logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Check-out realizado',
        details: `${reservation.guest_name}${reservation.room_number ? ` · UH ${reservation.room_number}` : ''} · Saldo ${formatBRL(folioTotal(reservation.id))}`,
        type: 'update',
      });

      toast.success('Check-out concluído. Emitindo nota de hospedagem.');
      setCheckoutTarget(null);
      openFinalNota(reservation);
      fetchAll();
    } catch (err: any) {
      toast.error('Erro no check-out: ' + (err.message || 'falha'));
    }
  }

  async function ensureWalkInCompany(): Promise<Company> {
    const existing = companies.find(c => c.slug === 'walk-in');
    if (existing) return existing;
    const { data, error } = await supabase
      .from('companies')
      .insert([{ name: 'Walk-in / Particular', slug: 'walk-in', cnpj: '', status: 'active' }])
      .select()
      .single();
    if (error) throw error;
    return data as Company;
  }

  async function handleWalkIn(data: {
    guest_name: string;
    contact_phone?: string;
    fiscal_data?: string;
    company_id: string | null;
    check_in: string;
    check_out: string;
    checked_in_at: string;
    category: string;
    tariff: number;
    guests_per_uh: number;
    payment_method: 'BILLED' | 'VIRTUAL_CARD';
    room_number: string;
    cost_center: string;
    billing_obs?: string;
  }) {
    try {
      const companyId = data.company_id ?? (await ensureWalkInCompany()).id;
      const isoTs = new Date(data.checked_in_at).toISOString();
      const nights = Math.max(
        1,
        differenceInCalendarDays(new Date(data.check_out), new Date(data.check_in))
      );
      const totalAmount = nights * data.tariff;
      const reservationCode = `WI-${format(new Date(), 'yyMMdd')}-${Math.floor(Math.random() * 9000 + 1000)}`;

      const { data: newRes, error: eIns } = await supabase
        .from('reservations')
        .insert([{
          guest_name: data.guest_name,
          contact_phone: data.contact_phone || '',
          fiscal_data: data.fiscal_data || null,
          company_id: companyId,
          check_in: data.check_in,
          check_out: data.check_out,
          checked_in_at: isoTs,
          status: 'CHECKED_IN',
          room_number: data.room_number,
          reservation_code: reservationCode,
          cost_center: data.cost_center || 'WALK-IN',
          tariff: data.tariff,
          category: data.category,
          guests_per_uh: data.guests_per_uh,
          iss_tax: 0,
          service_tax: 0,
          payment_method: data.payment_method,
          billing_obs: data.billing_obs || null,
          total_amount: totalAmount,
          requested_by: profile.id,
        }])
        .select()
        .single();
      if (eIns) throw eIns;

      const { error: eRoom } = await supabase
        .from('rooms')
        .update({ status: 'occupied', updated_at: isoTs })
        .eq('room_number', data.room_number);
      if (eRoom) throw eRoom;

      const charges: any[] = [];
      for (let i = 0; i < nights; i++) {
        const d = new Date(data.check_in);
        d.setDate(d.getDate() + i);
        charges.push({
          reservation_id: newRes.id,
          room_number: data.room_number,
          charge_date: d.toISOString().slice(0, 10),
          description: `Diária ${format(d, 'dd/MM/yyyy')}`,
          quantity: 1,
          unit_value: data.tariff,
          charge_type: 'diaria',
          posted_by: profile.id,
        });
      }
      if (charges.length > 0) {
        const { error: eCh } = await supabase.from('folio_charges').insert(charges);
        if (eCh) throw eCh;
      }

      await logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Walk-in (passante) realizado',
        details: `${data.guest_name} · UH ${data.room_number} · ${nights} diária(s) · ${formatBRL(totalAmount)}`,
        type: 'create',
      });

      toast.success(`Walk-in registrado · UH ${data.room_number}`);
      setWalkInOpen(false);
      setActiveTab('contas');
      fetchAll();
    } catch (err: any) {
      toast.error('Erro no walk-in: ' + (err.message || 'falha'));
    }
  }

  async function reopenAccount(reservation: Reservation, reason: string) {
    try {
      const { error: e1 } = await supabase.from('reservations').update({
        status: 'CHECKED_IN',
        checked_out_at: null,
        updated_at: new Date().toISOString(),
      }).eq('id', reservation.id);
      if (e1) throw e1;

      if (reservation.room_number && !VIRTUAL_ROOM_NUMBERS.has(reservation.room_number)) {
        await supabase.from('rooms').update({
          status: 'occupied',
          updated_at: new Date().toISOString(),
        }).eq('room_number', reservation.room_number);
      }

      await logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Reabertura de conta',
        details: `${reservation.guest_name}${reservation.room_number ? ` · UH ${reservation.room_number}` : ''} · Motivo: ${reason || '—'}`,
        type: 'update',
      });

      toast.success('Conta reaberta. Ajuste os lançamentos e feche novamente.');
      await fetchAll();
    } catch (err: any) {
      toast.error('Erro ao reabrir conta: ' + (err.message || 'falha'));
    }
  }

  async function transferRoom(reservation: Reservation, newRoomNumber: string, reason: string) {
    try {
      const oldRoom = reservation.room_number;
      if (!newRoomNumber || newRoomNumber === oldRoom) {
        toast.error('Selecione uma UH diferente da atual.');
        return;
      }
      const isoTs = new Date().toISOString();

      const { error: e1 } = await supabase.from('reservations').update({
        room_number: newRoomNumber,
        updated_at: isoTs,
      }).eq('id', reservation.id);
      if (e1) throw e1;

      if (oldRoom && !VIRTUAL_ROOM_NUMBERS.has(oldRoom)) {
        await supabase.from('rooms').update({ status: 'available', updated_at: isoTs }).eq('room_number', oldRoom);
      }
      if (!VIRTUAL_ROOM_NUMBERS.has(newRoomNumber)) {
        await supabase.from('rooms').update({ status: 'occupied', updated_at: isoTs }).eq('room_number', newRoomNumber);
      }

      await logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Transferência de UH',
        details: `${reservation.guest_name} · ${oldRoom || '—'} → ${newRoomNumber} · Motivo: ${reason || '—'}`,
        type: 'update',
      });

      toast.success(`Hóspede transferido para UH ${newRoomNumber}.`);
      await fetchAll();
    } catch (err: any) {
      toast.error('Erro ao transferir UH: ' + (err.message || 'falha'));
    }
  }

  async function transferCharges(chargeIds: string[], targetReservationId: string, reason: string) {
    try {
      if (chargeIds.length === 0) { toast.error('Selecione pelo menos um lançamento.'); return; }
      const target = reservations.find(r => r.id === targetReservationId);
      if (!target) { toast.error('Reserva destino inválida.'); return; }

      const { error } = await supabase
        .from('folio_charges')
        .update({ reservation_id: targetReservationId, room_number: target.room_number ?? null })
        .in('id', chargeIds);
      if (error) throw error;

      await logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Transferência de lançamentos',
        details: `${chargeIds.length} lançamento(s) → ${target.guest_name}${target.room_number ? ` (UH ${target.room_number})` : ''} · Motivo: ${reason || '—'}`,
        type: 'update',
      });

      toast.success(`${chargeIds.length} lançamento(s) transferido(s).`);
      await fetchAll();
    } catch (err: any) {
      toast.error('Erro ao transferir lançamentos: ' + (err.message || 'falha'));
    }
  }

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel('checkinout-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'folio_charges' }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchAll() {
    setLoading(true);
    const [resRes, compRes, roomRes, chRes] = await Promise.all([
      supabase.from('reservations').select('*').order('check_in', { ascending: true }),
      supabase.from('companies').select('*'),
      supabase.from('rooms').select('*').order('room_number'),
      supabase.from('folio_charges').select('*').order('charge_date', { ascending: true }),
    ]);
    if (resRes.data) setReservations(resRes.data as Reservation[]);
    if (compRes.data) setCompanies(compRes.data as Company[]);
    if (roomRes.data) setRooms(roomRes.data as Room[]);
    if (chRes.data) setAllCharges(chRes.data as FolioCharge[]);
    setLoading(false);
  }

  const companyName = (id: string) => companies.find(c => c.id === id)?.name || '—';

  const isSystemReservation = (r: Reservation) => SYSTEM_RESERVATION_CODES.has(r.reservation_code || '');

  const filteredByStatus = {
    checkin: reservations.filter(r => r.status === 'CONFIRMED' && !isSystemReservation(r)),
    contas: reservations.filter(r => r.status === 'CHECKED_IN' && !isSystemReservation(r)),
    historico: reservations.filter(r => r.status === 'CHECKED_OUT' && !isSystemReservation(r)),
  };

  const systemReservations = reservations.filter(isSystemReservation);
  const ccReservation = systemReservations.find(r => r.reservation_code === 'SYS-CC') || null;
  const admReservation = systemReservations.find(r => r.reservation_code === 'SYS-ADM') || null;
  const physicalRooms = rooms.filter(r => !r.is_virtual);

  const filterBySearch = (list: Reservation[]) => {
    if (!searchTerm) return list;
    const t = searchTerm.toLowerCase();
    return list.filter(r =>
      r.guest_name?.toLowerCase().includes(t) ||
      r.reservation_code?.toLowerCase().includes(t) ||
      r.room_number?.toLowerCase().includes(t) ||
      companyName(r.company_id).toLowerCase().includes(t)
    );
  };

  const listTabs = ['checkin', 'contas', 'historico'] as const;
  const isListTab = (listTabs as readonly string[]).includes(activeTab);
  const visibleList = isListTab
    ? filterBySearch(filteredByStatus[activeTab as 'checkin' | 'contas' | 'historico'])
    : [];

  const tabs = [
    { id: 'checkin' as const,        label: 'Check-in',       icon: LogIn,     count: filteredByStatus.checkin.length },
    { id: 'contas' as const,         label: 'Contas Abertas', icon: Receipt,   count: filteredByStatus.contas.length },
    { id: 'historico' as const,      label: 'Histórico',      icon: LogOut,    count: filteredByStatus.historico.length },
    { id: 'configuracoes' as const,  label: 'Configurações UH', icon: Settings, count: null as number | null },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">Check-in / Check-out</h2>
          <p className="text-sm text-neutral-500">Gerencie o fluxo de entrada, contas abertas e fechamento de hóspedes.</p>
        </div>
        <button
          onClick={() => setWalkInOpen(true)}
          className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-amber-600 shadow-lg shadow-amber-500/20"
        >
          <UserPlus className="w-4 h-4" />
          Walk-in / Passante
        </button>
      </div>

      <div className="flex gap-1 p-1 bg-neutral-100 rounded-xl w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === tab.id ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.count !== null && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-neutral-200 text-[10px] font-bold">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {isListTab && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Buscar por hóspede, empresa, quarto ou código..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
          />
        </div>
      )}

      {activeTab === 'configuracoes' ? (
        <ConfiguracoesUHSection
          configTab={configTab}
          setConfigTab={setConfigTab}
          ccReservation={ccReservation}
          admReservation={admReservation}
          reservations={reservations}
          systemReservations={systemReservations}
          rooms={physicalRooms}
          allCharges={allCharges}
          companyName={companyName}
          onOpenFolio={setFolioTarget}
          onReopen={reopenAccount}
          onTransferRoom={transferRoom}
          onTransferCharges={transferCharges}
        />
      ) : loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
        </div>
      ) : visibleList.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-neutral-200">
          <p className="text-sm font-bold text-neutral-400 uppercase tracking-widest">
            {activeTab === 'checkin'   && 'Nenhuma reserva aguardando check-in'}
            {activeTab === 'contas'    && 'Nenhuma conta aberta no momento'}
            {activeTab === 'historico' && 'Nenhum check-out realizado'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleList.map(r => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white border border-neutral-200 rounded-2xl p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  <Hash className="w-3.5 h-3.5 text-neutral-400" />
                  <span className="text-xs font-bold text-neutral-500">{r.reservation_code || '—'}</span>
                </div>
                {r.room_number && (
                  <span className="px-2 py-0.5 bg-neutral-900 text-white text-xs font-bold rounded">
                    UH {r.room_number}
                  </span>
                )}
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-neutral-400" />
                  <span className="text-sm font-bold text-neutral-900 truncate">{r.guest_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-neutral-400" />
                  <span className="text-xs text-neutral-600 truncate">{companyName(r.company_id)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-3.5 h-3.5 text-neutral-400" />
                  <span className="text-xs text-neutral-600">
                    {r.check_in  && format(new Date(r.check_in),  'dd/MM', { locale: ptBR })}
                    {' → '}
                    {r.check_out && format(new Date(r.check_out), 'dd/MM', { locale: ptBR })}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-neutral-100 flex gap-2">
                {activeTab === 'checkin' && (
                  <button
                    onClick={() => setCheckinTarget(r)}
                    className="flex-1 flex items-center justify-center gap-2 bg-neutral-900 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-neutral-800"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    Fazer Check-in
                  </button>
                )}
                {activeTab === 'contas' && (
                  <>
                    <button
                      onClick={() => setFolioTarget(r)}
                      className="flex-1 flex items-center justify-center gap-2 bg-white border border-neutral-200 text-neutral-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-neutral-50"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      Folio · {formatBRL(folioTotal(r.id))}
                    </button>
                    <button
                      onClick={() => setCheckoutTarget(r)}
                      className="flex-1 flex items-center justify-center gap-2 bg-neutral-900 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-neutral-800"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Check-out
                    </button>
                  </>
                )}
                {activeTab === 'historico' && (
                  <button
                    onClick={() => openFinalNota(r)}
                    className="flex-1 flex items-center justify-center gap-2 bg-white border border-neutral-200 text-neutral-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-neutral-50"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Ver Nota
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <div className="text-[10px] text-neutral-400 uppercase tracking-widest">
        {physicalRooms.length} UHs cadastradas · {physicalRooms.filter(r => r.status === 'available').length} disponíveis
      </div>

      <AnimatePresence>
        {checkinTarget && (
          <CheckInModal
            reservation={checkinTarget}
            companyName={companyName(checkinTarget.company_id)}
            rooms={physicalRooms}
            onCancel={() => setCheckinTarget(null)}
            onConfirm={handleCheckIn}
          />
        )}
        {folioTarget && (
          <FolioModal
            reservation={folioTarget}
            companyName={companyName(folioTarget.company_id)}
            charges={chargesOf(folioTarget.id)}
            total={folioTotal(folioTarget.id)}
            onClose={() => setFolioTarget(null)}
            onAdd={(data) => addCharge(folioTarget.id, data)}
            onRemove={removeCharge}
            onPrintExtract={() => openExtract(folioTarget)}
          />
        )}
        {checkoutTarget && (
          <CheckOutModal
            reservation={checkoutTarget}
            companyName={companyName(checkoutTarget.company_id)}
            charges={chargesOf(checkoutTarget.id)}
            total={folioTotal(checkoutTarget.id)}
            onCancel={() => setCheckoutTarget(null)}
            onOpenFolio={() => { setCheckoutTarget(null); setFolioTarget(checkoutTarget); }}
            onConfirm={handleCheckOut}
          />
        )}
        {notaTarget && (
          <NotaHospedagemModal
            reservation={notaTarget}
            companyName={companyName(notaTarget.company_id)}
            charges={chargesOf(notaTarget.id)}
            total={folioTotal(notaTarget.id)}
            mode={notaMode}
            onClose={() => setNotaTarget(null)}
          />
        )}
        {walkInOpen && (
          <WalkInModal
            companies={companies}
            rooms={physicalRooms}
            onCancel={() => setWalkInOpen(false)}
            onConfirm={handleWalkIn}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function FolioModal({
  reservation, companyName, charges, total, onClose, onAdd, onRemove, onPrintExtract,
}: {
  reservation: Reservation;
  companyName: string;
  charges: FolioCharge[];
  total: number;
  onClose: () => void;
  onAdd: (data: {
    charge_type: ChargeType;
    description: string;
    quantity: number;
    unit_value: number;
    charge_date: string;
    room_number?: string | null;
  }) => Promise<void> | void;
  onRemove: (charge: FolioCharge) => Promise<void> | void;
  onPrintExtract: () => void;
}) {
  const [chargeType, setChargeType] = useState<ChargeType>('servico');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [unitValue, setUnitValue] = useState<number>(0);
  const [chargeDate, setChargeDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [submitting, setSubmitting] = useState(false);

  const sortedCharges = [...charges].sort((a, b) => {
    if (a.charge_date !== b.charge_date) return a.charge_date.localeCompare(b.charge_date);
    return (a.created_at || '').localeCompare(b.created_at || '');
  });

  async function submit() {
    if (!description.trim()) { toast.error('Descrição é obrigatória.'); return; }
    if (!(quantity > 0)) { toast.error('Quantidade deve ser maior que zero.'); return; }
    if (!(unitValue > 0)) { toast.error('Valor unitário deve ser maior que zero.'); return; }
    setSubmitting(true);
    try {
      await onAdd({
        charge_type: chargeType,
        description: description.trim(),
        quantity,
        unit_value: unitValue,
        charge_date: chargeDate,
        room_number: reservation.room_number ?? null,
      });
      setDescription('');
      setQuantity(1);
      setUnitValue(0);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-4xl max-h-[92vh] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
      >
        <div className="p-6 border-b border-neutral-100 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-neutral-900" />
              <h3 className="text-lg font-bold text-neutral-900">Folio · Nota de Hospedagem</h3>
            </div>
            <p className="text-sm text-neutral-500 mt-1">
              {reservation.guest_name} · {companyName}
              {reservation.room_number ? ` · UH ${reservation.room_number}` : ''}
            </p>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              {format(new Date(reservation.check_in),  'dd/MM/yyyy', { locale: ptBR })}
              {' → '}
              {format(new Date(reservation.check_out), 'dd/MM/yyyy', { locale: ptBR })}
              {reservation.reservation_code ? ` · ${reservation.reservation_code}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-full">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="p-6 border-b border-neutral-100">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                Lançamentos
              </h4>
              <span className="text-[10px] font-bold text-neutral-400">
                {charges.length} registro{charges.length === 1 ? '' : 's'}
              </span>
            </div>

            {sortedCharges.length === 0 ? (
              <div className="text-center py-10 bg-neutral-50 rounded-xl border border-dashed border-neutral-200">
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
                  Nenhum lançamento no folio
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-neutral-200">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50">
                    <tr className="text-left">
                      <th className="px-3 py-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Data</th>
                      <th className="px-3 py-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Tipo</th>
                      <th className="px-3 py-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Descrição</th>
                      <th className="px-3 py-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest text-right">Qtd</th>
                      <th className="px-3 py-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest text-right">Unit.</th>
                      <th className="px-3 py-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest text-right">Total</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCharges.map(ch => {
                      const negative = Number(ch.total_value || 0) < 0;
                      return (
                        <tr key={ch.id} className="border-t border-neutral-100">
                          <td className="px-3 py-2 text-xs text-neutral-600 whitespace-nowrap">
                            {format(new Date(ch.charge_date + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${CHARGE_TYPE_COLORS[ch.charge_type]}`}>
                              {CHARGE_TYPE_LABELS[ch.charge_type]}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-neutral-900">{ch.description}</td>
                          <td className="px-3 py-2 text-xs text-neutral-600 text-right tabular-nums">{ch.quantity}</td>
                          <td className="px-3 py-2 text-xs text-neutral-600 text-right tabular-nums">
                            {formatBRL(ch.unit_value)}
                          </td>
                          <td className={`px-3 py-2 text-xs font-bold text-right tabular-nums ${negative ? 'text-red-600' : 'text-neutral-900'}`}>
                            {formatBRL(ch.total_value)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={() => onRemove(ch)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-600 transition-colors"
                              title="Estornar lançamento"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="p-6 bg-neutral-50">
            <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-3">
              Novo Lançamento
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
              <div className="sm:col-span-2">
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Tipo</label>
                <select
                  value={chargeType}
                  onChange={(e) => setChargeType(e.target.value as ChargeType)}
                  className="mt-1 w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                >
                  {(Object.keys(CHARGE_TYPE_LABELS) as ChargeType[]).map(k => (
                    <option key={k} value={k}>{CHARGE_TYPE_LABELS[k]}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-4">
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Descrição</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex.: Almoço no restaurante, Lavanderia, Room service..."
                  className="mt-1 w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Data</label>
                <input
                  type="date"
                  value={chargeDate}
                  onChange={(e) => setChargeDate(e.target.value)}
                  className="mt-1 w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                />
              </div>
              <div className="sm:col-span-1">
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Qtd</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="mt-1 w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 tabular-nums"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Valor Unit. (R$)</label>
                <div className="relative mt-1">
                  <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={unitValue}
                    onChange={(e) => setUnitValue(Number(e.target.value))}
                    className="w-full pl-8 pr-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 tabular-nums"
                  />
                </div>
              </div>
              <div className="sm:col-span-1 flex items-end">
                <button
                  onClick={submit}
                  disabled={submitting}
                  className="w-full h-[38px] flex items-center justify-center gap-1 bg-neutral-900 text-white rounded-lg text-xs font-bold hover:bg-neutral-800 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Lançar
                </button>
              </div>
            </div>
            {chargeType === 'estorno' && (
              <p className="text-[10px] text-red-600 mt-2 font-bold">
                Estornos são lançados com valor negativo automaticamente.
              </p>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-neutral-100 flex items-center justify-between bg-white">
          <div>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Saldo do folio</p>
            <p className={`text-2xl font-bold tabular-nums ${total < 0 ? 'text-red-600' : 'text-neutral-900'}`}>
              {formatBRL(total)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onPrintExtract}
              disabled={charges.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-neutral-200 text-neutral-700 text-sm font-bold rounded-xl hover:bg-neutral-50 disabled:opacity-50"
              title="Gera o extrato parcial em PDF (use 'Salvar como PDF' no diálogo de impressão)"
            >
              <Printer className="w-4 h-4" />
              Imprimir extrato (PDF)
            </button>
            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-neutral-900 text-white text-sm font-bold rounded-xl shadow-lg shadow-neutral-900/20"
            >
              Fechar
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function CheckInModal({
  reservation, companyName, rooms, onCancel, onConfirm,
}: {
  reservation: Reservation;
  companyName: string;
  rooms: Room[];
  onCancel: () => void;
  onConfirm: (res: Reservation, roomNumber: string, checkedInAt: string) => Promise<void> | void;
}) {
  const desiredCat = normalizeCategory(reservation.category || '');
  const available = rooms.filter(
    r => r.status === 'available' && normalizeCategory(r.category) === desiredCat
  );

  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [checkedInAt, setCheckedInAt] = useState<string>(
    format(new Date(), "yyyy-MM-dd'T'HH:mm")
  );
  const [submitting, setSubmitting] = useState(false);

  const nights = Math.max(
    1,
    differenceInCalendarDays(new Date(reservation.check_out), new Date(reservation.check_in))
  );
  const dailyRate = Number(reservation.tariff || 0);
  const totalForecast = nights * dailyRate;

  const byFloor = available.reduce<Record<number, Room[]>>((acc, r) => {
    (acc[r.floor] ??= []).push(r);
    return acc;
  }, {});

  async function submit() {
    if (!selectedRoom) { toast.error('Selecione um quarto disponível.'); return; }
    setSubmitting(true);
    try { await onConfirm(reservation, selectedRoom, checkedInAt); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-2xl max-h-[90vh] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
      >
        <div className="p-6 border-b border-neutral-100 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-neutral-900">Realizar Check-in</h3>
            <p className="text-sm text-neutral-500">Selecione o quarto e confirme a entrada do hóspede.</p>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-neutral-100 rounded-full">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-5">
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-neutral-400" />
              <span className="text-sm font-bold text-neutral-900">{reservation.guest_name}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-600">
              <Building2 className="w-3.5 h-3.5 text-neutral-400" />
              <span>{companyName}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <p className="text-[9px] font-bold uppercase text-neutral-400 tracking-widest">Entrada prevista</p>
                <p className="text-sm font-bold text-neutral-900">
                  {format(new Date(reservation.check_in), "dd/MM/yyyy", { locale: ptBR })}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase text-neutral-400 tracking-widest">Saída prevista</p>
                <p className="text-sm font-bold text-neutral-900">
                  {format(new Date(reservation.check_out), "dd/MM/yyyy", { locale: ptBR })}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase text-neutral-400 tracking-widest">Categoria</p>
                <p className="text-sm font-bold text-neutral-900">
                  {CATEGORY_LABELS[desiredCat] || reservation.category || '—'}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase text-neutral-400 tracking-widest">Valor previsto</p>
                <p className="text-sm font-bold text-neutral-900">
                  {nights} × R$ {dailyRate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  {' '}
                  <span className="text-[10px] text-neutral-500">(R$ {totalForecast.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})</span>
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
              Data e hora do check-in
            </label>
            <input
              type="datetime-local"
              value={checkedInAt}
              onChange={(e) => setCheckedInAt(e.target.value)}
              className="mt-2 w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                Quartos disponíveis {CATEGORY_LABELS[desiredCat] ? `· ${CATEGORY_LABELS[desiredCat]}` : ''}
              </label>
              <span className="text-[10px] font-bold text-neutral-400">
                {available.length} livre{available.length === 1 ? '' : 's'}
              </span>
            </div>

            {available.length === 0 ? (
              <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                <p className="text-xs text-amber-800">
                  Nenhum quarto disponível nesta categoria.
                  Libere uma UH ou altere a categoria da reserva antes do check-in.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-64 overflow-auto border border-neutral-200 rounded-xl p-3">
                {Object.keys(byFloor)
                  .map(Number)
                  .sort((a, b) => a - b)
                  .map(floor => (
                    <div key={floor}>
                      <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5">
                        {floor}º Andar
                      </p>
                      <div className="grid grid-cols-5 sm:grid-cols-6 gap-1.5">
                        {byFloor[floor]
                          .sort((a, b) => a.room_number.localeCompare(b.room_number))
                          .map(room => {
                            const active = selectedRoom === room.room_number;
                            return (
                              <button
                                key={room.id}
                                onClick={() => setSelectedRoom(room.room_number)}
                                className={`flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold transition-all border ${
                                  active
                                    ? 'bg-neutral-900 text-white border-neutral-900'
                                    : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400'
                                }`}
                              >
                                <Bed className="w-3 h-3" />
                                {room.room_number}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-neutral-100 flex gap-3">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 px-4 py-2 text-sm font-bold text-neutral-600 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={submitting || !selectedRoom}
            className="flex-1 px-4 py-2 bg-neutral-900 text-white text-sm font-bold rounded-xl shadow-lg shadow-neutral-900/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Confirmar Check-in{selectedRoom ? ` · UH ${selectedRoom}` : ''}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function CheckOutModal({
  reservation, companyName, charges, total, onCancel, onOpenFolio, onConfirm,
}: {
  reservation: Reservation;
  companyName: string;
  charges: FolioCharge[];
  total: number;
  onCancel: () => void;
  onOpenFolio: () => void;
  onConfirm: (res: Reservation, checkedOutAt: string) => Promise<void> | void;
}) {
  const [checkedOutAt, setCheckedOutAt] = useState<string>(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [submitting, setSubmitting] = useState(false);

  const nights = Math.max(
    1,
    differenceInCalendarDays(new Date(reservation.check_out), new Date(reservation.check_in))
  );

  const diariasTotal = charges
    .filter(c => c.charge_type === 'diaria')
    .reduce((s, c) => s + Number(c.total_value || 0), 0);
  const extrasTotal = total - diariasTotal;

  async function submit() {
    setSubmitting(true);
    try { await onConfirm(reservation, checkedOutAt); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl flex flex-col"
      >
        <div className="p-6 border-b border-neutral-100 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2">
              <LogOut className="w-5 h-5 text-neutral-900" />
              <h3 className="text-lg font-bold text-neutral-900">Confirmar Check-out</h3>
            </div>
            <p className="text-sm text-neutral-500 mt-1">
              Revise o folio antes de fechar a conta. A UH será liberada.
            </p>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-neutral-100 rounded-full">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-neutral-400" />
              <span className="text-sm font-bold text-neutral-900">{reservation.guest_name}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-600">
              <Building2 className="w-3.5 h-3.5 text-neutral-400" />
              <span>{companyName}</span>
              {reservation.room_number && (
                <span className="ml-auto px-2 py-0.5 bg-neutral-900 text-white text-[10px] font-bold rounded">
                  UH {reservation.room_number}
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div>
                <p className="text-[9px] font-bold uppercase text-neutral-400 tracking-widest">Entrada</p>
                <p className="text-xs font-bold text-neutral-900">
                  {format(new Date(reservation.check_in), 'dd/MM/yyyy', { locale: ptBR })}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase text-neutral-400 tracking-widest">Saída</p>
                <p className="text-xs font-bold text-neutral-900">
                  {format(new Date(reservation.check_out), 'dd/MM/yyyy', { locale: ptBR })}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase text-neutral-400 tracking-widest">Diárias</p>
                <p className="text-xs font-bold text-neutral-900">{nights}</p>
              </div>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
              Data e hora do check-out
            </label>
            <input
              type="datetime-local"
              value={checkedOutAt}
              onChange={(e) => setCheckedOutAt(e.target.value)}
              className="mt-2 w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
            />
          </div>

          <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-xs text-neutral-600">
              <span>Diárias ({charges.filter(c => c.charge_type === 'diaria').length})</span>
              <span className="tabular-nums font-bold">{formatBRL(diariasTotal)}</span>
            </div>
            <div className="flex justify-between text-xs text-neutral-600">
              <span>Extras / serviços ({charges.filter(c => c.charge_type !== 'diaria').length})</span>
              <span className="tabular-nums font-bold">{formatBRL(extrasTotal)}</span>
            </div>
            <div className="pt-2 mt-2 border-t border-neutral-100 flex justify-between items-center">
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Saldo total</span>
              <span className={`text-xl font-bold tabular-nums ${total < 0 ? 'text-red-600' : 'text-neutral-900'}`}>
                {formatBRL(total)}
              </span>
            </div>
          </div>

          <button
            onClick={onOpenFolio}
            className="w-full flex items-center justify-center gap-2 text-xs font-bold text-neutral-600 hover:text-neutral-900 py-2"
          >
            <Receipt className="w-3.5 h-3.5" />
            Revisar lançamentos do folio antes de fechar
          </button>
        </div>

        <div className="p-6 border-t border-neutral-100 flex gap-3 bg-neutral-50">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 px-4 py-2 text-sm font-bold text-neutral-600 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="flex-1 px-4 py-2 bg-neutral-900 text-white text-sm font-bold rounded-xl shadow-lg shadow-neutral-900/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Fechar conta e emitir nota
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function NotaHospedagemModal({
  reservation, companyName, charges, total, onClose, mode = 'final',
}: {
  reservation: Reservation;
  companyName: string;
  charges: FolioCharge[];
  total: number;
  onClose: () => void;
  mode?: 'final' | 'extract';
}) {
  const isExtract = mode === 'extract';
  const docTitle = isExtract ? 'Extrato Parcial' : 'Nota de Hospedagem';
  const docDocLabel = isExtract ? 'Documento informativo · não fiscal' : 'Documento';
  const nights = Math.max(
    1,
    differenceInCalendarDays(new Date(reservation.check_out), new Date(reservation.check_in))
  );

  const sortedCharges = [...charges].sort((a, b) => {
    if (a.charge_date !== b.charge_date) return a.charge_date.localeCompare(b.charge_date);
    return (a.created_at || '').localeCompare(b.created_at || '');
  });

  const diariasTotal = charges
    .filter(c => c.charge_type === 'diaria')
    .reduce((s, c) => s + Number(c.total_value || 0), 0);
  const extrasTotal = total - diariasTotal;

  const handlePrint = () => window.print();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm nota-modal-backdrop">
      <style>{`
        @page {
          size: A4 portrait;
          margin: 0;
        }
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            width: 210mm !important;
            height: auto !important;
            overflow: visible !important;
          }
          body * { visibility: hidden !important; }
          /* Neutraliza transforms/animações de qualquer ancestral (motion, framer, etc.) */
          .nota-modal-backdrop, .nota-modal-backdrop * {
            transform: none !important;
            animation: none !important;
            transition: none !important;
            filter: none !important;
            backdrop-filter: none !important;
            overflow: visible !important;
            max-height: none !important;
            height: auto !important;
            box-shadow: none !important;
          }
          .nota-modal-backdrop {
            position: static !important;
            inset: auto !important;
            background: #fff !important;
            padding: 0 !important;
            display: block !important;
            overflow: visible !important;
          }
          .nota-printable, .nota-printable * { visibility: visible !important; }
          .nota-printable {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            right: auto !important;
            bottom: auto !important;
            width: 210mm !important;
            max-width: 210mm !important;
            min-height: auto !important;
            height: auto !important;
            margin: 0 !important;
            padding: 15mm 14mm !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            overflow: visible !important;
            background: #fff !important;
          }
          .nota-no-print { display: none !important; }
        }
      `}</style>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-3xl max-h-[92vh] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
      >
        <div className="p-4 border-b border-neutral-100 flex justify-between items-center nota-no-print">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-neutral-900" />
            <h3 className="text-sm font-bold text-neutral-900">{docTitle}</h3>
            {isExtract && (
              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded uppercase tracking-widest">
                Parcial
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white text-xs font-bold rounded-lg hover:bg-neutral-800"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir / Salvar PDF
            </button>
            <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-full">
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-neutral-100">
          <div className="nota-printable bg-white mx-auto my-6 shadow-sm" style={{ width: '210mm', minHeight: '297mm', padding: '18mm 16mm', fontFamily: 'Arial, Helvetica, sans-serif', color: '#111' }}>
            <div className="flex justify-between items-start pb-4 border-b-2 border-neutral-900">
              <div>
                <h1 className="text-2xl font-black uppercase tracking-tight text-amber-600">Hotel Royal Macaé</h1>
                <p className="text-[10px] text-neutral-600 mt-1 leading-snug">
                  Rua Dom José Pereira Alves, 170 · Centro · Macaé/RJ<br />
                  CNPJ: 00.000.000/0001-00 · (22) 0000-0000 · contato@hotelroyalmacae.com.br
                </p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-500">{docDocLabel}</p>
                <p className="text-lg font-black text-neutral-900">{docTitle}</p>
                <p className="text-[10px] text-neutral-600 mt-1">
                  Nº {reservation.reservation_code || reservation.id.slice(0, 8).toUpperCase()}
                </p>
                <p className="text-[10px] text-neutral-500">
                  {isExtract ? 'Extraído em ' : 'Emitida em '}
                  {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
                {isExtract && (
                  <p className="text-[9px] text-amber-700 font-bold uppercase tracking-widest mt-1">
                    Saldo em aberto
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Dados do Hóspede</h2>
              <div className="grid grid-cols-2 gap-y-1.5 gap-x-6 text-xs">
                <div className="flex">
                  <span className="w-28 text-neutral-500 font-bold uppercase text-[9px] tracking-widest">Hóspede</span>
                  <span className="font-bold text-neutral-900">{reservation.guest_name}</span>
                </div>
                <div className="flex">
                  <span className="w-28 text-neutral-500 font-bold uppercase text-[9px] tracking-widest">Empresa</span>
                  <span className="text-neutral-900">{companyName}</span>
                </div>
                <div className="flex">
                  <span className="w-28 text-neutral-500 font-bold uppercase text-[9px] tracking-widest">Apto / UH</span>
                  <span className="font-bold text-neutral-900">{reservation.room_number || '—'}</span>
                </div>
                <div className="flex">
                  <span className="w-28 text-neutral-500 font-bold uppercase text-[9px] tracking-widest">Categoria</span>
                  <span className="text-neutral-900">{CATEGORY_LABELS[normalizeCategory(reservation.category || '')] || reservation.category || '—'}</span>
                </div>
                <div className="flex">
                  <span className="w-28 text-neutral-500 font-bold uppercase text-[9px] tracking-widest">Entrada</span>
                  <span className="text-neutral-900">
                    {format(new Date(reservation.check_in), 'dd/MM/yyyy', { locale: ptBR })}
                  </span>
                </div>
                <div className="flex">
                  <span className="w-28 text-neutral-500 font-bold uppercase text-[9px] tracking-widest">Saída</span>
                  <span className="text-neutral-900">
                    {format(new Date(reservation.check_out), 'dd/MM/yyyy', { locale: ptBR })}
                  </span>
                </div>
                <div className="flex">
                  <span className="w-28 text-neutral-500 font-bold uppercase text-[9px] tracking-widest">Diárias</span>
                  <span className="text-neutral-900">{nights}</span>
                </div>
                <div className="flex">
                  <span className="w-28 text-neutral-500 font-bold uppercase text-[9px] tracking-widest">Pagamento</span>
                  <span className="text-neutral-900">{reservation.payment_method === 'VIRTUAL_CARD' ? 'Cartão Virtual' : 'Faturado'}</span>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Extrato de Consumo</h2>
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr className="bg-neutral-900 text-white">
                    <th className="text-left px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest">Data</th>
                    <th className="text-left px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest">Tipo</th>
                    <th className="text-left px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest">Descrição</th>
                    <th className="text-right px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest">Qtd</th>
                    <th className="text-right px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest">Unit.</th>
                    <th className="text-right px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCharges.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-6 text-neutral-400 italic">
                        Sem lançamentos no folio.
                      </td>
                    </tr>
                  ) : sortedCharges.map((ch, idx) => {
                    const negative = Number(ch.total_value || 0) < 0;
                    return (
                      <tr key={ch.id} style={{ borderBottom: '1px solid #e5e5e5', backgroundColor: idx % 2 ? '#fafafa' : 'white' }}>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          {format(new Date(ch.charge_date + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                        </td>
                        <td className="px-2 py-1.5 text-neutral-600">{CHARGE_TYPE_LABELS[ch.charge_type]}</td>
                        <td className="px-2 py-1.5">{ch.description}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{ch.quantity}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatBRL(ch.unit_value)}</td>
                        <td className={`px-2 py-1.5 text-right tabular-nums font-bold ${negative ? 'text-red-600' : ''}`}>
                          {formatBRL(ch.total_value)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex justify-end">
              <div className="w-72 border-t-2 border-neutral-900 pt-3">
                <div className="flex justify-between text-xs py-1">
                  <span className="text-neutral-600">Diárias</span>
                  <span className="tabular-nums font-bold">{formatBRL(diariasTotal)}</span>
                </div>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-neutral-600">Extras / serviços</span>
                  <span className="tabular-nums font-bold">{formatBRL(extrasTotal)}</span>
                </div>
                <div className="flex justify-between items-center py-2 mt-1 border-t border-neutral-300">
                  <span className="text-sm font-bold uppercase tracking-widest">Total Geral</span>
                  <span className={`text-xl font-black tabular-nums ${total < 0 ? 'text-red-600' : 'text-neutral-900'}`}>
                    {formatBRL(total)}
                  </span>
                </div>
              </div>
            </div>

            {reservation.billing_obs && (
              <div className="mt-6 pt-3 border-t border-neutral-200">
                <h3 className="text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Observações</h3>
                <p className="text-[11px] text-neutral-700 whitespace-pre-line">{reservation.billing_obs}</p>
              </div>
            )}

            {!isExtract && (
              <div className="grid grid-cols-2 gap-12 mt-16">
                <div>
                  <div className="border-t border-neutral-900 pt-2">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-500">Assinatura do Hóspede</p>
                    <p className="text-[10px] text-neutral-600 mt-0.5">{reservation.guest_name}</p>
                  </div>
                </div>
                <div>
                  <div className="border-t border-neutral-900 pt-2">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-500">Recepção</p>
                    <p className="text-[10px] text-neutral-600 mt-0.5">Hotel Royal Macaé</p>
                  </div>
                </div>
              </div>
            )}

            {isExtract && (
              <div className="mt-10 p-3 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-800">
                Este documento é um <strong>extrato parcial</strong> do consumo do hóspede até o momento. Não substitui a Nota de Hospedagem emitida no check-out e não possui valor fiscal.
              </div>
            )}

            <div className="mt-10 pt-3 border-t border-neutral-200 text-center">
              <p className="text-[9px] text-neutral-400 uppercase tracking-widest">
                Agradecemos a sua preferência · Hotel Royal Macaé
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-neutral-100 flex justify-end gap-3 bg-white nota-no-print">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-bold text-neutral-600"
          >
            Fechar
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2 bg-neutral-900 text-white text-sm font-bold rounded-xl shadow-lg shadow-neutral-900/20"
          >
            <Printer className="w-4 h-4" />
            {isExtract ? 'Imprimir / Salvar PDF' : 'Imprimir Nota'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function WalkInModal({
  companies, rooms, onCancel, onConfirm,
}: {
  companies: Company[];
  rooms: Room[];
  onCancel: () => void;
  onConfirm: (data: {
    guest_name: string;
    contact_phone?: string;
    fiscal_data?: string;
    company_id: string | null;
    check_in: string;
    check_out: string;
    checked_in_at: string;
    category: string;
    tariff: number;
    guests_per_uh: number;
    payment_method: 'BILLED' | 'VIRTUAL_CARD';
    room_number: string;
    cost_center: string;
    billing_obs?: string;
  }) => Promise<void> | void;
}) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const tomorrow = format(new Date(Date.now() + 86400000), 'yyyy-MM-dd');

  const [guestName, setGuestName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [fiscalData, setFiscalData] = useState('');
  const [companyId, setCompanyId] = useState<string>('');
  const [checkIn, setCheckIn] = useState(today);
  const [checkOut, setCheckOut] = useState(tomorrow);
  const [checkedInAt, setCheckedInAt] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [category, setCategory] = useState<string>('executivo');
  const [tariff, setTariff] = useState<number>(0);
  const [guestsPerUh, setGuestsPerUh] = useState<number>(1);
  const [paymentMethod, setPaymentMethod] = useState<'BILLED' | 'VIRTUAL_CARD'>('VIRTUAL_CARD');
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [costCenter, setCostCenter] = useState<string>('WALK-IN');
  const [billingObs, setBillingObs] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const nights = Math.max(1, differenceInCalendarDays(new Date(checkOut), new Date(checkIn)));
  const forecast = nights * tariff;

  const available = rooms.filter(
    r => r.status === 'available' && normalizeCategory(r.category) === normalizeCategory(category)
  );
  const byFloor = available.reduce<Record<number, Room[]>>((acc, r) => {
    (acc[r.floor] ??= []).push(r);
    return acc;
  }, {});

  async function submit() {
    if (!guestName.trim()) { toast.error('Informe o nome do hóspede.'); return; }
    if (new Date(checkOut) <= new Date(checkIn)) { toast.error('Check-out deve ser depois do check-in.'); return; }
    if (!category) { toast.error('Selecione a categoria.'); return; }
    if (!(tariff > 0)) { toast.error('Informe o valor da diária.'); return; }
    if (!selectedRoom) { toast.error('Selecione um quarto disponível.'); return; }
    setSubmitting(true);
    try {
      await onConfirm({
        guest_name: guestName.trim(),
        contact_phone: contactPhone.trim() || undefined,
        fiscal_data: fiscalData.trim() || undefined,
        company_id: companyId || null,
        check_in: checkIn,
        check_out: checkOut,
        checked_in_at: checkedInAt,
        category,
        tariff,
        guests_per_uh: guestsPerUh,
        payment_method: paymentMethod,
        room_number: selectedRoom,
        cost_center: costCenter.trim() || 'WALK-IN',
        billing_obs: billingObs.trim() || undefined,
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
              <UserPlus className="w-5 h-5 text-amber-600" />
              <h3 className="text-lg font-bold text-neutral-900">Walk-in / Passante</h3>
            </div>
            <p className="text-sm text-neutral-500 mt-1">
              Cadastre um hóspede sem reserva prévia. A UH será ocupada e o folio aberto com as diárias.
            </p>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-neutral-100 rounded-full">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-5">
          <div>
            <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-3">Hóspede</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Nome completo</label>
                <div className="relative mt-1">
                  <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Nome do hóspede"
                    className="w-full pl-8 pr-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                  />
                </div>
              </div>
              <div>
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Telefone</label>
                <div className="relative mt-1">
                  <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                  <input
                    type="text"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="(22) 0000-0000"
                    className="w-full pl-8 pr-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                  />
                </div>
              </div>
              <div>
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">CPF / Documento</label>
                <div className="relative mt-1">
                  <IdCard className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                  <input
                    type="text"
                    value={fiscalData}
                    onChange={(e) => setFiscalData(e.target.value)}
                    placeholder="000.000.000-00"
                    className="w-full pl-8 pr-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">
                  Empresa <span className="text-neutral-400 font-normal normal-case">(opcional — vazio registra como Walk-in / Particular)</span>
                </label>
                <div className="relative mt-1">
                  <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                  <select
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                  >
                    <option value="">Walk-in / Particular</option>
                    {companies
                      .filter(c => c.slug !== 'walk-in')
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-3">Estadia</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Entrada</label>
                <input
                  type="date"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  className="mt-1 w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Saída</label>
                <input
                  type="date"
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className="mt-1 w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                />
              </div>
              <div className="col-span-2">
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Check-in (data e hora)</label>
                <input
                  type="datetime-local"
                  value={checkedInAt}
                  onChange={(e) => setCheckedInAt(e.target.value)}
                  className="mt-1 w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                />
              </div>
              <div className="col-span-2">
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Categoria</label>
                <select
                  value={category}
                  onChange={(e) => { setCategory(e.target.value); setSelectedRoom(''); }}
                  className="mt-1 w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                >
                  <option value="executivo">Executivo</option>
                  <option value="master">Master</option>
                  <option value="suite presidencial">Suíte Presidencial</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Hóspedes</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={guestsPerUh}
                  onChange={(e) => setGuestsPerUh(Number(e.target.value))}
                  className="mt-1 w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 tabular-nums"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Diária (R$)</label>
                <div className="relative mt-1">
                  <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={tariff}
                    onChange={(e) => setTariff(Number(e.target.value))}
                    className="w-full pl-8 pr-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 tabular-nums"
                  />
                </div>
              </div>
              <div className="col-span-2">
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Pagamento</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as 'BILLED' | 'VIRTUAL_CARD')}
                  className="mt-1 w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                >
                  <option value="VIRTUAL_CARD">Cartão / À vista</option>
                  <option value="BILLED">Faturado</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Centro de Custo</label>
                <input
                  type="text"
                  value={costCenter}
                  onChange={(e) => setCostCenter(e.target.value)}
                  className="mt-1 w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                />
              </div>
              <div className="col-span-2 sm:col-span-4">
                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Observações</label>
                <textarea
                  value={billingObs}
                  onChange={(e) => setBillingObs(e.target.value)}
                  rows={2}
                  placeholder="Instruções de cobrança, restrições alimentares, etc."
                  className="mt-1 w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 resize-none"
                />
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between bg-neutral-50 border border-neutral-200 rounded-lg px-4 py-2.5">
              <span className="text-xs text-neutral-600">
                {nights} diária{nights === 1 ? '' : 's'} × {formatBRL(tariff)}
              </span>
              <span className="text-sm font-bold text-neutral-900 tabular-nums">{formatBRL(forecast)}</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                Quartos disponíveis · {CATEGORY_LABELS[normalizeCategory(category)]}
              </h4>
              <span className="text-[10px] font-bold text-neutral-400">
                {available.length} livre{available.length === 1 ? '' : 's'}
              </span>
            </div>

            {available.length === 0 ? (
              <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                <p className="text-xs text-amber-800">
                  Nenhum quarto disponível nesta categoria. Altere a categoria ou libere uma UH.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-48 overflow-auto border border-neutral-200 rounded-xl p-3">
                {Object.keys(byFloor).map(Number).sort((a, b) => a - b).map(floor => (
                  <div key={floor}>
                    <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5">
                      {floor}º Andar
                    </p>
                    <div className="grid grid-cols-5 sm:grid-cols-8 gap-1.5">
                      {byFloor[floor]
                        .sort((a, b) => a.room_number.localeCompare(b.room_number))
                        .map(room => {
                          const active = selectedRoom === room.room_number;
                          return (
                            <button
                              key={room.id}
                              onClick={() => setSelectedRoom(room.room_number)}
                              className={`flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold transition-all border ${
                                active
                                  ? 'bg-neutral-900 text-white border-neutral-900'
                                  : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400'
                              }`}
                            >
                              <Bed className="w-3 h-3" />
                              {room.room_number}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-neutral-100 flex gap-3 bg-neutral-50">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 px-4 py-2 text-sm font-bold text-neutral-600 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={submitting || !selectedRoom}
            className="flex-1 px-4 py-2 bg-amber-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-amber-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Registrar walk-in{selectedRoom ? ` · UH ${selectedRoom}` : ''}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function ConfiguracoesUHSection({
  configTab, setConfigTab,
  ccReservation, admReservation,
  reservations, systemReservations,
  rooms, allCharges,
  companyName,
  onOpenFolio, onReopen, onTransferRoom, onTransferCharges,
}: {
  configTab: ConfigSubTab;
  setConfigTab: (t: ConfigSubTab) => void;
  ccReservation: Reservation | null;
  admReservation: Reservation | null;
  reservations: Reservation[];
  systemReservations: Reservation[];
  rooms: Room[];
  allCharges: FolioCharge[];
  companyName: (id: string) => string;
  onOpenFolio: (r: Reservation) => void;
  onReopen: (r: Reservation, reason: string) => Promise<void> | void;
  onTransferRoom: (r: Reservation, newRoom: string, reason: string) => Promise<void> | void;
  onTransferCharges: (chargeIds: string[], targetId: string, reason: string) => Promise<void> | void;
}) {
  const subTabs = [
    { id: 'especiais' as const,      label: 'Contas Especiais',  icon: Wallet },
    { id: 'reabrir' as const,        label: 'Reabrir Conta',     icon: RotateCcw },
    { id: 'transfer-uh' as const,    label: 'Transferir UH',     icon: ArrowRightLeft },
    { id: 'transfer-lanc' as const,  label: 'Transferir Lanç.',  icon: Briefcase },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1 p-1 bg-white border border-neutral-200 rounded-xl w-fit">
        {subTabs.map(t => (
          <button
            key={t.id}
            onClick={() => setConfigTab(t.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              configTab === t.id ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {configTab === 'especiais' && (
        <ContasEspeciaisPanel
          ccReservation={ccReservation}
          admReservation={admReservation}
          allCharges={allCharges}
          onOpenFolio={onOpenFolio}
        />
      )}
      {configTab === 'reabrir' && (
        <ReabrirContaPanel
          reservations={reservations}
          companyName={companyName}
          onReopen={onReopen}
        />
      )}
      {configTab === 'transfer-uh' && (
        <TransferirUHPanel
          reservations={reservations}
          rooms={rooms}
          companyName={companyName}
          onTransfer={onTransferRoom}
        />
      )}
      {configTab === 'transfer-lanc' && (
        <TransferirLancamentosPanel
          reservations={reservations}
          systemReservations={systemReservations}
          allCharges={allCharges}
          companyName={companyName}
          onTransfer={onTransferCharges}
        />
      )}
    </div>
  );
}

function ContasEspeciaisPanel({
  ccReservation, admReservation, allCharges, onOpenFolio,
}: {
  ccReservation: Reservation | null;
  admReservation: Reservation | null;
  allCharges: FolioCharge[];
  onOpenFolio: (r: Reservation) => void;
}) {
  const cards: Array<{ reservation: Reservation | null; label: string; code: string; description: string; color: string }> = [
    {
      reservation: ccReservation,
      label: 'Conta Corrente (CC)',
      code: 'CC',
      description: 'UH virtual para lançamentos avulsos, consumo interno ou cobranças que não estão atreladas a um hóspede específico. Não aparece no histórico de ocupação.',
      color: 'from-emerald-500 to-emerald-600',
    },
    {
      reservation: admReservation,
      label: 'Administrativa (ADM)',
      code: 'ADM',
      description: 'UH virtual para lançamentos administrativos, diárias de cortesia, colaboradores e ajustes contábeis. Não aparece no histórico de ocupação.',
      color: 'from-indigo-500 to-indigo-600',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {cards.map(card => {
        const charges = card.reservation ? allCharges.filter(c => c.reservation_id === card.reservation!.id) : [];
        const total = charges.reduce((s, c) => s + Number(c.total_value || 0), 0);
        return (
          <div key={card.code} className="bg-white border border-neutral-200 rounded-2xl p-5 flex flex-col">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center text-white font-bold text-sm mb-3`}>
              {card.code}
            </div>
            <h4 className="text-sm font-bold text-neutral-900">{card.label}</h4>
            <p className="text-xs text-neutral-500 mt-1 flex-1">{card.description}</p>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Saldo</p>
                <p className={`text-lg font-bold tabular-nums ${total < 0 ? 'text-red-600' : 'text-neutral-900'}`}>
                  R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] text-neutral-400 mt-0.5">
                  {charges.length} lançamento{charges.length === 1 ? '' : 's'}
                </p>
              </div>
              <button
                onClick={() => card.reservation && onOpenFolio(card.reservation)}
                disabled={!card.reservation}
                className="flex items-center gap-2 bg-neutral-900 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-neutral-800 disabled:opacity-50"
              >
                <Receipt className="w-3.5 h-3.5" />
                Abrir folio
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReabrirContaPanel({
  reservations, companyName, onReopen,
}: {
  reservations: Reservation[];
  companyName: (id: string) => string;
  onReopen: (r: Reservation, reason: string) => Promise<void> | void;
}) {
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<Reservation | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const checkedOut = reservations
    .filter(r => r.status === 'CHECKED_OUT')
    .sort((a, b) => (b.check_out || '').localeCompare(a.check_out || ''));

  const filtered = search.trim()
    ? checkedOut.filter(r => {
        const t = search.toLowerCase();
        return (
          r.guest_name?.toLowerCase().includes(t) ||
          r.reservation_code?.toLowerCase().includes(t) ||
          r.room_number?.toLowerCase().includes(t) ||
          companyName(r.company_id).toLowerCase().includes(t)
        );
      })
    : checkedOut.slice(0, 20);

  async function confirm() {
    if (!target) return;
    if (!reason.trim()) { toast.error('Informe o motivo da reabertura.'); return; }
    setSubmitting(true);
    try {
      await onReopen(target, reason.trim());
      setTarget(null);
      setReason('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-2xl p-5">
      <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl mb-4">
        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-800">
          A reabertura de conta é usada para corrigir lançamentos errados depois do check-out.
          A reserva volta para <b>Contas Abertas</b> e a UH é marcada como ocupada novamente.
          Faça um novo check-out quando terminar os ajustes.
        </p>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar hóspede, código, UH ou empresa..."
          className="w-full pl-10 pr-4 py-2 bg-white border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Nenhum check-out encontrado</p>
        </div>
      ) : (
        <div className="border border-neutral-200 rounded-xl divide-y divide-neutral-100 max-h-80 overflow-auto">
          {filtered.map(r => (
            <button
              key={r.id}
              onClick={() => setTarget(r)}
              className={`w-full text-left px-4 py-3 hover:bg-neutral-50 transition-colors ${target?.id === r.id ? 'bg-neutral-100' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-neutral-900 truncate">{r.guest_name}</p>
                  <p className="text-[11px] text-neutral-500 truncate">
                    {r.reservation_code} · {companyName(r.company_id)}
                    {r.room_number ? ` · UH ${r.room_number}` : ''}
                  </p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-[10px] text-neutral-500">Saída</p>
                  <p className="text-[11px] font-bold text-neutral-700">
                    {r.check_out && format(new Date(r.check_out), 'dd/MM/yyyy', { locale: ptBR })}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {target && (
        <div className="mt-4 p-4 bg-neutral-50 border border-neutral-200 rounded-xl space-y-3">
          <div>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Reabrir conta</p>
            <p className="text-sm font-bold text-neutral-900">{target.guest_name}</p>
            <p className="text-[11px] text-neutral-500">
              {target.reservation_code}{target.room_number ? ` · UH ${target.room_number}` : ''}
            </p>
          </div>
          <div>
            <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Motivo da reabertura</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              placeholder="Ex.: Ajuste de consumo não lançado / Correção de estorno / ..."
              className="mt-1 w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 resize-none"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setTarget(null); setReason(''); }}
              disabled={submitting}
              className="px-4 py-2 text-sm font-bold text-neutral-600"
            >
              Cancelar
            </button>
            <button
              onClick={confirm}
              disabled={submitting}
              className="px-5 py-2 bg-neutral-900 text-white text-sm font-bold rounded-xl shadow-lg shadow-neutral-900/20 disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              Reabrir conta
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TransferirUHPanel({
  reservations, rooms, companyName, onTransfer,
}: {
  reservations: Reservation[];
  rooms: Room[];
  companyName: (id: string) => string;
  onTransfer: (r: Reservation, newRoom: string, reason: string) => Promise<void> | void;
}) {
  const active = reservations.filter(r => r.status === 'CHECKED_IN' && !SYSTEM_RESERVATION_CODES.has(r.reservation_code || ''));
  const [sourceId, setSourceId] = useState<string>('');
  const [newRoom, setNewRoom] = useState<string>('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const source = active.find(r => r.id === sourceId) || null;
  const desiredCat = source ? normalizeCategory(source.category || '') : '';
  const available = rooms.filter(
    r => (r.status === 'available' || r.room_number === source?.room_number) &&
      (desiredCat ? normalizeCategory(r.category) === desiredCat : true)
  );

  async function confirm() {
    if (!source) { toast.error('Selecione a reserva.'); return; }
    if (!newRoom) { toast.error('Selecione a nova UH.'); return; }
    setSubmitting(true);
    try {
      await onTransfer(source, newRoom, reason.trim());
      setSourceId('');
      setNewRoom('');
      setReason('');
    } finally {
      setSubmitting(false);
    }
  }

  const byFloor = available.reduce<Record<number, Room[]>>((acc, r) => {
    (acc[r.floor] ??= []).push(r); return acc;
  }, {});

  return (
    <div className="bg-white border border-neutral-200 rounded-2xl p-5 space-y-4">
      <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
        <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-blue-800">
          Transferência de UH move o hóspede para outra UH da <b>mesma categoria</b>. A UH original é liberada e a nova marcada como ocupada. Todos os lançamentos existentes continuam no folio.
        </p>
      </div>

      <div>
        <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Reserva atual (CHECKED_IN)</label>
        <select
          value={sourceId}
          onChange={e => { setSourceId(e.target.value); setNewRoom(''); }}
          className="mt-1 w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
        >
          <option value="">Selecione o hóspede...</option>
          {active.map(r => (
            <option key={r.id} value={r.id}>
              {r.guest_name} · UH {r.room_number || '—'} · {companyName(r.company_id)}
            </option>
          ))}
        </select>
      </div>

      {source && (
        <>
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">UH atual</p>
              <p className="text-sm font-bold text-neutral-900">{source.room_number || '—'}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Categoria</p>
              <p className="text-sm font-bold text-neutral-900">{CATEGORY_LABELS[desiredCat] || source.category || '—'}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Código</p>
              <p className="text-sm font-bold text-neutral-900">{source.reservation_code}</p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                Nova UH {CATEGORY_LABELS[desiredCat] ? `· ${CATEGORY_LABELS[desiredCat]}` : ''}
              </label>
              <span className="text-[10px] font-bold text-neutral-400">
                {available.length} opção{available.length === 1 ? '' : 'es'}
              </span>
            </div>
            {available.length === 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                Nenhuma UH disponível nesta categoria.
              </div>
            ) : (
              <div className="space-y-3 max-h-56 overflow-auto border border-neutral-200 rounded-xl p-3">
                {Object.keys(byFloor).map(Number).sort((a, b) => a - b).map(floor => (
                  <div key={floor}>
                    <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5">{floor}º Andar</p>
                    <div className="grid grid-cols-5 sm:grid-cols-8 gap-1.5">
                      {byFloor[floor]
                        .sort((a, b) => a.room_number.localeCompare(b.room_number))
                        .map(room => {
                          const active = newRoom === room.room_number;
                          const isCurrent = room.room_number === source.room_number;
                          return (
                            <button
                              key={room.id}
                              onClick={() => !isCurrent && setNewRoom(room.room_number)}
                              disabled={isCurrent}
                              className={`flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold border transition-all ${
                                active
                                  ? 'bg-neutral-900 text-white border-neutral-900'
                                  : isCurrent
                                    ? 'bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed'
                                    : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400'
                              }`}
                            >
                              <Bed className="w-3 h-3" />
                              {room.room_number}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Motivo / Observação</label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Ex.: Ar-condicionado com defeito / Solicitação do hóspede / ..."
              className="mt-1 w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={confirm}
              disabled={submitting || !newRoom}
              className="px-5 py-2 bg-neutral-900 text-white text-sm font-bold rounded-xl shadow-lg shadow-neutral-900/20 disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
              Transferir{newRoom ? ` → UH ${newRoom}` : ''}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function TransferirLancamentosPanel({
  reservations, systemReservations, allCharges, companyName, onTransfer,
}: {
  reservations: Reservation[];
  systemReservations: Reservation[];
  allCharges: FolioCharge[];
  companyName: (id: string) => string;
  onTransfer: (chargeIds: string[], targetId: string, reason: string) => Promise<void> | void;
}) {
  const openReservations = reservations.filter(r => r.status === 'CHECKED_IN' && !SYSTEM_RESERVATION_CODES.has(r.reservation_code || ''));
  const [sourceId, setSourceId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const source = reservations.find(r => r.id === sourceId) || null;
  const target = reservations.find(r => r.id === targetId) || null;
  const sourceCharges = source ? allCharges.filter(c => c.reservation_id === source.id) : [];

  // Valid sources: any active/system reservation
  const sourceOptions = [...openReservations, ...systemReservations];
  // Valid targets: everyone except the source
  const targetOptions = sourceOptions.filter(r => r.id !== sourceId);

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function confirm() {
    if (!source) { toast.error('Selecione a reserva de origem.'); return; }
    if (!target) { toast.error('Selecione a reserva de destino.'); return; }
    if (selected.size === 0) { toast.error('Selecione pelo menos um lançamento.'); return; }
    if (!reason.trim()) { toast.error('Informe o motivo da transferência.'); return; }
    setSubmitting(true);
    try {
      await onTransfer(Array.from(selected), target.id, reason.trim());
      setSelected(new Set());
      setReason('');
    } finally {
      setSubmitting(false);
    }
  }

  const labelForRes = (r: Reservation) => {
    if (SYSTEM_RESERVATION_CODES.has(r.reservation_code || '')) {
      return `${r.guest_name} (${r.room_number})`;
    }
    return `${r.guest_name} · UH ${r.room_number || '—'} · ${companyName(r.company_id)}`;
  };

  return (
    <div className="bg-white border border-neutral-200 rounded-2xl p-5 space-y-4">
      <div className="flex items-start gap-3 p-3 bg-purple-50 border border-purple-200 rounded-xl">
        <AlertCircle className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-purple-800">
          Transfere lançamentos específicos do folio de uma reserva para outra (inclui CC e ADM). Útil para corrigir cobranças que foram parar no folio errado ou para mover consumo para a Conta Corrente.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Folio de origem</label>
          <select
            value={sourceId}
            onChange={e => { setSourceId(e.target.value); setSelected(new Set()); }}
            className="mt-1 w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
          >
            <option value="">Selecione...</option>
            {sourceOptions.map(r => (
              <option key={r.id} value={r.id}>{labelForRes(r)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Folio de destino</label>
          <select
            value={targetId}
            onChange={e => setTargetId(e.target.value)}
            disabled={!sourceId}
            className="mt-1 w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 disabled:opacity-50"
          >
            <option value="">Selecione...</option>
            {targetOptions.map(r => (
              <option key={r.id} value={r.id}>{labelForRes(r)}</option>
            ))}
          </select>
        </div>
      </div>

      {source && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
              Lançamentos de {source.guest_name}
            </h4>
            <span className="text-[10px] font-bold text-neutral-400">
              {selected.size} de {sourceCharges.length} selecionado{selected.size === 1 ? '' : 's'}
            </span>
          </div>
          {sourceCharges.length === 0 ? (
            <div className="text-center py-8 bg-neutral-50 rounded-xl border border-dashed border-neutral-200">
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Sem lançamentos no folio</p>
            </div>
          ) : (
            <div className="border border-neutral-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 sticky top-0">
                  <tr className="text-left">
                    <th className="px-3 py-2 w-10"></th>
                    <th className="px-3 py-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Data</th>
                    <th className="px-3 py-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Tipo</th>
                    <th className="px-3 py-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Descrição</th>
                    <th className="px-3 py-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceCharges.map(ch => {
                    const isSelected = selected.has(ch.id);
                    return (
                      <tr
                        key={ch.id}
                        onClick={() => toggle(ch.id)}
                        className={`border-t border-neutral-100 cursor-pointer ${isSelected ? 'bg-neutral-900/5' : 'hover:bg-neutral-50'}`}
                      >
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={isSelected} readOnly className="w-4 h-4 accent-neutral-900" />
                        </td>
                        <td className="px-3 py-2 text-xs text-neutral-600 whitespace-nowrap">
                          {format(new Date(ch.charge_date + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${CHARGE_TYPE_COLORS[ch.charge_type]}`}>
                            {CHARGE_TYPE_LABELS[ch.charge_type]}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-neutral-900">{ch.description}</td>
                        <td className={`px-3 py-2 text-xs font-bold text-right tabular-nums ${Number(ch.total_value) < 0 ? 'text-red-600' : 'text-neutral-900'}`}>
                          {formatBRL(ch.total_value)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Motivo / Observação</label>
        <input
          type="text"
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Ex.: Consumo lançado no folio errado / Mover para CC / ..."
          className="mt-1 w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={confirm}
          disabled={submitting || !source || !target || selected.size === 0}
          className="px-5 py-2 bg-neutral-900 text-white text-sm font-bold rounded-xl shadow-lg shadow-neutral-900/20 disabled:opacity-50 flex items-center gap-2"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
          Transferir {selected.size || ''} lançamento{selected.size === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  );
}
