import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID?.trim();
const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseUrl = configuredUrl || (projectId ? `https://${projectId}.supabase.co` : '');
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || '';

let client: SupabaseClient | null = null;

export const getSupabaseClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_PROJECT_ID (or VITE_SUPABASE_URL) and VITE_SUPABASE_ANON_KEY in your .env file.',
    );
  }

  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return client;
};

export const isSupabaseConfigured = () => Boolean(supabaseUrl && supabaseAnonKey);
