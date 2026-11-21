/**
 * 「下载最新版」按钮：从 GitHub Releases 取最新一版的 .dmg。
 * 页面只需写 <a data-latest="owner/repo">，脚本会填好真实链接和版本号。
 */
(() => {
  const CACHE_KEY = 'iys.latestReleases';
  const CACHE_TTL = 10 * 60 * 1000;   // 10 分钟

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed.at || Date.now() - parsed.at > CACHE_TTL) return {};
      return parsed.data ?? {};
    } catch {
      return {};
    }
  }

  function writeCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
    } catch {
      /* 隐私模式忽略 */
    }
  }

  const cache = readCache();

  async function latest(repo) {
    if (cache[repo]) return cache[repo];

    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);

    const data = await res.json();
    const asset = (data.assets ?? []).find((a) => a.name.toLowerCase().endsWith('.dmg'));
    if (!asset) throw new Error('no dmg asset');

    const info = {
      tag: data.tag_name ?? '',
      url: asset.browser_download_url,
      size: asset.size,
      page: `https://github.com/${repo}/releases`,
    };
    cache[repo] = info;
    writeCache(cache);
    return info;
  }

  function megabytes(bytes) {
    if (!bytes) return '';
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  async function fill(link) {
    const repo = link.dataset.latest;
    if (!repo) return;

    const base = link.textContent.trim() || 'Download';
    link.href = `https://github.com/${repo}/releases/latest`;
    link.rel = 'noopener noreferrer';

    try {
      const info = await latest(repo);
      link.href = info.url;
      const size = megabytes(info.size);
      link.textContent = info.tag
        ? `${base} ${info.tag}${size ? ` · ${size}` : ''}`
        : base;
    } catch (error) {
      console.warn('[download] 取最新版本失败：', error);
      link.textContent = base;
    }
  }

  document.querySelectorAll('a[data-latest]').forEach(fill);
})();
