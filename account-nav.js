(() => {
  const signInLink = document.querySelector('.account-nav-link[href="IYS Account Sign In.html"]');
  const signUpLink = document.querySelector('.account-nav-link[href="IYS Account Sign Up.html"]');

  if (!signInLink || !signUpLink) return;

  async function updateAccountNavigation() {
    const response = await fetch('/api/auth/me', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    if (response.status === 401) return;
    if (!response.ok) {
      throw new Error(`Account session check failed (${response.status}).`);
    }

    const data = await response.json();
    const user = data?.user;
    const displayName = user?.displayName;
    const email = user?.email;
    const name = typeof displayName === 'string' && displayName.trim()
      ? displayName.trim()
      : email;
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error('Account session response did not include a valid user name.');
    }

    const accountMenu = document.createElement('div');
    accountMenu.className = 'account-menu-container';

    const userLabel = document.createElement('button');
    userLabel.type = 'button';
    userLabel.className = 'account-nav-link account-nav-user';
    userLabel.textContent = name;
    userLabel.title = `Signed in as ${name}`;
    userLabel.setAttribute('aria-label', `Account options for ${name}`);
    userLabel.setAttribute('aria-expanded', 'false');

    function updateUserLabel() {
      const updatedName = user.displayName?.trim() || user.email;
      userLabel.textContent = updatedName;
      userLabel.title = `Signed in as ${updatedName}`;
      userLabel.setAttribute('aria-label', `Account options for ${updatedName}`);
    }

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

    async function postAccountChange(path, payload) {
      const response = await fetch(path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      let data = null;
      if (response.status !== 204) {
        data = await response.json();
      }

      if (!response.ok) {
        const error = new Error(data?.error?.message || `Request failed (${response.status}).`);
        error.code = data?.error?.code;
        throw error;
      }
      return data;
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
      showFeedback(
        feedback,
        error instanceof TypeError
          ? 'Could not reach the server. Check your connection and try again.'
          : error.message || fallback,
      );
    }

    userLabel.addEventListener('click', () => {
      setMenuOpen(menu.hidden);
    });

    document.addEventListener('click', (event) => {
      if (!accountMenu.contains(event.target)) setMenuOpen(false);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !menu.hidden) {
        setMenuOpen(false);
        userLabel.focus();
      }
    });

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
        `Current username: ${user.displayName?.trim() || user.email}`;
      usernameInput.value = user.displayName?.trim() || '';
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
        const data = await postAccountChange('/api/auth/change-username', {
          displayName: usernameInput.value.trim(),
        });
        user.displayName = data.user.displayName;
        updateUserLabel();
        usernameForm.querySelector('.account-email-current').textContent =
          `Current username: ${user.displayName}`;
        showFeedback(usernameFeedback, 'Your username has been updated.', 'success');
      } catch (error) {
        showRequestError(usernameFeedback, error, 'Could not update your username. Please try again.');
      } finally {
        usernameSubmit.disabled = false;
      }
    });

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
    const passwordInput = emailForm.elements.password;
    const emailFeedback = emailForm.querySelector('.account-feedback');
    const emailSubmit = emailForm.querySelector('[type="submit"]');

    changeEmailButton.addEventListener('click', () => {
      setMenuOpen(false);
      emailForm.querySelector('.account-email-current').textContent = `Current email: ${user.email}`;
      emailInput.value = '';
      passwordInput.value = '';
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
        const data = await postAccountChange('/api/auth/change-email', {
          email: emailInput.value.trim(),
          currentPassword: passwordInput.value,
        });
        user.email = data.user.email;
        updateUserLabel();
        emailForm.querySelector('.account-email-current').textContent = `Current email: ${user.email}`;
        passwordInput.value = '';
        showFeedback(emailFeedback, 'Your email has been updated.', 'success');
      } catch (error) {
        showRequestError(emailFeedback, error, 'Could not update your email. Please try again.');
      } finally {
        emailSubmit.disabled = false;
      }
    });

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
        await postAccountChange('/api/auth/change-password', {
          currentPassword: currentPasswordInput.value,
          newPassword: newPasswordInput.value,
        });
        passwordForm.reset();
        showFeedback(passwordFeedback, 'Your password has been updated.', 'success');
      } catch (error) {
        showRequestError(passwordFeedback, error, 'Could not update your password. Please try again.');
      } finally {
        passwordSubmit.disabled = false;
      }
    });

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
        await postAccountChange('/api/auth/delete-account', {
          currentPassword: deletePasswordInput.value,
          confirmation: deleteConfirmation.checked,
        });
        showFeedback(deleteFeedback, 'Your account has been deleted.', 'success');
        window.setTimeout(() => window.location.assign('index.html'), 700);
      } catch (error) {
        showRequestError(deleteFeedback, error, 'Could not delete your account. Please try again.');
        deleteSubmit.disabled = false;
      }
    });

    signOutButton.addEventListener('click', async () => {
      signOutButton.disabled = true;
      menuStatus.hidden = true;
      try {
        const response = await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`Sign out failed (${response.status}).`);
        window.location.reload();
      } catch (error) {
        menuStatus.textContent = error instanceof TypeError
          ? 'Could not reach the server. Check your connection and try again.'
          : error.message;
        menuStatus.hidden = false;
        signOutButton.disabled = false;
      }
    });
  }

  updateAccountNavigation().catch((error) => {
    console.error('Unable to update IYS account navigation.', error);
  });
})();
