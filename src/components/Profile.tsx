import { useState } from 'react';
import { supabase } from '../supabase';
import { UserProfile } from '../types';
import { User, Camera, Save, Loader2, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';

export default function Profile({ profile, onBack }: { profile: UserProfile, onBack: () => void }) {
  const [name, setName] = useState(profile.name);
  const [photoURL, setPhotoURL] = useState(profile.photo_url || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('O nome não pode estar vazio.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          name,
          photo_url: photoURL
        })
        .eq('id', profile.id);
      
      if (error) throw error;

      toast.success('Perfil atualizado com sucesso!');
      // Note: In a real app, we'd update the global state here.
      // For this app, the parent will re-fetch or the user can refresh.
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error('Erro ao atualizar perfil.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-neutral-500 hover:text-neutral-900 mb-8 transition-colors group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        Voltar para o Dashboard
      </button>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden"
      >
        <div className="p-8 border-b border-neutral-100 bg-neutral-50 flex items-center gap-4">
          <div className="w-16 h-16 bg-neutral-900 rounded-2xl flex items-center justify-center text-white">
            <User className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-900">Meu Perfil</h2>
            <p className="text-neutral-500 text-sm">Gerencie suas informações pessoais</p>
          </div>
        </div>

        <div className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-neutral-700">Foto de Perfil (URL)</label>
            <div className="flex gap-4 items-center">
              <div className="w-20 h-20 rounded-full bg-neutral-100 border-2 border-neutral-200 overflow-hidden flex-shrink-0">
                {photoURL ? (
                  <img src={photoURL} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-300">
                    <Camera className="w-8 h-8" />
                  </div>
                )}
              </div>
              <input 
                type="url" 
                value={photoURL}
                onChange={(e) => setPhotoURL(e.target.value)}
                placeholder="https://exemplo.com/foto.jpg"
                className="flex-1 px-4 py-3 border border-neutral-200 rounded-xl text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900 transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-neutral-700">Nome Completo</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 border border-neutral-200 rounded-xl text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900 transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-neutral-700">E-mail</label>
            <input 
              type="email" 
              value={profile.email}
              disabled
              className="w-full px-4 py-3 border border-neutral-200 rounded-xl text-sm bg-neutral-50 text-neutral-400 cursor-not-allowed"
            />
            <p className="text-[10px] text-neutral-400">O e-mail não pode ser alterado.</p>
          </div>

          <button 
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-neutral-900 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-neutral-800 transition-all disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Save className="w-5 h-5" />
                Salvar Alterações
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
