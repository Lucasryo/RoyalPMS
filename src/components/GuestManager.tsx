import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { UserProfile } from '../types';
import { Plus, Search, UserCircle, Trash2, Edit2, Loader2, X as CloseIcon, Phone, Mail, FileText, History } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

export default function GuestManager({ profile }: { profile: UserProfile }) {
  const [guests, setGuests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchGuests();
  }, []);

  async function fetchGuests() {
    setLoading(true);
    // Para simplificar, estamos pegando hóspedes que já se cadastraram no sistema
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'client')
      .order('name');
    
    if (error) {
      toast.error('Erro ao carregar hóspedes');
    } else {
      setGuests(data || []);
    }
    setLoading(false);
  }

  const filteredGuests = guests.filter(g => 
    g.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    g.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">Cadastro de Hóspedes</h2>
          <p className="text-sm text-neutral-500">Histórico e perfis de clientes que utilizam o faturamento direto.</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          type="text"
          placeholder="Buscar hóspede por nome ou e-mail..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredGuests.map(guest => (
          <motion.div
            layout
            key={guest.id}
            className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400">
                <UserCircle className="w-8 h-8" />
              </div>
              <div>
                <h3 className="font-bold text-neutral-900 line-clamp-1">{guest.name}</h3>
                <p className="text-xs text-neutral-500">{guest.email}</p>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <Phone className="w-4 h-4" />
                <span>{guest.phone || 'Não informado'}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <History className="w-4 h-4" />
                <span>Último faturamento: {new Date(guest.created_at).toLocaleDateString('pt-BR')}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-neutral-100 flex gap-2">
              <button
                onClick={() => {
                  try {
                    sessionStorage.setItem('focusTarget', JSON.stringify({ type: 'company', id: guest.company_id || guest.id, name: guest.name }));
                    sessionStorage.setItem('navigateTo', 'finance');
                    window.dispatchEvent(new CustomEvent('app:navigate', { detail: { view: 'finance' } }));
                  } catch (_) {}
                  toast.info('Abrindo fichas do hóspede em Finanças...');
                }}
                className="flex-1 flex items-center justify-center gap-2 py-2 bg-neutral-900 text-white rounded-lg text-[10px] font-bold uppercase hover:bg-neutral-800 transition-colors"
              >
                <FileText className="w-3 h-3" />
                Ver Fichas
              </button>
              <a
                href={guest.email ? `mailto:${guest.email}` : undefined}
                onClick={(e) => { if (!guest.email) { e.preventDefault(); toast.warning('Hóspede sem e-mail cadastrado'); } }}
                className="flex-1 flex items-center justify-center gap-2 py-2 bg-neutral-100 text-neutral-700 rounded-lg text-[10px] font-bold uppercase hover:bg-neutral-200 transition-colors"
              >
                <Mail className="w-3 h-3" />
                Contato
              </a>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
