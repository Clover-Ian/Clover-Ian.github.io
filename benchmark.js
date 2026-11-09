/**
 * IYS Human Benchmark — 三个小测试的前端逻辑。
 *
 * 全部在浏览器里跑，不联网、不上传：
 *   - 反应测试：5 轮，随机 1.5–4 秒后变绿
 *   - 点击测试：10 秒 / 60 秒，统计次数与 CPS
 *   - 打字测试：从几段长文里随机抽一段，禁复制粘贴，算 WPM 与准确率
 *
 * 成绩只存 localStorage（键名前缀 iys.hb.）。
 */
(() => {
  'use strict';

  // ------------------------------------------------------------ 工具

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const STORAGE = {
    reaction: 'iys.hb.reaction.best',
    click: 'iys.hb.click.best',
    typing: 'iys.hb.typing.best',
  };

  function readBest(key) {
    const raw = Number(localStorage.getItem(key));
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }

  function writeBest(key, value) {
    const current = readBest(key);
    // 反应时间越低越好，其他两个越高越好
    const better = current === null || (key === STORAGE.reaction ? value < current : value > current);
    if (better) localStorage.setItem(key, String(value));
    return better;
  }

  const fmtMs = (ms) => `${Math.round(ms)} ms`;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  // ------------------------------------------------------------ 云端成绩（Supabase）

  const cloud = { client: null, userId: null, ready: false };
  const cloudBest = {}; // 云端每个测试的最好成绩

  async function initCloud() {
    const client = window.iysSupabase;
    if (!client) return;
    try {
      const { data } = await client.auth.getSession();
      const user = data?.session?.user;
      if (!user) return;
      cloud.client = client;
      cloud.userId = user.id;
      cloud.ready = true;
    } catch (error) {
      console.warn('[benchmark] 读取会话失败', error);
    }
  }

  /** 拉云端历史，算出每个测试的最好成绩 */
  async function loadCloudBests() {
    if (!cloud.ready) return;
    const { data, error } = await cloud.client.from('benchmark_scores').select('test, value');
    if (error) {
      console.warn('[benchmark] 读取云端成绩失败：', error.message);
      return;
    }
    for (const row of data ?? []) {
      const value = Number(row.value);
      if (!Number.isFinite(value)) continue;
      const current = cloudBest[row.test];
      if (current === undefined) cloudBest[row.test] = value;
      else cloudBest[row.test] = row.test === 'reaction'
        ? Math.min(current, value)
        : Math.max(current, value);
    }
  }

  /** 存一条成绩到云端（只有登录后才有意义） */
  async function saveScoreToCloud(test, value, detail) {
    const state = $('[data-save-state]');
    if (!cloud.ready) {
      if (state) state.textContent = 'Saved on this device — sign in to keep it.';
      return false;
    }
    if (state) state.textContent = 'Saving…';
    const { error } = await cloud.client.from('benchmark_scores').insert({
      user_id: cloud.userId,
      test,
      value,
      detail: detail ?? null,
    });
    if (error) {
      console.warn('[benchmark] 保存到云端失败：', error.message);
      if (state) state.textContent = 'Could not save to your account.';
      return false;
    }
    if (state) state.textContent = 'Saved to your IYS account.';
    return true;
  }

  /** 本地和云端取更好的那个 */
  function bestOf(test) {
    const local = readBest(STORAGE[test]);
    const remote = cloudBest[test];
    if (local === null) return remote ?? null;
    if (remote === undefined || remote === null) return local;
    return test === 'reaction' ? Math.min(local, remote) : Math.max(local, remote);
  }

  function updateAccountNote() {
    const note = $('[data-account-note]');
    if (!note) return;
    if (cloud.ready) {
      note.textContent = 'Signed in — every new score is saved to your IYS account.';
    } else {
      note.innerHTML = '<a href="IYS Account Sign In.html">Sign in</a> to keep your scores in your IYS account.';
    }
  }

  // ------------------------------------------------------------ 视图切换

  const views = {
    home: $('#view-home'),
    reaction: $('#view-reaction'),
    click: $('#view-click'),
    typing: $('#view-typing'),
  };

  let activeView = 'home';

  function hashView() {
    const name = (window.location.hash || '').replace('#', '');
    return views[name] ? name : null;
  }

  function showView(name) {
    if (!views[name]) return;
    if (activeView === 'reaction') reactionTeardown();
    if (activeView === 'click') clickTeardown();

    Object.entries(views).forEach(([key, node]) => {
      node.classList.toggle('is-active', key === name);
    });
    activeView = name;
    // 让每个测试都有自己的链接，方便分享和直接打开
    const hash = name === 'home' ? '' : `#${name}`;
    if (window.location.hash !== hash) {
      window.history.replaceState(null, '', hash || window.location.pathname);
    }
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    if (name === 'typing') typingStartNewPassage();
  }

  $$('[data-open]').forEach((button) => {
    button.addEventListener('click', () => showView(button.dataset.open));
  });
  $$('[data-home]').forEach((button) => {
    button.addEventListener('click', () => showView('home'));
  });

  // 首页卡片上显示历史最好成绩
  function refreshBests() {
    const reaction = bestOf('reaction');
    const click = bestOf('click');
    const typing = bestOf('typing');

    const label = (element, text) => { if (element) element.textContent = text; };
    label($('[data-best="reaction"]'), reaction ? `Best ${fmtMs(reaction)}` : 'Not tested yet');
    label($('[data-best="click"]'), click ? `Best ${click} clicks` : 'Not tested yet');
    label($('[data-best="typing"]'), typing ? `Best ${Math.round(typing)} WPM` : 'Not tested yet');
  }

  // ============================================================ 反应测试

  const REACTION_ROUNDS = 5;
  const reactionStage = $('[data-reaction-stage]');
  const reactionTitle = $('[data-reaction-title]');
  const reactionCopy = $('[data-reaction-copy]');
  const reactionRoundLabel = $('[data-reaction-round]');
  const reactionLast = $('[data-reaction-last]');
  const reactionAverage = $('[data-reaction-average]');
  const reactionBest = $('[data-reaction-best]');
  const reactionRoundsList = $('[data-reaction-rounds]');

  let reaction = {
    state: 'idle',      // idle | waiting | ready | early | done
    timer: null,
    readyAt: 0,
    results: [],
  };

  function reactionSetStage(mode) {
    reactionStage.classList.remove('is-waiting', 'is-ready', 'is-early');
    if (mode === 'waiting') reactionStage.classList.add('is-waiting');
    if (mode === 'ready') reactionStage.classList.add('is-ready');
    if (mode === 'early') reactionStage.classList.add('is-early');
  }

  function reactionReset() {
    clearTimeout(reaction.timer);
    reaction = { state: 'idle', timer: null, readyAt: 0, results: [] };
    reactionSetStage('idle');
    reactionTitle.textContent = 'Click to start';
    reactionCopy.textContent = 'Five rounds. Wait for green, then click as fast as you can.';
    reactionRoundLabel.textContent = '1';
    reactionLast.textContent = '—';
    reactionAverage.textContent = '—';
    reactionBest.textContent = '—';
    reactionRoundsList.innerHTML = '';
  }

  function reactionRoundStart() {
    const index = reaction.results.length;
    reactionRoundLabel.textContent = String(index + 1);
    reactionTitle.textContent = 'Wait for green…';
    reactionCopy.textContent = 'Clicking too early will restart the round.';
    reactionSetStage('waiting');
    reaction.state = 'waiting';

    const delay = 1500 + Math.random() * 2500; // 1.5–4 秒
    reaction.timer = setTimeout(() => {
      reaction.state = 'ready';
      reaction.readyAt = performance.now();
      reactionSetStage('ready');
      reactionTitle.textContent = 'Click!';
      reactionCopy.textContent = '';
    }, delay);
  }

  function reactionRegister(ms) {
    reaction.results.push(ms);
    const item = document.createElement('li');
    item.textContent = fmtMs(ms);
    reactionRoundsList.appendChild(item);

    reactionLast.textContent = fmtMs(ms);
    const sum = reaction.results.reduce((total, value) => total + value, 0);
    reactionAverage.textContent = fmtMs(sum / reaction.results.length);
    reactionBest.textContent = fmtMs(Math.min(...reaction.results));

    if (reaction.results.length >= REACTION_ROUNDS) {
      reaction.state = 'done';
      reactionSetStage('idle');
      const average = sum / reaction.results.length;
      const isRecord = writeBest(STORAGE.reaction, average);
      saveScoreToCloud('reaction', average, { rounds: reaction.results });
      reactionTitle.textContent = isRecord ? 'New personal best' : 'Done';
      reactionCopy.textContent = `Average ${fmtMs(average)} over ${REACTION_ROUNDS} rounds. Click to try again.`;
      reactionRoundLabel.textContent = String(REACTION_ROUNDS);
      refreshBests();
      return;
    }

    reaction.state = 'idle';
    reactionSetStage('idle');
    reactionTitle.textContent = 'Get ready…';
    reactionCopy.textContent = '';
    reaction.timer = setTimeout(() => {
      if (activeView !== 'reaction') return;
      reactionRoundStart();
    }, 700);
  }

  reactionStage.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    if (reaction.state === 'done') {
      reactionReset();
      reactionRoundStart();
      return;
    }
    if (reaction.state === 'idle') {
      reactionRoundStart();
      return;
    }
    if (reaction.state === 'waiting') {
      clearTimeout(reaction.timer);
      reaction.state = 'early';
      reactionSetStage('early');
      reactionTitle.textContent = 'Too soon';
      reactionCopy.textContent = 'Wait for the screen to turn green. Restarting the round…';
      reaction.timer = setTimeout(() => {
        if (activeView !== 'reaction') return;
        reactionRoundStart();
      }, 1100);
      return;
    }
    if (reaction.state === 'ready') {
      const elapsed = performance.now() - reaction.readyAt;
      reaction.state = 'idle';
      reactionSetStage('idle');
      reactionRegister(elapsed);
    }
  });

  // 键盘也能玩：空格 / 回车
  reactionStage.addEventListener('keydown', (event) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    reactionStage.dispatchEvent(new PointerEvent('pointerdown', { bubbles: false }));
  });

  function reactionTeardown() {
    clearTimeout(reaction.timer);
    reaction.state = 'idle';
    reactionSetStage('idle');
  }

  // ============================================================ 点击测试

  const clickStage = $('[data-click-stage]');
  const clickCount = $('[data-click-count]');
  const clickCopy = $('[data-click-copy]');
  const clickTime = $('[data-click-time]');
  const clickCps = $('[data-click-cps]');
  const clickBest = $('[data-click-best]');

  let click = {
    duration: 10,
    running: false,
    count: 0,
    startedAt: 0,
    frame: 0,
  };

  function clickReset() {
    cancelAnimationFrame(click.frame);
    click.running = false;
    click.count = 0;
    click.startedAt = 0;
    clickStage.classList.remove('is-running');
    clickCount.textContent = '0';
    clickCopy.textContent = 'Click anywhere in this box to start';
    clickTime.textContent = `${click.duration}s`;
    clickCps.textContent = '—';
    const best = readBest(STORAGE.click);
    clickBest.textContent = best ? `${best} clicks` : '—';
  }

  function clickTick() {
    const elapsed = (performance.now() - click.startedAt) / 1000;
    const left = Math.max(0, click.duration - elapsed);
    clickTime.textContent = `${left.toFixed(1)}s`;

    if (left <= 0) {
      clickFinish(elapsed);
      return;
    }
    click.frame = requestAnimationFrame(clickTick);
  }

  function clickFinish(elapsed) {
    click.running = false;
    clickStage.classList.remove('is-running');
    const cps = click.count / Math.max(elapsed, 0.001);
    clickCps.textContent = cps.toFixed(2);
    clickTime.textContent = '0.0s';
    const isRecord = writeBest(STORAGE.click, click.count);
    saveScoreToCloud('click', click.count, { seconds: click.duration });
    clickCopy.textContent = isRecord
      ? `New personal best — ${click.count} clicks. Click to go again.`
      : `${click.count} clicks in ${click.duration}s. Click to go again.`;
    clickBest.textContent = `${readBest(STORAGE.click)} clicks`;
    refreshBests();
  }

  clickStage.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    if (!click.running) {
      if (click.count > 0 && clickTime.textContent === '0.0s') return; // 刚结束，避免误触
      click.running = true;
      click.count = 1;
      click.startedAt = performance.now();
      clickCount.textContent = '1';
      clickCopy.textContent = 'Go!';
      clickCps.textContent = '—';
      clickStage.classList.add('is-running');
      click.frame = requestAnimationFrame(clickTick);
      return;
    }
    click.count += 1;
    clickCount.textContent = String(click.count);
  });

  $$('[data-duration]').forEach((chip) => {
    chip.addEventListener('click', () => {
      if (click.running) return;
      $$('[data-duration]').forEach((other) => other.classList.toggle('is-selected', other === chip));
      click.duration = Number(chip.dataset.duration);
      clickReset();
    });
  });

  function clickTeardown() {
    cancelAnimationFrame(click.frame);
    click.running = false;
    clickReset();
  }

  // ============================================================ 打字测试

  // 每次随机抽一段；长度都在 400 字符以上，够长
  const PASSAGES = [
    `Typing quickly is less about moving your fingers and more about trusting them. When you stop watching every key and let your hands repeat what they already know, the words begin to arrive in a steadier rhythm. The trick is to keep your eyes on the sentence ahead of the one you are writing, the way a driver looks down the road instead of at the bonnet. Accuracy first, speed second, because a fast mistake always costs more time than a slow correct letter.`,

    `Most of the work happens before anything is written down. You sit with a problem long enough that the noise around it begins to settle, and what is left is usually a single question worth answering. Tools cannot shorten that part. They can only make the answering faster once you know what you are asking. So the useful habit is not to collect more equipment, but to stay with one thing a little longer than feels comfortable, and to notice when your attention quietly leaves the room.`,

    `Early morning is the only hour when a city belongs to the people who walk it. Shutters are still down, the roads are wide and empty, and every sound carries farther than it will later in the day. Bakeries switch on their lights one by one, and the smell of bread drifts across the pavement in slow waves. Nobody is in a hurry yet, and for a few minutes the streets feel less like infrastructure and more like a place someone built on purpose.`,

    `The first version of anything should be small enough to explain in one breath. If you cannot describe what it does without listing its features, it is probably doing too much, and the parts will start to argue with each other. Build the plainest thing that works, use it for a week, and notice where you hesitate. The hesitation is the real specification, and it is almost never where you expected it to be before you started.`,

    `Light does most of the work in a photograph, and it is rarely the light you planned for. A room at four in the afternoon, with the sun low and the curtains half closed, will show you textures that no amount of bright, even illumination can produce. The same is true of a face. What makes it readable is not the amount of light but the direction it comes from, and the small shadows it leaves behind the eyes.`,
  ];

  const passageNode = $('[data-typing-passage]');
  const typingInput = $('[data-typing-input]');
  const typingTime = $('[data-typing-time]');
  const typingWpm = $('[data-typing-wpm]');
  const typingAccuracy = $('[data-typing-accuracy]');

  let typing = {
    target: '',
    chars: [],
    startedAt: 0,
    finished: false,
    lastPassageIndex: -1,
  };

  function typingStartNewPassage() {
    // 避免连续抽到同一段
    let index = Math.floor(Math.random() * PASSAGES.length);
    if (PASSAGES.length > 1 && index === typing.lastPassageIndex) {
      index = (index + 1) % PASSAGES.length;
    }
    typing.lastPassageIndex = index;
    typing.target = PASSAGES[index];
    typing.startedAt = 0;
    typing.finished = false;

    passageNode.innerHTML = '';
    typing.chars = Array.from(typing.target).map((character) => {
      const span = document.createElement('span');
      span.className = 'hb-char';
      span.textContent = character;
      passageNode.appendChild(span);
      return span;
    });

    typingInput.value = '';
    typingInput.disabled = false;
    typingTime.textContent = '0.0s';
    typingWpm.textContent = '—';
    typingAccuracy.textContent = '—';
  }

  function typingStats() {
    const typed = typingInput.value;
    const elapsed = typing.startedAt ? (performance.now() - typing.startedAt) / 1000 : 0;

    let correct = 0;
    for (let i = 0; i < typed.length; i += 1) {
      if (typed[i] === typing.target[i]) correct += 1;
      else break; // 一旦错位，后面不再计入正确
    }

    const minutes = elapsed / 60;
    const wpm = minutes > 0 ? (correct / 5) / minutes : 0;
    const accuracy = typed.length ? (correct / typed.length) * 100 : 0;

    return { typed, elapsed, correct, wpm, accuracy };
  }

  function typingRender() {
    const typed = typingInput.value;
    for (let i = 0; i < typing.chars.length; i += 1) {
      const span = typing.chars[i];
      span.classList.remove('is-correct', 'is-wrong', 'is-current');

      if (i < typed.length) {
        span.classList.add(typed[i] === typing.target[i] ? 'is-correct' : 'is-wrong');
      } else if (i === typed.length) {
        span.classList.add('is-current');
      }
    }
  }

  function typingUpdate() {
    if (!typing.startedAt && typingInput.value.length > 0) {
      typing.startedAt = performance.now();
    }
    typingRender();

    const { typed, elapsed, wpm, accuracy } = typingStats();
    typingTime.textContent = `${elapsed.toFixed(1)}s`;
    if (typed.length >= 3) {
      typingWpm.textContent = String(Math.round(wpm));
      typingAccuracy.textContent = `${Math.round(clamp(accuracy, 0, 100))}%`;
    }

    if (!typing.finished && typed.length >= typing.target.length) {
      typing.finished = true;
      typingInput.disabled = true;
      const isRecord = writeBest(STORAGE.typing, wpm);
      saveScoreToCloud('typing', Math.round(wpm), {
        seconds: Math.round(elapsed * 10) / 10,
        accuracy: Math.round(accuracy),
      });
      typingWpm.textContent = String(Math.round(wpm));
      typingAccuracy.textContent = `${Math.round(clamp(accuracy, 0, 100))}%`;
      typingTime.textContent = `${elapsed.toFixed(1)}s`;
      if (isRecord) typingWpm.textContent = `${Math.round(wpm)} ★`;
      refreshBests();
    }
  }

  // 禁用复制粘贴与拖拽
  ['paste', 'copy', 'cut', 'drop', 'dragover'].forEach((type) => {
    typingInput.addEventListener(type, (event) => event.preventDefault());
  });
  typingInput.addEventListener('contextmenu', (event) => event.preventDefault());
  typingInput.addEventListener('input', typingUpdate);

  $('[data-typing-restart]').addEventListener('click', () => {
    typingStartNewPassage();
    typingInput.focus();
  });

  // ============================================================ 启动

  reactionStage.setAttribute('tabindex', '0');
  reactionStage.setAttribute('role', 'button');
  reactionReset();
  clickReset();
  refreshBests();
  typingStartNewPassage();
  showView(hashView() || 'home');

  initCloud()
    .then(async () => {
      if (cloud.ready) await loadCloudBests();
      refreshBests();
      updateAccountNote();
    })
    .catch((error) => console.warn('[benchmark] 初始化账号失败', error));

  window.addEventListener('hashchange', () => {
    const name = hashView();
    if (name && name !== activeView) showView(name);
  });
})();
