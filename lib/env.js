'use strict';

/**
 * Small environment loader for local development. Real environment variables
 * always win; `.env.local` wins over `.env`. No value is ever exposed to the
 * browser bundle.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function loadFile(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }
  text.split(/\r?\n/).forEach((line) => {
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

function loadEnv() {
  loadFile(path.join(ROOT, '.env'));
  loadFile(path.join(ROOT, '.env.local'));
  return process.env;
}

module.exports = { ROOT, loadEnv };
