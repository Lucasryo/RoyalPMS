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
  const [charges, setCharges] = useState<FolioCharge[]>([]);
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
  }, [operationDay]);

  async function fetchAll() {
    setLoading(true);
    const [chRes, resRes, usersRes] = await Promise.all([
      supabase.from('folio_charges').select('*').eq('charge_date', operationDay),
      supabase.from('reservations').select('*'),
      supabase.from('profiles').select('id, name'),
    ]);
    if (chRes.data) setCharges(chRes.data as FolioCharge[]);
    if (resRes.data) setReservations(resRes.data as Reservation[]);
    if (usersRes.data) setUsers(usersRes.data as Array<{ id: string; name: string }>);
    setLoading(false);
  }

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
              charges={charges}
              reservations={reservations}
              users={users}
            />
          )}
          {activeTab === 'caixa' && <PlaceholderPanel label="Diário de Caixa" />}
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
