/**
 * 注册 / 登录页面共用的表单逻辑。
 * 账号由 Supabase Auth 托管；浏览器本地保存会话，不再依赖我们自己的后端。
 */
(() => {
  const form = document.querySelector('form[data-account-form]');
  if (!form) return;

  const mode = form.dataset.accountForm; // "signup" | "signin"
  const button = form.querySelector('button[type="submit"]');
  const feedback = form.querySelector('.account-feedback');
  const defaultLabel = button ? button.textContent : '';
  const client = window.iysSupabase;

  const ERROR_MESSAGES = {
    invalid_credentials: 'Email or password is incorrect.',
    email_not_confirmed: 'Please confirm your email before signing in.',
    user_already_exists: 'An account with this email already exists. Try signing in instead.',
    email_exists: 'An account with this email already exists. Try signing in instead.',
    weak_password: 'Password is too weak. Use at least 8 characters.',
    over_email_send_rate_limit: 'Too many emails sent. Please wait a few minutes and try again.',
    over_request_rate_limit: 'Too many attempts. Please wait a few minutes and try again.',
    signup_disabled: 'Sign ups are currently disabled.',
    email_address_invalid: 'Please enter a valid email address.',
  };

  function showMessage(message, type = 'error') {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle('is-success', type === 'success');
    feedback.hidden = false;
  }

  function clearMessage() {
    if (!feedback) return;
    feedback.hidden = true;
    feedback.textContent = '';
    feedback.classList.remove('is-success');
  }

  function setBusy(busy) {
    if (!button) return;
    button.disabled = busy;
    button.textContent = busy
      ? mode === 'signup'
        ? 'Creating account…'
        : 'Signing in…'
      : defaultLabel;
  }

  function messageForError(error) {
    if (error instanceof TypeError) {
      return 'Could not reach the account service. Check your connection and try again.';
    }
    return ERROR_MESSAGES[error?.code] || error?.message || 'Something went wrong. Please try again.';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage();

    if (!client) {
      showMessage('Account service is not available. Please try again later.');
      return;
    }

    const values = Object.fromEntries(new FormData(form));
    const email = String(values.email ?? '').trim();
    const password = String(values.password ?? '');

    if (mode === 'signup') {
      const confirmation = String(values['password-confirmation'] ?? '');
      if (password !== confirmation) {
        showMessage('Passwords do not match.');
        form.querySelector('input[name="password-confirmation"]')?.focus();
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === 'signup') {
        const displayName = String(values.name ?? '').trim();
        const options = {
          // 明确指定邮件确认后的落地页，避免依赖 Supabase 的 Site URL。
          emailRedirectTo: new URL('index.html', window.location.href).href,
        };
        if (displayName) options.data = { display_name: displayName };

        const { data, error } = await client.auth.signUp({
          email,
          password,
          options,
        });
        if (error) throw error;

        if (!data.session) {
          showMessage('Account created. Check your email to confirm, then sign in.', 'success');
          setBusy(false);
          return;
        }
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }

      showMessage(
        mode === 'signup'
          ? 'Account created. Taking you to the homepage…'
          : 'Signed in. Taking you to the homepage…',
        'success',
      );
      window.setTimeout(() => {
        window.location.assign('index.html');
      }, 700);
    } catch (error) {
      showMessage(messageForError(error));
      setBusy(false);
    }
  });
})();
