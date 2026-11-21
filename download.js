/**
 * 下载控件：主按钮下载最新版，右侧箭头选择任意历史版本。
 * 版本列表实时来自 GitHub Releases —— 发布新版本后网站会自动出现，无需改代码。
 *
 * 用法：<div class="dl" data-download="owner/repo"></div>
 */
(() => {
  const CACHE_KEY = 'iys.releases.v2';
  const CACHE_TTL = 10 * 60 * 1000;

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
    } catch { /* 隐私模式忽略 */ }
  }

  const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

  async function releases(repo) {
    if (cache[repo]) return cache[repo];

    const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=30`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);

    const list = (await res.json())
      .map((r) => {
        const asset = (r.assets ?? []).find((a) => a.name.toLowerCase().endsWith('.dmg'));
        if (!asset) return null;
        return {
          tag: r.tag_name,
          url: asset.browser_download_url,
          size: asset.size,
          published: r.published_at,
          prerelease: !!r.prerelease,
        };
      })
      .filter(Boolean);

    cache[repo] = list;
    saveCache();
    return list;
  }

  function build(host, repo, list) {
    host.innerHTML = '';

    const latest = list[0];
    if (!latest) return;

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
    caret.setAttribute('aria-haspopup', 'true');
    caret.setAttribute('aria-expanded', 'false');
    caret.innerHTML = '<svg viewBox="0 0 10 6" width="10" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

    const menu = document.createElement('div');
    menu.className = 'dl-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'menu');

    list.forEach((item, index) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'dl-option';
      option.setAttribute('role', 'menuitem');

      const name = document.createElement('span');
      name.className = 'dl-option-tag';
      name.textContent = item.tag;

      const meta = document.createElement('span');
      meta.className = 'dl-option-meta';
      meta.textContent = mb(item.size);

      option.append(name, meta);

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

    const caption = document.createElement('p');
    caption.className = 'dl-caption';
    const gh = document.createElement('a');
    gh.href = `https://github.com/${repo}/releases`;
    gh.target = '_blank';
    gh.rel = 'noopener noreferrer';
    gh.className = 'dl-github';
    gh.textContent = 'View on GitHub';
    caption.append(gh);

    function setCaption(item, isLatest) {
      caption.firstChild?.remove?.();
      caption.prepend(document.createTextNode(`${item.tag}${isLatest ? ' · latest' : ''} · ${mb(item.size)}  `));
    }
    setCaption(latest, true);

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
  }

  document.querySelectorAll('[data-download]').forEach(async (host) => {
    const repo = host.dataset.download;
    host.innerHTML = '<p class="dl-caption">Loading versions…</p>';
    try {
      build(host, repo, await releases(repo));
    } catch (error) {
      console.warn('[download] 读取版本失败：', error);
      host.innerHTML = `<p class="dl-caption"><a href="https://github.com/${repo}/releases">Download from GitHub</a></p>`;
    }
  });
})();
