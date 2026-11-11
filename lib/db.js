'use strict';

/**
 * The single database access point. Only @libsql/client is used.
 */
const { createClient } = require('@libsql/client');
const { loadEnv } = require('./env');

loadEnv();

let client = null;

function getClient() {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) {
    throw Object.assign(new Error('TURSO_DATABASE_URL is not configured'), { status: 503, code: 'DB_NOT_CONFIGURED' });
  }
  client = createClient({ url, authToken: authToken || undefined });
  return client;
}

async function all(sql, args = []) {
  const result = await getClient().execute({ sql, args });
  return result.rows;
}

async function get(sql, args = []) {
  const rows = await all(sql, args);
  return rows[0] || null;
}

async function run(sql, args = []) {
  return getClient().execute({ sql, args });
}

async function batch(statements) {
  if (!statements.length) return;
  return getClient().batch(statements, 'write');
}

/**
 * Run related writes atomically with libSQL's interactive transaction.
 * `work` receives a `tx` object with all/get/run bound to the transaction.
 */
async function transaction(work) {
  const db = getClient();
  const tx = await db.transaction('write');
  const api = {
    all: async (sql, args = []) => (await tx.execute({ sql, args })).rows,
    get: async (sql, args = []) => {
      const rows = (await tx.execute({ sql, args })).rows;
      return rows[0] || null;
    },
    run: (sql, args = []) => tx.execute({ sql, args })
  };
  try {
    const result = await work(api);
    await tx.commit();
    return result;
  } catch (error) {
    try { await tx.rollback(); } catch { /* already closed */ }
    throw error;
  }
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = { getClient, all, get, run, batch, transaction, nowIso };
