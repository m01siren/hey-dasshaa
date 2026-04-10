import { createClient } from '@supabase/supabase-js';

let _client;

export function getSupabase() {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('Задайте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env');
    }
    if (key.startsWith('sb_publishable_')) {
      throw new Error(
        'В SUPABASE_SERVICE_ROLE_KEY передан publishable-ключ. Нужен service_role secret: Supabase -> Project Settings -> API.',
      );
    }
    if (!key.startsWith('sb_secret_') && !key.includes('service_role')) {
      console.warn(
        '[supabase] Проверьте ключ: ожидается service_role/secret key (не publishable).',
      );
    }
    _client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}
