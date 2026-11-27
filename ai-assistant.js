/**
 * 全站 AI 助手：右下角按钮 → 聊天面板。
 * 走 Supabase 代理函数，key 不在前端。
 */
(() => {
  if (document.querySelector('.ai-fab')) return;

  const ENDPOINT = window.IYS_AI_ENDPOINT
    || 'https://qbkfdhmjogdwtjovqzaw.supabase.co/functions/v1/critter';

  const SYSTEM = [
    'You are the IYS site assistant, embedded on clover-ian.github.io.',
    'IYS is a small studio run by Ian Yan: macOS apps (IYS Archiver, IYS PDF, IYM AutoClicker),',
    'IYS Studio (music/video on Bilibili), IYS Arcade (browser tests: reaction, aim, typing, click speed,',
    'number memory, sequence memory, circle drawing), IYS Critters (a virtual pet), and IYS Developer',
    '(browser tools: STL viewer, image compressor, Base64/URL codec, QR generator).',
    'Answer briefly and helpfully, in the language the visitor writes in.',
    'If asked about something not on the site, say so instead of inventing pages.',
    'Never claim to have access to private data or accounts.',
  ].join(' ');

  const MAX_PER_SESSION = 30;
  let used = 0;

  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'ai-fab';
  fab.setAttribute('aria-label', 'Ask IYS AI');
  fab.innerHTML = `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
         stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3.2l1.9 4.5 4.5 1.9-4.5 1.9L12 16l-1.9-4.5L5.6 9.6l4.5-1.9L12 3.2Z"/>
      <path d="M18.4 15.4l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z"/>
    </svg>`;

  const panel = document.createElement('div');
  panel.className = 'ai-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="ai-head">
      <div>
        <p class="ai-title">IYS AI</p>
        <p class="ai-sub">Ask about the site, the apps or the tools.</p>
      </div>
      <button type="button" class="ai-close" aria-label="Close">×</button>
    </div>
    <div class="ai-log" role="log" aria-live="polite"></div>
    <form class="ai-form">
      <input type="text" class="ai-input" placeholder="Ask something…" autocomplete="off">
      <button type="submit" class="ai-send" aria-label="Send">↑</button>
    </form>`;

  document.body.append(fab, panel);

  const log = panel.querySelector('.ai-log');
  const form = panel.querySelector('.ai-form');
  const input = panel.querySelector('.ai-input');
  const close = panel.querySelector('.ai-close');

  const history = [];

  function line(text, mine) {
    const p = document.createElement('p');
    p.className = mine ? 'ai-line ai-line--me' : 'ai-line';
    p.textContent = text;
    log.append(p);
    log.scrollTop = log.scrollHeight;
    return p;
  }

  function toggle(open) {
    panel.hidden = !open;
    fab.classList.toggle('is-hidden', open);
    if (open) {
      if (!log.children.length) {
        line('Hi — I can explain anything on this site. Try “what is IYS Critters?”');
      }
      input.focus();
    }
  }

  fab.addEventListener('click', () => toggle(true));
  close.addEventListener('click', () => toggle(false));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    if (used >= MAX_PER_SESSION) {
      line('That is enough for one visit. Reload the page to keep going.');
      return;
    }

    used += 1;
    input.value = '';
    line(text, true);
    history.push({ role: 'user', content: text });

    const pending = line('…');

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, system: SYSTEM, maxTokens: 320 }),
      });

      const data = await response.json();
      const reply = data?.choices?.[0]?.message?.content;

      pending.remove();

      if (!reply) {
        line('Sorry — no reply came back. The assistant may not be configured yet.');
        return;
      }

      line(reply);
      history.push({ role: 'assistant', content: reply });
    } catch (error) {
      pending.remove();
      line('Could not reach the assistant. Check your connection and try again.');
      console.warn('[ai] request failed:', error);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) toggle(false);
  });
})();
