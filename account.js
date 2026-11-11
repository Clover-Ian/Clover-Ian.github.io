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

  // 注册后用 6 位验证码确认邮箱（同一份代码也跑在登录页，那里没有这些节点）
  const verifyStep = document.querySelector('[data-verify-step]');
  const verifyForm = document.querySelector('[data-verify-form]');
  const verifyEmail = document.querySelector('[data-verify-email]');
  const verifyCode = document.querySelector('[data-verify-code]');
  const verifyFeedback = verifyStep ? verifyStep.querySelector('.account-feedback') : null;
  const verifyButton = verifyForm ? verifyForm.querySelector('button[type="submit"]') : null;
  const resendButton = document.querySelector('[data-verify-resend]');
  let pendingEmail = '';

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
    otp_expired: 'That code has expired or is invalid. Send a new one.',
    token_expired: 'That code has expired. Send a new one.',
    invalid_token: 'That code is not right. Check it and try again.',
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

  function showVerifyMessage(message, type = 'error') {
    if (!verifyFeedback) return;
    verifyFeedback.textContent = message;
    verifyFeedback.classList.toggle('is-success', type === 'success');
    verifyFeedback.hidden = false;
  }

  function clearVerifyMessage() {
    if (!verifyFeedback) return;
    verifyFeedback.hidden = true;
    verifyFeedback.textContent = '';
    verifyFeedback.classList.remove('is-success');
  }

  /** 切到"输验证码"这一步 */
  function showVerifyStep(email) {
    pendingEmail = email;
    if (!verifyStep) return;
    if (verifyEmail) verifyEmail.textContent = email;
    form.hidden = true;
    verifyStep.hidden = false;
    clearVerifyMessage();
    verifyCode?.focus();
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
          // Supabase 这边开启了邮箱确认：拿不到会话，进入输码步骤
          showVerifyStep(email);
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

  // ----- 邮箱验证码 -----
  if (verifyForm) {
    // 只允许数字，最多 6 位
    verifyCode?.addEventListener('input', () => {
      const digits = verifyCode.value.replace(/\D/g, '').slice(0, 6);
      if (digits !== verifyCode.value) verifyCode.value = digits;
    });

    verifyForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearVerifyMessage();

      if (!client) {
        showVerifyMessage('Account service is not available. Please try again later.');
        return;
      }

      const code = String(verifyCode?.value ?? '').replace(/\D/g, '');
      if (code.length !== 6) {
        showVerifyMessage('Enter the 6-digit code from the email.');
        verifyCode?.focus();
        return;
      }

      if (verifyButton) {
        verifyButton.disabled = true;
        verifyButton.textContent = 'Verifying…';
      }

      try {
        const { error } = await client.auth.verifyOtp({
          email: pendingEmail,
          token: code,
          type: 'signup',
        });
        if (error) throw error;

        showVerifyMessage('Email confirmed. Taking you to the homepage…', 'success');
        window.setTimeout(() => {
          window.location.assign('index.html');
        }, 700);
      } catch (error) {
        showVerifyMessage(messageForError(error));
        if (verifyButton) {
          verifyButton.disabled = false;
          verifyButton.textContent = 'Verify email';
        }
        verifyCode?.select();
      }
    });
  }

  if (resendButton) {
    resendButton.addEventListener('click', async () => {
      clearVerifyMessage();
      if (!client || !pendingEmail) return;

      resendButton.disabled = true;
      try {
        const { error } = await client.auth.resend({ type: 'signup', email: pendingEmail });
        if (error) throw error;
        showVerifyMessage('A new code is on its way. Check your inbox.', 'success');
      } catch (error) {
        showVerifyMessage(messageForError(error));
      } finally {
        resendButton.disabled = false;
      }
    });
  }

  // Forgot password: only send a reset email when nobody is signed in.
  const forgotLink = form.querySelector('[data-forgot-password]');
  if (mode === 'signin' && forgotLink) {
    forgotLink.addEventListener('click', async (event) => {
      event.preventDefault();
      clearMessage();

      if (!client) {
        showMessage('Account service is not available. Please try again later.');
        return;
      }

      const emailInput = form.querySelector('input[name="email"]');
      const email = String(emailInput?.value ?? '').trim();
      if (!email) {
        showMessage('Enter your email address first.');
        emailInput?.focus();
        return;
      }

      try {
        const { data: { session } } = await client.auth.getSession();
        if (session) {
          showMessage(
            'You are already signed in. Change your password from the account menu.',
            'success',
          );
          return;
        }

        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: new URL('IYS Account Reset Password.html', window.location.href).href,
        });
        if (error) throw error;

        showMessage('If an account exists for that email, a reset link has been sent.', 'success');
      } catch (error) {
        showMessage(messageForError(error));
      }
    });
  }
})();
