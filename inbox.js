/**
 * 用户收件箱：显示与 IYS 的对话，可直接回复。
 */
(() => {
  const client = window.iysSupabase;
  const thread = document.querySelector('[data-inbox-thread]');
  const form = document.querySelector('[data-inbox-form]');
  const gate = document.querySelector('[data-inbox-gate]');
  const feedback = document.querySelector('[data-inbox-feedback]');

  if (!client) return;

  let user = null;

  function setFeedback(message, type = 'error') {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle('is-success', type === 'success');
    feedback.hidden = !message;
  }

  function stamp(iso) {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  function bubble(item) {
    const row = document.createElement('div');
    row.className = `inbox-bubble is-${item.sender}`;

    if (item.title) {
      const title = document.createElement('p');
      title.className = 'inbox-bubble-title';
      title.textContent = item.title;
      row.append(title);
    }

    const body = document.createElement('p');
    body.className = 'inbox-bubble-body';
    body.textContent = item.body;
    row.append(body);

    const time = document.createElement('span');
    time.className = 'inbox-bubble-time';
    time.textContent = stamp(item.created_at);
    row.append(time);

    return row;
  }

  async function loadThread() {
    const { data, error } = await client
      .from('user_messages')
      .select('id, sender, title, body, created_at, read_by_user')
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) {
      setFeedback(error.message);
      return;
    }

    thread.replaceChildren();
    if (!data?.length) {
      thread.innerHTML = '<p class="admin-empty">No messages yet.</p>';
    } else {
      data.forEach((item) => thread.append(bubble(item)));
    }
    thread.hidden = false;
    form.hidden = false;

    // 把管理员发来的标记成已读
    const unread = data.filter((item) => item.sender === 'admin' && !item.read_by_user).map((item) => item.id);
    if (unread.length) {
      await client.from('user_messages')
        .update({ read_by_user: true })
        .in('id', unread);
    }

    thread.scrollTop = thread.scrollHeight;
  }

  async function init() {
    const { data: sessionData } = await client.auth.getSession();
    user = sessionData?.session?.user;
    if (!user) {
      gate.hidden = false;
      return;
    }
    await loadThread();
  }

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const field = form.querySelector('[name="body"]');
      const body = field.value.trim();
      if (!body || !user) return;

      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const { error } = await client.from('user_messages').insert({
          user_id: user.id,
          sender: 'user',
          title: '',
          body,
        });
        if (error) throw error;
        field.value = '';
        setFeedback('Reply sent.', 'success');
        await loadThread();
      } catch (error) {
        setFeedback(error.message ?? 'Could not send your reply.');
      } finally {
        button.disabled = false;
      }
    });
  }

  init();
})();
