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
  const CACHE_KEY = 'iys.downloads.v2';
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

  /// 站点自己托管的位置：downloads/<app>/<文件名>
  function siteURL(app, file) {
    return new URL(`downloads/${app}/${encodeURIComponent(file)}`, location.href).href;
  }

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

  /// 先读 Supabase Storage（国内快），没有文件时回退 GitHub Releases
  async function listFromStorage(app) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefix: `${app}/`, limit: 100 }),
    });
    if (!res.ok) return [];
    const rows = await res.json();
    return rows
      .filter((r) => r.name && r.name.toLowerCase().endsWith('.dmg'))
      .sort((a, b) => compare(a.name, b.name))
      .map((r) => ({
        file: r.name,
        tag: r.name.replace(/\.dmg$/i, ''),
        size: r.metadata?.size ?? 0,
        github: publicURL(app, r.name),
      }));
  }

  /// 版本列表来自 GitHub Releases：上传新 release 后网站自动出现
  async function listVersions(repo) {
    if (cache[repo]) return cache[repo];

    const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=30`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);

    const files = (await res.json())
      .map((r) => {
        const asset = (r.assets ?? []).find((a) => a.name.toLowerCase().endsWith('.dmg'));
        if (!asset) return null;
        return {
          file: asset.name,
          tag: r.tag_name,
          size: asset.size,
          github: asset.browser_download_url,
        };
      })
      .filter(Boolean);

    if (files.length) {          // 空结果不缓存，避免一次失败被记住 5 分钟
      cache[repo] = files;
      saveCache();
    }
    return files;
  }

  /// 三级取值：站点自托管 → Supabase → GitHub
  async function resolveURL(app, item) {
    const candidates = [
      siteURL(app, `${item.tag}.dmg`),      // downloads/<app>/v0.1.dmg（推荐命名）
      siteURL(app, item.file),              // 或者原始文件名
      publicURL(app, item.file),
    ];
    for (const url of candidates) {
      try {
        const head = await fetch(url, { method: 'HEAD' });
        if (head.ok) return url;
      } catch { /* 继续尝试下一个 */ }
    }
    return item.github;
  }

  function build(host, app, list, repo) {
    host.innerHTML = '';
    const latest = list[0];
    if (!latest) {
      host.innerHTML = '<p class="dl-caption">No downloads yet.</p>';
      return;
    }

    let selected = latest;
    let isLatestSelected = true;

    const group = document.createElement('div');
    group.className = 'dl-group';

    const main = document.createElement('a');
    main.className = 'dl-main';
    main.textContent = 'Download';
    main.setAttribute('download', '');

    function syncMainButton() {
      main.href = selected.github;
      resolveURL(app, selected).then((url) => { main.href = url; }).catch(() => {});
    }

    main.addEventListener('click', (event) => {
      event.preventDefault();
      resolveURL(app, selected).then((url) => {
        const a = document.createElement('a');
        a.href = url;
        a.setAttribute('download', '');
        document.body.append(a);
        a.click();
        a.remove();
      }).catch(() => { window.location.href = selected.github; });
    });

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

    function setCaption(item, isLatest) {
      caption.textContent = `${item.tag}${isLatest ? ' · latest' : ''}${item.size ? ` · ${label(item.size)}` : ''}`;
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
        selected = item;
        isLatestSelected = index === 0;
        setCaption(item, isLatestSelected);
        syncMainButton();
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

    setCaption(latest, true);
    syncMainButton();
  }

  document.querySelectorAll('[data-download]').forEach(async (host) => {
    const app = host.dataset.download;
    const repo = host.dataset.github;
    host.innerHTML = '<p class="dl-caption">Loading versions…</p>';
    try {
      const local = await listFromStorage(app).catch(() => []);
      const files = local.length ? local : await listVersions(repo);
      build(host, app, files, repo);
    } catch (error) {
      console.warn('[download] 读取版本失败：', error);
      const repo = host.dataset.github;
      host.innerHTML = '';
      if (repo) {
        const fallback = document.createElement('a');
        fallback.className = 'dl-main';
        fallback.style.borderRadius = '999px';
        fallback.href = `https://github.com/${repo}/releases`;
        fallback.target = '_blank';
        fallback.rel = 'noopener noreferrer';
        fallback.textContent = 'Download on GitHub';
        host.append(fallback);
      }
    }
  });
})();
