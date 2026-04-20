import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { UserProfile, FiscalFile, Company } from '../types';
import { 
  TrendingUp, Users, Calendar, Clock, ArrowUpRight, 
  ArrowDownRight, Hotel, CheckCircle2, AlertCircle, 
  DollarSign, Activity, ChevronRight, FileText, Building2
} from 'lucide-react';
import { motion } from 'motion/react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';

interface DashboardStats {
  totalRooms: number;
  occupiedRooms: number;
  pendingArrivals: number;
  pendingDepartures: number;
  monthlyRevenue: number;
  pendingInvoices: number;
}

export default function DashboardOverview({ profile, onNavigate }: { profile: UserProfile, onNavigate?: (view: string) => void }) {
  const canSeeStats = profile.role === 'admin' || profile.role === 'finance' || profile.role === 'faturamento' || profile.role === 'reservations' || profile.role === 'eventos';
  
  const TOTAL_ROOMS = 120;
  const [monthlyGoal, setMonthlyGoal] = useState<number>(0);

  const [stats, setStats] = useState<DashboardStats>({
    totalRooms: TOTAL_ROOMS,
    occupiedRooms: 0,
    pendingArrivals: 0,
    pendingDepartures: 0,
    monthlyRevenue: 0,
    pendingInvoices: 0
  });
  const [loading, setLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [chartData, setChartData] = useState<{ name: string; ocupacao: number; receita: number }[]>(
    ['Seg','Ter','Qua','Qui','Sex','Sab','Dom'].map(n => ({ name: n, ocupacao: 0, receita: 0 }))
  );

  useEffect(() => {
    fetchAll();
    // Backend local não tem WebSocket; usamos polling de 15s como fonte única de atualização.
    const interval = setInterval(fetchAll, 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchAll = async () => {
    try {
      const [resResult, filesResult, auditResult] = await Promise.all([
        supabase.from('reservations').select('*'),
        supabase.from('files').select('*'),
        supabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(5),
      ]);

      // Meta mensal — leitura isolada para nunca quebrar o restante do painel
      try {
        const goalResult: any = await supabase.from('app_settings').select('*').eq('id', 'monthly_revenue_goal').maybeSingle();
        const raw = goalResult?.data?.value;
        const parsed = raw != null ? Number(raw) : 0;
        if (!isNaN(parsed) && parsed > 0) {
          setMonthlyGoal(parsed);
          try { localStorage.setItem('monthly_revenue_goal', String(parsed)); } catch (_) {}
        } else {
          // fallback: tenta ler do localStorage caso o backend ainda não tenha a tabela
          const cached = localStorage.getItem('monthly_revenue_goal');
          if (cached) setMonthlyGoal(Number(cached) || 0);
        }
      } catch (_) {
        const cached = localStorage.getItem('monthly_revenue_goal');
        if (cached) setMonthlyGoal(Number(cached) || 0);
      }

      const reservations: any[] = resResult.data || [];
      const files: any[] = filesResult.data || [];

      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      // Occupied: status CHECKED_IN OR (CONFIRMED & today between check_in and check_out)
      const occupiedRooms = reservations.filter(r => {
        if (r.status === 'CHECKED_IN') return true;
        if (r.status === 'CONFIRMED' && r.check_in && r.check_out) {
          return r.check_in <= todayStr && r.check_out > todayStr;
        }
        return false;
      }).length;

      // Check-ins hoje: reservations with check_in === today and not yet checked out/cancelled
      const pendingArrivals = reservations.filter(r =>
        r.check_in?.slice(0, 10) === todayStr &&
        r.status !== 'CANCELLED' && r.status !== 'CHECKED_OUT'
      ).length;

      const pendingDepartures = reservations.filter(r =>
        r.check_out?.slice(0, 10) === todayStr &&
        r.status === 'CHECKED_IN'
      ).length;

      // Faturas pendentes: files com status PENDING (campo opcional)
      const pendingInvoices = files.filter(f =>
        (f.status || '').toUpperCase() === 'PENDING'
      ).length;

      // Receita mensal: soma de amount de files PAID criados no mês corrente
      const monthlyRevenue = files
        .filter(f => {
          const status = (f.status || '').toUpperCase();
          if (status !== 'PAID') return false;
          const created = f.created_at ? new Date(f.created_at) : null;
          return created && created >= startOfMonth;
        })
        .reduce((sum, f) => sum + (Number(f.amount) || 0), 0);

      setStats({
        totalRooms: TOTAL_ROOMS,
        occupiedRooms,
        pendingArrivals,
        pendingDepartures,
        monthlyRevenue,
        pendingInvoices,
      });

      // Gráfico: últimos 7 dias - ocupação (qtde) e receita (faturas pagas no dia)
      const dayLabels = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];
      const series: { name: string; ocupacao: number; receita: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const ds = d.toISOString().slice(0, 10);
        const ocupacao = reservations.filter(r => {
          if (!r.check_in || !r.check_out) return false;
          return r.check_in <= ds && r.check_out > ds &&
            r.status !== 'CANCELLED' && r.status !== 'PENDING';
        }).length;
        const receita = files
          .filter(f => (f.status || '').toUpperCase() === 'PAID' && f.created_at?.slice(0, 10) === ds)
          .reduce((s, f) => s + (Number(f.amount) || 0), 0);
        series.push({ name: dayLabels[d.getDay()], ocupacao, receita });
      }
      setChartData(series);

      if (auditResult.data) setRecentActivity(auditResult.data);
    } finally {
      setLoading(false);
    }
  };

  const occupancyPct = stats.totalRooms > 0 ? Math.round((stats.occupiedRooms / stats.totalRooms) * 100) : 0;
  const availableRooms = Math.max(0, stats.totalRooms - stats.occupiedRooms);

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  })();

  return (
    <div className="space-y-8 pb-12">
      {/* Header Summary */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-900">{greeting}, {profile.name.split(' ')[0]}!</h1>
          <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest mt-1">Visão Geral do Operacional • {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <div className="flex gap-2">
           <div className="px-4 py-2 bg-white border border-gray-200 rounded-xl shadow-sm flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Banco de Dados (.txt) Conectado</span>
           </div>
        </div>
      </div>

      {/* Hero Stats */}
      {canSeeStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            label="Ocupação Atual"
            value={`${occupancyPct}%`}
            subtext={`${stats.occupiedRooms} de ${stats.totalRooms} quartos`}
            icon={Hotel}
            color="primary"
            onClick={() => onNavigate?.('reservations')}
          />
          <StatCard
            label="Check-ins Hoje"
            value={stats.pendingArrivals.toString()}
            subtext={stats.pendingArrivals === 0 ? 'Nenhuma chegada agendada' : 'Pendentes na recepção'}
            icon={Calendar}
            color="blue"
            onClick={() => onNavigate?.('reservations')}
          />
          <StatCard
            label="Faturas Pendentes"
            value={stats.pendingInvoices.toString()}
            subtext={stats.pendingInvoices === 0 ? 'Tudo conciliado' : 'Aguardando conciliação'}
            icon={FileText}
            color="amber"
            onClick={() => onNavigate?.('finance')}
          />
          <StatCard
            label="Receita Mensal"
            value={stats.monthlyRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            subtext={monthlyGoal > 0
              ? `Meta: ${monthlyGoal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
              : 'Meta não definida — configure em Finanças'}
            icon={DollarSign}
            color="green"
            onClick={() => onNavigate?.('finance')}
          />
        </div>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {canSeeStats && (
            <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm relative overflow-hidden group">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-lg font-black tracking-tight text-gray-900">Tendência de Ocupação</h3>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Últimos 7 dias x Projeção</p>
                </div>
                <Activity className="w-5 h-5 text-primary opacity-20 group-hover:opacity-100 transition-opacity" />
              </div>
              
              <div className="h-64 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorOcup" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#999' }}
                      dy={10}
                    />
                    <YAxis hide />
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontWeight: 700 }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="ocupacao" 
                      stroke="var(--color-primary)" 
                      strokeWidth={4}
                      fillOpacity={1} 
                      fill="url(#colorOcup)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <QuickActionCard
                title="Novo Check-in"
                description="Registre a entrada de um hóspede"
                icon={PlusIcon}
                onClick={() => onNavigate?.('reservations')}
             />
             <QuickActionCard
                title="Lançar Despesa"
                description="Adicione itens à conta do quarto"
                icon={DollarSign}
                onClick={() => onNavigate?.('finance')}
             />
          </div>
        </div>

        <div className="space-y-6">
          {/* Recent Activity List */}
          <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
            <h3 className="text-sm font-black tracking-tight text-gray-900 mb-6 uppercase tracking-widest">Atividade Recente</h3>
            <div className="space-y-6">
              {recentActivity.map((activity, idx) => (
                <div key={idx} className="flex gap-4 group">
                  <div className="relative">
                    <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center border border-gray-100 group-hover:border-primary/30 transition-all">
                       <Activity className="w-4 h-4 text-gray-400 group-hover:text-primary transition-all" />
                    </div>
                    {idx !== recentActivity.length - 1 && (
                      <div className="absolute top-10 left-1/2 w-[1px] h-6 bg-gray-100 -translate-x-1/2" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-900 leading-tight">{activity.action}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{activity.timestamp ? new Date(activity.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''} • {activity.user_name}</p>
                  </div>
                </div>
              ))}
              {recentActivity.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-8 font-bold italic">Nenhuma atividade registrada hoje</p>
              )}
            </div>
            <button onClick={() => onNavigate?.('audit')} className="w-full mt-8 py-3 bg-gray-50 hover:bg-gray-100 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-700 rounded-xl transition-all">Ver Log Completo</button>
          </div>

          {/* Hotel Occupancy Widget */}
          {canSeeStats && (
            <div style={{ background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)', color: '#FFFFFF' }} className="p-6 rounded-3xl shadow-xl relative overflow-hidden border border-gray-800">
               <div className="relative z-10">
                  <p style={{ color: 'rgba(255,255,255,0.7)' }} className="text-[10px] font-black uppercase tracking-widest">Capacidade Macaé</p>
                  <div className="flex items-end gap-2 mt-2">
                     <h2 style={{ color: '#FFFFFF' }} className="text-4xl font-black tracking-tighter">{stats.occupiedRooms}<span style={{ color: 'rgba(255,255,255,0.6)' }} className="text-xl">/{stats.totalRooms}</span></h2>
                  </div>
                  <div style={{ backgroundColor: 'rgba(255,255,255,0.15)' }} className="mt-4 w-full rounded-full h-1.5 overflow-hidden">
                     <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${occupancyPct}%` }}
                        style={{ backgroundColor: '#FFFFFF' }}
                        className="h-full"
                     />
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.85)' }} className="text-[10px] mt-4 font-bold">{availableRooms} quartos disponíveis para hoje</p>
               </div>
               <Hotel style={{ color: 'rgba(255,255,255,0.15)' }} className="absolute -bottom-6 -right-6 w-32 h-32 rotate-12" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PlusIcon(props: any) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function StatCard({ label, value, subtext, icon: Icon, color, trend, onClick }: { 
  label: string, value: string, subtext: string, icon: any, color: string, trend?: string, onClick?: () => void 
}) {
  const colorMap: any = {
    primary: 'bg-primary/5 text-primary',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
  };

  return (
    <motion.div 
      whileHover={{ y: -4, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`bg-white p-6 rounded-3xl border border-gray-200 shadow-sm relative group transition-all ${onClick ? 'cursor-pointer hover:border-primary hover:shadow-lg hover:shadow-primary/5' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div className={`p-3 rounded-2xl ${colorMap[color] || colorMap.primary}`}>
          <Icon className="w-6 h-6" />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg ${trend.startsWith('+') ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
            {trend.startsWith('+') ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {trend}
          </div>
        )}
      </div>
      <div className="mt-6">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">{label}</p>
        <h3 className="text-2xl font-black text-gray-900 tracking-tight">{value}</h3>
        <p className="text-xs font-bold text-gray-500 mt-1">{subtext}</p>
      </div>
    </motion.div>
  );
}

function QuickActionCard({ title, description, icon: Icon, onClick }: { title: string, description: string, icon: any, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex items-center gap-4 p-5 bg-white border border-gray-200 rounded-3xl hover:border-primary hover:shadow-lg hover:shadow-primary/5 transition-all text-left group"
    >
      <div className="p-3 bg-gray-50 rounded-2xl group-hover:bg-primary group-hover:text-white transition-all">
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <h4 className="text-sm font-black text-gray-900">{title}</h4>
        <p className="text-xs font-bold text-gray-400">{description}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 ml-auto group-hover:text-primary transition-all" />
    </button>
  );
}
