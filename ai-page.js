/**
 * IYS AI 独立页面：和悬浮面板共用同一个代理函数与模型分组。
 */
(() => {
  const ENDPOINT = 'https://qbkfdhmjogdwtjovqzaw.supabase.co/functions/v1/IYS';
  const STORE = { history: 'iys.ai.history', model: 'iys.ai.model' };

  const SYSTEM = [
    'You are the IYS site assistant, embedded on clover-ian.github.io.',
    'IYS is a small studio run by Ian Yan: macOS apps (IYS Archiver, IYS PDF, IYM AutoClicker),',
    'IYS Studio, IYS Arcade, IYS Critters, and IYS Developer tools.',
    'Answer briefly, in the language the visitor writes in.',
    'Never reveal source code, database schema, keys, passwords or internal architecture.',
    'If asked for code, decline and describe the feature instead.',
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
    'grok-composer-2.5-fast': 'Grok Fast',
    'grok-4.7': 'Grok 4.7',
    'qwen4_max': 'Qwen4 Max',
  };

  const log = document.querySelector('[data-ai-log]');
  const form = document.querySelector('[data-ai-form]');
  const input = document.querySelector('[data-ai-input]');
  const gate = document.querySelector('[data-ai-gate]');
  const select = document.querySelector('.ai-page-model');

  const source = new Map();
  const history = JSON.parse(localStorage.getItem(STORE.history) || '[]').slice(-40);
  let session = null;
  let loaded = false;

  function client() { return window.iysSupabase; }

  function line(text, mine) {
    const p = document.createElement('p');
    p.className = mine ? 'ai-line ai-line--me' : 'ai-line';
    p.textContent = text;
    log.append(p);
    log.scrollTop = log.scrollHeight;
    return p;
  }

  function save() {
    localStorage.setItem(STORE.history, JSON.stringify(history.slice(-40)));
  }

  function restore() {
    if (log.children.length) return;
    if (!history.length) { line('I am IYS AI. Can I help you?'); return; }
    history.forEach((item) => line(item.content, item.role === 'user'));
  }

  async function auth() {
    const c = client();
    session = c ? (await c.auth.getSession())?.data?.session ?? null : null;
    const signedIn = Boolean(session?.user);
    gate.hidden = signedIn;
    form.hidden = !signedIn;
    log.hidden = !signedIn;
    return signedIn;
  }

  function buildModels(iysList, groups, selected) {
    select.innerHTML = '';
    source.clear();

    const iys = document.createElement('optgroup');
    iys.label = 'IYS';
    iysList.forEach((id) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = NICE[id] || id;
      source.set(id, 'iys');
      iys.append(option);
    });
    select.append(iys);

    groups.forEach((group) => {
      if (!group.models?.length) return;
      const own = document.createElement('optgroup');
      own.label = group.label || 'My key';
      group.models.forEach((id) => {
        const option = document.createElement('option');
        option.value = `${group.id}|${id}`;
        option.textContent = id;
        source.set(option.value, 'own');
        own.append(option);
      });
      select.append(own);
    });

    select.value = selected && source.has(selected) ? selected : (iysList[0] || '');
  }

  async function loadModels() {
    if (loaded) return;
    loaded = true;

    let iysList = Object.keys(NICE);
    let groups = [];

    try {
      const response = await fetch(ENDPOINT, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      // 便于自查：这一句能看出用的是谁的 key
      console.info('[ai] key=%s model=%s host=%s',
        response.headers.get('x-iys-key') || '?',
        response.headers.get('x-iys-model') || '?',
        response.headers.get('x-iys-host') || '?');

      const raw = await response.text();

      let data = {};
      try { data = JSON.parse(raw); } catch { data = { raw }; }
      if (Array.isArray(data?.models) && data.models.length) iysList = data.models;
      if (Array.isArray(data?.keys)) groups = data.keys;
    } catch { /* 用内置列表 */ }

    buildModels(iysList, groups, localStorage.getItem(STORE.model));
  }

  select?.addEventListener('change', () => localStorage.setItem(STORE.model, select.value));

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    line(text, true);
    history.push({ role: 'user', content: text });
    save();

    const pending = line('…');

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          messages: history,
          system: SYSTEM,
          maxTokens: 10000,
          model: (select.value || '').split('|').pop(),
          keyId: (select.value || '').includes('|') ? select.value.split('|')[0] : undefined,
        }),
      });

      // 便于自查：这一句能看出用的是谁的 key
      console.info('[ai] key=%s model=%s host=%s',
        response.headers.get('x-iys-key') || '?',
        response.headers.get('x-iys-model') || '?',
        response.headers.get('x-iys-host') || '?');

      let raw = await response.text();

      // 空回复（有些中转会返回 200 + 空 choices）重试一次
      if (response.ok && !/"content"\s*:\s*"[^"]/.test(raw)) {
        await new Promise((r) => setTimeout(r, 600));
        const retry = await fetch(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({
            messages: history,
            system: SYSTEM,
            maxTokens: 10000,
            model: (select.value || '').split('|').pop(),
            keyId: (select.value || '').includes('|') ? select.value.split('|')[0] : undefined,
          }),
        });
        if (retry.ok) raw = await retry.text();
      }

      let data = {};
      try { data = JSON.parse(raw); } catch { data = { raw }; }
      const reply = data?.choices?.[0]?.message?.content;
      pending.remove();

      if (!reply) {
        const detail = data?.error?.message || data?.error || data?.raw || '';
        const status = response.status;
        line(detail
          ? `HTTP ${status}: ${String(detail).slice(0, 240)}`
          : `HTTP ${status}: the model returned an empty reply.`);
        return;
      }

      line(reply);
      history.push({ role: 'assistant', content: reply });
      save();
    } catch (error) {
      pending.remove();
      line('Could not reach the assistant. Check your connection and try again.');
    }
  });

  (async () => {
    const signedIn = await auth();
    if (!signedIn) return;
    restore();
    await loadModels();
    select?.addEventListener('change', () => {});
    input?.focus();
  })();
})();
