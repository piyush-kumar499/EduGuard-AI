'use strict';

const crypto = require('crypto');
const { all, get, run } = require('../db');
const { writeAudit } = require('../audit');
const { activeTerm, termWritable, assertScope } = require('../permissions');
const validate = require('../validate');
const { HttpError } = validate;

async function scopedAssessment(ctx, id) {
  const scope = await ctx.getScope();
  const row = await get(
    `SELECT a.*, t.name AS type_name, t.is_coursework, s.name AS subject_name, sec.name AS section_name,
            u.name AS created_by_name
       FROM assessments a
       JOIN assessment_types t ON t.id = a.type_id
       JOIN subjects s ON s.id = a.subject_id
       JOIN sections sec ON sec.id = a.section_id
       JOIN users u ON u.id = a.created_by
      WHERE a.id = ? AND a.deleted = 0`,
    [id]
  );
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Assessment not found.');
  assertScope(scope, row.subject_id, row.section_id);
  return { row, scope };
}

function shape(row) {
  return {
    id: row.id,
    termId: row.term_id,
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    sectionId: row.section_id,
    sectionName: row.section_name,
    typeId: row.type_id,
    typeName: row.type_name,
    isCoursework: Boolean(row.is_coursework),
    title: row.title,
    maxMarks: Number(row.max_marks),
    heldOn: row.held_on,
    locked: Boolean(row.locked),
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    entered: Number(row.entered || 0),
    students: Number(row.students || 0)
  };
}

async function listAssessments(ctx) {
  const scope = await ctx.getScope();
  const term = scope.term;
  const subjectId = ctx.query.subjectId || ctx.query.subject || null;
  const sectionId = ctx.query.sectionId || ctx.query.section || null;
  if (subjectId && sectionId) assertScope(scope, subjectId, sectionId);
  else if (subjectId) assertScope(scope, subjectId, scope.sections[0]?.id || '');
  else if (sectionId) {
    const { assertSection } = require('../permissions');
    assertSection(scope, sectionId);
  }

  const rows = await all(
    `SELECT a.*, t.name AS type_name, t.is_coursework, s.name AS subject_name, sec.name AS section_name,
            u.name AS created_by_name,
            (SELECT COUNT(*) FROM marks m WHERE m.assessment_id = a.id) AS entered,
            (SELECT COUNT(*) FROM students st WHERE st.section_id = a.section_id AND st.active = 1) AS students
       FROM assessments a
       JOIN assessment_types t ON t.id = a.type_id
       JOIN subjects s ON s.id = a.subject_id
       JOIN sections sec ON sec.id = a.section_id
       JOIN users u ON u.id = a.created_by
      WHERE a.term_id = ? AND a.deleted = 0
      ORDER BY a.held_on, a.created_at, a.title`,
    [term.id]
  );
  const filtered = rows
    .filter((row) => scope.role === 'HOD' || scope.pairs.has(`${row.subject_id}:${row.section_id}`))
    .filter((row) => !subjectId || row.subject_id === subjectId)
    .filter((row) => !sectionId || row.section_id === sectionId);

  return {
    term: { id: term.id, name: term.name },
    assessments: filtered.map(shape),
    types: (await all('SELECT id, name, is_coursework, active FROM assessment_types WHERE active = 1 ORDER BY name')).map((type) => ({
      id: type.id, name: type.name, isCoursework: Boolean(type.is_coursework)
    }))
  };
}

async function createAssessment(ctx) {
  const scope = await ctx.getScope();
  const term = await activeTerm();
  await termWritable(term.id);
  const subjectId = validate.id(ctx.body?.subjectId, 'Subject');
  const sectionId = validate.id(ctx.body?.sectionId, 'Section');
  assertScope(scope, subjectId, sectionId);
  const typeId = validate.id(ctx.body?.typeId, 'Assessment type');
  const type = await get('SELECT * FROM assessment_types WHERE id = ? AND active = 1', [typeId]);
  if (!type) throw new HttpError(400, 'VALIDATION', 'Choose an active assessment type.', { typeId: 'Choose a type.' });
  const title = validate.str(ctx.body?.title, 'Title', { min: 2, max: 120 });
  const maxMarks = validate.num(ctx.body?.maxMarks, 'Maximum marks', { min: 0.01, max: 10000 });
  const heldOn = validate.date(ctx.body?.heldOn, 'Date', { required: false });

  const id = crypto.randomUUID();
  await run(
    `INSERT INTO assessments (id, term_id, subject_id, section_id, type_id, title, max_marks, held_on, locked, deleted, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
    [id, term.id, subjectId, sectionId, typeId, title, maxMarks, heldOn, ctx.user.id, new Date().toISOString()]
  );
  await writeAudit({
    userId: ctx.user.id, action: 'assessment.create', entity: 'assessment', entityId: id,
    after: { subjectId, sectionId, typeId, title, maxMarks, heldOn }, ip: ctx.ip
  });
  return {
    id, subjectId, sectionId, typeId, typeName: type.name, title, maxMarks, heldOn,
    locked: false, entered: 0, students: 0
  };
}

async function updateAssessment(ctx) {
  const { row, scope } = await scopedAssessment(ctx, validate.id(ctx.params.id));
  await termWritable(row.term_id);
  if (Number(row.locked) === 1 && scope.role !== 'HOD') {
    throw new HttpError(403, 'LOCKED', 'This assessment is finalised. Ask the HOD to unlock it.');
  }
  const next = {
    title: validate.has(ctx.body, 'title') ? validate.str(ctx.body.title, 'Title', { min: 2, max: 120 }) : row.title,
    maxMarks: validate.has(ctx.body, 'maxMarks') ? validate.num(ctx.body.maxMarks, 'Maximum marks', { min: 0.01, max: 10000 }) : Number(row.max_marks),
    heldOn: validate.has(ctx.body, 'heldOn') ? validate.date(ctx.body.heldOn, 'Date', { required: false }) : row.held_on,
    typeId: validate.has(ctx.body, 'typeId') ? validate.id(ctx.body.typeId, 'Assessment type') : row.type_id
  };
  if (next.maxMarks < Number(row.max_marks)) {
    const over = await get('SELECT MAX(score) AS max FROM marks WHERE assessment_id = ? AND score IS NOT NULL', [row.id]);
    if (over?.max !== null && Number(over.max) > next.maxMarks) {
      throw new HttpError(400, 'VALIDATION', `Maximum marks cannot be below an existing score (${over.max}).`, {
        maxMarks: `Must be at least ${over.max}.`
      });
    }
  }
  if (next.typeId !== row.type_id) {
    const type = await get('SELECT * FROM assessment_types WHERE id = ?', [next.typeId]);
    if (!type) throw new HttpError(400, 'VALIDATION', 'Assessment type not found.');
  }
  await run(
    'UPDATE assessments SET title = ?, max_marks = ?, held_on = ?, type_id = ? WHERE id = ?',
    [next.title, next.maxMarks, next.heldOn, next.typeId, row.id]
  );
  await writeAudit({
    userId: ctx.user.id, action: 'assessment.update', entity: 'assessment', entityId: row.id,
    before: { title: row.title, maxMarks: Number(row.max_marks), heldOn: row.held_on, typeId: row.type_id },
    after: next, reason: ctx.body?.reason || null, ip: ctx.ip
  });
  return { id: row.id, ...next };
}

async function deleteAssessment(ctx) {
  const { row, scope } = await scopedAssessment(ctx, validate.id(ctx.params.id));
  await termWritable(row.term_id);
  if (Number(row.locked) === 1 && scope.role !== 'HOD') {
    throw new HttpError(403, 'LOCKED', 'This assessment is finalised. Ask the HOD to unlock it.');
  }
  await run('UPDATE assessments SET deleted = 1 WHERE id = ?', [row.id]);
  await writeAudit({
    userId: ctx.user.id, action: 'assessment.delete', entity: 'assessment', entityId: row.id,
    before: { title: row.title }, after: { deleted: true }, reason: ctx.body?.reason || null, ip: ctx.ip
  });
  return { id: row.id, deleted: true };
}

async function lockAssessment(ctx) {
  const { row } = await scopedAssessment(ctx, validate.id(ctx.params.id));
  await termWritable(row.term_id);
  await run('UPDATE assessments SET locked = 1 WHERE id = ?', [row.id]);
  await writeAudit({
    userId: ctx.user.id, action: 'assessment.lock', entity: 'assessment', entityId: row.id,
    before: { locked: false }, after: { locked: true }, ip: ctx.ip
  });
  return { id: row.id, locked: true };
}

async function unlockAssessment(ctx) {
  const reason = validate.str(ctx.body?.reason, 'Reason', { min: 4, max: 500 });
  const row = await get(
    `SELECT a.*, s.name AS subject_name, sec.name AS section_name
       FROM assessments a JOIN subjects s ON s.id = a.subject_id
       JOIN sections sec ON sec.id = a.section_id
      WHERE a.id = ? AND a.deleted = 0`,
    [validate.id(ctx.params.id)]
  );
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Assessment not found.');
  await termWritable(row.term_id);
  await run('UPDATE assessments SET locked = 0 WHERE id = ?', [row.id]);
  await writeAudit({
    userId: ctx.user.id, action: 'assessment.unlock', entity: 'assessment', entityId: row.id,
    before: { locked: true }, after: { locked: false }, reason, ip: ctx.ip
  });
  return { id: row.id, locked: false };
}

module.exports = [
  { method: 'GET', path: 'assessments', handler: listAssessments },
  { method: 'POST', path: 'assessments', handler: createAssessment },
  { method: 'PATCH', path: 'assessments/:id', handler: updateAssessment },
  { method: 'DELETE', path: 'assessments/:id', handler: deleteAssessment },
  { method: 'POST', path: 'assessments/:id/lock', handler: lockAssessment },
  { method: 'POST', path: 'assessments/:id/unlock', handler: unlockAssessment, hod: true }
];
module.exports.scopedAssessment = scopedAssessment;
module.exports.shape = shape;
