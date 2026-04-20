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
  const allCategories = ['Executivo', 'Superior', 'Master', 'Suíte Presidencial'];
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

type ImportRow = {
  company_name: string;
  category: string;
  room_type: string;
  base_rate: number;
  percentage: number;
};

// "R$ 289,00+3,75%" | "299+13,75%" | "289,00 + 3.75%" → { base, pct }
function parseRateCell(raw: unknown): { base: number; pct: number } | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/r\$\s*/i, '').replace(/\s+/g, '');
  const match = s.match(/^([\d.,]+)\+([\d.,]+)%?$/);
  if (!match) return null;
  const toNum = (v: string) => {
    const hasComma = v.includes(',');
    const hasDot = v.includes('.');
    if (hasComma && hasDot) return parseFloat(v.replace(/\./g, '').replace(',', '.'));
    if (hasComma) return parseFloat(v.replace(',', '.'));
    return parseFloat(v);
  };
  const base = toNum(match[1]);
  const pct = toNum(match[2]);
  if (Number.isNaN(base) || Number.isNaN(pct)) return null;
  return { base, pct };
}

function normalizeCategory(raw: string): string | null {
  const s = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (s.startsWith('execut')) return 'executivo';
  if (s.startsWith('super')) return 'superior';
  if (s.startsWith('master')) return 'master';
  if (s.startsWith('suite') || s.startsWith('suíte') || s.startsWith('presidencial')) return 'suite presidencial';
  return null;
}

export default function TariffManager({ profile }: { profile: UserProfile }) {
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Import states
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<{ rows: ImportRow[]; skipped: string[] } | null>(null);
  const [importing, setImporting] = useState(false);

  // Form states
  const [companyName, setCompanyName] = useState('');
  const [baseRate, setBaseRate] = useState('');
  const [percentage, setPercentage] = useState('');
  const [roomType, setRoomType] = useState('single');
  const [category, setCategory] = useState('executivo');
  const [description, setDescription] = useState('');

  async function handleXlsxFile(file: File) {
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<any>(ws, { header: 1, defval: '' });

      const rows: ImportRow[] = [];
      const skipped: string[] = [];
      let lastCompany = '';

      for (let i = 0; i < raw.length; i++) {
        const r = raw[i];
        if (!r || r.length === 0) continue;
        const empresaRaw = String(r[0] ?? '').trim();
        const catRaw = String(r[1] ?? '').trim();
        const sglRaw = r[2];
        const dblRaw = r[3];

        if (empresaRaw) lastCompany = empresaRaw;

        if (!catRaw) continue;
        if (i === 0 && /empresa/i.test(empresaRaw)) continue;

        const company = (lastCompany || empresaRaw).trim();
        if (!company) {
          skipped.push(`Linha ${i + 1}: sem empresa`);
          continue;
        }

        const category = normalizeCategory(catRaw);
        if (!category) {
          skipped.push(`Linha ${i + 1} (${company}): categoria desconhecida "${catRaw}"`);
          continue;
        }

        const sgl = parseRateCell(sglRaw);
        const dbl = parseRateCell(dblRaw);

        if (sgl) rows.push({ company_name: company, category, room_type: 'single', base_rate: sgl.base, percentage: sgl.pct });
        else if (String(sglRaw).trim()) skipped.push(`Linha ${i + 1} (${company} ${category} SGL): formato inválido "${sglRaw}"`);

        if (dbl) rows.push({ company_name: company, category, room_type: 'duplo', base_rate: dbl.base, percentage: dbl.pct });
        else if (String(dblRaw).trim()) skipped.push(`Linha ${i + 1} (${company} ${category} DBL): formato inválido "${dblRaw}"`);
      }

      if (rows.length === 0) {
        toast.error('Nenhuma linha válida encontrada na planilha.');
        return;
      }

      setImportPreview({ rows, skipped });
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao ler XLSX: ' + (err.message || 'arquivo inválido'));
    }
  }

  async function confirmImport() {
    if (!importPreview) return;
    setImporting(true);
    try {
      const now = new Date().toISOString();
      const payload = importPreview.rows.map(r => ({
        company_name: r.company_name,
        category: r.category,
        room_type: r.room_type,
        base_rate: r.base_rate,
        percentage: r.percentage,
        description: null,
        created_by: profile.id,
        updated_at: now,
      }));

      // Upsert por (company, category, room_type) — deleta e reinsere pra manter simples
      const companies = Array.from(new Set(payload.map(p => p.company_name)));
      for (const comp of companies) {
        const compPayload = payload.filter(p => p.company_name === comp);
        const keys = compPayload.map(p => `(${p.category}/${p.room_type})`).join(',');
        // Delete existing rows that match any (cat, room_type) we're importing
        for (const p of compPayload) {
          await supabase.from('tariffs')
            .delete()
            .eq('company_name', p.company_name)
            .eq('category', p.category)
            .eq('room_type', p.room_type);
        }
        await supabase.from('tariffs').insert(compPayload.map(p => ({ ...p, created_at: now })));
        await logAudit({
          user_id: profile.id,
          user_name: profile.name,
          action: 'Importação de tarifário via XLSX',
          details: `${comp}: ${keys}`,
          type: 'create',
        });
      }

      toast.success(`${payload.length} tarifas importadas com sucesso!`);
      setImportPreview(null);
      fetchTariffs();
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao importar: ' + (err.message || 'falha'));
    } finally {
      setImporting(false);
    }
  }

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
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleXlsxFile(f);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 bg-white border border-neutral-200 text-neutral-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-neutral-50 transition-all shadow-sm"
            >
              <Upload className="w-4 h-4" />
              Importar XLSX
            </button>
            <button onClick={() => setIsAdding(true)} className="flex items-center gap-2 bg-neutral-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-neutral-800 transition-all shadow-sm">
              <Plus className="w-4 h-4" />
              Nova Tarifa
            </button>
          </div>
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
                        <option value="superior">Superior</option>
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

      <AnimatePresence>
        {importPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white w-full max-w-3xl max-h-[85vh] rounded-2xl overflow-hidden shadow-2xl flex flex-col">
              <div className="p-6 border-b border-neutral-100 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-neutral-900">Pré-visualização da importação</h3>
                  <p className="text-sm text-neutral-500">
                    {importPreview.rows.length} linhas válidas
                    {importPreview.skipped.length > 0 && ` · ${importPreview.skipped.length} ignoradas`}
                  </p>
                </div>
                <button onClick={() => setImportPreview(null)} className="p-2 hover:bg-neutral-100 rounded-full"><CloseIcon className="w-5 h-5" /></button>
              </div>

              <div className="flex-1 overflow-auto p-6 space-y-4">
                <div className="text-xs text-neutral-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <strong>Atenção:</strong> tarifas existentes com mesma empresa + categoria + tipo de quarto serão <strong>substituídas</strong>.
                </div>

                <div className="border border-neutral-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-neutral-50 text-neutral-600 uppercase font-bold">
                      <tr>
                        <th className="text-left px-3 py-2">Empresa</th>
                        <th className="text-left px-3 py-2">Categoria</th>
                        <th className="text-left px-3 py-2">Tipo</th>
                        <th className="text-right px-3 py-2">Base</th>
                        <th className="text-right px-3 py-2">Taxa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.rows.map((r, i) => (
                        <tr key={i} className="border-t border-neutral-100">
                          <td className="px-3 py-2 font-medium text-neutral-900">{r.company_name}</td>
                          <td className="px-3 py-2 capitalize text-neutral-700">{r.category}</td>
                          <td className="px-3 py-2 uppercase text-neutral-500">{r.room_type}</td>
                          <td className="px-3 py-2 text-right font-mono">R$ {r.base_rate.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-mono text-neutral-500">{r.percentage}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {importPreview.skipped.length > 0 && (
                  <details className="text-xs">
                    <summary className="font-bold text-neutral-600 cursor-pointer">Linhas ignoradas ({importPreview.skipped.length})</summary>
                    <ul className="mt-2 space-y-1 text-neutral-500 bg-neutral-50 rounded-lg p-3">
                      {importPreview.skipped.map((s, i) => <li key={i}>• {s}</li>)}
                    </ul>
                  </details>
                )}
              </div>

              <div className="p-6 border-t border-neutral-100 flex gap-3">
                <button type="button" onClick={() => setImportPreview(null)} disabled={importing} className="flex-1 px-4 py-2 text-sm font-bold text-neutral-600 disabled:opacity-50">Cancelar</button>
                <button type="button" onClick={confirmImport} disabled={importing} className="flex-1 px-4 py-2 bg-neutral-900 text-white text-sm font-bold rounded-xl shadow-lg shadow-neutral-900/20 disabled:opacity-50 flex items-center justify-center gap-2">
                  {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                  Importar {importPreview.rows.length} tarifas
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
