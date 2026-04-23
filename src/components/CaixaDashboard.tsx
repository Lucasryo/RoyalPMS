import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../supabase';
import { UserProfile, Reservation } from '../types';
import { BookOpen, Wallet, ClipboardList, Search, Loader2, CalendarDays, Filter, TrendingUp, TrendingDown, Download, Printer, FileText, X as CloseIcon, Bed, Users as UsersIcon, LogIn, LogOut, AlertTriangle } from 'lucide-react';
import { format, subDays, differenceInCalendarDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'motion/react';

type SubTab = 'lancamentos' | 'caixa' | 'rdo';

type ChargeType = 'diaria' | 'servico' | 'alimento' | 'bebida' | 'lavanderia' | 'estorno' | 'outro';

type RoomInfo = {
  id: string;
  room_number: string;
  floor: number;
  category: string;
  status: 'available' | 'occupied' | 'maintenance' | 'reserved';
  is_virtual?: boolean;
};

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

export default function CaixaDashboard({ profile: _profile }: { profile: UserProfile }) {
  const [activeTab, setActiveTab] = useState<SubTab>('lancamentos');
  const [operationDay, setOperationDay] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(true);
  const [allCharges, setAllCharges] = useState<FolioCharge[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel('caixa-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'folio_charges' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchAll() {
    setLoading(true);
    const [chRes, resRes, usersRes, roomsRes] = await Promise.all([
      supabase.from('folio_charges').select('*').order('charge_date', { ascending: true }),
      supabase.from('reservations').select('*'),
      supabase.from('profiles').select('id, name'),
      supabase.from('rooms').select('*'),
    ]);
    if (chRes.data) setAllCharges(chRes.data as FolioCharge[]);
    if (resRes.data) setReservations(resRes.data as Reservation[]);
    if (usersRes.data) setUsers(usersRes.data as Array<{ id: string; name: string }>);
    if (roomsRes.data) setRooms(roomsRes.data as RoomInfo[]);
    setLoading(false);
  }

  const dayCharges = useMemo(
    () => allCharges.filter(c => c.charge_date === operationDay),
    [allCharges, operationDay]
  );

  const tabs: Array<{ id: SubTab; label: string; icon: typeof BookOpen }> = [
    { id: 'lancamentos', label: 'Diário de Lançamentos', icon: BookOpen },
    { id: 'caixa',       label: 'Diário de Caixa',        icon: Wallet },
    { id: 'rdo',         label: 'RDO',                    icon: ClipboardList },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">Caixa</h2>
          <p className="text-sm text-neutral-500">
            Controle financeiro e operacional da hospedagem: diários, movimentos e RDO.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-xl px-3 py-2">
          <CalendarDays className="w-4 h-4 text-neutral-400" />
          <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Dia de operação</label>
          <input
            type="date"
            value={operationDay}
            onChange={e => setOperationDay(e.target.value)}
            className="bg-transparent text-sm font-bold text-neutral-900 focus:outline-none"
          />
          <button
            onClick={() => setOperationDay(format(subDays(new Date(operationDay + 'T12:00:00'), 1), 'yyyy-MM-dd'))}
            className="text-[10px] font-bold text-neutral-400 hover:text-neutral-700"
          >
            ← Anterior
          </button>
          <button
            onClick={() => setOperationDay(format(new Date(), 'yyyy-MM-dd'))}
            className="text-[10px] font-bold text-neutral-400 hover:text-neutral-700"
          >
            Hoje
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 p-1 bg-neutral-100 rounded-xl w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === t.id ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
        </div>
      ) : (
        <>
          {activeTab === 'lancamentos' && (
            <DiarioLancamentosPanel
              operationDay={operationDay}
              charges={dayCharges}
              reservations={reservations}
              users={users}
            />
          )}
          {activeTab === 'caixa' && (
            <DiarioCaixaPanel
              operationDay={operationDay}
              dayCharges={dayCharges}
              allCharges={allCharges}
              reservations={reservations}
            />
          )}
          {activeTab === 'rdo' && (
            <RDOPanel
              operationDay={operationDay}
              dayCharges={dayCharges}
              allCharges={allCharges}
              reservations={reservations}
              rooms={rooms}
            />
          )}
        </>
      )}
    </div>
  );
}

function PlaceholderPanel({ label }: { label: string }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-2xl p-8 text-center">
      <h3 className="text-sm font-bold text-neutral-900">{label}</h3>
      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-2">Em construção</p>
    </div>
  );
}

function DiarioLancamentosPanel({
  operationDay, charges, reservations, users,
}: {
  operationDay: string;
  charges: FolioCharge[];
  reservations: Reservation[];
  users: Array<{ id: string; name: string }>;
}) {
  const [typeFilter, setTypeFilter] = useState<ChargeType | 'all'>('all');
  const [roomFilter, setRoomFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  const reservationById = useMemo(
    () => Object.fromEntries(reservations.map(r => [r.id, r])),
    [reservations]
  );
  const userById = useMemo(
    () => Object.fromEntries(users.map(u => [u.id, u.name])),
    [users]
  );

  const filtered = useMemo(() => {
    const t = searchTerm.toLowerCase();
    return charges
      .filter(c => typeFilter === 'all' || c.charge_type === typeFilter)
      .filter(c => !roomFilter || (c.room_number || '').toLowerCase().includes(roomFilter.toLowerCase()))
      .filter(c => {
        if (!t) return true;
        const res = reservationById[c.reservation_id];
        return (
          c.description?.toLowerCase().includes(t) ||
          (c.room_number || '').toLowerCase().includes(t) ||
          res?.guest_name?.toLowerCase().includes(t) ||
          res?.reservation_code?.toLowerCase().includes(t)
        );
      })
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  }, [charges, typeFilter, roomFilter, searchTerm, reservationById]);

  const byType: Record<string, { count: number; total: number }> = {};
  charges.forEach(c => {
    byType[c.charge_type] ??= { count: 0, total: 0 };
    byType[c.charge_type].count += 1;
    byType[c.charge_type].total += Number(c.total_value || 0);
  });

  const dayTotal = charges.reduce((s, c) => s + Number(c.total_value || 0), 0);
  const dayPositive = charges.filter(c => c.total_value > 0).reduce((s, c) => s + Number(c.total_value), 0);
  const dayNegative = charges.filter(c => c.total_value < 0).reduce((s, c) => s + Number(c.total_value), 0);

  const exportCSV = () => {
    const header = ['Horário', 'UH', 'Hóspede', 'Código', 'Tipo', 'Descrição', 'Qtd', 'Unit', 'Total', 'Lançado por'];
    const rows = filtered.map(c => {
      const res = reservationById[c.reservation_id];
      return [
        format(new Date(c.created_at), 'HH:mm:ss'),
        c.room_number || '—',
        res?.guest_name || '—',
        res?.reservation_code || '—',
        CHARGE_TYPE_LABELS[c.charge_type],
        c.description.replace(/;/g, ','),
        String(c.quantity),
        c.unit_value.toFixed(2).replace('.', ','),
        c.total_value.toFixed(2).replace('.', ','),
        c.posted_by ? (userById[c.posted_by] || '—') : '—',
      ];
    });
    const csv = [header, ...rows].map(r => r.join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diario-lancamentos-${operationDay}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-neutral-200 rounded-2xl p-4">
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Total de lançamentos</p>
          <p className="text-2xl font-bold text-neutral-900 mt-1 tabular-nums">{charges.length}</p>
          <p className="text-[10px] text-neutral-500 mt-0.5">
            {format(new Date(operationDay + 'T12:00:00'), "dd/MM/yyyy 'às' EEEE", { locale: ptBR })}
          </p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-2xl p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Créditos do dia</p>
          </div>
          <p className="text-2xl font-bold text-emerald-700 mt-1 tabular-nums">{formatBRL(dayPositive)}</p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-2xl p-4">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-3.5 h-3.5 text-red-600" />
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Estornos / ajustes</p>
          </div>
          <p className="text-2xl font-bold text-red-700 mt-1 tabular-nums">{formatBRL(dayNegative)}</p>
        </div>
        <div className="bg-neutral-900 text-white rounded-2xl p-4">
          <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Saldo do dia</p>
          <p className={`text-2xl font-bold mt-1 tabular-nums ${dayTotal < 0 ? 'text-red-300' : 'text-white'}`}>
            {formatBRL(dayTotal)}
          </p>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {(['all', ...Object.keys(CHARGE_TYPE_LABELS)] as Array<'all' | ChargeType>).map(k => {
            const label = k === 'all' ? 'Todos' : CHARGE_TYPE_LABELS[k];
            const count = k === 'all' ? charges.length : (byType[k]?.count || 0);
            const total = k === 'all' ? dayTotal : (byType[k]?.total || 0);
            const active = typeFilter === k;
            return (
              <button
                key={k}
                onClick={() => setTypeFilter(k)}
                className={`flex flex-col items-start gap-0.5 px-3 py-2 rounded-xl border text-left transition-all ${
                  active ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400'
                }`}
              >
                <span className="text-[9px] font-bold uppercase tracking-widest opacity-70">{label}</span>
                <span className="text-xs font-bold tabular-nums">
                  {count} · {formatBRL(total)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Buscar por descrição, hóspede ou código..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
            <input
              type="text"
              placeholder="UH"
              value={roomFilter}
              onChange={e => setRoomFilter(e.target.value)}
              className="w-28 pl-9 pr-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
            />
          </div>
          <button
            onClick={exportCSV}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold hover:bg-neutral-50 disabled:opacity-50"
            title="Exportar CSV"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm font-bold text-neutral-400 uppercase tracking-widest">
              Nenhum lançamento encontrado
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr className="text-left">
                  <th className="px-4 py-2.5 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Horário</th>
                  <th className="px-4 py-2.5 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">UH</th>
                  <th className="px-4 py-2.5 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Hóspede / Código</th>
                  <th className="px-4 py-2.5 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Tipo</th>
                  <th className="px-4 py-2.5 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Descrição</th>
                  <th className="px-4 py-2.5 text-[9px] font-bold text-neutral-500 uppercase tracking-widest text-right">Qtd</th>
                  <th className="px-4 py-2.5 text-[9px] font-bold text-neutral-500 uppercase tracking-widest text-right">Unit.</th>
                  <th className="px-4 py-2.5 text-[9px] font-bold text-neutral-500 uppercase tracking-widest text-right">Total</th>
                  <th className="px-4 py-2.5 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Lançado por</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const res = reservationById[c.reservation_id];
                  const isNegative = Number(c.total_value || 0) < 0;
                  const isSystem = res?.reservation_code === 'SYS-CC' || res?.reservation_code === 'SYS-ADM';
                  return (
                    <tr key={c.id} className={`border-b border-neutral-100 hover:bg-neutral-50 ${isSystem ? 'bg-amber-50/40' : ''}`}>
                      <td className="px-4 py-2 text-xs text-neutral-600 tabular-nums whitespace-nowrap">
                        {c.created_at ? format(new Date(c.created_at), 'HH:mm:ss') : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <span className="px-2 py-0.5 bg-neutral-900 text-white text-[10px] font-bold rounded tabular-nums">
                          {c.room_number || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <p className="text-xs font-bold text-neutral-900 truncate max-w-[180px]">
                          {res?.guest_name || '—'}
                        </p>
                        <p className="text-[10px] text-neutral-400 tabular-nums">
                          {res?.reservation_code || '—'}
                        </p>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${CHARGE_TYPE_COLORS[c.charge_type]}`}>
                          {CHARGE_TYPE_LABELS[c.charge_type]}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-neutral-900 max-w-sm">
                        <p className="truncate">{c.description}</p>
                      </td>
                      <td className="px-4 py-2 text-xs text-neutral-600 text-right tabular-nums">{c.quantity}</td>
                      <td className="px-4 py-2 text-xs text-neutral-600 text-right tabular-nums">{formatBRL(c.unit_value)}</td>
                      <td className={`px-4 py-2 text-xs font-bold text-right tabular-nums ${isNegative ? 'text-red-600' : 'text-neutral-900'}`}>
                        {formatBRL(c.total_value)}
                      </td>
                      <td className="px-4 py-2 text-[11px] text-neutral-500 truncate max-w-[140px]">
                        {c.posted_by ? (userById[c.posted_by] || '—') : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-neutral-50 border-t border-neutral-200">
                  <td colSpan={7} className="px-4 py-2.5 text-right text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                    {filtered.length} lançamento{filtered.length === 1 ? '' : 's'} · Total filtrado
                  </td>
                  <td className={`px-4 py-2.5 text-right text-sm font-black tabular-nums ${
                    filtered.reduce((s, c) => s + Number(c.total_value || 0), 0) < 0 ? 'text-red-700' : 'text-neutral-900'
                  }`}>
                    {formatBRL(filtered.reduce((s, c) => s + Number(c.total_value || 0), 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const SYSTEM_CODES = new Set(['SYS-CC', 'SYS-ADM']);

function DiarioCaixaPanel({
  operationDay, dayCharges, allCharges, reservations,
}: {
  operationDay: string;
  dayCharges: FolioCharge[];
  allCharges: FolioCharge[];
  reservations: Reservation[];
}) {
  const reservationById = useMemo(
    () => Object.fromEntries(reservations.map(r => [r.id, r])),
    [reservations]
  );

  const dayISO = operationDay;
  const dayStart = dayISO + 'T00:00:00';
  const dayEnd = dayISO + 'T23:59:59';

  const isBusinessCharge = (c: FolioCharge) => {
    const res = reservationById[c.reservation_id];
    return !res || !SYSTEM_CODES.has(res.reservation_code || '');
  };
  const isSystemCharge = (c: FolioCharge) => {
    const res = reservationById[c.reservation_id];
    return res ? SYSTEM_CODES.has(res.reservation_code || '') : false;
  };

  const businessDayCharges = dayCharges.filter(isBusinessCharge);
  const systemDayCharges = dayCharges.filter(isSystemCharge);

  // Receita bruta do dia (positivos) + estornos (negativos)
  const grossRevenue = businessDayCharges
    .filter(c => c.total_value > 0)
    .reduce((s, c) => s + Number(c.total_value), 0);
  const refunds = businessDayCharges
    .filter(c => c.total_value < 0)
    .reduce((s, c) => s + Number(c.total_value), 0);
  const netRevenue = grossRevenue + refunds;

  const systemMovement = systemDayCharges.reduce((s, c) => s + Number(c.total_value || 0), 0);

  // Check-outs faturados no dia
  const dayCheckouts = reservations.filter(r => {
    if (!r.checked_out_at) return false;
    return r.checked_out_at >= dayStart && r.checked_out_at <= dayEnd;
  });
  const dayCheckoutsTotal = dayCheckouts.reduce((s, r) => s + Number(r.total_amount || 0), 0);

  // Check-ins realizados no dia
  const dayCheckins = reservations.filter(r => {
    if (!r.checked_in_at) return false;
    return r.checked_in_at >= dayStart && r.checked_in_at <= dayEnd;
  });

  // In-house → a faturar. Saldo = soma do folio acumulado até o dia (inclusive)
  const inHouseReservations = reservations.filter(r =>
    r.status === 'CHECKED_IN' && !SYSTEM_CODES.has(r.reservation_code || '')
  );
  const folioBalanceByReservation = useMemo(() => {
    const map: Record<string, number> = {};
    allCharges.forEach(c => {
      if (c.charge_date <= dayISO) {
        map[c.reservation_id] = (map[c.reservation_id] || 0) + Number(c.total_value || 0);
      }
    });
    return map;
  }, [allCharges, dayISO]);
  const totalAFaturar = inHouseReservations.reduce(
    (s, r) => s + (folioBalanceByReservation[r.id] || 0),
    0
  );

  // Movimento por forma de pagamento (baseado em charge_date = dia e na reservation.payment_method)
  const movementByPaymentMethod: Record<string, { count: number; total: number; items: FolioCharge[] }> = {
    BILLED: { count: 0, total: 0, items: [] },
    VIRTUAL_CARD: { count: 0, total: 0, items: [] },
    UNSET: { count: 0, total: 0, items: [] },
  };
  businessDayCharges.forEach(c => {
    const res = reservationById[c.reservation_id];
    const k = res?.payment_method || 'UNSET';
    movementByPaymentMethod[k] ??= { count: 0, total: 0, items: [] };
    movementByPaymentMethod[k].count += 1;
    movementByPaymentMethod[k].total += Number(c.total_value || 0);
    movementByPaymentMethod[k].items.push(c);
  });

  // Receita por natureza
  const natureGroups: Record<string, { label: string; total: number; count: number }> = {
    hospedagem: { label: 'Hospedagem (diárias)', total: 0, count: 0 },
    ab: { label: 'A&B (alimento + bebida)', total: 0, count: 0 },
    lavanderia: { label: 'Lavanderia', total: 0, count: 0 },
    servicos: { label: 'Serviços', total: 0, count: 0 },
    outros: { label: 'Outros', total: 0, count: 0 },
    estornos: { label: 'Estornos', total: 0, count: 0 },
  };
  businessDayCharges.forEach(c => {
    const v = Number(c.total_value || 0);
    const k =
      c.charge_type === 'diaria' ? 'hospedagem' :
      c.charge_type === 'alimento' || c.charge_type === 'bebida' ? 'ab' :
      c.charge_type === 'lavanderia' ? 'lavanderia' :
      c.charge_type === 'servico' ? 'servicos' :
      c.charge_type === 'estorno' ? 'estornos' :
      'outros';
    natureGroups[k].total += v;
    natureGroups[k].count += 1;
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-neutral-200 rounded-2xl p-4">
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Receita bruta do dia</p>
          <p className="text-xl font-bold text-emerald-700 mt-1 tabular-nums">{formatBRL(grossRevenue)}</p>
          <p className="text-[10px] text-neutral-500 mt-0.5">{businessDayCharges.filter(c => c.total_value > 0).length} lançamento(s)</p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-2xl p-4">
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Estornos</p>
          <p className="text-xl font-bold text-red-700 mt-1 tabular-nums">{formatBRL(refunds)}</p>
          <p className="text-[10px] text-neutral-500 mt-0.5">{businessDayCharges.filter(c => c.total_value < 0).length} ajuste(s)</p>
        </div>
        <div className="bg-neutral-900 text-white rounded-2xl p-4">
          <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Receita líquida</p>
          <p className={`text-xl font-bold mt-1 tabular-nums ${netRevenue < 0 ? 'text-red-300' : 'text-white'}`}>
            {formatBRL(netRevenue)}
          </p>
          <p className="text-[10px] text-white/60 mt-0.5">bruta − estornos</p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-2xl p-4">
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">A faturar (in-house)</p>
          <p className="text-xl font-bold text-neutral-900 mt-1 tabular-nums">{formatBRL(totalAFaturar)}</p>
          <p className="text-[10px] text-neutral-500 mt-0.5">{inHouseReservations.length} reserva(s) abertas</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-neutral-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-neutral-900">Movimento por forma de pagamento</h3>
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
              {operationDay && format(new Date(operationDay + 'T12:00:00'), 'dd/MM/yyyy')}
            </span>
          </div>
          <div className="space-y-3">
            <PaymentRow
              label="Faturado (BILLED)"
              description="Empresas conveniadas — vira fatura no checkout"
              color="bg-blue-500"
              count={movementByPaymentMethod.BILLED.count}
              total={movementByPaymentMethod.BILLED.total}
              percent={grossRevenue + Math.abs(refunds) > 0 ? (movementByPaymentMethod.BILLED.total / (grossRevenue + Math.abs(refunds))) * 100 : 0}
            />
            <PaymentRow
              label="Cartão / À vista"
              description="Pagamento imediato no check-in ou check-out"
              color="bg-amber-500"
              count={movementByPaymentMethod.VIRTUAL_CARD.count}
              total={movementByPaymentMethod.VIRTUAL_CARD.total}
              percent={grossRevenue + Math.abs(refunds) > 0 ? (movementByPaymentMethod.VIRTUAL_CARD.total / (grossRevenue + Math.abs(refunds))) * 100 : 0}
            />
            {movementByPaymentMethod.UNSET.count > 0 && (
              <PaymentRow
                label="Sem forma definida"
                description="Lançamentos sem reserva associada"
                color="bg-neutral-400"
                count={movementByPaymentMethod.UNSET.count}
                total={movementByPaymentMethod.UNSET.total}
                percent={0}
              />
            )}
          </div>
          {systemDayCharges.length > 0 && (
            <div className="mt-4 pt-4 border-t border-neutral-100">
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Contas de sistema (CC / ADM)</p>
              <div className="flex items-center justify-between text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <span className="text-amber-800 font-bold">
                  {systemDayCharges.length} lançamento(s) em contas internas
                </span>
                <span className="tabular-nums font-bold text-amber-900">{formatBRL(systemMovement)}</span>
              </div>
              <p className="text-[10px] text-neutral-400 mt-1">Não somam na receita de hospedagem.</p>
            </div>
          )}
        </div>

        <div className="bg-white border border-neutral-200 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-neutral-900 mb-4">Receita por natureza</h3>
          <div className="space-y-2">
            {Object.entries(natureGroups).map(([k, g]) => {
              const pct = grossRevenue > 0 && g.total > 0 ? (g.total / grossRevenue) * 100 : 0;
              const isNegative = g.total < 0;
              return (
                <div key={k}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-neutral-700">
                      <span className="font-bold">{g.label}</span>
                      <span className="text-[10px] text-neutral-400 ml-2">{g.count} lanç.</span>
                    </span>
                    <span className={`tabular-nums font-bold ${isNegative ? 'text-red-700' : 'text-neutral-900'}`}>
                      {formatBRL(g.total)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${isNegative ? 'bg-red-500' : k === 'hospedagem' ? 'bg-neutral-900' : k === 'ab' ? 'bg-amber-500' : 'bg-blue-500'}`}
                      style={{ width: `${Math.min(Math.abs(pct), 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-neutral-200 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">Total bruto</span>
            <span className="text-sm font-black tabular-nums text-neutral-900">{formatBRL(grossRevenue)}</span>
          </div>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-neutral-900">Check-outs realizados no dia</h3>
          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
            {dayCheckouts.length} · Total {formatBRL(dayCheckoutsTotal)}
          </span>
        </div>
        {dayCheckouts.length === 0 ? (
          <div className="text-center py-6 text-xs font-bold text-neutral-400 uppercase tracking-widest">
            Nenhum check-out realizado neste dia
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr className="text-left">
                  <th className="px-3 py-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Hora</th>
                  <th className="px-3 py-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">UH</th>
                  <th className="px-3 py-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Hóspede</th>
                  <th className="px-3 py-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Código</th>
                  <th className="px-3 py-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Pagamento</th>
                  <th className="px-3 py-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {dayCheckouts.map(r => (
                  <tr key={r.id} className="border-b border-neutral-100">
                    <td className="px-3 py-2 text-xs text-neutral-600 tabular-nums whitespace-nowrap">
                      {r.checked_out_at ? format(new Date(r.checked_out_at), 'HH:mm') : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 bg-neutral-900 text-white text-[10px] font-bold rounded tabular-nums">
                        {r.room_number || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs font-bold text-neutral-900">{r.guest_name}</td>
                    <td className="px-3 py-2 text-[10px] text-neutral-400 tabular-nums">{r.reservation_code}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.payment_method === 'BILLED' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
                        {r.payment_method === 'BILLED' ? 'Faturado' : 'Cartão'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs font-bold text-right tabular-nums text-neutral-900">
                      {formatBRL(r.total_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white border border-neutral-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-neutral-900">Check-ins realizados no dia</h3>
          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
            {dayCheckins.length} entradas
          </span>
        </div>
        {dayCheckins.length === 0 ? (
          <div className="text-center py-6 text-xs font-bold text-neutral-400 uppercase tracking-widest">
            Nenhum check-in neste dia
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr className="text-left">
                  <th className="px-3 py-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Hora</th>
                  <th className="px-3 py-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">UH</th>
                  <th className="px-3 py-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Hóspede</th>
                  <th className="px-3 py-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Código</th>
                  <th className="px-3 py-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest text-right">Diária</th>
                </tr>
              </thead>
              <tbody>
                {dayCheckins.map(r => (
                  <tr key={r.id} className="border-b border-neutral-100">
                    <td className="px-3 py-2 text-xs text-neutral-600 tabular-nums whitespace-nowrap">
                      {r.checked_in_at ? format(new Date(r.checked_in_at), 'HH:mm') : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 bg-neutral-900 text-white text-[10px] font-bold rounded tabular-nums">
                        {r.room_number || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs font-bold text-neutral-900">{r.guest_name}</td>
                    <td className="px-3 py-2 text-[10px] text-neutral-400 tabular-nums">{r.reservation_code}</td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums text-neutral-900">
                      {formatBRL(r.tariff)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white border border-neutral-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-neutral-900">Contas em aberto — a faturar no checkout</h3>
          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
            {inHouseReservations.length} · Saldo total {formatBRL(totalAFaturar)}
          </span>
        </div>
        {inHouseReservations.length === 0 ? (
          <div className="text-center py-6 text-xs font-bold text-neutral-400 uppercase tracking-widest">
            Nenhuma conta aberta
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr className="text-left">
                  <th className="px-3 py-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">UH</th>
                  <th className="px-3 py-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Hóspede</th>
                  <th className="px-3 py-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Código</th>
                  <th className="px-3 py-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Estadia</th>
                  <th className="px-3 py-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Pagamento</th>
                  <th className="px-3 py-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {inHouseReservations
                  .sort((a, b) => (folioBalanceByReservation[b.id] || 0) - (folioBalanceByReservation[a.id] || 0))
                  .map(r => {
                    const balance = folioBalanceByReservation[r.id] || 0;
                    return (
                      <tr key={r.id} className="border-b border-neutral-100">
                        <td className="px-3 py-2">
                          <span className="px-2 py-0.5 bg-neutral-900 text-white text-[10px] font-bold rounded tabular-nums">
                            {r.room_number || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs font-bold text-neutral-900">{r.guest_name}</td>
                        <td className="px-3 py-2 text-[10px] text-neutral-400 tabular-nums">{r.reservation_code}</td>
                        <td className="px-3 py-2 text-[11px] text-neutral-600 tabular-nums whitespace-nowrap">
                          {r.check_in && format(new Date(r.check_in), 'dd/MM', { locale: ptBR })}
                          {' → '}
                          {r.check_out && format(new Date(r.check_out), 'dd/MM', { locale: ptBR })}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.payment_method === 'BILLED' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
                            {r.payment_method === 'BILLED' ? 'Faturado' : 'Cartão'}
                          </span>
                        </td>
                        <td className={`px-3 py-2 text-xs font-bold text-right tabular-nums ${balance < 0 ? 'text-red-700' : 'text-neutral-900'}`}>
                          {formatBRL(balance)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function PaymentRow({
  label, description, color, count, total, percent,
}: {
  label: string;
  description: string;
  color: string;
  count: number;
  total: number;
  percent: number;
}) {
  return (
    <div>
      <div className="flex items-start justify-between mb-1.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${color}`} />
            <span className="text-sm font-bold text-neutral-900">{label}</span>
          </div>
          <p className="text-[10px] text-neutral-500 mt-0.5 ml-4">{description}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-sm font-bold tabular-nums ${total < 0 ? 'text-red-700' : 'text-neutral-900'}`}>
            {formatBRL(total)}
          </p>
          <p className="text-[10px] text-neutral-400 tabular-nums">{count} lanç. · {percent.toFixed(0)}%</p>
        </div>
      </div>
      <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(Math.abs(percent), 100)}%` }} />
      </div>
    </div>
  );
}

type RDOMetrics = {
  physicalRooms: number;
  occupiedRooms: number;
  availableRooms: number;
  maintenanceRooms: number;
  occupancyPct: number;
  totalPax: number;
  avgPaxPerUh: number;
  inHouseReservations: Reservation[];
  checkinsToday: Reservation[];
  checkoutsToday: Reservation[];
  noShowsToday: Reservation[];
  cancellationsToday: Reservation[];
  walkInsToday: Reservation[];
  revenueHospedagem: number;
  revenueAB: number;
  revenueLavanderia: number;
  revenueServicos: number;
  revenueOutros: number;
  refunds: number;
  revenueTotal: number;
  revenueNet: number;
  ADR: number;
  RevPAR: number;
  TRevPAR: number;
  revenueCheckedOutToday: number;
  totalInHouseBalance: number;
};

function computeRDOMetrics({
  operationDay, dayCharges, allCharges, reservations, rooms,
}: {
  operationDay: string;
  dayCharges: FolioCharge[];
  allCharges: FolioCharge[];
  reservations: Reservation[];
  rooms: RoomInfo[];
}): RDOMetrics {
  const dayISO = operationDay;
  const dayStart = dayISO + 'T00:00:00';
  const dayEnd = dayISO + 'T23:59:59';

  const physicalRoomsList = rooms.filter(r => !r.is_virtual && r.room_number !== 'CC' && r.room_number !== 'ADM');
  const physicalRooms = physicalRoomsList.length;
  const occupiedRooms = physicalRoomsList.filter(r => r.status === 'occupied').length;
  const availableRooms = physicalRoomsList.filter(r => r.status === 'available').length;
  const maintenanceRooms = physicalRoomsList.filter(r => r.status === 'maintenance').length;
  const occupancyPct = physicalRooms > 0 ? (occupiedRooms / physicalRooms) * 100 : 0;

  const reservationById = Object.fromEntries(reservations.map(r => [r.id, r]));
  const isBusinessRes = (r: Reservation | undefined) =>
    r && !SYSTEM_CODES.has(r.reservation_code || '');

  const inHouseReservations = reservations.filter(r =>
    r.status === 'CHECKED_IN' && isBusinessRes(r)
  );
  const totalPax = inHouseReservations.reduce((s, r) => s + Number(r.guests_per_uh || 0), 0);
  const avgPaxPerUh = occupiedRooms > 0 ? totalPax / occupiedRooms : 0;

  const checkinsToday = reservations.filter(r =>
    isBusinessRes(r) && r.checked_in_at && r.checked_in_at >= dayStart && r.checked_in_at <= dayEnd
  );
  const checkoutsToday = reservations.filter(r =>
    isBusinessRes(r) && r.checked_out_at && r.checked_out_at >= dayStart && r.checked_out_at <= dayEnd
  );
  const noShowsToday = reservations.filter(r =>
    isBusinessRes(r) && r.status === 'NO_SHOW' && r.no_show_at && r.no_show_at >= dayStart && r.no_show_at <= dayEnd
  );
  const cancellationsToday = reservations.filter(r =>
    isBusinessRes(r) && r.status === 'CANCELLED' && r.cancelled_at && r.cancelled_at >= dayStart && r.cancelled_at <= dayEnd
  );
  const walkInsToday = checkinsToday.filter(r => (r.reservation_code || '').startsWith('WI-'));

  // Receitas do dia (só negócios, sem CC/ADM)
  const businessDayCharges = dayCharges.filter(c => {
    const r = reservationById[c.reservation_id];
    return isBusinessRes(r);
  });

  let revenueHospedagem = 0, revenueAB = 0, revenueLavanderia = 0, revenueServicos = 0, revenueOutros = 0, refunds = 0;
  businessDayCharges.forEach(c => {
    const v = Number(c.total_value || 0);
    if (c.charge_type === 'estorno' || v < 0) { refunds += v; return; }
    switch (c.charge_type) {
      case 'diaria': revenueHospedagem += v; break;
      case 'alimento':
      case 'bebida': revenueAB += v; break;
      case 'lavanderia': revenueLavanderia += v; break;
      case 'servico': revenueServicos += v; break;
      default: revenueOutros += v; break;
    }
  });
  const revenueTotal = revenueHospedagem + revenueAB + revenueLavanderia + revenueServicos + revenueOutros;
  const revenueNet = revenueTotal + refunds;

  const ADR = occupiedRooms > 0 ? revenueHospedagem / occupiedRooms : 0;
  const RevPAR = physicalRooms > 0 ? revenueHospedagem / physicalRooms : 0;
  const TRevPAR = physicalRooms > 0 ? revenueTotal / physicalRooms : 0;

  const revenueCheckedOutToday = checkoutsToday.reduce((s, r) => s + Number(r.total_amount || 0), 0);

  // Saldo in-house
  const balanceByRes: Record<string, number> = {};
  allCharges.forEach(c => {
    if (c.charge_date <= dayISO) {
      balanceByRes[c.reservation_id] = (balanceByRes[c.reservation_id] || 0) + Number(c.total_value || 0);
    }
  });
  const totalInHouseBalance = inHouseReservations.reduce((s, r) => s + (balanceByRes[r.id] || 0), 0);

  return {
    physicalRooms, occupiedRooms, availableRooms, maintenanceRooms, occupancyPct,
    totalPax, avgPaxPerUh,
    inHouseReservations, checkinsToday, checkoutsToday, noShowsToday, cancellationsToday, walkInsToday,
    revenueHospedagem, revenueAB, revenueLavanderia, revenueServicos, revenueOutros, refunds,
    revenueTotal, revenueNet,
    ADR, RevPAR, TRevPAR,
    revenueCheckedOutToday, totalInHouseBalance,
  };
}

function RDOPanel({
  operationDay, dayCharges, allCharges, reservations, rooms,
}: {
  operationDay: string;
  dayCharges: FolioCharge[];
  allCharges: FolioCharge[];
  reservations: Reservation[];
  rooms: RoomInfo[];
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [managerNotes, setManagerNotes] = useState('');

  const metrics = useMemo(
    () => computeRDOMetrics({ operationDay, dayCharges, allCharges, reservations, rooms }),
    [operationDay, dayCharges, allCharges, reservations, rooms]
  );

  const pendingToday = reservations.filter(r =>
    (r.status === 'CONFIRMED' || r.status === 'PENDING') &&
    !SYSTEM_CODES.has(r.reservation_code || '') &&
    (r.check_in || '') <= operationDay
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-bold text-neutral-900">Resumo de Operações Diária</h3>
          <p className="text-xs text-neutral-500">
            {format(new Date(operationDay + 'T12:00:00'), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white text-sm font-bold rounded-xl hover:bg-neutral-800 shadow-lg shadow-neutral-900/20"
        >
          <Printer className="w-4 h-4" />
          Gerar RDO (imprimível)
        </button>
      </div>

      {pendingToday.length > 0 && (
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800">
            <b>{pendingToday.length} reserva(s)</b> com check-in pendente até o dia operacional. Faça o check-in, marque como No Show ou cancele antes de encerrar o dia para que o RDO reflita a ocupação correta.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI label="Taxa de ocupação" value={`${metrics.occupancyPct.toFixed(1)}%`} sub={`${metrics.occupiedRooms}/${metrics.physicalRooms} UHs`} tone={metrics.occupancyPct >= 85 ? 'amber' : 'dark'} />
        <KPI label="ADR (Diária média)" value={formatBRL(metrics.ADR)} sub="Receita hosp. / UHs ocupadas" />
        <KPI label="RevPAR" value={formatBRL(metrics.RevPAR)} sub="Receita hosp. / UHs disp." />
        <KPI label="TRevPAR" value={formatBRL(metrics.TRevPAR)} sub="Receita total / UHs disp." />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-neutral-200 rounded-2xl p-5">
          <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-3">Posição de UHs</h4>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat icon={Bed} label="Ocupadas" value={metrics.occupiedRooms} tone="dark" />
            <MiniStat icon={Bed} label="Disponíveis" value={metrics.availableRooms} tone="emerald" />
            <MiniStat icon={Bed} label="Manutenção" value={metrics.maintenanceRooms} tone="neutral" />
            <MiniStat icon={UsersIcon} label="Pax in-house" value={metrics.totalPax} tone="blue" sub={metrics.avgPaxPerUh > 0 ? `${metrics.avgPaxPerUh.toFixed(1)} por UH` : undefined} />
          </div>
        </div>

        <div className="bg-white border border-neutral-200 rounded-2xl p-5">
          <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-3">Movimentação do dia</h4>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat icon={LogIn} label="Check-ins" value={metrics.checkinsToday.length} sub={metrics.walkInsToday.length > 0 ? `${metrics.walkInsToday.length} walk-in` : undefined} tone="emerald" />
            <MiniStat icon={LogOut} label="Check-outs" value={metrics.checkoutsToday.length} sub={formatBRL(metrics.revenueCheckedOutToday)} tone="blue" />
            <MiniStat icon={AlertTriangle} label="No-shows" value={metrics.noShowsToday.length} tone="orange" />
            <MiniStat icon={CloseIcon} label="Cancelamentos" value={metrics.cancellationsToday.length} tone="red" />
          </div>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-2xl p-5">
        <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-3">Receitas do dia</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          <RevenuePill label="Hospedagem" value={metrics.revenueHospedagem} />
          <RevenuePill label="A&B" value={metrics.revenueAB} />
          <RevenuePill label="Lavanderia" value={metrics.revenueLavanderia} />
          <RevenuePill label="Serviços" value={metrics.revenueServicos} />
          <RevenuePill label="Outros" value={metrics.revenueOutros} />
          <RevenuePill label="Estornos" value={metrics.refunds} negative />
        </div>
        <div className="mt-4 pt-3 border-t border-neutral-200 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">Receita líquida do dia</span>
          <span className={`text-lg font-black tabular-nums ${metrics.revenueNet < 0 ? 'text-red-700' : 'text-neutral-900'}`}>
            {formatBRL(metrics.revenueNet)}
          </span>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-2xl p-5">
        <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Observações do gerente (aparecem no RDO impresso)</label>
        <textarea
          value={managerNotes}
          onChange={e => setManagerNotes(e.target.value)}
          rows={3}
          placeholder="Ex.: Grupo de 8 hóspedes da Empresa X previsto para amanhã. Manutenção preventiva na UH 305."
          className="mt-2 w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 resize-none"
        />
      </div>

      {modalOpen && (
        <RDOPrintModal
          operationDay={operationDay}
          metrics={metrics}
          managerNotes={managerNotes}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

function KPI({ label, value, sub, tone = 'white' }: { label: string; value: string; sub?: string; tone?: 'white' | 'dark' | 'amber' }) {
  const cls =
    tone === 'dark' ? 'bg-neutral-900 text-white' :
    tone === 'amber' ? 'bg-amber-500 text-white' :
    'bg-white border border-neutral-200 text-neutral-900';
  const subCls = tone === 'white' ? 'text-neutral-500' : 'text-white/70';
  const labelCls = tone === 'white' ? 'text-neutral-500' : 'text-white/60';
  return (
    <div className={`rounded-2xl p-4 ${cls}`}>
      <p className={`text-[10px] font-bold uppercase tracking-widest ${labelCls}`}>{label}</p>
      <p className="text-2xl font-bold mt-1 tabular-nums">{value}</p>
      {sub && <p className={`text-[10px] mt-0.5 ${subCls}`}>{sub}</p>}
    </div>
  );
}

function MiniStat({
  icon: Icon, label, value, sub, tone = 'dark',
}: {
  icon: any;
  label: string;
  value: number | string;
  sub?: string;
  tone?: 'dark' | 'emerald' | 'blue' | 'orange' | 'red' | 'neutral';
}) {
  const toneCls: Record<string, string> = {
    dark: 'bg-neutral-900 text-white',
    emerald: 'bg-emerald-500 text-white',
    blue: 'bg-blue-500 text-white',
    orange: 'bg-orange-500 text-white',
    red: 'bg-red-500 text-white',
    neutral: 'bg-neutral-200 text-neutral-700',
  };
  return (
    <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-xl border border-neutral-100">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${toneCls[tone]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-500">{label}</p>
        <p className="text-sm font-bold text-neutral-900 tabular-nums">{value}</p>
        {sub && <p className="text-[10px] text-neutral-500 truncate">{sub}</p>}
      </div>
    </div>
  );
}

function RevenuePill({ label, value, negative = false }: { label: string; value: number; negative?: boolean }) {
  const isNeg = negative || value < 0;
  return (
    <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-3">
      <p className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">{label}</p>
      <p className={`text-sm font-bold tabular-nums mt-0.5 ${isNeg ? 'text-red-700' : 'text-neutral-900'}`}>
        {formatBRL(value)}
      </p>
    </div>
  );
}

function RDOPrintModal({
  operationDay, metrics, managerNotes, onClose,
}: {
  operationDay: string;
  metrics: RDOMetrics;
  managerNotes: string;
  onClose: () => void;
}) {
  const handlePrint = () => window.print();

  const dayLabel = format(new Date(operationDay + 'T12:00:00'), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const shortDay = format(new Date(operationDay + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR });

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
            padding: 14mm 13mm !important;
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
            <h3 className="text-sm font-bold text-neutral-900">RDO · Resumo de Operações Diária</h3>
            <span className="px-2 py-0.5 bg-neutral-100 text-neutral-700 text-[10px] font-bold rounded uppercase tracking-widest">
              {shortDay}
            </span>
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
          <div
            className="nota-printable bg-white mx-auto my-6 shadow-sm"
            style={{ width: '210mm', minHeight: '297mm', padding: '16mm 14mm', fontFamily: 'Arial, Helvetica, sans-serif', color: '#111' }}
          >
            {/* Cabeçalho */}
            <div className="flex justify-between items-start pb-3 border-b-2 border-neutral-900">
              <div>
                <h1 className="text-2xl font-black uppercase tracking-tight text-amber-600">Hotel Royal Macaé</h1>
                <p className="text-[10px] text-neutral-600 mt-1 leading-snug">
                  Rua Dom José Pereira Alves, 170 · Centro · Macaé/RJ<br />
                  CNPJ: 00.000.000/0001-00 · (22) 0000-0000 · contato@hotelroyalmacae.com.br
                </p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-500">Documento Operacional</p>
                <p className="text-lg font-black text-neutral-900 leading-tight">RDO</p>
                <p className="text-[10px] text-neutral-600 leading-tight">Resumo de Operações Diária</p>
                <p className="text-[10px] text-neutral-600 mt-1">{dayLabel}</p>
                <p className="text-[10px] text-neutral-500">Emitido em {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
              </div>
            </div>

            {/* Quadro I - Posição Operacional */}
            <Section title="I. Posição Operacional">
              <KeyValueGrid items={[
                { k: 'UHs físicas', v: String(metrics.physicalRooms) },
                { k: 'UHs ocupadas', v: String(metrics.occupiedRooms) },
                { k: 'UHs disponíveis', v: String(metrics.availableRooms) },
                { k: 'UHs em manutenção', v: String(metrics.maintenanceRooms) },
                { k: 'Pax in-house', v: String(metrics.totalPax) },
                { k: 'Taxa de ocupação', v: `${metrics.occupancyPct.toFixed(1)}%`, highlight: true },
              ]} />
            </Section>

            {/* Quadro II - Movimentação */}
            <Section title="II. Movimentação de Hóspedes">
              <KeyValueGrid items={[
                { k: 'Check-ins realizados', v: String(metrics.checkinsToday.length) },
                { k: 'Walk-ins', v: String(metrics.walkInsToday.length) },
                { k: 'Check-outs realizados', v: String(metrics.checkoutsToday.length) },
                { k: 'No-shows', v: String(metrics.noShowsToday.length) },
                { k: 'Cancelamentos', v: String(metrics.cancellationsToday.length) },
                { k: 'Média de pax / UH', v: metrics.avgPaxPerUh.toFixed(2) },
              ]} />
            </Section>

            {/* Quadro III - Indicadores Financeiros */}
            <Section title="III. Indicadores Financeiros (hoteleiros)">
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr className="bg-neutral-900 text-white">
                    <th className="text-left px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest">Indicador</th>
                    <th className="text-left px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest">Fórmula</th>
                    <th className="text-right px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  <IndicatorRow label="ADR (Diária Média)" formula="Receita Hospedagem ÷ UHs ocupadas" value={formatBRL(metrics.ADR)} />
                  <IndicatorRow label="RevPAR" formula="Receita Hospedagem ÷ UHs disponíveis" value={formatBRL(metrics.RevPAR)} />
                  <IndicatorRow label="TRevPAR" formula="Receita Total ÷ UHs disponíveis" value={formatBRL(metrics.TRevPAR)} />
                  <IndicatorRow label="Ocupação" formula="UHs ocupadas ÷ UHs físicas" value={`${metrics.occupancyPct.toFixed(1)}%`} />
                </tbody>
              </table>
            </Section>

            {/* Quadro IV - Receitas */}
            <Section title="IV. Receitas por Natureza">
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr className="bg-neutral-900 text-white">
                    <th className="text-left px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest">Departamento</th>
                    <th className="text-right px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest">Receita</th>
                    <th className="text-right px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest">Part. (%)</th>
                  </tr>
                </thead>
                <tbody>
                  <RevRow label="Hospedagem (diárias)" value={metrics.revenueHospedagem} total={metrics.revenueTotal} />
                  <RevRow label="Alimentos e Bebidas" value={metrics.revenueAB} total={metrics.revenueTotal} />
                  <RevRow label="Lavanderia" value={metrics.revenueLavanderia} total={metrics.revenueTotal} />
                  <RevRow label="Serviços" value={metrics.revenueServicos} total={metrics.revenueTotal} />
                  <RevRow label="Outros" value={metrics.revenueOutros} total={metrics.revenueTotal} />
                  <RevRow label="Estornos / ajustes" value={metrics.refunds} total={metrics.revenueTotal} negative />
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid #171717' }}>
                    <td className="px-2 py-2 text-[11px] font-black uppercase tracking-widest">Receita líquida do dia</td>
                    <td className={`px-2 py-2 text-right text-sm font-black tabular-nums ${metrics.revenueNet < 0 ? 'text-red-700' : 'text-neutral-900'}`} colSpan={2}>
                      {formatBRL(metrics.revenueNet)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </Section>

            {/* Quadro V - Posição do folio */}
            <Section title="V. Posição do Folio">
              <KeyValueGrid items={[
                { k: 'Receita realizada (checkouts)', v: formatBRL(metrics.revenueCheckedOutToday) },
                { k: 'A faturar (in-house)', v: formatBRL(metrics.totalInHouseBalance) },
                { k: 'Reservas abertas (in-house)', v: String(metrics.inHouseReservations.length) },
              ]} />
            </Section>

            {/* Lista de check-ins/outs do dia (condensada) */}
            {(metrics.checkinsToday.length > 0 || metrics.checkoutsToday.length > 0) && (
              <Section title="VI. Detalhamento de Check-ins e Check-outs">
                <div className="grid grid-cols-2 gap-4">
                  <MovimentoList title={`Check-ins (${metrics.checkinsToday.length})`} items={
                    metrics.checkinsToday.slice(0, 15).map(r => ({
                      time: r.checked_in_at ? format(new Date(r.checked_in_at), 'HH:mm') : '—',
                      room: r.room_number || '—',
                      name: r.guest_name,
                      tag: (r.reservation_code || '').startsWith('WI-') ? 'WI' : '',
                    }))
                  } />
                  <MovimentoList title={`Check-outs (${metrics.checkoutsToday.length})`} items={
                    metrics.checkoutsToday.slice(0, 15).map(r => ({
                      time: r.checked_out_at ? format(new Date(r.checked_out_at), 'HH:mm') : '—',
                      room: r.room_number || '—',
                      name: r.guest_name,
                      tag: formatBRL(r.total_amount),
                    }))
                  } />
                </div>
              </Section>
            )}

            {/* Observações */}
            {managerNotes.trim() && (
              <Section title="VII. Observações do Gerente">
                <p className="text-[11px] text-neutral-700 whitespace-pre-line leading-relaxed">{managerNotes.trim()}</p>
              </Section>
            )}

            {/* Assinaturas */}
            <div className="grid grid-cols-3 gap-8 mt-10">
              <div>
                <div className="border-t border-neutral-900 pt-2">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-500">Recepcionista</p>
                </div>
              </div>
              <div>
                <div className="border-t border-neutral-900 pt-2">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-500">Auditor Noturno</p>
                </div>
              </div>
              <div>
                <div className="border-t border-neutral-900 pt-2">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-500">Gerente Operacional</p>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-2 border-t border-neutral-200 text-center">
              <p className="text-[9px] text-neutral-400 uppercase tracking-widest">
                Hotel Royal Macaé · RDO · Documento operacional interno
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-neutral-100 flex justify-end gap-3 bg-white nota-no-print">
          <button onClick={onClose} className="px-5 py-2 text-sm font-bold text-neutral-600">Fechar</button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2 bg-neutral-900 text-white text-sm font-bold rounded-xl shadow-lg shadow-neutral-900/20"
          >
            <Printer className="w-4 h-4" />
            Imprimir RDO
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <h2 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2 pb-1 border-b border-neutral-200">
        {title}
      </h2>
      {children}
    </div>
  );
}

function KeyValueGrid({ items }: { items: Array<{ k: string; v: string; highlight?: boolean }> }) {
  return (
    <div className="grid grid-cols-3 gap-y-1.5 gap-x-6 text-xs">
      {items.map((it, i) => (
        <div key={i} className="flex justify-between items-baseline border-b border-neutral-100 pb-1">
          <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-500">{it.k}</span>
          <span className={`font-bold tabular-nums ${it.highlight ? 'text-amber-600 text-base' : 'text-neutral-900'}`}>
            {it.v}
          </span>
        </div>
      ))}
    </div>
  );
}

function IndicatorRow({ label, formula, value }: { label: string; formula: string; value: string }) {
  return (
    <tr style={{ borderBottom: '1px solid #e5e5e5' }}>
      <td className="px-2 py-1.5 font-bold">{label}</td>
      <td className="px-2 py-1.5 text-neutral-500 text-[10px]">{formula}</td>
      <td className="px-2 py-1.5 text-right tabular-nums font-bold">{value}</td>
    </tr>
  );
}

function RevRow({ label, value, total, negative = false }: { label: string; value: number; total: number; negative?: boolean }) {
  const pct = total > 0 && value > 0 ? (value / total) * 100 : 0;
  const isNeg = negative || value < 0;
  return (
    <tr style={{ borderBottom: '1px solid #e5e5e5' }}>
      <td className="px-2 py-1.5">{label}</td>
      <td className={`px-2 py-1.5 text-right tabular-nums font-bold ${isNeg ? 'text-red-700' : ''}`}>{formatBRL(value)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums text-neutral-500">{isNeg ? '—' : `${pct.toFixed(1)}%`}</td>
    </tr>
  );
}

function MovimentoList({ title, items }: { title: string; items: Array<{ time: string; room: string; name: string; tag?: string }> }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">{title}</p>
      {items.length === 0 ? (
        <p className="text-[10px] text-neutral-400 italic">Nenhum registro</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((it, i) => (
            <li key={i} className="text-[10px] flex items-center gap-2 border-b border-neutral-100 py-0.5">
              <span className="w-10 tabular-nums text-neutral-500">{it.time}</span>
              <span className="w-12 font-bold tabular-nums">{it.room}</span>
              <span className="flex-1 truncate">{it.name}</span>
              {it.tag && <span className="text-neutral-500 tabular-nums">{it.tag}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
