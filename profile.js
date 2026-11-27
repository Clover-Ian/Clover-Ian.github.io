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

    loadAiSettings();
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

  /* ---------- AI key ---------- */
  async function tokenHeader() {
    try {
      const { data } = await client().auth.getSession();
      const token = data?.session?.access_token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  }

  const aiKeyInput = document.querySelector('[data-ai-key]');
  const aiBaseInput = document.querySelector('[data-ai-base]');
  const aiModelInput = document.querySelector('[data-ai-model]');
  const aiKeyState = document.querySelector('[data-ai-key-state]');
  const aiNameInput = document.querySelector('[data-ai-name]');
  const aiModelCustom = document.querySelector('[data-ai-model-custom]');

  const IYS_MODELS = [
    'deepseek-v4.1-flash', 'glm-5.3-flash', 'qwen-3.8-flash',
    'relay-rlx/glm-5.3-flash', 'glm-5.3', 'GLM-5.4', 'deepseek-v4-pro',
    'kimi-k3.1-pro', 'kimi-k3.1-pro-high', 'mimo-v2.6-pro',
    'grok-composer-2.5-fast', 'grok-4.7', 'qwen4_max',
  ];

  let userModels = [];
  let savedKeys = [];

  function renderModelOptions(selected) {
    aiModelInput.innerHTML = '';

    const iys = document.createElement('optgroup');
    iys.label = 'IYS';
    IYS_MODELS.forEach((id) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = id;
      iys.append(option);
    });
    aiModelInput.append(iys);

    if (userModels.length) {
      const own = document.createElement('optgroup');
      own.label = aiNameInput?.value.trim() || 'Your key';
      userModels.forEach((id) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = id;
        own.append(option);
      });
      aiModelInput.append(own);
    }

    const known = IYS_MODELS.includes(selected) || userModels.includes(selected);
    if (selected && !known) {
      const saved = document.createElement('optgroup');
      saved.label = 'Saved';
      const option = document.createElement('option');
      option.value = selected;
      option.textContent = selected;
      saved.append(option);
      aiModelInput.append(saved);
    }

    const custom = document.createElement('option');
    custom.value = '__custom__';
    custom.textContent = 'Custom model…';
    aiModelInput.append(custom);

    if (selected) aiModelInput.value = selected;
    if (aiModelCustom) aiModelCustom.hidden = !customVisible();
  }

  function customVisible() { return aiModelInput.value === '__custom__'; }
  function currentModelValue() {
    return customVisible() ? (aiModelCustom?.value.trim() ?? '') : aiModelInput.value;
  }

  aiModelInput?.addEventListener('change', () => {
    if (!aiModelCustom) return;
    aiModelCustom.hidden = !customVisible();
  });

  const aiEmpty = document.querySelector('[data-ai-empty]');
  const aiList = document.querySelector('[data-ai-list]');
  const aiRows = document.querySelector('[data-ai-rows]');
  const aiForm = document.querySelector('[data-ai-form]');

  function showForm(show) {
    if (!aiForm) return;
    aiForm.hidden = !show;
    if (show) {
      aiForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      aiKeyInput?.focus();
    }
  }

  async function loadAiSettings() {
    if (!user) return;
    const supabase = client();

    const { data, error } = await supabase
      .from('user_ai_settings')
      .select('id, label, api_key, base_url, model, created_at')
      .order('created_at', { ascending: true });

    if (error) {
      status('ai', error.message, false);
      return;
    }

    savedKeys = Array.isArray(data) ? data : [];

    if (!savedKeys.length) {
      aiEmpty.hidden = false;
      aiList.hidden = true;
      return;
    }

    aiEmpty.hidden = true;
    aiList.hidden = false;
    aiRows.innerHTML = '';

    savedKeys.forEach((row) => {
      const tr = document.createElement('tr');

      const name = document.createElement('td');
      name.textContent = row.label || '—';

      const model = document.createElement('td');
      model.textContent = row.model || '—';

      const base = document.createElement('td');
      base.className = 'ai-key-base';
      base.textContent = row.base_url || '—';

      const action = document.createElement('td');
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'ai-key-remove';
      remove.textContent = 'Delete';
      remove.addEventListener('click', async () => {
        const ok = window.confirm(`Delete the key “${row.label || 'unnamed'}”?`);
        if (!ok) return;
        const { error: deleteError } = await supabase
          .from('user_ai_settings')
          .delete()
          .eq('id', row.id);
        if (deleteError) {
          status('ai', deleteError.message, false);
          return;
        }
        await loadAiSettings();
        status('ai', 'Key deleted.');
      });
      action.append(remove);

      tr.append(name, model, base, action);
      aiRows.append(tr);
    });

    // 用自己的 key 拉模型列表
    userModels = [];
    await loadUserModels();
    renderModelOptions(savedKeys[savedKeys.length - 1]?.model || IYS_MODELS[0]);
  }

  async function loadUserModels() {
    try {
      const response = await fetch(
        'https://qbkfdhmjogdwtjovqzaw.supabase.co/functions/v1/IYS',
        { headers: await tokenHeader() },
      );
      const data = await response.json();
      userModels = Array.isArray(data?.mine) ? data.mine : [];
    } catch {
      userModels = [];
    }
  }

  const DEFAULT_BASE = 'https://relaydock.omnis.com.cn/v1';

  document.querySelectorAll('[data-ai-add]').forEach((button) => {
    button.addEventListener('click', () => {
      aiForm?.reset();
      aiHasSavedKey = false;
      if (aiBaseInput && !aiBaseInput.value.trim()) {
        aiBaseInput.value = DEFAULT_BASE;
      }
      renderModelOptions(IYS_MODELS[0]);
      showForm(true);
    });
  });

  document.querySelector('[data-ai-cancel]')?.addEventListener('click', () => showForm(false));

  function validateAiFields() {
    const key = aiKeyInput.value.trim();
    const base = aiBaseInput.value.trim();
    const model = currentModelValue();
    const name = aiNameInput?.value.trim() ?? '';

    [aiKeyInput, aiBaseInput, aiModelInput, aiModelCustom, aiNameInput]
      .forEach((el) => el?.classList.remove('is-invalid'));

    if (!key || !base || !model || !name) {
      if (!key) aiKeyInput.classList.add('is-invalid');
      if (!base) aiBaseInput.classList.add('is-invalid');
      if (!model) (customVisible() ? aiModelCustom : aiModelInput)?.classList.add('is-invalid');
      if (!name) aiNameInput?.classList.add('is-invalid');
      return 'All fields are required.';
    }

    if (!/^sk-[A-Za-z0-9_-]{16,}$/.test(key)) {
      aiKeyInput.classList.add('is-invalid');
      return 'The key should look like sk- followed by at least 16 characters.';
    }

    if (/iys/i.test(name)) {
      aiNameInput.classList.add('is-invalid');
      return 'The name cannot contain “IYS”.';
    }

    let parsed = null;
    try { parsed = new URL(base); } catch { /* 下面报错 */ }
    if (!parsed || !/^https?:$/.test(parsed.protocol)) {
      aiBaseInput.classList.add('is-invalid');
      return 'The base URL must be a valid https:// address.';
    }

    if (!/^[A-Za-z0-9._/-]+$/.test(model)) {
      (customVisible() ? aiModelCustom : aiModelInput)?.classList.add('is-invalid');
      return 'Model names can only contain letters, numbers, dots, dashes, underscores and slashes.';
    }

    return null;
  }

  [aiKeyInput, aiBaseInput, aiModelInput, aiModelCustom, aiNameInput].forEach((el) => {
    el?.addEventListener('input', () => el.classList.remove('is-invalid'));
  });

  document.querySelector('[data-ai-save]')?.addEventListener('click', async () => {
    const problem = validateAiFields();
    if (problem) {
      status('ai', problem, false);
      return;
    }

    status('ai', 'Saving…');
    const supabase = client();

    const { error } = await supabase.from('user_ai_settings').insert({
      user_id: user.id,
      label: aiNameInput.value.trim(),
      api_key: aiKeyInput.value.trim(),
      base_url: aiBaseInput.value.trim(),
      model: currentModelValue(),
    });

    if (error) {
      status('ai', error.message, false);
      return;
    }

    showForm(false);
    await loadAiSettings();
    status('ai', 'Key saved.');
  });

  /* ---------- 删除账号：密码 + 勾选确认 ---------- */
  const deleteDialog = document.getElementById('delete-dialog');
  const deleteForm = document.getElementById('delete-form');
  const deletePassword = deleteForm?.elements.currentPassword;
  const deleteCheckbox = deleteForm?.elements.confirmation;
  const deleteFeedback = deleteForm?.querySelector('.account-feedback');
  const deleteSubmit = document.querySelector('[data-delete-submit]');

  function deleteMessage(text, error = true) {
    if (!deleteFeedback) return;
    deleteFeedback.textContent = text;
    deleteFeedback.hidden = false;
    deleteFeedback.classList.toggle('is-success', !error);
  }

  document.querySelector('[data-delete-account]')?.addEventListener('click', () => {
    deleteForm?.reset();
    if (deleteFeedback) {
      deleteFeedback.hidden = true;
      deleteFeedback.textContent = '';
    }
    deleteDialog?.showModal();
    deletePassword?.focus();
  });

  document.querySelector('[data-delete-cancel]')?.addEventListener('click', () => {
    deleteDialog?.close();
  });

  deleteForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!deleteCheckbox?.checked) {
      deleteMessage('Please confirm that you want to delete your account.');
      return;
    }

    const password = deletePassword?.value ?? '';
    if (password.length < 6) {
      deleteMessage('Enter your current password.');
      return;
    }

    const supabase = client();
    deleteSubmit.disabled = true;
    deleteSubmit.textContent = 'Deleting…';
    deleteMessage('Checking your password…', false);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (authError) {
        deleteMessage('That password is not correct.');
        return;
      }

      const { error } = await supabase.rpc('delete_my_account');
      if (error) {
        deleteMessage(error.message || 'Could not delete the account.');
        return;
      }

      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      window.location.assign('index.html');
    } catch (error) {
      deleteMessage(error.message || 'Could not delete the account.');
    } finally {
      deleteSubmit.disabled = false;
      deleteSubmit.textContent = 'Delete account';
    }
  });

  loadUser();
})();
