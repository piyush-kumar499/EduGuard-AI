'use strict';

const crypto = require('crypto');
const { all, get, run, transaction } = require('../db');
const { writeAudit } = require('../audit');
const validate = require('../validate');
const { HttpError } = validate;

function nowIso() { return new Date().toISOString(); }

async function listSections(ctx) {
  const includeInactive = validate.bool(ctx.query.includeInactive, true);
  const rows = await all(
    `SELECT sec.*, (SELECT COUNT(*) FROM students st WHERE st.section_id = sec.id AND st.active = 1) AS students
       FROM sections sec
      ${includeInactive ? '' : 'WHERE sec.active = 1'}
      ORDER BY sec.branch, sec.semester, sec.name`
  );
  return {
    sections: rows.map((row) => ({
      id: row.id, branch: row.branch, semester: row.semester, name: row.name,
      active: Boolean(row.active), students: Number(row.students)
    }))
  };
}

async function createSection(ctx) {
  const branch = validate.str(ctx.body?.branch, 'Branch', { min: 1, max: 60 });
  const semester = validate.str(ctx.body?.semester, 'Semester', { min: 1, max: 30 });
  const name = validate.str(ctx.body?.name, 'Section name', { min: 1, max: 20 });
  const clash = await get('SELECT id FROM sections WHERE branch = ? AND semester = ? AND name = ?', [branch, semester, name]);
  if (clash) throw new HttpError(409, 'DUPLICATE', 'That section already exists for this branch and semester.');
  const id = crypto.randomUUID();
  await run('INSERT INTO sections (id, branch, semester, name, active) VALUES (?, ?, ?, ?, 1)', [id, branch, semester, name]);
  await writeAudit({ userId: ctx.user.id, action: 'section.create', entity: 'section', entityId: id, after: { branch, semester, name }, ip: ctx.ip });
  return { id, branch, semester, name, active: true, students: 0 };
}

async function updateSection(ctx) {
  const id = validate.id(ctx.params.id);
  const target = await get('SELECT * FROM sections WHERE id = ?', [id]);
  if (!target) throw new HttpError(404, 'NOT_FOUND', 'Section not found.');
  const next = {
    branch: validate.has(ctx.body, 'branch') ? validate.str(ctx.body.branch, 'Branch', { min: 1, max: 60 }) : target.branch,
    semester: validate.has(ctx.body, 'semester') ? validate.str(ctx.body.semester, 'Semester', { min: 1, max: 30 }) : target.semester,
    name: validate.has(ctx.body, 'name') ? validate.str(ctx.body.name, 'Section name', { min: 1, max: 20 }) : target.name,
    active: validate.has(ctx.body, 'active') ? validate.bool(ctx.body.active, Boolean(target.active)) : Boolean(target.active)
  };
  const clash = await get('SELECT id FROM sections WHERE branch = ? AND semester = ? AND name = ? AND id <> ?', [next.branch, next.semester, next.name, id]);
  if (clash) throw new HttpError(409, 'DUPLICATE', 'Another section already uses that branch, semester and name.');
  await run('UPDATE sections SET branch = ?, semester = ?, name = ?, active = ? WHERE id = ?', [next.branch, next.semester, next.name, next.active ? 1 : 0, id]);
  await writeAudit({
    userId: ctx.user.id, action: 'section.update', entity: 'section', entityId: id,
    before: { branch: target.branch, semester: target.semester, name: target.name, active: Boolean(target.active) },
    after: next, ip: ctx.ip
  });
  return { id, ...next };
}

async function listSubjects(ctx) {
  const includeInactive = validate.bool(ctx.query.includeInactive, true);
  const rows = await all(
    `SELECT s.*,
            (SELECT COUNT(*) FROM assessments a WHERE a.subject_id = s.id AND a.deleted = 0) AS assessments
       FROM subjects s
      ${includeInactive ? '' : 'WHERE s.active = 1'}
      ORDER BY s.name`
  );
  return {
    subjects: rows.map((row) => ({
      id: row.id, name: row.name, code: row.code || '', active: Boolean(row.active),
      assessments: Number(row.assessments)
    }))
  };
}

async function createSubject(ctx) {
  const name = validate.str(ctx.body?.name, 'Subject name', { min: 2, max: 80 });
  const code = validate.str(ctx.body?.code || '', 'Subject code', { min: 0, max: 20, required: false }) || null;
  const clash = await get('SELECT id FROM subjects WHERE name = ?', [name]);
  if (clash) throw new HttpError(409, 'DUPLICATE', 'A subject with that name already exists.');
  const id = crypto.randomUUID();
  await run('INSERT INTO subjects (id, code, name, active) VALUES (?, ?, ?, 1)', [id, code, name]);
  await writeAudit({ userId: ctx.user.id, action: 'subject.create', entity: 'subject', entityId: id, after: { name, code }, ip: ctx.ip });
  return { id, name, code: code || '', active: true, assessments: 0 };
}

async function updateSubject(ctx) {
  const id = validate.id(ctx.params.id);
  const target = await get('SELECT * FROM subjects WHERE id = ?', [id]);
  if (!target) throw new HttpError(404, 'NOT_FOUND', 'Subject not found.');
  const next = {
    name: validate.has(ctx.body, 'name') ? validate.str(ctx.body.name, 'Subject name', { min: 2, max: 80 }) : target.name,
    code: validate.has(ctx.body, 'code') ? (validate.str(ctx.body.code || '', 'Subject code', { min: 0, max: 20, required: false }) || null) : target.code,
    active: validate.has(ctx.body, 'active') ? validate.bool(ctx.body.active, Boolean(target.active)) : Boolean(target.active)
  };
  const clash = await get('SELECT id FROM subjects WHERE name = ? AND id <> ?', [next.name, id]);
  if (clash) throw new HttpError(409, 'DUPLICATE', 'Another subject already uses that name.');
  await run('UPDATE subjects SET name = ?, code = ?, active = ? WHERE id = ?', [next.name, next.code, next.active ? 1 : 0, id]);
  await writeAudit({
    userId: ctx.user.id, action: 'subject.update', entity: 'subject', entityId: id,
    before: { name: target.name, code: target.code, active: Boolean(target.active) }, after: next, ip: ctx.ip
  });
  return { id, ...next };
}

async function listTypes(ctx) {
  const includeInactive = validate.bool(ctx.query.includeInactive, true);
  const rows = await all(`SELECT * FROM assessment_types ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY name`);
  return {
    types: rows.map((row) => ({
      id: row.id, name: row.name, isCoursework: Boolean(row.is_coursework), active: Boolean(row.active)
    }))
  };
}

async function createType(ctx) {
  const name = validate.str(ctx.body?.name, 'Type name', { min: 2, max: 60 });
  const isCoursework = validate.bool(ctx.body?.isCoursework ?? ctx.body?.is_coursework, false);
  const clash = await get('SELECT id FROM assessment_types WHERE name = ?', [name]);
  if (clash) throw new HttpError(409, 'DUPLICATE', 'An assessment type with that name already exists.');
  const id = crypto.randomUUID();
  await run('INSERT INTO assessment_types (id, name, is_coursework, active) VALUES (?, ?, ?, 1)', [id, name, isCoursework ? 1 : 0]);
  await writeAudit({ userId: ctx.user.id, action: 'assessment_type.create', entity: 'assessment_type', entityId: id, after: { name, isCoursework }, ip: ctx.ip });
  return { id, name, isCoursework, active: true };
}

async function updateType(ctx) {
  const id = validate.id(ctx.params.id);
  const target = await get('SELECT * FROM assessment_types WHERE id = ?', [id]);
  if (!target) throw new HttpError(404, 'NOT_FOUND', 'Assessment type not found.');
  const next = {
    name: validate.has(ctx.body, 'name') ? validate.str(ctx.body.name, 'Type name', { min: 2, max: 60 }) : target.name,
    isCoursework: validate.has(ctx.body, 'isCoursework') || validate.has(ctx.body, 'is_coursework')
      ? validate.bool(ctx.body.isCoursework ?? ctx.body.is_coursework, Boolean(target.is_coursework))
      : Boolean(target.is_coursework),
    active: validate.has(ctx.body, 'active') ? validate.bool(ctx.body.active, Boolean(target.active)) : Boolean(target.active)
  };
  const clash = await get('SELECT id FROM assessment_types WHERE name = ? AND id <> ?', [next.name, id]);
  if (clash) throw new HttpError(409, 'DUPLICATE', 'Another assessment type already uses that name.');
  await run('UPDATE assessment_types SET name = ?, is_coursework = ?, active = ? WHERE id = ?', [next.name, next.isCoursework ? 1 : 0, next.active ? 1 : 0, id]);
  await writeAudit({
    userId: ctx.user.id, action: 'assessment_type.update', entity: 'assessment_type', entityId: id,
    before: { name: target.name, isCoursework: Boolean(target.is_coursework), active: Boolean(target.active) },
    after: next, ip: ctx.ip
  });
  return { id, ...next };
}

async function getScheme(ctx) {
  const subjectId = validate.id(ctx.params.subjectId);
  const subject = await get('SELECT * FROM subjects WHERE id = ?', [subjectId]);
  if (!subject) throw new HttpError(404, 'NOT_FOUND', 'Subject not found.');
  const types = await all('SELECT * FROM assessment_types WHERE active = 1 ORDER BY name');
  const rows = await all('SELECT * FROM subject_schemes WHERE subject_id = ?', [subjectId]);
  const byType = new Map(rows.map((row) => [row.type_id, row]));
  return {
    subject: { id: subject.id, name: subject.name, code: subject.code || '' },
    types: types.map((type) => ({
      id: type.id, name: type.name, isCoursework: Boolean(type.is_coursework)
    })),
    rows: types.map((type) => {
      const row = byType.get(type.id);
      return row ? {
        typeId: type.id, typeName: type.name, weight: Number(row.weight),
        rule: row.rule, ruleN: row.rule_n
      } : null;
    }).filter(Boolean),
    total: rows.reduce((sum, row) => sum + Number(row.weight), 0)
  };
}

async function putScheme(ctx) {
  const subjectId = validate.id(ctx.params.subjectId);
  const subject = await get('SELECT * FROM subjects WHERE id = ?', [subjectId]);
  if (!subject) throw new HttpError(404, 'NOT_FOUND', 'Subject not found.');
  const rawRows = validate.array(ctx.body?.rows, 'Scheme rows', { min: 0, max: 50 });
  const seen = new Set();
  const rows = rawRows.map((raw) => {
    const typeId = validate.id(raw?.typeId, 'Assessment type');
    if (seen.has(typeId)) throw new HttpError(400, 'VALIDATION', 'Each assessment type can appear only once in a scheme.', { rows: 'Duplicate type.' });
    seen.add(typeId);
    const weight = validate.num(raw?.weight, 'Weight', { min: 0, max: 100 });
    const rule = validate.oneOf(raw?.rule || 'average', ['average', 'best_n', 'sum'], 'Rule');
    const ruleN = rule === 'best_n' ? validate.int(raw?.ruleN ?? raw?.rule_n ?? 1, 'Best N', { min: 1, max: 50 }) : null;
    return { typeId, weight, rule, ruleN };
  });
  if (rows.length) {
    const total = rows.reduce((sum, row) => sum + row.weight, 0);
    if (Math.abs(total - 100) > 0.01) {
      throw new HttpError(400, 'VALIDATION', `Scheme weights must total 100 (currently ${validate.num(total, 'Total', { min: 0, max: 1000 })}).`, {
        weightTotal: 'Weights must total 100.'
      });
    }
  }
  const types = await all('SELECT id FROM assessment_types');
  const validTypes = new Set(types.map((row) => row.id));
  for (const row of rows) {
    if (!validTypes.has(row.typeId)) throw new HttpError(400, 'VALIDATION', 'One of the assessment types no longer exists.');
  }

  const before = await all('SELECT type_id, weight, rule, rule_n FROM subject_schemes WHERE subject_id = ?', [subjectId]);
  await transaction(async (tx) => {
    await tx.run('DELETE FROM subject_schemes WHERE subject_id = ?', [subjectId]);
    for (const row of rows) {
      await tx.run(
        `INSERT INTO subject_schemes (id, subject_id, type_id, weight, rule, rule_n)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), subjectId, row.typeId, row.weight, row.rule, row.ruleN]
      );
    }
    const total = rows.reduce((sum, row) => sum + row.weight, 0);
    await tx.run(
      `INSERT INTO audit_log (id, at, user_id, action, entity, entity_id, before_json, after_json, reason, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(), nowIso(), ctx.user.id, 'scheme.update', 'subject', subjectId,
        JSON.stringify(before), JSON.stringify({ rows, total }), null, ctx.ip
      ]
    );
  });
  return { subjectId, rows, total: rows.reduce((sum, row) => sum + row.weight, 0) };
}

module.exports = [
  { method: 'GET', path: 'sections', handler: listSections },
  { method: 'POST', path: 'sections', handler: createSection, hod: true },
  { method: 'PATCH', path: 'sections/:id', handler: updateSection, hod: true },
  { method: 'GET', path: 'subjects', handler: listSubjects },
  { method: 'POST', path: 'subjects', handler: createSubject, hod: true },
  { method: 'PATCH', path: 'subjects/:id', handler: updateSubject, hod: true },
  { method: 'GET', path: 'assessment-types', handler: listTypes },
  { method: 'POST', path: 'assessment-types', handler: createType, hod: true },
  { method: 'PATCH', path: 'assessment-types/:id', handler: updateType, hod: true },
  { method: 'GET', path: 'schemes/:subjectId', handler: getScheme },
  { method: 'PUT', path: 'schemes/:subjectId', handler: putScheme, hod: true }
];
