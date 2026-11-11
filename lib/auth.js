'use strict';

const crypto = require('crypto');
const { promisify } = require('util');
const { all, get, run, nowIso } = require('./db');
const { unauthorized, forbidden, badRequest, tooMany, HttpError } = require('./validate');

const scryptAsync = promisify(crypto.scrypt);

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SESSION_COOKIE = 'eg_session';
const SESSION_HOURS = 12;

let ephemeralSecret = null;
function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set (32+ characters) in production.');
  }
  if (!ephemeralSecret) {
    ephemeralSecret = crypto.randomBytes(32).toString('hex');
    console.warn('[auth] SESSION_SECRET is missing; using a temporary development secret. Sessions end when the server restarts.');
  }
  return ephemeralSecret;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('hex'), key.toString('hex')].join('$');
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltHex, hashHex] = parts;
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const key = await scryptAsync(password, salt, expected.length, {
      N: Number(n), r: Number(r), p: Number(p)
    });
    return key.length === expected.length && crypto.timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

// A fixed hash used for unknown users so the response time stays comparable.
let dummyHashPromise = null;
function dummyHash() {
  if (!dummyHashPromise) dummyHashPromise = hashPassword('eduguard-dummy-password-1');
  return dummyHashPromise;
}

async function equaliseTiming(password) {
  try {
    await verifyPassword(String(password || ''), await dummyHash());
  } catch { /* timing only */ }
}

function sign(value) {
  return crypto.createHmac('sha256', sessionSecret()).update(value).digest('hex');
}

function makeCookie(value, maxAge = SESSION_HOURS * 3600) {
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${maxAge}`
  ];
  if (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

function parseCookies(header) {
  const result = {};
  String(header || '').split(';').forEach((pair) => {
    const index = pair.indexOf('=');
    if (index === -1) return;
    const key = pair.slice(0, index).trim();
    if (!key) return;
    result[key] = decodeURIComponent(pair.slice(index + 1).trim());
  });
  return result;
}

function readSessionToken(req) {
  const raw = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const id = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  let expected;
  try { expected = sign(id); } catch { return null; }
  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  return id;
}

function requestIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const raw = forwarded || req.socket?.remoteAddress || '';
  return raw.replace(/^::ffff:/, '').slice(0, 60);
}

async function createSession(userId, req) {
  const id = crypto.randomBytes(32).toString('hex');
  const created = new Date();
  const expires = new Date(created.getTime() + SESSION_HOURS * 3600 * 1000);
  await run(
    'INSERT INTO sessions (id, user_id, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
    [id, userId, created.toISOString(), expires.toISOString(), requestIp(req), String(req.headers['user-agent'] || '').slice(0, 250)]
  );
  return {
    cookie: makeCookie(`${id}.${sign(id)}`),
    id
  };
}

async function loadSession(req) {
  const id = readSessionToken(req);
  if (!id) return null;
  const row = await get(
    `SELECT s.id AS session_id, s.expires_at, u.id, u.name, u.email, u.role, u.active,
            u.must_change_password, u.created_at, u.last_login_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ?`,
    [id]
  );
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await run('DELETE FROM sessions WHERE id = ?', [id]);
    return null;
  }
  if (!row.active) {
    await run('DELETE FROM sessions WHERE user_id = ?', [row.id]);
    return null;
  }
  let renewedCookie = null;
  const remaining = new Date(row.expires_at).getTime() - Date.now();
  if (remaining < SESSION_HOURS * 3600 * 1000 * 0.5) {
    const expires = new Date(Date.now() + SESSION_HOURS * 3600 * 1000);
    await run('UPDATE sessions SET expires_at = ? WHERE id = ?', [expires.toISOString(), id]);
    renewedCookie = makeCookie(`${id}.${sign(id)}`);
  }
  return {
    user: {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      must_change_password: Number(row.must_change_password) === 1,
      created_at: row.created_at,
      last_login_at: row.last_login_at
    },
    sessionId: id,
    renewedCookie
  };
}

function requireUser(ctx) {
  if (!ctx.user) throw unauthorized();
  return ctx.user;
}

function requireHod(ctx) {
  const user = requireUser(ctx);
  if (user.role !== 'HOD') throw forbidden('Only the HOD can perform this action.', 'HOD_ONLY');
  return user;
}

async function deleteSessionsForUser(userId) {
  await run('DELETE FROM sessions WHERE user_id = ?', [userId]);
}

async function deleteSession(sessionId) {
  await run('DELETE FROM sessions WHERE id = ?', [sessionId]);
}

async function recordLoginFailure(key) {
  await run('INSERT INTO login_attempts (key, at) VALUES (?, ?)', [key, nowIso()]);
}

async function loginRateStatus(email, ip) {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const [byPair, byIp] = await Promise.all([
    get('SELECT COUNT(*) AS n FROM login_attempts WHERE key = ? AND at >= ?', [`pair:${email}:${ip}`, since]),
    get('SELECT COUNT(*) AS n FROM login_attempts WHERE key = ? AND at >= ?', [`ip:${ip}`, since])
  ]);
  if (Number(byPair?.n || 0) >= 5) return { limited: true, retryAfter: 900 };
  if (Number(byIp?.n || 0) >= 20) return { limited: true, retryAfter: 900 };
  return { limited: false };
}

async function registerLoginFailure(email, ip) {
  await Promise.all([
    recordLoginFailure(`pair:${email}:${ip}`),
    recordLoginFailure(`ip:${ip}`)
  ]);
  // Opportunistic clean-up keeps the table small.
  const before = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  if (Math.random() < 0.05) {
    await run('DELETE FROM login_attempts WHERE at < ?', [before]);
    await run('DELETE FROM rate_limits WHERE at < ?', [before]);
  }
}

async function clearLoginFailures(email, ip) {
  await run('DELETE FROM login_attempts WHERE key IN (?, ?)', [`pair:${email}:${ip}`, `ip:${ip}`]);
}

async function enforceRateLimit(key, limit, windowMs) {
  const since = new Date(Date.now() - windowMs).toISOString();
  const row = await get('SELECT COUNT(*) AS n FROM rate_limits WHERE key = ? AND at >= ?', [key, since]);
  const count = Number(row?.n || 0);
  if (count >= limit) {
    const error = tooMany('Too many requests. Please wait a moment and try again.', Math.ceil(windowMs / 1000));
    throw error;
  }
  await run('INSERT INTO rate_limits (key, at) VALUES (?, ?)', [key, nowIso()]);
}

/**
 * CSRF protection: browsers send Origin on every non-GET fetch. The header
 * must match the Host we are serving (behind Vercel's proxy).
 */
function enforceCsrf(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  const expectsJson = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  if (expectsJson && !contentType.includes('application/json')) {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use Content-Type: application/json for this request.');
  }
  const origin = req.headers.origin;
  if (!origin) {
    // Same-origin form posts are not used anywhere; a missing Origin is
    // treated as untrusted to keep the rule simple and strict.
    throw forbidden('Missing Origin header.', 'CSRF_FAILED');
  }
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  let originHost;
  try { originHost = new URL(origin).host; } catch { throw forbidden('Invalid Origin header.', 'CSRF_FAILED'); }
  if (originHost !== host) throw forbidden('Cross-site request blocked.', 'CSRF_FAILED');
}

module.exports = {
  SESSION_COOKIE,
  hashPassword,
  verifyPassword,
  equaliseTiming,
  makeCookie,
  parseCookies,
  requestIp,
  createSession,
  loadSession,
  readSessionToken,
  requireUser,
  requireHod,
  deleteSessionsForUser,
  deleteSession,
  loginRateStatus,
  registerLoginFailure,
  clearLoginFailures,
  enforceRateLimit,
  enforceCsrf
};
