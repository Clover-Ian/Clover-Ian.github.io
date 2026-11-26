/**
 * 导航悬停面板：每个导航项有自己的内容，切换时快速淡入 + 轻微上浮。
 * 停在导航栏的空白处不会关闭，也不会改变当前内容。
 */
(() => {
  const navLinks = document.querySelector('.nav-links');
  const header = document.querySelector('.site-header');
  if (!navLinks || !header) return;

  const SECTIONS = {
    iym: {
      title: 'IYM',
      columns: [
        { heading: 'IYM', links: [
          ['IYM AutoClicker', 'IYM AutoClicker Pro.html'],
          ['About IYM', 'IYM.html'],
        ] },
      ],
    },
    software: {
      title: 'Software',
      columns: [
        { heading: 'IYS Software', links: [
          ['IYS Archiver', 'IYS Archiver Pro.html'],
          ['IYS PDF', 'IYS Software.html'],
          ['IYM AutoClicker', 'IYM AutoClicker Pro.html'],
        ] },
      ],
    },
    studio: {
      title: 'Studio',
      columns: [
        { heading: 'IYS Studio', links: [
          ['IYS Studio', 'IYS Studio.html'],
          ['Bilibili', 'https://space.bilibili.com/3546826449881110'],
        ] },
      ],
    },
    website: {
      title: 'Website',
      columns: [
        { heading: 'IYS Website', links: [
          ['IYS Arcade', 'IYS Arcade.html'],
          ['IYS Critters', 'IYS Critters.html'],
        ] },
      ],
    },
  };

  const triggerFor = (link) => {
    if (!link) return null;
    const href = link.getAttribute('href') ?? '';
    if (href === 'IYM.html') return 'iym';
    if (href === 'IYS Software.html') return 'software';
    if (href === 'IYS Studio.html') return 'studio';
    if (href === 'IYS Website.html') return 'website';
    return null;
  };

  const panel = document.createElement('div');
  panel.className = 'mega-panel';
  panel.hidden = true;

  const inner = document.createElement('div');
  inner.className = 'mega-inner';
  panel.append(inner);
  header.append(panel);

  let current = '';
  let openTimer = 0;
  let closeTimer = 0;
  let swapTimer = 0;

  function render(key, immediate = false) {
    const section = SECTIONS[key];
    if (!section) return;

    const paint = () => {
      inner.innerHTML = '';
      inner.dataset.section = key;

      section.columns.forEach((column) => {
        const col = document.createElement('div');
        col.className = 'mega-column';

        const heading = document.createElement('p');
        heading.className = 'mega-heading';
        heading.textContent = column.heading;
        col.append(heading);

        column.links.forEach(([label, href], index) => {
          const link = document.createElement('a');
          link.className = 'mega-link';
          link.href = href;
          link.style.animationDelay = `${index * 18}ms`;
          link.textContent = label;

          // 外站链接：右上角小箭头 + 新标签打开
          if (/^https?:/i.test(href)) {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            const arrow = document.createElement('span');
            arrow.className = 'mega-external';
            arrow.setAttribute('aria-hidden', 'true');
            arrow.textContent = '↗';
            link.append(arrow);
          }

          col.append(link);
        });

        inner.append(col);
      });
    };

    if (immediate || !panel.classList.contains('is-open')) {
      paint();
      current = key;
      return;
    }

    // 快速交叉淡出 → 换内容 → 淡入
    inner.classList.add('is-swapping');
    window.clearTimeout(swapTimer);
    swapTimer = window.setTimeout(() => {
      paint();
      inner.classList.remove('is-swapping');
      current = key;
    }, 90);
  }

  function open() {
    window.clearTimeout(closeTimer);
    window.clearTimeout(openTimer);
    openTimer = window.setTimeout(() => {
      panel.hidden = false;
      document.body.classList.add('is-mega-open');
      requestAnimationFrame(() => panel.classList.add('is-open'));
    }, 40);
  }

  function close() {
    window.clearTimeout(openTimer);
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      panel.classList.remove('is-open');
      document.body.classList.remove('is-mega-open');
      window.setTimeout(() => {
        if (!panel.classList.contains('is-open')) panel.hidden = true;
      }, 220);
    }, 140);
  }

  navLinks.addEventListener('mouseover', (event) => {
    const link = event.target.closest('a');
    const key = triggerFor(link);

    if (key) {
      open();
      if (key !== current) render(key);
      return;
    }

    // 空白处 / Contact / 账号区：保持当前内容，不关闭
    if (panel.classList.contains('is-open')) window.clearTimeout(closeTimer);
  });

  // 只有离开「导航栏 + 面板」才关闭
  const leave = () => close();
  navLinks.addEventListener('mouseleave', (event) => {
    const to = event.relatedTarget;
    if (to && panel.contains(to)) return;
    leave();
  });
  panel.addEventListener('mouseenter', () => window.clearTimeout(closeTimer));
  panel.addEventListener('mouseleave', (event) => {
    const to = event.relatedTarget;
    if (to && navLinks.contains(to)) return;
    leave();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  window.addEventListener('scroll', () => {
    if (!panel.hidden && window.scrollY > 40) close();
  }, { passive: true });
})();
