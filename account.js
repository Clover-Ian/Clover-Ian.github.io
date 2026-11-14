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

  // 注册后用 8 位验证码确认邮箱（同一份代码也跑在登录页，那里没有这些节点）
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

  function showMessage(message, type = 'error', html = false) {
    if (!feedback) return;
    if (html) feedback.innerHTML = message;
    else feedback.textContent = message;
    feedback.classList.toggle('is-success', type === 'success');
    feedback.hidden = false;
  }

  function clearMessage() {
    if (!feedback) return;
    feedback.hidden = true;
    feedback.textContent = '';
    feedback.classList.remove('is-success');
  }

  function usernameProblem(name) {
    if (!name) return 'Please choose a name.';
    if (name.length < 2) return 'Names need at least 2 characters.';
    if (name.length > 24) return 'Names can be at most 24 characters.';
    if (!/^[\p{L}\p{N} ._-]+$/u.test(name)) return 'Use letters, numbers, spaces, dots, dashes or underscores.';
    return '';
  }

  /** true = 已被占用；null = 查不了（表还没建好，别挡住注册） */
  async function isUsernameTaken(name) {
    if (!client) return null;
    try {
      const { data, error } = await client
        .from('profiles')
        .select('username')
        .ilike('username', name)
        .limit(1);
      if (error) {
        console.warn('[account] 用户名查询失败：', error.message);
        return null;
      }
      return Array.isArray(data) && data.length > 0;
    } catch (error) {
      console.warn('[account] 用户名查询异常：', error);
      return null;
    }
  }

  /** 登录后把用户名写进 profiles（已有就跳过） */
  async function saveProfile(user) {
    if (!client || !user) return;
    const name = String(user.user_metadata?.display_name ?? '').trim();
    if (!name) return;
    try {
      const { data } = await client.from('profiles').select('id').eq('id', user.id).limit(1);
      if (Array.isArray(data) && data.length) return;
      const { error } = await client.from('profiles').insert({ id: user.id, username: name });
      if (error) console.warn('[account] 写入 profiles 失败：', error.message);
    } catch (error) {
      console.warn('[account] 写入 profiles 异常：', error);
    }
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
        const problem = usernameProblem(displayName);
        if (problem) {
          showMessage(problem);
          form.querySelector('input[name="name"]')?.focus();
          setBusy(false);
          return;
        }
        const taken = await isUsernameTaken(displayName);
        if (taken === true) {
          showMessage('That name is already taken. Please pick another one.');
          form.querySelector('input[name="name"]')?.focus();
          setBusy(false);
          return;
        }

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

        // Supabase 为了防邮箱探测，重复邮箱会返回一个 identities 为空的假用户
        if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          showMessage(
            'An account with this email already exists. '
            + '<a href="IYS Account Sign In.html">Sign in</a> instead — or email '
            + '<a href="mailto:iys-ian@outlook.com?subject=IYS%20account%20help">iys-ian@outlook.com</a> '
            + 'if you need help.',
            'error',
            true,
          );
          setBusy(false);
          return;
        }

        if (!data.session) {
          // Supabase 这边开启了邮箱确认：拿不到会话，进入输码步骤
          showVerifyStep(email);
          setBusy(false);
          return;
        }
        await saveProfile(data.user);
      } else {
        const { data: signIn, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await saveProfile(signIn?.user);
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
    // 只允许数字，最多 8 位
    verifyCode?.addEventListener('input', () => {
      const digits = verifyCode.value.replace(/\D/g, '').slice(0, 8);
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
      if (code.length !== 8) {
        showVerifyMessage('Enter the 8-digit code from the email.');
        verifyCode?.focus();
        return;
      }

      if (verifyButton) {
        verifyButton.disabled = true;
        verifyButton.textContent = 'Verifying…';
      }

      try {
        const { data: verified, error } = await client.auth.verifyOtp({
          email: pendingEmail,
          token: code,
          type: 'signup',
        });
        if (error) throw error;
        await saveProfile(verified?.user);

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

  // 注册页：边输名字边查重
  const nameInput = form.querySelector('input[name="name"]');
  const nameHint = document.querySelector('[data-name-hint]');
  if (mode === 'signup' && nameInput && nameHint) {
    let typingTimer = 0;
    nameInput.addEventListener('input', () => {
      window.clearTimeout(typingTimer);
      const value = nameInput.value.trim();
      nameHint.hidden = true;
      if (!value) return;

      const problem = usernameProblem(value);
      if (problem) {
        nameHint.textContent = problem;
        nameHint.hidden = false;
        return;
      }
      typingTimer = window.setTimeout(async () => {
        const taken = await isUsernameTaken(value);
        if (taken === true) {
          nameHint.textContent = 'That name is already taken.';
          nameHint.hidden = false;
        }
      }, 400);
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
