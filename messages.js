/**
 * 站内消息：登录后显示管理员发给你的消息。
 * 读过的会记在服务器（read_at），换设备也不会重复提醒。
 */
(() => {
  const client = window.iysSupabase;
  if (!client) return;

  function stamp(iso) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function render(item) {
    const bar = document.createElement('aside');
    bar.className = 'announcement-bar is-message';
    bar.setAttribute('role', 'status');

    const body = document.createElement('div');
    body.className = 'announcement-body';

    const title = document.createElement('a');
    title.className = 'announcement-title';
    title.href = 'IYS Inbox.html';
    title.style.textDecoration = 'none';
    title.style.color = 'inherit';
    title.textContent = item.title;

    const text = document.createElement('p');
    text.className = 'announcement-text';
    text.textContent = item.body;

    const meta = document.createElement('p');
    meta.className = 'announcement-meta';
    meta.textContent = `From IYS · ${stamp(item.created_at)} · reply in your inbox`;

    body.append(title, text, meta);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'announcement-close';
    close.setAttribute('aria-label', 'Mark as read');
    close.textContent = '×';
    close.addEventListener('click', async () => {
      bar.remove();
      await client.from('user_messages')
        .update({ read_by_user: true })
        .eq('id', item.id);
    });

    bar.append(body, close);
    const main = document.querySelector('main');
    if (main) main.prepend(bar);
  }

  async function init() {
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData?.session?.user) return;

    const { data, error } = await client
      .from('user_messages')
      .select('id, title, body, created_at, read_by_user')
      .eq('sender', 'admin')
      .eq('read_by_user', false)
      .order('created_at', { ascending: false })
      .limit(3);

    if (error || !data?.length) return;
    data.forEach(render);
  }

  init();
})();
