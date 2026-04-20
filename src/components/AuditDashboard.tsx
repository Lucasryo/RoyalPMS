import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { UserProfile } from '../types';
import {
  ShieldCheck, DollarSign, Globe, Search, Building2,
  UserCircle, UserPlus, Users, Loader2, Filter, RefreshCw
} from 'lucide-react';
import { motion } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AuditLog {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  details: string;
  timestamp: string;
  type: string;
}

const TABS = [
  { id: 'all',      label: 'Todos',    icon: ShieldCheck, color: 'text-neutral-600' },
  { id: 'financas', label: 'Finanças', icon: DollarSign,  color: 'text-emerald-600' },
  { id: 'eventos',  label: 'Eventos',  icon: Globe,       color: 'text-blue-600'    },
  { id: 'rastreio', label: 'Rastreio', icon: Search,      color: 'text-violet-600'  },
  { id: 'empresas', label: 'Empresas', icon: Building2,   color: 'text-orange-600'  },
  { id: 'hospedes', label: 'Hóspedes', icon: UserCircle,  color: 'text-pink-600'    },
  { id: 'cadastro', label: 'Cadastro', icon: UserPlus,    color: 'text-cyan-600'    },
  { id: 'equipe',   label: 'Equipe',   icon: Users,       color: 'text-amber-600'   },
];

const TYPE_COLORS: Record<string, string> = {
  upload:         'bg-blue-50 text-blue-700',
  download:       'bg-emerald-50 text-emerald-700',
  delete:         'bg-red-50 text-red-700',
  create:         'bg-violet-50 text-violet-700',
  update:         'bg-amber-50 text-amber-700',
  company_create: 'bg-orange-50 text-orange-700',
  user_create:    'bg-cyan-50 text-cyan-700',
  login:          'bg-neutral-100 text-neutral-600',
};

const TYPE_LABELS: Record<string, string> = {
  upload:         'Upload',
  download:       'Download',
  delete:         'Exclusão',
  create:         'Criação',
  update:         'Atualização',
  company_create: 'Nova Empresa',
  user_create:    'Novo Usuário',
  login:          'Login',
};

function filterLogs(logs: AuditLog[], tab: string): AuditLog[] {
  if (tab === 'all') return logs;
  const act = (l: AuditLog) => l.action.toLowerCase();
  const typ = (l: AuditLog) => (l.type || '').toLowerCase();

  switch (tab) {
    case 'financas':
      return logs.filter(l =>
        ['upload', 'download', 'delete'].includes(typ(l)) ||
        /fatura|arquivo|upload|download|contestação|document|financ|anexo/.test(act(l))
      );
    case 'eventos':
      return logs.filter(l => /evento|o\.s\.|os-/.test(act(l)));
    case 'rastreio':
      return logs.filter(l =>
        /reserva|check.in|check.out|aprovação|rejeição|checkout|rastreio/.test(act(l))
      );
    case 'empresas':
      return logs.filter(l =>
        typ(l) === 'company_create' || /empresa|cnpj/.test(act(l))
      );
    case 'hospedes':
      return logs.filter(l =>
        /hóspede|hospede|guest/.test(act(l))
      );
    case 'cadastro':
      return logs.filter(l =>
        typ(l) === 'user_create' || /cadastro|registro|criou usuário/.test(act(l))
      );
    case 'equipe':
      return logs.filter(l =>
        /usuário|equipe|staff|colaborador|permissão|atualizou/.test(act(l))
      );
    default:
      return logs;
  }
}

export default function AuditDashboard({ profile }: { profile: UserProfile }) {
  const [activeTab, setActiveTab] = useState('all');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(500);
    setLogs(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, []);

  const filtered = filterLogs(logs, activeTab).filter(l =>
    !search ||
    l.action.toLowerCase().includes(search.toLowerCase()) ||
    l.user_name.toLowerCase().includes(search.toLowerCase()) ||
    l.details?.toLowerCase().includes(search.toLowerCase())
  );

  const countFor = (tab: string) => filterLogs(logs, tab).length;

  const activeTabInfo = TABS.find(t => t.id === activeTab)!;

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-900">Log de Auditoria</h1>
          <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest mt-1">
            Histórico completo de ações por módulo
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por ação, usuário..."
              className="pl-9 pr-4 py-2 bg-white border border-neutral-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-neutral-900/5 w-64"
            />
          </div>
          <button
            onClick={fetchLogs}
            className="p-2 bg-white border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-all"
            title="Atualizar"
          >
            <RefreshCw className="w-4 h-4 text-neutral-500" />
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const count = countFor(tab.id);
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border ${
                isActive
                  ? 'bg-neutral-900 text-white border-neutral-900 shadow-lg shadow-neutral-900/10'
                  : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                isActive ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-500'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Log Table */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden"
      >
        <div className="p-6 border-b border-neutral-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {(() => { const Icon = activeTabInfo.icon; return <Icon className={`w-5 h-5 ${activeTabInfo.color}`} />; })()}
            <div>
              <h2 className="font-black text-neutral-900">{activeTabInfo.label}</h2>
              <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">
                {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          {search && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-neutral-500 bg-neutral-100 px-2 py-1 rounded-lg">
              <Filter className="w-3 h-3" />
              Filtrado: "{search}"
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-24 text-center">
            <ShieldCheck className="w-10 h-10 text-neutral-200 mx-auto mb-3" />
            <p className="text-neutral-400 font-bold">Nenhum registro encontrado</p>
            <p className="text-neutral-300 text-sm">Tente ajustar o filtro ou a busca</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-100">
                <tr>
                  <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-neutral-400">Data / Hora</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-neutral-400">Usuário</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-neutral-400">Tipo</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-neutral-400">Ação</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-neutral-400">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {filtered.map(log => (
                  <tr key={log.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="px-6 py-4 text-neutral-400 whitespace-nowrap font-mono text-xs">
                      {log.timestamp
                        ? format(new Date(log.timestamp), "dd/MM/yyyy HH:mm", { locale: ptBR })
                        : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-bold text-neutral-900">{log.user_name || '—'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase whitespace-nowrap ${TYPE_COLORS[log.type] || 'bg-neutral-100 text-neutral-600'}`}>
                        {TYPE_LABELS[log.type] || log.type || '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-neutral-700">{log.action}</td>
                    <td className="px-6 py-4 text-neutral-500 text-xs max-w-xs truncate" title={log.details}>
                      {log.details || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
