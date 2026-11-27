/**
 * 全站 AI 助手：可拖动、可调大小、可全屏。
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

  const NICE = {
    'deepseek-v4.1-flash': 'DeepSeek 4.1 Flash',
    'glm-5.3-flash': 'GLM 5.3 Flash',
    'qwen-3.8-flash': 'Qwen 3.8 Flash',
    'relay-rlx/glm-5.3-flash': 'GLM 5.3 Flash (relay)',
    'glm-5.3': 'GLM 5.3',
    'GLM-5.4': 'GLM 5.4',
    'deepseek-v4-pro': 'DeepSeek 4 Pro',
    'kimi-k3.1-pro': 'Kimi K3.1 Pro',
    'kimi-k3.1-pro-high': 'Kimi K3.1 Pro High',
    'mimo-v2.6-pro': 'MiMo 2.6 Pro',
    'grok-composer-2.5-fast': 'Grok 2.5 Fast',
    'grok-4.7': 'Grok 4.7',
    'qwen4_max': 'Qwen4 Max',
  };

  const MAX_PER_SESSION = 30;
  let used = 0;

  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'ai-fab';
  fab.setAttribute('aria-label', 'Ask IYS AI');
  fab.innerHTML = '<img src="IYS AI.png" alt="" class="ai-fab-mark">';

  const panel = document.createElement('div');
  panel.className = 'ai-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="ai-head" data-drag>
      <img src="IYS AI.png" alt="" class="ai-mark">
      <div class="ai-head-text">
        <p class="ai-title">IYS AI</p>
        <p class="ai-sub">Ask about the site, the apps or the tools.</p>
      </div>
      <div class="ai-head-right">
        <select class="ai-model" aria-label="Model"></select>
        <button type="button" class="ai-max" aria-label="Fullscreen" title="Fullscreen">⤢</button>
        <button type="button" class="ai-close" aria-label="Close">×</button>
      </div>
    </div>
    <div class="ai-log" role="log" aria-live="polite"></div>
    <form class="ai-form">
      <input type="text" class="ai-input" placeholder="Ask something…" autocomplete="off">
      <button type="submit" class="ai-send" aria-label="Send">↑</button>
    </form>
    <span class="ai-resize" aria-hidden="true"></span>`;

  document.body.append(fab, panel);

  const log = panel.querySelector('.ai-log');
  const form = panel.querySelector('.ai-form');
  const input = panel.querySelector('.ai-input');
  const close = panel.querySelector('.ai-close');
  const maxButton = panel.querySelector('.ai-max');
  const handle = panel.querySelector('.ai-resize');
  const modelSelect = panel.querySelector('.ai-model');

  const STORE = { model: 'iys.ai.model', box: 'iys.ai.box' };
  const history = [];

  /* ---------- 位置 / 大小 ---------- */
  function applyBox(box) {
    panel.style.left = `${box.x}px`;
    panel.style.top = `${box.y}px`;
    panel.style.width = `${box.w}px`;
    panel.style.height = `${box.h}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function currentBox() {
    const rect = panel.getBoundingClientRect();
    return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
  }

  function saveBox() {
    try {
      localStorage.setItem(STORE.box, JSON.stringify(currentBox()));
    } catch { /* 忽略 */ }
  }

  (function restoreBox() {
    try {
      const box = JSON.parse(localStorage.getItem(STORE.box) || 'null');
      if (box && box.x >= 0 && box.y >= 0) applyBox(box);
    } catch { /* 忽略 */ }
  })();

  // 拖动
  panel.querySelector('[data-drag]').addEventListener('pointerdown', (event) => {
    if (event.target.closest('button, select')) return;
    if (panel.classList.contains('is-full')) return;

    const rect = panel.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    const move = (moveEvent) => {
      const x = Math.max(0, Math.min(window.innerWidth - rect.width, moveEvent.clientX - offsetX));
      const y = Math.max(0, Math.min(window.innerHeight - rect.height, moveEvent.clientY - offsetY));
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      saveBox();
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  // 调整大小（右下角把手）
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    if (panel.classList.contains('is-full')) return;

    const rect = panel.getBoundingClientRect();

    const move = (moveEvent) => {
      const w = Math.max(300, Math.min(window.innerWidth - rect.left, moveEvent.clientX - rect.left));
      const h = Math.max(320, Math.min(window.innerHeight - rect.top, moveEvent.clientY - rect.top));
      panel.style.width = `${w}px`;
      panel.style.height = `${h}px`;
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      saveBox();
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  // 全屏
  maxButton.addEventListener('click', () => {
    panel.classList.toggle('is-full');
    maxButton.title = panel.classList.contains('is-full') ? 'Exit fullscreen' : 'Fullscreen';
    if (!panel.classList.contains('is-full')) {
      try {
        const box = JSON.parse(localStorage.getItem(STORE.box) || 'null');
        if (box) applyBox(box);
      } catch { /* 忽略 */ }
    }
    input.focus();
  });

  /* ---------- 模型 ---------- */
  (function seedModels() {
    const saved = localStorage.getItem(STORE.model);
    Object.entries(NICE).forEach(([id, label]) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = label;
      modelSelect.append(option);
    });
    modelSelect.value = Object.keys(NICE).includes(saved) ? saved : 'deepseek-v4.1-flash';
    modelSelect.addEventListener('change', () => {
      localStorage.setItem(STORE.model, modelSelect.value);
    });
  })();

  /* ---------- 对话 ---------- */
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

  fab.addEventListener('click', () => toggle(!0));
  close.addEventListener('click', () => toggle(false));

  // 导航里的 "IYS AI" 入口
  function openFull() {
    toggle(true);
    panel.classList.remove('is-full');   // 先清掉再添加，保证从窗口态进入全屏
    panel.classList.add('is-full');
    maxButton.title = 'Exit fullscreen';
    input.focus();
  }

  document.querySelectorAll('[data-ai-open]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      openFull();
    });
  });

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
        body: JSON.stringify({
          messages: history,
          system: SYSTEM,
          maxTokens: 320,
          model: modelSelect.value || undefined,
        }),
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
