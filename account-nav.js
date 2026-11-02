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

    function updateUserLabel() {
      const name = displayNameOf(user);
      userLabel.textContent = name;
      userLabel.title = `Signed in as ${user.email || name}`;
      userLabel.setAttribute('aria-label', `Account options for ${name}`);
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
  }

  init().catch((error) => {
    console.error('Unable to update IYS account navigation.', error);
  });
})();
