import { useState } from 'react';
import { UserProfile } from '../types';
import { BookOpen, Wallet, FileText, ClipboardList } from 'lucide-react';

type SubTab = 'lancamentos' | 'caixa' | 'rdo';

export default function CaixaDashboard({ profile: _profile }: { profile: UserProfile }) {
  const [activeTab, setActiveTab] = useState<SubTab>('rdo');

  const tabs: Array<{ id: SubTab; label: string; icon: typeof BookOpen; description: string }> = [
    {
      id: 'lancamentos',
      label: 'Diário de Lançamentos',
      icon: BookOpen,
      description: 'Todos os lançamentos do folio agrupados por dia, com filtros por UH e tipo.',
    },
    {
      id: 'caixa',
      label: 'Diário de Caixa',
      icon: Wallet,
      description: 'Receitas, estornos e movimentação de caixa do dia operacional.',
    },
    {
      id: 'rdo',
      label: 'RDO',
      icon: ClipboardList,
      description: 'Resumo de Operações Diária com ocupação, ADR, RevPAR e indicadores hoteleiros.',
    },
  ];

  const current = tabs.find(t => t.id === activeTab)!;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-neutral-900">Caixa</h2>
        <p className="text-sm text-neutral-500">
          Controle financeiro e operacional da hospedagem: diários, movimentos e RDO.
        </p>
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

      <div className="bg-white border border-neutral-200 rounded-2xl p-8 text-center">
        <div className="w-12 h-12 mx-auto bg-neutral-100 rounded-xl flex items-center justify-center mb-3">
          <current.icon className="w-6 h-6 text-neutral-400" />
        </div>
        <h3 className="text-sm font-bold text-neutral-900">{current.label}</h3>
        <p className="text-xs text-neutral-500 mt-1 max-w-md mx-auto">{current.description}</p>
        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-4">Em construção</p>
      </div>
    </div>
  );
}
