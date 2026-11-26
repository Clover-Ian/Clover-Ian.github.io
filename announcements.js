/**
 * 全站公告：显示所有已发布的公告，最新的在最上面。
 * 不再只显示一条，也不提供关闭按钮——不用的公告在 IYS User 里删掉即可。
 */
(() => {
  const client = window.iysSupabase;
  if (!client) return;

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

  const CACHE_KEY = 'iys.announcements.v1';

  /* 先用上次的缓存立刻显示，网络好了再刷新 */
  function paintCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!Array.isArray(data) || !data.length) return;

      const list = document.createElement('section');
      list.className = 'announcement-list';
      list.setAttribute('aria-label', 'Announcements');
      data.forEach((item) => list.append(renderItem(item)));

      const main = document.querySelector('main');
      if (main) {
        main.querySelector('.announcement-list')?.remove();
        main.prepend(list);
      }
    } catch { /* 忽略 */ }
  }

  async function fetchAnnouncements() {
    const { data, error } = await client
      .from('announcements')
      .select('id, title, body, level, created_at')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error || !data?.length) return false;

    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch { /* 忽略 */ }

    const list = document.createElement('section');
    list.className = 'announcement-list';
    list.setAttribute('aria-label', 'Announcements');

    data.forEach((item) => list.append(renderItem(item)));

    const main = document.querySelector('main');
    if (main) {
      main.querySelector('.announcement-list')?.remove();
      main.prepend(list);
    }
    return true;
  }

  async function init() {
    paintCache();

    // 网络不稳：最多试 3 次，拿到就停
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        if (await fetchAnnouncements()) return;
      } catch (error) {
        console.warn('[announcements] 读取失败：', error);
      }
      await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
    }
  }

  init();
})();
