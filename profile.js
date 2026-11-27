/**
 * 账号中心：左侧选项卡切换，默认 Profile。
 * 全部走 Supabase 客户端，页面只放表单。
 */
(() => {
  const tabs = Array.from(document.querySelectorAll('.profile-tab'));
  const panels = Array.from(document.querySelectorAll('.profile-panel'));

  const avatarSlot = document.querySelector('[data-profile-avatar]');
  const nameEl = document.querySelector('[data-profile-name]');
  const emailEl = document.querySelector('[data-profile-email]');

  const usernameInput = document.querySelector('[data-username-input]');
  const emailInput = document.querySelector('[data-email-input]');
  const passwordInput = document.querySelector('[data-password-input]');
  const photoInput = document.querySelector('[data-photo-input]');

  function status(key, message, ok = true) {
    const el = document.querySelector(`[data-status="${key}"]`);
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('is-error', !ok);
  }

  function client() {
    return window.iysSupabase;
  }

  async function waitForClient() {
    for (let i = 0; i < 60; i += 1) {
      if (window.iysSupabase) return window.iysSupabase;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  }

  let user = null;

  function pick() {
    tabs.forEach((tab) => {
      tab.classList.toggle('is-active', tab.dataset.tab === current);
    });
    panels.forEach((panel) => {
      panel.classList.toggle('is-active', panel.dataset.panel === current);
    });
  }

  let current = 'profile';

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      current = tab.dataset.tab;
      pick();
    });
  });

  function initials(name) {
    return (name || '?').trim().slice(0, 1).toUpperCase();
  }

  function renderAvatar() {
    const meta = user?.user_metadata ?? {};
    const url = meta.avatar_url || meta.picture;
    avatarSlot.innerHTML = '';
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      avatarSlot.append(img);
    } else {
      avatarSlot.textContent = initials(meta.display_name || user?.email || '');
    }
  }

  async function loadUser() {
    const supabase = await waitForClient();
    if (!supabase) {
      status('profile', 'Account service is unavailable.', false);
      return;
    }

    const { data } = await supabase.auth.getSession();
    if (!data?.session?.user) {
      window.location.replace('IYS Account Sign In.html?next=IYS%20Account%20Profile.html');
      return;
    }

    user = data.session.user;
    const meta = user.user_metadata ?? {};

    renderAvatar();
    nameEl.textContent = meta.display_name || meta.username || (user.email || '').split('@')[0];
    emailEl.textContent = user.email || '';

    usernameInput.value = meta.display_name || meta.username || '';
    emailInput.value = user.email || '';
  }

  document.querySelector('[data-username-save]')?.addEventListener('click', async () => {
    const value = usernameInput.value.trim();
    if (value.length < 3) {
      status('username', 'Use at least 3 characters.', false);
      return;
    }

    const supabase = client();
    status('username', 'Saving…');

    const { error: metaError } = await supabase.auth.updateUser({ data: { display_name: value } });
    if (metaError) {
      status('username', metaError.message, false);
      return;
    }

    await supabase.from('profiles').upsert({ id: user.id, username: value });

    await supabase.auth.refreshSession();
    await loadUser();
    status('username', 'Username updated.');
  });

  document.querySelector('[data-email-save]')?.addEventListener('click', async () => {
    const value = emailInput.value.trim();
    if (!value.includes('@')) {
      status('email', 'Enter a valid email address.', false);
      return;
    }

    status('email', 'Sending…');
    const { error } = await client().auth.updateUser({ email: value });
    status('email', error ? error.message : 'Confirmation link sent.', !error);
  });

  document.querySelector('[data-password-save]')?.addEventListener('click', async () => {
    const value = passwordInput.value;
    if (value.length < 8) {
      status('password', 'Use at least 8 characters.', false);
      return;
    }

    status('password', 'Updating…');
    const { error } = await client().auth.updateUser({ password: value });
    passwordInput.value = '';
    status('password', error ? error.message : 'Password updated.', !error);
  });

  photoInput?.addEventListener('change', async () => {
    const file = photoInput.files?.[0];
    if (!file) return;

    status('photo', 'Uploading…');
    const supabase = client();
    const path = `${user.id}/avatar-${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
      upsert: true,
      contentType: file.type || 'image/jpeg',
    });
    if (uploadError) {
      status('photo', uploadError.message, false);
      return;
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    const url = data?.publicUrl;
    if (!url) {
      status('photo', 'Upload finished but no URL came back.', false);
      return;
    }

    await supabase.auth.updateUser({ data: { avatar_url: url } });
    await supabase.from('profiles').upsert({ id: user.id, avatar_url: url });
    await supabase.auth.refreshSession();
    await loadUser();
    status('photo', 'Photo updated.');
  });

  document.querySelector('[data-signout-all]')?.addEventListener('click', async () => {
    status('danger', 'Signing out…');
    await client().auth.signOut({ scope: 'global' }).catch(() => client().auth.signOut());
    window.location.assign('index.html');
  });

  document.querySelector('[data-delete-account]')?.addEventListener('click', async () => {
    const sure = window.confirm('Delete your IYS account? This cannot be undone.');
    if (!sure) return;

    status('danger', 'Deleting…');
    const { error } = await client().rpc('delete_my_account');
    if (error) {
      status('danger', error.message, false);
      return;
    }

    await client().auth.signOut({ scope: 'local' }).catch(() => {});
    window.location.assign('index.html');
  });

  loadUser();
})();
