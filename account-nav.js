/**
 * 导航栏账号菜单。会话由 Supabase Auth 管理。
 * 支持：显示当前用户、改用户名、改邮箱、改密码、退出登录。
 */
(() => {
  const signInLink = document.querySelector('.account-nav-link[href="IYS Account Sign In.html"]');
  const signUpLink = document.querySelector('.account-nav-link[href="IYS Account Sign Up.html"]');

  if (!signInLink || !signUpLink) return;

  const client = window.iysSupabase;
  if (!client) {
    console.error('Supabase client is not available.');
    return;
  }

  const AUTH_ERROR_MESSAGES = {
    invalid_credentials: 'Current password is incorrect.',
    email_exists: 'That email is already in use.',
    user_already_exists: 'That email is already in use.',
    email_address_invalid: 'Please enter a valid email address.',
    weak_password: 'Password is too weak. Use at least 8 characters.',
    same_password: 'The new password must be different from the old one.',
    over_email_send_rate_limit: 'Too many emails sent. Please wait a few minutes and try again.',
    over_request_rate_limit: 'Too many attempts. Please wait a few minutes and try again.',
  };

  function displayNameOf(user) {
    const name = user?.user_metadata?.display_name;
    if (typeof name === 'string' && name.trim()) return name.trim();
    return user?.email || 'Account';
  }

  // ----- 头像 -----
  const AVATAR_COLORS = ['#6554d9', '#0a84ff', '#2fa36b', '#e0453f', '#c2410c', '#0891b2', '#7c3aed', '#be185d'];

  function avatarUrlOf(user) {
    const url = user?.user_metadata?.avatar_url;
    return typeof url === 'string' && url ? url : null;
  }

  function initialOf(name) {
    const text = String(name || '').trim();
    return text ? text.slice(0, 1).toUpperCase() : '?';
  }

  /** 同一个名字永远得到同一个颜色 */
  function avatarColorOf(name) {
    const text = String(name || '');
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 100003;
    return AVATAR_COLORS[hash % AVATAR_COLORS.length];
  }

  /** 有图片就显示图片，没有就显示首字母 */
  function buildAvatar(user, size) {
    const el = document.createElement('span');
    el.className = 'avatar';
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;

    const url = avatarUrlOf(user);
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      el.append(img);
    } else {
      const name = displayNameOf(user);
      el.textContent = initialOf(name);
      el.style.backgroundColor = avatarColorOf(name);
      el.style.fontSize = `${Math.round(size * 0.42)}px`;
    }
    return el;
  }

  function showFeedback(feedback, message, type = 'error') {
    feedback.textContent = message;
    feedback.classList.toggle('is-success', type === 'success');
    feedback.hidden = false;
  }

  function clearFeedback(feedback) {
    feedback.hidden = true;
    feedback.textContent = '';
    feedback.classList.remove('is-success');
  }

  function showRequestError(feedback, error, fallback) {
    if (error instanceof TypeError) {
      showFeedback(feedback, 'Could not reach the account service. Check your connection and try again.');
      return;
    }
    showFeedback(feedback, AUTH_ERROR_MESSAGES[error?.code] || error?.message || fallback);
  }

  async function init() {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!data.session?.user) return;

    let user = data.session.user;

    const accountMenu = document.createElement('div');
    accountMenu.className = 'account-menu-container';

    const userLabel = document.createElement('button');
    userLabel.type = 'button';
    userLabel.className = 'account-nav-link account-nav-user';
    userLabel.setAttribute('aria-label', `Account options for ${displayNameOf(user)}`);
    userLabel.setAttribute('aria-expanded', 'false');

    let renderMenuUser = () => {};

    function updateUserLabel() {
      const name = displayNameOf(user);
      const label = document.createElement('span');
      label.textContent = name;
      userLabel.replaceChildren(buildAvatar(user, 24), label);
      userLabel.title = `Signed in as ${user.email || name}`;
      userLabel.setAttribute('aria-label', `Account options for ${name}`);
      renderMenuUser();
    }
    updateUserLabel();

    const menu = document.createElement('div');
    menu.className = 'account-menu';
    menu.hidden = true;
    menu.setAttribute('aria-label', 'Account options');

    const menuStatus = document.createElement('p');
    menuStatus.className = 'account-menu-status';
    menuStatus.hidden = true;
    menuStatus.setAttribute('role', 'status');

    const menuUser = document.createElement('div');
    menuUser.className = 'account-menu-user';
    const menuAvatarSlot = document.createElement('span');
    const menuIdentity = document.createElement('span');
    menuIdentity.className = 'account-menu-user-name';
    const menuName = document.createElement('strong');
    const menuEmail = document.createElement('span');
    menuIdentity.append(menuName, menuEmail);
    menuUser.append(menuAvatarSlot, menuIdentity);

    renderMenuUser = () => {
      menuAvatarSlot.replaceChildren(buildAvatar(user, 40));
      menuName.textContent = displayNameOf(user);
      menuEmail.textContent = user.email || '';
    };
    renderMenuUser();

    const changePhotoButton = document.createElement('button');
    changePhotoButton.type = 'button';
    changePhotoButton.textContent = 'Change photo';

    const changeUsernameButton = document.createElement('button');
    changeUsernameButton.type = 'button';
    changeUsernameButton.textContent = 'Change username';

    const changeEmailButton = document.createElement('button');
    changeEmailButton.type = 'button';
    changeEmailButton.textContent = 'Change email';

    const changePasswordButton = document.createElement('button');
    changePasswordButton.type = 'button';
    changePasswordButton.textContent = 'Change password';

    const deleteAccountButton = document.createElement('button');
    deleteAccountButton.type = 'button';
    deleteAccountButton.className = 'account-delete-option';
    deleteAccountButton.textContent = 'Delete account';

    const signOutButton = document.createElement('button');
    signOutButton.type = 'button';
    signOutButton.textContent = 'Sign out';

    menu.append(
      menuUser,
      changePhotoButton,
      changeUsernameButton,
      changeEmailButton,
      changePasswordButton,
      deleteAccountButton,
      signOutButton,
      menuStatus,
    );
    accountMenu.append(userLabel, menu);
    signInLink.replaceWith(accountMenu);
    signUpLink.remove();

    function setMenuOpen(open) {
      menu.hidden = !open;
      userLabel.setAttribute('aria-expanded', String(open));
      if (!open) {
        menuStatus.hidden = true;
        menuStatus.textContent = '';
      }
    }

    userLabel.addEventListener('click', () => setMenuOpen(menu.hidden));
    document.addEventListener('click', (event) => {
      if (!accountMenu.contains(event.target)) setMenuOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !menu.hidden) {
        setMenuOpen(false);
        userLabel.focus();
      }
    });

    // ----- Change username -----
    const usernameDialog = document.createElement('dialog');
    usernameDialog.className = 'account-settings-dialog';
    usernameDialog.setAttribute('aria-labelledby', 'account-username-title');
    usernameDialog.innerHTML = `
      <form class="account-settings-form">
        <h2 id="account-username-title">Change your username</h2>
        <p class="account-email-current"></p>
        <label>
          New username
          <input name="username" type="text" autocomplete="nickname" maxlength="50" required>
        </label>
        <p class="account-feedback" role="status" hidden></p>
        <div class="account-email-actions">
          <button class="account-email-cancel" type="button">Cancel</button>
          <button class="account-submit" type="submit">Update username</button>
        </div>
      </form>
    `;
    document.body.append(usernameDialog);

    const usernameForm = usernameDialog.querySelector('.account-settings-form');
    const usernameInput = usernameForm.elements.username;
    const usernameFeedback = usernameForm.querySelector('.account-feedback');
    const usernameSubmit = usernameForm.querySelector('[type="submit"]');

    changeUsernameButton.addEventListener('click', () => {
      setMenuOpen(false);
      usernameForm.querySelector('.account-email-current').textContent =
        `Current username: ${displayNameOf(user)}`;
      usernameInput.value = user.user_metadata?.display_name || '';
      clearFeedback(usernameFeedback);
      usernameDialog.showModal();
      usernameInput.focus();
    });

    usernameForm.querySelector('.account-email-cancel').addEventListener('click', () => {
      usernameDialog.close();
    });

    usernameForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFeedback(usernameFeedback);
      usernameSubmit.disabled = true;

      try {
        const name = usernameInput.value.trim();
        const { data, error } = await client.auth.updateUser({ data: { display_name: name } });
        if (error) throw error;
        user = data.user ?? user;
        updateUserLabel();
        usernameForm.querySelector('.account-email-current').textContent =
          `Current username: ${displayNameOf(user)}`;
        showFeedback(usernameFeedback, 'Your username has been updated.', 'success');
      } catch (error) {
        showRequestError(usernameFeedback, error, 'Could not update your username. Please try again.');
      } finally {
        usernameSubmit.disabled = false;
      }
    });

    // ----- Change email -----
    const emailDialog = document.createElement('dialog');
    emailDialog.className = 'account-email-dialog';
    emailDialog.setAttribute('aria-labelledby', 'account-email-title');
    emailDialog.innerHTML = `
      <form class="account-email-form">
        <h2 id="account-email-title">Change your email</h2>
        <p class="account-email-current"></p>
        <label>
          New email
          <input name="email" type="email" autocomplete="email" maxlength="254" required>
        </label>
        <label>
          Current password
          <input name="password" type="password" autocomplete="current-password" maxlength="128" required>
        </label>
        <p class="account-feedback" role="status" hidden></p>
        <div class="account-email-actions">
          <button class="account-email-cancel" type="button">Cancel</button>
          <button class="account-submit" type="submit">Update email</button>
        </div>
      </form>
    `;
    document.body.append(emailDialog);

    const emailForm = emailDialog.querySelector('.account-email-form');
    const emailInput = emailForm.elements.email;
    const emailPasswordInput = emailForm.elements.password;
    const emailFeedback = emailForm.querySelector('.account-feedback');
    const emailSubmit = emailForm.querySelector('[type="submit"]');

    changeEmailButton.addEventListener('click', () => {
      setMenuOpen(false);
      emailForm.querySelector('.account-email-current').textContent = `Current email: ${user.email}`;
      emailInput.value = '';
      emailPasswordInput.value = '';
      clearFeedback(emailFeedback);
      emailDialog.showModal();
      emailInput.focus();
    });

    emailForm.querySelector('.account-email-cancel').addEventListener('click', () => {
      emailDialog.close();
    });

    emailForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFeedback(emailFeedback);
      emailSubmit.disabled = true;

      try {
        const newEmail = emailInput.value.trim();

        // 先验证当前密码，避免别人拿到已登录设备就能改邮箱。
        const { error: reauthError } = await client.auth.signInWithPassword({
          email: user.email,
          password: emailPasswordInput.value,
        });
        if (reauthError) throw reauthError;

        const { data, error } = await client.auth.updateUser({ email: newEmail });
        if (error) throw error;
        user = data.user ?? user;

        emailPasswordInput.value = '';
        if (user.email?.toLowerCase() === newEmail.toLowerCase()) {
          emailForm.querySelector('.account-email-current').textContent = `Current email: ${user.email}`;
          showFeedback(emailFeedback, 'Your email has been updated.', 'success');
        } else {
          showFeedback(
            emailFeedback,
            'Confirmation email sent. Check your inbox to finish changing your email.',
            'success',
          );
        }
      } catch (error) {
        showRequestError(emailFeedback, error, 'Could not update your email. Please try again.');
      } finally {
        emailSubmit.disabled = false;
      }
    });

    // ----- Change password -----
    const passwordDialog = document.createElement('dialog');
    passwordDialog.className = 'account-settings-dialog';
    passwordDialog.setAttribute('aria-labelledby', 'account-password-title');
    passwordDialog.innerHTML = `
      <form class="account-settings-form">
        <h2 id="account-password-title">Change your password</h2>
        <label>
          Current password
          <input name="currentPassword" type="password" autocomplete="current-password" maxlength="128" required>
        </label>
        <a class="account-forgot-password" href="#" data-send-reset>Forgot your current password?</a>
        <label>
          New password
          <input name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required>
        </label>
        <label>
          Confirm new password
          <input name="confirmation" type="password" autocomplete="new-password" minlength="8" maxlength="128" required>
        </label>
        <p class="account-feedback" role="status" hidden></p>
        <div class="account-email-actions">
          <button class="account-email-cancel" type="button">Cancel</button>
          <button class="account-submit" type="submit">Update password</button>
        </div>
      </form>
    `;
    document.body.append(passwordDialog);

    const passwordForm = passwordDialog.querySelector('.account-settings-form');
    const currentPasswordInput = passwordForm.elements.currentPassword;
    const newPasswordInput = passwordForm.elements.newPassword;
    const passwordConfirmation = passwordForm.elements.confirmation;
    const passwordFeedback = passwordForm.querySelector('.account-feedback');
    const passwordSubmit = passwordForm.querySelector('[type="submit"]');

    changePasswordButton.addEventListener('click', () => {
      setMenuOpen(false);
      passwordForm.reset();
      clearFeedback(passwordFeedback);
      passwordDialog.showModal();
      currentPasswordInput.focus();
    });

    passwordForm.querySelector('.account-email-cancel').addEventListener('click', () => {
      passwordDialog.close();
    });

    // 不记得当前密码时，直接发一封重置邮件（链接里带着恢复会话）
    const sendResetLink = passwordForm.querySelector('[data-send-reset]');
    sendResetLink.addEventListener('click', async (event) => {
      event.preventDefault();
      clearFeedback(passwordFeedback);
      if (!client) return;

      sendResetLink.setAttribute('aria-disabled', 'true');
      try {
        const { error } = await client.auth.resetPasswordForEmail(user.email, {
          redirectTo: new URL('IYS Account Reset Password.html', window.location.href).href,
        });
        if (error) throw error;
        showFeedback(
          passwordFeedback,
          `Reset link sent to ${user.email}. Open it to set a new password.`,
          'success',
        );
      } catch (error) {
        showRequestError(passwordFeedback, error, 'Could not send the reset link. Please try again.');
      } finally {
        sendResetLink.removeAttribute('aria-disabled');
      }
    });

    passwordForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFeedback(passwordFeedback);
      if (newPasswordInput.value !== passwordConfirmation.value) {
        showFeedback(passwordFeedback, 'New passwords do not match.');
        passwordConfirmation.focus();
        return;
      }
      passwordSubmit.disabled = true;

      try {
        const { error: reauthError } = await client.auth.signInWithPassword({
          email: user.email,
          password: currentPasswordInput.value,
        });
        if (reauthError) throw reauthError;

        const { error } = await client.auth.updateUser({ password: newPasswordInput.value });
        if (error) throw error;

        passwordForm.reset();
        showFeedback(passwordFeedback, 'Your password has been updated.', 'success');
      } catch (error) {
        showRequestError(passwordFeedback, error, 'Could not update your password. Please try again.');
      } finally {
        passwordSubmit.disabled = false;
      }
    });

    // ----- Delete account -----
    const deleteDialog = document.createElement('dialog');
    deleteDialog.className = 'account-settings-dialog';
    deleteDialog.setAttribute('aria-labelledby', 'account-delete-title');
    deleteDialog.innerHTML = `
      <form class="account-settings-form">
        <h2 id="account-delete-title">Delete your account?</h2>
        <p class="account-delete-warning">
          This permanently deletes your account and signs you out on all devices. This cannot be undone.
        </p>
        <label>
          Current password
          <input name="currentPassword" type="password" autocomplete="current-password" maxlength="128" required>
        </label>
        <label class="account-delete-confirm">
          <input name="confirmation" type="checkbox" required>
          I understand and want to permanently delete my account.
        </label>
        <p class="account-feedback" role="status" hidden></p>
        <div class="account-email-actions">
          <button class="account-email-cancel" type="button">Cancel</button>
          <button class="account-delete-submit" type="submit">Delete account</button>
        </div>
      </form>
    `;
    document.body.append(deleteDialog);

    const deleteForm = deleteDialog.querySelector('.account-settings-form');
    const deletePasswordInput = deleteForm.elements.currentPassword;
    const deleteConfirmation = deleteForm.elements.confirmation;
    const deleteFeedback = deleteForm.querySelector('.account-feedback');
    const deleteSubmit = deleteForm.querySelector('[type="submit"]');

    deleteAccountButton.addEventListener('click', () => {
      setMenuOpen(false);
      deleteForm.reset();
      clearFeedback(deleteFeedback);
      deleteDialog.showModal();
      deletePasswordInput.focus();
    });

    deleteForm.querySelector('.account-email-cancel').addEventListener('click', () => {
      deleteDialog.close();
    });

    deleteForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFeedback(deleteFeedback);
      deleteSubmit.disabled = true;

      try {
        if (!deleteConfirmation.checked) {
          throw new Error('Please confirm that you want to delete your account.');
        }

        const { error: reauthError } = await client.auth.signInWithPassword({
          email: user.email,
          password: deletePasswordInput.value,
        });
        if (reauthError) throw reauthError;

        const { error } = await client.rpc('delete_my_account');
        if (error) throw error;

        showFeedback(deleteFeedback, 'Your account has been deleted.', 'success');
        await client.auth.signOut({ scope: 'local' }).catch(() => {});
        window.setTimeout(() => window.location.assign('index.html'), 700);
      } catch (error) {
        showRequestError(deleteFeedback, error, 'Could not delete your account. Please try again.');
        deleteSubmit.disabled = false;
      }
    });

    // ----- Sign out -----
    signOutButton.addEventListener('click', async () => {
      signOutButton.disabled = true;
      menuStatus.hidden = true;
      try {
        const { error } = await client.auth.signOut({ scope: 'local' });
        if (error) throw error;
        window.location.reload();
      } catch (error) {
        menuStatus.textContent =
          error instanceof TypeError
            ? 'Could not reach the account service. Check your connection and try again.'
            : error.message;
        menuStatus.hidden = false;
        signOutButton.disabled = false;
      }
    });

    // ----- Change photo -----
    const avatarDialog = document.createElement('dialog');
    avatarDialog.className = 'account-settings-dialog';
    avatarDialog.setAttribute('aria-labelledby', 'account-avatar-title');
    avatarDialog.innerHTML = `
      <form class="account-settings-form">
        <h2 id="account-avatar-title">Change your photo</h2>
        <div class="avatar-stage">
          <canvas width="260" height="260" aria-label="Drag to reposition, slide to zoom"></canvas>
        </div>
        <input class="avatar-zoom" type="range" min="1" max="3" step="0.01" value="1" aria-label="Zoom" disabled>
        <p class="avatar-hint">Choose an image, then drag it to pick the part you want.</p>
        <p class="account-feedback" role="status" hidden></p>
        <div class="account-email-actions">
          <label class="avatar-picker">Choose image<input type="file" accept="image/*" hidden></label>
          <button class="account-email-cancel" type="button">Cancel</button>
          <button class="account-submit" type="submit" disabled>Save</button>
        </div>
      </form>
    `;
    document.body.append(avatarDialog);

    const avatarForm = avatarDialog.querySelector('form');
    const avatarCanvas = avatarDialog.querySelector('canvas');
    const avatarCtx = avatarCanvas.getContext('2d');
    const avatarZoom = avatarDialog.querySelector('.avatar-zoom');
    const avatarFile = avatarDialog.querySelector('input[type="file"]');
    const avatarFeedback = avatarDialog.querySelector('.account-feedback');
    const avatarSave = avatarForm.querySelector('[type="submit"]');

    const AVATAR_SIZE = 260;
    const view = { img: null, scale: 1, minScale: 1, x: 0, y: 0, dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 };

    function clampView() {
      if (!view.img) return;
      const width = view.img.width * view.scale;
      const height = view.img.height * view.scale;
      view.x = Math.min(0, Math.max(AVATAR_SIZE - width, view.x));
      view.y = Math.min(0, Math.max(AVATAR_SIZE - height, view.y));
    }

    function drawAvatar() {
      avatarCtx.clearRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
      if (!view.img) return;
      avatarCtx.drawImage(view.img, view.x, view.y,
        view.img.width * view.scale, view.img.height * view.scale);
    }

    avatarFile.addEventListener('change', () => {
      const file = avatarFile.files && avatarFile.files[0];
      clearFeedback(avatarFeedback);
      if (!file) return;

      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        view.img = img;
        view.minScale = Math.max(AVATAR_SIZE / img.width, AVATAR_SIZE / img.height);
        view.scale = view.minScale;
        view.x = (AVATAR_SIZE - img.width * view.scale) / 2;
        view.y = (AVATAR_SIZE - img.height * view.scale) / 2;
        avatarZoom.value = '1';
        avatarZoom.disabled = false;
        drawAvatar();
        avatarSave.disabled = false;
      };
      img.onerror = () => showFeedback(avatarFeedback, 'That image could not be read.');
      img.src = objectUrl;
    });

    avatarZoom.addEventListener('input', () => {
      if (!view.img) return;
      const factor = Number(avatarZoom.value);
      const centerX = (AVATAR_SIZE / 2 - view.x) / view.scale;
      const centerY = (AVATAR_SIZE / 2 - view.y) / view.scale;
      view.scale = view.minScale * factor;
      view.x = AVATAR_SIZE / 2 - centerX * view.scale;
      view.y = AVATAR_SIZE / 2 - centerY * view.scale;
      clampView();
      drawAvatar();
    });

    avatarCanvas.addEventListener('pointerdown', (event) => {
      if (!view.img) return;
      view.dragging = true;
      view.startX = event.clientX;
      view.startY = event.clientY;
      view.originX = view.x;
      view.originY = view.y;
      avatarCanvas.setPointerCapture(event.pointerId);
    });

    avatarCanvas.addEventListener('pointermove', (event) => {
      if (!view.dragging) return;
      const rect = avatarCanvas.getBoundingClientRect();
      const ratio = AVATAR_SIZE / rect.width;
      view.x = view.originX + (event.clientX - view.startX) * ratio;
      view.y = view.originY + (event.clientY - view.startY) * ratio;
      clampView();
      drawAvatar();
    });

    ['pointerup', 'pointercancel'].forEach((type) => {
      avatarCanvas.addEventListener(type, () => { view.dragging = false; });
    });

    avatarForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!view.img || !client) return;

      avatarSave.disabled = true;
      avatarSave.textContent = 'Saving…';
      clearFeedback(avatarFeedback);

      try {
        const output = document.createElement('canvas');
        output.width = 256;
        output.height = 256;
        const outCtx = output.getContext('2d');
        const ratio = 256 / AVATAR_SIZE;
        outCtx.drawImage(view.img, view.x * ratio, view.y * ratio,
          view.img.width * view.scale * ratio, view.img.height * view.scale * ratio);

        const blob = await new Promise((resolve) => output.toBlob(resolve, 'image/jpeg', 0.9));
        if (!blob) throw new Error('Could not process that image.');

        const path = `${user.id}/avatar.jpg`;
        const { error } = await client.storage.from('avatars').upload(path, blob, {
          upsert: true,
          contentType: 'image/jpeg',
          cacheControl: '3600',
        });
        if (error) throw error;

        const { data } = client.storage.from('avatars').getPublicUrl(path);
        const url = `${data.publicUrl}?v=${Date.now()}`;
        const { error: metaError } = await client.auth.updateUser({ data: { avatar_url: url } });
        if (metaError) throw metaError;

        user = { ...user, user_metadata: { ...user.user_metadata, avatar_url: url } };
        updateUserLabel();
        showFeedback(avatarFeedback, 'Photo updated.', 'success');
        window.setTimeout(() => avatarDialog.close(), 600);
      } catch (error) {
        showRequestError(avatarFeedback, error, 'Could not save the photo. Please try again.');
      } finally {
        avatarSave.disabled = false;
        avatarSave.textContent = 'Save';
      }
    });

    changePhotoButton.addEventListener('click', () => {
      setMenuOpen(false);
      clearFeedback(avatarFeedback);
      view.img = null;
      avatarZoom.value = '1';
      avatarZoom.disabled = true;
      avatarCtx.clearRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
      avatarSave.disabled = true;
      avatarDialog.showModal();
    });

    avatarForm.querySelector('.account-email-cancel').addEventListener('click', () => {
      avatarDialog.close();
    });
  }

  init().catch((error) => {
    console.error('Unable to update IYS account navigation.', error);
  });
})();
