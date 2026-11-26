/**
 * 全站公告：显示所有已发布的公告，最新的在最上面。
 * 不依赖 supabase.js —— 直接 fetch，页面刚开始解析就能显示（不用等大库加载完）。
 */
(() => {
  const SUPABASE_URL = window.IYS_SUPABASE_URL || 'https://qbkfdhmjogdwtjovqzaw.supabase.co';
  const SUPABASE_KEY = window.IYS_SUPABASE_KEY || 'sb_publishable_n04Iayrnlhn4aznjtLa0Rg_gSJqdBTS';
  const CACHE_KEY = 'iys.announcements.v1';

  function stamp(iso) {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  function renderItem(item) {
    const bar = document.createElement('aside');
    bar.className = `announcement-bar is-${item.level}`;
    bar.setAttribute('role', 'status');

    const body = document.createElement('div');
    body.className = 'announcement-body';

    const head = document.createElement('div');
    head.className = 'announcement-head';

    const badge = document.createElement('span');
    badge.className = `announcement-level is-${item.level}`;
    badge.textContent = item.level;
    head.append(badge);

    const title = document.createElement('p');
    title.className = 'announcement-title';
    title.textContent = item.title;
    head.append(title);

    const meta = document.createElement('span');
    meta.className = 'announcement-date';
    meta.textContent = stamp(item.created_at);
    head.append(meta);

    const text = document.createElement('p');
    text.className = 'announcement-text';
    text.textContent = item.body;

    body.append(head, text);
    bar.append(body);
    return bar;
  }

  function paint(items) {
    if (!Array.isArray(items) || !items.length) return false;
    const main = document.querySelector('main');
    if (!main) return false;

    const list = document.createElement('section');
    list.className = 'announcement-list';
    list.setAttribute('aria-label', 'Announcements');
    items.forEach((item) => list.append(renderItem(item)));

    main.querySelector('.announcement-list')?.remove();
    main.prepend(list);
    return true;
  }

  function cached() {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
    } catch {
      return [];
    }
  }

  async function fetchAnnouncements() {
    const url = `${SUPABASE_URL}/rest/v1/announcements`
      + '?select=id,title,body,level,created_at&published=eq.true&order=created_at.desc&limit=20';

    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (!Array.isArray(data) || !data.length) return false;

    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch { /* 忽略 */ }

    return paint(data);
  }

  // 1) 有缓存就立刻画（不等网络）
  if (!paint(cached())) {
    // 2) 没缓存：马上请求，失败再重试
    (async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          if (await fetchAnnouncements()) return;
        } catch (error) {
          console.warn('[announcements] 读取失败：', error);
        }
        await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
      }
    })();
  } else {
    // 已经显示了旧内容，后台静默刷新
    fetchAnnouncements().catch(() => {});
  }
})();
