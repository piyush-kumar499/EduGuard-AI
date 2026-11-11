'use strict';

const crypto = require('crypto');
const { all, get, run, transaction } = require('../db');
const { writeAudit } = require('../audit');
const validate = require('../validate');
const { HttpError } = validate;

async function listTerms() {
  const rows = await all(
    `SELECT t.*,
            (SELECT COUNT(*) FROM assessments a WHERE a.term_id = t.id AND a.deleted = 0) AS assessments,
            (SELECT COUNT(*) FROM teaching_assignments ta WHERE ta.term_id = t.id) AS assignments
       FROM terms t ORDER BY t.active DESC, t.archived ASC, t.starts_on DESC`
  );
  return {
    terms: rows.map((row) => ({
      id: row.id,
      name: row.name,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      active: Boolean(row.active),
      archived: Boolean(row.archived),
      assessments: Number(row.assessments),
      assignments: Number(row.assignments)
    }))
  };
}

async function createTerm(ctx) {
  const name = validate.str(ctx.body?.name, 'Term name', { min: 2, max: 80 });
  const startsOn = validate.date(ctx.body?.startsOn ?? ctx.body?.starts_on, 'Start date', { required: false });
  const endsOn = validate.date(ctx.body?.endsOn ?? ctx.body?.ends_on, 'End date', { required: false });
  const makeActive = validate.bool(ctx.body?.active, false);
  if (startsOn && endsOn && endsOn < startsOn) throw new HttpError(400, 'VALIDATION', 'End date must be after the start date.');

  const id = crypto.randomUUID();
  await transaction(async (tx) => {
    if (makeActive) await tx.run('UPDATE terms SET active = 0');
    await tx.run(
      'INSERT INTO terms (id, name, starts_on, ends_on, active, archived) VALUES (?, ?, ?, ?, ?, 0)',
      [id, name, startsOn, endsOn, makeActive ? 1 : 0]
    );
    await tx.run(
      `INSERT INTO audit_log (id, at, user_id, action, entity, entity_id, before_json, after_json, reason, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), new Date().toISOString(), ctx.user.id, 'term.create', 'term', id, null,
        JSON.stringify({ name, startsOn, endsOn, active: makeActive }), null, ctx.ip]
    );
  });
  return { id, name, startsOn, endsOn, active: makeActive, archived: false };
}

async function activateTerm(ctx) {
  const id = validate.id(ctx.params.id);
  const term = await get('SELECT * FROM terms WHERE id = ?', [id]);
  if (!term) throw new HttpError(404, 'NOT_FOUND', 'Term not found.');
  await transaction(async (tx) => {
    await tx.run('UPDATE terms SET active = 0');
    await tx.run('UPDATE terms SET active = 1, archived = 0 WHERE id = ?', [id]);
    await tx.run(
      `INSERT INTO audit_log (id, at, user_id, action, entity, entity_id, before_json, after_json, reason, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), new Date().toISOString(), ctx.user.id, 'term.activate', 'term', id,
        JSON.stringify({ active: Boolean(term.active), archived: Boolean(term.archived) }),
        JSON.stringify({ active: true, archived: false }), null, ctx.ip]
    );
  });
  return { id, active: true };
}

async function rolloverTerm(ctx) {
  const oldId = validate.id(ctx.params.id);
  const oldTerm = await get('SELECT * FROM terms WHERE id = ?', [oldId]);
  if (!oldTerm) throw new HttpError(404, 'NOT_FOUND', 'Term not found.');
  const name = validate.str(ctx.body?.name, 'New term name', { min: 2, max: 80 });
  const startsOn = validate.date(ctx.body?.startsOn ?? ctx.body?.starts_on, 'Start date', { required: false });
  const endsOn = validate.date(ctx.body?.endsOn ?? ctx.body?.ends_on, 'End date', { required: false });
  const copyAssignments = validate.bool(ctx.body?.copyAssignments, true);
  if (startsOn && endsOn && endsOn < startsOn) throw new HttpError(400, 'VALIDATION', 'End date must be after the start date.');

  const newId = crypto.randomUUID();
  const assignments = copyAssignments
    ? await all('SELECT * FROM teaching_assignments WHERE term_id = ?', [oldId])
    : [];

  await transaction(async (tx) => {
    await tx.run('UPDATE terms SET active = 0, archived = 1 WHERE id = ?', [oldId]);
    await tx.run('UPDATE terms SET active = 0');
    await tx.run(
      'INSERT INTO terms (id, name, starts_on, ends_on, active, archived) VALUES (?, ?, ?, ?, 1, 0)',
      [newId, name, startsOn, endsOn]
    );
    for (const row of assignments) {
      await tx.run(
        'INSERT INTO teaching_assignments (id, term_id, user_id, subject_id, section_id) VALUES (?, ?, ?, ?, ?)',
        [crypto.randomUUID(), newId, row.user_id, row.subject_id, row.section_id]
      );
    }
    await tx.run(
      `INSERT INTO audit_log (id, at, user_id, action, entity, entity_id, before_json, after_json, reason, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), new Date().toISOString(), ctx.user.id, 'term.rollover', 'term', oldId,
        JSON.stringify({ archived: Boolean(oldTerm.archived), active: Boolean(oldTerm.active) }),
        JSON.stringify({ newTermId: newId, name, startsOn, endsOn, copiedAssignments: assignments.length }), null, ctx.ip]
    );
  });
  return {
    id: newId, name, startsOn, endsOn, active: true, archived: false,
    archivedTermId: oldId, copiedAssignments: assignments.length
  };
}

module.exports = [
  { method: 'GET', path: 'terms', handler: listTerms },
  { method: 'POST', path: 'terms', handler: createTerm, hod: true },
  { method: 'POST', path: 'terms/:id/activate', handler: activateTerm, hod: true },
  { method: 'POST', path: 'terms/:id/rollover', handler: rolloverTerm, hod: true }
];
