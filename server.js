/**
 * Zero-dependency local server for the dashboard.
 *
 * Serves index.html and friends from this folder, and routes POST /api/ai to
 * the same handler Vercel uses, so the live AI path can be tested without
 * deploying anything.
 *
 * Usage:  node server.js
 * Then:   http://localhost:3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;

function loadEnvFile(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    return;
  }
  text.split(/\r?\n/).forEach(function (line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const name = trimmed.slice(0, eq).trim();
    if (!name || process.env[name] != null) return;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[name] = value;
  });
}

// .env.local wins over .env; real environment variables always win over both.
loadEnvFile(path.join(ROOT, '.env'));
loadEnvFile(path.join(ROOT, '.env.local'));

const aiHandler = require('./api/ai.js');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

function readBody(request) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    request.on('data', function (chunk) { chunks.push(chunk); });
    request.on('end', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
    request.on('error', reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

async function handleAi(request, response) {
  let body = null;
  if (request.method === 'POST') {
    const raw = await readBody(request);
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch (error) {
      body = raw;
    }
  }

  // Minimal stand-in for the Vercel request/response helpers api/ai.js uses.
  const shimResponse = {
    setHeader: function (name, value) { response.setHeader(name, value); },
    status: function (code) { response.statusCode = code; return this; },
    json: function (payload) {
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(JSON.stringify(payload));
      return this;
    },
    end: function (data) { response.end(data); return this; }
  };

  try {
    await aiHandler({
      method: request.method,
      headers: request.headers,
      body: body
    }, shimResponse);
  } catch (error) {
    if (!response.writableEnded) {
      sendJson(response, 500, { ok: false, error: 'Local server could not run the AI handler.' });
    }
  }
}

function serveStatic(request, response, pathname) {
  const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const target = path.resolve(ROOT, relative);

  if (!target.startsWith(ROOT + path.sep) && target !== path.join(ROOT, 'index.html')) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(target, function (statError, stats) {
    if (statError || !stats.isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
    response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    fs.createReadStream(target).pipe(response);
  });
}

const server = http.createServer(function (request, response) {
  const url = new URL(request.url, 'http://localhost');
  const pathname = url.pathname;

  if (pathname === '/api/ai') {
    handleAi(request, response);
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD, POST' }).end('Method not allowed');
    return;
  }
  serveStatic(request, response, pathname);
});

server.listen(PORT, function () {
  const hasKey = Boolean(process.env.AI_API_KEY || process.env.GROQ_API_KEY || process.env.XAI_API_KEY);
  console.log('');
  console.log('  Dashboard: http://localhost:' + PORT);
  console.log('  AI key:    ' + (hasKey ? 'loaded' : 'missing - AI features will use the offline template'));
  console.log('  Provider:  ' + (process.env.AI_PROVIDER || 'anthropic') + ' / ' + (process.env.AI_MODEL || 'default model'));
  console.log('');
});
