import { CONFIG, LEVELS, average, clamp, round } from './data.js';

const safe = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function subjectAverage(student, subject) {
  return round(CONFIG.tests.reduce((total, test) => total + safe(student.marks?.[test]?.[subject]) * CONFIG.testWeights[test], 0));
}

export function testAverage(student, test) {
  return round(average(CONFIG.subjects.map((subject) => safe(student.marks?.[test]?.[subject]))));
}

function getSignals(student) {
  const tests = CONFIG.tests.map((test) => ({ test, value: testAverage(student, test) }));
  const subjects = CONFIG.subjects.map((subject) => ({ subject, value: subjectAverage(student, subject) }));
  const weeks = student.attendance?.weeks?.length === 4 ? student.attendance.weeks.map(safe) : [];
  const avgMarks = round(average(subjects.map((item) => item.value)));
  return {
    attendance: round(student.attendance?.overall),
    assignments: round(student.assignments),
    avgMarks,
    latestTest: tests[2]?.value || 0,
    earliestTest: tests[0]?.value || 0,
    testDelta: round((tests[2]?.value || 0) - (tests[0]?.value || 0)),
    recentDelta: round((tests[2]?.value || 0) - (tests[1]?.value || 0)),
    attendanceTrend: weeks.length ? round(weeks[3] - weeks[0]) : 0,
    attendanceDrop: weeks.length ? round(Math.max(0, weeks[0] - weeks[3])) : 0,
    weeks,
    tests,
    subjects,
    weakest: [...subjects].sort((a, b) => a.value - b.value)[0],
    strongest: [...subjects].sort((a, b) => b.value - a.value)[0]
  };
}

export function scoreStudent(student, overrides = {}) {
  const signals = getSignals(student);
  const attendance = clamp(overrides.attendance ?? signals.attendance);
  const assignments = clamp(overrides.assignments ?? signals.assignments);
  const marks = clamp(overrides.marks ?? signals.avgMarks);
  const parts = [
    { key: 'attendance', label: 'Attendance', value: attendance, weight: 35, points: round(attendance * 0.35) },
    { key: 'assignments', label: 'Assignments', value: assignments, weight: 25, points: round(assignments * 0.25) },
    { key: 'marks', label: 'Weighted marks', value: marks, weight: 40, points: round(marks * 0.4) }
  ];
  const penalties = [];
  if (signals.tests[0].value > signals.tests[1].value && signals.tests[1].value > signals.tests[2].value) penalties.push({ label: 'Marks fell across tests', points: -5 });
  if (signals.attendanceDrop >= CONFIG.thresholds.attendanceDrop) penalties.push({ label: `Attendance fell ${signals.attendanceDrop} points`, points: -5 });
  const score = round(clamp(parts.reduce((total, part) => total + part.points, 0) + penalties.reduce((total, item) => total + item.points, 0)));
  const level = score >= CONFIG.thresholds.onTrack ? 'low' : score >= CONFIG.thresholds.watch ? 'medium' : 'high';
  return { score, level, parts, penalties, signals };
}

function factor(id, category, title, text, impact, tone = 'risk') { return { id, category, title, text, impact, tone }; }

function buildFactors(base) {
  const { signals } = base;
  const t = CONFIG.thresholds;
  const risks = [];
  const positives = [];
  if (signals.attendance < t.attendanceWatch) risks.push(factor('attendance', 'attendance', 'Attendance needs support', `${signals.attendance}% is below the ${t.attendanceWatch}% watch line.`, round((t.attendanceWatch - signals.attendance) * 0.35)));
  if (signals.assignments < t.assignmentWatch) risks.push(factor('assignments', 'assignments', 'Assignments are incomplete', `${signals.assignments}% completion is below the ${t.assignmentWatch}% expectation.`, round((t.assignmentWatch - signals.assignments) * 0.25)));
  if (signals.avgMarks < t.marksWatch) risks.push(factor('marks', 'marks', 'Test averages need support', `The weighted average is ${signals.avgMarks}%, with the latest test at ${signals.latestTest}%.`, round((t.marksWatch - signals.avgMarks) * 0.4)));
  if (signals.weakest?.value < t.marksWatch) risks.push(factor('subject', 'subject', `${signals.weakest.subject} is the focus subject`, `${signals.weakest.subject} is the lowest subject average at ${signals.weakest.value}%.`, round((t.marksWatch - signals.weakest.value) * 0.25)));
  if (base.penalties.some((item) => item.label.startsWith('Marks'))) risks.push(factor('decline', 'trend', 'Marks are falling', `Average marks moved from ${signals.earliestTest}% in T1 to ${signals.latestTest}% in T3.`, 5));
  if (signals.attendanceDrop >= t.attendanceDrop) risks.push(factor('attendance-drop', 'trend', 'Attendance has slipped', `Weekly attendance fell ${signals.attendanceDrop} points from the first to the latest week.`, 5));
  if (signals.testDelta >= 3) positives.push(factor('improving', 'trend', 'Recent marks are improving', `The test average is up ${signals.testDelta} points from T1 to T3.`, 0, 'positive'));
  if (!risks.length) positives.push(factor('steady', null, 'Core signals are steady', 'The main indicators are above their watch lines. Keep checking the next assessment.', 0, 'positive'));
  return [...risks.sort((a, b) => b.impact - a.impact).slice(0, 5), ...positives.slice(0, 2)];
}

function buildActions(base, factors) {
  const { signals } = base;
  const ids = new Set(factors.map((item) => item.id));
  const actions = [];
  const add = (id, title, detail, priority) => { if (!actions.some((item) => item.id === id)) actions.push({ id, title, detail, priority }); };
  if (ids.has('attendance')) add('attendance-check', 'Have a short attendance conversation', 'Ask what is making attendance difficult and agree one realistic step for the coming week.', signals.attendance < 75 ? 'Urgent' : 'Soon');
  if (ids.has('assignments')) add('assignment-plan', 'Create a small catch-up plan', 'Choose the two most useful missing tasks, set dates, and check progress at the end of the week.', signals.assignments < 65 ? 'Urgent' : 'Soon');
  if (ids.has('marks') || ids.has('subject')) add('subject-support', `Plan support for ${signals.weakest.subject}`, `Use the latest test to choose one topic, then recheck it with a short five-question quiz.`, base.level === 'high' ? 'Urgent' : 'Soon');
  if (ids.has('decline')) add('study-routine', 'Review the study routine', 'Look at what changed before the latest test and agree on a short, repeatable revision routine.', 'Soon');
  if (ids.has('improving')) add('recognise-progress', 'Name the progress', 'Point out the improvement and ask which habit helped so it can be repeated.', 'Monitor');
  if (!actions.length) add('monitor', 'Review after the next test', 'Keep the current supports in place and revisit the full picture after the next assessment.', 'Monitor');
  if (actions.length < 3) add('family-checkin', 'Share one clear next step with home', 'Lead with a strength, explain the next step plainly, and invite the family to share context.', 'Monitor');
  return actions.sort((a, b) => ({ Urgent: 0, Soon: 1, Monitor: 2 }[a.priority] - ({ Urgent: 0, Soon: 1, Monitor: 2 }[b.priority]))).slice(0, 4);
}

export function forecastStudent(base) {
  const s = base.signals;
  const raw = 0.14 * (100 - s.attendance) + 0.18 * (100 - s.assignments) + 0.32 * (100 - s.avgMarks) + 0.24 * (100 - s.latestTest) + 0.7 * Math.max(0, -s.attendanceTrend) + 0.9 * Math.max(0, -s.recentDelta) + 8;
  const percent = Math.round(clamp(raw, 1, 99));
  const band = percent >= 60 ? 'high' : percent >= 35 ? 'medium' : 'low';
  const factors = [
    ['Average marks', s.avgMarks, 65, s.avgMarks < 65],
    ['Latest test', s.latestTest, 60, s.latestTest < 60],
    ['Attendance trend', s.attendanceTrend, 0, s.attendanceTrend < 0]
  ].filter(([, , , active]) => active).slice(0, 3).map(([label, value, threshold]) => ({ label, text: `${label} is ${round(value)}${label === 'Attendance trend' ? ' points over four weeks' : '%'}.`, direction: value < threshold ? 'up' : 'down' }));
  return { percent, band, factors };
}

export function analyzeStudent(student) {
  const base = scoreStudent(student);
  const factors = buildFactors(base);
  return { ...base, student, factors, actions: buildActions(base, factors), forecast: forecastStudent(base) };
}

export function recoveryPaths(analysis) {
  if (analysis.level === 'low') return [];
  const target = analysis.level === 'high' ? 50 : 70;
  const start = { attendance: Math.round(analysis.signals.attendance), assignments: Math.round(analysis.signals.assignments), marks: Math.round(analysis.signals.avgMarks) };
  const options = [
    { name: 'Attendance first', delta: { attendance: 14, assignments: 3, marks: 2 } },
    { name: 'Assignments first', delta: { attendance: 3, assignments: 16, marks: 2 } },
    { name: 'Balanced plan', delta: { attendance: 8, assignments: 9, marks: 7 } }
  ];
  return options.map((option) => {
    const values = Object.fromEntries(Object.entries(start).map(([key, value]) => [key, Math.min(100, value + option.delta[key])]));
    const score = scoreStudent({ ...analysis.student, attendance: { overall: values.attendance, weeks: analysis.signals.weeks }, assignments: values.assignments }, { marks: values.marks }).score;
    return { ...option, values, score, target };
  }).filter((option) => option.score >= target);
}

export function priorityValue(analysis, actionDone = false) {
  return (100 - analysis.score) + analysis.forecast.percent * 0.5 + (!actionDone && analysis.actions.some((item) => item.priority === 'Urgent') ? 10 : 0);
}

export { LEVELS };
