'use strict';

/**
 * Operations inbox: one compact feed of marks-entry gaps for the shell bell.
 * The payload is intentionally small so it can be fetched on every page.
 */

const analytics = require('../analytics');

function entryAlert(row, { isHod }) {
  const href = `/marks?subjectId=${encodeURIComponent(row.subjectId)}&sectionId=${encodeURIComponent(row.sectionId)}`;
  const classLabel = `${row.subjectName} · ${row.sectionName}`;
  if (row.assessments === 0) {
    return {
      id: `${row.subjectId}:${row.sectionId}`,
      tone: 'info',
      title: 'Set up the first assessment',
      detail: classLabel,
      meta: isHod ? row.owner || 'No faculty assigned' : 'Assigned to you',
      href
    };
  }
  return {
    id: `${row.subjectId}:${row.sectionId}`,
    tone: row.completeness < 40 ? 'danger' : 'warn',
    title: row.completeness < 40 ? 'Marks entry is significantly behind' : 'Marks entry needs attention',
    detail: `${classLabel} · ${row.filled} of ${row.total} marks entered`,
    meta: `${row.completeness}% complete${isHod && row.owner && row.owner !== 'Unassigned' ? ` · ${row.owner}` : ''}`,
    href
  };
}

async function alerts(ctx) {
  const scope = await ctx.getScope();
  const context = await analytics.loadContext(scope);
  const isHod = scope.role === 'HOD';
  const term = { id: context.term.id, name: context.term.name };

  const rows = analytics.progressRows(context).filter(
    (row) => isHod || scope.pairs.has(analytics.pairKey(row.subjectId, row.sectionId))
  );

  if (!rows.length) {
    return {
      items: [],
      total: 0,
      critical: 0,
      classes: 0,
      message: isHod ? 'No classes to track yet.' : 'No classes are assigned to you yet.',
      term
    };
  }

  const gaps = rows.filter((row) => row.assessments === 0 || row.completeness < 100);
  const items = gaps
    .sort((a, b) => {
      if (a.assessments === 0 && b.assessments !== 0) return -1;
      if (b.assessments === 0 && a.assessments !== 0) return 1;
      return a.completeness - b.completeness || a.subjectName.localeCompare(b.subjectName);
    })
    .map((row) => entryAlert(row, { isHod }));

  return {
    items: items.slice(0, 8),
    total: items.length,
    critical: gaps.filter((row) => row.assessments === 0 || row.completeness < 40).length,
    classes: rows.length,
    message: items.length
      ? (items.length === 1 ? '1 class needs marks attention' : `${items.length} classes need marks attention`)
      : 'All classes are fully entered.',
    term
  };
}

module.exports = [
  { method: 'GET', path: 'alerts', handler: alerts }
];
