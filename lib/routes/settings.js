'use strict';

const { all } = require('../db');
const { transaction } = require('../db');
const { writeAudit } = require('../audit');
const scoring = require('../scoring');
const { DEFAULT_SETTINGS } = require('../../db/schema');
const validate = require('../validate');
const { HttpError } = validate;

async function readSettings() {
  const rows = await all('SELECT key, value FROM settings');
  const raw = {};
  for (const row of rows) {
    try { raw[row.key] = JSON.parse(row.value); } catch { raw[row.key] = row.value; }
  }
  const merged = {
    score_weights: { ...DEFAULT_SETTINGS.score_weights, ...(raw.score_weights || {}) },
    thresholds: { ...DEFAULT_SETTINGS.thresholds, ...(raw.thresholds || {}) },
    absent_counts_as_zero: raw.absent_counts_as_zero !== false,
    min_assessments_for_trend: raw.min_assessments_for_trend ?? DEFAULT_SETTINGS.min_assessments_for_trend
  };
  return merged;
}

async function getSettings() {
  return { settings: await readSettings() };
}

function validThresholds(raw, current) {
  const next = { ...current };
  for (const key of Object.keys(DEFAULT_SETTINGS.thresholds)) {
    if (validate.has(raw, key)) next[key] = validate.num(raw[key], key, { min: 0, max: 100 });
  }
  if (next.onTrack < next.watch) throw new HttpError(400, 'VALIDATION', 'On-track threshold must be at or above the watch threshold.', { onTrack: 'Must be >= watch.' });
  for (const pair of [['attendanceWatch', 'attendanceConcern'], ['courseworkWatch', 'courseworkConcern'], ['marksWatch', 'marksConcern']]) {
    if (next[pair[0]] < next[pair[1]]) {
      throw new HttpError(400, 'VALIDATION', `${pair[0]} must be at or above ${pair[1]}.`, { [pair[0]]: `Must be >= ${pair[1]}.` });
    }
  }
  return next;
}

async function putSettings(ctx) {
  const current = await readSettings();
  const body = ctx.body || {};
  const before = JSON.parse(JSON.stringify(current));

  let weights = current.score_weights;
  if (body.score_weights !== undefined) {
    try {
      weights = scoring.validateWeights(body.score_weights);
    } catch (error) {
      throw new HttpError(400, 'VALIDATION', error.message, { score_weights: error.message });
    }
  }
  const thresholds = body.thresholds !== undefined
    ? validThresholds(body.thresholds, current.thresholds)
    : current.thresholds;
  const absent = body.absent_counts_as_zero !== undefined
    ? validate.bool(body.absent_counts_as_zero, current.absent_counts_as_zero)
    : current.absent_counts_as_zero;
  const minAssessments = body.min_assessments_for_trend !== undefined
    ? validate.int(body.min_assessments_for_trend, 'Minimum assessments for trend', { min: 2, max: 20 })
    : current.min_assessments_for_trend;

  const next = {
    score_weights: weights,
    thresholds,
    absent_counts_as_zero: absent,
    min_assessments_for_trend: minAssessments
  };

  await transaction(async (tx) => {
    for (const [key, value] of Object.entries(next)) {
      await tx.run(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [key, JSON.stringify(value)]
      );
    }
    await tx.run(
      `INSERT INTO audit_log (id, at, user_id, action, entity, entity_id, before_json, after_json, reason, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [require('crypto').randomUUID(), new Date().toISOString(), ctx.user.id, 'settings.update', 'settings', 'global',
        JSON.stringify(before), JSON.stringify(next), null, ctx.ip]
    );
  });
  return { settings: next };
}

module.exports = [
  { method: 'GET', path: 'settings', handler: getSettings },
  { method: 'PUT', path: 'settings', handler: putSettings, hod: true }
];
