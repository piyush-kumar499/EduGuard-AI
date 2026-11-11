/* Data progress: which subject-section groups still need marks entered. */
(function () {
  'use strict';

  var EG = window.EG;
  var ui = EG.ui;
  var el = ui.el;
  var pages = EG.pages;
  var icon = ui.icon;

  var state = {
    data: null,
    rows: [],
    q: '',
    status: '',
    sectionId: '',
    owner: '',
    kpiHost: null,
    tableHost: null,
    search: null,
    statusSelect: null,
    sectionSelect: null,
    ownerSelect: null
  };

  function filtered() {
    var query = state.q.toLowerCase();
    return state.rows.filter(function (row) {
      if (state.sectionId && row.sectionId !== state.sectionId) return false;
      if (state.owner && row.owner !== state.owner) return false;
      if (state.status === 'overdue' && !row.overdue) return false;
      if (state.status === 'empty' && !row.empty) return false;
      if (state.status === 'complete' && row.completeness < 100) return false;
      if (state.status === 'partial' && (row.empty || row.completeness >= 100)) return false;
      if (!query) return true;
      return (row.subjectName + ' ' + row.sectionName + ' ' + row.owner).toLowerCase().indexOf(query) !== -1;
    });
  }

  function renderKpis() {
    if (!state.kpiHost) return;
    var rows = filtered();
    var average = rows.length ? Math.round(rows.reduce(function (total, row) { return total + row.completeness; }, 0) / rows.length) : 0;
    var overdue = rows.filter(function (row) { return row.overdue; }).length;
    var empty = rows.filter(function (row) { return row.empty; }).length;
    state.kpiHost.textContent = '';
    [
      { label: 'Subject groups', value: rows.length, icon: 'structure', foot: 'Visible after filters' },
      { label: 'Average completeness', value: average + '%', icon: 'marks', tone: average >= 90 ? 'success' : average >= 60 ? 'warning' : 'danger', foot: 'Marks entered against possible marks' },
      { label: 'Below half complete', value: overdue, icon: 'warning', tone: overdue ? 'warning' : 'success', foot: 'Fewer than 50% of marks entered' },
      { label: 'No assessments', value: empty, icon: 'clock', tone: empty ? 'warning' : 'success', foot: 'No assessment created this term' }
    ].forEach(function (kpi) {
      state.kpiHost.appendChild(pages.kpi({ label: kpi.label, value: String(kpi.value), icon: kpi.icon, tone: kpi.tone || 'brand', foot: kpi.foot }));
    });
  }

  function renderTable() {
    if (!state.tableHost) return;
    var rows = filtered();
    state.tableHost.textContent = '';
    if (!rows.length) {
      state.tableHost.appendChild(pages.empty('Nothing to review', 'Adjust the filters or start entering marks for this term.', null, 'marks'));
      return;
    }
    var table = el('table', { class: 'table' },
      el('thead', null, el('tr', null,
        el('th', { text: 'Subject and section' }),
        el('th', { text: 'Lead faculty' }),
        el('th', { class: 'num', text: 'Assessments' }),
        el('th', { class: 'num', text: 'Students' }),
        el('th', { text: 'Marks entered' }),
        el('th', { text: 'Last update' }),
        el('th', { class: 'actions', text: '' })
      )),
      el('tbody', null, rows.map(function (row) {
        var level = row.completeness >= 90 ? 'low' : row.completeness >= 50 ? 'medium' : 'high';
        return el('tr', null,
          el('td', null,
            el('div', { class: 'structure-item__title', text: row.subjectName }),
            el('div', { class: 'structure-item__sub', text: 'Section ' + row.sectionName + (row.overdue ? ' - needs attention' : '') })
          ),
          el('td', null,
            row.owner === 'Unassigned'
              ? el('span', { class: 'pill pill--medium', text: 'Unassigned' })
              : el('span', { class: 'small', text: row.owner })
          ),
          el('td', { class: 'num', text: String(row.assessments) }),
          el('td', { class: 'num', text: String(row.students) }),
          el('td', null,
            el('div', { class: 'meter-row' },
              pages.meter(row.completeness, level),
              el('span', { class: 'meter-value', text: row.completeness + '%' })
            ),
            el('div', { class: 'xs faint', text: row.filled + ' of ' + row.total + ' marks' })
          ),
          el('td', null, el('span', { class: 'small muted', text: row.lastUpdate ? ui.timeAgo(row.lastUpdate) : 'No marks yet' })),
          el('td', { class: 'actions' },
            el('div', { class: 'row row--end gap-1' },
              el('a', { class: 'btn btn--sm btn--soft', href: '/marks' + EG.api.query({ subjectId: row.subjectId, sectionId: row.sectionId }) },
                el('span', { html: icon('marks', 13) }), 'Marks'),
              el('a', { class: 'btn btn--sm btn--ghost', href: '/reports' + EG.api.query({ subjectId: row.subjectId, sectionId: row.sectionId }) },
                el('span', { html: icon('reports', 13) }), 'Report')
            )
          )
        );
      }))
    );
    state.tableHost.appendChild(el('div', { class: 'table-wrap' }, table));
  }

  function render() {
    renderKpis();
    renderTable();
  }

  function exportCsv() {
    var rows = filtered().map(function (row) {
      return {
        subject: row.subjectName,
        section: row.sectionName,
        owner: row.owner,
        assessments: row.assessments,
        students: row.students,
        filled: row.filled,
        total: row.total,
        completeness: row.completeness,
        lastUpdate: row.lastUpdate || ''
      };
    });
    pages.download('eduguard-progress-' + new Date().toISOString().slice(0, 10) + '.csv', rows, [
      { key: 'subject', label: 'Subject' },
      { key: 'section', label: 'Section' },
      { key: 'owner', label: 'Lead faculty' },
      { key: 'assessments', label: 'Assessments' },
      { key: 'students', label: 'Students' },
      { key: 'filled', label: 'Marks entered' },
      { key: 'total', label: 'Possible marks' },
      { key: 'completeness', label: 'Completeness %' },
      { key: 'lastUpdate', label: 'Last update' }
    ]);
  }

  pages.guard(function () {
    if (EG.session.user.role !== 'HOD') return null;

    state.search = el('input', { class: 'input input--search', type: 'search', placeholder: 'Search subject, section or faculty...', 'aria-label': 'Search progress rows' });
    state.search.addEventListener('input', ui.debounce(function () {
      state.q = state.search.value.trim();
      render();
    }, 180));

    state.statusSelect = pages.select([
      { value: '', label: 'All groups' },
      { value: 'overdue', label: 'Below half complete' },
      { value: 'partial', label: 'In progress' },
      { value: 'complete', label: 'Complete (100%)' },
      { value: 'empty', label: 'No assessments' }
    ], { value: '' });
    state.statusSelect.addEventListener('change', function () {
      state.status = state.statusSelect.value;
      render();
    });

    state.sectionSelect = pages.select([{ value: '', label: 'All sections' }].concat(pages.sections().map(function (section) {
      return { value: section.id, label: section.name };
    })), { value: '' });
    state.sectionSelect.addEventListener('change', function () {
      state.sectionId = state.sectionSelect.value;
      render();
    });

    state.ownerSelect = pages.select([{ value: '', label: 'All faculty' }], { value: '' });
    state.ownerSelect.addEventListener('change', function () {
      state.owner = state.ownerSelect.value;
      render();
    });

    state.kpiHost = el('div', { class: 'kpi-grid' });
    state.tableHost = el('div');

    pages.mount({
      title: 'Data progress',
      subtitle: 'See which classes have complete marks and which need attention before reports.',
      actions: el('div', { class: 'btn-row' },
        el('button', { class: 'btn', type: 'button', onClick: exportCsv }, el('span', { html: icon('download') }), 'CSV')
      ),
      content: el('div', { class: 'stack' },
        state.kpiHost,
        pages.card({
          body: el('div', { class: 'row row--wrap gap-3' },
            el('div', { class: 'field grow', style: { minWidth: '220px' } }, el('label', { text: 'Search' }), state.search),
            el('div', { class: 'field' }, el('label', { text: 'Progress' }), state.statusSelect),
            el('div', { class: 'field' }, el('label', { text: 'Section' }), state.sectionSelect),
            el('div', { class: 'field' }, el('label', { text: 'Faculty' }), state.ownerSelect)
          )
        }),
        pages.card({ title: 'Subject groups', subtitle: 'Sorted by the lowest completeness first', flush: true, body: state.tableHost }),
        pages.card({
          title: 'How completeness is counted',
          className: 'card--accent',
          body: el('p', { class: 'small muted' },
            'Completeness compares recorded marks with every possible student and assessment in the term. A group below 50% is treated as behind. Use the Marks spreadsheet to fill gaps; saved marks update this view immediately.'
          )
        })
      )
    });

    return EG.api.get('/api/analytics/progress').then(function (data) {
      state.data = data;
      state.rows = data.rows || [];
      var owners = {};
      state.rows.forEach(function (row) { owners[row.owner] = true; });
      Object.keys(owners).sort().forEach(function (owner) {
        state.ownerSelect.appendChild(el('option', { value: owner, text: owner }));
      });
      render();
    }).catch(function (error) {
      if (error.status === 401) return;
      if (state.tableHost) {
        state.tableHost.textContent = '';
        state.tableHost.appendChild(ui.errorState(error, function () { window.location.reload(); }));
      }
      ui.toast(error.message, 'error');
    });
  });
})();
