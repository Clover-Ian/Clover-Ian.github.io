/**
 * 网站在线状态：登录后定时上报"最后在线时间"。
 * 只记录网站上的活动，桌面 App 不算。
 */
(() => {
  const client = window.iysSupabase;
  if (!client) return;

  const HEARTBEAT = 30_000;   // 每 30 秒一次

  let userID = null;
  let timer = null;

  async function beat() {
    if (!userID) return;
    if (document.visibilityState !== 'visible') return;
    try {
      const { error } = await client.rpc('touch_presence', { p_online: true });
      if (error) console.warn('[presence] 上报失败：', error.message);
    } catch (error) {
      console.warn('[presence] 上报异常：', error);
    }
  }

  /// 关闭页面时用 keepalive 直接发 REST 请求：
  /// 普通 fetch 会在页面卸载时被取消，导致 online 一直停在 true。
  function markOffline() {
    if (!userID) return;
    try {
      const url = new URL(`${window.IYS_SUPABASE_URL}/rest/v1/rpc/touch_presence`);

      const token = sessionToken();
      const headers = {
        'apikey': window.IYS_SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      fetch(url.toString(), {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ p_online: false }),
        keepalive: true,
      }).catch(() => {});
    } catch (error) {
      /* 失败也不要紧，服务器还有 90 秒兜底 */
    }
  }

  function sessionToken() {
    try {
      const raw = localStorage.getItem('sb-qbkfdhmjogdwtjovqzaw-auth-token');
      if (!raw) return null;
      return JSON.parse(raw)?.access_token ?? null;
    } catch {
      return null;
    }
  }

  async function init() {
    const { data } = await client.auth.getSession();
    userID = data?.session?.user?.id ?? null;
    if (!userID) return;

    await beat();
    timer = window.setInterval(beat, HEARTBEAT);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        beat();
      } else {
        // 切走就当离线（标签页还开着，但人不在看）
        markOffline();
      }
    });

    // 关页面/刷新前标记离线
    window.addEventListener('pagehide', () => setOnline(false));
    window.addEventListener('beforeunload', () => setOnline(false));
    window.addEventListener('beforeunload', () => {
      if (timer) window.clearInterval(timer);
    });
  }

  init();
})();
