/**
 * 成绩卡：把一条历史成绩画成 1200×630 的图，可下载或复制。
 * 左下角固定水印 clover-ian.github.io。
 */
(() => {
  const SERIF = '"Iowan Old Style", "Palatino", Georgia, serif';
  const SANS = '"American Typewriter", "Chalkboard", Helvetica, sans-serif';
  const WATERMARK = 'clover-ian.github.io';

  function draw(canvas, data) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);

    const glow = (x, y, radius, color) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    };
    glow(0, H, 820, 'rgba(255, 231, 255, 0.9)');
    glow(W, H, 820, 'rgba(220, 241, 255, 0.92)');

    ctx.fillStyle = '#1d1d1f';
    ctx.font = `700 56px ${SERIF}`;
    ctx.textAlign = 'left';
    ctx.fillText('IYS', 68, 112);

    ctx.strokeStyle = 'rgba(29,29,31,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(68, 136);
    ctx.lineTo(W - 68, 136);
    ctx.stroke();

    ctx.fillStyle = 'rgba(29,29,31,0.55)';
    ctx.font = `600 20px ${SANS}`;
    ctx.fillText('IYS ARCADE', 70, 180);

    ctx.fillStyle = '#1d1d1f';
    ctx.font = `700 88px ${SERIF}`;
    ctx.fillText(data.test, 68, 288);

    const score = String(data.score);
    let size = 150;
    ctx.font = `700 ${size}px ${SERIF}`;
    while (ctx.measureText(score).width > W - 140 && size > 56) {
      size -= 6;
      ctx.font = `700 ${size}px ${SERIF}`;
    }
    ctx.fillStyle = '#0b5fd0';
    ctx.fillText(score, 68, 452);

    if (data.name) {
      ctx.fillStyle = 'rgba(29,29,31,0.68)';
      ctx.font = `500 26px ${SANS}`;
      ctx.fillText('by ' + data.name, 70, 512);
    }

    if (data.date) {
      ctx.fillStyle = 'rgba(29,29,31,0.42)';
      ctx.font = `400 22px ${SANS}`;
      ctx.textAlign = 'right';
      ctx.fillText(data.date, W - 68, 512);
      ctx.textAlign = 'left';
    }

    // 水印：左下角
    ctx.fillStyle = 'rgba(29,29,31,0.45)';
    ctx.font = `600 22px ${SANS}`;
    ctx.fillText(WATERMARK, 68, H - 44);
  }

  function open(data) {
    const overlay = document.createElement('div');
    overlay.className = 'card-modal';

    const panel = document.createElement('div');
    panel.className = 'card-modal-panel';

    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    canvas.className = 'card-modal-canvas';
    draw(canvas, data);

    const bar = document.createElement('div');
    bar.className = 'card-modal-bar';

    const download = document.createElement('button');
    download.type = 'button';
    download.className = 'button-link';
    download.textContent = 'Download PNG';
    download.addEventListener('click', () => {
      canvas.toBlob((blob) => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `iys-arcade-${data.test.toLowerCase().replace(/\s+/g, '-')}.png`;
        link.click();
        URL.revokeObjectURL(link.href);
      }, 'image/png');
    });

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'text-link';
    copy.textContent = 'Copy image';
    copy.addEventListener('click', async () => {
      try {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        copy.textContent = 'Copied';
      } catch {
        copy.textContent = 'Use Download instead';
      }
    });

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'text-link';
    close.textContent = 'Close';
    close.addEventListener('click', () => overlay.remove());

    bar.append(download, copy, close);
    panel.append(canvas, bar);
    overlay.append(panel);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) overlay.remove();
    });
    document.body.append(overlay);
  }

  window.IYSCard = { open, draw };
})();
