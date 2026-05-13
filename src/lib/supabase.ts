import { createClient } from '@supabase/supabase-js';

let supabaseInstance: ReturnType<typeof createClient> | null = null;

export const getSupabase = () => {
  if (supabaseInstance) return supabaseInstance;

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('Supabase URL or Anon Key is missing. Database features will be disabled until configured.');
    return null;
  }

  supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supabaseInstance;
};

// Generate unique device ID
export const getDeviceId = () => {
  let id = localStorage.getItem('dawnmind_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('dawnmind_device_id', id);
  }
  return id;
};
