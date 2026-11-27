/**
 * 导航栏账号菜单。会话由 Supabase Auth 管理。
 * 支持：显示当前用户、改用户名、改邮箱、改密码、退出登录。
 */
(() => {
  function displayNameOf(user) {
    const name = user?.user_metadata?.display_name;
    if (typeof name === 'string' && name.trim()) return name.trim();
    return user?.email || 'Account';
  }

  const AVATAR_COLORS = ['#6554d9', '#0a84ff', '#2fa36b', '#e0453f', '#c2410c', '#0891b2', '#7c3aed', '#be185d'];

  function avatarUrlOf(user) {
    const url = user?.user_metadata?.avatar_url;
    return typeof url === 'string' && url ? url : null;
  }

  function initialOf(name) {
    const text = String(name || '').trim();
    return text ? text.slice(0, 1).toUpperCase() : '?';
  }

  function avatarColorOf(name) {
    const text = String(name || '');
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 100003;
    return AVATAR_COLORS[hash % AVATAR_COLORS.length];
  }

  function buildAvatar(user, size) {
    const el = document.createElement('span');
    el.className = 'avatar';
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;

    const url = avatarUrlOf(user);
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      el.append(img);
    } else {
      const name = displayNameOf(user);
      el.textContent = initialOf(name);
      el.style.backgroundColor = avatarColorOf(name);
      el.style.fontSize = `${Math.round(size * 0.42)}px`;
    }
    return el;
  }

  const signInLink = document.querySelector('.account-nav-link[href="IYS Account Sign In.html"]');
  const signUpLink = document.querySelector('.account-nav-link[href="IYS Account Sign Up.html"]');
  if (!signInLink || !signUpLink) return;

  // 登录/注册后回到当前页
  (() => {
    const here = location.pathname.split('/').pop() + location.search;
    if (/IYS Account (Sign In|Sign Up|Reset Password)\.html$/.test(decodeURIComponent(location.pathname))) return;
    if (!here) return;
    const suffix = `?next=${encodeURIComponent(here)}`;
    signInLink.href = `IYS Account Sign In.html${suffix}`;
    signUpLink.href = `IYS Account Sign Up.html${suffix}`;
  })();

  const client = window.iysSupabase;
  if (!client) return;

  async function currentSession() {
    const first = await client.auth.getSession();
    if (first?.data?.session?.user) return first.data.session;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const second = await client.auth.getSession();
    return second?.data?.session ?? null;
  }

  async function kickIfBanned() {
    try {
      const { data, error } = await client.rpc('am_i_banned');
      if (error) return false;
      if (data === true) {
        await client.auth.signOut();
        window.location.reload();
        return true;
      }
    } catch { /* 忽略 */ }
    return false;
  }

  async function refreshInboxBadge(badge, icon) {
    try {
      const { count } = await client
        .from('user_messages')
        .select('id', { count: 'exact', head: true })
        .eq('sender', 'admin')
        .eq('read_by_user', false);
      const unread = count ?? 0;
      badge.hidden = unread === 0;
      badge.textContent = unread > 99 ? '99+' : String(unread);
      icon.setAttribute('aria-label', unread > 0 ? `Inbox, ${unread} unread` : 'Inbox');
    } catch { /* 忽略 */ }
  }

  async function init() {
    const session = await currentSession();
    if (!session?.user) return;

    if (await kickIfBanned()) return;

    const user = session.user;

    // 头像 + 名字的胶囊
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'account-nav-link account-nav-user';
    pill.setAttribute('aria-expanded', 'false');
    pill.setAttribute('aria-label', `Account options for ${displayNameOf(user)}`);

    const label = document.createElement('span');
    label.className = 'account-nav-name';
    label.textContent = displayNameOf(user);
    pill.append(buildAvatar(user, 24), label);

    // 菜单：Settings / Sign out
    const menu = document.createElement('div');
    menu.className = 'account-menu';
    menu.hidden = true;
    menu.setAttribute('aria-label', 'Account options');

    // 顶部：头像 + 名字 + 邮箱
    const menuUser = document.createElement('div');
    menuUser.className = 'account-menu-user';
    const avatarSlot = document.createElement('span');
    const identity = document.createElement('span');
    identity.className = 'account-menu-user-name';
    const strong = document.createElement('strong');
    strong.textContent = displayNameOf(user);
    const mail = document.createElement('span');
    mail.textContent = user.email || '';
    identity.append(strong, mail);
    menuUser.append(avatarSlot, identity);

    try {
      avatarSlot.append(buildAvatar(user, 40));
    } catch { /* 忽略 */ }

    // 收件箱
    const inbox = document.createElement('a');
    inbox.href = 'IYS Inbox.html';
    inbox.className = 'account-menu-inbox';
    inbox.textContent = 'Inbox';

    const settings = document.createElement('a');
    settings.href = 'IYS Account Profile.html';
    settings.className = 'account-menu-profile';
    settings.textContent = 'Settings';

    const signOut = document.createElement('button');
    signOut.type = 'button';
    signOut.textContent = 'Sign out';

    menu.append(inbox, menuUser, settings, signOut);

    const wrap = document.createElement('div');
    wrap.className = 'account-menu-container';
    wrap.append(pill, menu);

    function setOpen(open) {
      menu.hidden = !open;
      pill.setAttribute('aria-expanded', String(open));
    }

    pill.addEventListener('click', (event) => {
      event.stopPropagation();
      setOpen(menu.hidden);
    });

    document.addEventListener('click', (event) => {
      if (!wrap.contains(event.target)) setOpen(false);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setOpen(false);
    });

    inbox.addEventListener('click', () => setOpen(false));
    settings.addEventListener('click', () => setOpen(false));

    signOut.addEventListener('click', async () => {
      setOpen(false);
      await client.auth.signOut().catch(() => {});
      window.location.assign('index.html');
    });

    // Inbox 图标
    const inboxIcon = document.createElement('a');
    inboxIcon.href = 'IYS Inbox.html';
    inboxIcon.className = 'nav-inbox';
    inboxIcon.setAttribute('aria-label', 'Inbox');
    inboxIcon.title = 'Inbox';
    inboxIcon.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
           stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="3"></rect>
        <path d="m4 7 8 6 8-6"></path>
      </svg>`;
    const badge = document.createElement('span');
    badge.className = 'nav-inbox-badge';
    badge.hidden = true;
    inboxIcon.append(badge);

    signInLink.replaceWith(wrap);
    signUpLink.remove();
    wrap.before(inboxIcon);

    refreshInboxBadge(badge, inboxIcon);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refreshInboxBadge(badge, inboxIcon);
    });
  }

  // 登录状态变化时，如果导航还没更新就刷新一次
  try {
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        sessionStorage.removeItem('iys.nav.synced');
        return;
      }
      if (!session?.user) return;

      // 登录/注册/重置页自己会跳转，别在这里刷新（会把跳转冲掉）
      const path = decodeURIComponent(location.pathname);
      if (/IYS Account (Sign In|Sign Up|Reset Password)\.html$/.test(path)) return;

      if (!document.querySelector('.account-nav-link[href^="IYS Account Sign In"]')) return;
      if (sessionStorage.getItem('iys.nav.synced')) return;
      sessionStorage.setItem('iys.nav.synced', '1');
      window.location.reload();
    });
  } catch { /* 忽略 */ }

  init().catch((error) => console.error('Unable to update IYS account navigation.', error));
})();
