'use strict';

/**
 * Single Vercel serverless entry point. All /api/* traffic is dispatched by
 * the small internal router so the deployment stays well inside the free-tier
 * function limit.
 *
 * The file is deliberately not named api/[...path].js: in a framework-less
 * Vercel project a bracketed catch-all only matches one path segment, so
 * /api/auth/login never reached the function and returned the platform 404.
 * vercel.json rewrites /api/:path* to /api/router?path=:path* instead, which
 * reaches this function at any depth.
 */

const { loadEnv } = require('../lib/env');
loadEnv();

const { createRouter, RAW } = require('../lib/router');
const { HttpError } = require('../lib/validate');
const { loadSession, enforceCsrf, requestIp } = require('../lib/auth');
const { buildScope } = require('../lib/permissions');

function buildApp() {
  const router = createRouter();
  router.addAll(require('../lib/routes/auth'));
  router.addAll(require('../lib/routes/users'));
  router.addAll(require('../lib/routes/structure'));
  router.addAll(require('../lib/routes/assignments'));
  router.addAll(require('../lib/routes/terms'));
  router.addAll(require('../lib/routes/students'));
  router.addAll(require('../lib/routes/assessments'));
  router.addAll(require('../lib/routes/marks'));
  router.addAll(require('../lib/routes/attendance'));
  router.addAll(require('../lib/routes/analytics'));
  router.addAll(require('../lib/routes/reports'));
  router.addAll(require('../lib/routes/alerts'));
  router.addAll(require('../lib/routes/actions'));
  router.addAll(require('../lib/routes/settings'));
  router.addAll(require('../lib/routes/audit'));
  router.addAll(require('../lib/routes/ai'));
  router.addAll(require('../lib/routes/demo'));
  router.add({ method: 'GET', path: 'health', public: true, handler: async () => ({ ok: true, time: new Date().toISOString() }) });
  return router;
}

const app = buildApp();

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function internalEntry(req) {
  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = url.pathname.replace(/\/+$/, '');
  return pathname === '/api/router' || pathname === '/api/router.js';
}

function parsePath(req) {
  // On Vercel the request arrives as /api/router?path=<rest> (see vercel.json).
  // Only trust that forwarded value on the internal entry path, so a client
  // cannot pick a different route with a stray ?path= parameter.
  if (internalEntry(req)) {
    const raw = req.query?.path;
    if (Array.isArray(raw)) return raw.join('/').replace(/^\/+|\/+$/g, '');
    if (typeof raw === 'string') return raw.replace(/^\/+|\/+$/g, '');
  }
  const url = new URL(req.url || '/', 'http://localhost');
  return url.pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
}

function queryObject(req) {
  const url = new URL(req.url || '/', 'http://localhost');
  const result = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (result[key] === undefined) result[key] = value;
    else if (Array.isArray(result[key])) result[key].push(value);
    else result[key] = [result[key], value];
  }
  if (req.query) {
    for (const [key, value] of Object.entries(req.query)) {
      if (key !== 'path') result[key] = Array.isArray(value) ? value[0] : value;
    }
  }
  return result;
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const path = parsePath(req);
  const query = queryObject(req);
  const ip = requestIp(req);

  let body = null;
  try {
    enforceCsrf(req);
    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    if (!['GET', 'HEAD'].includes(req.method) && contentType.includes('application/json')) {
      let raw = req.body;
      if (raw === undefined) raw = await readBody(req);
      if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
      if (typeof raw === 'string') raw = raw.trim() ? JSON.parse(raw) : {};
      body = raw || {};
    }
  } catch (error) {
    return respondError(res, error);
  }

  const match = app.match(req.method, path);
  if (!match) {
    return respondError(res, new HttpError(404, 'NOT_FOUND', 'API route not found.'));
  }
  const { route, params } = match;

  let session = null;
  try {
    session = await loadSession(req);
  } catch (error) {
    console.error('[api] session load failed:', error.message);
  }

  let scopeCache = null;
  const ctx = {
    req,
    res,
    path,
    query,
    params,
    body,
    ip,
    user: session?.user || null,
    sessionId: session?.sessionId || null,
    async getScope() {
      if (!scopeCache) scopeCache = await buildScope(session.user);
      return scopeCache;
    }
  };

  try {
    if (!route.options.public && !ctx.user) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in to continue.');
    }
    if (ctx.user?.must_change_password && !route.options.allowPasswordChange) {
      throw new HttpError(403, 'PASSWORD_CHANGE_REQUIRED', 'Change your temporary password before continuing.');
    }
    if (route.options.hod && ctx.user.role !== 'HOD') {
      throw new HttpError(403, 'HOD_ONLY', 'Only the HOD can perform this action.');
    }

    const data = await route.handler(ctx);
    if (data === RAW) return;

    if (session?.renewedCookie) res.setHeader('Set-Cookie', session.renewedCookie);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: true, data: data === undefined ? null : data }));
  } catch (error) {
    return respondError(res, error);
  }
}

function respondError(res, error) {
  const status = error instanceof HttpError ? error.status : (error.status && Number.isInteger(error.status) ? error.status : 500);
  const code = error.code || 'INTERNAL_ERROR';
  const message = status >= 500 && !error.expose
    ? 'Something went wrong on the server. Please try again.'
    : (error.message || 'Request failed.');
  if (status >= 500) console.error('[api]', error);
  if (res.writableEnded) return;
  if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({
    ok: false,
    error: {
      code,
      message,
      ...(error.fields ? { fields: error.fields } : {})
    }
  }));
}

module.exports = handler;
module.exports.app = app;
module.exports.respondError = respondError;
