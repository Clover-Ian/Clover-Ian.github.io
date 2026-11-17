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

  async function init() {
    const { data, error } = await client
      .from('announcements')
      .select('id, title, body, level, created_at')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error || !data?.length) return;

    const list = document.createElement('section');
    list.className = 'announcement-list';
    list.setAttribute('aria-label', 'Announcements');

    data.forEach((item) => list.append(renderItem(item)));

    const main = document.querySelector('main');
    if (main) main.prepend(list);
  }

  init();
})();
