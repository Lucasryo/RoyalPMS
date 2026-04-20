import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { BankAccount } from '../types';
import { Plus, Trash2, Edit2, Check, X, Landmark, CreditCard, Key, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

export default function BankAccountsManager() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    institution: '',
    bank_name: '',
    agency: '',
    account: '',
    pix_key: '',
    is_default: false
  });

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .order('bank_name', { ascending: true });
      
      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      console.error("Error fetching bank accounts:", error);
      toast.error('Erro ao carregar contas bancárias.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.institution || !formData.bank_name || !formData.agency || !formData.account || !formData.pix_key) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }

    try {
      if (editingId) {
        const { error } = await supabase
          .from('bank_accounts')
          .update(formData)
          .eq('id', editingId);
        if (error) throw error;
        toast.success('Conta bancária atualizada!');
      } else {
        const { error } = await supabase
          .from('bank_accounts')
          .insert([formData]);
        if (error) throw error;
        toast.success('Conta bancária cadastrada!');
      }
      
      setFormData({
        institution: '',
        bank_name: '',
        agency: '',
        account: '',
        pix_key: '',
        is_default: false
      });
      setIsAdding(false);
      setEditingId(null);
      fetchAccounts();
    } catch (error) {
      console.error("Error saving bank account:", error);
      toast.error('Erro ao salvar conta bancária.');
    }
  };

  const handleEdit = (account: BankAccount) => {
    setFormData({
      institution: account.institution,
      bank_name: account.bank_name,
      agency: account.agency,
      account: account.account,
      pix_key: account.pix_key,
      is_default: account.is_default || false
    });
    setEditingId(account.id);
    setIsAdding(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta conta bancária?')) return;
    try {
      const { error } = await supabase
        .from('bank_accounts')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success('Conta excluída com sucesso!');
      fetchAccounts();
    } catch (error) {
      console.error("Error deleting bank account:", error);
      toast.error('Erro ao excluir conta.');
    }
  };

  if (loading && accounts.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">Contas Bancárias</h2>
          <p className="text-sm text-neutral-500">Gerencie as contas para exibição nos vouchers.</p>
        </div>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="bg-neutral-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-neutral-800 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nova Conta
          </button>
        )}
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm"
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-neutral-500 uppercase">Instituição (Ex: Banco do Brasil)</label>
                  <input
                    type="text"
                    value={formData.institution}
                    onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
                    className="w-full px-4 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900"
                    placeholder="Nome da Instituição"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-neutral-500 uppercase">Nome Exibição (Ex: BANCO DO BRASIL)</label>
                  <input
                    type="text"
                    value={formData.bank_name}
                    onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                    className="w-full px-4 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900"
                    placeholder="Como aparecerá no PDF"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-neutral-500 uppercase">Agência</label>
                  <input
                    type="text"
                    value={formData.agency}
                    onChange={(e) => setFormData({ ...formData, agency: e.target.value })}
                    className="w-full px-4 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900"
                    placeholder="0000-0"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-neutral-500 uppercase">Conta</label>
                  <input
                    type="text"
                    value={formData.account}
                    onChange={(e) => setFormData({ ...formData, account: e.target.value })}
                    className="w-full px-4 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900"
                    placeholder="00000-0"
                  />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-neutral-500 uppercase">Chave PIX</label>
                  <input
                    type="text"
                    value={formData.pix_key}
                    onChange={(e) => setFormData({ ...formData, pix_key: e.target.value })}
                    className="w-full px-4 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900"
                    placeholder="E-mail, CPF, CNPJ ou Chave Aleatória"
                  />
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={formData.is_default}
                  onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                  className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
                />
                <label htmlFor="isDefault" className="text-sm font-medium text-neutral-700 cursor-pointer">
                  Definir como conta padrão
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setEditingId(null);
                    setFormData({
                      institution: '',
                      bank_name: '',
                      agency: '',
                      account: '',
                      pix_key: '',
                      is_default: false
                    });
                  }}
                  className="px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-neutral-900 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-neutral-800 transition-colors flex items-center gap-2"
                >
                  {editingId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {editingId ? 'Salvar Alterações' : 'Cadastrar Conta'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {accounts.map((account) => (
          <motion.div
            key={account.id}
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`p-6 rounded-xl border ${account.is_default ? 'border-amber-200 bg-amber-50/30' : 'border-neutral-200 bg-white'} shadow-sm relative group`}
          >
            {account.is_default && (
              <div className="absolute top-4 right-4 bg-amber-100 text-amber-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full">
                Padrão
              </div>
            )}
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-neutral-100 rounded-lg">
                  <Landmark className="w-5 h-5 text-neutral-600" />
                </div>
                <div>
                  <h3 className="font-bold text-neutral-900">{account.bank_name}</h3>
                  <p className="text-xs text-neutral-500">{account.institution}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-3 h-3 text-neutral-400" />
                  <div className="text-xs">
                    <p className="text-neutral-400 font-medium uppercase text-[8px]">Agência</p>
                    <p className="text-neutral-700 font-mono">{account.agency}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <CreditCard className="w-3 h-3 text-neutral-400" />
                  <div className="text-xs">
                    <p className="text-neutral-400 font-medium uppercase text-[8px]">Conta</p>
                    <p className="text-neutral-700 font-mono">{account.account}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 bg-neutral-50 rounded-lg border border-neutral-100">
                <Key className="w-3 h-3 text-amber-500" />
                <div className="text-xs overflow-hidden">
                  <p className="text-neutral-400 font-medium uppercase text-[8px]">Chave PIX</p>
                  <p className="text-neutral-700 truncate">{account.pix_key}</p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleEdit(account)}
                  className="p-2 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-all"
                  title="Editar"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(account.id)}
                  className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                  title="Excluir"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
        {accounts.length === 0 && !isAdding && (
          <div className="col-span-full py-12 text-center bg-neutral-50 rounded-xl border border-dashed border-neutral-200">
            <Landmark className="w-12 h-12 text-neutral-200 mx-auto mb-4" />
            <p className="text-neutral-400 font-medium">Nenhuma conta bancária cadastrada.</p>
            <button
              onClick={() => setIsAdding(true)}
              className="mt-4 text-neutral-900 font-bold text-sm hover:underline"
            >
              Cadastrar primeira conta
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
