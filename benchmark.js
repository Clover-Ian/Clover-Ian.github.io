/**
 * IYS Human Benchmark — 三个小测试的前端逻辑。
 *
 * 全部在浏览器里跑，不联网、不上传：
 *   - 反应测试：5 轮，随机 1.5–4 秒后变绿
 *   - 点击测试：10 秒 / 60 秒，统计次数与 CPS
 *   - 打字测试：从几段长文里随机抽一段，禁复制粘贴，算 WPM 与准确率
 *
 * 成绩不存本地：登录后写进 Supabase 账号的 user_metadata，未登录不记录。
 */
(() => {
  'use strict';

  // ------------------------------------------------------------ 工具

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const fmtMs = (ms) => `${Math.round(ms)} ms`;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  // ------------------------------------------------------------ 云端成绩（Supabase）

  const cloud = { client: null, userId: null, ready: false };
  const cloudBest = {}; // 云端每个测试的最好成绩；点击测试按时长分开：click:10 / click:60

  const LOWER_IS_BETTER = new Set(['reaction']);
  const clickKey = (duration) => `click:${duration}`;

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

  /**
   * 成绩存在用户的 user_metadata 里（Supabase 账号自带的 JSON 字段）。
   * 好处：不需要建表、不需要后台，客户端用 publishable key 就能读写。
   * 坏处：只有最好成绩，没有历史；而且用户自己也能改（不适合当防作弊数据）。
   */
  const META_KEY = 'benchmark';

  function bestsFromUser(user) {
    const meta = user?.user_metadata?.[META_KEY];
    if (!meta || typeof meta !== 'object') return {};
    const clean = {};
    for (const [key, raw] of Object.entries(meta)) {
      const value = Number(raw);
      if (Number.isFinite(value) && value > 0) clean[key] = value;
    }
    return clean;
  }

  /**
   * 取最新的用户资料。
   * getSession() 读的是浏览器里的缓存，另一台设备改过之后就过期了；
   * getUser() 会向服务器要一次，跨设备才能立刻同步。网络失败时退回缓存。
   */
  async function currentUser() {
    try {
      const { data, error } = await cloud.client.auth.getUser();
      if (!error && data?.user) return data.user;
    } catch (error) {
      // 离线或请求失败，退回本地会话
    }
    const { data } = await cloud.client.auth.getSession();
    return data?.session?.user ?? null;
  }

  /** 从账号里读出历史最好成绩 */
  async function loadCloudBests() {
    if (!cloud.ready) return;
    try {
      const user = await currentUser();
      Object.assign(cloudBest, bestsFromUser(user));
    } catch (error) {
      console.warn('[benchmark] 读取账号成绩失败：', error);
    }
  }

  /** 成绩写回账号（只写更好的那个） */
  async function saveScoreToCloud(key, value) {
    const state = $('[data-save-state]');
    if (!cloud.ready) {
      if (state) state.textContent = 'Sign in to save this score.';
      return false;
    }

    const previous = cloudBest[key];
    const better = previous === undefined
      || (LOWER_IS_BETTER.has(key) ? value < previous : value > previous);
    if (!better) {
      if (state) state.textContent = 'Score saved (not a new best).';
      return true;
    }

    if (state) state.textContent = 'Saving…';
    try {
      const user = await currentUser();
      const meta = { ...bestsFromUser(user), [key]: value };
      const { error } = await cloud.client.auth.updateUser({ data: { [META_KEY]: meta } });
      if (error) throw error;
      cloudBest[key] = value;
      if (state) state.textContent = 'Saved to your IYS account.';
      return true;
    } catch (error) {
      console.warn('[benchmark] 保存到账号失败：', error?.message || error);
      if (state) state.textContent = 'Could not save to your account.';
      return false;
    }
  }

  /** 成绩只存在账号里，没有登录就没有成绩 */
  function bestOf(key) {
    return cloudBest[key] ?? null;
  }

  /** 这次是不是比之前更好（反应时间越小越好） */
  function isRecord(key, value) {
    const current = cloudBest[key];
    if (current === undefined || current === null) return true;
    return LOWER_IS_BETTER.has(key) ? value < current : value > current;
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
    leaderboard: $('#view-leaderboard'),
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
    if (activeView === 'typing') typingStopClock();

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
    if (name === 'leaderboard') loadLeaderboard();
    if (name === 'typing') {
      if (typing.startedAt && !typing.finished) typingResumeClock();
      else typingStartNewPassage();
    }
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
    const click10 = bestOf(clickKey(10));
    const click60 = bestOf(clickKey(60));
    const typing = bestOf('typing');

    const label = (element, text) => { if (element) element.textContent = text; };
    if (!cloud.ready) {
      label($('[data-best="reaction"]'), 'Sign in to save scores');
      label($('[data-best="click"]'), 'Sign in to save scores');
      label($('[data-best="typing"]'), 'Sign in to save scores');
      return;
    }
    label($('[data-best="reaction"]'), reaction ? `Best ${fmtMs(reaction)}` : 'Not tested yet');
    const clickParts = [];
    if (click10) clickParts.push(`${Math.round(click10)} (10s)`);
    if (click60) clickParts.push(`${Math.round(click60)} (60s)`);
    label($('[data-best="click"]'), clickParts.length ? `Best ${clickParts.join(' · ')}` : 'Not tested yet');
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
      const record = isRecord('reaction', average);
      if (cloud.ready) {
        saveScoreToCloud('reaction', average);
        saveScoreToBoard('reaction', average);
      }
      reactionTitle.textContent = cloud.ready && record ? 'New personal best' : 'Done';
      reactionCopy.textContent = cloud.ready
        ? `Average ${fmtMs(average)} over ${REACTION_ROUNDS} rounds. Click to try again.`
        : `Average ${fmtMs(average)} over ${REACTION_ROUNDS} rounds. Sign in to keep this score. Click to try again.`;
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
  const clickRestart = $('[data-click-restart]');
  const clickActions = $('[data-click-actions]');

  let click = {
    duration: 10,
    running: false,
    count: 0,
    startedAt: 0,
    finishedAt: 0,
    timer: 0,
  };

  /** 当前时长对应的最好成绩（10 秒和 60 秒分开算） */
  function updateClickBest() {
    const best = bestOf(clickKey(click.duration));
    clickBest.textContent = best ? `${Math.round(best)} clicks` : '—';
  }

  function clickReset() {
    clearInterval(click.timer);
    click.running = false;
    click.count = 0;
    click.startedAt = 0;
    click.finishedAt = 0;
    clickStage.classList.remove('is-running');
    clickCount.textContent = '0';
    clickCopy.textContent = 'Click anywhere in this box to start';
    clickTime.textContent = `${click.duration}s`;
    clickCps.textContent = '—';
    clickActions.hidden = true;
    updateClickBest();
  }

  /** 开始一轮（区域点击和下面的按钮都走这里） */
  function clickStart() {
    click.finishedAt = 0;
    click.running = true;
    click.count = 1;
    click.startedAt = performance.now();
    clickCount.textContent = '1';
    clickCopy.textContent = 'Go!';
    clickCps.textContent = '—';
    clickActions.hidden = true;
    clickStage.classList.add('is-running');
    click.timer = setInterval(clickTick, 100);
  }

  function clickTick() {
    const elapsed = (performance.now() - click.startedAt) / 1000;
    const left = Math.max(0, click.duration - elapsed);
    clickTime.textContent = `${left.toFixed(1)}s`;

    if (left <= 0) clickFinish(elapsed);
  }

  function clickFinish(elapsed) {
    clearInterval(click.timer);
    click.running = false;
    clickStage.classList.remove('is-running');
    const cps = click.count / Math.max(elapsed, 0.001);
    clickCps.textContent = cps.toFixed(2);
    clickTime.textContent = '0.0s';
    click.finishedAt = performance.now();
    const record = isRecord(clickKey(click.duration), click.count);
    if (cloud.ready) {
      saveScoreToCloud(clickKey(click.duration), click.count);
      saveScoreToBoard('click', click.count, { seconds: click.duration });
    }
    const clicks = `${click.count} click${click.count === 1 ? '' : 's'}`;
    clickCopy.textContent = !cloud.ready
      ? `${clicks} in ${click.duration}s. Sign in to keep this score.`
      : record
        ? `New personal best — ${clicks}.`
        : `${clicks} in ${click.duration}s.`;
    clickActions.hidden = false;
    updateClickBest();
    refreshBests();
  }

  clickStage.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    if (click.running) {
      click.count += 1;
      clickCount.textContent = String(click.count);
      return;
    }
    // 一轮结束后，必须点下面的按钮才能重开，避免手还在连点时误触
    if (click.finishedAt) return;
    clickStart();
  });

  clickRestart.addEventListener('click', () => {
    // 回到"点框开始"的状态：手移回框里再点第一下，计时才起跳，不浪费这段移动时间
    clickReset();
    clickStage.focus();
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
    clearInterval(click.timer);
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
    startedAt: 0,   // 第一次按键的时刻
    endedAt: 0,     // 打完整段的时刻
    timer: 0,       // 走秒用的 interval
    finished: false,
    lastPassageIndex: -1,
  };

  /** 已经用了多少秒；结束之后不再走表 */
  function typingElapsed() {
    if (!typing.startedAt) return 0;
    const end = typing.endedAt || performance.now();
    return Math.max(0, (end - typing.startedAt) / 1000);
  }

  /** 第一次按键就开始计时，不等到 input 事件 */
  function typingStartClock() {
    if (typing.startedAt || typing.finished) return;
    typing.startedAt = performance.now();
    typing.timer = setInterval(typingTick, 50); // 50ms 刷新一次，看起来是连续走的
  }

  function typingStopClock() {
    clearInterval(typing.timer);
    typing.timer = 0;
  }

  function typingResumeClock() {
    if (typing.startedAt && !typing.finished && !typing.timer) {
      typing.timer = setInterval(typingTick, 50);
    }
  }

  function typingStartNewPassage() {
    // 避免连续抽到同一段
    let index = Math.floor(Math.random() * PASSAGES.length);
    if (PASSAGES.length > 1 && index === typing.lastPassageIndex) {
      index = (index + 1) % PASSAGES.length;
    }
    typing.lastPassageIndex = index;
    typing.target = PASSAGES[index];
    typingStopClock();
    typing.startedAt = 0;
    typing.endedAt = 0;
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
    const elapsed = typingElapsed();

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

  /** 只刷新数字，不改状态 */
  function typingPaint() {
    const { typed, elapsed, wpm, accuracy } = typingStats();
    typingTime.textContent = `${elapsed.toFixed(1)}s`;
    if (typed.length >= 1) {
      typingWpm.textContent = String(Math.round(wpm));
      typingAccuracy.textContent = `${Math.round(clamp(accuracy, 0, 100))}%`;
    }
    return { typed, elapsed, wpm, accuracy };
  }

  /** 每 50ms 走一次表，跟有没有打字无关 */
  function typingTick() {
    if (!typing.startedAt || typing.finished) return;
    typingPaint();
  }

  function typingUpdate() {
    typingStartClock();
    typingRender();
    const { typed, elapsed, wpm, accuracy } = typingPaint();

    if (!typing.finished && typed.length >= typing.target.length) {
      typing.finished = true;
      typing.endedAt = performance.now();   // 定格在打完整段的那一刻
      typingStopClock();
      typingInput.disabled = true;

      const finalElapsed = typingElapsed();
      const finalWpm = finalElapsed > 0 ? wpm : 0;
      const record = isRecord('typing', Math.round(finalWpm));
      saveScoreToCloud('typing', Math.round(finalWpm));
      saveScoreToBoard('typing', Math.round(finalWpm), { accuracy: Math.round(accuracy) });

      typingTime.textContent = `${finalElapsed.toFixed(1)}s`;
      typingWpm.textContent = String(Math.round(finalWpm));
      typingAccuracy.textContent = `${Math.round(clamp(accuracy, 0, 100))}%`;
      if (cloud.ready && record) typingWpm.textContent = `${Math.round(finalWpm)} ★`;
      refreshBests();
    }
  }

  // 禁用复制粘贴与拖拽
  ['paste', 'copy', 'cut', 'drop', 'dragover'].forEach((type) => {
    typingInput.addEventListener(type, (event) => event.preventDefault());
  });
  typingInput.addEventListener('contextmenu', (event) => event.preventDefault());
  typingInput.addEventListener('input', typingUpdate);

  // keydown / beforeinput 比 input 事件更早触发，计时从这里开始
  typingInput.addEventListener('keydown', (event) => {
    if (event.key && event.key.length === 1) typingStartClock();
  });
  typingInput.addEventListener('beforeinput', (event) => {
    if (String(event.inputType || '').startsWith('insert')) typingStartClock();
  });

  $('[data-typing-restart]').addEventListener('click', () => {
    typingStartNewPassage();
    typingInput.focus();
  });

  // ============================================================ 排行榜

  const lbRows = $('[data-lb-rows]');
  const lbStatus = $('[data-lb-status]');
  const lbDuration = $('[data-lb-duration]');

  const leaderboard = { test: 'reaction', seconds: 10 };

  function formatScore(test, value) {
    if (test === 'reaction') return `${Math.round(value)} ms`;
    if (test === 'typing') return `${Math.round(value)} WPM`;
    return `${Math.round(value)}`;
  }

  /** 把一条成绩写进共享表，供排行榜读取；表不存在时静默跳过 */
  async function saveScoreToBoard(test, value, extra = {}) {
    const client = window.iysSupabase;
    if (!client || !cloud.ready) return;
    try {
      const { data } = await client.auth.getSession();
      const user = data?.session?.user;
      if (!user) return;
      const name = user.user_metadata?.display_name
        || (user.email ? user.email.split('@')[0] : '')
        || 'Player';
      const { error } = await client.from('benchmark_scores').insert({
        user_id: user.id,
        test,
        value,
        detail: { name, ...extra },
      });
      if (error) console.warn('[benchmark] 排行榜写入失败：', error.message);
    } catch (error) {
      console.warn('[benchmark] 排行榜写入失败：', error?.message || error);
    }
  }

  async function loadLeaderboard() {
    const client = window.iysSupabase;
    if (!lbRows || !lbStatus) return;

    lbRows.innerHTML = '';
    lbStatus.hidden = false;
    lbStatus.textContent = 'Loading…';

    if (!client) {
      lbStatus.textContent = 'Leaderboard is not available right now.';
      return;
    }

    let query = client
      .from('benchmark_scores')
      .select('user_id, test, value, detail')
      .limit(10)
      .order('value', { ascending: leaderboard.test === 'reaction' });

    if (leaderboard.test === 'click') {
      query = query.eq('test', 'click').eq('detail->>seconds', String(leaderboard.seconds));
    } else {
      query = query.eq('test', leaderboard.test);
    }

    const { data, error } = await query;

    if (error) {
      console.warn('[benchmark] 排行榜读取失败：', error.message);
      lbStatus.textContent = error.code === 'PGRST205'
        ? 'Leaderboard is not set up yet.'
        : 'Could not load the leaderboard.';
      return;
    }

    if (!data || data.length === 0) {
      lbStatus.textContent = 'No scores yet — be the first.';
      return;
    }

    lbStatus.hidden = true;
    const me = cloud.userId;

    data.forEach((row, index) => {
      const item = document.createElement('li');
      item.className = 'hb-board-row';
      if (me && row.user_id === me) item.classList.add('is-me');

      const rank = document.createElement('span');
      rank.className = 'hb-board-rank';
      rank.textContent = String(index + 1);

      const name = document.createElement('span');
      name.className = 'hb-board-name';
      name.textContent = row.detail?.name || 'Player';

      const score = document.createElement('span');
      score.className = 'hb-board-score';
      score.textContent = formatScore(row.test, Number(row.value));

      item.append(rank, name, score);
      lbRows.appendChild(item);
    });
  }

  $$('[data-lb-test]').forEach((tab) => {
    tab.addEventListener('click', () => {
      leaderboard.test = tab.dataset.lbTest;
      $$('[data-lb-test]').forEach((other) => {
        const selected = other === tab;
        other.classList.toggle('is-selected', selected);
        other.setAttribute('aria-selected', String(selected));
      });
      if (lbDuration) lbDuration.hidden = leaderboard.test !== 'click';
      loadLeaderboard();
    });
  });

  $$('[data-lb-seconds]').forEach((chip) => {
    chip.addEventListener('click', () => {
      leaderboard.seconds = Number(chip.dataset.lbSeconds);
      $$('[data-lb-seconds]').forEach((other) => other.classList.toggle('is-selected', other === chip));
      loadLeaderboard();
    });
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
      updateClickBest();
      updateAccountNote();
    })
    .catch((error) => console.warn('[benchmark] 初始化账号失败', error));

  window.addEventListener('hashchange', () => {
    const name = hashView();
    if (name && name !== activeView) showView(name);
  });
})();
