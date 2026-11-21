/**
 * 下载控件：主按钮下载最新版，箭头选历史版本。
 * 文件来自 Supabase Storage 的 downloads 桶，版本列表也直接读桶内容。
 * 文件夹约定：downloads/<app>/<版本>.dmg
 *   例：downloads/archiver/v0.2.dmg
 *
 * 用法：<div class="dl" data-download="archiver"></div>
 */
(() => {
  const SUPABASE_URL = window.IYS_SUPABASE_URL || 'https://qbkfdhmjogdwtjovqzaw.supabase.co';
  const SUPABASE_KEY = window.IYS_SUPABASE_KEY || 'sb_publishable_n04Iayrnlhn4aznjtLa0Rg_gSJqdBTS';
  const BUCKET = 'downloads';
  const CACHE_KEY = 'iys.downloads.v1';
  const CACHE_TTL = 5 * 60 * 1000;

  const cache = (() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed.at || Date.now() - parsed.at > CACHE_TTL) return {};
      return parsed.data ?? {};
    } catch { return {}; }
  })();

  function saveCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: cache }));
    } catch { /* 忽略 */ }
  }

  const label = (bytes) => bytes ? `${(bytes / 1048576).toFixed(1)} MB` : '';

  function publicURL(app, file) {
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${app}/${encodeURIComponent(file)}`;
  }

  /// 版本号排序：v0.2 > v0.1，v1.17 > v1.9
  function versionWeight(name) {
    return name.replace(/\.dmg$/i, '').replace(/^v/i, '')
      .split(/[.\-]/).map((n) => parseInt(n, 10) || 0);
  }

  function compare(a, b) {
    const x = versionWeight(a), y = versionWeight(b);
    for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
      const d = (y[i] ?? 0) - (x[i] ?? 0);      // 大的在前
      if (d !== 0) return d;
    }
    return 0;
  }

  async function listVersions(app) {
    if (cache[app]) return cache[app];

    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefix: `${app}/`, limit: 100 }),
    });
    if (!res.ok) throw new Error(`Storage ${res.status}`);

    const rows = await res.json();
    const files = rows
      .filter((r) => r.name && r.name.toLowerCase().endsWith('.dmg'))
      .sort((a, b) => compare(a.name, b.name))
      .map((r) => ({
        file: r.name,
        tag: r.name.replace(/\.dmg$/i, ''),
        size: r.metadata?.size ?? 0,
        url: publicURL(app, r.name),
      }));

    cache[app] = files;
    saveCache();
    return files;
  }

  function build(host, app, list) {
    host.innerHTML = '';
    const latest = list[0];
    if (!latest) {
      host.innerHTML = '<p class="dl-caption">No downloads yet.</p>';
      return;
    }

    const group = document.createElement('div');
    group.className = 'dl-group';

    const main = document.createElement('a');
    main.className = 'dl-main';
    main.textContent = 'Download';
    main.href = latest.url;
    main.setAttribute('download', '');

    const caret = document.createElement('button');
    caret.type = 'button';
    caret.className = 'dl-caret';
    caret.setAttribute('aria-label', 'Choose a version');
    caret.setAttribute('aria-expanded', 'false');
    caret.innerHTML = '<svg viewBox="0 0 10 6" width="10" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

    const menu = document.createElement('div');
    menu.className = 'dl-menu';
    menu.hidden = true;

    const caption = document.createElement('p');
    caption.className = 'dl-caption';

    const gh = document.createElement('a');
    gh.className = 'dl-github';
    gh.target = '_blank';
    gh.rel = 'noopener noreferrer';

    function setCaption(item, isLatest) {
      caption.textContent = `${item.tag}${isLatest ? ' · latest' : ''}${item.size ? ` · ${label(item.size)}` : ''}  `;
      caption.append(gh);
    }

    list.forEach((item, index) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'dl-option';

      const tag = document.createElement('span');
      tag.className = 'dl-option-tag';
      tag.textContent = item.tag;

      const meta = document.createElement('span');
      meta.className = 'dl-option-meta';
      meta.textContent = label(item.size);

      option.append(tag, meta);

      if (index === 0) {
        const badge = document.createElement('span');
        badge.className = 'dl-latest';
        badge.textContent = 'latest';
        option.append(badge);
      }

      option.addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = item.url;
        a.setAttribute('download', '');
        document.body.append(a);
        a.click();
        a.remove();
        setCaption(item, index === 0);
        close();
      });

      menu.append(option);
    });

    function close() {
      menu.hidden = true;
      caret.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', onOutside, true);
    }
    function onOutside(event) {
      if (!group.contains(event.target)) close();
    }

    caret.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = menu.hidden;
      menu.hidden = !open;
      caret.setAttribute('aria-expanded', String(open));
      if (open) document.addEventListener('click', onOutside, true);
    });

    group.append(main, caret, menu);
    host.append(group, caption);

    // GitHub 只作为历史归档入口，不再是下载地址
    const repo = host.dataset.github;
    if (repo) {
      gh.href = `https://github.com/${repo}/releases`;
      gh.textContent = 'View on GitHub';
      setCaption(latest, true);
    } else {
      setCaption(latest, true);
      gh.remove();
    }
  }

  document.querySelectorAll('[data-download]').forEach(async (host) => {
    const app = host.dataset.download;
    host.innerHTML = '<p class="dl-caption">Loading versions…</p>';
    try {
      build(host, app, await listVersions(app));
    } catch (error) {
      console.warn('[download] 读取版本失败：', error);
      host.innerHTML = '<p class="dl-caption">Downloads are temporarily unavailable.</p>';
    }
  });
})();
