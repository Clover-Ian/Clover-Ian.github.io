/*
 * Supabase 公共配置。
 * publishable key 本来就是给浏览器用的公开密钥，可以出现在源码里；
 * 绝对不要把 secret key / service_role key 写进这个文件。
 */
window.IYS_SUPABASE_URL = 'https://qbkfdhmjogdwtjovqzaw.supabase.co';
window.IYS_SUPABASE_KEY = 'sb_publishable_n04Iayrnlhn4aznjtLa0Rg_gSJqdBTS';

if (window.supabase) {
  window.iysSupabase = window.supabase.createClient(
    window.IYS_SUPABASE_URL,
    window.IYS_SUPABASE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );
} else {
  console.error('Supabase library failed to load.');
}
