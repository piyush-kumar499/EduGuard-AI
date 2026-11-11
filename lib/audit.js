'use strict';

const { randomUUID } = require('crypto');
const { run, nowIso } = require('./db');

/**
 * Append-only audit trail. JSON values are snapshotted so later edits never
 * rewrite history. `client` may be a transaction for atomic writes.
 */
async function writeAudit(entry, client = null) {
  const db = client || { run };
  const id = randomUUID();
  await db.run(
    `INSERT INTO audit_log (id, at, user_id, action, entity, entity_id, before_json, after_json, reason, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      nowIso(),
      entry.userId || null,
      entry.action,
      entry.entity,
      entry.entityId || null,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
      entry.reason || null,
      entry.ip || null
    ]
  );
  return id;
}

module.exports = { writeAudit };
