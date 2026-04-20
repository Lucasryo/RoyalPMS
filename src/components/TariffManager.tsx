import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { UserProfile, Tariff, Company } from '../types';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { Plus, Search, Loader2, Trash2, Edit2, DollarSign, TrendingUp, Building2, FileText, X as CloseIcon, Copy, Check, Filter, AlertCircle, Upload, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { logAudit } from '../lib/audit';

interface CompanyTariffCardProps {
  companyName: string;
  companyTariffs: Tariff[];
  onEdit: (t: Tariff) => void;
  onDelete: (id: string, name: string) => Promise<void> | void;
  onDeleteAll: (name: string) => Promise<void> | void;
  onAdd: (companyName: string, category: string, roomType: string) => void;
  onCopy: (t: Tariff) => void;
  copiedId: string | null;
  canManage: boolean;
}

const CompanyTariffCard: React.FC<CompanyTariffCardProps> = ({ 
  companyName, 
  companyTariffs, 
  onEdit, 
  onDelete, 
  onDeleteAll,
  onAdd,
  onCopy, 
  copiedId,
  canManage
}) => {
  const allCategories = ['Executivo', 'Master', 'Suíte Presidencial'];
  const roomTypes = ['Single', 'Duplo', 'Triplo', 'Quádruplo'];

  const [selectedCategory, setSelectedCategory] = useState('Executivo');
  const [selectedRoomType, setSelectedRoomType] = useState('Single');

  const currentTariff = companyTariffs.find(
    t => t.category.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 
         selectedCategory.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") && 
         t.room_type.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 
         selectedRoomType.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden"
    >
      <div className="p-4">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-neutral-400" />
            <h3 className="text-sm font-bold text-neutral-900 truncate max-w-[120px]">{companyName}</h3>
          </div>
          {canManage && (
            <button onClick={() => onDeleteAll(companyName)} className="p-1.5 text-neutral-400 hover:text-red-600 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex flex-wrap gap-1">
              {allCategories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2 py-1 rounded text-[9px] font-bold uppercase transition-all ${
                    selectedCategory === cat ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1">
            {roomTypes.map(type => (
              <button
                key={type}
                onClick={() => setSelectedRoomType(type)}
                className={`py-1 rounded text-[8px] font-bold uppercase transition-all ${
                  selectedRoomType === type ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          <div className="bg-neutral-50 rounded-xl p-4 min-h-[140px] flex flex-col justify-center border border-neutral-100">
            {currentTariff ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-neutral-500 font-bold uppercase">Base</span>
                  <span className="text-sm font-bold text-neutral-900">R$ {currentTariff.base_rate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-neutral-500 font-bold uppercase">Taxa (+{currentTariff.percentage}%)</span>
                  <span className="text-sm font-bold text-neutral-600">+ R$ {(currentTariff.base_rate * (currentTariff.percentage / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="pt-2 border-t border-neutral-200 flex justify-between items-center">
                  <span className="text-[10px] font-bold uppercase text-neutral-400">Total</span>
                  <span className="text-lg font-bold text-neutral-900">R$ {(currentTariff.base_rate * (1 + currentTariff.percentage / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => onCopy(currentTariff)} className="p-1.5 text-neutral-400 hover:text-neutral-900 transition-colors">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  {canManage && (
                    <>
                      <button onClick={() => onEdit(currentTariff)} className="p-1.5 text-neutral-400 hover:text-neutral-900 transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => onDelete(currentTariff.id, currentTariff.company_name)} className="p-1.5 text-neutral-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center space-y-2">
                <AlertCircle className="w-6 h-6 text-neutral-200 mx-auto" />
                <p className="text-[9px] text-neutral-400 font-bold uppercase tracking-widest">Tarifa não cadastrada</p>
                {canManage && (
                  <button
                    onClick={() => onAdd(companyName, selectedCategory, selectedRoomType)}
                    className="text-[9px] font-bold uppercase text-neutral-900 underline hover:no-underline"
                  >
                    Cadastrar agora
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default function TariffManager({ profile }: { profile: UserProfile }) {
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form states
  const [companyName, setCompanyName] = useState('');
  const [baseRate, setBaseRate] = useState('');
  const [percentage, setPercentage] = useState('');
  const [roomType, setRoomType] = useState('single');
  const [category, setCategory] = useState('executivo');
  const [description, setDescription] = useState('');

  useEffect(() => {
    fetchTariffs();
    const channel = supabase.channel('tariffs-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'tariffs' }, fetchTariffs).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchTariffs() {
    const { data } = await supabase.from('tariffs').select('*').order('company_name');
    if (data) setTariffs(data);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const tariffData = {
      company_name: companyName,
      base_rate: parseFloat(baseRate),
      percentage: parseFloat(percentage),
      room_type: roomType,
      category,
      description,
      updated_at: new Date().toISOString(),
      created_by: profile.id
    };

    if (editingId) {
      await supabase.from('tariffs').update(tariffData).eq('id', editingId);
      toast.success('Tarifário atualizado');
    } else {
      await supabase.from('tariffs').insert([{ ...tariffData, created_at: new Date().toISOString() }]);
      toast.success('Tarifário cadastrado');
    }
    resetForm();
    fetchTariffs();
  }

  function resetForm() {
    setCompanyName(''); setBaseRate(''); setPercentage(''); setRoomType('single'); setCategory('executivo'); setDescription(''); setEditingId(null); setIsAdding(false);
  }

  const canManage = profile.role === 'admin' || profile.role === 'reservations';

  const groupedTariffs = tariffs.filter(t => t.company_name.toLowerCase().includes(searchTerm.toLowerCase())).reduce((acc, t) => {
    if (!acc[t.company_name]) acc[t.company_name] = [];
    acc[t.company_name].push(t);
    return acc;
  }, {} as Record<string, Tariff[]>);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">Gestão de Tarifários</h2>
          <p className="text-sm text-neutral-500">Mantenha os valores acordados com as empresas sempre atualizados.</p>
        </div>
        {canManage && (
          <button onClick={() => setIsAdding(true)} className="flex items-center gap-2 bg-neutral-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-neutral-800 transition-all shadow-sm">
            <Plus className="w-4 h-4" />
            Nova Tarifa
          </button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          type="text"
          placeholder="Buscar empresa ou descrição..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Object.entries(groupedTariffs).map(([name, items]) => (
          <CompanyTariffCard
            key={name}
            companyName={name}
            companyTariffs={items}
            canManage={canManage}
            copiedId={copiedId}
            onAdd={(n, c, r) => { setCompanyName(n); setCategory(c.toLowerCase() as any); setRoomType(r.toLowerCase() as any); setIsAdding(true); }}
            onCopy={(t) => { navigator.clipboard.writeText(t.description || ''); toast.success('Copiado'); }}
            onEdit={(t) => { setEditingId(t.id); setCompanyName(t.company_name); setBaseRate(t.base_rate.toString()); setPercentage(t.percentage.toString()); setRoomType(t.room_type || 'single'); setCategory(t.category || 'executivo'); setDescription(t.description || ''); setIsAdding(true); }}
            onDelete={async (id) => { if (confirm('Excluir este item?')) { await supabase.from('tariffs').delete().eq('id', id); fetchTariffs(); } }}
            onDeleteAll={async (n) => { if (confirm(`Excluir TODO tarifário de ${n}?`)) { await supabase.from('tariffs').delete().eq('company_name', n); fetchTariffs(); } }}
          />
        ))}
      </div>

      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-neutral-100 flex justify-between items-center">
                <h3 className="text-lg font-bold text-neutral-900">{editingId ? 'Editar Tarifa' : 'Nova Tarifa'}</h3>
                <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-neutral-100 rounded-full"><CloseIcon className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-500 uppercase">Empresa</label>
                    <input required value={companyName} onChange={e => setCompanyName(e.target.value)} className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-neutral-500 uppercase">Categoria</label>
                      <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm">
                        <option value="executivo">Executivo</option>
                        <option value="master">Master</option>
                        <option value="suite presidencial">Suíte Presidencial</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-neutral-500 uppercase">Tipo de Quarto</label>
                      <select value={roomType} onChange={e => setRoomType(e.target.value)} className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm">
                        <option value="single">Single</option>
                        <option value="duplo">Duplo</option>
                        <option value="triplo">Triplo</option>
                        <option value="quadruplo">Quádruplo</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-neutral-500 uppercase">Valor Base (R$)</label>
                      <input type="number" step="0.01" required value={baseRate} onChange={e => setBaseRate(e.target.value)} className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-neutral-500 uppercase">Taxa ISS/Serviço (%)</label>
                      <input type="number" step="0.01" required value={percentage} onChange={e => setPercentage(e.target.value)} className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm" />
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 pt-4 border-t border-neutral-100">
                  <button type="button" onClick={() => setIsAdding(false)} className="flex-1 px-4 py-2 text-sm font-bold text-neutral-600">Cancelar</button>
                  <button type="submit" className="flex-1 px-4 py-2 bg-neutral-900 text-white text-sm font-bold rounded-xl shadow-lg shadow-neutral-900/20">Salvar Tarifa</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
