'use strict';

const { get } = require('../db');
const { enforceRateLimit } = require('../auth');
const { assertSection } = require('../permissions');
const analytics = require('../analytics');
const { runAI } = require('../ai');
const validate = require('../validate');
const { HttpError } = validate;

function studentPayload(analysis) {
  const trend = analysis.signals.assessmentTrend.slice(-3);
  const values = trend.map((point) => point.percent);
  while (values.length < 3) values.unshift(0);
  return {
    type: 'student',
    student: {
      // Anonymous by design: no name, roll number or section leaves the server.
      roll: '',
      section: '',
      attendance: Math.round(analysis.signals.attendance ?? 0),
      attendanceTrend: Math.round(analysis.signals.attendanceTrend ?? 0),
      assignments: Math.round(analysis.signals.coursework ?? 0),
      avgMarks: Math.round(analysis.signals.marks ?? 0),
      t1: Math.round(values[0] || 0),
      t2: Math.round(values[1] || 0),
      t3: Math.round(values[2] || 0),
      testSlope: Math.round((analysis.signals.markDelta || 0) / 2),
      latestTest: Math.round(analysis.signals.latestMark ?? analysis.signals.marks ?? 0),
      score: Math.round(analysis.score ?? 0),
      riskLevel: analysis.level,
      forecast: Math.round(analysis.forecast.percent ?? 0),
      urgentPending: analysis.actions.some((item) => item.priority === 'Urgent') ? 1 : 0,
      reasons: analysis.factors.map((item) => ({ reason: item.title, impact: item.impact }))
    }
  };
}

async function ai(ctx) {
  const user = ctx.user;
  await enforceRateLimit(`ai:${user.id}`, 20, 60 * 1000);
  const type = validate.oneOf(ctx.body?.type, ['student', 'weekly', 'voice'], 'Type');

  let payload;
  if (type === 'student') {
    const studentId = validate.id(ctx.body?.studentId, 'Student');
    const scope = await ctx.getScope();
    const student = await get('SELECT * FROM students WHERE id = ? AND active = 1', [studentId]);
    if (!student) throw new HttpError(404, 'NOT_FOUND', 'Student not found.');
    assertSection(scope, student.section_id);
    const context = await analytics.loadContext(scope);
    const analysis = analytics.analyseStudent(context, student);
    if (!analysis.hasData) throw new HttpError(400, 'NO_DATA', 'There is not enough data yet to draft a support plan.');
    payload = studentPayload(analysis);
  } else if (type === 'weekly') {
    const scope = await ctx.getScope();
    const sectionId = ctx.body?.sectionId ? validate.id(ctx.body.sectionId, 'Section') : null;
    if (sectionId) assertSection(scope, sectionId);
    const context = await analytics.loadContext(scope);
    const view = await analytics.dashboardView(context, { sectionId });
    payload = {
      type: 'weekly',
      class: {
        scope: scope.role === 'HOD' ? 'the whole department' : 'my assigned classes',
        total: view.summary.students,
        high: view.summary.high,
        medium: view.summary.medium,
        low: view.summary.low,
        improved: view.summary.improved,
        topReasons: view.reasons.map((row) => ({ reason: row.label, count: row.count }))
      }
    };
  } else {
    payload = { type: 'voice', messages: Array.isArray(ctx.body?.messages) ? ctx.body.messages : [] };
    if (!payload.messages.length) throw new HttpError(400, 'VALIDATION', 'Send at least one message.');
  }

  try {
    const result = await runAI(payload);
    return { result };
  } catch (error) {
    if (error.code === 'AI_NOT_CONFIGURED') {
      throw new HttpError(503, 'AI_NOT_CONFIGURED', 'The AI service is not configured. The offline template will be used.');
    }
    console.error('[ai] request failed:', error.message);
    throw new HttpError(502, 'AI_FAILED', 'The AI service could not complete that request. The offline template will be used.');
  }
}

module.exports = [
  { method: 'POST', path: 'ai', handler: ai }
];
