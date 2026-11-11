'use strict';

const { get, run, all } = require('../db');
const { writeAudit } = require('../audit');
const {
  hashPassword, verifyPassword, equaliseTiming, createSession, deleteSession,
  deleteSessionsForUser, loginRateStatus, registerLoginFailure, clearLoginFailures,
  makeCookie, requireUser
} = require('../auth');
const { buildScope, scopePayload, activeTerm } = require('../permissions');
const validate = require('../validate');
const { HttpError } = validate;

const GENERIC_LOGIN_ERROR = 'Email or password is incorrect.';

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    must_change_password: Number(row.must_change_password) === 1,
    last_login_at: row.last_login_at,
    created_at: row.created_at
  };
}

async function login(ctx) {
  const email = validate.email(ctx.body?.email);
  const password = validate.str(ctx.body?.password, 'Password', { min: 1, max: 200, trim: false });

  const rate = await loginRateStatus(email, ctx.ip);
  if (rate.limited) {
    throw validate.tooMany('Too many failed attempts. Try again in a few minutes.', rate.retryAfter, 'LOGIN_RATE_LIMITED');
  }

  const row = await get('SELECT * FROM users WHERE email = ? COLLATE NOCASE', [email]);
  if (!row || Number(row.active) !== 1) {
    await equaliseTiming(password);
    await registerLoginFailure(email, ctx.ip);
    throw new HttpError(401, 'INVALID_CREDENTIALS', GENERIC_LOGIN_ERROR);
  }
  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) {
    await registerLoginFailure(email, ctx.ip);
    throw new HttpError(401, 'INVALID_CREDENTIALS', GENERIC_LOGIN_ERROR);
  }

  await clearLoginFailures(email, ctx.ip);
  // Expired sessions are removed opportunistically.
  await run('DELETE FROM sessions WHERE expires_at <= ?', [new Date().toISOString()]);
  const session = await createSession(row.id, ctx.req);
  const now = new Date().toISOString();
  await run('UPDATE users SET last_login_at = ? WHERE id = ?', [now, row.id]);
  ctx.res.setHeader('Set-Cookie', session.cookie);
  await writeAudit({
    userId: row.id,
    action: 'auth.login',
    entity: 'user',
    entityId: row.id,
    ip: ctx.ip
  }, null);

  return {
    user: publicUser({ ...row, last_login_at: now }),
    redirect: '/dashboard'
  };
}

async function logout(ctx) {
  if (ctx.sessionId) {
    await deleteSession(ctx.sessionId);
    await writeAudit({
      userId: ctx.user?.id || null,
      action: 'auth.logout',
      entity: 'session',
      entityId: ctx.sessionId,
      ip: ctx.ip
    });
  }
  ctx.res.setHeader('Set-Cookie', makeCookie('', 0));
  return { loggedOut: true };
}

async function me(ctx) {
  const user = requireUser(ctx);
  let term = null;
  try {
    const active = await activeTerm();
    term = { id: active.id, name: active.name, starts_on: active.starts_on, ends_on: active.ends_on };
  } catch { /* the HOD still needs to create a term */ }

  let scope;
  try {
    scope = scopePayload(await ctx.getScope());
  } catch {
    scope = { role: user.role, assignments: [], subjects: [], sections: [] };
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      must_change_password: user.must_change_password,
      last_login_at: user.last_login_at
    },
    term,
    scope,
    redirect: '/dashboard'
  };
}

async function changePassword(ctx) {
  const user = requireUser(ctx);
  const current = validate.str(ctx.body?.current_password, 'Current password', { min: 1, max: 200, trim: false });
  const next = validate.password(ctx.body?.new_password);

  const row = await get('SELECT * FROM users WHERE id = ?', [user.id]);
  if (!row || Number(row.active) !== 1) throw new HttpError(401, 'UNAUTHORIZED', 'Your account is no longer active.');
  const valid = await verifyPassword(current, row.password_hash);
  if (!valid) {
    throw new HttpError(400, 'VALIDATION', 'The current password is incorrect.', { current_password: 'The current password is incorrect.' });
  }
  if (await verifyPassword(next, row.password_hash)) {
    throw new HttpError(400, 'VALIDATION', 'Choose a password you have not used before.', { new_password: 'Choose a different password.' });
  }

  const hash = await hashPassword(next);
  await run('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [hash, user.id]);
  // Keep the current session, end every other one.
  await run('DELETE FROM sessions WHERE user_id = ? AND id <> ?', [user.id, ctx.sessionId || '']);
  await writeAudit({
    userId: user.id,
    action: 'auth.change_password',
    entity: 'user',
    entityId: user.id,
    ip: ctx.ip
  });
  return { changed: true };
}

module.exports = [
  { method: 'POST', path: 'auth/login', handler: login, public: true, allowPasswordChange: true },
  { method: 'POST', path: 'auth/logout', handler: logout, public: true, allowPasswordChange: true },
  { method: 'GET', path: 'auth/me', handler: me, allowPasswordChange: true },
  { method: 'POST', path: 'auth/change-password', handler: changePassword, allowPasswordChange: true }
];
