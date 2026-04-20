import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { Company, UserProfile } from '../types';
import { Plus, Search, Building2, Trash2, Edit2, Loader2, X as CloseIcon, Globe, MapPin, Mail, Phone, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { logAudit } from '../lib/audit';

export default function CompanyManager({ profile }: { profile: UserProfile }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    cnpj: '',
    email: '',
    phone: '',
    address: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
    slug: ''
  });

  useEffect(() => {
    fetchCompanies();
  }, []);

  async function fetchCompanies() {
    setLoading(true);
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('name');
    
    if (error) {
      toast.error('Erro ao carregar empresas');
    } else {
      setCompanies(data || []);
    }
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingCompany) {
        const { error } = await supabase
          .from('companies')
          .update(formData)
          .eq('id', editingCompany.id);
        
        if (error) throw error;
        toast.success('Empresa atualizada com sucesso');
        logAudit({
          user_id: profile.id,
          user_name: profile.name,
          action: 'Atualizou empresa',
          details: `Empresa: ${formData.name}`,
          type: 'update'
        });
      } else {
        const { error } = await supabase
          .from('companies')
          .insert([{ ...formData, created_at: new Date().toISOString() }]);
        
        if (error) throw error;
        toast.success('Empresa cadastrada com sucesso');
        logAudit({
          user_id: profile.id,
          user_name: profile.name,
          action: 'Cadastrou empresa',
          details: `Empresa: ${formData.name}`,
          type: 'create'
        });
      }
      setIsModalOpen(false);
      setEditingCompany(null);
      resetForm();
      fetchCompanies();
    } catch (error) {
      toast.error('Erro ao salvar empresa');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setFormData({
      name: '',
      cnpj: '',
      email: '',
      phone: '',
      address: '',
      status: 'ACTIVE',
      slug: ''
    });
  }

  function handleEdit(company: Company) {
    setEditingCompany(company);
    setFormData({
      name: company.name,
      cnpj: company.cnpj || '',
      email: company.email || '',
      phone: company.phone || '',
      address: company.address || '',
      status: company.status || 'ACTIVE',
      slug: company.slug || ''
    });
    setIsModalOpen(true);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Deseja realmente excluir a empresa ${name}?`)) return;

    const { error } = await supabase
      .from('companies')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Erro ao excluir empresa');
    } else {
      toast.success('Empresa excluída');
      logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Excluiu empresa',
        details: `Empresa: ${name}`,
        type: 'delete'
      });
      fetchCompanies();
    }
  }

  const filteredCompanies = companies.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.cnpj?.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">Gestão de Empresas</h2>
          <p className="text-sm text-neutral-500">Cadastre e gerencie faturamentos diretos e parceiros.</p>
        </div>
        <button
          onClick={() => { resetForm(); setEditingCompany(null); setIsModalOpen(true); }}
          className="flex items-center gap-2 bg-neutral-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-neutral-800 transition-all shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Nova Empresa
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          type="text"
          placeholder="Buscar empresa por nome ou CNPJ..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence>
          {filteredCompanies.map(company => (
            <motion.div
              layout
              key={company.id}
              data-focus-id={company.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm hover:shadow-md transition-all group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-neutral-100 rounded-xl group-hover:bg-neutral-900 group-hover:text-white transition-colors">
                  <Building2 className="w-6 h-6" />
                </div>
                <div className="flex gap-1">
                  <button onClick={() => handleEdit(company)} className="p-2 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-50 rounded-lg transition-all">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(company.id, company.name)} className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <h3 className="font-bold text-neutral-900 truncate" title={company.name}>{company.name}</h3>
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{company.cnpj || 'Sem CNPJ'}</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-neutral-500">
                    <Mail className="w-3 h-3" />
                    <span className="truncate">{company.email || 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-500">
                    <Phone className="w-3 h-3" />
                    <span>{company.phone || 'N/A'}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-neutral-100 flex justify-between items-center">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                    company.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {company.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                  </span>
                  <div className="flex items-center gap-1 text-[10px] text-neutral-400">
                    <Globe className="w-3 h-3" />
                    <span>{company.slug || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
          >
            <div className="p-6 border-b border-neutral-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-neutral-900">{editingCompany ? 'Editar Empresa' : 'Nova Empresa'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-neutral-100 rounded-full transition-colors">
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-500 uppercase">Nome da Empresa</label>
                  <input
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:ring-2 focus:ring-neutral-900/10 focus:outline-none"
                    placeholder="Ex: Hotel Excelsior"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-500 uppercase">CNPJ</label>
                    <input
                      value={formData.cnpj}
                      onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                      className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:ring-2 focus:ring-neutral-900/10 focus:outline-none"
                      placeholder="00.000.000/0001-00"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-500 uppercase">Slug (URL)</label>
                    <input
                      value={formData.slug}
                      onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                      className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:ring-2 focus:ring-neutral-900/10 focus:outline-none"
                      placeholder="hotel-excelsior"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-500 uppercase">E-mail</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:ring-2 focus:ring-neutral-900/10 focus:outline-none"
                      placeholder="contato@empresa.com"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-500 uppercase">Telefone</label>
                    <input
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:ring-2 focus:ring-neutral-900/10 focus:outline-none"
                      placeholder="(00) 0 0000-0000"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-500 uppercase">Endereço</label>
                  <input
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:ring-2 focus:ring-neutral-900/10 focus:outline-none"
                    placeholder="Rua, Número, Bairro, Cidade - UF"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-500 uppercase">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:ring-2 focus:ring-neutral-900/10 focus:outline-none"
                  >
                    <option value="ACTIVE">Ativo</option>
                    <option value="INACTIVE">Inativo</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 text-sm font-bold text-neutral-600 hover:bg-neutral-100 rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-neutral-900 text-white text-sm font-bold rounded-xl hover:bg-neutral-800 shadow-lg shadow-neutral-900/20 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                  {editingCompany ? 'Salvar Alterações' : 'Cadastrar Empresa'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
