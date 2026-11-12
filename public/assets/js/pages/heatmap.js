/* Class heatmap: every student and subject in one scan-friendly grid. */
(function () {
  'use strict';

  var EG = window.EG;
  var ui = EG.ui;
  var el = ui.el;
  var pages = EG.pages;
  var icon = ui.icon;

  var SCALE_LABELS = ['Below 40', '40-49', '50-54', '55-59', '60-64', '65-69', '70-79', '80 and above'];

  var state = {
    sectionId: '', q: '', band: '', sort: 'score',
    data: null, rows: [], sectionSelect: null, search: null,
    chipsHost: null, legendHost: null, tableHost: null, kpiHost: null
  };
  var loadToken = 0;

  function scaleFor(value) {
    if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return null;
    var score = Number(value);
    if (score < 40) return 0;
    if (score < 50) return 1;
    if (score < 55) return 2;
    if (score < 60) return 3;
    if (score < 65) return 4;
    if (score < 70) return 5;
    if (score < 80) return 6;
    return 7;
  }

  function updateQuery() {
    var params = new URLSearchParams();
    if (state.sectionId) params.set('sectionId', state.sectionId);
    if (state.q) params.set('q', state.q);
    var text = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (text ? '?' + text : ''));
  }

  function filteredRows() {
    var rows = (state.data ? state.data.rows : []).slice();
    if (state.band === 'nodata') rows = rows.filter(function (row) { return !row.hasData; });
    else if (state.band) rows = rows.filter(function (row) { return row.hasData && row.level === state.band; });
    var dir = 1;
    rows.sort(function (a, b) {
      if (state.sort === 'name') return a.name.localeCompare(b.name);
      if (state.sort === 'attendance') return (a.attendance === null ? 101 : a.attendance) - (b.attendance === null ? 101 : b.attendance);
      if (state.sort === 'roll') return a.roll.localeCompare(b.roll);
      return (a.score === null ? 101 : a.score) - (b.score === null ? 101 : b.score);
    });
    return rows;
  }

  function renderKpis() {
    if (!state.kpiHost || !state.data) return;
    var counts = state.data.counts || {};
    state.kpiHost.textContent = '';
    [
      { label: 'Students in view', value: ui.num(filteredRows().length), icon: 'students', foot: 'Matching the current filters' },
      { label: 'Needs support', value: ui.num(counts.high || 0), icon: 'warning', tone: 'danger', foot: 'Score below 50' },
      { label: 'Watch closely', value: ui.num(counts.medium || 0), icon: 'activity', tone: 'warning', foot: 'Score 50 to 69' },
      { label: 'On track', value: ui.num(counts.low || 0), icon: 'check', tone: 'success', foot: 'Score 70 and above' }
    ].forEach(function (kpi) {
      state.kpiHost.appendChild(pages.kpi({ label: kpi.label, value: kpi.value, icon: kpi.icon, tone: kpi.tone || 'brand', foot: kpi.foot }));
    });
  }

  function renderChips() {
    if (!state.chipsHost || !state.data) return;
    var counts = state.data.counts || {};
    state.chipsHost.textContent = '';
    [
      ['', 'All', state.data.rows.length],
      ['high', 'Needs support', counts.high || 0],
      ['medium', 'Watch closely', counts.medium || 0],
      ['low', 'On track', counts.low || 0],
      ['nodata', 'No data', counts.noData || 0]
    ].forEach(function (item) {
      state.chipsHost.appendChild(el('button', {
        class: 'chip' + (state.band === item[0] ? ' is-active' : ''),
        type: 'button',
        onClick: function () { state.band = item[0]; renderKpis(); renderChips(); renderTable(); }
      }, item[1], el('span', { class: 'chip__count', text: ' ' + ui.num(item[2]) })));
    });
  }

  function renderLegend() {
    if (!state.legendHost) return;
    state.legendHost.textContent = '';
    var scale = el('div', { class: 'heat-legend__scale' });
    SCALE_LABELS.forEach(function (label, index) {
      scale.appendChild(el('span', { class: 'heat-legend__swatch heat-scale-' + index, title: label }));
    });
    state.legendHost.appendChild(el('span', { text: 'Subject percentage:' }));
    state.legendHost.appendChild(scale);
    state.legendHost.appendChild(el('span', { text: 'grey means no entries yet' }));
  }

  function heatCell(row, subject) {
    var value = row.subjects ? row.subjects[subject.id] : null;
    var scale = scaleFor(value);
    var title = row.name + ' - ' + subject.name + ': ' + (value === null || value === undefined ? 'no data' : Math.round(value) + '%');
    return el('td', null,
      el('span', {
        class: 'heat-cell' + (scale === null ? ' heat-cell--empty' : ' heat-scale-' + scale),
        title: title,
        text: scale === null ? '-' : ui.num(value)
      })
    );
  }

  function renderTable() {
    if (!state.tableHost || !state.data) return;
    state.rows = filteredRows();
    state.tableHost.textContent = '';
    if (!state.rows.length) {
      state.tableHost.appendChild(pages.empty('No students match', 'Try another section, search or band. Students with no entries appear under "No data".', null, 'heatmap'));
      return;
    }
    var subjects = state.data.subjects || [];
    var body = el('tbody');
    state.rows.forEach(function (row) {
      var nameLink = el('a', { class: 'row-link', href: pages.studentHref(row.id), text: row.name });
      var cells = [
        el('td', { class: 'name-col' },
          el('div', { class: 'person' },
            el('span', { class: 'avatar avatar--sm', text: ui.initials(row.name) }),
            el('span', { class: 'person__meta' },
              nameLink,
              el('span', { class: 'person__sub', text: row.roll + ' - ' + row.sectionName })
            )
          )
        )
      ];
      subjects.forEach(function (subject) { cells.push(heatCell(row, subject)); });
      cells.push(el('td', { class: 'num', text: ui.pct(row.attendance) }));
      cells.push(el('td', { class: 'num', text: ui.pct(row.coursework) }));
      cells.push(el('td', { class: 'num', text: ui.pct(row.marks) }));
      cells.push(el('td', null, el('div', { class: 'row gap-2', style: { justifyContent: 'center' } },
        el('strong', { text: row.hasData ? ui.num(row.score) : '-' }),
        el('span', { html: ui.levelPill(row.level, row.levelLabel) })
      )));
      body.appendChild(el('tr', null, cells));
    });

    var head = el('thead', null, el('tr', null,
      el('th', { class: 'name-col', text: 'Student' }),
      subjects.map(function (subject) { return el('th', { title: subject.name, text: subject.name }); }),
      el('th', { class: 'num', text: 'Att.' }), el('th', { class: 'num', text: 'CW' }),
      el('th', { class: 'num', text: 'Marks' }), el('th', { text: 'Score / band' })
    ));
    state.tableHost.appendChild(el('div', { class: 'table-wrap' },
      el('table', { class: 'table table--compact heat-table' }, head, body)
    ));
    state.tableHost.appendChild(el('p', { class: 'xs faint mt-3', text: 'Hover a cell for the exact value. Att. is attendance, CW is coursework completion. A dash means no entries yet, not a zero.' }));
  }

  function renderAll() {
    renderKpis();
    renderChips();
    renderTable();
  }

  function load() {
    var token = ++loadToken;
    updateQuery();
    return EG.api.get('/api/analytics/heatmap', {
      sectionId: state.sectionId || undefined,
      q: state.q || undefined
    }).then(function (data) {
      if (token !== loadToken) return;
      state.data = data;
      renderAll();
    }).catch(function (error) {
      if (error.status === 401 || token !== loadToken) return;
      if (state.tableHost) {
        state.tableHost.textContent = '';
        state.tableHost.appendChild(ui.errorState(error, load));
      }
      ui.toast(error.message, 'error');
    });
  }

  function exportCsv() {
    if (!state.data) return;
    var subjects = state.data.subjects || [];
    var rows = state.rows.map(function (row) {
      var record = {
        roll: row.roll, name: row.name, section: row.sectionName,
        attendance: row.attendance, coursework: row.coursework, marks: row.marks,
        score: row.score, band: row.levelLabel
      };
      subjects.forEach(function (subject) {
        record['subject_' + subject.name] = row.subjects ? row.subjects[subject.id] : null;
      });
      return record;
    });
    var columns = [
      { key: 'roll', label: 'Roll' }, { key: 'name', label: 'Name' }, { key: 'section', label: 'Section' },
      { key: 'attendance', label: 'Attendance %' }, { key: 'coursework', label: 'Coursework %' },
      { key: 'marks', label: 'Marks %' }, { key: 'score', label: 'Score' }, { key: 'band', label: 'Band' }
    ].concat(subjects.map(function (subject) { return { key: 'subject_' + subject.name, label: subject.name }; }));
    pages.download('eduguard-heatmap-' + new Date().toISOString().slice(0, 10) + '.csv', rows, columns);
  }

  pages.guard(function () {
    var params = new URLSearchParams(window.location.search);
    state.sectionId = params.get('sectionId') || '';
    state.q = params.get('q') || '';
    pages.mount({ title: 'Class heatmap', subtitle: 'Loading the class grid...', content: ui.skeletonPage() });

    state.sectionSelect = pages.select([{ value: '', label: 'All sections' }].concat(pages.sections().map(function (section) {
      return { value: section.id, label: section.name };
    })), { value: state.sectionId });
    state.sectionSelect.addEventListener('change', function () {
      state.sectionId = state.sectionSelect.value;
      load();
    });

    state.search = el('input', { class: 'input input--search', type: 'search', placeholder: 'Search a student...', value: state.q, 'aria-label': 'Search students' });
    state.search.addEventListener('input', ui.debounce(function () {
      state.q = state.search.value.trim();
      load();
    }, 250));

    state.kpiHost = el('div', { class: 'kpi-grid' });
    state.chipsHost = el('div', { class: 'chips' });
    state.legendHost = el('div', { class: 'heat-legend' });
    state.tableHost = el('div');

    var controls = pages.card({
      body: el('div', { class: 'stack--sm' },
        el('div', { class: 'row row--wrap gap-3' },
          el('div', { class: 'field grow', style: { minWidth: '200px' } }, el('label', { text: 'Search' }), state.search),
          el('div', { class: 'field', style: { minWidth: '170px' } }, el('label', { text: 'Section' }), state.sectionSelect),
          el('div', { class: 'field' }, el('label', { text: 'Sort rows by' }, (function () {
            var sort = pages.select([
              { value: 'score', label: 'Lowest score first' },
              { value: 'name', label: 'Name' },
              { value: 'roll', label: 'Roll number' },
              { value: 'attendance', label: 'Lowest attendance first' }
            ], { value: state.sort });
            sort.addEventListener('change', function () { state.sort = sort.value; renderTable(); });
            return sort;
          })()))
        ),
        state.chipsHost,
        state.legendHost
      )
    });

    pages.mount({
      title: 'Class heatmap',
      subtitle: 'One grid for every student and subject. Red areas are prompts for a conversation, not verdicts.',
      actions: el('div', { class: 'btn-row' },
        el('button', { class: 'btn', type: 'button', onClick: exportCsv }, el('span', { html: icon('download') }), 'CSV'),
        el('button', { class: 'btn', type: 'button', onClick: function () { window.print(); } }, el('span', { html: icon('printer') }), 'Print'),
        el('button', { class: 'btn btn--soft', type: 'button', onClick: load }, el('span', { html: icon('refresh') }), 'Refresh')
      ),
      content: el('div', { class: 'stack' }, controls, state.kpiHost, pages.card({ title: 'Student by subject', subtitle: 'Subject percentages use each subject marking scheme', flush: true, body: state.tableHost }))
    });
    renderLegend();
    return load();
  });
})();
