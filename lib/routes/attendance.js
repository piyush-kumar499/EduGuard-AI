'use strict';

const crypto = require('crypto');
const { all, get, run, transaction } = require('../db');
const { writeAudit } = require('../audit');
const { assertScope, termWritable } = require('../permissions');
const scoring = require('../scoring');
const validate = require('../validate');
const { HttpError } = validate;

async function loadPair(ctx) {
  const scope = await ctx.getScope();
  const subjectId = validate.id(ctx.query.subjectId || ctx.query.subject, 'Subject');
  const sectionId = validate.id(ctx.query.sectionId || ctx.query.section, 'Section');
  assertScope(scope, subjectId, sectionId);
  const [subject, section] = await Promise.all([
    get('SELECT id, name, code FROM subjects WHERE id = ?', [subjectId]),
    get('SELECT id, name, branch, semester FROM sections WHERE id = ?', [sectionId])
  ]);
  if (!subject || !section) throw new HttpError(404, 'NOT_FOUND', 'Subject or section not found.');
  return { scope, subject, section };
}

async function attendanceSummaryRows(termId, subjectId, sectionId, students) {
  const sessions = await all(
    'SELECT * FROM attendance_sessions WHERE term_id = ? AND subject_id = ? AND section_id = ? ORDER BY held_on',
    [termId, subjectId, sectionId]
  );
  const sessionIds = sessions.map((row) => row.id);
  const records = sessionIds.length
    ? await all(`SELECT * FROM attendance_records WHERE session_id IN (${sessionIds.map(() => '?').join(',')})`, sessionIds)
    : [];
  const bySession = new Map();
  for (const row of records) {
    if (!bySession.has(row.session_id)) bySession.set(row.session_id, new Map());
    bySession.get(row.session_id).set(row.student_id, Number(row.present) === 1);
  }
  const running = new Map();
  for (const student of students) {
    const history = sessions.map((session) => ({
      sessionId: session.id,
      heldOn: session.held_on,
      present: Boolean(bySession.get(session.id)?.get(student.id))
    }));
    const summary = scoring.attendanceSummary(history);
    running.set(student.id, {
      percent: summary.percent,
      present: summary.present,
      total: summary.total,
      trend: summary.trend,
      drop: summary.drop
    });
  }
  return { sessions, bySession, running };
}

async function getAttendance(ctx) {
  const { scope, subject, section } = await loadPair(ctx);
  const date = ctx.query.date ? validate.date(ctx.query.date, 'Date') : null;
  const students = await all(
    'SELECT id, roll, name FROM students WHERE section_id = ? AND active = 1 ORDER BY roll',
    [section.id]
  );
  const { sessions, bySession, running } = await attendanceSummaryRows(scope.term.id, subject.id, section.id, students);
  let selected = date ? sessions.find((row) => row.held_on === date) : [...sessions].sort((a, b) => b.held_on.localeCompare(a.held_on))[0] || null;
  const records = selected ? sessionRecordMap(bySession, selected.id, students) : null;
  const ordered = [...sessions].sort((a, b) => a.held_on.localeCompare(b.held_on));
  const beforeDate = selected ? selected.held_on : date;
  const previousSession = beforeDate
    ? ordered.filter((row) => row.held_on < beforeDate).pop() || null
    : null;
  const previousRecords = previousSession ? sessionRecordMap(bySession, previousSession.id, students) : null;

  return {
    term: { id: scope.term.id, name: scope.term.name, archived: Boolean(scope.term.archived) },
    subject: { id: subject.id, name: subject.name, code: subject.code || '' },
    section: { id: section.id, name: section.name, branch: section.branch, semester: section.semester },
    date: selected?.held_on || date || new Date().toISOString().slice(0, 10),
    session: selected ? { id: selected.id, heldOn: selected.held_on, records: students.length } : null,
    dates: [...sessions].reverse().map((row) => row.held_on),
    previous: previousSession && previousRecords
      ? { date: previousSession.held_on, records: Object.fromEntries(previousRecords) }
      : null,
    students: students.map((student) => ({
      id: student.id,
      roll: student.roll,
      name: student.name,
      present: records ? records.get(student.id) : true,
      running: running.get(student.id)
    })),
    canEdit: !Number(scope.term.archived)
  };
}

function sessionRecordMap(bySession, sessionId, students) {
  const map = new Map();
  const recordMap = bySession.get(sessionId) || new Map();
  for (const student of students) {
    map.set(student.id, recordMap.has(student.id) ? recordMap.get(student.id) : true);
  }
  return map;
}

async function saveAttendance(ctx) {
  const scope = await ctx.getScope();
  const subjectId = validate.id(ctx.body?.subjectId, 'Subject');
  const sectionId = validate.id(ctx.body?.sectionId, 'Section');
  assertScope(scope, subjectId, sectionId);
  await termWritable(scope.term.id);
  const heldOn = validate.date(ctx.body?.heldOn, 'Date');
  const records = validate.array(ctx.body?.records, 'Records', { min: 1, max: 500 });
  const students = await all('SELECT id FROM students WHERE section_id = ? AND active = 1', [sectionId]);
  const studentSet = new Set(students.map((row) => row.id));
  const clean = records.map((raw) => {
    const studentId = validate.id(raw?.studentId, 'Student');
    if (!studentSet.has(studentId)) throw new HttpError(400, 'VALIDATION', 'A student is not in this section.');
    return { studentId, present: validate.bool(raw?.present, false) };
  });
  const unique = new Map(clean.map((row) => [row.studentId, row]));
  if (unique.size !== clean.length) throw new HttpError(400, 'VALIDATION', 'Each student can appear only once.');

  const existing = await get(
    'SELECT * FROM attendance_sessions WHERE subject_id = ? AND section_id = ? AND held_on = ?',
    [subjectId, sectionId, heldOn]
  );
  const beforeRecords = existing
    ? await all('SELECT * FROM attendance_records WHERE session_id = ?', [existing.id])
    : [];
  const sessionId = existing?.id || crypto.randomUUID();

  await transaction(async (tx) => {
    if (existing) {
      await tx.run('UPDATE attendance_sessions SET term_id = ?, created_by = ? WHERE id = ?', [scope.term.id, ctx.user.id, sessionId]);
    } else {
      await tx.run(
        'INSERT INTO attendance_sessions (id, term_id, subject_id, section_id, held_on, created_by) VALUES (?, ?, ?, ?, ?, ?)',
        [sessionId, scope.term.id, subjectId, sectionId, heldOn, ctx.user.id]
      );
    }
    for (const row of unique.values()) {
      await tx.run(
        `INSERT INTO attendance_records (session_id, student_id, present) VALUES (?, ?, ?)
         ON CONFLICT(session_id, student_id) DO UPDATE SET present = excluded.present`,
        [sessionId, row.studentId, row.present ? 1 : 0]
      );
    }
    await writeAudit({
      userId: ctx.user.id,
      action: 'attendance.save',
      entity: 'attendance_session',
      entityId: sessionId,
      before: existing ? { heldOn: existing.held_on, records: beforeRecords.length } : null,
      after: {
        subjectId, sectionId, heldOn,
        present: [...unique.values()].filter((row) => row.present).length,
        absent: [...unique.values()].filter((row) => !row.present).length
      },
      ip: ctx.ip
    }, tx);
  });

  const { running } = await attendanceSummaryRows(scope.term.id, subjectId, sectionId, students);
  return {
    sessionId,
    heldOn,
    saved: unique.size,
    running: Object.fromEntries([...running.entries()])
  };
}

module.exports = [
  { method: 'GET', path: 'attendance', handler: getAttendance },
  { method: 'PUT', path: 'attendance', handler: saveAttendance }
];
