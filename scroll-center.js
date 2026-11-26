/**
 * 带 hash 打开页面时，把目标区块滚到窗口正中；切换 hash 也生效。
 */
(() => {
  const CENTER = (target) => {
    const rect = target.getBoundingClientRect();
    const offset = rect.top + window.scrollY - (window.innerHeight - rect.height) / 2;
    window.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
  };

  function jump() {
    if (!location.hash) return;
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (!target) return;
    // 等布局稳定（图片、字体）后再居中
    requestAnimationFrame(() => {
      CENTER(target);
      window.setTimeout(() => CENTER(target), 220);
    });
  }

  if (document.readyState === 'complete') jump();
  else window.addEventListener('load', jump, { once: true });

  window.addEventListener('hashchange', jump);
})();
