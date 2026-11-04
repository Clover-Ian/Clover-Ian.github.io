/**
 * 设置新密码页面。用户点击 Supabase 重置邮件里的链接后会带着 recovery 会话回到这里。
 */
(() => {
  const form = document.querySelector('form[data-reset-form]');
  if (!form) return;

  const client = window.iysSupabase;
  const feedback = form.querySelector('.account-feedback');
  const submit = form.querySelector('[type="submit"]');
  const passwordInput = form.elements.password;
  const confirmationInput = form.elements.confirmation;

  const ERROR_MESSAGES = {
    weak_password: 'Password is too weak. Use at least 8 characters.',
    same_password: 'The new password must be different from the old one.',
    over_request_rate_limit: 'Too many attempts. Please wait a few minutes and try again.',
  };

  function showMessage(message, type = 'error') {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle('is-success', type === 'success');
    feedback.hidden = false;
  }

  function messageForError(error) {
    if (error instanceof TypeError) {
      return 'Could not reach the account service. Check your connection and try again.';
    }
    return ERROR_MESSAGES[error?.code] || error?.message || 'Something went wrong. Please try again.';
  }

  async function verifyRecoverySession() {
    if (!client) {
      showMessage('Account service is not available. Please try again later.');
      submit.disabled = true;
      return;
    }

    const { data, error } = await client.auth.getSession();
    if (error) throw error;

    if (!data.session) {
      showMessage('This reset link is invalid or has expired. Please request a new one.');
      submit.disabled = true;
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (feedback) {
      feedback.hidden = true;
      feedback.textContent = '';
      feedback.classList.remove('is-success');
    }

    if (!client) {
      showMessage('Account service is not available. Please try again later.');
      return;
    }

    if (passwordInput.value !== confirmationInput.value) {
      showMessage('Passwords do not match.');
      confirmationInput.focus();
      return;
    }

    submit.disabled = true;
    try {
      const { error } = await client.auth.updateUser({ password: passwordInput.value });
      if (error) throw error;

      showMessage('Password updated. Taking you to sign in…', 'success');
      await client.auth.signOut({ scope: 'local' }).catch(() => {});
      window.setTimeout(() => {
        window.location.assign('IYS Account Sign In.html');
      }, 900);
    } catch (error) {
      showMessage(messageForError(error));
      submit.disabled = false;
    }
  });

  verifyRecoverySession().catch((error) => {
    console.error('Unable to verify reset link.', error);
    showMessage('Could not verify the reset link. Please request a new one.');
    submit.disabled = true;
  });
})();
