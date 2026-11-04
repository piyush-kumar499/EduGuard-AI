import { CONFIG, LEVELS, SAMPLE_CSV, clamp, round, createDemoStudents, parseStudentCSV } from './data.js';
import { analyzeStudent, recoveryPaths, priorityValue } from './scoring.js';

export const state = {
  students: [],
  analyses: new Map(),
  source: 'Demo class',
  selectedId: null,
  section: 'ALL',
  actionState: loadActionState(),
  mentorAssignments: {},
  aiLanguage: {}
};

const icons = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
  alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.8 19h18.4L12 3Z"/><path d="M12 9v4M12 16h.01"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  trend: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16 5-5 4 4 7-8"/><path d="M15 7h5v5"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>'
};

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

export function format(value) {
  const result = round(value);
  return Number.isInteger(result) ? String(result) : result.toFixed(1);
}

export function riskBadge(level, compact = false) {
  const item = LEVELS[level] || LEVELS.medium;
  const icon = level === 'high' ? icons.alert : level === 'medium' ? icons.eye : icons.check;
  return `<span class="risk-badge risk-${item.tone}">${icon}<span>${compact ? item.short : item.label}</span></span>`;
}

export function trendLabel(value) {
  const delta = round(value);
  const tone = delta > 1 ? 'positive' : delta < -1 ? 'negative' : 'neutral';
  return `<span class="trend trend-${tone}">${delta > 0 ? '+' : ''}${format(delta)} pts</span>`;
}

export function download(filename, content, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadActionState() {
  try { return JSON.parse(localStorage.getItem('eduguard-action-state') || '{}'); } catch { return {}; }
}

function saveActionState() {
  try { localStorage.setItem('eduguard-action-state', JSON.stringify(state.actionState)); } catch { /* Private browsing can disable storage. */ }
}

export function actionKey(studentId, actionId) { return `${studentId}:${actionId}`; }
export function isActionDone(studentId, actionId) { return state.actionState[actionKey(studentId, actionId)]?.done === true; }

export function setActionDone(studentId, actionId, done) {
  const key = actionKey(studentId, actionId);
  state.actionState[key] = { ...state.actionState[key], done, note: state.actionState[key]?.note || '' };
  saveActionState();
}

export function setActionNote(studentId, actionId, note) {
  const key = actionKey(studentId, actionId);
  state.actionState[key] = { ...state.actionState[key], note };
  saveActionState();
}

export function initState(students = null, source = 'Demo class') {
  state.students = students || state.students;
  state.source = source;
  state.analyses = new Map(state.students.map((student) => [student.id, { ...analyzeStudent(student), student }]));
  if (!state.students.some((student) => student.section === state.section)) state.section = 'ALL';
  document.body.dataset.source = source === 'Demo class' ? 'demo' : 'upload';
  const meta = $('[data-class-meta]');
  if (meta) meta.textContent = `${CONFIG.className} · ${state.students.length} students · ${source}`;
  const sourceLabel = $('[data-source-label]');
  if (sourceLabel) sourceLabel.textContent = source;
  return state.analyses;
}

export function filteredStudents({ search = '', risk = 'all', section = state.section } = {}) {
  const query = search.trim().toLowerCase();
  return state.students.filter((student) => {
    const analysis = state.analyses.get(student.id);
    const sectionMatch = section === 'ALL' || student.section === section;
    const riskMatch = risk === 'all' || analysis?.level === risk;
    const textMatch = !query || [student.name, student.roll, student.section].some((value) => String(value).toLowerCase().includes(query));
    return sectionMatch && riskMatch && textMatch;
  });
}

export function sections() { return [...new Set(state.students.map((student) => student.section))].sort(); }

function parentMessage(analysis, language = 'en') {
  const firstAction = analysis.actions[0]?.title.toLowerCase() || 'a short check-in';
  const messages = {
    en: `Dear Parent/Guardian,\n\nThank you for supporting your child. We are focusing on ${firstAction} and will keep the next step small and practical. We will review the progress after the next assessment and would value any context that could help us support them well.\n\nKind regards,\nClass teacher`,
    hi: `प्रिय अभिभावक,\n\nआपके सहयोग के लिए धन्यवाद। हम आपके बच्चे के लिए ${firstAction} पर ध्यान दे रहे हैं और अगला कदम छोटा व व्यावहारिक रखेंगे। अगली परीक्षा के बाद प्रगति की समीक्षा करेंगे; बच्चे को बेहतर सहयोग देने के लिए आपके सुझाव हमारे लिए उपयोगी होंगे।\n\nसादर,\nकक्षा शिक्षक`
  };
  return messages[language];
}

function mentorMatches(student, analysis) {
  const subject = analysis.signals.weakest?.subject;
  return state.students.filter((candidate) => {
    if (candidate.id === student.id || candidate.section !== student.section) return false;
    const other = state.analyses.get(candidate.id);
    const subjectMark = other?.signals.subjects.find((item) => item.subject === subject)?.value || 0;
    return other?.level === 'low' && subjectMark >= 80 && candidate.assignments >= 85;
  }).slice(0, 3);
}

function mentorCard(student, analysis) {
  const matches = mentorMatches(student, analysis);
  const assigned = state.mentorAssignments[student.id];
  return `<div class="mentor-card"><div class="section-heading"><div><p class="eyebrow">Peer support</p><h3>Suggested mentor matches</h3></div><span class="section-caption">Same section · max 2 students</span></div><p class="muted">These are low-risk peers with strong work in ${escapeHTML(analysis.signals.weakest?.subject || 'the focus subject')}. A teacher should confirm the pairing first.</p>${matches.length ? `<div class="mentor-list">${matches.map((candidate) => `<div class="mentor-row"><span><strong>${escapeHTML(candidate.roll)}</strong><small>${escapeHTML(candidate.name)} · ${escapeHTML(analysis.signals.weakest?.subject || 'subject')} ${format(state.analyses.get(candidate.id).signals.subjects.find((item) => item.subject === analysis.signals.weakest?.subject)?.value || 0)}%</small></span><button class="button button-small ${assigned === candidate.id ? 'mentor-assigned' : ''}" type="button" data-mentor="${candidate.id}">${assigned === candidate.id ? 'Assigned · remove' : 'Mark assigned'}</button></div>`).join('')}</div>` : '<p class="muted">No suitable peer match is available in this section yet.</p>'}<p class="table-note">Assignments remain in this browser session.</p></div>`;
}

function offlinePlan(analysis) {
  return {
    summary: analysis.factors[0] ? `A practical support plan focused on ${analysis.factors[0].title.toLowerCase()}. Use the data as a starting point for a conversation.` : 'The main signals are steady. Keep the current supports in place and review them after the next test.',
    plan: analysis.actions.map((item) => ({ step: item.title, detail: item.detail, priority: item.priority })),
    parentMessage: { en: parentMessage(analysis, 'en'), hi: parentMessage(analysis, 'hi') }
  };
}

async function requestAI(analysis) {
  const s = analysis.signals;
  const payload = {
    type: 'student',
    student: {
      attendance: Math.round(s.attendance), attendanceTrend: Math.round(s.attendanceTrend), assignments: Math.round(s.assignments),
      avgMarks: Math.round(s.avgMarks), t1: Math.round(s.tests[0].value), t2: Math.round(s.tests[1].value), t3: Math.round(s.tests[2].value),
      testSlope: Math.round(s.testDelta / 2), latestTest: Math.round(s.latestTest), score: Math.round(analysis.score), riskLevel: analysis.level,
      forecast: analysis.forecast.percent, urgentPending: analysis.actions.some((item) => item.priority === 'Urgent') ? 1 : 0
    }
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) throw new Error(data?.detail || 'AI service unavailable');
    return data.result;
  } finally { clearTimeout(timer); }
}

function drawerHTML(student, analysis) {
  const done = analysis.actions.filter((item) => isActionDone(student.id, item.id)).length;
  const subjects = analysis.signals.subjects.map((item) => `<div class="subject-line"><span>${escapeHTML(item.subject)}</span><span class="meter"><i style="width:${clamp(item.value)}%"></i></span><b>${format(item.value)}%</b></div>`).join('');
  const factors = analysis.factors.map((item) => `<li class="factor-row ${item.tone === 'positive' ? 'factor-positive' : ''}">${item.tone === 'positive' ? icons.check : icons.alert}<div><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.text)}</p></div></li>`).join('');
  const actions = analysis.actions.map((item) => `<li class="action-row ${isActionDone(student.id, item.id) ? 'is-done' : ''}" data-action-row="${item.id}"><label><input type="checkbox" data-action="${item.id}" ${isActionDone(student.id, item.id) ? 'checked' : ''}><span>${escapeHTML(item.title)}</span></label><em>${item.priority}</em><p>${escapeHTML(item.detail)}</p><textarea data-note="${item.id}" rows="2" placeholder="Add a private note">${escapeHTML(state.actionState[actionKey(student.id, item.id)]?.note || '')}</textarea></li>`).join('');
  const recovery = recoveryPaths(analysis).map((path) => `<button class="recovery-choice" data-recovery="${path.name}"><strong>${escapeHTML(path.name)}</strong><span>Target score ${format(path.score)} · ${escapeHTML(Object.entries(path.values).map(([key, value]) => `${key} ${value}%`).join(' · '))}</span></button>`).join('');
  const breakdown = analysis.parts.map((part) => `<tr><td>${part.label}</td><td>${part.weight}%</td><td>${format(part.value)}%</td><td>${format(part.points)}</td></tr>`).join('') + analysis.penalties.map((penalty) => `<tr><td>${escapeHTML(penalty.label)}</td><td>—</td><td>—</td><td class="value-negative">${format(penalty.points)}</td></tr>`).join('');
  const tests = analysis.signals.tests.map((test) => `<span>${test.test} <b>${format(test.value)}%</b></span>`).join('');
  return `<div class="drawer-head"><div><p class="eyebrow">Student support record</p><h2>${escapeHTML(student.name)}</h2><p>${escapeHTML(student.roll)} · Section ${escapeHTML(student.section)} · ${CONFIG.className}</p></div><div class="drawer-actions"><button class="button button-small" type="button" data-print>Print</button><button class="icon-button" data-close-drawer aria-label="Close student record">${icons.close}</button></div></div>
    <div class="drawer-content"><div class="student-summary"><div class="score-ring score-${analysis.level}"><strong>${format(analysis.score)}</strong><span>score / 100</span></div><div>${riskBadge(analysis.level)}<p class="drawer-lead">${analysis.level === 'low' ? 'The current signals are steady.' : 'A short, specific conversation is the best next step.'}</p></div></div>
    <section class="drawer-section"><div class="section-heading"><div><p class="eyebrow">01 · Signals</p><h3>What the data shows</h3></div><span class="section-caption">Updated from ${state.source.toLowerCase()}</span></div><div class="signal-grid"><div><span>Attendance</span><b>${format(analysis.signals.attendance)}%</b><small>${analysis.signals.attendanceTrend >= 0 ? '+' : ''}${format(analysis.signals.attendanceTrend)} pts over four weeks</small></div><div><span>Assignments</span><b>${format(analysis.signals.assignments)}%</b><small>Completion rate</small></div><div><span>Weighted marks</span><b>${format(analysis.signals.avgMarks)}%</b><small>T1 20% · T2 30% · T3 50%</small></div></div><div class="subject-list">${subjects}</div></section>
    <section class="drawer-section"><div class="section-heading"><div><p class="eyebrow">02 · Risk and forecast</p><h3>Current score · next-test outlook</h3></div><span class="forecast-number">${analysis.forecast.percent}%</span></div><p class="muted">The score is a transparent current indicator. The forecast estimates the chance of becoming high risk by the next test and should prompt a conversation, not a decision.</p><div class="test-strip">${tests}</div><details class="score-details"><summary>How the score is calculated</summary><table class="score-table"><thead><tr><th>Signal</th><th>Weight</th><th>Value</th><th>Points</th></tr></thead><tbody>${breakdown}<tr><td><strong>Total</strong></td><td></td><td></td><td><strong>${format(analysis.score)}</strong></td></tr></tbody></table></details><ul class="factor-list">${analysis.forecast.factors.map((item) => `<li>${icons.info}<span>${escapeHTML(item.text)}</span></li>`).join('') || '<li>No single factor is driving the outlook.</li>'}</ul></section>
    <section class="drawer-section"><div class="section-heading"><div><p class="eyebrow">03 · Context</p><h3>Supporting factors</h3></div></div><ul class="factor-list">${factors}</ul></section>
    <section class="drawer-section"><div class="section-heading"><div><p class="eyebrow">04 · Action plan</p><h3>Teacher checklist</h3></div><span class="section-caption" data-action-count>${done}/${analysis.actions.length} complete</span></div><ul class="action-list">${actions}</ul>${mentorCard(student, analysis)}</section>
    ${analysis.level !== 'low' ? `<section class="drawer-section"><div class="section-heading"><div><p class="eyebrow">05 · Recovery</p><h3>Possible paths to the next band</h3></div></div><p class="muted">These are planning scenarios, not promises. Select one to load it into the simulator.</p><div class="recovery-list">${recovery || '<p class="muted">The current limits do not show a realistic path yet.</p>'}</div></section>` : ''}
    <section class="drawer-section"><div class="section-heading"><div><p class="eyebrow">06 · What if?</p><h3>Try a different scenario</h3></div></div><div class="simulator"><label>Attendance <output data-sim-value="attendance">${format(analysis.signals.attendance)}%</output><input type="range" min="0" max="100" step="1" value="${analysis.signals.attendance}" data-sim="attendance"></label><label>Assignments <output data-sim-value="assignments">${format(analysis.signals.assignments)}%</output><input type="range" min="0" max="100" step="1" value="${analysis.signals.assignments}" data-sim="assignments"></label><label>Average marks <output data-sim-value="marks">${format(analysis.signals.avgMarks)}%</output><input type="range" min="0" max="100" step="1" value="${analysis.signals.avgMarks}" data-sim="marks"></label><div class="sim-result"><span>Projected score</span><strong data-sim-score>${format(analysis.score)}</strong><span data-sim-level>${LEVELS[analysis.level].label}</span></div></div></section>
    <section class="drawer-section ai-section"><div class="section-heading"><div><p class="eyebrow">07 · Optional assistant</p><h3>Draft a support message</h3></div></div><p class="muted">Only anonymised performance numbers are sent. Names and roll numbers stay in this browser.</p><div data-ai-content><button class="button button-primary" data-ai-generate>Generate draft</button></div></section></div>`;
}

export function openStudent(id) {
  const student = state.students.find((item) => item.id === id);
  const analysis = state.analyses.get(id);
  const drawer = $('#studentDrawer');
  const backdrop = $('#drawerBackdrop');
  if (!student || !analysis || !drawer || !backdrop) return;
  state.selectedId = id;
  drawer.innerHTML = drawerHTML(student, analysis);
  drawer.classList.add('is-open');
  backdrop.hidden = false;
  requestAnimationFrame(() => backdrop.classList.add('is-visible'));
  document.body.classList.add('no-scroll');
  drawer.querySelector('[data-close-drawer]')?.focus();
}

export function closeStudent() {
  $('#studentDrawer')?.classList.remove('is-open');
  $('#drawerBackdrop')?.classList.remove('is-visible');
  setTimeout(() => { const backdrop = $('#drawerBackdrop'); if (backdrop) backdrop.hidden = true; }, 180);
  document.body.classList.remove('no-scroll');
  state.selectedId = null;
}

function updateSimulator(drawer, analysis) {
  const values = Object.fromEntries(['attendance', 'assignments', 'marks'].map((key) => [key, Number(drawer.querySelector(`[data-sim="${key}"]`)?.value || 0)]));
  ['attendance', 'assignments', 'marks'].forEach((key) => { const output = drawer.querySelector(`[data-sim-value="${key}"]`); if (output) output.textContent = `${format(values[key])}%`; });
  const current = analysis.score;
  const score = Math.round(clamp(values.attendance * 0.35 + values.assignments * 0.25 + values.marks * 0.4 - analysis.penalties.reduce((total, item) => total + Math.abs(item.points), 0)));
  const level = score >= CONFIG.thresholds.onTrack ? 'low' : score >= CONFIG.thresholds.watch ? 'medium' : 'high';
  const output = drawer.querySelector('[data-sim-score]');
  const label = drawer.querySelector('[data-sim-level]');
  if (output) output.textContent = format(score);
  if (label) label.textContent = `${LEVELS[level].label} · ${score >= current ? '+' : ''}${format(score - current)} points`;
}

async function generateDraft(drawer, analysis) {
  const target = drawer.querySelector('[data-ai-content]');
  if (!target) return;
  target.innerHTML = '<div class="loading-line"><span class="spinner"></span> Preparing a draft…</div>';
  try {
    const result = await requestAI(analysis);
    const plan = Array.isArray(result.plan) ? result.plan.slice(0, 4) : [];
    const messages = { en: result.parentMessage?.en || parentMessage(analysis, 'en'), hi: result.parentMessage?.hi || parentMessage(analysis, 'hi') };
    state.aiLanguage[state.selectedId] = state.aiLanguage[state.selectedId] || 'en';
    target.innerHTML = `<p class="ai-summary">${escapeHTML(result.summary || 'Suggested support steps based on the available signals.')}</p><ol class="ai-steps">${plan.map((item) => `<li><strong>${escapeHTML(item.step || item.title || 'Next step')}</strong><span>${escapeHTML(item.detail || '')}</span></li>`).join('')}</ol><div class="parent-message"><div class="message-tools"><strong>Parent message</strong><span><button class="button button-small ${state.aiLanguage[state.selectedId] === 'en' ? 'mentor-assigned' : ''}" type="button" data-ai-language="en">English</button><button class="button button-small ${state.aiLanguage[state.selectedId] === 'hi' ? 'mentor-assigned' : ''}" type="button" data-ai-language="hi">हिंदी</button><button class="button button-small" type="button" data-copy-message>Copy</button></span></div><p data-parent-message>${escapeHTML(messages[state.aiLanguage[state.selectedId]])}</p></div><span class="ai-note">AI suggestion · teacher decides</span>`;
    target.dataset.messages = JSON.stringify(messages);
  } catch (error) {
    const fallback = offlinePlan(analysis);
    const messages = fallback.parentMessage;
    state.aiLanguage[state.selectedId] = state.aiLanguage[state.selectedId] || 'en';
    target.innerHTML = `<span class="offline-label">Offline template</span><p class="ai-summary">${escapeHTML(fallback.summary)}</p><ol class="ai-steps">${fallback.plan.map((item) => `<li><strong>${escapeHTML(item.step)}</strong><span>${escapeHTML(item.detail)}</span></li>`).join('')}</ol><div class="parent-message"><div class="message-tools"><strong>Parent message</strong><span><button class="button button-small ${state.aiLanguage[state.selectedId] === 'en' ? 'mentor-assigned' : ''}" type="button" data-ai-language="en">English</button><button class="button button-small ${state.aiLanguage[state.selectedId] === 'hi' ? 'mentor-assigned' : ''}" type="button" data-ai-language="hi">हिंदी</button><button class="button button-small" type="button" data-copy-message>Copy</button></span></div><p data-parent-message>${escapeHTML(messages[state.aiLanguage[state.selectedId]])}</p></div><span class="ai-note">Template suggestion · teacher decides</span>`;
    target.dataset.messages = JSON.stringify(messages);
  }
}

const voice = {
  active: false,
  ringing: false,
  speaking: false,
  pending: false,
  recognition: null,
  recognitionRetry: null,
  controller: null,
  utterance: null,
  ringTimer: null,
  ringSoundTimer: null,
  audioContext: null,
  micStream: null,
  micAnalyser: null,
  micMonitor: null,
  lastMicSignalAt: 0,
  clockTimer: null,
  callStartedAt: 0,
  turn: 0,
  messages: []
};

function voiceElements() {
  return {
    dialog: $('[data-voice-dialog]'),
    status: $('[data-voice-status]'),
    messages: $('[data-voice-messages]'),
    start: $('[data-voice-start]'),
    end: $('[data-voice-end]'),
    input: $('[data-voice-input]'),
    stage: $('[data-voice-stage]'),
    orb: $('[data-voice-orb]'),
    label: $('[data-voice-call-label]'),
    caption: $('[data-voice-caption]'),
    timer: $('[data-voice-timer]')
  };
}

function voiceStatus(text, tone = '') {
  const element = voiceElements().status;
  if (!element) return;
  element.textContent = text;
  element.className = `voice-status${tone ? ` is-${tone}` : ''}`;
}

function renderVoiceCall() {
  const elements = voiceElements();
  if (!elements.stage) return;
  elements.stage.classList.toggle('is-ringing', voice.ringing);
  elements.stage.classList.toggle('is-speaking', voice.speaking);
  elements.stage.classList.toggle('is-listening', voice.active && !voice.ringing && !voice.speaking && !voice.pending);
  if (elements.label) elements.label.textContent = voice.ringing ? 'Calling EduGuard' : voice.active ? (voice.speaking ? 'EduGuard is speaking' : voice.pending ? 'Connecting…' : 'Live call') : 'Ready to call';
  if (elements.caption) elements.caption.textContent = voice.ringing ? 'Please wait while EduGuard joins the call…' : voice.speaking ? 'You can interrupt at any time.' : voice.active ? 'Listening for your next thought.' : 'Press Start call to begin.';
  if (elements.orb) elements.orb.setAttribute('aria-label', voice.ringing ? 'Calling EduGuard' : voice.speaking ? 'EduGuard is speaking' : voice.active ? 'EduGuard is listening' : 'EduGuard is ready');
}

function renderVoiceMessages() {
  const container = voiceElements().messages;
  if (!container) return;
  if (!voice.messages.length) {
    container.innerHTML = '<p class="voice-empty">Start the call and speak naturally. EduGuard will listen after its introduction.</p>';
    return;
  }
  container.innerHTML = voice.messages.map((message) => `<div class="voice-message voice-message-${message.role}"><small>${message.role === 'user' ? 'You' : 'EduGuard'}</small>${escapeHTML(message.content)}</div>`).join('');
  container.scrollTop = container.scrollHeight;
}

function updateCallClock() {
  const timer = voiceElements().timer;
  if (!timer || !voice.callStartedAt) return;
  const elapsed = Math.max(0, Math.floor((Date.now() - voice.callStartedAt) / 1000));
  timer.textContent = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
}

function recognitionConstructor() { return window.SpeechRecognition || window.webkitSpeechRecognition || null; }

function ringTone() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  try {
    voice.audioContext = voice.audioContext || new AudioContext();
    if (voice.audioContext.state === 'suspended') voice.audioContext.resume();
    const oscillator = voice.audioContext.createOscillator();
    const gain = voice.audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(660, voice.audioContext.currentTime);
    oscillator.frequency.setValueAtTime(520, voice.audioContext.currentTime + 0.18);
    gain.gain.setValueAtTime(0.0001, voice.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, voice.audioContext.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, voice.audioContext.currentTime + 0.34);
    oscillator.connect(gain).connect(voice.audioContext.destination);
    oscillator.start();
    oscillator.stop(voice.audioContext.currentTime + 0.36);
  } catch { /* Some browsers block Web Audio; the visual ring still works. */ }
}

function startRingingTone() {
  if (voice.ringSoundTimer) clearInterval(voice.ringSoundTimer);
  ringTone();
  voice.ringSoundTimer = setInterval(ringTone, 900);
}

function stopRingingTone() {
  if (voice.ringSoundTimer) { clearInterval(voice.ringSoundTimer); voice.ringSoundTimer = null; }
}

function stopMicMonitor() {
  if (voice.micMonitor) { clearInterval(voice.micMonitor); voice.micMonitor = null; }
  if (voice.micStream) voice.micStream.getTracks().forEach((track) => track.stop());
  voice.micStream = null;
  voice.micAnalyser = null;
  voice.lastMicSignalAt = 0;
}

async function startMicMonitor() {
  if (!navigator.mediaDevices?.getUserMedia || voice.micStream) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (!voice.active) { stream.getTracks().forEach((track) => track.stop()); return; }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) { stream.getTracks().forEach((track) => track.stop()); return; }
    voice.micStream = stream;
    voice.audioContext = voice.audioContext || new AudioContext();
    if (voice.audioContext.state === 'suspended') voice.audioContext.resume();
    const source = voice.audioContext.createMediaStreamSource(stream);
    const analyser = voice.audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    voice.micAnalyser = analyser;
    const samples = new Uint8Array(analyser.fftSize);
    voice.micMonitor = setInterval(() => {
      if (!voice.micAnalyser) return;
      analyser.getByteTimeDomainData(samples);
      let total = 0;
      for (let index = 0; index < samples.length; index += 1) {
        const amplitude = (samples[index] - 128) / 128;
        total += amplitude * amplitude;
      }
      const rms = Math.sqrt(total / samples.length);
      if (rms > 0.018) voice.lastMicSignalAt = Date.now();
    }, 60);
  } catch {
    // SpeechRecognition can still work without the optional microphone monitor.
  }
}

function meaningfulSpeech(text) {
  const words = String(text || '').toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || [];
  if (!words.length || words.join('').length < 2) return false;
  if (words.length === 1 && words[0].length < 3) return false;
  if (/^(.)\1+$/.test(words.join(''))) return false;
  return true;
}

function trustedSpeech(result, text, isFinal) {
  if (!meaningfulSpeech(text)) return false;
  if (voice.micAnalyser && Date.now() - voice.lastMicSignalAt > 1200) return false;
  const confidence = Number(result?.confidence);
  // Interim confidence is often zero, so only use confident interim phrases for
  // immediate barge-in. Final phrases get the browser's best confidence score.
  if (Number.isFinite(confidence) && confidence > 0) return confidence >= (isFinal ? 0.62 : 0.58);
  return isFinal;
}

function stopRecognition() {
  if (voice.recognitionRetry) { clearTimeout(voice.recognitionRetry); voice.recognitionRetry = null; }
  const recognition = voice.recognition;
  voice.recognition = null;
  if (!recognition) return;
  try { recognition.abort(); } catch { /* The browser may already have stopped it. */ }
}

function startRecognition() {
  const Recognition = recognitionConstructor();
  if (!Recognition) {
    voiceStatus('Voice input is unavailable here. You can still use the text box.', 'thinking');
    return;
  }
  if (!voice.active || voice.ringing || voice.recognition) return;
  const recognition = new Recognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-IN';
  recognition.onstart = () => {
    if (!voice.speaking && !voice.pending) voiceStatus('Listening… speak naturally.', 'live');
  };
  recognition.onresult = (event) => {
    const final = [];
    let shouldInterrupt = false;
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = result[0]?.transcript || '';
      const isFinal = result.isFinal;
      if (isFinal) {
        if (trustedSpeech(result[0], transcript, true)) final.push(transcript);
      } else if ((voice.speaking || voice.pending) && trustedSpeech(result[0], transcript, false)) {
        shouldInterrupt = true;
      }
    }
    // Keep the microphone open while EduGuard talks, but only barge in for
    // speech that passes the confidence and microphone-signal checks.
    if ((voice.speaking || voice.pending) && (shouldInterrupt || final.length)) interruptVoiceTurn();
    const text = final.join(' ').replace(/\s+/g, ' ').trim();
    if (text && voice.active) sendVoiceMessage(text);
  };
  recognition.onerror = (event) => {
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') voiceStatus('Microphone permission was not granted. Use the text box below.', 'thinking');
    else if (event.error !== 'no-speech' && event.error !== 'aborted') voiceStatus('Voice input paused. Trying to reconnect…', 'thinking');
  };
  recognition.onend = () => {
    if (voice.recognition === recognition) voice.recognition = null;
    if (voice.active && !voice.ringing && !voice.recognitionRetry) voice.recognitionRetry = setTimeout(() => { voice.recognitionRetry = null; startRecognition(); }, 120);
  };
  voice.recognition = recognition;
  try { recognition.start(); } catch { voice.recognition = null; }
}

function interruptVoiceTurn() {
  if (!voice.speaking && !voice.pending) return;
  voice.turn += 1;
  voice.speaking = false;
  voice.pending = false;
  voice.utterance = null;
  if (voice.controller) { voice.controller.abort(); voice.controller = null; }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  renderVoiceCall();
  if (voice.active && !voice.ringing) voiceStatus('Listening… I heard you.', 'live');
}

function speakAssistant(text, after, listenDuringSpeech = true) {
  if (!voice.active) return;
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) { if (after) after(); return; }
  if (voice.utterance) window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  voice.utterance = utterance;
  voice.speaking = true;
  renderVoiceCall();
  voiceStatus('EduGuard is speaking…', 'speaking');
  if (listenDuringSpeech) startRecognition();
  utterance.lang = 'en-IN';
  utterance.rate = 1.02;
  utterance.pitch = 1;
  const finish = () => {
    if (voice.utterance !== utterance) return;
    voice.utterance = null;
    voice.speaking = false;
    renderVoiceCall();
    if (voice.active) {
      voiceStatus('Listening… speak naturally.', 'live');
      startRecognition();
    }
    if (after) after();
  };
  utterance.onend = finish;
  utterance.onerror = finish;
  window.speechSynthesis.speak(utterance);
}

function beginGreeting() {
  if (!voice.active) return;
  stopRingingTone();
  voice.ringTimer = null;
  voice.ringing = false;
  renderVoiceCall();
  const greeting = 'Hello, I am EduGuard. How can I help you today?';
  voice.messages.push({ role: 'assistant', content: greeting });
  renderVoiceMessages();
  speakAssistant(greeting, () => { if (voice.active) startRecognition(); }, false);
}

async function sendVoiceMessage(rawText) {
  const text = String(rawText || '').replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!text || !voice.active) return;
  const elements = voiceElements();
  if (elements.input) elements.input.value = '';
  if (voice.speaking || voice.pending) interruptVoiceTurn();
  voice.messages.push({ role: 'user', content: text });
  renderVoiceMessages();
  voice.pending = true;
  const requestTurn = ++voice.turn;
  voice.controller = new AbortController();
  renderVoiceCall();
  voiceStatus('EduGuard is thinking…', 'thinking');
  try {
    const response = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'voice', messages: voice.messages.slice(-12) }), signal: voice.controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok || !data.result?.reply) throw new Error(data?.detail || 'AI voice service unavailable');
    if (!voice.active || requestTurn !== voice.turn) return;
    const reply = String(data.result.reply).trim();
    voice.messages.push({ role: 'assistant', content: reply });
    renderVoiceMessages();
    voice.pending = false;
    voice.controller = null;
    renderVoiceCall();
    speakAssistant(reply);
  } catch (error) {
    if (error?.name === 'AbortError' || requestTurn !== voice.turn || !voice.active) return;
    voice.messages.push({ role: 'assistant', content: 'I could not reach the live AI service right now. Please check the Groq configuration or continue with the dashboard’s offline support tools.' });
    voice.pending = false;
    voice.controller = null;
    renderVoiceMessages();
    renderVoiceCall();
    speakAssistant(voice.messages[voice.messages.length - 1].content);
  }
}

function startCall() {
  const elements = voiceElements();
  if (!elements.dialog || voice.active) return;
  voice.active = true;
  voice.ringing = true;
  voice.speaking = false;
  voice.pending = false;
  voice.messages = [];
  voice.callStartedAt = Date.now();
  renderVoiceMessages();
  renderVoiceCall();
  elements.start.disabled = true;
  elements.end.disabled = false;
  voiceStatus('Calling EduGuard…', 'ringing');
  updateCallClock();
  voice.clockTimer = setInterval(updateCallClock, 1000);
  startRingingTone();
  startMicMonitor();
  voice.ringTimer = setTimeout(beginGreeting, 2400);
}

function openVoice() {
  const dialog = voiceElements().dialog;
  if (!dialog) return;
  if (!dialog.open) dialog.showModal();
  startCall();
}

function endVoice() {
  voice.active = false;
  voice.ringing = false;
  voice.speaking = false;
  voice.pending = false;
  voice.turn += 1;
  voice.utterance = null;
  stopRingingTone();
  stopMicMonitor();
  if (voice.ringTimer) { clearTimeout(voice.ringTimer); voice.ringTimer = null; }
  if (voice.clockTimer) { clearInterval(voice.clockTimer); voice.clockTimer = null; }
  if (voice.controller) { voice.controller.abort(); voice.controller = null; }
  stopRecognition();
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  const elements = voiceElements();
  if (elements.start) elements.start.disabled = false;
  if (elements.end) elements.end.disabled = true;
  renderVoiceCall();
  voiceStatus('Call ended. Start a new call whenever you are ready.');
}

function bindVoice() {
  const dialog = $('[data-voice-dialog]');
  if (!dialog || dialog.dataset.bound) return;
  dialog.dataset.bound = 'true';
  $('[data-voice-open]')?.addEventListener('click', openVoice);
  $('[data-voice-start]')?.addEventListener('click', startCall);
  $('[data-voice-end]')?.addEventListener('click', endVoice);
  $('[data-voice-close]')?.addEventListener('click', () => { endVoice(); dialog.close(); });
  $('[data-voice-send]')?.addEventListener('click', () => sendVoiceMessage(voiceElements().input?.value));
  $('[data-voice-input]')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') sendVoiceMessage(event.currentTarget.value); });
  dialog.addEventListener('close', endVoice);
}

function closeTopbarMenu() {
  const toggle = $('[data-nav-toggle]');
  const menu = $('[data-topbar-menu]');
  if (!toggle || !menu) return;
  menu.classList.remove('is-open');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Open navigation menu');
}

function setupTopbar() {
  const toggle = $('[data-nav-toggle]');
  const menu = $('[data-topbar-menu]');
  const topbar = $('[data-topbar]');
  if (!toggle || !menu || toggle.dataset.bound) return;
  toggle.dataset.bound = 'true';
  toggle.addEventListener('click', () => {
    const open = menu.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
  });
  menu.addEventListener('click', (event) => { if (event.target.closest('a, button')) closeTopbarMenu(); });
  document.addEventListener('click', (event) => {
    if (!menu.classList.contains('is-open')) return;
    if (event.target.closest('[data-topbar]')) return;
    closeTopbarMenu();
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeTopbarMenu(); });
  if (topbar) {
    const syncScrolled = () => topbar.classList.toggle('is-scrolled', window.scrollY > 8);
    syncScrolled();
    window.addEventListener('scroll', syncScrolled, { passive: true });
    const syncHeight = () => document.documentElement.style.setProperty('--topbar-h', `${topbar.getBoundingClientRect().height}px`);
    syncHeight();
    window.addEventListener('resize', syncHeight);
    if (typeof ResizeObserver === 'function') new ResizeObserver(syncHeight).observe(topbar);
  }
  const wide = window.matchMedia('(min-width: 1181px)');
  if (typeof wide.addEventListener === 'function') wide.addEventListener('change', (event) => { if (event.matches) closeTopbarMenu(); });
}

export function bindCommonEvents() {
  setupTopbar();
  document.addEventListener('click', (event) => {
    const studentTrigger = event.target.closest('[data-student-id]');
    if (studentTrigger) { openStudent(studentTrigger.dataset.studentId); return; }
    if (event.target.closest('[data-close-drawer]') || event.target.id === 'drawerBackdrop') { closeStudent(); return; }
    if (event.target.closest('[data-print]')) { window.print(); return; }
    const generate = event.target.closest('[data-ai-generate]');
    if (generate && state.selectedId) { generateDraft($('#studentDrawer'), state.analyses.get(state.selectedId)); return; }
    const recovery = event.target.closest('[data-recovery]');
    if (recovery) {
      const drawer = $('#studentDrawer');
      const analysis = state.analyses.get(state.selectedId);
      const selected = recoveryPaths(analysis).find((path) => path.name === recovery.dataset.recovery);
      if (selected && drawer) Object.entries(selected.values).forEach(([key, value]) => { const input = drawer.querySelector(`[data-sim="${key === 'marks' ? 'marks' : key}"]`); if (input) input.value = value; });
      if (drawer) updateSimulator(drawer, analysis);
    }
    const mentor = event.target.closest('[data-mentor]');
    if (mentor && state.selectedId) {
      const current = state.mentorAssignments[state.selectedId];
      state.mentorAssignments[state.selectedId] = current === mentor.dataset.mentor ? null : mentor.dataset.mentor;
      const student = state.students.find((item) => item.id === state.selectedId);
      if (student) openStudent(student.id);
    }
    const language = event.target.closest('[data-ai-language]');
    if (language && state.selectedId) {
      const content = $('#studentDrawer [data-ai-content]');
      if (!content) return;
      state.aiLanguage[state.selectedId] = language.dataset.aiLanguage;
      const messages = JSON.parse(content.dataset.messages || '{}');
      const message = content.querySelector('[data-parent-message]');
      if (message) message.textContent = messages[state.aiLanguage[state.selectedId]] || messages.en || '';
      content.querySelectorAll('[data-ai-language]').forEach((button) => button.classList.toggle('mentor-assigned', button.dataset.aiLanguage === state.aiLanguage[state.selectedId]));
    }
    if (event.target.closest('[data-copy-message]')) {
      const message = $('#studentDrawer [data-parent-message]')?.textContent || '';
      navigator.clipboard?.writeText(message).then(() => { event.target.closest('[data-copy-message]').textContent = 'Copied'; }).catch(() => {});
    }
  });
  document.addEventListener('input', (event) => {
    if (event.target.matches('[data-sim]') && state.selectedId) updateSimulator($('#studentDrawer'), state.analyses.get(state.selectedId));
  });
  document.addEventListener('change', (event) => {
    if (event.target.matches('[data-action]') && state.selectedId) {
      setActionDone(state.selectedId, event.target.dataset.action, event.target.checked);
      event.target.closest('[data-action-row]')?.classList.toggle('is-done', event.target.checked);
      const analysis = state.analyses.get(state.selectedId);
      const count = analysis.actions.filter((item) => isActionDone(state.selectedId, item.id)).length;
      const output = $('#studentDrawer [data-action-count]');
      if (output) output.textContent = `${count}/${analysis.actions.length} complete`;
      document.dispatchEvent(new CustomEvent('dashboard:filter'));
    }
  });
  document.addEventListener('blur', (event) => {
    if (event.target.matches('[data-note]') && state.selectedId) setActionNote(state.selectedId, event.target.dataset.note, event.target.value);
  }, true);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && state.selectedId) closeStudent(); });
  bindVoice();
}

export function setupNavigation(active) {
  $$('[data-nav]').forEach((link) => {
    const isActive = link.dataset.nav === active;
    link.classList.toggle('active', isActive);
    if (isActive) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const toggle = $('[data-nav-toggle]');
  if (toggle) toggle.setAttribute('aria-label', $('[data-topbar-menu]')?.classList.contains('is-open') ? 'Close navigation menu' : 'Open navigation menu');
}

export function setupSectionSelect(select) {
  if (!select) return;
  select.innerHTML = '<option value="ALL">All sections</option>' + sections().map((section) => `<option value="${escapeHTML(section)}">Section ${escapeHTML(section)}</option>`).join('');
  select.value = state.section;
  if (select.dataset.bound) return;
  select.dataset.bound = 'true';
  select.addEventListener('change', () => { state.section = select.value; document.dispatchEvent(new CustomEvent('dashboard:filter')); });
}

export function setupCSV({ input, button, reset, status, onImported }) {
  button?.addEventListener('click', () => input?.click());
  input?.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      initState(parseStudentCSV(await file.text()), file.name);
      if (status) { status.textContent = `Loaded ${state.students.length} students from ${file.name}.`; status.classList.remove('status-error'); }
      onImported?.();
    } catch (error) {
      if (status) { status.textContent = error.message; status.classList.add('status-error'); }
    }
  });
  reset?.addEventListener('click', () => { initState(createDemoStudents(), 'Demo class'); onImported?.(); });
}

export function sampleCSV() { download('sample-student-data.csv', `\uFEFF${SAMPLE_CSV}`, 'text/csv'); }

export { icons };
export { priorityValue };
