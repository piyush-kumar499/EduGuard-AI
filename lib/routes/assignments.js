'use strict';

const { all, get, run, transaction } = require('../db');
const { writeAudit } = require('../audit');
const { activeTerm, allActiveAssignments, buildScope, scopePayload } = require('../permissions');
const validate = require('../validate');
const { HttpError } = validate;

async function listAssignments(ctx) {
  const term = await activeTerm();
  const assignments = await allActiveAssignments(term.id);
  const faculty = await all("SELECT id, name, email, role, active FROM users WHERE active = 1 ORDER BY role, name");

  let rows = assignments;
  if (ctx.user.role !== 'HOD') {
    rows = assignments.filter((row) => row.user_id === ctx.user.id);
  }
  return {
    term: { id: term.id, name: term.name },
    assignments: rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      userName: row.user_name,
      userRole: row.user_role,
      subjectId: row.subject_id,
      subjectName: row.subject_name,
      sectionId: row.section_id,
      sectionName: row.section_name
    })),
    subjects: ctx.user.role === 'HOD'
      ? (await all('SELECT id, name, code FROM subjects WHERE active = 1 ORDER BY name'))
      : (scopePayload(await ctx.getScope()).subjects),
    sections: ctx.user.role === 'HOD'
      ? (await all('SELECT id, name, branch, semester FROM sections WHERE active = 1 ORDER BY branch, semester, name'))
      : (scopePayload(await ctx.getScope()).sections),
    faculty: faculty.map((row) => ({
      id: row.id, name: row.name, email: row.email, role: row.role
    }))
  };
}

async function putAssignments(ctx) {
  const term = await activeTerm();
  const list = validate.array(ctx.body?.assignments, 'Assignments', { min: 0, max: 2000 });

  const subjects = new Map((await all('SELECT id, name, active FROM subjects')).map((row) => [row.id, row]));
  const sections = new Map((await all('SELECT id, name, active FROM sections')).map((row) => [row.id, row]));
  const users = new Map((await all('SELECT id, name, role, active FROM users')).map((row) => [row.id, row]));

  const desired = new Map();
  for (const raw of list) {
    const subjectId = validate.id(raw?.subjectId, 'Subject');
    const sectionId = validate.id(raw?.sectionId, 'Section');
    const userId = raw?.userId === null || raw?.userId === '' || raw?.userId === undefined ? null : validate.id(raw.userId, 'Faculty');
    if (!subjects.get(subjectId) || Number(subjects.get(subjectId).active) !== 1) {
      throw new HttpError(400, 'VALIDATION', 'One of the selected subjects is not active.');
    }
    if (!sections.get(sectionId) || Number(sections.get(sectionId).active) !== 1) {
      throw new HttpError(400, 'VALIDATION', 'One of the selected sections is not active.');
    }
    if (userId) {
      const user = users.get(userId);
      if (!user || Number(user.active) !== 1) throw new HttpError(400, 'VALIDATION', 'Selected faculty member is not active.');
    }
    desired.set(`${subjectId}:${sectionId}`, { subjectId, sectionId, userId });
  }

  const before = await allActiveAssignments(term.id);
  const beforeMap = new Map(before.map((row) => [`${row.subject_id}:${row.section_id}`, row]));
  const changes = [];
  await transaction(async (tx) => {
    for (const [key, cell] of desired) {
      const previous = beforeMap.get(key);
      if (!cell.userId) {
        if (previous) {
          await tx.run('DELETE FROM teaching_assignments WHERE id = ?', [previous.id]);
          changes.push({ pair: key, from: previous.user_name, to: null });
          await tx.run(
            `INSERT INTO audit_log (id, at, user_id, action, entity, entity_id, before_json, after_json, reason, ip)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [require('crypto').randomUUID(), new Date().toISOString(), ctx.user.id, 'assignment.remove', 'teaching_assignment', previous.id,
              JSON.stringify({ userId: previous.user_id, subjectId: previous.subject_id, sectionId: previous.section_id }), null, null, ctx.ip]
          );
        }
        continue;
      }
      if (previous && previous.user_id === cell.userId) continue;
      const id = previous?.id || require('crypto').randomUUID();
      if (previous) {
        await tx.run('UPDATE teaching_assignments SET user_id = ? WHERE id = ?', [cell.userId, id]);
      } else {
        await tx.run(
          'INSERT INTO teaching_assignments (id, term_id, user_id, subject_id, section_id) VALUES (?, ?, ?, ?, ?)',
          [id, term.id, cell.userId, cell.subjectId, cell.sectionId]
        );
      }
      changes.push({
        pair: key,
        subject: subjects.get(cell.subjectId).name,
        section: sections.get(cell.sectionId).name,
        from: previous ? previous.user_name : null,
        to: users.get(cell.userId).name
      });
      await tx.run(
        `INSERT INTO audit_log (id, at, user_id, action, entity, entity_id, before_json, after_json, reason, ip)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [require('crypto').randomUUID(), new Date().toISOString(), ctx.user.id, previous ? 'assignment.update' : 'assignment.create', 'teaching_assignment', id,
          previous ? JSON.stringify({ userId: previous.user_id }) : null,
          JSON.stringify({ userId: cell.userId, subjectId: cell.subjectId, sectionId: cell.sectionId }), null, ctx.ip]
      );
    }
  });

  if (!changes.length) await writeAudit({
    userId: ctx.user.id, action: 'assignment.noop', entity: 'teaching_assignment', ip: ctx.ip
  });

  return {
    saved: changes.length,
    changes,
    reassigned: changes.filter((change) => change.from && change.to),
    term: { id: term.id, name: term.name }
  };
}

module.exports = [
  { method: 'GET', path: 'assignments', handler: listAssignments },
  { method: 'PUT', path: 'assignments', handler: putAssignments, hod: true }
];
