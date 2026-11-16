/**
 * 在页面顶部显示最新公告。
 * 关掉之后记住这条 id，除非有新公告，否则不再出现。
 */
(() => {
  const client = window.iysSupabase;
  if (!client) return;

  const SEEN_KEY = 'iys.announcement.seen';

  function render(item) {
    const bar = document.createElement('aside');
    bar.className = `announcement-bar is-${item.level}`;
    bar.setAttribute('role', 'status');

    const body = document.createElement('div');
    body.className = 'announcement-body';

    const title = document.createElement('p');
    title.className = 'announcement-title';
    title.textContent = item.title;

    const text = document.createElement('p');
    text.className = 'announcement-text';
    text.textContent = item.body;

    body.append(title, text);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'announcement-close';
    close.setAttribute('aria-label', 'Dismiss announcement');
    close.textContent = '×';
    close.addEventListener('click', () => {
      bar.remove();
      try {
        localStorage.setItem(SEEN_KEY, item.id);
      } catch {
        /* 忽略隐私模式下的存储失败 */
      }
    });

    bar.append(body, close);

    const main = document.querySelector('main');
    if (main) main.prepend(bar);
  }

  async function init() {
    const { data, error } = await client
      .from('announcements')
      .select('id, title, body, level, created_at')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !data?.length) return;

    const latest = data[0];
    let seen = '';
    try {
      seen = localStorage.getItem(SEEN_KEY) ?? '';
    } catch {
      seen = '';
    }
    if (seen === latest.id) return;

    render(latest);
  }

  init();
})();
