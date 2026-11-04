import { CONFIG, LEVELS, createDemoStudents, average, clamp, round } from './data.js';
import { initState, state, $, $$, escapeHTML, format, riskBadge, trendLabel, filteredStudents, setupNavigation, setupSectionSelect, setupCSV, bindCommonEvents, download, sampleCSV, isActionDone, priorityValue } from './app.js';

const view = { search: '', risk: 'all', sort: 'score', direction: 'asc' };

function currentStudents() { return filteredStudents({ search: view.search, risk: view.risk }); }

function renderFocus() {
  const container = $('[data-focus-list]');
  if (!container) return;
  const list = filteredStudents({ section: state.section }).map((student) => {
    const analysis = state.analyses.get(student.id);
    const complete = analysis.actions.every((item) => isActionDone(student.id, item.id));
    return { student, analysis, priority: priorityValue(analysis, complete) };
  }).sort((a, b) => b.priority - a.priority).slice(0, 5);
  $('[data-focus-count]').textContent = list.length;
  container.innerHTML = list.length ? list.map(({ student, analysis }, index) => `<article class="focus-row"><span class="focus-rank">${index + 1}</span><div><strong>${escapeHTML(student.roll)}</strong><small>Section ${escapeHTML(student.section)}</small></div>${riskBadge(analysis.level, true)}<p>${escapeHTML(analysis.factors[0]?.title || 'Core signals are steady')}</p><span class="forecast-chip">${analysis.forecast.percent}% <small>next test</small></span><button class="button button-small" data-student-id="${student.id}">Open</button></article>`).join('') : '<p class="empty-copy">No students match this section.</p>';
}

const SUMMARY_ICONS = {
  users: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.1"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16.2 5.4a3 3 0 0 1 0 5.2M17.5 20a6.6 6.6 0 0 0-1.6-4.3 4.6 4.6 0 0 1 5.6 4.3"/></svg>',
  alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.4 2.9 19.4h18.2L12 3.4Z"/><path d="M12 9.4v4.2M12 16.6h.01"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.6 12S6.2 5.6 12 5.6 21.4 12 21.4 12 17.8 18.4 12 18.4 2.6 12 2.6 12Z"/><circle cx="12" cy="12" r="2.8"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8.2 12.2 2.6 2.6 5-5.4"/></svg>',
  trend: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3.5 16.5 5.2-5.2 3.8 3.8 7.9-8.6"/><path d="M14.6 6.5h5.8v5.8"/></svg>'
};

function renderSummary() {
  const students = filteredStudents({ section: state.section });
  const counts = { high: 0, medium: 0, low: 0 };
  students.forEach((student) => { counts[state.analyses.get(student.id).level] += 1; });
  const improved = students.filter((student) => state.analyses.get(student.id).signals.testDelta > 1).length;
  const total = students.length || 1;
  const share = (value) => `${Math.round((value / total) * 100)}% of this view`;
  const cards = [
    ['Students', students.length, state.section === 'ALL' ? 'Across all sections' : `Section ${state.section}`, 'blue', 'users'],
    ['Needs support', counts.high, share(counts.high), 'red', 'alert'],
    ['Watch closely', counts.medium, share(counts.medium), 'amber', 'eye'],
    ['On track', counts.low, share(counts.low), 'green', 'check'],
    ['Improving', improved, 'T3 average above T1', 'violet', 'trend']
  ];
  $('[data-summary]').innerHTML = cards.map(([label, value, note, tone, icon]) => `<article class="summary-card summary-${tone}"><div class="summary-top"><span>${label}</span><i class="summary-icon">${SUMMARY_ICONS[icon]}</i></div><strong>${value}</strong><small>${note}</small></article>`).join('');
}

function renderDistribution() {
  const students = filteredStudents({ section: state.section });
  const counts = { high: 0, medium: 0, low: 0 };
  students.forEach((student) => { counts[state.analyses.get(student.id).level] += 1; });
  const total = students.length || 1;
  const high = Math.round((counts.high / total) * 100);
  const medium = Math.round((counts.medium / total) * 100);
  $('[data-distribution]').innerHTML = `<div class="donut" style="--high:${high}%;--medium:${medium}%"><strong>${students.length}</strong><span>students</span></div><div class="legend">${[['high', 'Needs support'], ['medium', 'Watch closely'], ['low', 'On track']].map(([key, label]) => `<div><i class="dot dot-${key}"></i><span>${label}</span><b>${counts[key]}</b><small>${Math.round((counts[key] / total) * 100)}%</small></div>`).join('')}</div>`;
}

const SECTION_COLOURS = ['#4f46e5', '#0891b2', '#d97706', '#7c3aed', '#059669'];

function sectionTestAverage(students, test) {
  return Math.round(average(students.map((student) => average(CONFIG.subjects.map((subject) => Number(student.marks?.[test]?.[subject]) || 0)))));
}

function smoothPath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const before = points[index - 1] || points[index];
    const start = points[index];
    const end = points[index + 1];
    const after = points[index + 2] || end;
    const controlOneX = start.x + (end.x - before.x) / 6;
    const controlOneY = start.y + (end.y - before.y) / 6;
    const controlTwoX = end.x - (after.x - start.x) / 6;
    const controlTwoY = end.y - (after.y - start.y) / 6;
    path += ` C ${controlOneX.toFixed(1)} ${controlOneY.toFixed(1)} ${controlTwoX.toFixed(1)} ${controlTwoY.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
  }
  return path;
}

function renderTrend() {
  const container = $('[data-trend-chart]');
  const legend = $('[data-trend-legend]');
  if (!container) return;
  const sections = [...new Set(state.students.map((student) => student.section))].sort();
  const series = sections.map((section, index) => {
    const students = state.students.filter((student) => student.section === section);
    return {
      section,
      colour: SECTION_COLOURS[index % SECTION_COLOURS.length],
      values: CONFIG.tests.map((test) => sectionTestAverage(students, test)),
      dim: state.section !== 'ALL' && state.section !== section
    };
  }).filter((item) => item.values.some((value) => value > 0));
  const allValues = series.flatMap((item) => item.values);
  if (!allValues.length) {
    container.innerHTML = '<p class="empty-copy">No assessment data in this view.</p>';
    if (legend) legend.innerHTML = '';
    return;
  }

  const width = 760;
  const height = 254;
  const padLeft = 42;
  const padRight = 62;
  const padTop = 16;
  const padBottom = 34;
  let min = Math.max(0, Math.floor((Math.min(...allValues) - 8) / 5) * 5);
  let max = Math.min(100, Math.ceil((Math.max(...allValues) + 8) / 5) * 5);
  if (max - min < 25) { max = Math.min(100, min + 25); min = Math.max(0, max - 25); }
  const xAt = (index) => padLeft + (index * (width - padLeft - padRight)) / Math.max(1, CONFIG.tests.length - 1);
  const yAt = (value) => padTop + (1 - (value - min) / (max - min)) * (height - padTop - padBottom);
  const ticks = Array.from({ length: 5 }, (_, index) => min + ((max - min) * index) / 4);
  const grid = ticks.map((tick) => `<line class="chart-grid" x1="${padLeft}" y1="${yAt(tick).toFixed(1)}" x2="${width - padRight}" y2="${yAt(tick).toFixed(1)}"/><text class="chart-axis" x="${padLeft - 10}" y="${(yAt(tick) + 4).toFixed(1)}" text-anchor="end">${Math.round(tick)}</text>`).join('');
  const labels = CONFIG.tests.map((test, index) => `<text class="chart-axis chart-axis-x" x="${xAt(index).toFixed(1)}" y="${height - 10}" text-anchor="middle">${escapeHTML(test)}</text>`).join('');
  const baseline = height - padBottom;
  const defs = series.map((item, index) => `<linearGradient id="trend-area-${index}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${item.colour}" stop-opacity="0.26"/><stop offset="100%" stop-color="${item.colour}" stop-opacity="0"/></linearGradient>`).join('');
  const endPoints = series.map((item) => ({ colour: item.colour, value: item.values[item.values.length - 1], y: yAt(item.values[item.values.length - 1]) }));
  endPoints.sort((a, b) => a.y - b.y);
  endPoints.forEach((point, index) => {
    if (index > 0 && point.y - endPoints[index - 1].y < 15) point.y = endPoints[index - 1].y + 15;
  });
  const endLabels = endPoints.map((point) => `<text class="chart-endlabel" x="${(xAt(CONFIG.tests.length - 1) + 9).toFixed(1)}" y="${(point.y + 4).toFixed(1)}" fill="${point.colour}">${format(point.value)}%</text>`).join('');
  const lines = series.map((item, index) => {
    const points = item.values.map((value, pointIndex) => ({ x: xAt(pointIndex), y: yAt(value), value }));
    const line = smoothPath(points);
    const area = `${line} L ${points[points.length - 1].x.toFixed(1)} ${baseline} L ${points[0].x.toFixed(1)} ${baseline} Z`;
    const dots = points.map((point, pointIndex) => `<g class="chart-point"><circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4.4" stroke="${item.colour}"/><title>Section ${escapeHTML(item.section)} · ${escapeHTML(CONFIG.tests[pointIndex])}: ${format(point.value)}%</title></g>`).join('');
    return `<g class="chart-series${item.dim ? ' is-dim' : ''}"><path class="chart-area" d="${area}" fill="url(#trend-area-${index})"/><path class="chart-line" d="${line}" stroke="${item.colour}"/>${dots}</g>`;
  }).join('');

  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Average marks by section across ${escapeHTML(CONFIG.tests.join(', '))}"><defs>${defs}</defs>${grid}${labels}${lines}${endLabels}</svg>`;
  if (legend) legend.innerHTML = series.map((item) => `<span class="trend-key${item.dim ? ' is-dim' : ''}"><i style="background:${item.colour}"></i>Section ${escapeHTML(item.section)}<b>${format(item.values[item.values.length - 1])}%</b></span>`).join('');

  const scope = filteredStudents({ section: state.section });
  const latest = scope.length ? Math.round(average(scope.map((student) => sectionTestAverage([student], 'T3')))) : 0;
  const first = scope.length ? Math.round(average(scope.map((student) => sectionTestAverage([student], 'T1')))) : 0;
  const delta = Math.round((latest - first) * 10) / 10;
  const chip = $('[data-trend-delta]');
  if (chip) {
    chip.className = `delta-chip ${delta > 1 ? 'delta-up' : delta < -1 ? 'delta-down' : ''}`.trim();
    chip.textContent = `${delta > 0 ? '+' : ''}${format(delta)} pts from T1`;
  }
}

function renderSectionChart() {
  const sections = [...new Set(state.students.map((student) => student.section))].sort();
  const rows = sections.map((section) => {
    const students = state.students.filter((student) => student.section === section);
    return {
      section,
      attendance: Math.round(average(students.map((student) => student.attendance.overall))),
      assignments: Math.round(average(students.map((student) => student.assignments))),
      marks: Math.round(average(students.map((student) => average(CONFIG.tests.map((test) => sectionTestAverage([student], test))))))
    };
  });
  const series = [['attendance', 'Attendance'], ['assignments', 'Assignments'], ['marks', 'Marks']];
  $('[data-section-chart]').innerHTML = rows.length
    ? `<div class="vchart-legend">${series.map(([key, label]) => `<span class="trend-key"><i class="series-${key}"></i>${label}</span>`).join('')}</div><div class="vchart-plot">${rows.map((row) => `<div class="vgroup"><div class="vbars">${series.map(([key, label]) => `<i class="vbar vbar-${key}" style="height:${clamp(row[key])}%" title="Section ${escapeHTML(row.section)} · ${label}: ${format(row[key])}%"><em>${format(row[key])}%</em></i>`).join('')}</div><span class="vgroup-label">Section ${escapeHTML(row.section)}</span></div>`).join('')}</div>`
    : '<p class="empty-copy">No sections to compare yet.</p>';
}

function renderReasons() {
  const counts = {};
  filteredStudents({ section: state.section }).forEach((student) => {
    const analysis = state.analyses.get(student.id);
    if (analysis.level === 'low') return;
    [...new Set(analysis.factors.filter((item) => item.category).map((item) => item.category))].forEach((category) => { counts[category] = (counts[category] || 0) + 1; });
  });
  const labels = { attendance: 'Attendance gaps', assignments: 'Incomplete assignments', marks: 'Low test averages', subject: 'Subject focus', trend: 'Falling trend' };
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = rows[0]?.[1] || 1;
  $('[data-reasons]').innerHTML = rows.length ? rows.map(([key, value]) => `<div class="reason-row"><span>${labels[key] || key}</span><i><b style="width:${(value / max) * 100}%"></b></i><strong>${value}</strong></div>`).join('') : '<p class="empty-copy">No flagged reasons in this view.</p>';
}

function renderFairness() {
  const sections = [...new Set(state.students.map((student) => student.section))].sort();
  const rows = sections.map((section) => {
    const students = state.students.filter((student) => student.section === section);
    const flagged = students.filter((student) => state.analyses.get(student.id).level !== 'low').length;
    return { section, total: students.length, flagged, share: students.length ? round((flagged / students.length) * 100) : 0 };
  });
  const shares = rows.map((row) => row.share);
  const gap = shares.length > 1 ? round(Math.max(...shares) - Math.min(...shares)) : 0;
  $('[data-fairness-gap]').textContent = `Gap ${format(gap)} pts`;
  $('[data-fairness-list]').innerHTML = rows.map((row) => `<div class="fairness-row"><strong>Section ${escapeHTML(row.section)}</strong><i><b style="width:${clamp(row.share)}%"></b></i><span>${format(row.share)}% · ${row.flagged}/${row.total}</span></div>`).join('') + (gap > 15 ? '<p class="fairness-warning">There is a large difference between sections. Review class size, timetable, access and context before changing support decisions.</p>' : '');
}

function sortStudents(students) {
  const get = (student) => { const analysis = state.analyses.get(student.id); return { score: analysis.score, name: student.name.toLowerCase(), attendance: student.attendance.overall, assignments: student.assignments, marks: analysis.signals.avgMarks, trend: analysis.signals.testDelta }[view.sort]; };
  const direction = view.direction === 'asc' ? 1 : -1;
  return students.sort((a, b) => { const left = get(a); const right = get(b); return (left < right ? -1 : left > right ? 1 : a.roll.localeCompare(b.roll)) * direction; });
}

function renderTable() {
  const students = sortStudents(currentStudents());
  const body = $('[data-student-rows]');
  body.innerHTML = students.length ? students.map((student) => {
    const analysis = state.analyses.get(student.id);
    return `<tr data-student-id="${student.id}"><td><div class="student-cell"><span class="avatar">${escapeHTML(student.name.split(' ').map((part) => part[0]).slice(0, 2).join(''))}</span><span><strong>${escapeHTML(student.name)}</strong><small>${escapeHTML(student.roll)}</small></span></div></td><td>Section ${escapeHTML(student.section)}</td><td class="${analysis.signals.attendance < 75 ? 'value-negative' : ''}">${format(analysis.signals.attendance)}%</td><td class="${analysis.signals.assignments < 65 ? 'value-negative' : ''}">${format(analysis.signals.assignments)}%</td><td class="${analysis.signals.avgMarks < 50 ? 'value-negative' : ''}">${format(analysis.signals.avgMarks)}%</td><td>${riskBadge(analysis.level)} <small class="score-number">${format(analysis.score)}</small></td><td>${trendLabel(analysis.signals.testDelta)}</td><td><span class="forecast-chip">${analysis.forecast.percent}%</span></td></tr>`;
  }).join('') : '<tr><td colspan="8"><div class="empty-state"><strong>No students found</strong><span>Try another search or filter.</span></div></td></tr>';
  const count = $('[data-table-count]');
  if (count) count.textContent = students.length;
  $('[data-table-note]').textContent = `${students.length} of ${state.students.filter((student) => state.section === 'ALL' || student.section === state.section).length} students · click a row for the full record`;
}

function renderFilters() {
  const scope = state.students.filter((student) => state.section === 'ALL' || student.section === state.section);
  const counts = { all: scope.length, high: 0, medium: 0, low: 0 };
  scope.forEach((student) => { counts[state.analyses.get(student.id).level] += 1; });
  $('[data-risk-filters]').innerHTML = [['all', 'All'], ['high', 'Needs support'], ['medium', 'Watch'], ['low', 'On track']].map(([key, label]) => `<button class="filter-pill ${view.risk === key ? 'active' : ''}" data-risk="${key}">${label}<b>${counts[key]}</b></button>`).join('');
}

function renderAll() {
  renderFocus(); renderSummary(); renderFairness(); renderTrend(); renderDistribution(); renderSectionChart(); renderReasons(); renderFilters(); renderTable();
}

function exportAtRisk() {
  const rows = filteredStudents({ section: state.section }).filter((student) => state.analyses.get(student.id).level !== 'low').map((student) => {
    const analysis = state.analyses.get(student.id);
    return [student.roll, student.name, student.section, format(analysis.signals.attendance), format(analysis.signals.assignments), format(analysis.signals.avgMarks), LEVELS[analysis.level].label, format(analysis.score), analysis.factors[0]?.title || '', analysis.actions[0]?.title || ''];
  });
  const quote = (value) => /[",\n]/.test(value) ? `"${String(value).replaceAll('"', '""')}"` : value;
  download(`at-risk-students-${new Date().toISOString().slice(0, 10)}.csv`, [['Roll', 'Name', 'Section', 'Attendance', 'Assignments', 'Marks', 'Risk', 'Score', 'Top factor', 'First action'], ...rows].map((row) => row.map(quote).join(',')).join('\n'), 'text/csv');
}

function weeklyData() {
  const students = filteredStudents({ section: state.section });
  const counts = { high: 0, medium: 0, low: 0 };
  const reasons = {};
  students.forEach((student) => {
    const analysis = state.analyses.get(student.id);
    counts[analysis.level] += 1;
    if (analysis.level !== 'low') [...new Set(analysis.factors.filter((item) => item.category).map((item) => item.category))].forEach((key) => { reasons[key] = (reasons[key] || 0) + 1; });
  });
  const labels = { attendance: 'attendance gaps', assignments: 'incomplete assignments', marks: 'low test averages', subject: 'a subject focus', trend: 'a falling trend' };
  const reason = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
  const scope = state.section === 'ALL' ? 'the class' : `Section ${state.section}`;
  return { scope, total: students.length, counts, reason: reason ? labels[reason[0]] : 'no single shared reason', actions: [
    'Start with the five students in Today’s focus and make the first conversation specific.',
    `Plan one short class activity around ${reason ? labels[reason[0]] : 'the next assessment'}.`,
    `Check in with the ${counts.medium} students on watch before the next test.`,
    'Review attendance and assignment completion midway through the week.',
    'After the next assessment, compare the result with this view and keep what helped.'
  ] };
}

async function generateWeekly() {
  const dialog = $('[data-weekly-dialog]');
  const body = $('[data-weekly-body]');
  if (!dialog || !body) return;
  dialog.showModal();
  body.innerHTML = '<div class="loading-line"><span class="spinner"></span> Preparing a class plan…</div>';
  const fallback = weeklyData();
  const fallbackView = { summary: `${fallback.counts.high} of ${fallback.total} students in ${fallback.scope} need support, and ${fallback.counts.medium} are worth watching. The most common shared reason is ${fallback.reason}.`, actions: fallback.actions };
  try {
    const response = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'weekly', class: { scope: fallback.scope, total: fallback.total, high: fallback.counts.high, medium: fallback.counts.medium, low: fallback.counts.low, improved: filteredStudents({ section: state.section }).filter((student) => state.analyses.get(student.id).signals.testDelta > 1).length } }) });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) throw new Error('offline');
    body.innerHTML = `<p class="weekly-summary">${escapeHTML(data.result.summary || fallbackView.summary)}</p><ol class="weekly-actions">${(data.result.actions || fallbackView.actions).slice(0, 5).map((action) => `<li>${escapeHTML(typeof action === 'string' ? action : action.action || action.detail || '')}</li>`).join('')}</ol><span class="ai-note">AI suggestion · teacher decides</span>`;
  } catch {
    body.innerHTML = `<span class="offline-label">Offline template</span><p class="weekly-summary">${escapeHTML(fallbackView.summary)}</p><ol class="weekly-actions">${fallbackView.actions.map((action) => `<li>${escapeHTML(action)}</li>`).join('')}</ol><span class="ai-note">Template suggestion · teacher decides</span>`;
  }
}

function bindDashboard() {
  setupNavigation('dashboard');
  setupSectionSelect($('[data-section-select]'));
  setupCSV({ input: $('[data-csv-input]'), button: $('[data-import]'), reset: $('[data-reset]'), status: $('[data-upload-status]'), onImported: () => { setupSectionSelect($('[data-section-select]')); renderAll(); } });
  $('[data-download-sample]')?.addEventListener('click', (event) => { event.preventDefault(); sampleCSV(); });
  $('[data-export]')?.addEventListener('click', exportAtRisk);
  $('[data-weekly]')?.addEventListener('click', generateWeekly);
  $('[data-close-weekly]')?.addEventListener('click', () => $('[data-weekly-dialog]')?.close());
  $('[data-search]')?.addEventListener('input', (event) => { view.search = event.target.value; renderTable(); });
  $('[data-sort]')?.addEventListener('change', (event) => { view.sort = event.target.value; view.direction = event.target.value === 'score' ? 'asc' : 'desc'; renderTable(); });
  $('[data-direction]')?.addEventListener('click', () => { view.direction = view.direction === 'asc' ? 'desc' : 'asc'; renderTable(); });
  $('[data-risk-filters]')?.addEventListener('click', (event) => { const button = event.target.closest('[data-risk]'); if (button) { view.risk = button.dataset.risk; renderFilters(); renderTable(); } });
  $('[data-focus-toggle]')?.addEventListener('click', (event) => { const panel = $('[data-focus-panel]'); const expanded = panel.classList.toggle('is-expanded'); event.currentTarget.setAttribute('aria-expanded', expanded); event.currentTarget.querySelector('span').textContent = expanded ? 'Hide list' : 'Show list'; panel.classList.toggle('is-collapsed', !expanded); });
  document.addEventListener('dashboard:filter', renderAll);
  bindCommonEvents();
}

initState(createDemoStudents());
bindDashboard();
renderAll();
