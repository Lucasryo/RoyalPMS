/**
 * Cliente Supabase para o Royal PMS.
 * Lê as credenciais de variáveis de ambiente Vite (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.error(
    '[supabase] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY ausentes. ' +
    'Configure as variáveis de ambiente antes de subir a aplicação.'
  );
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const SUPABASE_URL = url ?? '';
