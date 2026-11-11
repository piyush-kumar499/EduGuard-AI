'use strict';

const { loadEnv } = require('../lib/env');
loadEnv();
const { runSeed } = require('./demo');

const resetDemo = process.argv.includes('--reset-demo');

runSeed({ resetDemo })
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('');
    console.error('Seed failed:', error.message);
    if (/TURSO/.test(error.message)) {
      console.error('Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to .env.local first.');
    }
    process.exit(1);
  });
