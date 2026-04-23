import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { UserProfile, Reservation } from '../types';
import { BookOpen, Wallet, ClipboardList, Search, Loader2, CalendarDays, Filter, TrendingUp, TrendingDown, Download } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type SubTab = 'lancamentos' | 'caixa' | 'rdo';

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

export default function CaixaDashboard({ profile: _profile }: { profile: UserProfile }) {
  const [activeTab, setActiveTab] = useState<SubTab>('lancamentos');
  const [operationDay, setOperationDay] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(true);
  const [allCharges, setAllCharges] = useState<FolioCharge[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel('caixa-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'folio_charges' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchAll() {
    setLoading(true);
    const [chRes, resRes, usersRes] = await Promise.all([
      supabase.from('folio_charges').select('*').order('charge_date', { ascending: true }),
      supabase.from('reservations').select('*'),
      supabase.from('profiles').select('id, name'),
    ]);
    if (chRes.data) setAllCharges(chRes.data as FolioCharge[]);
    if (resRes.data) setReservations(resRes.data as Reservation[]);
    if (usersRes.data) setUsers(usersRes.data as Array<{ id: string; name: string }>);
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
          {activeTab === 'rdo' && <PlaceholderPanel label="RDO" />}
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
