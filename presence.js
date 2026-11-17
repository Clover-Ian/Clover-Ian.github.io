/**
 * 网站在线状态：登录后定时上报"最后在线时间"。
 * 只记录网站上的活动，桌面 App 不算。
 */
(() => {
  const client = window.iysSupabase;
  if (!client) return;

  const HEARTBEAT = 60_000;   // 每分钟一次

  let userID = null;
  let timer = null;

  async function beat() {
    if (!userID) return;
    if (document.visibilityState !== 'visible') return;
    try {
      await client.from('user_presence').upsert(
        {
          user_id: userID,
          last_seen: new Date().toISOString(),
          page: location.pathname.split('/').pop() || 'index.html',
          online: true,
        },
        { onConflict: 'user_id' },
      );
    } catch (error) {
      console.warn('[presence] 上报失败：', error);
    }
  }

  async function markOffline() {
    if (!userID) return;
    try {
      await client.from('user_presence')
        .update({ online: false })
        .eq('user_id', userID);
    } catch (error) {
      /* 关闭页面时失败无所谓，服务器还有 3 分钟兜底 */
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
