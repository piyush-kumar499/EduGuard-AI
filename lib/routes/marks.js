'use strict';

const crypto = require('crypto');
const { all, get, run, transaction } = require('../db');
const { writeAudit } = require('../audit');
const { termWritable } = require('../permissions');
const scoring = require('../scoring');
const validate = require('../validate');
const { HttpError } = validate;
const { scopedAssessment } = require('./assessments');

function assessmentStats(marks, students, assessment) {
  const values = [];
  let entered = 0;
  let absent = 0;
  let exempt = 0;
  for (const student of students) {
    const mark = marks.get(student.id);
    if (!mark) continue;
    entered += 1;
    if (mark.status === 'absent') absent += 1;
    else if (mark.status === 'exempt') exempt += 1;
    const percent = scoring.assessmentPercent(mark.score, assessment.max_marks, mark.status, true);
    if (percent !== null) values.push(percent);
  }
  return {
    entered,
    absent,
    exempt,
    total: students.length,
    average: values.length ? scoring.round(scoring.average(values)) : null,
    highest: values.length ? scoring.round(Math.max(...values)) : null,
    lowest: values.length ? scoring.round(Math.min(...values)) : null
  };
}

function buildMarksPayload(rows) {
  const map = {};
  for (const row of rows) {
    if (!map[row.assessment_id]) map[row.assessment_id] = {};
    map[row.assessment_id][row.student_id] = {
      score: row.score === null ? null : Number(row.score),
      status: row.status,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at
    };
  }
  return map;
}

function studentSubjectPercent(studentId, assessments, marksMap, scheme) {
  const entriesByType = new Map();
  const percents = [];
  for (const assessment of assessments) {
    const mark = marksMap[assessment.id]?.[studentId];
    const percent = scoring.assessmentPercent(mark?.score, assessment.maxMarks, mark ? mark.status : 'missing', true);
    if (percent !== null) percents.push(percent);
    if (!entriesByType.has(assessment.typeId)) entriesByType.set(assessment.typeId, []);
    entriesByType.get(assessment.typeId).push({
      percent,
      score: mark?.score ?? 0,
      max: Number(assessment.maxMarks),
      status: mark ? mark.status : 'missing'
    });
  }
  const typeResults = scheme.map((row) => ({
    typeId: row.typeId,
    value: scoring.applyRule(entriesByType.get(row.typeId) || [], row.rule, row.ruleN)
  }));
  return scoring.subjectMarks({ typeResults, scheme, assessmentPercents: percents });
}

async function getMarksGrid(ctx) {
  const { row: assessment, scope } = await scopedAssessment(ctx, validate.id(ctx.params.id));
  const term = scope.term;

  const [assessmentRows, students, markRows, types] = await Promise.all([
    all(
      `SELECT a.*, t.name AS type_name, t.is_coursework
         FROM assessments a JOIN assessment_types t ON t.id = a.type_id
        WHERE a.term_id = ? AND a.subject_id = ? AND a.section_id = ? AND a.deleted = 0
        ORDER BY a.held_on, a.created_at, a.title`,
      [term.id, assessment.subject_id, assessment.section_id]
    ),
    all(
      `SELECT id, roll, name FROM students
        WHERE section_id = ? AND active = 1 ORDER BY roll`,
      [assessment.section_id]
    ),
    all(
      `SELECT * FROM marks WHERE assessment_id IN (
         SELECT id FROM assessments WHERE term_id = ? AND subject_id = ? AND section_id = ? AND deleted = 0
       )`,
      [term.id, assessment.subject_id, assessment.section_id]
    ),
    all('SELECT * FROM assessment_types WHERE active = 1 ORDER BY name')
  ]);

  const schemeRows = await all(
    `SELECT ss.*, t.name AS type_name FROM subject_schemes ss
       JOIN assessment_types t ON t.id = ss.type_id
      WHERE ss.subject_id = ? ORDER BY ss.weight DESC`,
    [assessment.subject_id]
  );
  const scheme = schemeRows.map((row) => ({
    typeId: row.type_id,
    typeName: row.type_name,
    weight: Number(row.weight),
    rule: row.rule,
    ruleN: row.rule_n
  }));

  const assessments = assessmentRows.map((row) => ({
    id: row.id,
    title: row.title,
    typeId: row.type_id,
    typeName: row.type_name,
    isCoursework: Boolean(row.is_coursework),
    maxMarks: Number(row.max_marks),
    heldOn: row.held_on,
    locked: Boolean(row.locked),
    createdAt: row.created_at
  }));
  const marks = buildMarksPayload(markRows);
  const stats = {};
  for (const item of assessments) {
    const rowsForAssessment = markRows.filter((row) => row.assessment_id === item.id);
    stats[item.id] = assessmentStats(
      new Map(rowsForAssessment.map((row) => [row.student_id, row])),
      students,
      { max_marks: item.maxMarks }
    );
  }
  const rowScores = {};
  for (const student of students) {
    const result = studentSubjectPercent(student.id, assessments, marks, scheme);
    rowScores[student.id] = { value: result.value, method: result.method, coverage: result.coverage };
  }

  const otherMarks = markRows.filter((row) => row.updated_by !== ctx.user.id).length;
  const rawSettings = await require('../analytics').loadRawSettings();
  const normalised = scoring.normaliseSettings(rawSettings);
  return {
    assessment: {
      id: assessment.id,
      title: assessment.title,
      subjectId: assessment.subject_id,
      subjectName: assessment.subject_name,
      sectionId: assessment.section_id,
      sectionName: assessment.section_name,
      typeId: assessment.type_id,
      typeName: assessment.type_name,
      maxMarks: Number(assessment.max_marks),
      heldOn: assessment.held_on,
      locked: Boolean(assessment.locked),
      createdBy: assessment.created_by,
      createdByName: assessment.created_by_name
    },
    term: { id: term.id, name: term.name, archived: Boolean(term.archived) },
    assessments,
    students: students.map((row) => ({ id: row.id, roll: row.roll, name: row.name })),
    marks,
    stats,
    rowScores,
    scheme,
    types: types.map((type) => ({ id: type.id, name: type.name, isCoursework: Boolean(type.is_coursework) })),
    weights: normalised.weights,
    thresholds: normalised.thresholds,
    settings: {
      absentCountsAsZero: normalised.absentCountsAsZero,
      minAssessmentsForTrend: normalised.minAssessmentsForTrend
    },
    currentUserId: ctx.user.id,
    canEdit: scope.role === 'HOD' || !Number(assessment.locked),
    canUnlock: scope.role === 'HOD',
    otherMarks,
    scope: scope.role
  };
}

function normaliseChange(raw, maxMarks, studentSet) {
  const studentId = validate.id(raw?.studentId, 'Student');
  if (!studentSet.has(studentId)) throw new HttpError(400, 'VALIDATION', 'A student is not in this section.');
  const status = validate.oneOf(raw?.status || 'present', ['present', 'absent', 'exempt'], 'Status');
  let score = null;
  if (status === 'present') {
    const rawScore = raw?.score;
    if (rawScore !== null && rawScore !== undefined && rawScore !== '') {
      score = validate.num(rawScore, 'Score', { min: 0, max: maxMarks });
    }
  }
  return { studentId, status, score };
}

function sameMark(old, next) {
  if (!old) return next.status === 'present' && next.score === null;
  if (next.status === 'present' && next.score === null) return false; // clear
  return old.status === next.status && Number(old.score) === Number(next.score) && old.score !== null;
}

async function applyChanges(ctx, assessment, changes, reason) {
  const term = await termWritable(assessment.term_id);
  const locked = Number(assessment.locked) === 1;
  if (locked && ctx.user.role !== 'HOD') {
    throw new HttpError(403, 'LOCKED', 'This assessment is finalised. Ask the HOD to unlock it.');
  }
  const students = await all('SELECT id FROM students WHERE section_id = ? AND active = 1', [assessment.section_id]);
  const studentSet = new Set(students.map((row) => row.id));
  const ops = changes.map((raw) => normaliseChange(raw, Number(assessment.max_marks), studentSet));
  const existingRows = await all('SELECT * FROM marks WHERE assessment_id = ?', [assessment.id]);
  const existing = new Map(existingRows.map((row) => [row.student_id, row]));
  const changed = ops
    .map((op) => ({ ...op, old: existing.get(op.studentId) || null }))
    .filter((op) => !sameMark(op.old, op));

  if (!changed.length) return { saved: 0, batchId: null, changed: [] };

  const requiresReason = ctx.user.role === 'HOD' && changed.some((op) => {
    if (locked) return true;
    return op.old && op.old.updated_by !== ctx.user.id;
  });
  if (requiresReason && !reason) {
    throw new HttpError(403, 'REASON_REQUIRED', 'A reason is required when editing a locked assessment or a mark entered by someone else.', {
      reason: 'Give a short reason. It is stored in the audit log.'
    });
  }

  const batchId = crypto.randomUUID();
  const at = new Date().toISOString();
  await transaction(async (tx) => {
    for (const op of changed) {
      const clearing = op.status === 'present' && op.score === null;
      if (clearing) {
        if (op.old) await tx.run('DELETE FROM marks WHERE assessment_id = ? AND student_id = ?', [assessment.id, op.studentId]);
      } else {
        await tx.run(
          `INSERT INTO marks (assessment_id, student_id, score, status, updated_by, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(assessment_id, student_id)
           DO UPDATE SET score = excluded.score, status = excluded.status, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
          [assessment.id, op.studentId, op.score, op.status, ctx.user.id, at]
        );
      }
      await writeAudit({
        userId: ctx.user.id,
        action: 'marks.save',
        entity: 'mark',
        entityId: `${assessment.id}:${op.studentId}`,
        before: op.old ? { score: op.old.score === null ? null : Number(op.old.score), status: op.old.status, updatedBy: op.old.updated_by } : null,
        after: { score: op.score, status: op.status, clearing, batchId },
        reason: reason || null,
        ip: ctx.ip
      }, tx);
    }
  });

  return {
    saved: changed.length,
    batchId,
    changed: changed.map((op) => ({
      studentId: op.studentId,
      score: op.score,
      status: op.status,
      cleared: op.status === 'present' && op.score === null
    })),
    term: { id: term.id, name: term.name }
  };
}

async function saveMarks(ctx) {
  const { row: assessment } = await scopedAssessment(ctx, validate.id(ctx.params.id));
  const changes = validate.array(ctx.body?.changes, 'Changes', { min: 1, max: 5000 });
  const reason = ctx.body?.reason ? validate.str(ctx.body.reason, 'Reason', { min: 4, max: 500 }) : null;
  return applyChanges(ctx, assessment, changes, reason);
}

function parseStatus(raw) {
  const text = String(raw ?? '').trim().toLowerCase();
  if (['a', 'abs', 'absent'].includes(text)) return 'absent';
  if (['e', 'ex', 'exempt'].includes(text)) return 'exempt';
  return 'present';
}

async function importMarks(ctx) {
  const { row: assessment } = await scopedAssessment(ctx, validate.id(ctx.params.id));
  await termWritable(assessment.term_id);
  if (Number(assessment.locked) === 1 && ctx.user.role !== 'HOD') {
    throw new HttpError(403, 'LOCKED', 'This assessment is finalised. Ask the HOD to unlock it.');
  }
  const rows = validate.array(ctx.body?.rows, 'Rows', { min: 1, max: 5000 });
  const dryRun = validate.bool(ctx.body?.dryRun, false);
  const students = await all('SELECT id, roll, name FROM students WHERE section_id = ? AND active = 1', [assessment.section_id]);
  const byRoll = new Map(students.map((row) => [String(row.roll).toUpperCase(), row]));
  const maxMarks = Number(assessment.max_marks);

  const preview = [];
  const errors = [];
  const changes = [];
  const seen = new Set();
  rows.forEach((raw, index) => {
    const line = index + 2;
    const roll = String(raw?.roll ?? '').trim().toUpperCase();
    const student = byRoll.get(roll);
    const status = parseStatus(raw?.status ?? raw?.mark);
    let score = null;
    let message = '';
    if (!student) {
      message = `Roll ${roll || '(blank)'} is not in this section.`;
      errors.push({ row: line, roll, message, type: 'unmatched' });
      preview.push({ row: line, roll, name: raw?.name || '', status, score: null, message, type: 'unmatched' });
      return;
    }
    if (seen.has(student.id)) {
      message = `Roll ${roll} appears twice.`;
      errors.push({ row: line, roll, message, type: 'duplicate' });
      preview.push({ row: line, roll, name: student.name, status, score: null, message, type: 'duplicate' });
      return;
    }
    seen.add(student.id);
    if (status === 'present') {
      const rawScore = raw?.score;
      if (rawScore !== null && rawScore !== undefined && String(rawScore).trim() !== '') {
        const parsed = Number(String(rawScore).replace('%', '').trim());
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > maxMarks) {
          message = `Score must be between 0 and ${maxMarks}.`;
          errors.push({ row: line, roll, message, type: 'range' });
          preview.push({ row: line, roll, name: student.name, status, score: parsed, message, type: 'range' });
          return;
        }
        score = parsed;
      }
    }
    changes.push({ studentId: student.id, score, status });
    preview.push({
      row: line, roll, name: student.name, status, score,
      message: status === 'present' && score === null ? 'Will clear this mark.' : 'Ready',
      type: 'ok'
    });
  });

  if (dryRun) {
    return {
      dryRun: true,
      matched: changes.length,
      unmatched: errors.filter((error) => error.type === 'unmatched').length,
      outOfRange: errors.filter((error) => error.type === 'range').length,
      duplicates: errors.filter((error) => error.type === 'duplicate').length,
      preview: preview.slice(0, 500),
      errors: errors.slice(0, 200)
    };
  }
  if (!changes.length) {
    throw new HttpError(400, 'VALIDATION', 'No valid rows to import.', { rows: errors[0]?.message || 'No valid rows.' });
  }
  const reason = ctx.body?.reason ? validate.str(ctx.body.reason, 'Reason', { min: 4, max: 500 }) : null;
  const result = await applyChanges(ctx, assessment, changes, reason);
  return { ...result, preview: preview.slice(0, 500), errors: errors.slice(0, 200) };
}

async function undoMarks(ctx) {
  const { row: assessment } = await scopedAssessment(ctx, validate.id(ctx.params.id));
  await termWritable(assessment.term_id);
  if (Number(assessment.locked) === 1 && ctx.user.role !== 'HOD') {
    throw new HttpError(403, 'LOCKED', 'This assessment is finalised.');
  }
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const rows = await all(
    `SELECT * FROM audit_log
      WHERE action = 'marks.save' AND entity = 'mark' AND entity_id LIKE ? AND user_id = ? AND at >= ?
      ORDER BY at DESC LIMIT 500`,
    [`${assessment.id}:%`, ctx.user.id, since]
  );
  if (!rows.length) throw new HttpError(400, 'NOTHING_TO_UNDO', 'There is no recent save to undo.');
  let batchId = null;
  for (const row of rows) {
    try {
      const after = JSON.parse(row.after_json || '{}');
      if (after.batchId) { batchId = after.batchId; break; }
    } catch { /* ignore malformed audit rows */ }
  }
  if (!batchId) throw new HttpError(400, 'NOTHING_TO_UNDO', 'There is no recent save to undo.');
  const batch = [];
  for (const row of rows) {
    try {
      const after = JSON.parse(row.after_json || '{}');
      if (after.batchId === batchId) batch.push(row);
    } catch { /* ignore */ }
  }
  await transaction(async (tx) => {
    for (const row of batch) {
      const [, studentId] = row.entity_id.split(':');
      const before = row.before_json ? JSON.parse(row.before_json) : null;
      if (!before) {
        await tx.run('DELETE FROM marks WHERE assessment_id = ? AND student_id = ?', [assessment.id, studentId]);
      } else {
        await tx.run(
          `INSERT INTO marks (assessment_id, student_id, score, status, updated_by, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(assessment_id, student_id)
           DO UPDATE SET score = excluded.score, status = excluded.status, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
          [assessment.id, studentId, before.score, before.status, ctx.user.id, new Date().toISOString()]
        );
      }
    }
    await writeAudit({
      userId: ctx.user.id,
      action: 'marks.undo',
      entity: 'assessment',
      entityId: assessment.id,
      before: { batchId, marks: batch.length },
      after: { restored: batch.length },
      ip: ctx.ip
    }, tx);
  });
  return { restored: batch.length, batchId };
}

module.exports = [
  { method: 'GET', path: 'assessments/:id/marks', handler: getMarksGrid },
  { method: 'PUT', path: 'assessments/:id/marks', handler: saveMarks },
  { method: 'POST', path: 'assessments/:id/marks/import', handler: importMarks },
  { method: 'POST', path: 'assessments/:id/marks/undo', handler: undoMarks }
];
