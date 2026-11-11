'use strict';

const { loadEnv } = require('../lib/env');
const { getClient } = require('../lib/db');
const { STATEMENTS, DEFAULT_SETTINGS } = require('./schema');

loadEnv();

async function migrate() {
  const db = getClient();
  // libSQL applies one statement per call; keep it explicit and idempotent.
  for (const sql of STATEMENTS) {
    await db.execute(sql);
  }
  // Default settings are safe to insert on every run.
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.execute({
      sql: 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING',
      args: [key, JSON.stringify(value)]
    });
  }
  return { tables: STATEMENTS.length };
}

if (require.main === module) {
  migrate()
    .then((result) => {
      console.log(`Migration complete (${result.tables} statements applied).`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error.message);
      process.exit(1);
    });
}

module.exports = { migrate };
