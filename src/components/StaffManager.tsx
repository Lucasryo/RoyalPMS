import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { UserProfile, UserPermissions } from '../types';
import { Plus, Search, UserCircle, Trash2, Edit2, Loader2, X as CloseIcon, Shield, Mail, Phone, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { logAudit } from '../lib/audit';
import PermissionsSelector, { DEFAULT_PERMISSIONS } from './PermissionsSelector';

export default function StaffManager({ currentUser }: { currentUser: UserProfile }) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'reservations' as 'admin' | 'reservations' | 'client',
    phone: '',
    status: 'active' as 'active' | 'inactive'
  });
  const [formPermissions, setFormPermissions] = useState<UserPermissions>(DEFAULT_PERMISSIONS['reservations']);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('name');
    
    if (error) {
      toast.error('Erro ao carregar equipe');
    } else {
      setUsers(data || []);
    }
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingUser) {
        const { error } = await supabase
          .from('profiles')
          .update({ ...formData, permissions: formPermissions })
          .eq('id', editingUser.id);
        
        if (error) throw error;
        toast.success('Usuário atualizado com sucesso');
        logAudit({
          user_id: currentUser.id,
          user_name: currentUser.name,
          action: 'Atualizou usuário',
          details: `Usuário: ${formData.email}`,
          type: 'update'
        });
      } else {
        // Enviar convite via Supabase Auth (simulado aqui pois precisamos de permissão admin para criar usuário diretamente)
        toast.info('Para novos usuários, use o fluxo de cadastro por e-mail.');
      }
      setIsModalOpen(false);
      setEditingUser(null);
      fetchUsers();
    } catch (error) {
      toast.error('Erro ao salvar usuário');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(user: UserProfile) {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone || '',
      status: 'active'
    });
    setFormPermissions(user.permissions || DEFAULT_PERMISSIONS[user.role] || DEFAULT_PERMISSIONS['client']);
    setIsModalOpen(true);
  }

  const roleLabels = {
    admin: 'Administrador',
    reservations: 'Recepção / Reservas',
    client: 'Cliente Faturamento'
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">Equipe do Hotel</h2>
          <p className="text-sm text-neutral-500">Gerencie usuários e permissões de acesso ao sistema.</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          type="text"
          placeholder="Buscar funcionário por nome ou email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
        />
      </div>

      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-neutral-50 text-neutral-500 text-[10px] font-bold uppercase tracking-wider">
            <tr>
              <th className="px-6 py-4">Usuário</th>
              <th className="px-6 py-4">Permissão</th>
              <th className="px-6 py-4">Contato</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filteredUsers.map(user => (
              <tr key={user.id} data-focus-id={user.id} className="hover:bg-neutral-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center text-white">
                      <UserCircle className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-neutral-900">{user.name}</p>
                      <p className="text-xs text-neutral-500">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 border-l border-neutral-100">
                  <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${
                    user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 
                    user.role === 'reservations' ? 'bg-blue-100 text-blue-700' : 'bg-neutral-100 text-neutral-600'
                  }`}>
                    {roleLabels[user.role]}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-neutral-500">
                  {user.phone || 'N/A'}
                </td>
                <td className="px-6 py-4">
                  <span className="flex items-center gap-1.5 text-xs text-green-600 font-bold">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
                    Ativo
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => handleEdit(user)} className="p-2 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-50 rounded-lg transition-all">
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl"
          >
            <div className="p-6 border-b border-neutral-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-neutral-900">Editar Permissões</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-neutral-100 rounded-full transition-colors">
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="space-y-4 text-left">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-500 uppercase">Nome Completo</label>
                  <input
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:ring-2 focus:ring-neutral-900/10 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-500 uppercase">Perfil de Acesso</label>
                  <select
                    value={formData.role}
                    onChange={(e) => {
                      const role = e.target.value as any;
                      setFormData({ ...formData, role });
                      setFormPermissions(DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS['client']);
                    }}
                    className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:ring-2 focus:ring-neutral-900/10 focus:outline-none"
                  >
                    <option value="admin">Administrador (Total)</option>
                    <option value="reservations">Recepção / Reservas</option>
                    <option value="client">Cliente Externo</option>
                  </select>
                  <p className="text-[10px] text-neutral-400 mt-1 italic leading-tight">
                    * Administradores podem gerenciar faturamento, equipe e empresas. Recepcionistas gerenciam reservas e tarifários.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-500 uppercase">Permissões Individuais</label>
                  <div className="border border-neutral-200 rounded-xl p-3">
                    <PermissionsSelector
                      permissions={formPermissions}
                      onChange={setFormPermissions}
                      role={formData.role}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-500 uppercase">Status da Conta</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:ring-2 focus:ring-neutral-900/10 focus:outline-none"
                  >
                    <option value="active">Ativo</option>
                    <option value="inactive">Bloqueado</option>
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
                  className="flex-1 px-4 py-2 bg-neutral-900 text-white text-sm font-bold rounded-xl hover:bg-neutral-800 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                  Salvar Alterações
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
