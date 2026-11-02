import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { createClient, startTestServer, VALID_PASSWORD } from './helpers.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');
const EMAIL = 'ian@example.com';

function register(client, overrides = {}) {
  return client.request('/api/auth/register', {
    method: 'POST',
    body: { email: EMAIL, password: VALID_PASSWORD, displayName: 'Ian', ...overrides },
  });
}

test('注册成功：返回用户信息，并通过 HttpOnly Cookie 建立会话', async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());
  const client = createClient(server.baseUrl);

  const res = await register(client);

  assert.equal(res.status, 201);
  assert.equal(res.data.user.email, EMAIL);
  assert.equal(res.data.user.displayName, 'Ian');
  assert.equal(res.data.user.emailVerified, false);
  assert.ok(res.data.user.id);
  assert.equal(res.data.user.passwordHash, undefined, '响应里不能出现密码哈希');
  assert.equal(res.data.token, undefined, '默认不把 token 返回给前端');

  const setCookie = res.headers.getSetCookie()[0];
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);

  const me = await client.request('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.user.email, EMAIL);
});

test('同一邮箱不能重复注册，且大小写不敏感', async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());
  const client = createClient(server.baseUrl);

  await register(client);
  const res = await register(createClient(server.baseUrl), { email: 'IAN@Example.COM' });

  assert.equal(res.status, 409);
  assert.equal(res.data.error.code, 'email_taken');
});

test('注册参数校验：邮箱格式、密码长度、请求体类型', async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());
  const client = createClient(server.baseUrl);

  const badEmail = await register(client, { email: 'not-an-email' });
  assert.equal(badEmail.status, 400);
  assert.equal(badEmail.data.error.code, 'invalid_email');

  const shortPassword = await register(client, { password: '1234567' });
  assert.equal(shortPassword.status, 400);
  assert.equal(shortPassword.data.error.code, 'invalid_password');

  const noBody = await client.request('/api/auth/register', { method: 'POST' });
  assert.equal(noBody.status, 400);
  assert.equal(noBody.data.error.code, 'invalid_body');
});

test('登录：密码错误与邮箱不存在返回相同错误；正确密码可以登录', async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());
  await register(createClient(server.baseUrl));

  const attacker = createClient(server.baseUrl);
  const wrongPassword = await attacker.request('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: 'wrong-password' },
  });
  const unknownEmail = await attacker.request('/api/auth/login', {
    method: 'POST',
    body: { email: 'nobody@example.com', password: 'wrong-password' },
  });

  assert.equal(wrongPassword.status, 401);
  assert.equal(wrongPassword.data.error.code, 'invalid_credentials');
  assert.deepEqual(wrongPassword.data.error, unknownEmail.data.error, '不能泄露邮箱是否注册过');

  const user = createClient(server.baseUrl);
  const ok = await user.request('/api/auth/login', {
    method: 'POST',
    body: { email: 'IAN@example.com', password: VALID_PASSWORD, rememberMe: true },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.email, EMAIL);
  // rememberMe 会写 Max-Age，浏览器关掉后仍保持登录
  assert.match(ok.headers.getSetCookie()[0], /Max-Age=/i);

  const me = await user.request('/api/auth/me');
  assert.equal(me.status, 200);
});

test('注销后会话立即失效', async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());
  const client = createClient(server.baseUrl);

  await register(client);
  const logout = await client.request('/api/auth/logout', { method: 'POST' });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.getSetCookie()[0], /Expires=Thu, 01 Jan 1970/);

  assert.equal((await client.request('/api/auth/me')).status, 401);
});

test('修改邮箱：需要当前密码、拒绝重复邮箱，并更新当前用户', async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());
  const client = createClient(server.baseUrl);
  await register(client);

  const other = createClient(server.baseUrl);
  await register(other, { email: 'other@example.com' });
  server.db.prepare('UPDATE users SET email_verified = 1 WHERE email = ?').run(EMAIL);

  const wrongPassword = await client.request('/api/auth/change-email', {
    method: 'POST',
    body: { email: 'new@example.com', currentPassword: 'wrong-password' },
  });
  assert.equal(wrongPassword.status, 400);
  assert.equal(wrongPassword.data.error.code, 'invalid_current_password');

  const duplicateEmail = await client.request('/api/auth/change-email', {
    method: 'POST',
    body: { email: 'other@example.com', currentPassword: VALID_PASSWORD },
  });
  assert.equal(duplicateEmail.status, 409);
  assert.equal(duplicateEmail.data.error.code, 'email_taken');

  const unchangedEmail = await client.request('/api/auth/change-email', {
    method: 'POST',
    body: { email: EMAIL, currentPassword: VALID_PASSWORD },
  });
  assert.equal(unchangedEmail.data.user.emailVerified, true);

  const changed = await client.request('/api/auth/change-email', {
    method: 'POST',
    body: { email: 'NEW@Example.COM', currentPassword: VALID_PASSWORD },
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.user.email, 'new@example.com');
  assert.equal(changed.data.user.emailVerified, false);

  const me = await client.request('/api/auth/me');
  assert.equal(me.data.user.email, 'new@example.com');
});

test('未登录不能修改邮箱', async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());
  const res = await createClient(server.baseUrl).request('/api/auth/change-email', {
    method: 'POST',
    body: { email: 'new@example.com', currentPassword: VALID_PASSWORD },
  });
  assert.equal(res.status, 401);
  assert.equal(res.data.error.code, 'not_authenticated');
});

test('修改用户名：规范化名称并更新当前用户', async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());
  const client = createClient(server.baseUrl);
  await register(client);

  const blankName = await client.request('/api/auth/change-username', {
    method: 'POST',
    body: { displayName: '   ' },
  });
  assert.equal(blankName.status, 400);
  assert.equal(blankName.data.error.code, 'invalid_display_name');

  const tooLongName = await client.request('/api/auth/change-username', {
    method: 'POST',
    body: { displayName: 'a'.repeat(51) },
  });
  assert.equal(tooLongName.status, 400);
  assert.equal(tooLongName.data.error.code, 'invalid_display_name');

  const changed = await client.request('/api/auth/change-username', {
    method: 'POST',
    body: { displayName: '  New   Name  ' },
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.user.displayName, 'New Name');

  const me = await client.request('/api/auth/me');
  assert.equal(me.data.user.displayName, 'New Name');
});

test('未登录不能修改用户名', async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());
  const res = await createClient(server.baseUrl).request('/api/auth/change-username', {
    method: 'POST',
    body: { displayName: 'New Name' },
  });
  assert.equal(res.status, 401);
  assert.equal(res.data.error.code, 'not_authenticated');
});

test('删除账户：需要确认和当前密码，并删除所有会话', async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());

  const client = createClient(server.baseUrl);
  const registered = await register(client);
  const userId = registered.data.user.id;

  const otherDevice = createClient(server.baseUrl);
  await otherDevice.request('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: VALID_PASSWORD },
  });

  const unconfirmed = await client.request('/api/auth/delete-account', {
    method: 'POST',
    body: { currentPassword: VALID_PASSWORD, confirmation: false },
  });
  assert.equal(unconfirmed.status, 400);
  assert.equal(unconfirmed.data.error.code, 'confirmation_required');

  const wrongPassword = await client.request('/api/auth/delete-account', {
    method: 'POST',
    body: { currentPassword: 'wrong-password', confirmation: true },
  });
  assert.equal(wrongPassword.status, 400);
  assert.equal(wrongPassword.data.error.code, 'invalid_current_password');
  assert.equal(server.db.prepare('SELECT id FROM users WHERE id = ?').get(userId).id, userId);

  const deleted = await client.request('/api/auth/delete-account', {
    method: 'POST',
    body: { currentPassword: VALID_PASSWORD, confirmation: true },
  });
  assert.equal(deleted.status, 204);
  assert.match(deleted.headers.getSetCookie()[0], /Expires=Thu, 01 Jan 1970/);
  assert.equal(server.db.prepare('SELECT id FROM users WHERE id = ?').get(userId), undefined);
  assert.equal(server.db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?').get(userId).count, 0);
  assert.equal((await client.request('/api/auth/me')).status, 401);
  assert.equal((await otherDevice.request('/api/auth/me')).status, 401);

  const login = await createClient(server.baseUrl).request('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: VALID_PASSWORD },
  });
  assert.equal(login.status, 401);
});

test('未登录不能删除账户', async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());
  const res = await createClient(server.baseUrl).request('/api/auth/delete-account', {
    method: 'POST',
    body: { currentPassword: VALID_PASSWORD, confirmation: true },
  });
  assert.equal(res.status, 401);
  assert.equal(res.data.error.code, 'not_authenticated');
});

test('修改密码：旧密码校验、其它设备被踢下线、新密码生效', async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());

  const phone = createClient(server.baseUrl);
  await register(phone);

  const laptop = createClient(server.baseUrl);
  const login = await laptop.request('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: VALID_PASSWORD },
  });
  assert.equal(login.status, 200);

  const wrongCurrent = await phone.request('/api/auth/change-password', {
    method: 'POST',
    body: { currentPassword: 'not-the-password', newPassword: 'a brand new password' },
  });
  assert.equal(wrongCurrent.status, 400);
  assert.equal(wrongCurrent.data.error.code, 'invalid_current_password');

  const changed = await phone.request('/api/auth/change-password', {
    method: 'POST',
    body: { currentPassword: VALID_PASSWORD, newPassword: 'a brand new password' },
  });
  assert.equal(changed.status, 204);

  // 当前设备保持登录，另一台设备被强制退出
  assert.equal((await phone.request('/api/auth/me')).status, 200);
  assert.equal((await laptop.request('/api/auth/me')).status, 401);

  const oldPassword = await createClient(server.baseUrl).request('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: VALID_PASSWORD },
  });
  assert.equal(oldPassword.status, 401);

  const newPassword = await createClient(server.baseUrl).request('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: 'a brand new password' },
  });
  assert.equal(newPassword.status, 200);
});

test('未登录不能修改密码', async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());
  const res = await createClient(server.baseUrl).request('/api/auth/change-password', {
    method: 'POST',
    body: { currentPassword: 'x', newPassword: 'a brand new password' },
  });
  assert.equal(res.status, 401);
  assert.equal(res.data.error.code, 'not_authenticated');
});

test('跨站写请求被拒绝，同源请求正常', async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());
  await register(createClient(server.baseUrl));

  const evil = await createClient(server.baseUrl).request('/api/auth/login', {
    method: 'POST',
    origin: 'https://evil.example',
    body: { email: EMAIL, password: VALID_PASSWORD },
  });
  assert.equal(evil.status, 403);
  assert.equal(evil.data.error.code, 'origin_not_allowed');

  const sameOrigin = await createClient(server.baseUrl).request('/api/auth/login', {
    method: 'POST',
    origin: server.baseUrl,
    body: { email: EMAIL, password: VALID_PASSWORD },
  });
  assert.equal(sameOrigin.status, 200);
});

test('登录失败次数触发限流并返回 Retry-After', async (t) => {
  const server = await startTestServer({
    rateLimits: { loginIp: { windowMs: 60_000, max: 2 } },
  });
  t.after(() => server.close());
  await register(createClient(server.baseUrl));

  const client = createClient(server.baseUrl);
  const attempt = () =>
    client.request('/api/auth/login', {
      method: 'POST',
      body: { email: EMAIL, password: 'wrong-password' },
    });

  assert.equal((await attempt()).status, 401);
  assert.equal((await attempt()).status, 401);

  const blocked = await attempt();
  assert.equal(blocked.status, 429);
  assert.equal(blocked.data.error.code, 'too_many_requests');
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
});

test('开启 EXPOSE_TOKEN_IN_BODY 后可用 Bearer token 认证', async (t) => {
  const server = await startTestServer({ exposeTokenInBody: true });
  t.after(() => server.close());

  const reg = await register(createClient(server.baseUrl));
  assert.ok(reg.data.token);

  const api = createClient(server.baseUrl);
  const me = await api.request('/api/auth/me', {
    headers: { authorization: `Bearer ${reg.data.token}` },
  });
  assert.equal(me.status, 200);

  const logout = await api.request('/api/auth/logout', {
    method: 'POST',
    headers: { authorization: `Bearer ${reg.data.token}` },
  });
  assert.equal(logout.status, 204);
  assert.equal((await api.request('/api/auth/me', {
    headers: { authorization: `Bearer ${reg.data.token}` },
  })).status, 401);
});

test('过期会话被拒绝并清理', async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());
  const client = createClient(server.baseUrl);
  await register(client);

  server.db
    .prepare('UPDATE sessions SET expires_at = ?')
    .run(new Date(Date.now() - 60_000).toISOString());

  assert.equal((await client.request('/api/auth/me')).status, 401);
  const remaining = server.db.prepare('SELECT COUNT(*) AS count FROM sessions').get();
  assert.equal(remaining.count, 0, '过期会话应被删除');
});

test('畸形 JSON 和表单提交都会被拒绝', async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());

  const malformed = await fetch(`${server.baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"email":',
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, 'invalid_json');

  const form = await fetch(`${server.baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'email=ian%40example.com&password=password123',
  });
  assert.equal(form.status, 400);
  assert.equal((await form.json()).error.code, 'invalid_body');
});

test('未知 API 路径返回 JSON 404', async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());

  const res = await createClient(server.baseUrl).request('/api/does-not-exist');
  assert.equal(res.status, 404);
  assert.equal(res.data.error.code, 'not_found');
});

test('托管静态站点，但后端源码和配置不可访问', async (t) => {
  const server = await startTestServer({ serveStatic: true, publicDir: PROJECT_ROOT });
  t.after(() => server.close());

  const home = await fetch(`${server.baseUrl}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /text\/html/);
  assert.match(await home.text(), /IYS/);

  const css = await fetch(`${server.baseUrl}/style.css`);
  assert.equal(css.status, 200);

  for (const hidden of ['/server/package.json', '/server/.env.example', '/server/src/app.js', '/server/data/iys.db']) {
    const res = await fetch(`${server.baseUrl}${hidden}`);
    assert.equal(res.status, 404, `${hidden} 不应被公开访问`);
  }
});
