import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { UserProfile, Reservation, Company } from '../types';
import { LogIn, LogOut, Receipt, Loader2, Search, User, Hash, Building2, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type SubTab = 'checkin' | 'contas' | 'historico';

type Room = {
  id: string;
  room_number: string;
  floor: number;
  category: string;
  status: 'available' | 'occupied' | 'maintenance' | 'reserved';
};

export default function CheckInOutDashboard({ profile }: { profile: UserProfile }) {
  const [activeTab, setActiveTab] = useState<SubTab>('checkin');
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

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
                    onClick={() => toast.info('Fluxo de check-in em construção.')}
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
    </div>
  );
}
