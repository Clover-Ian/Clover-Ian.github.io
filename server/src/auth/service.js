import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { badRequest, conflict, unauthorized } from '../lib/errors.js';
import { hashPassword, verifyAgainstDummyHash, verifyPassword } from './passwords.js';

const SESSION_TOKEN_BYTES = 32;
const SESSION_RANDOM_BYTES_MAX = 200;

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name ?? null,
    emailVerified: Boolean(row.email_verified),
    createdAt: row.created_at,
  };
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function truncate(value, maxLength) {
  if (typeof value !== 'string' || value.length === 0) return null;
  return value.slice(0, maxLength);
}

export function findUserByEmail(db, email) {
  const row = db
    .prepare('SELECT id, email, display_name, email_verified, created_at, updated_at FROM users WHERE email = ?')
    .get(email);
  return mapUser(row);
}

/**
 * 创建用户。邮箱必须已经过 normalizeEmail 处理（小写）。
 * 并发注册同一邮箱时靠数据库 UNIQUE 约束兜底，不会产生两条记录。
 */
export async function createUser(db, { email, password, displayName }) {
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  const id = randomUUID();

  try {
    db.prepare(
      `INSERT INTO users
        (id, email, password_hash, display_name, email_verified, created_at, updated_at, password_changed_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
    ).run(id, email, passwordHash, displayName, now, now, now);
  } catch (error) {
    const message = String(error?.message ?? '');
    if (message.includes('UNIQUE') || String(error?.code).includes('CONSTRAINT')) {
      throw conflict('An account with this email already exists.', 'email_taken');
    }
    throw error;
  }

  return { id, email, displayName, emailVerified: false, createdAt: now };
}

/**
 * 校验邮箱 + 密码。失败时统一返回同一个错误，
 * 不告诉调用方到底是邮箱不存在还是密码错误（防账号枚举）。
 */
export async function authenticateUser(db, { email, password }) {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!row) {
    await verifyAgainstDummyHash(password);
    throw unauthorized('Incorrect email or password.', 'invalid_credentials');
  }

  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) {
    throw unauthorized('Incorrect email or password.', 'invalid_credentials');
  }

  return mapUser(row);
}

/** 创建会话，返回明文 token（只在这一刻出现，数据库里只存它的 SHA-256）。 */
export function createSession(db, userId, { ttlMs, ip, userAgent }) {
  const token = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  db.prepare(
    `INSERT INTO sessions (id, user_id, created_at, expires_at, last_used_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    hashToken(token),
    userId,
    now.toISOString(),
    expiresAt.toISOString(),
    now.toISOString(),
    truncate(ip, 64),
    truncate(userAgent, 255),
  );

  return { token, expiresAt };
}

/** 用 token 找回会话和用户；过期会话会被顺手删掉。 */
export function findSessionUser(db, token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > SESSION_RANDOM_BYTES_MAX) return null;

  const sessionId = hashToken(token);
  const row = db
    .prepare(
      `SELECT s.id AS session_id, s.expires_at AS session_expires_at, s.last_used_at,
              u.id, u.email, u.display_name, u.email_verified, u.created_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.id = ?`,
    )
    .get(sessionId);

  if (!row) return null;

  const now = new Date();
  if (new Date(row.session_expires_at) <= now) {
    deleteSessionById(db, sessionId);
    return null;
  }

  // 活跃时间最多每 5 分钟写一次，减少无意义的写操作
  if (!row.last_used_at || now.getTime() - new Date(row.last_used_at).getTime() > 5 * 60 * 1000) {
    db.prepare('UPDATE sessions SET last_used_at = ? WHERE id = ?').run(now.toISOString(), sessionId);
  }

  return { sessionId, userId: row.id, user: mapUser(row) };
}

export function deleteSessionById(db, sessionId) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function deleteSessionByToken(db, token) {
  if (typeof token !== 'string' || token.length === 0) return;
  deleteSessionById(db, hashToken(token));
}

/** 改密码后踢掉其它设备上的登录，只保留当前设备。 */
export function deleteOtherSessions(db, userId, keepSessionId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(userId, keepSessionId);
}

export function deleteAllSessions(db, userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

/** 修改密码：先验证旧密码，再写入新哈希。 */
export async function changePassword(db, userId, currentPassword, newPassword) {
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
  if (!row) throw unauthorized();

  const ok = await verifyPassword(currentPassword, row.password_hash);
  if (!ok) {
    throw badRequest('Current password is incorrect.', 'invalid_current_password');
  }

  const passwordHash = await hashPassword(newPassword);
  const now = new Date().toISOString();
  db.prepare(
    'UPDATE users SET password_hash = ?, password_changed_at = ?, updated_at = ? WHERE id = ?',
  ).run(passwordHash, now, now, userId);
}

/** 修改显示名称。 */
export function changeDisplayName(db, userId, displayName) {
  const now = new Date().toISOString();
  const result = db
    .prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?')
    .run(displayName, now, userId);
  if (result.changes === 0) throw unauthorized();

  const updatedUser = db
    .prepare('SELECT id, email, display_name, email_verified, created_at FROM users WHERE id = ?')
    .get(userId);
  return mapUser(updatedUser);
}

/** 修改邮箱前验证当前密码；新邮箱变更后需要重新验证邮箱。 */
export async function changeEmail(db, userId, email, currentPassword) {
  const row = db.prepare('SELECT email, password_hash FROM users WHERE id = ?').get(userId);
  if (!row) throw unauthorized();

  const ok = await verifyPassword(currentPassword, row.password_hash);
  if (!ok) {
    throw badRequest('Current password is incorrect.', 'invalid_current_password');
  }

  if (email !== row.email) {
    const now = new Date().toISOString();
    try {
      db.prepare(
        'UPDATE users SET email = ?, email_verified = 0, updated_at = ? WHERE id = ?',
      ).run(email, now, userId);
    } catch (error) {
      const message = String(error?.message ?? '');
      if (message.includes('UNIQUE') || String(error?.code).includes('CONSTRAINT')) {
        throw conflict('An account with this email already exists.', 'email_taken');
      }
      throw error;
    }
  }

  const updatedUser = db
    .prepare('SELECT id, email, display_name, email_verified, created_at FROM users WHERE id = ?')
    .get(userId);
  return mapUser(updatedUser);
}

/** 删除账户前验证当前密码；关联会话由外键级联删除。 */
export async function deleteUser(db, userId, currentPassword) {
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
  if (!row) throw unauthorized();

  const ok = await verifyPassword(currentPassword, row.password_hash);
  if (!ok) {
    throw badRequest('Current password is incorrect.', 'invalid_current_password');
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}
