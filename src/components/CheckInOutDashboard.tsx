import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { UserProfile, Reservation, Company } from '../types';
import { LogIn, LogOut, Receipt, Loader2, Search, User, Hash, Building2, CalendarDays, X as CloseIcon, Bed, Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { format, differenceInCalendarDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { logAudit } from '../lib/audit';

type SubTab = 'checkin' | 'contas' | 'historico';

type Room = {
  id: string;
  room_number: string;
  floor: number;
  category: string;
  status: 'available' | 'occupied' | 'maintenance' | 'reserved';
};

const normalizeCategory = (c: string) =>
  (c || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const CATEGORY_LABELS: Record<string, string> = {
  executivo: 'Executivo',
  master: 'Master',
  'suite presidencial': 'Suíte Presidencial',
};

export default function CheckInOutDashboard({ profile }: { profile: UserProfile }) {
  const [activeTab, setActiveTab] = useState<SubTab>('checkin');
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [checkinTarget, setCheckinTarget] = useState<Reservation | null>(null);

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

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel('checkinout-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchAll() {
    setLoading(true);
    const [resRes, compRes, roomRes] = await Promise.all([
      supabase.from('reservations').select('*').order('check_in', { ascending: true }),
      supabase.from('companies').select('*'),
      supabase.from('rooms').select('*').order('room_number'),
    ]);
    if (resRes.data) setReservations(resRes.data as Reservation[]);
    if (compRes.data) setCompanies(compRes.data as Company[]);
    if (roomRes.data) setRooms(roomRes.data as Room[]);
    setLoading(false);
  }

  const companyName = (id: string) => companies.find(c => c.id === id)?.name || '—';

  const filteredByStatus = {
    checkin: reservations.filter(r => r.status === 'CONFIRMED'),
    contas: reservations.filter(r => r.status === 'CHECKED_IN'),
    historico: reservations.filter(r => r.status === 'CHECKED_OUT'),
  };

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

  const visibleList = filterBySearch(filteredByStatus[activeTab]);

  const tabs = [
    { id: 'checkin' as const,   label: 'Check-in',       icon: LogIn,   count: filteredByStatus.checkin.length },
    { id: 'contas' as const,    label: 'Contas Abertas', icon: Receipt, count: filteredByStatus.contas.length },
    { id: 'historico' as const, label: 'Histórico',      icon: LogOut,  count: filteredByStatus.historico.length },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-neutral-900">Check-in / Check-out</h2>
        <p className="text-sm text-neutral-500">Gerencie o fluxo de entrada, contas abertas e fechamento de hóspedes.</p>
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
            <span className="ml-1 px-2 py-0.5 rounded-full bg-neutral-200 text-[10px] font-bold">
              {tab.count}
            </span>
          </button>
        ))}
      </div>

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

      {loading ? (
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
                      onClick={() => toast.info('Gestão de folio em construção.')}
                      className="flex-1 flex items-center justify-center gap-2 bg-white border border-neutral-200 text-neutral-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-neutral-50"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      Folio
                    </button>
                    <button
                      onClick={() => toast.info('Fluxo de check-out em construção.')}
                      className="flex-1 flex items-center justify-center gap-2 bg-neutral-900 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-neutral-800"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Check-out
                    </button>
                  </>
                )}
                {activeTab === 'historico' && (
                  <button
                    onClick={() => toast.info('Visualização da nota em construção.')}
                    className="flex-1 flex items-center justify-center gap-2 bg-white border border-neutral-200 text-neutral-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-neutral-50"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    Ver Nota
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <div className="text-[10px] text-neutral-400 uppercase tracking-widest">
        {rooms.length} UHs cadastradas · {rooms.filter(r => r.status === 'available').length} disponíveis
      </div>

      <AnimatePresence>
        {checkinTarget && (
          <CheckInModal
            reservation={checkinTarget}
            companyName={companyName(checkinTarget.company_id)}
            rooms={rooms}
            onCancel={() => setCheckinTarget(null)}
            onConfirm={handleCheckIn}
          />
        )}
      </AnimatePresence>
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
