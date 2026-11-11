'use strict';

/**
 * Explainable scoring engine. Pure functions only: everything here can be
 * unit-tested without a database and is safe to run on the server.
 *
 * Default score: 35% attendance + 25% coursework + 40% weighted marks.
 * Bands: >= 70 On track, 50-69 Watch closely, < 50 Needs support.
 */

const { DEFAULT_SETTINGS } = require('../db/schema');

const LEVELS = {
  high: { label: 'Needs support', short: 'High', tone: 'danger' },
  medium: { label: 'Watch closely', short: 'Medium', tone: 'warn' },
  low: { label: 'On track', short: 'Low', tone: 'ok' }
};

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(number(value) * factor) / factor;
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, number(value)));
}

function average(values) {
  const clean = values.map(number).filter((value) => Number.isFinite(value));
  return clean.length ? clean.reduce((total, value) => total + value, 0) / clean.length : 0;
}

function parseSetting(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return value;
}

/** Accepts the raw settings map from the database or an already-built object. */
function normaliseSettings(raw = {}) {
  const weights = { ...DEFAULT_SETTINGS.score_weights, ...parseSetting(raw.score_weights, {}) };
  const thresholds = { ...DEFAULT_SETTINGS.thresholds, ...parseSetting(raw.thresholds, {}) };
  return {
    weights: {
      attendance: number(weights.attendance),
      coursework: number(weights.coursework),
      marks: number(weights.marks)
    },
    thresholds: {
      onTrack: number(thresholds.onTrack),
      watch: number(thresholds.watch),
      attendanceWatch: number(thresholds.attendanceWatch),
      attendanceConcern: number(thresholds.attendanceConcern),
      courseworkWatch: number(thresholds.courseworkWatch),
      courseworkConcern: number(thresholds.courseworkConcern),
      marksWatch: number(thresholds.marksWatch),
      marksConcern: number(thresholds.marksConcern),
      attendanceDrop: number(thresholds.attendanceDrop)
    },
    absentCountsAsZero: parseSetting(raw.absent_counts_as_zero, DEFAULT_SETTINGS.absent_counts_as_zero) !== false,
    minAssessmentsForTrend: Math.max(2, number(parseSetting(raw.min_assessments_for_trend, DEFAULT_SETTINGS.min_assessments_for_trend)))
  };
}

function validateWeights(weights) {
  const w = {
    attendance: number(weights?.attendance),
    coursework: number(weights?.coursework),
    marks: number(weights?.marks)
  };
  if (Object.values(w).some((value) => value < 0 || value > 100)) {
    throw new Error('Each weight must be between 0 and 100.');
  }
  if (Math.abs(w.attendance + w.coursework + w.marks - 100) > 0.01) {
    throw new Error('Attendance, coursework and marks weights must total 100.');
  }
  return w;
}

function assessmentPercent(score, maxMarks, status = 'present', absentCountsAsZero = true) {
  if (status === 'exempt') return null;
  if (status === 'absent') return absentCountsAsZero ? 0 : null;
  if (score === null || score === undefined || score === '') return null;
  const max = number(maxMarks);
  if (!(max > 0)) return null;
  return round(clamp((number(score) / max) * 100));
}

/**
 * entries: [{ percent, score, max, status }]
 * average  - mean percentage of recorded entries
 * best_n   - mean of the best N percentages
 * sum      - total score / total max * 100
 */
function applyRule(entries, rule = 'average', n = null) {
  const usable = entries.filter((entry) => entry && entry.percent !== null && entry.percent !== undefined && Number.isFinite(Number(entry.percent)));
  if (!usable.length) return null;
  if (rule === 'best_n') {
    const take = Math.max(1, Math.min(Number(n) || usable.length, usable.length));
    const best = [...usable].sort((a, b) => number(b.percent) - number(a.percent)).slice(0, take);
    return round(average(best.map((entry) => entry.percent)));
  }
  if (rule === 'sum') {
    const totalScore = usable.reduce((total, entry) => total + number(entry.score), 0);
    const totalMax = usable.reduce((total, entry) => total + number(entry.max), 0);
    if (!(totalMax > 0)) return null;
    return round(clamp((totalScore / totalMax) * 100));
  }
  return round(average(usable.map((entry) => entry.percent)));
}

/**
 * Combine assessment-type results using the subject scheme. Weights are
 * re-normalised over types that actually have data, so a mid-term subject
 * still produces a sensible percentage.
 */
function combineScheme(typeResults, scheme) {
  const rows = [];
  for (const item of typeResults) {
    if (item.value === null || item.value === undefined) continue;
    const rule = scheme.find((entry) => entry.typeId === item.typeId);
    if (!rule) continue;
    if (number(rule.weight) <= 0) continue;
    rows.push({ ...item, weight: number(rule.weight) });
  }
  if (!rows.length) return { value: null, method: 'scheme', coverage: 0 };
  const totalWeight = rows.reduce((total, row) => total + row.weight, 0);
  if (totalWeight <= 0) return { value: null, method: 'scheme', coverage: 0 };
  const value = rows.reduce((total, row) => total + number(row.value) * row.weight, 0) / totalWeight;
  return {
    value: round(clamp(value)),
    method: 'scheme',
    coverage: round((totalWeight / 100) * 100)
  };
}

/** Fallback when a subject has no scheme: plain mean of all assessment percentages. */
function subjectMarks({ typeResults, scheme, assessmentPercents }) {
  if (Array.isArray(scheme) && scheme.length) {
    const combined = combineScheme(typeResults, scheme);
    if (combined.value !== null) return combined;
  }
  const values = (assessmentPercents || []).filter((value) => value !== null && value !== undefined);
  if (!values.length) return { value: null, method: 'average', coverage: 0 };
  return { value: round(average(values)), method: 'average', coverage: 100 };
}

function isoWeekKey(dateText) {
  const date = new Date(`${String(dateText).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * records: [{ heldOn, present }]
 * Returns overall percentage plus the last four weeks and the drop between
 * the first and latest of those weeks.
 */
function attendanceSummary(records) {
  const rows = (records || [])
    .filter((row) => row && row.heldOn)
    .map((row) => ({ heldOn: String(row.heldOn).slice(0, 10), present: row.present ? 1 : 0 }));
  if (!rows.length) return { percent: null, trend: 0, drop: 0, weeks: [], total: 0, present: 0 };
  const byWeek = new Map();
  for (const row of rows) {
    const key = isoWeekKey(row.heldOn);
    if (!key) continue;
    if (!byWeek.has(key)) byWeek.set(key, { week: key, present: 0, total: 0 });
    const bucket = byWeek.get(key);
    bucket.total += 1;
    bucket.present += row.present;
  }
  const weeks = [...byWeek.values()]
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-4)
    .map((bucket) => ({ ...bucket, percent: round((bucket.present / bucket.total) * 100) }));
  const total = rows.length;
  const present = rows.reduce((sum, row) => sum + row.present, 0);
  const first = weeks[0]?.percent ?? 0;
  const latest = weeks[weeks.length - 1]?.percent ?? 0;
  return {
    percent: round((present / total) * 100),
    trend: weeks.length > 1 ? round(latest - first) : 0,
    drop: weeks.length > 1 ? round(Math.max(0, first - latest)) : 0,
    weeks,
    total,
    present
  };
}

/** items: [{ status }] for coursework-type assessments. Exempt is excluded. */
function courseworkCompletion(items) {
  const rows = (items || []).filter((item) => item && item.status !== 'exempt');
  if (!rows.length) return null;
  const present = rows.filter((item) => item.status === 'present' && (item.hasMark !== false)).length;
  return round((present / rows.length) * 100);
}

function bandFor(score, thresholds) {
  if (score >= thresholds.onTrack) return 'low';
  if (score >= thresholds.watch) return 'medium';
  return 'high';
}

/** The weighted score with the two -5 adjustments. */
function riskScore(signals, rawSettings = {}) {
  const settings = normaliseSettings(rawSettings);
  const weights = settings.weights;
  const scores = {
    attendance: signals.attendance === null || signals.attendance === undefined ? 0 : clamp(signals.attendance),
    coursework: signals.coursework === null || signals.coursework === undefined ? 0 : clamp(signals.coursework),
    marks: signals.marks === null || signals.marks === undefined ? 0 : clamp(signals.marks)
  };
  const parts = [
    {
      key: 'attendance', label: 'Attendance', value: round(scores.attendance),
      weight: weights.attendance, points: round((scores.attendance * weights.attendance) / 100)
    },
    {
      key: 'coursework', label: 'Coursework', value: round(scores.coursework),
      weight: weights.coursework, points: round((scores.coursework * weights.coursework) / 100)
    },
    {
      key: 'marks', label: 'Weighted marks', value: round(scores.marks),
      weight: weights.marks, points: round((scores.marks * weights.marks) / 100)
    }
  ];
  const penalties = [];
  if (signals.marksFell) penalties.push({ key: 'marks-fall', label: 'Marks fell across recent assessments', points: -5 });
  if (number(signals.attendanceDrop) >= settings.thresholds.attendanceDrop) {
    penalties.push({ key: 'attendance-drop', label: `Attendance fell ${round(signals.attendanceDrop)} points over four weeks`, points: -5 });
  }
  const beforeClamp = parts.reduce((total, part) => total + part.points, 0) + penalties.reduce((total, item) => total + item.points, 0);
  const score = round(clamp(beforeClamp));
  return {
    score,
    level: bandFor(score, settings.thresholds),
    parts,
    penalties,
    weights,
    thresholds: settings.thresholds
  };
}

function factor(id, category, title, text, impact, tone = 'risk') {
  return { id, category, title, text, impact, tone };
}

function buildFactors(base, signals, settings) {
  const t = settings.thresholds;
  const risks = [];
  const positives = [];
  if (signals.attendance !== null && signals.attendance < t.attendanceWatch) {
    risks.push(factor('attendance', 'attendance', 'Attendance needs support',
      `${round(signals.attendance)}% is below the ${t.attendanceWatch}% watch line.`,
      round(((t.attendanceWatch - signals.attendance) * settings.weights.attendance) / 100)));
  }
  if (signals.coursework !== null && signals.coursework < t.courseworkWatch) {
    risks.push(factor('coursework', 'coursework', 'Coursework is incomplete',
      `${round(signals.coursework)}% completion is below the ${t.courseworkWatch}% expectation.`,
      round(((t.courseworkWatch - signals.coursework) * settings.weights.coursework) / 100)));
  }
  if (signals.marks !== null && signals.marks < t.marksWatch) {
    risks.push(factor('marks', 'marks', 'Assessment averages need support',
      `The weighted average is ${round(signals.marks)}%${signals.latestMark !== null ? `, with the latest assessment at ${round(signals.latestMark)}%` : ''}.`,
      round(((t.marksWatch - signals.marks) * settings.weights.marks) / 100)));
  }
  if (signals.weakest && signals.subjects.length > 1 && signals.weakest.value < t.marksWatch) {
    risks.push(factor('subject', 'subject', `${signals.weakest.name} is the focus subject`,
      `${signals.weakest.name} is the lowest subject average at ${round(signals.weakest.value)}%.`,
      round((t.marksWatch - signals.weakest.value) * 0.25)));
  }
  if (base.penalties.some((item) => item.key === 'marks-fall')) {
    risks.push(factor('decline', 'trend', 'Marks are falling',
      `Average marks moved from ${round(signals.earliestMark)}% to ${round(signals.latestMark)}% across recent assessments.`, 5));
  }
  if (number(signals.attendanceDrop) >= t.attendanceDrop) {
    risks.push(factor('attendance-drop', 'trend', 'Attendance has slipped',
      `Weekly attendance fell ${round(signals.attendanceDrop)} points from the first to the latest week.`, 5));
  }
  if (number(signals.markDelta) >= 3) {
    positives.push(factor('improving', 'trend', 'Recent marks are improving',
      `The assessment average is up ${round(signals.markDelta)} points across recent assessments.`, 0, 'positive'));
  }
  if (!risks.length) {
    positives.push(factor('steady', null, 'Core signals are steady',
      'The main indicators are above their watch lines. Keep checking the next assessment.', 0, 'positive'));
  }
  return [...risks.sort((a, b) => b.impact - a.impact).slice(0, 5), ...positives.slice(0, 2)];
}

function buildActions(base, signals, factors) {
  const ids = new Set(factors.map((item) => item.id));
  const actions = [];
  const add = (id, title, detail, priority) => {
    if (!actions.some((item) => item.id === id)) actions.push({ id, title, detail, priority });
  };
  if (ids.has('attendance')) {
    add('attendance-check', 'Have a short attendance conversation',
      'Ask what is making attendance difficult and agree one realistic step for the coming week.',
      signals.attendance < 75 ? 'Urgent' : 'Soon');
  }
  if (ids.has('coursework')) {
    add('coursework-plan', 'Create a small catch-up plan',
      'Choose the two most useful missing tasks, set dates, and check progress at the end of the week.',
      signals.coursework < 65 ? 'Urgent' : 'Soon');
  }
  if (ids.has('marks') || ids.has('subject')) {
    add('subject-support', `Plan support for ${signals.weakest?.name || 'the focus subject'}`,
      'Use the latest assessment to choose one topic, then recheck it with a short five-question quiz.',
      base.level === 'high' ? 'Urgent' : 'Soon');
  }
  if (ids.has('decline')) {
    add('study-routine', 'Review the study routine',
      'Look at what changed before the latest assessment and agree on a short, repeatable revision routine.', 'Soon');
  }
  if (ids.has('improving')) {
    add('recognise-progress', 'Name the progress',
      'Point out the improvement and ask which habit helped so it can be repeated.', 'Monitor');
  }
  if (!actions.length) {
    add('monitor', 'Review after the next assessment',
      'Keep the current supports in place and revisit the full picture after the next assessment.', 'Monitor');
  }
  if (actions.length < 3) {
    add('family-checkin', 'Share one clear next step with home',
      'Lead with a strength, explain the next step plainly, and invite the family to share context.', 'Monitor');
  }
  const order = { Urgent: 0, Soon: 1, Monitor: 2 };
  return actions.sort((a, b) => order[a.priority] - order[b.priority]).slice(0, 4);
}

function forecastStudent(signals) {
  const attendance = signals.attendance === null ? 0 : signals.attendance;
  const coursework = signals.coursework === null ? 0 : signals.coursework;
  const marks = signals.marks === null ? 0 : signals.marks;
  const latest = signals.latestMark === null ? marks : signals.latestMark;
  const raw = 0.14 * (100 - attendance) +
    0.18 * (100 - coursework) +
    0.32 * (100 - marks) +
    0.24 * (100 - latest) +
    0.7 * Math.max(0, -number(signals.attendanceTrend)) +
    0.9 * Math.max(0, -number(signals.recentDelta)) + 8;
  const percent = Math.round(clamp(raw, 1, 99));
  const band = percent >= 60 ? 'high' : percent >= 35 ? 'medium' : 'low';
  const factors = [
    ['Average marks', marks, 65, marks < 65],
    ['Latest assessment', latest, 60, latest < 60],
    ['Attendance trend', number(signals.attendanceTrend), 0, number(signals.attendanceTrend) < 0]
  ].filter(([, , , active]) => active).slice(0, 3).map(([label, value, threshold]) => ({
    label,
    text: `${label} is ${round(value)}${label === 'Attendance trend' ? ' points over four weeks' : '%'}.`,
    direction: value < threshold ? 'up' : 'down'
  }));
  return { percent, band, factors };
}

/**
 * Full evaluation from prepared signals. Signals are assembled by
 * lib/analytics.js from scoped database rows.
 */
function evaluate(signals, rawSettings) {
  const settings = normaliseSettings(rawSettings);
  const base = riskScore(signals, settings);
  const factors = buildFactors(base, signals, settings);
  const actions = buildActions(base, signals, factors);
  return {
    ...base,
    levelLabel: LEVELS[base.level].label,
    factors,
    actions,
    forecast: forecastStudent(signals),
    signals,
    settings: {
      weights: settings.weights,
      thresholds: settings.thresholds,
      absent_counts_as_zero: settings.absentCountsAsZero,
      min_assessments_for_trend: settings.minAssessmentsForTrend
    }
  };
}

function simulate(values, analysis) {
  const signals = {
    attendance: clamp(values.attendance),
    coursework: clamp(values.coursework),
    marks: clamp(values.marks),
    attendanceDrop: analysis.signals.attendanceDrop,
    marksFell: analysis.signals.marksFell
  };
  return riskScore(signals, {
    score_weights: analysis.settings.weights,
    thresholds: analysis.settings.thresholds
  });
}

function recoveryPaths(analysis) {
  if (analysis.level === 'low') return [];
  const target = analysis.level === 'high' ? 50 : 70;
  const start = {
    attendance: Math.round(analysis.signals.attendance ?? 0),
    coursework: Math.round(analysis.signals.coursework ?? 0),
    marks: Math.round(analysis.signals.marks ?? 0)
  };
  const options = [
    { name: 'Attendance first', delta: { attendance: 14, coursework: 3, marks: 2 } },
    { name: 'Coursework first', delta: { attendance: 3, coursework: 16, marks: 2 } },
    { name: 'Balanced plan', delta: { attendance: 8, coursework: 9, marks: 7 } }
  ];
  return options.map((option) => {
    const values = Object.fromEntries(Object.entries(start).map(([key, value]) => [key, Math.min(100, value + option.delta[key])]));
    const result = simulate(values, analysis);
    return { ...option, values, score: result.score, level: result.level, target };
  }).filter((option) => option.score >= target);
}

function priorityValue(analysis, actionDone = false) {
  const urgent = !actionDone && analysis.actions.some((item) => item.priority === 'Urgent');
  return round((100 - analysis.score) + analysis.forecast.percent * 0.5 + (urgent ? 10 : 0));
}

module.exports = {
  LEVELS,
  normaliseSettings,
  validateWeights,
  assessmentPercent,
  applyRule,
  combineScheme,
  subjectMarks,
  isoWeekKey,
  attendanceSummary,
  courseworkCompletion,
  bandFor,
  riskScore,
  buildFactors,
  buildActions,
  forecastStudent,
  evaluate,
  simulate,
  recoveryPaths,
  priorityValue,
  round,
  clamp,
  average
};
