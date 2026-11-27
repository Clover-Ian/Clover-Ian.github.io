/**
 * Photo → URL：压缩后上传到 Supabase Storage 的 photos 桶，
 * 按选择的天数记录过期时间，到点由数据库定时任务删除。
 */
(() => {
  const drop = document.getElementById('photo-drop');
  const input = document.getElementById('photo-input');
  const expiry = document.getElementById('photo-expiry');
  const customWrap = document.getElementById('photo-custom-wrap');
  const customDays = document.getElementById('photo-custom-days');
  const maxWidth = document.getElementById('photo-max');
  const run = document.getElementById('photo-run');
  const status = document.getElementById('photo-status');
  const result = document.getElementById('photo-result');
  const preview = document.getElementById('photo-preview');
  const linkField = document.getElementById('photo-link');
  const copy = document.getElementById('photo-copy');
  const expiresText = document.getElementById('photo-expires');

  let file = null;

  function say(message, error = false) {
    status.textContent = message;
    status.style.color = error ? '#ff8a80' : '';
  }

  function syncExpiry() {
    customWrap.hidden = expiry.value !== 'custom';
  }

  expiry.addEventListener('change', syncExpiry);
  syncExpiry();

  function pickImage(chosen) {
    if (!chosen || !chosen.type.startsWith('image/')) {
      say('That is not an image.', true);
      return;
    }
    file = chosen;
    run.disabled = false;
    result.hidden = true;
    say(`${chosen.name} · ${Math.round(chosen.size / 1024)} KB`);
  }

  drop.addEventListener('click', () => input.click());
  input.addEventListener('change', () => pickImage(input.files?.[0]));

  ['dragenter', 'dragover'].forEach((type) => drop.addEventListener(type, (event) => {
    event.preventDefault();
    drop.classList.add('is-over');
  }));

  ['dragleave', 'drop'].forEach((type) => drop.addEventListener(type, (event) => {
    event.preventDefault();
    drop.classList.remove('is-over');
  }));

  drop.addEventListener('drop', (event) => pickImage(event.dataTransfer?.files?.[0]));

  function chosenDays() {
    if (expiry.value === 'forever') return null;
    if (expiry.value === 'custom') {
      const value = Number(customDays.value);
      return Number.isFinite(value) && value > 0 ? Math.min(value, 3650) : null;
    }
    return Number(expiry.value);
  }

  async function shrink(image) {
    const ratio = Math.min(1, Number(maxWidth.value || 1600) / image.width);
    const w = Math.max(1, Math.round(image.width * ratio));
    const h = Math.max(1, Math.round(image.height * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(image, 0, 0, w, h);

    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  }

  run.addEventListener('click', async () => {
    if (!file) return;

    const client = window.iysSupabase;
    if (!client) {
      say('The upload service is not available.', true);
      return;
    }

    run.disabled = true;
    say('Preparing…');

    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });

      const blob = await shrink(image);
      if (!blob) throw new Error('Could not process that image.');

      const name = `${crypto.randomUUID()}.jpg`;
      const path = `public/${name}`;

      say('Uploading…');
      const { error: uploadError } = await client.storage.from('photos').upload(path, blob, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
      });
      if (uploadError) throw uploadError;

      const days = chosenDays();
      const expiresAt = days ? new Date(Date.now() + days * 86400000).toISOString() : null;

      await client.from('photo_links').insert({ path, expires_at: expiresAt });

      const { data } = client.storage.from('photos').getPublicUrl(path);

      linkField.value = data.publicUrl;
      preview.src = data.publicUrl;
      result.hidden = false;

      expiresText.textContent = days
        ? `Expires ${new Date(expiresAt).toLocaleString()} — the file is deleted after that.`
        : 'No expiry — this link stays until you delete it.';

      say('Uploaded.');
    } catch (error) {
      say(error.message || 'Upload failed.', true);
    } finally {
      run.disabled = false;
    }
  });

  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(linkField.value);
      copy.textContent = 'Copied';
      setTimeout(() => { copy.textContent = 'Copy'; }, 1500);
    } catch {
      linkField.select();
    }
  });
})();
