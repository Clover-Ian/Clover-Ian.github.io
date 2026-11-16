/**
 * IYS 管理页：只有 admins 表里的人能用。
 * 目前能发布 / 隐藏 / 删除公告。
 */
(() => {
  const client = window.iysSupabase;
  const gate = document.querySelector('[data-admin-gate]');
  const panel = document.querySelector('[data-admin-panel]');
  const feedback = document.querySelector('[data-admin-feedback]');
  const form = document.querySelector('[data-admin-form]');
  const list = document.querySelector('[data-admin-list]');

  if (!client) {
    setFeedback('Account service is not available.');
    return;
  }

  function setFeedback(message, type = 'error') {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle('is-success', type === 'success');
    feedback.hidden = !message;
  }

  function showGate(message) {
    if (gate) {
      gate.textContent = message;
      gate.hidden = false;
    }
    if (panel) panel.hidden = true;
  }

  function stamp(iso) {
    const date = new Date(iso);
    return date.toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  async function loadAnnouncements() {
    if (!list) return;
    const { data, error } = await client
      .from('announcements')
      .select('id, title, body, level, published, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      setFeedback(error.message);
      return;
    }
    list.innerHTML = '';
    if (!data?.length) {
      list.innerHTML = '<p class="admin-empty">No announcements yet.</p>';
      return;
    }
    for (const item of data) {
      const row = document.createElement('article');
      row.className = 'admin-item';
      if (!item.published) row.classList.add('is-draft');

      const head = document.createElement('div');
      head.className = 'admin-item-head';

      const badge = document.createElement('span');
      badge.className = `announcement-level is-${item.level}`;
      badge.textContent = item.level;
      head.append(badge);

      const title = document.createElement('h3');
      title.textContent = item.title;
      head.append(title);

      if (!item.published) {
        const draft = document.createElement('span');
        draft.className = 'admin-draft';
        draft.textContent = 'hidden';
        head.append(draft);
      }

      const time = document.createElement('span');
      time.className = 'admin-time';
      time.textContent = stamp(item.created_at);
      head.append(time);
      row.append(head);

      const body = document.createElement('p');
      body.className = 'admin-item-body';
      body.textContent = item.body;
      row.append(body);

      const actions = document.createElement('div');
      actions.className = 'admin-item-actions';

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'admin-link';
      toggle.textContent = item.published ? 'Hide' : 'Publish';
      toggle.addEventListener('click', () => setPublished(item.id, !item.published));
      actions.append(toggle);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'admin-link is-danger';
      remove.textContent = 'Delete';
      remove.addEventListener('click', () => removeAnnouncement(item.id, item.title));
      actions.append(remove);

      row.append(actions);
      list.append(row);
    }
  }

  async function setPublished(id, published) {
    const { error } = await client.from('announcements').update({ published }).eq('id', id);
    if (error) {
      setFeedback(error.message);
      return;
    }
    await loadAnnouncements();
  }

  async function removeAnnouncement(id, title) {
    if (!window.confirm(`Delete “${title}”?`)) return;
    const { error } = await client.from('announcements').delete().eq('id', id);
    if (error) {
      setFeedback(error.message);
      return;
    }
    setFeedback('Announcement deleted.', 'success');
    await loadAnnouncements();
  }

  async function init() {
    const { data: sessionData } = await client.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) {
      showGate('Sign in with your IYS account to open this page.');
      return;
    }

    const { data: admin, error } = await client.rpc('is_admin');
    if (error) {
      showGate(`Could not check permissions: ${error.message}`);
      return;
    }
    if (admin !== true) {
      showGate('This page is for IYS staff accounts.');
      return;
    }

    if (gate) gate.hidden = true;
    if (panel) panel.hidden = false;
    await loadAnnouncements();
  }

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const title = form.querySelector('[name="title"]').value.trim();
      const body = form.querySelector('[name="body"]').value.trim();
      const level = form.querySelector('[name="level"]').value;
      if (!title || !body) return;

      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const { data: sessionData } = await client.auth.getSession();
        const { error } = await client.from('announcements').insert({
          title,
          body,
          level,
          published: true,
          author_id: sessionData?.session?.user?.id ?? null,
        });
        if (error) throw error;
        form.reset();
        setFeedback('Announcement published.', 'success');
        await loadAnnouncements();
      } catch (error) {
        setFeedback(error.message ?? 'Could not publish.');
      } finally {
        button.disabled = false;
      }
    });
  }

  init();
})();
