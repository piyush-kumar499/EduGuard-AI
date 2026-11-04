import { CONFIG, LEVELS, createDemoStudents, clamp, round } from './data.js';
import { initState, state, $, escapeHTML, format, riskBadge, setupNavigation, setupSectionSelect, bindCommonEvents } from './app.js';

const view = { metric: 'all', search: '' };

function tone(value, watch, concern) {
  if (value >= watch) return 'heat-good';
  if (value >= concern) return 'heat-watch';
  return 'heat-support';
}

function metricCell(value, label, className, suffix = '%') {
  return `<td class="heat-cell ${className}" title="${escapeHTML(label)}">${format(value)}${suffix}</td>`;
}

function render() {
  const section = state.section;
  const query = view.search.trim().toLowerCase();
  const students = state.students.filter((student) => (section === 'ALL' || student.section === section) && (!query || `${student.name} ${student.roll}`.toLowerCase().includes(query))).sort((a, b) => state.analyses.get(a.id).score - state.analyses.get(b.id).score);
  const metricText = view.metric === 'all' ? 'Attendance, assignments, subjects and recent trend' : `Showing ${view.metric.toLowerCase()} performance`;
  $('[data-heat-note]').textContent = `${students.length} students · sorted by current score · ${metricText}`;
  $('[data-heat-count]').textContent = students.length;
  const body = $('[data-heat-rows]');
  body.innerHTML = students.length ? students.map((student) => {
    const analysis = state.analyses.get(student.id);
    const signals = analysis.signals;
    const hidden = (key) => view.metric !== 'all' && view.metric !== key ? ' is-muted' : '';
    const subjectCells = signals.subjects.map((subject) => metricCell(subject.value, `${subject.subject}: ${format(subject.value)}%`, `${tone(subject.value, CONFIG.thresholds.marksWatch, CONFIG.thresholds.marksConcern)}${hidden('marks')}`)).join('');
    const trendTone = signals.testDelta >= 2 ? 'heat-good' : signals.testDelta <= -2 ? 'heat-support' : 'heat-watch';
    return `<tr data-student-id="${student.id}"><th scope="row"><strong>${escapeHTML(student.name)}</strong><small>${escapeHTML(student.roll)} · ${escapeHTML(student.section)}</small></th>${metricCell(signals.attendance, `Attendance: ${format(signals.attendance)}%`, `${tone(signals.attendance, CONFIG.thresholds.attendanceWatch, CONFIG.thresholds.attendanceConcern)}${hidden('attendance')}`)}${metricCell(signals.assignments, `Assignments: ${format(signals.assignments)}%`, `${tone(signals.assignments, CONFIG.thresholds.assignmentWatch, CONFIG.thresholds.assignmentConcern)}${hidden('assignments')}`)}${subjectCells}${metricCell(signals.testDelta, `Recent test trend: ${signals.testDelta} points`, `${trendTone}${hidden('trend')}`, ' pts')}<td>${riskBadge(analysis.level, true)}</td></tr>`;
  }).join('') : '<tr><td colspan="9"><div class="empty-state"><strong>No students found</strong><span>Try another section or search.</span></div></td></tr>';
}

function renderLegend() {
  const students = state.students.filter((student) => state.section === 'ALL' || student.section === state.section);
  const counts = { high: 0, medium: 0, low: 0 };
  students.forEach((student) => { counts[state.analyses.get(student.id).level] += 1; });
  $('[data-heat-summary]').innerHTML = Object.entries(counts).map(([key, value]) => `<div><span class="dot dot-${key}"></span><strong>${value}</strong><small>${LEVELS[key].label}</small></div>`).join('');
}

function bind() {
  setupNavigation('heatmap');
  setupSectionSelect($('[data-section-select]'));
  $('[data-heat-search]')?.addEventListener('input', (event) => { view.search = event.target.value; render(); });
  $('[data-heat-metric]')?.addEventListener('change', (event) => { view.metric = event.target.value; render(); });
  document.addEventListener('dashboard:filter', () => { render(); renderLegend(); });
  bindCommonEvents();
}

initState(createDemoStudents());
bind();
render();
renderLegend();
