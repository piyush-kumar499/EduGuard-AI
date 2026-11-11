'use strict';

const analytics = require('../analytics');
const { assertSection, assertSubject } = require('../permissions');
const validate = require('../validate');

async function dashboard(ctx) {
  const scope = await ctx.getScope();
  const sectionId = ctx.query.sectionId || ctx.query.section || null;
  const subjectId = ctx.query.subjectId || ctx.query.subject || null;
  if (sectionId) assertSection(scope, sectionId);
  if (subjectId) assertSubject(scope, subjectId);
  const context = await analytics.loadContext(scope);
  return analytics.dashboardView(context, { sectionId, subjectId });
}

async function heatmap(ctx) {
  const scope = await ctx.getScope();
  const sectionId = ctx.query.sectionId || ctx.query.section || null;
  if (sectionId) assertSection(scope, sectionId);
  const search = validate.str(ctx.query.q || '', 'Search', { min: 0, max: 120, required: false });
  const context = await analytics.loadContext(scope);
  return analytics.heatmapView(context, { sectionId, search });
}

async function fairness(ctx) {
  const scope = await ctx.getScope();
  const context = await analytics.loadContext(scope);
  return analytics.fairnessView(context);
}

async function subjectAnalytics(ctx) {
  const scope = await ctx.getScope();
  const subjectId = validate.id(ctx.params.id, 'Subject');
  assertSubject(scope, subjectId);
  const sectionId = ctx.query.sectionId || ctx.query.section || null;
  if (sectionId) {
    const { assertScope } = require('../permissions');
    assertScope(scope, subjectId, sectionId);
  }
  const context = await analytics.loadContext(scope);
  return analytics.subjectAnalytics(context, subjectId, sectionId);
}

async function progress(ctx) {
  const scope = await ctx.getScope();
  const context = await analytics.loadContext(scope);
  const rows = analytics.progressRows(context);
  return {
    term: { id: context.term.id, name: context.term.name },
    rows,
    summary: {
      total: rows.length,
      empty: rows.filter((row) => row.empty).length,
      overdue: rows.filter((row) => row.overdue).length,
      complete: rows.filter((row) => row.completeness >= 100).length,
      averageCompleteness: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.completeness, 0) / rows.length) : 0
    }
  };
}

async function subjects(ctx) {
  const scope = await ctx.getScope();
  const context = await analytics.loadContext(scope);
  const cards = await analytics.subjectCards(context);
  return {
    term: { id: context.term.id, name: context.term.name },
    cards,
    role: scope.role
  };
}

module.exports = [
  { method: 'GET', path: 'analytics/dashboard', handler: dashboard },
  { method: 'GET', path: 'analytics/heatmap', handler: heatmap },
  { method: 'GET', path: 'analytics/fairness', handler: fairness },
  { method: 'GET', path: 'analytics/subject/:id', handler: subjectAnalytics },
  { method: 'GET', path: 'analytics/progress', handler: progress, hod: true },
  { method: 'GET', path: 'analytics/subjects', handler: subjects }
];
