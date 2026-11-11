/* Attendance register: pick a class, mark presence and review running totals. */
(function () {
  'use strict';

  var EG = window.EG;
  var ui = EG.ui;
  var el = ui.el;
  var pages = EG.pages;
  var icon = ui.icon;

  var state = {
    subjectId: '', sectionId: '', date: '', data: null,
    records: {}, dirty: {}, search: '', saving: false,
    picker: null, dateInput: null, dateStrip: null, kpiHost: null,
    rosterHost: null, statusHost: null, saveButton: null, bulkHost: null,
    cardNodes: {}
  };

  function updateQuery() {
    var params = new URLSearchParams(window.location.search);
    params.set('subjectId', state.subjectId);
    params.set('sectionId', state.sectionId);
    if (state.date) params.set('date', state.date); else params.delete('date');
    window.history.replaceState({}, '', window.location.pathname + '?' + params.toString());
  }

  function pairLabel() {
    var subject = (EG.session.scope.subjects || []).find(function (item) { return item.id === state.subjectId; });
    var section = (EG.session.scope.sections || []).find(function (item) { return item.id === state.sectionId; });
    return (subject ? subject.name : 'Subject') + ' - ' + (section ? section.name : 'Section');
  }

  function markedCount() {
    return (state.data ? state.data.students : []).filter(function (student) { return state.records[student.id]; }).length;
  }

  function classAverage() {
    var rows = (state.data ? state.data.students : []).filter(function (student) {
      return student.running && student.running.total > 0 && Number.isFinite(Number(student.running.percent));
    });
    if (!rows.length) return null;
    return rows.reduce(function (total, student) { return total + Number(student.running.percent); }, 0) / rows.length;
  }

  function absentCount() {
    return (state.data ? state.data.students.length : 0) - markedCount();
  }

  function atRiskCount() {
    return (state.data ? state.data.students : []).filter(function (student) {
      return student.running && student.running.total > 0 && student.running.percent < 75;
    }).length;
  }

  function renderKpis() {
    if (!state.kpiHost || !state.data) return;
    state.kpiHost.textContent = '';
    var average = classAverage();
    [
      { label: 'Students', value: ui.num(state.data.students.length), icon: 'students', foot: pairLabel() },
      { label: 'Present today', value: ui.num(markedCount()), icon: 'check', tone: 'success', foot: absentCount() + ' absent or not marked' },
      { label: 'Class attendance', value: average === null ? '-' : ui.pct(average), icon: 'attendance', foot: state.data.session ? 'Saved register for this date' : 'No register saved for this date' },
      { label: 'Below 75%', value: ui.num(atRiskCount()), icon: 'warning', tone: atRiskCount() ? 'warning' : 'success', foot: 'Across recorded sessions' }
    ].forEach(function (kpi) {
      state.kpiHost.appendChild(pages.kpi({ label: kpi.label, value: kpi.value, icon: kpi.icon, tone: kpi.tone || 'brand', foot: kpi.foot }));
    });
  }

  function renderDateStrip() {
    if (!state.dateStrip || !state.data) return;
    state.dateStrip.textContent = '';
    var dates = (state.data.dates || []).slice();
    if (state.date && dates.indexOf(state.date) === -1) dates.unshift(state.date);
    if (!dates.length) {
      state.dateStrip.appendChild(el('span', { class: 'xs faint', text: 'No registers saved yet. Saving will create the first one.' }));
      return;
    }
    dates.slice(0, 18).forEach(function (dateValue) {
      var active = dateValue === state.date;
      state.dateStrip.appendChild(el('button', {
        class: 'date-pill' + (active ? ' is-active' : ''),
        type: 'button',
        'aria-pressed': active ? 'true' : 'false',
        onClick: function () { state.date = dateValue; state.search = ''; updateQuery(); load(); }
      }, ui.date(dateValue, 'short')));
    });
  }

  function statusText() {
    var count = Object.keys(state.dirty).length;
    if (!state.data || !state.data.canEdit) return 'This term is read-only.';
    if (!count) return state.data.session ? 'Register saved for ' + ui.date(state.data.date, 'long') + '.' : 'No register saved for this date yet.';
    return count + ' unsaved ' + ui.plural(count, 'change') + '.';
  }

  function renderStatus() {
    if (state.statusHost) {
      state.statusHost.textContent = statusText();
      state.statusHost.className = 'save-state' + (state.saving ? ' save-state--saving' : Object.keys(state.dirty).length ? '' : ' save-state--saved');
    }
    if (state.saveButton) {
      state.saveButton.disabled = state.saving || !state.data || !state.data.canEdit || !Object.keys(state.dirty).length;
      state.saveButton.innerHTML = (state.saving ? '<span class="spinner" aria-hidden="true"></span> Saving...' : icon('check', 14) + ' Save register');
    }
    if (state.bulkHost) state.bulkHost.hidden = !(state.data && state.data.canEdit);
  }

  function setRecord(studentId, present) {
    state.records[studentId] = Boolean(present);
    state.dirty[studentId] = true;
    var node = state.cardNodes[studentId];
    if (node) {
      node.person.classList.toggle('is-absent', !present);
      node.status.textContent = present ? 'Present' : 'Absent';
    }
    renderKpis();
    renderStatus();
  }

  function studentCard(student) {
    var present = state.records[student.id] !== false;
    var toggle = el('input', {
      type: 'checkbox',
      checked: present,
      disabled: !(state.data && state.data.canEdit),
      'aria-label': (present ? 'Mark ' : 'Mark ') + student.name + (present ? ' absent' : ' present')
    });
    var status = el('span', { class: 'attendance-person__sub', text: present ? 'Present' : 'Absent' });
    var person = el('div', { class: 'attendance-person' + (present ? '' : ' is-absent') },
      el('span', { class: 'avatar avatar--sm', text: ui.initials(student.name) }),
      el('div', { class: 'attendance-person__meta' },
        el('div', { class: 'attendance-person__name', text: student.name }),
        el('div', { class: 'attendance-person__sub' },
          el('span', { class: 'mono', text: student.roll }),
          student.running && student.running.total > 0
            ? el('span', { text: ' - ' + ui.pct(student.running.percent) + ' overall' })
            : el('span', { text: ' - no record yet' })
        )
      ),
      el('span', { class: 'attendance-person__meta', style: { flex: '0 0 auto', textAlign: 'right' } }, status),
      el('label', { class: 'switch' }, toggle, el('span', { class: 'switch__track' }))
    );
    toggle.addEventListener('change', function () {
      setRecord(student.id, toggle.checked);
      toggle.setAttribute('aria-label', (toggle.checked ? 'Mark ' : 'Mark ') + student.name + (toggle.checked ? ' absent' : ' present'));
      status.textContent = toggle.checked ? 'Present' : 'Absent';
    });
    state.cardNodes[student.id] = { person: person, status: status, toggle: toggle };
    return person;
  }

  function renderRoster() {
    if (!state.rosterHost || !state.data) return;
    state.rosterHost.textContent = '';
    state.cardNodes = {};
    var query = state.search.toLowerCase();
    var students = state.data.students.filter(function (student) {
      return !query || (student.name + ' ' + student.roll).toLowerCase().indexOf(query) !== -1;
    });
    if (!state.data.students.length) {
      state.rosterHost.appendChild(pages.empty('No students in this section', 'Add students to the section before taking attendance.', null, 'students'));
      return;
    }
    if (!students.length) {
      state.rosterHost.appendChild(pages.empty('No matching students', 'Try a different name or roll number.', null, 'search'));
      return;
    }
    var grid = el('div', { class: 'attendance-roster' });
    students.forEach(function (student) { grid.appendChild(studentCard(student)); });
    state.rosterHost.appendChild(grid);
  }

  function bulk(present) {
    if (!state.data || !state.data.canEdit) return;
    state.data.students.forEach(function (student) { setRecord(student.id, present); });
    Object.keys(state.cardNodes).forEach(function (key) {
      var node = state.cardNodes[key];
      node.toggle.checked = present;
      node.person.classList.toggle('is-absent', !present);
      node.status.textContent = present ? 'Present' : 'Absent';
    });
    ui.toast(present ? 'Everyone marked present. Save to confirm.' : 'Everyone marked absent. Save to confirm.', 'info');
  }

  function save() {
    if (state.saving || !state.data || !state.data.canEdit) return;
    var records = state.data.students.map(function (student) {
      return { studentId: student.id, present: state.records[student.id] !== false };
    });
    if (!records.length) return;
    state.saving = true;
    renderStatus();
    EG.api.put('/api/attendance', {
      subjectId: state.subjectId,
      sectionId: state.sectionId,
      heldOn: state.date,
      records: records
    }).then(function (result) {
      state.dirty = {};
      state.saving = false;
      state.data.session = { id: result.sessionId, heldOn: result.heldOn, records: records.length };
      if (!state.data.dates) state.data.dates = [];
      if (state.data.dates.indexOf(result.heldOn) === -1) state.data.dates.unshift(result.heldOn);
      Object.keys(result.running || {}).forEach(function (studentId) {
        var student = state.data.students.find(function (row) { return row.id === studentId; });
        if (student) student.running = result.running[studentId];
      });
      state.data.students.forEach(function (student) {
        var node = state.cardNodes[student.id];
        if (node && student.running) {
          var runningText = student.running.total > 0 ? ' - ' + ui.pct(student.running.percent) + ' overall' : ' - no record yet';
          node.person.querySelector('.attendance-person__sub').lastChild.textContent = runningText;
        }
      });
      renderKpis();
      renderDateStrip();
      renderStatus();
      ui.toast('Attendance saved for ' + ui.date(result.heldOn, 'long') + '.', 'success');
    }).catch(function (error) {
      state.saving = false;
      renderStatus();
      ui.toast(error.message, 'error');
    });
  }

  function exportCsv() {
    if (!state.data) return;
    var rows = state.data.students.map(function (student) {
      return {
        roll: student.roll,
        name: student.name,
        status: state.records[student.id] !== false ? 'Present' : 'Absent',
        overallAttendance: student.running ? student.running.percent : '',
        sessionsPresent: student.running ? student.running.present : '',
        sessionsHeld: student.running ? student.running.total : ''
      };
    });
    pages.download('eduguard-attendance-' + state.date + '.csv', rows, [
      { key: 'roll', label: 'Roll' }, { key: 'name', label: 'Name' }, { key: 'status', label: 'This date' },
      { key: 'overallAttendance', label: 'Overall %' }, { key: 'sessionsPresent', label: 'Sessions present' },
      { key: 'sessionsHeld', label: 'Sessions held' }
    ]);
  }

  function buildChrome() {
    state.picker = pages.pairPicker({
      value: { subjectId: state.subjectId, sectionId: state.sectionId },
      onChange: function (subjectId, sectionId) {
        if (!subjectId || !sectionId) return;
        state.subjectId = subjectId;
        state.sectionId = sectionId;
        state.date = '';
        state.dirty = {};
        updateQuery();
        load();
      }
    });
    state.dateInput = el('input', { class: 'input', type: 'date', max: new Date().toISOString().slice(0, 10), value: state.date, 'aria-label': 'Register date' });
    state.dateInput.addEventListener('change', function () {
      state.date = state.dateInput.value;
      state.search = '';
      updateQuery();
      load();
    });
    state.dateStrip = el('div', { class: 'date-strip' });
    state.kpiHost = el('div', { class: 'kpi-grid mb-4' });
    state.rosterHost = el('div');
    state.statusHost = el('span', { class: 'save-state' });
    state.saveButton = el('button', { class: 'btn btn--primary', type: 'button', onClick: save }, el('span', { html: icon('check', 14) }), 'Save register');
    state.bulkHost = el('div', { class: 'btn-row' },
      el('button', { class: 'btn btn--sm', type: 'button', onClick: function () { bulk(true); } }, el('span', { html: icon('check', 13) }), 'All present'),
      el('button', { class: 'btn btn--sm', type: 'button', onClick: function () { bulk(false); } }, el('span', { html: icon('x', 13) }), 'All absent')
    );

    var search = el('input', { class: 'input input--search input--sm', type: 'search', placeholder: 'Find a student...', 'aria-label': 'Find a student' });
    search.addEventListener('input', ui.debounce(function () {
      state.search = search.value.trim();
      renderRoster();
    }, 150));

    var controls = pages.card({
      body: el('div', { class: 'stack' },
        el('div', { class: 'attendance-head' },
          state.picker.root,
          el('div', { class: 'field' }, el('label', { text: 'Register date' }), state.dateInput),
          el('div', { class: 'field grow', style: { minWidth: '180px' } }, el('label', { text: 'Find student' }), search)
        ),
        state.dateStrip
      )
    });

    var rosterCard = pages.card({
      title: 'Register',
      subtitle: 'Switch a student off to mark them absent. Only this date is changed.',
      actions: state.bulkHost,
      body: state.rosterHost,
      foot: el('div', { class: 'row row--wrap gap-3 row--between w-100' },
        el('div', { class: 'row row--wrap gap-3' }, state.statusHost,
          el('span', { class: 'xs faint', text: 'Marked records are written to the audit log.' })
        ),
        el('div', { class: 'row gap-2' },
          el('button', { class: 'btn btn--sm', type: 'button', onClick: function () { window.print(); } }, el('span', { html: icon('printer', 13) }), 'Print'),
          el('button', { class: 'btn btn--sm', type: 'button', onClick: exportCsv }, el('span', { html: icon('download', 13) }), 'CSV'),
          state.saveButton
        )
      )
    });

    pages.mount({
      title: 'Attendance',
      subtitle: 'A clear register for each class, with running attendance for every student.',
      actions: el('div', { class: 'btn-row' },
        el('button', { class: 'btn', type: 'button', onClick: function () { load(); } }, el('span', { html: icon('refresh') }), 'Refresh'),
        el('a', { class: 'btn btn--soft', href: '/marks' }, el('span', { html: icon('marks') }), 'Open marks')
      ),
      content: el('div', { class: 'stack' }, controls, state.kpiHost, rosterCard)
    });
  }

  function load() {
    if (!state.subjectId || !state.sectionId) return Promise.resolve(null);
    state.saving = false;
    if (state.statusHost) { state.statusHost.textContent = 'Loading register...'; state.statusHost.className = 'save-state save-state--saving'; }
    return EG.api.get('/api/attendance', {
      subjectId: state.subjectId,
      sectionId: state.sectionId,
      date: state.date || undefined
    }).then(function (data) {
      state.data = data;
      state.date = data.date;
      state.records = {};
      state.dirty = {};
      data.students.forEach(function (student) { state.records[student.id] = Boolean(student.present); });
      if (state.dateInput) state.dateInput.value = state.date;
      renderKpis();
      renderDateStrip();
      renderRoster();
      renderStatus();
      if (!data.canEdit) ui.toast('This term is archived, so attendance is read-only.', 'info');
    }).catch(function (error) {
      if (error.status === 401) return;
      if (error.code === 'NO_ACTIVE_TERM') {
        pages.mount({ title: 'Attendance', subtitle: 'No active term', content: pages.empty('No active term', 'Ask the HOD to create and activate a term before recording attendance.', el('a', { class: 'btn btn--primary', href: '/dashboard' }, 'Back to dashboard'), 'calendar') });
        return;
      }
      if (state.rosterHost) {
        state.rosterHost.textContent = '';
        state.rosterHost.appendChild(ui.errorState(error, function () { load(); }));
      }
      ui.toast(error.message, 'error');
    });
  }

  pages.guard(function () {
    var params = new URLSearchParams(window.location.search);
    var list = pages.pairs();
    if (!list.length) {
      pages.mount({
        title: 'Attendance',
        subtitle: 'No teaching assignments are configured',
        content: pages.empty('Nothing to register yet', 'Ask the HOD to create a term and assign subjects to sections.', el('a', { class: 'btn btn--primary', href: '/dashboard' }, 'Back to dashboard'), 'attendance')
      });
      return Promise.resolve(null);
    }
    var wanted = params.get('subjectId') && params.get('sectionId')
      ? list.find(function (pair) { return pair.subjectId === params.get('subjectId') && pair.sectionId === params.get('sectionId'); })
      : null;
    var chosen = wanted || list[0];
    state.subjectId = chosen.subjectId;
    state.sectionId = chosen.sectionId;
    state.date = params.get('date') || '';
    pages.mount({ title: 'Attendance', subtitle: 'Loading the register...', content: ui.skeletonPage() });
    buildChrome();
    updateQuery();
    return load();
  });
})();
