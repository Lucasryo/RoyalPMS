/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useMemo } from 'react';
import { supabase } from './supabase';
import { UserProfile, Company } from './types';
import { canAccessView } from './lib/permissions';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import ClientDashboard from './components/ClientDashboard';
import ReservationsDashboard from './components/ReservationsDashboard';
import EventsDashboard from './components/EventsDashboard';
import DashboardOverview from './components/DashboardOverview';
import Profile from './components/Profile';
import AuditDashboard from './components/AuditDashboard';
import CheckInOutDashboard from './components/CheckInOutDashboard';
import {
  Loader2, User as UserIcon, LogOut, Search, X as CloseIcon,
  Building2, FileText, Users, Sparkles, LayoutDashboard,
  CalendarDays, UserCircle, Settings, Menu, Bell, Search as SearchIcon,
  ChevronRight, Hotel, Globe, ShieldCheck, UserPlus, DollarSign, KeyRound
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { tryFocusElement, consumeFocusTarget } from './lib/focusTarget';
import { motion, AnimatePresence } from 'motion/react';

type User = { id: string; email?: string; [key: string]: any };

type ViewType = 'dashboard' | 'reservations' | 'guests' | 'companies' | 'finance' | 'staff' | 'settings' | 'tariffs' | 'tracking' | 'registration' | 'events' | 'audit' | 'checkin';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<{
    companies: any[],
    files: any[],
    users: any[]
  }>({ companies: [], files: [], users: [] });
  const [isSearching, setIsSearching] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Quando a view muda por causa da busca global, aciona o "zoom" no item alvo
  useEffect(() => {
    const target = consumeFocusTarget();
    if (!target) return;
    // recoloca para uso pelo handler interno
    try { sessionStorage.setItem('focusTarget', JSON.stringify(target)); } catch {}
    // aguarda a aba destino montar e renderizar a lista
    tryFocusElement(target.id, { attempts: 20, delayMs: 250 });
  }, [currentView]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const searchTimerRef = useState<{ id: ReturnType<typeof setTimeout> | null }>({ id: null })[0];

  const runGlobalSearch = async (term: string) => {
    setIsSearching(true);
    try {
      const role = profile?.role;
      const isAdmin = role === 'admin';
      const isStaff = role === 'admin' || role === 'reservations';

      // Cliente: só vê seus próprios arquivos. Staff: vê tudo.
      const filesQuery = supabase.from('files').select('*').or(`original_name.ilike.%${term}%,type.ilike.%${term}%`);
      if (role === 'client' && profile?.company_id) {
        filesQuery.eq('company_id', profile.company_id);
      }

      const tasks: PromiseLike<any>[] = [
        // Empresas: clientes não veem listagem de outras empresas
        isStaff
          ? supabase.from('companies').select('*').or(`name.ilike.%${term}%,cnpj.ilike.%${term}%`)
          : Promise.resolve({ data: [] }),
        filesQuery,
        // Equipe: somente admin pode pesquisar perfis
        isAdmin
          ? supabase.from('profiles').select('*').or(`name.ilike.%${term}%,email.ilike.%${term}%`)
          : Promise.resolve({ data: [] }),
      ];

      const [companiesRes, filesRes, usersRes] = await Promise.all(tasks);

      setSearchResults({
        companies: companiesRes.data || [],
        files: (filesRes.data || []).filter((f: any) => role !== 'client' || f.company_id === profile?.company_id),
        users: (usersRes.data || []).map((u: any) => {
          // Nunca expor hash de senha mesmo que o backend devolva
          const { password_hash, ...rest } = u;
          return rest;
        })
      });
    } catch (error) {
      console.error("Global search error:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleGlobalSearch = (term: string) => {
    setGlobalSearchTerm(term);
    if (searchTimerRef.id) clearTimeout(searchTimerRef.id);
    if (term.length < 2) {
      setSearchResults({ companies: [], files: [], users: [] });
      return;
    }
    searchTimerRef.id = setTimeout(() => runGlobalSearch(term), 300);
  };

  const fetchProfile = async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle();
      
      if (error) return null;

      if (data) {
        const userProfile = {
          id: data.id,
          name: data.name,
          email: data.email,
          role: data.role,
          company_id: data.company_id,
          photo_url: data.photo_url,
          permissions: data.permissions ?? undefined,
        } as UserProfile;
        setProfile(userProfile);
        return userProfile;
      }
      return null;
    } catch (error) {
      return null;
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) setLoading(false);
    }, 5000);

    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (session) {
          setUser(session.user);
        } else {
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
      if (!session) {
        setProfile(null);
        setCurrentView('dashboard');
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const syncProfile = async () => {
      try {
        const profileData = await fetchProfile(user.id);

        if (!profileData) {
          const isAdminEmail = user.email === "lucaszaous@gmail.com";
          const newProfile = {
            id: user.id,
            name: user.user_metadata.full_name || 'Usuário',
            email: user.email || '',
            role: isAdminEmail ? 'admin' : 'client',
          };
          
          await supabase.from('profiles').insert([newProfile]);
          setProfile(newProfile as UserProfile);
        }
      } finally {
        setLoading(false);
      }
    };

    syncProfile();
  }, [user]);

  // Se a view atual foi bloqueada pelas permissões, redireciona para a primeira disponível
  useEffect(() => {
    if (!profile) return;
    if (!canAccessView(profile, currentView)) {
      const order: ViewType[] = ['dashboard', 'reservations', 'checkin', 'events', 'guests', 'companies', 'tracking', 'finance', 'registration', 'staff', 'audit'];
      const next = order.find(v => canAccessView(profile, v));
      if (next && next !== currentView) setCurrentView(next);
    }
  }, [profile, currentView]);

  // Fetch notifications for current user
  const fetchNotifications = async () => {
    if (!profile) return;
    const { data } = await supabase.from('notifications').select('*').eq('user_id', profile.id);
    if (data) setNotifications(data.sort((a: any, b: any) => (b.timestamp ?? '').localeCompare(a.timestamp ?? '')));
  };

  useEffect(() => {
    if (!profile) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [profile]);

  const markAllRead = async () => {
    const unread = notifications.filter((n: any) => !n.read);
    await Promise.all(unread.map((n: any) =>
      supabase.from('notifications').update({ read: true }).eq('id', n.id)
    ));
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const navigationItems = useMemo(() => {
    if (!profile) return [];

    const items = [
      { id: 'dashboard' as ViewType, label: 'Painel', icon: LayoutDashboard },
      { id: 'reservations' as ViewType, label: 'Reservas', icon: CalendarDays },
      { id: 'checkin' as ViewType, label: 'Check-in/out', icon: KeyRound },
      { id: 'events' as ViewType, label: 'Eventos', icon: Globe },
      { id: 'guests' as ViewType, label: 'Hóspedes', icon: UserCircle },
      { id: 'companies' as ViewType, label: 'Empresas', icon: Building2 },
      { id: 'tracking' as ViewType, label: 'Rastreio', icon: Search },
      { id: 'finance' as ViewType, label: 'Finanças', icon: FileText },
      { id: 'tariffs' as ViewType, label: 'Tarifas', icon: DollarSign },
      { id: 'registration' as ViewType, label: 'Cadastro', icon: UserPlus },
      { id: 'staff' as ViewType, label: 'Equipe', icon: Users },
      { id: 'audit' as ViewType, label: 'Auditoria', icon: ShieldCheck },
    ];

    return items.filter(item => canAccessView(profile, item.id));
  }, [profile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F8F9FA]">
        <motion.div 
          animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="p-4 bg-white rounded-3xl shadow-xl flex items-center justify-center overflow-hidden w-20 h-20">
             <img 
               src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWHB7epnz8XIPz-g-0iPpTGKxRxJAYR9xKaQ&s" 
               alt="Logo" 
               className="w-full h-full object-contain"
               referrerPolicy="no-referrer"
             />
          </div>
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Iniciando PMS Desktop</p>
        </motion.div>
      </div>
    );
  }

  if (!user || !profile) return <Login />;

  const renderContent = () => {
    switch (currentView) {
      case 'profile': return <Profile profile={profile} onBack={() => setCurrentView('dashboard')} />;
      case 'reservations': return profile.role === 'client' ? <ClientDashboard profile={profile} initialTab="reservations" /> : <ReservationsDashboard profile={profile} />;
      case 'checkin': return <CheckInOutDashboard profile={profile} />;
      case 'guests': return <AdminDashboard profile={profile} initialTab="guests" />;
      case 'tracking': return <AdminDashboard profile={profile} initialTab="tracking" />;
      case 'tariffs': return <AdminDashboard profile={profile} initialTab="tariffs" />;
      case 'registration': return <AdminDashboard profile={profile} initialTab="registration" />;
      case 'events': return <EventsDashboard profile={profile} />;
      case 'finance': return (profile.role === 'admin' || profile.role === 'faturamento' || profile.role === 'finance' || profile.role === 'reservations') ? <AdminDashboard profile={profile} initialTab="finance" /> : <ClientDashboard profile={profile} />;
      case 'companies': return <AdminDashboard profile={profile} initialTab="companies" />;
      case 'staff': return <AdminDashboard profile={profile} initialTab="users" />;
      case 'audit': return <AuditDashboard profile={profile} />;
      case 'dashboard':
      default:
        return profile.role === 'client' ? <ClientDashboard profile={profile} /> : 
               (profile.role === 'admin' || profile.role === 'faturamento' || profile.role === 'finance' || profile.role === 'reception' || profile.role === 'reservations' || profile.role === 'eventos') ? <DashboardOverview profile={profile} onNavigate={(view) => setCurrentView(view as ViewType)} /> :
               <ReservationsDashboard profile={profile} />;
    }
  };

  return (
    <div className="flex h-screen bg-[#F8F9FA] overflow-hidden font-sans text-gray-900">
      <Toaster position="top-right" richColors />

      {/* Sidebar Navigation */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 280 : 80 }}
        className="h-full bg-white border-r border-gray-200 flex flex-col relative z-50 shadow-sm"
      >
        <div className="p-6 flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 bg-white border border-neutral-200 rounded-xl flex items-center justify-center shrink-0 shadow-sm overflow-hidden p-1">
            <img 
              src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWHB7epnz8XIPz-g-0iPpTGKxRxJAYR9xKaQ&s" 
              alt="Logo" 
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <AnimatePresence>
            {isSidebarOpen && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="whitespace-nowrap"
              >
                <h1 className="text-xl font-black tracking-tighter italic text-amber-500 uppercase">ROYAL</h1>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <nav className="flex-1 px-3 space-y-1 mt-4 overflow-y-auto">
          {navigationItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all group relative ${
                currentView === item.id 
                  ? 'bg-primary/5 text-primary' 
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <item.icon className={`w-5 h-5 shrink-0 ${currentView === item.id ? 'text-primary' : 'group-hover:text-gray-900'}`} />
              <AnimatePresence>
                {isSidebarOpen && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-sm font-bold whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
              {currentView === item.id && (
                <motion.div 
                  layoutId="sidebar-active"
                  className="absolute left-0 w-1 h-6 bg-primary rounded-r-full"
                />
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className={`flex items-center gap-3 ${isSidebarOpen ? '' : 'justify-center'}`}>
            <button 
              onClick={() => setCurrentView('profile')}
              className="w-10 h-10 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden shrink-0 hover:border-primary transition-all cursor-pointer"
            >
              {profile.photo_url ? (
                <img src={profile.photo_url} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <UserIcon className="w-5 h-5" />
                </div>
              )}
            </button>
            {isSidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{profile.name}</p>
                <div className="flex items-center gap-1">
                   <ShieldCheck className="w-3 h-3 text-green-500" />
                   <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider truncate">{profile.role}</span>
                </div>
              </div>
            )}
            {isSidebarOpen && (
              <button 
                onClick={() => supabase.auth.signOut()}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-full mt-4 flex items-center justify-center p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-all"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </motion.aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#F8F9FA] relative">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-gray-200 px-8 flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-6">
            <h2 className="text-sm font-black uppercase tracking-widest text-gray-900 flex items-center gap-2">
              {navigationItems.find(i => i.id === currentView)?.label || 'Sistema'}
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </h2>
            
            {/* Desktop Search bar */}
            <div className="relative group hidden sm:block">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <SearchIcon className="w-4 h-4 text-gray-400 group-focus-within:text-primary transition-colors" />
              </div>
              <input
                type="text"
                placeholder="Busca global (Ctrl + K)"
                onClick={() => setIsSearchOpen(true)}
                readOnly
                className="pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm w-80 cursor-pointer focus:ring-2 focus:ring-primary/10 transition-all outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
             <div className="relative">
               <button
                 onClick={() => { setShowNotifications(!showNotifications); if (!showNotifications) markAllRead(); }}
                 className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all relative"
               >
                 <Bell className="w-5 h-5" />
                 {notifications.filter((n: any) => !n.read).length > 0 && (
                   <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
                 )}
               </button>
               {showNotifications && (
                 <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-neutral-100 z-50 overflow-hidden">
                   <div className="px-4 py-3 border-b border-neutral-100 flex justify-between items-center">
                     <span className="text-sm font-bold text-neutral-900">Notificações</span>
                     <button onClick={() => setShowNotifications(false)} className="text-neutral-400 hover:text-neutral-700 text-xs">Fechar</button>
                   </div>
                   <div className="max-h-80 overflow-y-auto divide-y divide-neutral-50">
                     {notifications.length === 0 ? (
                       <p className="text-xs text-neutral-400 text-center py-6">Nenhuma notificação</p>
                     ) : (
                       notifications.slice(0, 20).map((n: any) => (
                         <div key={n.id} className={`px-4 py-3 ${n.read ? 'bg-white' : 'bg-blue-50'}`}>
                           <p className="text-xs font-bold text-neutral-900">{n.title}</p>
                           <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">{n.message}</p>
                           <p className="text-[10px] text-neutral-300 mt-1">{n.timestamp ? new Date(n.timestamp).toLocaleString('pt-BR') : ''}</p>
                         </div>
                       ))
                     )}
                   </div>
                 </div>
               )}
             </div>
             <div className="h-6 w-[1px] bg-gray-200 mx-2" />
             <div className="flex flex-col items-end">
                <p className="text-xs font-black text-gray-900">Hotel Royal Macaé</p>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">Terminal 01 • Conectado</p>
             </div>
          </div>
        </header>

        {/* Dynamic Page Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="max-w-7xl mx-auto"
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Global Search Modal */}
      <AnimatePresence>
        {isSearchOpen && (
          <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-20 bg-gray-900/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-200"
            >
              <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                <SearchIcon className="w-5 h-5 text-primary" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Pesquisar em todo o hotel..."
                  value={globalSearchTerm}
                  onChange={(e) => handleGlobalSearch(e.target.value)}
                  className="flex-1 bg-transparent border-none focus:ring-0 text-lg text-gray-900 font-medium"
                />
                <button 
                  onClick={() => setIsSearchOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-xl transition-all"
                >
                  <CloseIcon className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto p-4 space-y-6">
                {isSearching ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-4">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-xs font-black uppercase tracking-widest text-gray-400">Vasculhando rede...</p>
                  </div>
                ) : globalSearchTerm.length < 2 ? (
                  <div className="py-20 text-center">
                    <div className="p-4 bg-gray-50 rounded-full inline-block mb-4">
                      <Sparkles className="w-10 h-10 text-gray-200" />
                    </div>
                    <p className="text-xs font-black uppercase tracking-widest text-gray-400">Atalho inteligente (⌘K)</p>
                  </div>
                ) : (
                  <>
                    {searchResults.companies.length === 0 && searchResults.files.length === 0 && searchResults.users.length === 0 && (
                      <div className="py-16 text-center">
                        <p className="text-xs font-black uppercase tracking-widest text-gray-400">Nenhum resultado encontrado</p>
                      </div>
                    )}
                    {searchResults.companies.map(c => (
                      <button
                        key={c.id}
                        onClick={() => {
                          sessionStorage.setItem('focusTarget', JSON.stringify({ type: 'company', id: c.id, name: c.name }));
                          setCurrentView('companies');
                          setIsSearchOpen(false);
                          setGlobalSearchTerm('');
                        }}
                        className="w-full text-left flex items-center gap-4 p-3 hover:bg-gray-50 rounded-xl cursor-pointer group"
                      >
                        <div className="p-2 bg-blue-50 rounded-lg"><Building2 className="w-5 h-5 text-blue-600" /></div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{c.name}</p>
                          <p className="text-[10px] text-gray-500 font-bold uppercase">Empresa • CNPJ: {c.cnpj}</p>
                        </div>
                      </button>
                    ))}
                    {searchResults.files.map(f => (
                      <button
                        key={f.id}
                        onClick={() => {
                          sessionStorage.setItem('focusTarget', JSON.stringify({ type: 'file', id: f.id, name: f.original_name }));
                          setCurrentView('finance');
                          setIsSearchOpen(false);
                          setGlobalSearchTerm('');
                        }}
                        className="w-full text-left flex items-center gap-4 p-3 hover:bg-gray-50 rounded-xl cursor-pointer group"
                      >
                        <div className="p-2 bg-purple-50 rounded-lg"><FileText className="w-5 h-5 text-purple-600" /></div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{f.original_name}</p>
                          <p className="text-[10px] text-gray-500 font-bold uppercase">Arquivo • {f.type}</p>
                        </div>
                      </button>
                    ))}
                    {searchResults.users.map(u => (
                      <button
                        key={u.id}
                        onClick={() => {
                          sessionStorage.setItem('focusTarget', JSON.stringify({ type: 'user', id: u.id, name: u.name }));
                          setCurrentView('staff');
                          setIsSearchOpen(false);
                          setGlobalSearchTerm('');
                        }}
                        className="w-full text-left flex items-center gap-4 p-3 hover:bg-gray-50 rounded-xl cursor-pointer group"
                      >
                        <div className="p-2 bg-green-50 rounded-lg"><Users className="w-5 h-5 text-green-600" /></div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{u.name}</p>
                          <p className="text-[10px] text-gray-500 font-bold uppercase">Equipe • {u.role}</p>
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
              
              <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Pressione <span className="text-gray-900">ESC</span> para fechar</p>
                <div className="flex gap-4">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-black text-white bg-gray-900 px-1.5 py-0.5 rounded shadow-sm">ENTER</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
