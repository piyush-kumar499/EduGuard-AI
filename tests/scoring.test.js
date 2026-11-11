'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const scoring = require('../lib/scoring');

test('validateWeights accepts a total of 100 and rejects invalid totals', () => {
  assert.deepEqual(scoring.validateWeights({ attendance: 35, coursework: 25, marks: 40 }), {
    attendance: 35, coursework: 25, marks: 40
  });
  assert.throws(() => scoring.validateWeights({ attendance: 40, coursework: 30, marks: 40 }), /total 100/);
  assert.throws(() => scoring.validateWeights({ attendance: -1, coursework: 51, marks: 50 }), /between 0 and 100/);
  assert.throws(() => scoring.validateWeights({ attendance: 101, coursework: 0, marks: -1 }), /between 0 and 100/);
});

test('assessmentPercent handles present, absent, exempt and clamping', () => {
  assert.equal(scoring.assessmentPercent(50, 100), 50);
  assert.equal(scoring.assessmentPercent(75, 50), 100);
  assert.equal(scoring.assessmentPercent(10, 50), 20);
  assert.equal(scoring.assessmentPercent(null, 100), null);
  assert.equal(scoring.assessmentPercent(0, 0), null);
  assert.equal(scoring.assessmentPercent(45, 100, 'absent'), 0);
  assert.equal(scoring.assessmentPercent(45, 100, 'absent', false), null);
  assert.equal(scoring.assessmentPercent(45, 100, 'exempt'), null);
});

test('applyRule supports average, best_n and sum', () => {
  const entries = [
    { percent: 50, score: 25, max: 50 },
    { percent: 80, score: 40, max: 50 },
    { percent: 60, score: 30, max: 50 }
  ];
  assert.equal(scoring.applyRule(entries, 'average'), 63.3);
  assert.equal(scoring.applyRule(entries, 'best_n', 2), 70);
  assert.equal(scoring.applyRule(entries, 'best_n', 1), 80);
  assert.equal(scoring.applyRule(entries, 'sum'), 63.3);
  assert.equal(scoring.applyRule([], 'average'), null);
  assert.equal(scoring.applyRule([{ percent: null }], 'average'), null);
});

test('combineScheme re-normalises weights when a type has no data', () => {
  const scheme = [
    { typeId: 'test', weight: 50 },
    { typeId: 'project', weight: 50 }
  ];
  const full = scoring.combineScheme([
    { typeId: 'test', value: 80 },
    { typeId: 'project', value: 40 }
  ], scheme);
  assert.deepEqual(full, { value: 60, method: 'scheme', coverage: 100 });

  const partial = scoring.combineScheme([{ typeId: 'test', value: 80 }], scheme);
  assert.equal(partial.value, 80);
  assert.equal(partial.coverage, 50);

  const empty = scoring.combineScheme([{ typeId: 'test', value: null }], scheme);
  assert.equal(empty.value, null);
});

test('subjectMarks falls back to a plain average without a usable scheme', () => {
  assert.deepEqual(scoring.subjectMarks({ typeResults: [], scheme: [], assessmentPercents: [40, 60] }), {
    value: 50, method: 'average', coverage: 100
  });
  assert.equal(scoring.subjectMarks({ typeResults: [], scheme: [], assessmentPercents: [] }).value, null);

  const weighted = scoring.subjectMarks({
    typeResults: [{ typeId: 'a', value: 90 }, { typeId: 'b', value: 50 }],
    scheme: [{ typeId: 'a', weight: 75 }, { typeId: 'b', weight: 25 }],
    assessmentPercents: [10, 20]
  });
  assert.equal(weighted.method, 'scheme');
  assert.equal(weighted.value, 80);
});

test('bandFor uses the configured watch and on-track lines', () => {
  const thresholds = { onTrack: 70, watch: 50 };
  assert.equal(scoring.bandFor(70, thresholds), 'low');
  assert.equal(scoring.bandFor(69.9, thresholds), 'medium');
  assert.equal(scoring.bandFor(50, thresholds), 'medium');
  assert.equal(scoring.bandFor(49.9, thresholds), 'high');
});

test('riskScore combines the default weights and both penalties', () => {
  const perfect = scoring.riskScore({ attendance: 100, coursework: 100, marks: 100 });
  assert.equal(perfect.score, 100);
  assert.equal(perfect.level, 'low');
  assert.deepEqual(perfect.penalties, []);

  const mixed = scoring.riskScore({ attendance: 80, coursework: 60, marks: 70 });
  assert.equal(mixed.score, 71);
  assert.equal(mixed.level, 'low');
  assert.deepEqual(mixed.parts.map((part) => part.points), [28, 15, 28]);

  const penalised = scoring.riskScore({ attendance: 80, coursework: 60, marks: 70, marksFell: true, attendanceDrop: 10 });
  assert.equal(penalised.score, 61);
  assert.equal(penalised.level, 'medium');
  assert.equal(penalised.penalties.length, 2);
  assert.equal(penalised.penalties[0].points, -5);
});

test('riskScore honours custom weights and thresholds', () => {
  const result = scoring.riskScore({ attendance: 100, coursework: 100, marks: 100 }, {
    score_weights: { attendance: 50, coursework: 0, marks: 50 },
    thresholds: { onTrack: 90, watch: 80 }
  });
  assert.equal(result.score, 100);
  assert.equal(result.level, 'low');
  assert.deepEqual(result.weights, { attendance: 50, coursework: 0, marks: 50 });
});

test('attendanceSummary reports percentage, weekly trend and drop', () => {
  const singleWeek = scoring.attendanceSummary([
    { heldOn: '2026-01-05', present: true },
    { heldOn: '2026-01-06', present: true },
    { heldOn: '2026-01-07', present: true },
    { heldOn: '2026-01-08', present: false }
  ]);
  assert.equal(singleWeek.percent, 75);
  assert.equal(singleWeek.total, 4);
  assert.equal(singleWeek.present, 3);
  assert.equal(singleWeek.weeks.length, 1);

  const falling = scoring.attendanceSummary([
    { heldOn: '2026-01-05', present: true },
    { heldOn: '2026-01-06', present: true },
    { heldOn: '2026-01-12', present: true },
    { heldOn: '2026-01-13', present: false }
  ]);
  assert.equal(falling.weeks.length, 2);
  assert.equal(falling.weeks[0].percent, 100);
  assert.equal(falling.weeks[1].percent, 50);
  assert.equal(falling.trend, -50);
  assert.equal(falling.drop, 50);

  const empty = scoring.attendanceSummary([]);
  assert.equal(empty.percent, null);
  assert.deepEqual(empty.weeks, []);
});

test('courseworkCompletion ignores exempt entries and missing marks', () => {
  assert.equal(scoring.courseworkCompletion([
    { status: 'present', hasMark: true },
    { status: 'present', hasMark: false },
    { status: 'exempt', hasMark: true }
  ]), 50);
  assert.equal(scoring.courseworkCompletion([]), null);
  assert.equal(scoring.courseworkCompletion([{ status: 'exempt' }]), null);
});

test('evaluate produces factors, actions, a forecast and recovery paths', () => {
  const analysis = scoring.evaluate({
    attendance: 62,
    coursework: 55,
    marks: 48,
    latestMark: 40,
    earliestMark: 60,
    markDelta: -20,
    attendanceDrop: 18,
    attendanceTrend: -18,
    recentDelta: -20,
    marksFell: true,
    weakest: { id: 'maths', name: 'Maths', value: 38 },
    subjects: [{ id: 'maths', name: 'Maths', value: 38 }, { id: 'english', name: 'English', value: 58 }]
  });
  assert.equal(analysis.level, 'high');
  assert.ok(analysis.score < 50);
  assert.ok(analysis.factors.length >= 2);
  assert.ok(analysis.actions.length >= 1);
  assert.ok(analysis.forecast.percent >= 1 && analysis.forecast.percent <= 99);
  assert.ok(['high', 'medium', 'low'].includes(analysis.forecast.band));

  const recovery = scoring.recoveryPaths(analysis);
  assert.ok(recovery.length >= 1);
  recovery.forEach((option) => {
    assert.ok(option.score >= option.target);
    assert.ok(option.score <= 100);
  });
});

test('normaliseSettings accepts JSON strings from the settings table', () => {
  const settings = scoring.normaliseSettings({
    score_weights: JSON.stringify({ attendance: 40, coursework: 20, marks: 40 }),
    thresholds: JSON.stringify({ onTrack: 75, watch: 55 }),
    absent_counts_as_zero: 'false',
    min_assessments_for_trend: 4
  });
  assert.deepEqual(settings.weights, { attendance: 40, coursework: 20, marks: 40 });
  assert.equal(settings.thresholds.onTrack, 75);
  assert.equal(settings.absentCountsAsZero, false);
  assert.equal(settings.minAssessmentsForTrend, 4);
});

test('round and clamp keep values predictable', () => {
  assert.equal(scoring.round(63.34), 63.3);
  assert.equal(scoring.round(63.35, 2), 63.35);
  assert.equal(scoring.clamp(-10), 0);
  assert.equal(scoring.clamp(140), 100);
  assert.equal(scoring.clamp('42'), 42);
});
