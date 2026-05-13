import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 
  'https://xhbzfdjwuaejhysxtrfl.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoYnpmZGp3dWFlamh5c3h0cmZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MDEwNzIsImV4cCI6MjA5NDE3NzA3Mn0.zjhuKvgpL-g9XTxTKU36bqMb32RwCFtsfJ5cpQ6zMeg';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const getDeviceId = () => {
  let id = localStorage.getItem('dawnmind_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('dawnmind_device_id', id);
  }
  return id;
};
