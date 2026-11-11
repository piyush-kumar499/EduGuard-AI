'use strict';

const crypto = require('crypto');
const { all, get, run } = require('../db');
const { writeAudit } = require('../audit');
const { assertSection, assertScope } = require('../permissions');
const validate = require('../validate');
const { HttpError } = validate;

async function scopedStudent(ctx, id) {
  const scope = await ctx.getScope();
  const student = await get(
    `SELECT st.*, sec.name AS section_name FROM students st
       JOIN sections sec ON sec.id = st.section_id WHERE st.id = ?`,
    [id]
  );
  if (!student) throw new HttpError(404, 'NOT_FOUND', 'Student not found.');
  assertSection(scope, student.section_id);
  return { scope, student };
}

async function listActions(ctx) {
  const { student } = await scopedStudent(ctx, validate.id(ctx.params.id));
  const rows = ctx.user.role === 'HOD'
    ? await all(
      `SELECT ai.*, u.name AS user_name FROM action_items ai
         LEFT JOIN users u ON u.id = ai.user_id
        WHERE ai.student_id = ? ORDER BY ai.updated_at DESC`,
      [student.id]
    )
    : await all(
      'SELECT * FROM action_items WHERE student_id = ? AND user_id = ? ORDER BY updated_at DESC',
      [student.id, ctx.user.id]
    );
  return {
    studentId: student.id,
    items: rows.map((row) => ({
      id: row.id,
      subjectId: row.subject_id,
      actionKey: row.action_key,
      done: Boolean(row.done),
      note: row.note || '',
      userId: row.user_id,
      userName: row.user_name || null,
      updatedAt: row.updated_at
    }))
  };
}

async function putAction(ctx) {
  const { scope, student } = await scopedStudent(ctx, validate.id(ctx.params.id));
  const actionKey = validate.str(ctx.body?.actionKey, 'Action', { min: 1, max: 80 });
  const subjectId = ctx.body?.subjectId ? validate.id(ctx.body.subjectId, 'Subject') : null;
  if (subjectId && scope.role !== 'HOD') assertScope(scope, subjectId, student.section_id);
  const done = validate.bool(ctx.body?.done, false);
  const note = ctx.body?.note === undefined ? null : validate.str(ctx.body.note, 'Note', { min: 0, max: 1000, required: false });
  const existing = await get(
    'SELECT * FROM action_items WHERE student_id = ? AND subject_id IS ? AND action_key = ? AND user_id = ?',
    [student.id, subjectId, actionKey, ctx.user.id]
  );
  const id = existing?.id || crypto.randomUUID();
  const now = new Date().toISOString();
  if (existing) {
    await run(
      'UPDATE action_items SET done = ?, note = ?, updated_at = ? WHERE id = ?',
      [done ? 1 : 0, note, now, id]
    );
  } else {
    await run(
      `INSERT INTO action_items (id, student_id, subject_id, action_key, done, note, user_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, student.id, subjectId, actionKey, done ? 1 : 0, note, ctx.user.id, now]
    );
  }
  return {
    id,
    studentId: student.id,
    subjectId,
    actionKey,
    done,
    note: note || '',
    userId: ctx.user.id,
    updatedAt: now
  };
}

async function listMentors(ctx) {
  const { student } = await scopedStudent(ctx, validate.id(ctx.params.id));
  const rows = await all(
    `SELECT ma.*, m.name AS mentor_name, m.roll AS mentor_roll, s.name AS subject_name, u.name AS assigned_by_name
       FROM mentor_assignments ma
       LEFT JOIN students m ON m.id = ma.mentor_id
       LEFT JOIN subjects s ON s.id = ma.subject_id
       LEFT JOIN users u ON u.id = ma.assigned_by
      WHERE ma.student_id = ?`,
    [student.id]
  );
  return {
    studentId: student.id,
    mentors: rows.map((row) => ({
      mentorId: row.mentor_id,
      mentorName: row.mentor_name,
      mentorRoll: row.mentor_roll,
      subjectId: row.subject_id,
      subjectName: row.subject_name,
      assignedBy: row.assigned_by,
      assignedByName: row.assigned_by_name
    }))
  };
}

async function putMentor(ctx) {
  const { scope, student } = await scopedStudent(ctx, validate.id(ctx.params.id));
  const mentorId = validate.id(ctx.body?.mentorId, 'Mentor');
  const subjectId = ctx.body?.subjectId ? validate.id(ctx.body.subjectId, 'Subject') : null;
  const assigned = validate.bool(ctx.body?.assigned, true);
  if (mentorId === student.id) throw new HttpError(400, 'VALIDATION', 'A student cannot mentor themselves.');
  const mentor = await get('SELECT * FROM students WHERE id = ? AND active = 1', [mentorId]);
  if (!mentor) throw new HttpError(404, 'NOT_FOUND', 'Mentor not found.');
  if (mentor.section_id !== student.section_id) {
    throw new HttpError(400, 'VALIDATION', 'Mentor must be in the same section.');
  }
  if (subjectId && scope.role !== 'HOD') assertScope(scope, subjectId, student.section_id);

  if (!assigned) {
    await run(
      'DELETE FROM mentor_assignments WHERE student_id = ? AND mentor_id = ? AND subject_id IS ?',
      [student.id, mentorId, subjectId]
    );
    await writeAudit({
      userId: ctx.user.id, action: 'mentor.unassign', entity: 'mentor_assignment',
      entityId: `${student.id}:${mentorId}`, before: { subjectId }, ip: ctx.ip
    });
    return { assigned: false };
  }

  await run(
    `INSERT INTO mentor_assignments (student_id, mentor_id, subject_id, assigned_by)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(student_id, mentor_id, subject_id) DO UPDATE SET assigned_by = excluded.assigned_by`,
    [student.id, mentorId, subjectId, ctx.user.id]
  );
  await writeAudit({
    userId: ctx.user.id, action: 'mentor.assign', entity: 'mentor_assignment',
    entityId: `${student.id}:${mentorId}`, after: { subjectId, mentorId }, ip: ctx.ip
  });
  return { assigned: true, mentorId, subjectId };
}

module.exports = [
  { method: 'GET', path: 'students/:id/actions', handler: listActions },
  { method: 'PUT', path: 'students/:id/actions', handler: putAction },
  { method: 'GET', path: 'students/:id/mentors', handler: listMentors },
  { method: 'PUT', path: 'students/:id/mentors', handler: putMentor }
];
