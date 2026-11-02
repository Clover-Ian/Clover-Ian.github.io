import { Router } from 'express';
import { badRequest, conflict, tooManyRequests } from '../lib/errors.js';
import { normalizeDisplayName, normalizeEmail, normalizeNewPassword, readJsonObject } from '../lib/validate.js';
import { requireAuth } from './middleware.js';
import {
  authenticateUser,
  changeDisplayName as updateDisplayName,
  changeEmail as updateEmail,
  changePassword as updatePassword,
  createSession,
  createUser,
  deleteAllSessions,
  deleteOtherSessions,
  deleteSessionById,
  deleteUser as removeUser,
  findUserByEmail,
} from './service.js';

function setSessionCookie(res, config, token, persistent) {
  const options = {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    path: '/',
  };
  if (persistent) options.maxAge = config.cookie.rememberTtlMs;
  res.cookie(config.cookie.name, token, options);
}

function clearSessionCookie(res, config) {
  res.clearCookie(config.cookie.name, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    path: '/',
  });
}

function readLoginPassword(input, message = 'Password is required.') {
  if (typeof input !== 'string' || input.length === 0) {
    throw badRequest(message, 'invalid_password');
  }
  if (input.length > 128) {
    throw badRequest('Password is too long.', 'invalid_password');
  }
  return input;
}

function withOptionalToken(config, payload, token) {
  return config.exposeTokenInBody ? { ...payload, token } : payload;
}

export function createAuthRouter({ db, config, limiters }) {
  const router = Router();

  // POST /api/auth/register  { email, password, displayName? }
  router.post('/register', async (req, res) => {
    const gate = limiters.register.hit(req.ip ?? 'unknown');
    if (!gate.ok) throw tooManyRequests(gate.retryAfterSeconds);

    const body = readJsonObject(req.body);
    const email = normalizeEmail(body.email);
    const password = normalizeNewPassword(body.password);
    const displayName = normalizeDisplayName(body.displayName);

    if (findUserByEmail(db, email)) {
      throw conflict('An account with this email already exists.', 'email_taken');
    }

    const user = await createUser(db, { email, password, displayName });
    const { token, expiresAt } = createSession(db, user.id, {
      ttlMs: config.cookie.sessionTtlMs,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    setSessionCookie(res, config, token, false);
    res.status(201).json(withOptionalToken(config, { user, expiresAt }, token));
  });

  // POST /api/auth/login  { email, password, rememberMe? }
  router.post('/login', async (req, res) => {
    const ipGate = limiters.loginIp.hit(req.ip ?? 'unknown');
    if (!ipGate.ok) throw tooManyRequests(ipGate.retryAfterSeconds);

    const body = readJsonObject(req.body);
    const email = normalizeEmail(body.email);
    const password = readLoginPassword(body.password);
    const rememberMe = body.rememberMe === true;

    // 只统计失败次数，密码正确就清零。防的是“盯着一个邮箱猛试密码”。
    const emailGate = limiters.loginEmail.check(email);
    if (!emailGate.ok) throw tooManyRequests(emailGate.retryAfterSeconds);

    let user;
    try {
      user = await authenticateUser(db, { email, password });
    } catch (error) {
      if (error?.code === 'invalid_credentials') limiters.loginEmail.hit(email);
      throw error;
    }
    limiters.loginEmail.reset(email);

    const ttlMs = rememberMe ? config.cookie.rememberTtlMs : config.cookie.sessionTtlMs;
    const { token, expiresAt } = createSession(db, user.id, {
      ttlMs,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    setSessionCookie(res, config, token, rememberMe);
    res.json(withOptionalToken(config, { user, expiresAt }, token));
  });

  // GET /api/auth/me  → 当前用户
  router.get('/me', requireAuth, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ user: req.auth.user });
  });

  // POST /api/auth/logout  → 注销当前会话
  router.post('/logout', (req, res) => {
    if (req.auth) deleteSessionById(db, req.auth.sessionId);
    clearSessionCookie(res, config);
    res.status(204).end();
  });

  // POST /api/auth/logout-all  → 注销该账号的所有设备
  router.post('/logout-all', requireAuth, (req, res) => {
    deleteAllSessions(db, req.auth.userId);
    clearSessionCookie(res, config);
    res.status(204).end();
  });

  // POST /api/auth/change-password  { currentPassword, newPassword }
  router.post('/change-password', requireAuth, async (req, res) => {
    const body = readJsonObject(req.body);
    const currentPassword = readLoginPassword(body.currentPassword, 'Current password is required.');
    const newPassword = normalizeNewPassword(body.newPassword, 'newPassword');

    await updatePassword(db, req.auth.userId, currentPassword, newPassword);
    // 其它设备上的登录立即失效，当前设备保持登录
    deleteOtherSessions(db, req.auth.userId, req.auth.sessionId);
    res.status(204).end();
  });

  // POST /api/auth/change-username  { displayName }
  router.post('/change-username', requireAuth, (req, res) => {
    const body = readJsonObject(req.body);
    const displayName = normalizeDisplayName(body.displayName);
    if (!displayName) {
      throw badRequest('Username is required.', 'invalid_display_name');
    }

    const user = updateDisplayName(db, req.auth.userId, displayName);
    res.json({ user });
  });

  // POST /api/auth/change-email  { email, currentPassword }
  router.post('/change-email', requireAuth, async (req, res) => {
    const body = readJsonObject(req.body);
    const email = normalizeEmail(body.email);
    const currentPassword = readLoginPassword(body.currentPassword, 'Current password is required.');

    const user = await updateEmail(db, req.auth.userId, email, currentPassword);
    res.json({ user });
  });

  // POST /api/auth/delete-account  { currentPassword, confirmation }
  router.post('/delete-account', requireAuth, async (req, res) => {
    const body = readJsonObject(req.body);
    if (body.confirmation !== true) {
      throw badRequest('Account deletion must be confirmed.', 'confirmation_required');
    }
    const currentPassword = readLoginPassword(body.currentPassword, 'Current password is required.');

    await removeUser(db, req.auth.userId, currentPassword);
    clearSessionCookie(res, config);
    res.status(204).end();
  });

  return router;
}
