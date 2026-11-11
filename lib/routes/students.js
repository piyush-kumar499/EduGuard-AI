'use strict';

const crypto = require('crypto');
const { all, get, run, transaction } = require('../db');
const { writeAudit } = require('../audit');
const { activeTerm, assertSection, assertScope } = require('../permissions');
const analytics = require('../analytics');
const validate = require('../validate');
const { HttpError } = validate;

async function listStudents(ctx) {
  const scope = await ctx.getScope();
  const sectionId = ctx.query.sectionId || ctx.query.section || null;
  const subjectId = ctx.query.subjectId || ctx.query.subject || null;
  if (sectionId) assertSection(scope, sectionId);
  if (subjectId) {
    const { assertSubject } = require('../permissions');
    assertSubject(scope, subjectId);
  }
  const pagination = validate.pagination(ctx.query);
  const sort = ctx.query.sort || 'priority';
  const direction = ctx.query.direction === 'desc' ? 'desc' : 'asc';
  const band = ctx.query.band && ['high', 'medium', 'low', 'nodata'].includes(ctx.query.band) ? ctx.query.band : null;
  const search = validate.str(ctx.query.q || '', 'Search', { min: 0, max: 120, required: false });

  const context = await analytics.loadContext(scope);
  const result = await analytics.studentsView(context, {
    sectionId, subjectId, band, search, sort, direction,
    limit: pagination.limit, offset: pagination.offset
  });
  return {
    ...result,
    term: { id: context.term.id, name: context.term.name },
    sections: scope.sections.map((section) => ({ id: section.id, name: section.name, branch: section.branch, semester: section.semester })),
    subjects: scope.subjects.map((subject) => ({ id: subject.id, name: subject.name }))
  };
}

async function createStudent(ctx) {
  const name = validate.str(ctx.body?.name, 'Student name', { min: 2, max: 100 });
  const roll = validate.str(ctx.body?.roll, 'Roll number', { min: 1, max: 30 }).toUpperCase();
  const sectionId = validate.id(ctx.body?.sectionId, 'Section');
  const section = await get('SELECT * FROM sections WHERE id = ? AND active = 1', [sectionId]);
  if (!section) throw new HttpError(400, 'VALIDATION', 'Choose an active section.');
  const clash = await get('SELECT id FROM students WHERE roll = ? COLLATE NOCASE', [roll]);
  if (clash) throw new HttpError(409, 'DUPLICATE_ROLL', 'That roll number already exists.');

  const id = crypto.randomUUID();
  await run(
    'INSERT INTO students (id, roll, name, section_id, active, is_demo, created_at) VALUES (?, ?, ?, ?, 1, 0, ?)',
    [id, roll, name, sectionId, new Date().toISOString()]
  );
  await writeAudit({
    userId: ctx.user.id, action: 'student.create', entity: 'student', entityId: id,
    after: { name, roll, sectionId }, ip: ctx.ip
  });
  return { id, name, roll, sectionId, sectionName: section.name, active: true };
}

async function updateStudent(ctx) {
  const id = validate.id(ctx.params.id);
  const target = await get('SELECT * FROM students WHERE id = ?', [id]);
  if (!target) throw new HttpError(404, 'NOT_FOUND', 'Student not found.');
  const next = {
    name: validate.has(ctx.body, 'name') ? validate.str(ctx.body.name, 'Student name', { min: 2, max: 100 }) : target.name,
    roll: validate.has(ctx.body, 'roll') ? validate.str(ctx.body.roll, 'Roll number', { min: 1, max: 30 }).toUpperCase() : target.roll,
    sectionId: validate.has(ctx.body, 'sectionId') ? validate.id(ctx.body.sectionId, 'Section') : target.section_id,
    active: validate.has(ctx.body, 'active') ? validate.bool(ctx.body.active, Boolean(target.active)) : Boolean(target.active)
  };
  if (next.sectionId !== target.section_id) {
    const section = await get('SELECT * FROM sections WHERE id = ?', [next.sectionId]);
    if (!section) throw new HttpError(400, 'VALIDATION', 'Section not found.');
  }
  const clash = await get('SELECT id FROM students WHERE roll = ? COLLATE NOCASE AND id <> ?', [next.roll, id]);
  if (clash) throw new HttpError(409, 'DUPLICATE_ROLL', 'Another student already uses that roll number.');
  await run(
    'UPDATE students SET name = ?, roll = ?, section_id = ?, active = ? WHERE id = ?',
    [next.name, next.roll, next.sectionId, next.active ? 1 : 0, id]
  );
  await writeAudit({
    userId: ctx.user.id, action: 'student.update', entity: 'student', entityId: id,
    before: { name: target.name, roll: target.roll, sectionId: target.section_id, active: Boolean(target.active) },
    after: next, ip: ctx.ip
  });
  return { id, ...next };
}

async function importStudents(ctx) {
  const sectionId = validate.id(ctx.body?.sectionId, 'Section');
  const section = await get('SELECT * FROM sections WHERE id = ? AND active = 1', [sectionId]);
  if (!section) throw new HttpError(400, 'VALIDATION', 'Choose an active section.');
  const rows = validate.array(ctx.body?.rows, 'Rows', { min: 1, max: 1000 });
  const dryRun = validate.bool(ctx.body?.dryRun, false);

  const existing = new Set((await all('SELECT roll FROM students')).map((row) => String(row.roll).toUpperCase()));
  const seen = new Set();
  const errors = [];
  const valid = [];
  rows.forEach((raw, index) => {
    const line = index + 2;
    let name;
    let roll;
    try {
      name = validate.str(raw?.name, 'Name', { min: 2, max: 100 });
      roll = validate.str(raw?.roll, 'Roll', { min: 1, max: 30 }).toUpperCase();
    } catch (error) {
      errors.push({ row: line, message: error.message });
      return;
    }
    if (existing.has(roll)) { errors.push({ row: line, message: `Roll ${roll} already exists.` }); return; }
    if (seen.has(roll)) { errors.push({ row: line, message: `Roll ${roll} appears twice in the file.` }); return; }
    seen.add(roll);
    valid.push({ name, roll });
  });

  if (dryRun) {
    return {
      dryRun: true,
      section: { id: section.id, name: section.name },
      matched: valid.length,
      unmatched: errors.length,
      valid: valid.slice(0, 200),
      errors: errors.slice(0, 100)
    };
  }
  if (!valid.length) throw new HttpError(400, 'VALIDATION', 'No valid rows to import.', { rows: errors[0]?.message || 'No valid rows.' });

  await transaction(async (tx) => {
    for (const row of valid) {
      await tx.run(
        'INSERT INTO students (id, roll, name, section_id, active, is_demo, created_at) VALUES (?, ?, ?, ?, 1, 0, ?)',
        [crypto.randomUUID(), row.roll, row.name, sectionId, new Date().toISOString()]
      );
    }
    await tx.run(
      `INSERT INTO audit_log (id, at, user_id, action, entity, entity_id, before_json, after_json, reason, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), new Date().toISOString(), ctx.user.id, 'student.import', 'section', sectionId,
        null, JSON.stringify({ inserted: valid.length, rejected: errors.length, rolls: valid.map((row) => row.roll) }), null, ctx.ip]
    );
  });
  return { inserted: valid.length, rejected: errors.length, errors: errors.slice(0, 100) };
}

async function actionItemsFor(ctx, studentId) {
  if (ctx.user.role === 'HOD') {
    return all(
      `SELECT ai.*, u.name AS user_name FROM action_items ai
         LEFT JOIN users u ON u.id = ai.user_id
        WHERE ai.student_id = ? ORDER BY ai.updated_at DESC`,
      [studentId]
    );
  }
  return all(
    `SELECT ai.* FROM action_items ai WHERE ai.student_id = ? AND ai.user_id = ? ORDER BY ai.updated_at DESC`,
    [studentId, ctx.user.id]
  );
}

async function mentorAssignmentsFor(studentId) {
  return all(
    `SELECT ma.*, m.name AS mentor_name, m.roll AS mentor_roll,
            s.name AS subject_name, u.name AS assigned_by_name
       FROM mentor_assignments ma
       LEFT JOIN students m ON m.id = ma.mentor_id
       LEFT JOIN subjects s ON s.id = ma.subject_id
       LEFT JOIN users u ON u.id = ma.assigned_by
      WHERE ma.student_id = ?`,
    [studentId]
  ).then((rows) => rows.map((row) => ({
    studentId: row.student_id,
    mentorId: row.mentor_id,
    mentorName: row.mentor_name || null,
    mentorRoll: row.mentor_roll || null,
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    assignedBy: row.assigned_by,
    assignedByName: row.assigned_by_name
  })));
}

async function getStudent(ctx) {
  const id = validate.id(ctx.params.id);
  const scope = await ctx.getScope();
  const student = await get(
    `SELECT st.*, sec.name AS section_name, sec.branch, sec.semester
       FROM students st JOIN sections sec ON sec.id = st.section_id
      WHERE st.id = ?`,
    [id]
  );
  if (!student) throw new HttpError(404, 'NOT_FOUND', 'Student not found.');
  assertSection(scope, student.section_id);

  const context = await analytics.loadContext(scope);
  const analysis = analytics.analyseStudent(context, student);
  const mentors = analytics.mentorMatches(context, student, analysis);
  const actions = await actionItemsFor(ctx, student.id);
  const assigned = await mentorAssignmentsFor(student.id);

  // Faculty must not learn about subjects outside their assignments. The
  // analysis already only contains scoped subjects; this extra assertion
  // documents the invariant for future changes.
  if (scope.role !== 'HOD') {
    for (const subject of analysis.signals.subjects) assertScope(scope, subject.id, student.section_id);
  }

  return {
    analysis,
    mentors,
    actionItems: actions.map((row) => ({
      id: row.id,
      subjectId: row.subject_id,
      actionKey: row.action_key,
      done: Boolean(row.done),
      note: row.note || '',
      userId: row.user_id,
      userName: row.user_name || null,
      updatedAt: row.updated_at
    })),
    mentorAssignments: assigned
  };
}

module.exports = [
  { method: 'GET', path: 'students', handler: listStudents },
  { method: 'POST', path: 'students', handler: createStudent, hod: true },
  { method: 'POST', path: 'students/import', handler: importStudents, hod: true },
  { method: 'GET', path: 'students/:id', handler: getStudent },
  { method: 'PATCH', path: 'students/:id', handler: updateStudent, hod: true }
];
