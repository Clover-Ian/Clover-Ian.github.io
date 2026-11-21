/**
 * 封禁说明页：从 ?email= 或输入框拿到邮箱，向服务器查询原因。
 */
(() => {
  const client = window.iysSupabase;
  const intro = document.querySelector('[data-ban-intro]');
  const reasonBox = document.querySelector('[data-ban-reason]');
  const reasonText = document.querySelector('[data-ban-reason-text]');
  const untilEl = document.querySelector('[data-ban-until]');

  if (!client) {
    if (intro) intro.textContent = 'Account service is not available right now.';
    return;
  }

  const params = new URLSearchParams(location.search);
  const email = (params.get('email') || '').trim();

  function showReason(reason, until) {
    if (reason) {
      reasonText.textContent = reason;
      reasonBox.hidden = false;
    }
    if (until) {
      const date = new Date(until);
      const years = (date - Date.now()) / (1000 * 60 * 60 * 24 * 365);
      untilEl.textContent = years > 50
        ? 'This suspension has no end date.'
        : `It lifts on ${date.toLocaleString('en-GB')}, but it can be removed earlier.`;
      untilEl.hidden = false;
    }
  }

  async function init() {
    if (!email) {
      intro.textContent = 'Open this page from the sign-in screen so we can look up the account.';
      return;
    }

    try {
      const { data, error } = await client.rpc('ban_details', { p_email: email });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        intro.textContent = `No active suspension was found for ${email}.`;
        return;
      }

      intro.textContent = `${email} is suspended and cannot sign in until the ban is lifted.`;
      showReason(row.reason, row.until);
    } catch (error) {
      intro.textContent = `Could not load the details: ${error.message ?? error}`;
    }
  }

  init();
})();
