import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { UserProfile } from '../types';
import { Receipt, Percent, Save, Loader2, AlertTriangle, CheckCircle2, Clock, User, Info } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { logAudit } from '../lib/audit';

type FiscalData = {
  iss_rate: number;
  service_tax_rate: number;
};

type SettingRecord = {
  id: string;
  value: string;
  updated_at?: string;
  updated_by?: string;
};

const SETTING_ID = 'fiscal_settings';
const DEFAULTS: FiscalData = { iss_rate: 3.75, service_tax_rate: 10 };

export default function FiscalSettings({ profile }: { profile: UserProfile }) {
  const [data, setData] = useState<FiscalData>(DEFAULTS);
  const [record, setRecord] = useState<SettingRecord | null>(null);
  const [updaterName, setUpdaterName] = useState<string>('');

  const [issInput, setIssInput] = useState('');
  const [serviceInput, setServiceInput] = useState('');
  const [editingIss, setEditingIss] = useState(false);
  const [editingService, setEditingService] = useState(false);
  const [savingIss, setSavingIss] = useState(false);
  const [savingService, setSavingService] = useState(false);

  useEffect(() => { fetchSettings(); }, []);

  async function fetchSettings() {
    const { data: row } = await supabase
      .from('app_settings')
      .select('*')
      .eq('id', SETTING_ID)
      .maybeSingle();

    if (row) {
      setRecord(row);
      try {
        const parsed = JSON.parse(row.value) as FiscalData;
        setData({ iss_rate: parsed.iss_rate ?? DEFAULTS.iss_rate, service_tax_rate: parsed.service_tax_rate ?? DEFAULTS.service_tax_rate });
      } catch { setData(DEFAULTS); }
      if (row.updated_by) {
        const { data: u } = await supabase.from('profiles').select('name').eq('id', row.updated_by).maybeSingle();
        if (u?.name) setUpdaterName(u.name);
      }
    }
  }

  async function saveSetting(field: keyof FiscalData, rawValue: string, setSaving: (b: boolean) => void, setEditing: (b: boolean) => void) {
    const num = parseFloat(rawValue.replace(',', '.'));
    if (isNaN(num) || num < 0 || num > 100) {
      toast.error('Informe um valor entre 0 e 100.');
      return;
    }
    setSaving(true);
    try {
      const newData: FiscalData = { ...data, [field]: num };
      const payload = {
        value: JSON.stringify(newData),
        updated_at: new Date().toISOString(),
        updated_by: profile.id,
      };
      if (record) {
        await supabase.from('app_settings').update(payload).eq('id', SETTING_ID);
      } else {
        await supabase.from('app_settings').insert([{ id: SETTING_ID, ...payload }]);
      }
      setData(newData);
      setEditing(false);
      await fetchSettings();
      await logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Atualização de Configuração Fiscal',
        details: `${field === 'iss_rate' ? 'ISS' : 'Taxa de Serviço'}: ${num}%`,
        type: 'update',
      });
      toast.success('Configuração fiscal atualizada.');
    } catch {
      toast.error('Erro ao salvar configuração.');
    } finally {
      setSaving(false);
    }
  }

  const lastUpdate = record?.updated_at
    ? format(new Date(record.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
    : null;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="p-3 bg-neutral-900 rounded-xl shrink-0">
          <Receipt className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-neutral-900">Configurações Fiscais</h2>
          <p className="text-sm text-neutral-500 mt-0.5">
            Defina as alíquotas de impostos e taxas aplicadas nos folios e vouchers do hotel.
          </p>
        </div>
      </div>

      {/* Aviso */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800">
          Alterações aqui <strong>não afetam retroativamente</strong> reservas já criadas. Os novos percentuais serão aplicados nas próximas reservas. Empresas com isenção podem desativar o imposto individualmente em cada reserva.
        </p>
      </div>

      {/* ISS */}
      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-neutral-100 flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Percent className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-neutral-900">ISS — Imposto Sobre Serviços</h3>
            <p className="text-xs text-neutral-500">Imposto municipal obrigatório sobre prestação de serviços de hospedagem.</p>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Alíquota atual</p>
              <p className="text-3xl font-bold text-neutral-900 tabular-nums">{data.iss_rate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%</p>
              <p className="text-[11px] text-neutral-400 mt-1">Macaé/RJ — Lei Municipal vigente</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Referência legal</p>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Info className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                  <span className="text-xs text-neutral-600">LC 116/2003 — ISS Federal</span>
                </div>
                <div className="flex items-center gap-2">
                  <Info className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                  <span className="text-xs text-neutral-600">Serviço 9.01 — Hospedagem</span>
                </div>
                <div className="flex items-center gap-2">
                  <Info className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                  <span className="text-xs text-neutral-600">Faixa: 2% a 5% (municipal)</span>
                </div>
              </div>
            </div>
          </div>

          {editingIss ? (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={issInput}
                  onChange={e => setIssInput(e.target.value)}
                  placeholder={`${data.iss_rate}`}
                  autoFocus
                  className="w-full pl-4 pr-10 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 tabular-nums"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">%</span>
              </div>
              <button
                onClick={() => saveSetting('iss_rate', issInput, setSavingIss, setEditingIss)}
                disabled={savingIss}
                className="flex items-center gap-1.5 px-4 py-2 bg-neutral-900 text-white text-sm font-bold rounded-lg disabled:opacity-50"
              >
                {savingIss ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar
              </button>
              <button onClick={() => setEditingIss(false)} className="px-4 py-2 text-sm font-bold text-neutral-500 rounded-lg hover:bg-neutral-100">
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setIssInput(String(data.iss_rate)); setEditingIss(true); }}
              className="flex items-center gap-2 px-4 py-2 border border-neutral-200 rounded-lg text-sm font-bold text-neutral-700 hover:bg-neutral-50 transition-all"
            >
              <Percent className="w-4 h-4" />
              Editar alíquota ISS
            </button>
          )}
        </div>
      </div>

      {/* Taxa de Serviço */}
      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-neutral-100 flex items-center gap-3">
          <div className="p-2 bg-purple-50 rounded-lg">
            <Percent className="w-4 h-4 text-purple-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-neutral-900">Taxa de Serviço</h3>
            <p className="text-xs text-neutral-500">Cobrança hoteleira sobre serviços prestados durante a estadia.</p>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Alíquota atual</p>
              <p className="text-3xl font-bold text-neutral-900 tabular-nums">{data.service_tax_rate.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}%</p>
              <p className="text-[11px] text-neutral-400 mt-1">Padrão hoteleiro nacional</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Observações</p>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Info className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                  <span className="text-xs text-neutral-600">Não obrigatória por lei</span>
                </div>
                <div className="flex items-center gap-2">
                  <Info className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                  <span className="text-xs text-neutral-600">Pode ser isenta por convênio</span>
                </div>
                <div className="flex items-center gap-2">
                  <Info className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                  <span className="text-xs text-neutral-600">Geralmente 10% do subtotal</span>
                </div>
              </div>
            </div>
          </div>

          {editingService ? (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  value={serviceInput}
                  onChange={e => setServiceInput(e.target.value)}
                  placeholder={`${data.service_tax_rate}`}
                  autoFocus
                  className="w-full pl-4 pr-10 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 tabular-nums"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">%</span>
              </div>
              <button
                onClick={() => saveSetting('service_tax_rate', serviceInput, setSavingService, setEditingService)}
                disabled={savingService}
                className="flex items-center gap-1.5 px-4 py-2 bg-neutral-900 text-white text-sm font-bold rounded-lg disabled:opacity-50"
              >
                {savingService ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar
              </button>
              <button onClick={() => setEditingService(false)} className="px-4 py-2 text-sm font-bold text-neutral-500 rounded-lg hover:bg-neutral-100">
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setServiceInput(String(data.service_tax_rate)); setEditingService(true); }}
              className="flex items-center gap-2 px-4 py-2 border border-neutral-200 rounded-lg text-sm font-bold text-neutral-700 hover:bg-neutral-50 transition-all"
            >
              <Percent className="w-4 h-4" />
              Editar taxa de serviço
            </button>
          )}
        </div>
      </div>

      {/* Última atualização */}
      {lastUpdate && (
        <div className="flex items-center gap-3 p-4 bg-neutral-50 border border-neutral-200 rounded-xl">
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <div className="flex items-center gap-1.5 text-xs text-neutral-600">
              <Clock className="w-3.5 h-3.5 text-neutral-400" />
              <span>Última atualização: <strong>{lastUpdate}</strong></span>
            </div>
            {updaterName && (
              <div className="flex items-center gap-1.5 text-xs text-neutral-600">
                <User className="w-3.5 h-3.5 text-neutral-400" />
                <span>Por: <strong>{updaterName}</strong></span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
