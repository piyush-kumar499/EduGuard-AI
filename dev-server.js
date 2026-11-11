'use strict';

/**
 * Local development server. It mounts the same router as the Vercel function
 * and serves only allowlisted files from public/. Nothing outside public/ is
 * reachable over HTTP — in particular .env*, lib/, db/ and api/ source files.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadEnv, ROOT } = require('./lib/env');
loadEnv();

const apiHandler = require('./api/router.js');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'microphone=(self), camera=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
};

function applyHeaders(res, cache = 'no-store') {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key, value);
  res.setHeader('Cache-Control', cache);
}

function safeStaticPath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded.includes('\0')) return null;
  const relative = decoded.replace(/^\/+/, '');
  if (!relative) return path.join(PUBLIC, 'login.html');
  if (relative.startsWith('.') || relative.includes('..')) return null;
  const target = path.resolve(PUBLIC, relative);
  if (!target.startsWith(PUBLIC + path.sep) && target !== PUBLIC) return null;
  return target;
}

function resolveFile(target) {
  if (!target) return null;
  if (fs.existsSync(target) && fs.statSync(target).isFile()) return target;
  if (!path.extname(target) && fs.existsSync(`${target}.html`)) return `${target}.html`;
  const asIndex = path.join(target, 'index.html');
  if (fs.existsSync(asIndex)) return asIndex;
  return null;
}

function sendFile(req, res, file) {
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext];
  if (!type) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  applyHeaders(res, 'no-store');
  res.setHeader('Content-Type', type);
  if (req.method === 'HEAD') {
    res.writeHead(200);
    res.end();
    return;
  }
  fs.createReadStream(file)
    .on('error', () => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Unable to read file');
    })
    .pipe(res);
}

function notFound(req, res) {
  const fallback = path.join(PUBLIC, '404.html');
  if (fs.existsSync(fallback)) {
    applyHeaders(res, 'no-store');
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(fallback).pipe(res);
  }
  applyHeaders(res, 'no-store');
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('Not found');
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (pathname === '/api' || pathname.startsWith('/api/')) {
    // Mirror Vercel: every query parameter is exposed on req.query, including
    // the `path` value written by the /api/:path* rewrite in vercel.json.
    const query = {};
    for (const [key, value] of url.searchParams.entries()) {
      if (query[key] === undefined) query[key] = value;
      else if (Array.isArray(query[key])) query[key].push(value);
      else query[key] = [query[key], value];
    }
    req.query = query;
    apiHandler(req, res);
    return;
  }

  if (!['GET', 'HEAD'].includes(req.method)) {
    applyHeaders(res);
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.end('Method not allowed');
    return;
  }

  if (pathname === '/') {
    res.writeHead(302, { Location: '/login' });
    res.end();
    return;
  }

  const file = resolveFile(safeStaticPath(pathname));
  if (!file) return notFound(req, res);
  sendFile(req, res, file);
});

server.listen(PORT, () => {
  const hasAi = Boolean(process.env.AI_API_KEY || process.env.GROQ_API_KEY || process.env.XAI_API_KEY);
  console.log('');
  console.log(`  EduGuard:  http://localhost:${PORT}`);
  console.log(`  Database:  ${process.env.TURSO_DATABASE_URL ? 'configured' : 'MISSING - run npm run migrate after setting .env.local'}`);
  console.log(`  AI key:    ${hasAi ? 'loaded' : 'missing - offline templates will be used'}`);
  console.log('');
});
