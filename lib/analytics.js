'use strict';

const { all } = require('./db');
const { assertScope } = require('./permissions');
const scoring = require('./scoring');
const { LEVELS } = scoring;

/**
 * Server-side data assembly for every risk surface. The browser only ever
 * receives analyses that were computed inside the viewer's scope.
 */

async function loadRawSettings() {
  const rows = await all('SELECT key, value FROM settings');
  const raw = {};
  for (const row of rows) {
    try { raw[row.key] = JSON.parse(row.value); } catch { raw[row.key] = row.value; }
  }
  return raw;
}

function pairKey(subjectId, sectionId) {
  return `${subjectId}:${sectionId}`;
}

function assessmentTime(row) {
  return `${row.held_on || row.created_at || ''}`;
}

function pairAssessmentsMap(assessments) {
  const map = new Map();
  for (const row of assessments) {
    const key = pairKey(row.subject_id, row.section_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  for (const list of map.values()) {
    list.sort((a, b) => assessmentTime(a).localeCompare(assessmentTime(b)) || a.title.localeCompare(b.title));
  }
  return map;
}

function sumBy(rows, fn) {
  return rows.reduce((total, row) => total + fn(row), 0);
}

function mean(values) {
  const clean = values.filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)));
  return clean.length ? clean.reduce((total, value) => total + Number(value), 0) / clean.length : null;
}

function median(values) {
  const clean = values.filter((value) => value !== null && value !== undefined).map(Number).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

/** Loads one consistent snapshot of all data visible to a scope. */
async function loadContext(scope) {
  const termId = scope.term.id;
  const raw = await loadRawSettings();
  const settings = scoring.normaliseSettings(raw);

  const subjectIds = scope.subjects.map((subject) => subject.id);
  const sectionIds = scope.sections.map((section) => section.id);

  const [studentRows, assessmentRows, typeRows, schemeRows, sessionRows, assignmentRows] = await Promise.all([
    all(
      `SELECT st.id, st.roll, st.name, st.section_id, st.active, st.is_demo,
              sec.name AS section_name, sec.branch, sec.semester
         FROM students st JOIN sections sec ON sec.id = st.section_id
        WHERE st.active = 1 AND sec.active = 1
          ${scope.role === 'HOD' ? '' : `AND st.section_id IN (${sectionIds.map(() => '?').join(',') || 'NULL'})`}
        ORDER BY st.name`,
      scope.role === 'HOD' ? [] : sectionIds
    ),
    all(
      `SELECT a.*, t.name AS type_name, t.is_coursework, s.name AS subject_name, s.code AS subject_code
         FROM assessments a
         JOIN assessment_types t ON t.id = a.type_id
         JOIN subjects s ON s.id = a.subject_id
        WHERE a.term_id = ? AND a.deleted = 0
        ORDER BY a.held_on, a.created_at, a.title`,
      [termId]
    ),
    all('SELECT * FROM assessment_types ORDER BY name'),
    all(
      `SELECT ss.* FROM subject_schemes ss
         JOIN assessment_types t ON t.id = ss.type_id
        WHERE t.active = 1`
    ),
    all('SELECT * FROM attendance_sessions WHERE term_id = ? ORDER BY held_on', [termId]),
    all(
      `SELECT ta.*, u.name AS user_name FROM teaching_assignments ta
         JOIN users u ON u.id = ta.user_id
        WHERE ta.term_id = ?`,
      [termId]
    )
  ]);

  const assessments = assessmentRows.filter((row) => scope.role === 'HOD' || scope.pairs.has(pairKey(row.subject_id, row.section_id)));
  const sessions = sessionRows.filter((row) => scope.role === 'HOD' || scope.pairs.has(pairKey(row.subject_id, row.section_id)));
  const assignments = assignmentRows.filter((row) => scope.role === 'HOD' || scope.pairs.has(pairKey(row.subject_id, row.section_id)));

  const assessmentIds = assessments.map((row) => row.id);
  const sessionIds = sessions.map((row) => row.id);
  const [markRows, recordRows] = await Promise.all([
    assessmentIds.length
      ? all(`SELECT * FROM marks WHERE assessment_id IN (${assessmentIds.map(() => '?').join(',')})`, assessmentIds)
      : [],
    sessionIds.length
      ? all(`SELECT * FROM attendance_records WHERE session_id IN (${sessionIds.map(() => '?').join(',')})`, sessionIds)
      : []
  ]);

  const marksByAssessment = new Map();
  for (const row of markRows) {
    if (!marksByAssessment.has(row.assessment_id)) marksByAssessment.set(row.assessment_id, new Map());
    marksByAssessment.get(row.assessment_id).set(row.student_id, row);
  }
  const recordsBySession = new Map();
  for (const row of recordRows) {
    if (!recordsBySession.has(row.session_id)) recordsBySession.set(row.session_id, new Map());
    recordsBySession.get(row.session_id).set(row.student_id, row);
  }
  const schemesBySubject = new Map();
  for (const row of schemeRows) {
    if (!schemesBySubject.has(row.subject_id)) schemesBySubject.set(row.subject_id, []);
    schemesBySubject.get(row.subject_id).push({
      typeId: row.type_id, weight: Number(row.weight), rule: row.rule, ruleN: row.rule_n
    });
  }
  const types = new Map(typeRows.map((row) => [row.id, row]));
  const pairAssessments = pairAssessmentsMap(assessments);
  const pairSessions = new Map();
  for (const row of sessions) {
    const key = pairKey(row.subject_id, row.section_id);
    if (!pairSessions.has(key)) pairSessions.set(key, []);
    pairSessions.get(key).push(row);
  }

  return {
    scope,
    term: scope.term,
    rawSettings: raw,
    settings,
    students: studentRows,
    studentMap: new Map(studentRows.map((row) => [row.id, row])),
    assessments,
    assessmentMap: new Map(assessments.map((row) => [row.id, row])),
    pairAssessments,
    sessions,
    pairSessions,
    marksByAssessment,
    recordsBySession,
    schemesBySubject,
    types,
    assignments,
    assignmentByPair: new Map(assignments.map((row) => [pairKey(row.subject_id, row.section_id), row])),
    subjectMeta: new Map(scope.subjects.map((subject) => [subject.id, subject])),
    sectionMeta: new Map(scope.sections.map((section) => [section.id, section]))
  };
}

function subjectData(ctx, student, subjectId) {
  const key = pairKey(subjectId, student.section_id);
  const subjectMeta = ctx.subjectMeta.get(subjectId);
  if (!subjectMeta) return null;
  const assessments = ctx.pairAssessments.get(key) || [];
  const scheme = ctx.schemesBySubject.get(subjectId) || [];
  const markMapFor = (assessmentId) => ctx.marksByAssessment.get(assessmentId) || new Map();

  const entriesByType = new Map();
  const courseworkItems = [];
  for (const assessment of assessments) {
    const mark = markMapFor(assessment.id).get(student.id) || null;
    const status = mark ? mark.status : 'missing';
    const percent = scoring.assessmentPercent(mark?.score, assessment.max_marks, status, ctx.settings.absentCountsAsZero);
    if (!entriesByType.has(assessment.type_id)) entriesByType.set(assessment.type_id, []);
    entriesByType.get(assessment.type_id).push({
      percent,
      score: mark?.score ?? 0,
      max: Number(assessment.max_marks),
      status
    });
    if (assessment.is_coursework) {
      courseworkItems.push({ status: status === 'missing' ? 'missing' : status, hasMark: Boolean(mark) });
    }
  }
  const cleanPercents = assessments
    .map((assessment) => {
      const mark = markMapFor(assessment.id).get(student.id) || null;
      return scoring.assessmentPercent(mark?.score, assessment.max_marks, mark ? mark.status : 'missing', ctx.settings.absentCountsAsZero);
    })
    .filter((value) => value !== null);

  const typeResults = scheme.map((row) => ({
    typeId: row.typeId,
    name: ctx.types.get(row.typeId)?.name || 'Type',
    value: scoring.applyRule(entriesByType.get(row.typeId) || [], row.rule, row.ruleN)
  }));
  const marksResult = scoring.subjectMarks({ typeResults, scheme, assessmentPercents: cleanPercents });

  const sessionList = ctx.pairSessions.get(key) || [];
  const attendanceRecords = sessionList.map((session) => {
    const record = (ctx.recordsBySession.get(session.id) || new Map()).get(student.id);
    return { heldOn: session.held_on, present: Boolean(record && Number(record.present) === 1) };
  });
  const attendance = scoring.attendanceSummary(attendanceRecords);
  const coursework = scoring.courseworkCompletion(courseworkItems);

  const assessed = assessments
    .map((assessment) => {
      const mark = markMapFor(assessment.id).get(student.id) || null;
      const percent = scoring.assessmentPercent(mark?.score, assessment.max_marks, mark ? mark.status : 'missing', ctx.settings.absentCountsAsZero);
      return {
        id: assessment.id,
        title: assessment.title,
        typeId: assessment.type_id,
        typeName: assessment.type_name,
        isCoursework: Boolean(assessment.is_coursework),
        heldOn: assessment.held_on,
        maxMarks: assessment.max_marks,
        score: mark?.score ?? null,
        status: mark ? mark.status : 'missing',
        percent,
        locked: Boolean(assessment.locked)
      };
    })
    .filter((row) => row.percent !== null || row.status === 'absent');

  return {
    id: subjectId,
    name: subjectMeta.name,
    code: subjectMeta.code || '',
    value: marksResult.value,
    method: marksResult.method,
    coverage: marksResult.coverage,
    attendance: attendance.percent,
    attendanceSummary: attendance,
    attendanceRecords,
    coursework,
    assessments: assessed,
    assessmentCount: assessments.length,
    sessionCount: sessionList.length
  };
}

function studentSubjectIds(ctx, student) {
  return ctx.scope.role === 'HOD'
    ? ctx.scope.subjects.map((subject) => subject.id)
    : ctx.scope.subjectIds ? [...ctx.scope.subjectIds] : [];
}

function buildSignals(ctx, student) {
  const ids = studentSubjectIds(ctx, student);
  const subjects = ids
    .map((subjectId) => subjectData(ctx, student, subjectId))
    .filter(Boolean)
    .filter((item) => item.assessmentCount > 0 || item.sessionCount > 0);

  const marksValues = subjects.map((item) => item.value).filter((value) => value !== null);
  const marks = marksValues.length ? scoring.round(scoring.average(marksValues)) : null;

  const allAttendance = subjects.flatMap((item) => item.attendanceRecords);
  const attendance = scoring.attendanceSummary(allAttendance);

  const courseworkItems = subjects.flatMap((item) => {
    const key = pairKey(item.id, student.section_id);
    return (ctx.pairAssessments.get(key) || []).filter((a) => a.is_coursework).map((assessment) => {
      const mark = (ctx.marksByAssessment.get(assessment.id) || new Map()).get(student.id);
      return { status: mark ? mark.status : 'missing', hasMark: Boolean(mark) };
    });
  });
  const coursework = scoring.courseworkCompletion(courseworkItems);

  const points = subjects
    .flatMap((item) => item.assessments
      .filter((assessment) => assessment.percent !== null)
      .map((assessment) => ({
        id: assessment.id,
        title: assessment.title,
        subject: item.name,
        heldOn: assessment.heldOn || '',
        percent: assessment.percent
      })))
    .sort((a, b) => a.heldOn.localeCompare(b.heldOn) || a.title.localeCompare(b.title));

  const minTrend = ctx.settings.minAssessmentsForTrend;
  const lastWindow = points.slice(-Math.max(minTrend, 3));
  const marksFell = lastWindow.length >= minTrend &&
    lastWindow.every((point, index) => index === 0 || point.percent < lastWindow[index - 1].percent);

  const latest = points.length ? points[points.length - 1].percent : null;
  const previous = points.length > 1 ? points[points.length - 2].percent : null;
  const earliest = points.length ? points[0].percent : null;
  const markDelta = points.length > 1 ? scoring.round(latest - earliest) : 0;
  const recentDelta = previous !== null ? scoring.round(latest - previous) : 0;

  const subjectSummary = subjects.map((item) => ({
    id: item.id,
    name: item.name,
    code: item.code,
    value: item.value,
    attendance: item.attendance,
    coursework: item.coursework,
    assessments: item.assessmentCount,
    method: item.method
  }));
  const withValue = subjectSummary.filter((item) => item.value !== null);
  const weakest = withValue.length ? [...withValue].sort((a, b) => a.value - b.value)[0] : null;
  const strongest = withValue.length ? [...withValue].sort((a, b) => b.value - a.value)[0] : null;

  return {
    attendance: attendance.percent,
    coursework,
    marks,
    marksFell,
    latestMark: latest,
    previousMark: previous,
    earliestMark: earliest,
    markDelta,
    recentDelta,
    attendanceTrend: attendance.trend,
    attendanceDrop: attendance.drop,
    attendanceWeeks: attendance.weeks,
    subjects: subjectSummary,
    subjectData: subjects,
    weakest,
    strongest,
    assessmentTrend: points.slice(-12),
    minAssessmentsForTrend: minTrend
  };
}

function analyseStudent(ctx, student) {
  const signals = buildSignals(ctx, student);
  const hasData = signals.attendance !== null || signals.coursework !== null || signals.marks !== null || signals.assessmentTrend.length > 0;
  const core = scoring.evaluate(signals, ctx.rawSettings);
  const analysis = {
    ...core,
    hasData,
    score: hasData ? core.score : null,
    level: hasData ? core.level : 'medium',
    levelLabel: hasData ? LEVELS[core.level].label : 'No entries yet',
    forecast: hasData ? core.forecast : { percent: 0, band: 'low', factors: [] },
    scope: ctx.scope.role === 'HOD' ? 'overall' : 'assigned',
    term: { id: ctx.term.id, name: ctx.term.name },
    student: {
      id: student.id,
      name: student.name,
      roll: student.roll,
      sectionId: student.section_id,
      sectionName: student.section_name,
      branch: student.branch,
      semester: student.semester,
      isDemo: Boolean(student.is_demo)
    },
    subjectsInScope: signals.subjects.map((item) => item.name)
  };
  return analysis;
}

function summaryOf(analysis) {
  const a = analysis;
  return {
    id: a.student.id,
    name: a.student.name,
    roll: a.student.roll,
    sectionId: a.student.sectionId,
    sectionName: a.student.sectionName,
    branch: a.student.branch,
    semester: a.student.semester,
    hasData: a.hasData,
    score: a.score,
    level: a.level,
    levelLabel: a.levelLabel,
    attendance: a.signals.attendance,
    coursework: a.signals.coursework,
    marks: a.signals.marks,
    markDelta: a.signals.markDelta,
    attendanceDrop: a.signals.attendanceDrop,
    forecast: a.forecast.percent,
    topFactor: a.factors[0]?.title || (a.hasData ? 'Core signals are steady' : 'No entries yet'),
    subjects: a.signals.subjects.map((subject) => ({ id: subject.id, name: subject.name, value: subject.value })),
    priority: a.hasData ? scoring.priorityValue(a, false) : -1
  };
}

function analyseAll(ctx) {
  return ctx.students.map((student) => analyseStudent(ctx, student));
}

function filterAnalyses(analyses, { sectionId, subjectId, band, search } = {}) {
  let rows = analyses;
  if (sectionId) rows = rows.filter((row) => row.student.sectionId === sectionId);
  if (subjectId) rows = rows.filter((row) => row.signals.subjects.some((subject) => subject.id === subjectId));
  if (band === 'nodata') rows = rows.filter((row) => !row.hasData);
  else if (band) rows = rows.filter((row) => row.hasData && row.level === band);
  if (search) {
    const q = String(search).toLowerCase();
    rows = rows.filter((row) => `${row.student.name} ${row.student.roll} ${row.student.sectionName}`.toLowerCase().includes(q));
  }
  return rows;
}

function countLevels(rows) {
  const counts = { high: 0, medium: 0, low: 0, noData: 0 };
  for (const row of rows) {
    if (!row.hasData) counts.noData += 1;
    else counts[row.level] += 1;
  }
  return counts;
}

function sectionRows(ctx, analyses) {
  return ctx.scope.sections.map((section) => {
    const rows = analyses.filter((row) => row.student.sectionId === section.id);
    const counts = countLevels(rows);
    const active = rows.filter((row) => row.hasData);
    const flagged = counts.high + counts.medium;
    return {
      id: section.id,
      name: section.name,
      branch: section.branch,
      semester: section.semester,
      students: rows.length,
      high: counts.high,
      medium: counts.medium,
      low: counts.low,
      noData: counts.noData,
      flaggedShare: active.length ? scoring.round((active.filter((row) => row.level !== 'low').length / active.length) * 100) : 0,
      attendance: mean(active.map((row) => row.signals.attendance)),
      coursework: mean(active.map((row) => row.signals.coursework)),
      marks: mean(active.map((row) => row.signals.marks))
    };
  }).filter((row) => row.students > 0);
}

function trendSeries(ctx, analyses) {
  const series = [];
  for (const section of ctx.scope.sections) {
    const rows = analyses.filter((row) => row.student.sectionId === section.id);
    if (!rows.length) continue;
    const buckets = new Map();
    for (const row of rows) {
      for (const point of row.signals.assessmentTrend) {
        const key = point.heldOn || 'undated';
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(point.percent);
      }
    }
    const points = [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-10)
      .map(([date, values]) => ({ date, label: date === 'undated' ? 'Undated' : date.slice(5), value: scoring.round(scoring.average(values)) }));
    if (points.length) series.push({ section: section.name, points });
  }
  return series;
}

function earlyWarnings(analyses) {
  const warnings = [];
  for (const row of analyses) {
    if (!row.hasData) continue;
    const signals = row.signals;
    let reason = null;
    if (signals.latestMark !== null && signals.previousMark !== null && signals.latestMark - signals.previousMark <= -8) {
      reason = `Latest assessment dropped ${Math.abs(scoring.round(signals.latestMark - signals.previousMark))} points.`;
    } else if (signals.marksFell) {
      reason = 'Marks have fallen across the last three assessments.';
    } else if (signals.attendanceDrop >= 10) {
      reason = `Attendance dropped ${scoring.round(signals.attendanceDrop)} points over four weeks.`;
    }
    if (reason) warnings.push({ ...summaryOf(row), reason });
  }
  return warnings.sort((a, b) => b.priority - a.priority).slice(0, 6);
}

function progressRows(ctx) {
  const pairs = new Map();
  for (const row of ctx.assignments) {
    const key = pairKey(row.subject_id, row.section_id);
    pairs.set(key, {
      subjectId: row.subject_id,
      sectionId: row.section_id,
      subjectName: row.subject_name || ctx.subjectMeta.get(row.subject_id)?.name || 'Subject',
      sectionName: row.section_name || ctx.sectionMeta.get(row.section_id)?.name || 'Section',
      owner: row.user_name || 'Unassigned'
    });
  }
  for (const row of ctx.assessments) {
    const key = pairKey(row.subject_id, row.section_id);
    if (!pairs.has(key)) {
      const assignment = ctx.assignmentByPair.get(key);
      pairs.set(key, {
        subjectId: row.subject_id,
        sectionId: row.section_id,
        subjectName: row.subject_name || ctx.subjectMeta.get(row.subject_id)?.name || 'Subject',
        sectionName: ctx.sectionMeta.get(row.section_id)?.name || 'Section',
        owner: assignment?.user_name || 'Unassigned'
      });
    }
  }
  const rows = [];
  for (const [key, pair] of pairs) {
    const assessments = ctx.pairAssessments.get(key) || [];
    const students = ctx.students.filter((student) => student.section_id === pair.sectionId);
    const total = assessments.length * students.length;
    let filled = 0;
    let lastUpdate = null;
    for (const assessment of assessments) {
      const markMap = ctx.marksByAssessment.get(assessment.id) || new Map();
      for (const student of students) {
        const mark = markMap.get(student.id);
        if (mark) {
          filled += 1;
          if (!lastUpdate || mark.updated_at > lastUpdate) lastUpdate = mark.updated_at;
        }
      }
    }
    rows.push({
      ...pair,
      assessments: assessments.length,
      students: students.length,
      filled,
      total,
      completeness: total ? scoring.round((filled / total) * 100) : 0,
      lastUpdate,
      empty: assessments.length === 0,
      overdue: assessments.length === 0 || (total > 0 && filled / total < 0.5)
    });
  }
  return rows.sort((a, b) => a.completeness - b.completeness || a.subjectName.localeCompare(b.subjectName));
}

async function dashboardView(ctx, { sectionId = null } = {}) {
  const analyses = analyseAll(ctx);
  const filtered = filterAnalyses(analyses, { sectionId });
  const counts = countLevels(filtered);
  const active = filtered.filter((row) => row.hasData);
  const focus = [...active]
    .sort((a, b) => scoring.priorityValue(b, false) - scoring.priorityValue(a, false))
    .slice(0, 5)
    .map(summaryOf);
  const reasons = {};
  for (const row of filtered) {
    if (!row.hasData || row.level === 'low') continue;
    const categories = new Set(row.factors.filter((item) => item.category).map((item) => item.category));
    for (const category of categories) reasons[category] = (reasons[category] || 0) + 1;
  }
  const reasonLabels = {
    attendance: 'Attendance gaps',
    coursework: 'Incomplete coursework',
    marks: 'Low assessment averages',
    subject: 'Subject focus',
    trend: 'Falling trend'
  };
  const reasonRows = Object.entries(reasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key, count]) => ({ key, label: reasonLabels[key] || key, count }));

  const sections = sectionRows(ctx, analyses);
  const shares = sections.map((row) => row.flaggedShare);
  const gap = shares.length > 1 ? scoring.round(Math.max(...shares) - Math.min(...shares)) : 0;

  const improved = filtered.filter((row) => row.hasData && row.signals.markDelta > 1).length;
  const progress = ctx.scope.role === 'HOD' ? progressRows(ctx) : [];
  const needsAttention = sections
    .filter((row) => row.students > 0 && (row.flaggedShare > 25 || (row.attendance !== null && row.attendance < 75)))
    .slice(0, 4);

  return {
    term: { id: ctx.term.id, name: ctx.term.name, startsOn: ctx.term.starts_on, endsOn: ctx.term.ends_on },
    scope: {
      role: ctx.scope.role,
      mode: ctx.scope.role === 'HOD' ? 'department' : 'assigned',
      subjects: ctx.scope.subjects.map((subject) => ({ id: subject.id, name: subject.name })),
      sections: ctx.scope.sections.map((section) => ({ id: section.id, name: section.name, branch: section.branch, semester: section.semester }))
    },
    summary: {
      students: filtered.length,
      high: counts.high,
      medium: counts.medium,
      low: counts.low,
      noData: counts.noData,
      improved,
      averageScore: active.length ? scoring.round(scoring.average(active.map((row) => row.score))) : null
    },
    focus,
    distribution: counts,
    reasons: reasonRows,
    trend: {
      series: trendSeries(ctx, analyses),
      delta: active.length ? scoring.round(mean(active.map((row) => row.signals.markDelta)) || 0) : 0
    },
    sections,
    fairness: {
      gap,
      rows: sections.map((row) => ({
        section: row.name,
        students: row.students,
        flagged: row.high + row.medium,
        share: row.flaggedShare
      })),
      warning: gap > 15
    },
    warnings: earlyWarnings(analyses),
    progress: ctx.scope.role === 'HOD' ? {
      rows: progress.slice(0, 5),
      incomplete: progress.filter((row) => row.overdue).length,
      total: progress.length
    } : null,
    needsAttention
  };
}

async function studentsView(ctx, options = {}) {
  let analyses = analyseAll(ctx);
  analyses = filterAnalyses(analyses, options);
  const total = analyses.length;
  const sort = options.sort || 'priority';
  const direction = options.direction === 'desc' ? -1 : 1;
  const getValue = (row) => {
    switch (sort) {
      case 'name': return row.student.name.toLowerCase();
      case 'roll': return row.student.roll.toLowerCase();
      case 'attendance': return row.signals.attendance ?? -1;
      case 'coursework': return row.signals.coursework ?? -1;
      case 'marks': return row.signals.marks ?? -1;
      case 'score': return row.score ?? -1;
      case 'trend': return row.signals.markDelta;
      case 'forecast': return row.forecast.percent;
      default: return row.hasData ? scoring.priorityValue(row, false) : -1;
    }
  };
  analyses.sort((a, b) => {
    const left = getValue(a);
    const right = getValue(b);
    if (left === right) return a.student.name.localeCompare(b.student.name);
    return (left < right ? -1 : 1) * direction;
  });
  const start = options.offset || 0;
  const limit = options.limit || 25;
  const page = analyses.slice(start, start + limit);
  return {
    total,
    rows: page.map(summaryOf),
    summary: countLevels(analyses),
    nextCursor: start + page.length < total ? Buffer.from(String(start + page.length)).toString('base64') : null
  };
}

function mentorMatches(ctx, student, analysis) {
  const weakest = analysis.signals.weakest;
  if (!weakest) return [];
  const candidates = [];
  for (const candidate of ctx.students) {
    if (candidate.id === student.id || candidate.section_id !== student.section_id) continue;
    const candidateAnalysis = analyseStudent(ctx, candidate);
    if (!candidateAnalysis.hasData || candidateAnalysis.level !== 'low') continue;
    const subject = candidateAnalysis.signals.subjects.find((item) => item.id === weakest.id);
    if (!subject || subject.value === null || subject.value < 80) continue;
    if ((candidateAnalysis.signals.coursework ?? 0) < 85) continue;
    candidates.push({
      id: candidate.id,
      name: candidate.name,
      roll: candidate.roll,
      sectionName: candidate.section_name,
      subjectValue: subject.value,
      coursework: candidateAnalysis.signals.coursework,
      score: candidateAnalysis.score,
      level: candidateAnalysis.level
    });
  }
  return candidates
    .sort((a, b) => b.subjectValue - a.subjectValue || b.coursework - a.coursework)
    .slice(0, 3)
    .map((item) => ({ ...item, subjectName: weakest.name, subjectId: weakest.id }));
}

async function subjectAnalytics(ctx, subjectId, sectionId = null) {
  const { assertSubject } = require('./permissions');
  assertSubject(ctx.scope, subjectId);
  if (sectionId) assertScope(ctx.scope, subjectId, sectionId);
  const subject = ctx.subjectMeta.get(subjectId);
  if (!subject) return null;
  const analyses = analyseAll(ctx).filter((row) => !sectionId || row.student.sectionId === sectionId);
  const values = [];
  const assessmentAgg = new Map();
  for (const analysis of analyses) {
    const data = analysis.signals.subjectData.find((item) => item.id === subjectId);
    if (!data) continue;
    if (data.value !== null) values.push(data.value);
    for (const assessment of data.assessments) {
      if (assessment.percent === null) continue;
      if (!assessmentAgg.has(assessment.id)) {
        assessmentAgg.set(assessment.id, {
          id: assessment.id, title: assessment.title, heldOn: assessment.heldOn,
          typeName: assessment.typeName, values: []
        });
      }
      assessmentAgg.get(assessment.id).values.push(assessment.percent);
    }
  }
  const histogram = Array.from({ length: 10 }, (_, index) => ({ bucket: `${index * 10}-${index * 10 + 9}`, count: 0 }));
  for (const value of values) {
    const index = Math.min(9, Math.floor(value / 10));
    histogram[index].count += 1;
  }
  const hardest = [...assessmentAgg.values()]
    .map((row) => ({ ...row, average: scoring.round(scoring.average(row.values)), entered: row.values.length }))
    .sort((a, b) => a.average - b.average)
    .slice(0, 6);
  const sectionComparison = ctx.scope.sections.map((section) => {
    const rows = analyses.filter((row) => row.student.sectionId === section.id);
    const sectionValues = rows
      .map((row) => row.signals.subjectData.find((item) => item.id === subjectId)?.value)
      .filter((value) => value !== null && value !== undefined);
    return {
      section: section.name,
      students: rows.length,
      mean: sectionValues.length ? scoring.round(scoring.average(sectionValues)) : null,
      atRisk: rows.filter((row) => row.level === 'high').length
    };
  }).filter((row) => row.students > 0);
  const trendBuckets = new Map();
  for (const row of analyses) {
    const data = row.signals.subjectData.find((item) => item.id === subjectId);
    if (!data) continue;
    for (const assessment of data.assessments) {
      if (assessment.percent === null) continue;
      const key = assessment.heldOn || 'undated';
      if (!trendBuckets.has(key)) trendBuckets.set(key, []);
      trendBuckets.get(key).push(assessment.percent);
    }
  }
  const trend = [...trendBuckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-10)
    .map(([date, list]) => ({ date, label: date === 'undated' ? 'Undated' : date.slice(5), value: scoring.round(scoring.average(list)) }));

  return {
    subject: { id: subject.id, name: subject.name, code: subject.code || '' },
    section: sectionId ? ctx.sectionMeta.get(sectionId)?.name || null : null,
    students: values.length,
    mean: values.length ? scoring.round(scoring.average(values)) : null,
    median: median(values) === null ? null : scoring.round(median(values)),
    passRate: values.length ? scoring.round((values.filter((value) => value >= 40).length / values.length) * 100) : null,
    passMark: 40,
    histogram,
    hardest,
    sectionComparison,
    trend,
    distribution: countLevels(analyses)
  };
}

async function heatmapView(ctx, { sectionId = null, search = '' } = {}) {
  const analyses = analyseAll(ctx);
  const subjects = ctx.scope.subjects.map((subject) => ({ id: subject.id, name: subject.name }));
  let rows = filterAnalyses(analyses, { sectionId, search });
  rows.sort((a, b) => (a.score ?? 101) - (b.score ?? 101));
  return {
    subjects,
    rows: rows.map((row) => ({
      id: row.student.id,
      name: row.student.name,
      roll: row.student.roll,
      sectionName: row.student.sectionName,
      hasData: row.hasData,
      score: row.score,
      level: row.level,
      levelLabel: row.levelLabel,
      attendance: row.signals.attendance,
      coursework: row.signals.coursework,
      marks: row.signals.marks,
      trend: row.signals.markDelta,
      subjects: Object.fromEntries(row.signals.subjects.map((subject) => [subject.id, subject.value]))
    })),
    counts: countLevels(rows)
  };
}

async function fairnessView(ctx) {
  const analyses = analyseAll(ctx);
  const rows = sectionRows(ctx, analyses);
  const shares = rows.map((row) => row.flaggedShare);
  const gap = shares.length > 1 ? scoring.round(Math.max(...shares) - Math.min(...shares)) : 0;
  return {
    rows: rows.map((row) => ({
      section: row.name, sectionId: row.id, students: row.students,
      flagged: row.high + row.medium, share: row.flaggedShare
    })),
    gap,
    warning: gap > 15,
    note: 'A gap is a prompt to review context, not proof of bias.'
  };
}

async function subjectCards(ctx) {
  const analyses = analyseAll(ctx);
  const pairs = [];
  if (ctx.scope.role === 'HOD') {
    for (const subject of ctx.scope.subjects) {
      for (const section of ctx.scope.sections) pairs.push({ subject, section });
    }
  } else {
    for (const assignment of ctx.scope.assignments) {
      const subject = ctx.subjectMeta.get(assignment.subject_id) || { id: assignment.subject_id, name: assignment.subject_name };
      const section = ctx.sectionMeta.get(assignment.section_id) || { id: assignment.section_id, name: assignment.section_name };
      pairs.push({ subject, section });
    }
  }
  return pairs.map(({ subject, section }) => {
    const key = pairKey(subject.id, section.id);
    const assessments = ctx.pairAssessments.get(key) || [];
    const students = ctx.students.filter((student) => student.section_id === section.id);
    const rows = analyses.filter((analysis) => analysis.student.sectionId === section.id);
    const values = rows
      .map((row) => row.signals.subjectData.find((item) => item.id === subject.id)?.value)
      .filter((value) => value !== null && value !== undefined);
    let filled = 0;
    for (const assessment of assessments) {
      const markMap = ctx.marksByAssessment.get(assessment.id) || new Map();
      for (const student of students) if (markMap.has(student.id)) filled += 1;
    }
    const total = assessments.length * students.length;
    return {
      subjectId: subject.id,
      subjectName: subject.name,
      sectionId: section.id,
      sectionName: section.name,
      students: students.length,
      assessments: assessments.length,
      completeness: total ? scoring.round((filled / total) * 100) : 0,
      average: values.length ? scoring.round(scoring.average(values)) : null,
      atRisk: rows.filter((row) => row.hasData && row.level === 'high').length,
      owner: ctx.assignmentByPair.get(key)?.user_name || null
    };
  }).filter((row) => row.students > 0 || row.assessments > 0);
}

module.exports = {
  loadRawSettings,
  loadContext,
  analyseStudent,
  analyseAll,
  summaryOf,
  filterAnalyses,
  countLevels,
  dashboardView,
  studentsView,
  mentorMatches,
  subjectAnalytics,
  heatmapView,
  fairnessView,
  subjectCards,
  progressRows,
  pairKey
};
