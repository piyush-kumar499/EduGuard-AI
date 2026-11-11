'use strict';

const { all, get } = require('../db');
const { RAW } = require('../router');
const { assertScope, assertSection } = require('../permissions');
const analytics = require('../analytics');
const scoring = require('../scoring');
const validate = require('../validate');
const { HttpError } = validate;

async function studentReport(ctx) {
  const scope = await ctx.getScope();
  const student = await get(
    `SELECT st.*, sec.name AS section_name FROM students st
       JOIN sections sec ON sec.id = st.section_id WHERE st.id = ?`,
    [validate.id(ctx.params.id)]
  );
  if (!student) throw new HttpError(404, 'NOT_FOUND', 'Student not found.');
  assertSection(scope, student.section_id);
  const context = await analytics.loadContext(scope);
  const analysis = analytics.analyseStudent(context, student);
  const mentors = analytics.mentorMatches(context, student, analysis);
  return {
    term: { id: context.term.id, name: context.term.name },
    analysis,
    mentors,
    generatedAt: new Date().toISOString()
  };
}

async function classReport(ctx) {
  const scope = await ctx.getScope();
  const subjectId = validate.id(ctx.query.subjectId || ctx.query.subject, 'Subject');
  const sectionId = validate.id(ctx.query.sectionId || ctx.query.section, 'Section');
  assertScope(scope, subjectId, sectionId);
  const [subject, section, students, assessments, typeRows, schemeRows] = await Promise.all([
    get('SELECT * FROM subjects WHERE id = ?', [subjectId]),
    get('SELECT * FROM sections WHERE id = ?', [sectionId]),
    all('SELECT id, roll, name FROM students WHERE section_id = ? AND active = 1 ORDER BY roll', [sectionId]),
    all(
      `SELECT a.*, t.name AS type_name FROM assessments a JOIN assessment_types t ON t.id = a.type_id
        WHERE a.term_id = ? AND a.subject_id = ? AND a.section_id = ? AND a.deleted = 0
        ORDER BY a.held_on, a.created_at`,
      [scope.term.id, subjectId, sectionId]
    ),
    all('SELECT * FROM assessment_types'),
    all('SELECT * FROM subject_schemes WHERE subject_id = ?', [subjectId])
  ]);
  if (!subject || !section) throw new HttpError(404, 'NOT_FOUND', 'Subject or section not found.');
  const types = new Map(typeRows.map((row) => [row.id, row]));
  const assessmentIds = assessments.map((row) => row.id);
  const markRows = assessmentIds.length
    ? await all(`SELECT * FROM marks WHERE assessment_id IN (${assessmentIds.map(() => '?').join(',')})`, assessmentIds)
    : [];
  const marks = {};
  for (const row of markRows) {
    if (!marks[row.assessment_id]) marks[row.assessment_id] = {};
    marks[row.assessment_id][row.student_id] = {
      score: row.score === null ? null : Number(row.score),
      status: row.status
    };
  }
  const scheme = schemeRows.map((row) => ({
    typeId: row.type_id, weight: Number(row.weight), rule: row.rule, ruleN: row.rule_n
  }));
  const shapeAssessments = assessments.map((row) => ({
    id: row.id, title: row.title, typeId: row.type_id, typeName: row.type_name,
    isCoursework: Boolean(types.get(row.type_id)?.is_coursework),
    maxMarks: Number(row.max_marks), heldOn: row.held_on, locked: Boolean(row.locked)
  }));

  const rows = students.map((student) => {
    const percents = [];
    const entriesByType = new Map();
    const cells = {};
    for (const assessment of shapeAssessments) {
      const mark = marks[assessment.id]?.[student.id];
      const percent = scoring.assessmentPercent(mark?.score, assessment.maxMarks, mark ? mark.status : 'missing', true);
      if (percent !== null) percents.push(percent);
      if (!entriesByType.has(assessment.typeId)) entriesByType.set(assessment.typeId, []);
      entriesByType.get(assessment.typeId).push({
        percent, score: mark?.score ?? 0, max: assessment.maxMarks, status: mark ? mark.status : 'missing'
      });
      cells[assessment.id] = {
        score: mark?.score ?? null,
        status: mark ? mark.status : 'missing',
        percent
      };
    }
    const typeResults = scheme.map((row) => ({
      typeId: row.typeId,
      value: scoring.applyRule(entriesByType.get(row.typeId) || [], row.rule, row.ruleN)
    }));
    const result = scoring.subjectMarks({ typeResults, scheme, assessmentPercents: percents });
    return {
      id: student.id,
      roll: student.roll,
      name: student.name,
      cells,
      percent: result.value,
      entered: shapeAssessments.filter((assessment) => cells[assessment.id].status !== 'missing').length
    };
  });

  const values = rows.map((row) => row.percent).filter((value) => value !== null);
  return {
    term: { id: scope.term.id, name: scope.term.name },
    subject: { id: subject.id, name: subject.name, code: subject.code || '' },
    section: { id: section.id, name: section.name, branch: section.branch, semester: section.semester },
    assessments: shapeAssessments,
    students: rows,
    stats: {
      students: rows.length,
      entered: rows.reduce((sum, row) => sum + row.entered, 0),
      possible: rows.length * shapeAssessments.length,
      average: values.length ? scoring.round(scoring.average(values)) : null,
      passRate: values.length ? scoring.round((values.filter((value) => value >= 40).length / values.length) * 100) : null
    },
    generatedAt: new Date().toISOString()
  };
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function atRiskCsv(ctx) {
  const scope = await ctx.getScope();
  const sectionId = ctx.query.sectionId || ctx.query.section || null;
  const subjectId = ctx.query.subjectId || ctx.query.subject || null;
  if (sectionId) assertSection(scope, sectionId);
  const context = await analytics.loadContext(scope);
  let analyses = analytics.analyseAll(context);
  analyses = analytics.filterAnalyses(analyses, { sectionId, subjectId, band: null });
  const rows = analyses
    .filter((row) => row.hasData && row.level !== 'low')
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    .map((row) => [
      row.student.roll, row.student.name, row.student.sectionName,
      row.signals.attendance, row.signals.coursework, row.signals.marks,
      row.level, scoring.LEVELS[row.level].label, row.score, row.forecast.percent,
      row.factors[0]?.title || '', row.actions[0]?.title || ''
    ]);
  const header = ['Roll', 'Name', 'Section', 'Attendance %', 'Coursework %', 'Marks %', 'Band', 'Band label', 'Score', 'Forecast %', 'Top factor', 'First action'];
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(','));
  ctx.res.statusCode = 200;
  ctx.res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  ctx.res.setHeader('Content-Disposition', `attachment; filename="eduguard-at-risk-${new Date().toISOString().slice(0, 10)}.csv"`);
  ctx.res.end(`\uFEFF${lines.join('\n')}`);
  return RAW;
}

module.exports = [
  { method: 'GET', path: 'reports/student/:id', handler: studentReport },
  { method: 'GET', path: 'reports/class', handler: classReport },
  { method: 'GET', path: 'export/at-risk.csv', handler: atRiskCsv }
];
