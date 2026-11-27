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
  const passwordConfirm = document.querySelector('[data-password-confirm]');
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

  let current = 'account';

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

    if (value !== passwordConfirm.value) {
      status('password', 'The two passwords do not match.', false);
      passwordConfirm.focus();
      return;
    }

    status('password', 'Updating…');
    const { error } = await client().auth.updateUser({ password: value });
    passwordInput.value = '';
    passwordConfirm.value = '';
    status('password', error ? error.message : 'Password updated.', !error);
  });

  /* ---------- 头像编辑：拖动 + 缩放 ---------- */
  const avatarCanvas = document.querySelector('[data-avatar-canvas]');
  const avatarCtx = avatarCanvas?.getContext('2d');
  const avatarZoom = document.querySelector('[data-avatar-zoom]');
  const avatarSave = document.querySelector('[data-photo-save]');
  const SIZE = 256;

  const view = { img: null, scale: 1, x: 0, y: 0, dragging: false, lastX: 0, lastY: 0 };

  function paintAvatar() {
    if (!avatarCtx) return;
    avatarCtx.clearRect(0, 0, SIZE, SIZE);

    avatarCtx.fillStyle = '#f2f2f5';
    avatarCtx.fillRect(0, 0, SIZE, SIZE);

    if (!view.img) {
      avatarCtx.fillStyle = 'rgba(29,29,31,0.35)';
      avatarCtx.font = '13px "American Typewriter", Georgia, serif';
      avatarCtx.textAlign = 'center';
      avatarCtx.fillText('Choose a photo', SIZE / 2, SIZE / 2);
      return;
    }

    avatarCtx.drawImage(view.img, view.x, view.y,
      view.img.width * view.scale, view.img.height * view.scale);
  }

  function fitAvatar() {
    if (!view.img) return;
    const cover = Math.max(SIZE / view.img.width, SIZE / view.img.height);
    view.scale = cover;
    avatarZoom.value = '1';
    view.x = (SIZE - view.img.width * cover) / 2;
    view.y = (SIZE - view.img.height * cover) / 2;
    paintAvatar();
  }

  const photoName = document.querySelector('[data-photo-name]');

  function resetPicker() {
    if (photoInput) photoInput.value = '';
    if (photoName) photoName.textContent = 'No image chosen';
  }

  document.querySelector('[data-photo-choose]')?.addEventListener('click', () => {
    resetPicker();
    photoInput?.click();
  });

  photoInput?.addEventListener('change', () => {
    const file = photoInput.files?.[0];
    const nameEl = document.querySelector('[data-photo-name]');
    if (nameEl) nameEl.textContent = file ? file.name : 'No image chosen';
    if (!file) return;

    const image = new Image();
    image.onload = () => {
      view.img = image;
      fitAvatar();
      avatarZoom.disabled = false;
      avatarSave.disabled = false;
      status('photo', 'Drag to position, then save.');
      URL.revokeObjectURL(image.src);
    };
    image.onerror = () => status('photo', 'Could not read that image.', false);
    image.src = URL.createObjectURL(file);
  });

  avatarZoom?.addEventListener('input', () => {
    if (!view.img) return;
    const base = Math.max(SIZE / view.img.width, SIZE / view.img.height);
    const next = base * Number(avatarZoom.value);

    const cx = view.x + (view.img.width * view.scale) / 2;
    const cy = view.y + (view.img.height * view.scale) / 2;
    view.scale = next;
    view.x = cx - (view.img.width * next) / 2;
    view.y = cy - (view.img.height * next) / 2;
    paintAvatar();
  });

  avatarCanvas?.addEventListener('pointerdown', (event) => {
    if (!view.img) return;
    view.dragging = true;
    view.lastX = event.clientX;
    view.lastY = event.clientY;
    avatarCanvas.setPointerCapture(event.pointerId);
  });

  avatarCanvas?.addEventListener('pointermove', (event) => {
    if (!view.dragging) return;
    view.x += event.clientX - view.lastX;
    view.y += event.clientY - view.lastY;
    view.lastX = event.clientX;
    view.lastY = event.clientY;
    paintAvatar();
  });

  ['pointerup', 'pointercancel'].forEach((type) => {
    avatarCanvas?.addEventListener(type, () => { view.dragging = false; });
  });

  avatarSave?.addEventListener('click', async () => {
    if (!view.img || !user) return;

    avatarSave.disabled = true;
    avatarSave.textContent = 'Saving…';
    status('photo', 'Uploading…');

    const supabase = client();

    // 先确认会话还在，否则后面每一步都会报 "Auth session missing!"
    const live = await supabase.auth.getSession();
    if (!live?.data?.session) {
      status('photo', 'Your session expired — please sign in again.', false);
      avatarSave.disabled = false;
      avatarSave.textContent = 'Save photo';
      return;
    }

    try {
      const blob = await new Promise((resolve) => avatarCanvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('Could not process that image.');

      const path = `${user.id}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, blob, {
        upsert: true,
        contentType: 'image/jpeg',
        cacheControl: '3600',
      });
      if (uploadError) {
        status('photo', `Upload failed: ${uploadError.message}`, false);
        return;
      }

      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = `${data.publicUrl}?v=${Date.now()}`;

      const { error: metaError } = await supabase.auth.updateUser({ data: { avatar_url: url } });
      if (metaError) {
        status('photo', `Could not attach the photo: ${metaError.message}`, false);
        return;
      }

      await supabase.from('profiles').upsert({ id: user.id, avatar_url: url });
      await supabase.auth.refreshSession();
      await loadUser();
      status('photo', 'Photo updated.');
    } catch (error) {
      status('photo', error.message || 'Could not save the photo.', false);
    } finally {
      avatarSave.disabled = false;
      avatarSave.textContent = 'Save photo';
    }
  });

  document.querySelector('[data-photo-remove]')?.addEventListener('click', async () => {
    if (!user) return;

    // 先复位本地界面，网络失败也不影响再次选图
    view.img = null;
    paintAvatar();
    avatarSave.disabled = true;
    avatarZoom.disabled = true;
    avatarZoom.value = '1';
    resetPicker();

    const supabase = client();

    const check = await supabase.auth.getSession();
    if (!check?.data?.session) {
      status('photo', 'Your session expired — please sign in again.', false);
      return;
    }

    status('photo', 'Removing…');

    await supabase.from('profiles').upsert({ id: user.id, avatar_url: null });
    const { error } = await supabase.auth.updateUser({ data: { avatar_url: null } });
    if (error) {
      status('photo', error.message, false);
      return;
    }

    view.img = null;
    paintAvatar();
    avatarSave.disabled = true;
    avatarZoom.disabled = true;

    // 清空选择，否则再选同一个文件不会触发 change
    if (photoInput) photoInput.value = '';
    const nameEl = document.querySelector('[data-photo-name]');
    if (nameEl) nameEl.textContent = 'No image chosen';
    await supabase.auth.refreshSession();
    await loadUser();
    status('photo', 'Photo removed.');
  });

  paintAvatar();

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
