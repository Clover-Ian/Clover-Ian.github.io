/**
 * 悬停展开的导航面板（不用点击）。
 * 用法：给导航项加 data-mega="explore"，脚本会自动生成面板。
 * 点击导航项仍然正常跳转。
 */
(() => {
  const trigger = document.querySelector('[data-mega]');
  if (!trigger) return;

  const header = document.querySelector('.site-header');
  if (!header) return;

  const GROUPS = [
    {
      title: 'Play',
      links: [
        ['IYS Arcade', 'IYS Arcade.html', 'Seven quick browser tests'],
        ['IYS Critters', 'IYS Critters.html', 'Adopt a small creature'],
        ['Human Benchmark', 'IYS Human Benchmark.html', 'Reaction, aim, typing'],
      ],
    },
    {
      title: 'Software',
      links: [
        ['IYS Archiver', 'IYS Archiver Pro.html', 'Archives, every format'],
        ['IYS PDF', 'IYS Software.html', 'A light PDF editor'],
        ['IYS Studio', 'IYS Studio.html', 'Music, movies, stories'],
      ],
    },
  ];

  const panel = document.createElement('div');
  panel.className = 'mega-panel';
  panel.hidden = true;

  const inner = document.createElement('div');
  inner.className = 'mega-inner';

  GROUPS.forEach((group) => {
    const column = document.createElement('div');
    column.className = 'mega-column';

    const heading = document.createElement('p');
    heading.className = 'mega-heading';
    heading.textContent = group.title;
    column.append(heading);

    group.links.forEach(([label, href, note]) => {
      const link = document.createElement('a');
      link.className = 'mega-link';
      link.href = href;

      const name = document.createElement('span');
      name.className = 'mega-link-name';
      name.textContent = label;

      const hint = document.createElement('span');
      hint.className = 'mega-link-note';
      hint.textContent = note;

      link.append(name, hint);
      column.append(link);
    });

    inner.append(column);
  });

  panel.append(inner);
  header.append(panel);

  let closeTimer = 0;
  let openTimer = 0;

  function open() {
    window.clearTimeout(closeTimer);
    window.clearTimeout(openTimer);
    openTimer = window.setTimeout(() => {
      panel.hidden = false;
      // 下一帧再加 class，保证有过渡
      requestAnimationFrame(() => panel.classList.add('is-open'));
      trigger.setAttribute('aria-expanded', 'true');
    }, 70);
  }

  function close() {
    window.clearTimeout(openTimer);
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      panel.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      window.setTimeout(() => {
        if (!panel.classList.contains('is-open')) panel.hidden = true;
      }, 240);
    }, 120);
  }

  trigger.setAttribute('aria-haspopup', 'true');
  trigger.setAttribute('aria-expanded', 'false');

  trigger.addEventListener('mouseenter', open);
  trigger.addEventListener('focus', open);
  trigger.addEventListener('mouseleave', close);
  trigger.addEventListener('blur', close);

  panel.addEventListener('mouseenter', () => window.clearTimeout(closeTimer));
  panel.addEventListener('mouseleave', close);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  // 滚离顶部就收起
  window.addEventListener('scroll', () => {
    if (!panel.hidden && window.scrollY > 40) close();
  }, { passive: true });
})();
