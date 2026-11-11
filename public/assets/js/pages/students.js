/* Students directory with scoped search, filters and imports. */
(function () {
  'use strict';

  var EG = window.EG;
  var ui = EG.ui;
  var el = ui.el;
  var pages = EG.pages;
  var icon = ui.icon;

  var state = { q: '', sectionId: '', band: '', sort: 'priority', direction: 'asc', offset: 0, limit: 25, data: null };

  function readQuery() {
    var params = new URLSearchParams(window.location.search);
    state.q = params.get('q') || '';
    state.sectionId = params.get('sectionId') || '';
    state.band = params.get('band') || '';
    state.sort = params.get('sort') || 'priority';
    state.direction = params.get('direction') || 'asc';
    state.offset = Number(params.get('offset')) || 0;
  }

  function writeQuery() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.sectionId) params.set('sectionId', state.sectionId);
    if (state.band) params.set('band', state.band);
    if (state.sort && state.sort !== 'priority') params.set('sort', state.sort);
    if (state.direction === 'desc') params.set('direction', 'desc');
    if (state.offset) params.set('offset', String(state.offset));
    var text = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (text ? '?' + text : ''));
  }

  function fetchRows() {
    writeQuery();
    return EG.api.get('/api/students', {
      q: state.q || undefined,
      sectionId: state.sectionId || undefined,
      band: state.band || undefined,
      sort: state.sort,
      direction: state.direction,
      limit: state.limit,
      offset: state.offset
    }).then(function (data) {
      state.data = data;
      render(data);
    });
  }

  function toolbar(data) {
    var search = el('input', { class: 'input input--search', type: 'search', placeholder: 'Search name, roll or section…', value: state.q, 'aria-label': 'Search students' });
    var timer = null;
    search.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        state.q = search.value.trim();
        state.offset = 0;
        fetchRows();
      }, 280);
    });

    var section = pages.select([{ value: '', label: 'All sections' }].concat((data.sections || []).map(function (item) { return { value: item.id, label: item.name }; })), { value: state.sectionId });
    section.addEventListener('change', function () { state.sectionId = section.value; state.offset = 0; fetchRows(); });

    var sort = pages.select([
      { value: 'priority', label: 'Priority order' },
      { value: 'name', label: 'Name' },
      { value: 'roll', label: 'Roll number' },
      { value: 'score', label: 'Score' },
      { value: 'attendance', label: 'Attendance' },
      { value: 'coursework', label: 'Coursework' },
      { value: 'marks', label: 'Marks' },
      { value: 'trend', label: 'Trend' },
      { value: 'forecast', label: 'Forecast' }
    ], { value: state.sort });
    sort.addEventListener('change', function () { state.sort = sort.value; state.offset = 0; fetchRows(); });

    var direction = pages.select([{ value: 'asc', label: 'Ascending' }, { value: 'desc', label: 'Descending' }], { value: state.direction });
    direction.addEventListener('change', function () { state.direction = direction.value; state.offset = 0; fetchRows(); });

    var bands = [
      ['', 'All'], ['high', 'Needs support'], ['medium', 'Watch'], ['low', 'On track'], ['nodata', 'No data']
    ];
    var chips = el('div', { class: 'chips' }, bands.map(function (pair) {
      return el('button', {
        class: 'chip' + (state.band === pair[0] ? ' is-active' : ''), type: 'button',
        onClick: function () { state.band = pair[0]; state.offset = 0; fetchRows(); }
      }, pair[1], pair[0] && data.summary && data.summary[pair[0] === 'nodata' ? 'noData' : pair[0]] !== undefined
        ? el('span', { class: 'chip__count', text: ' ' + ui.num(data.summary[pair[0] === 'nodata' ? 'noData' : pair[0]]) })
        : null);
    }));

    return el('div', { class: 'stack--sm mb-4' },
      el('div', { class: 'student-toolbar toolbar' },
        el('div', { class: 'field grow' }, el('label', { text: 'Search' }), search),
        el('div', { class: 'field' }, el('label', { text: 'Section' }), section),
        el('div', { class: 'field' }, el('label', { text: 'Sort by' }), sort),
        el('div', { class: 'field' }, el('label', { text: 'Direction' }), direction),
        el('button', { class: 'btn btn--sm', type: 'button', onClick: function () { state.q = ''; state.sectionId = ''; state.band = ''; state.sort = 'priority'; state.direction = 'asc'; state.offset = 0; fetchRows(); } }, 'Reset')
      ),
      el('div', { class: 'row row--between gap-3' }, chips,
        el('span', { class: 'xs faint', text: data.total + ' ' + ui.plural(data.total, 'student') + ' in view' })
      )
    );
  }

  function table(data) {
    if (!data.rows.length) {
      return pages.card({ body: pages.empty('No students match', 'Try a different search, section or band. Students with no entries appear under “No data”.', null, 'students') });
    }
    var body = el('tbody');
    data.rows.forEach(function (row) {
      var level = row.level;
      body.appendChild(el('tr', null,
        el('td', null,
          el('div', { class: 'person' },
            el('span', { class: 'avatar avatar--sm', text: ui.initials(row.name) }),
            el('span', { class: 'person__meta' },
              el('a', { class: 'person__name row-link', href: pages.studentHref(row.id), text: row.name }),
              el('span', { class: 'person__sub', text: row.roll })
            )
          )
        ),
        el('td', null, el('div', { class: 'small', text: row.sectionName }), el('div', { class: 'xs faint', text: [row.branch, row.semester].filter(Boolean).join(' · ') })),
        el('td', { class: 'num', text: ui.pct(row.attendance) }),
        el('td', { class: 'num', text: ui.pct(row.coursework) }),
        el('td', { class: 'num', text: ui.pct(row.marks) }),
        el('td', null,
          el('div', { class: 'score-cell' },
            el('span', { class: 'score-cell__num', text: row.hasData ? ui.num(row.score) : '—' }),
            pages.meter(row.score, level)
          )
        ),
        el('td', { class: 'num' },
          el('span', { class: 'pill ' + (row.markDelta > 0 ? 'pill--low' : row.markDelta < 0 ? 'pill--high' : 'pill--outline') },
            (row.markDelta > 0 ? '+' : '') + ui.num(row.markDelta) + ' pts'
          )
        ),
        el('td', null, el('span', { html: ui.levelPill(level, row.levelLabel) })),
        el('td', { class: 'actions' },
          el('a', { class: 'btn btn--sm btn--soft', href: pages.studentHref(row.id) }, 'Open', el('span', { html: icon('arrowRight', 13) }))
        )
      ));
    });
    return pages.card({
      title: 'Student list',
      subtitle: 'Scores update from attendance, coursework and assessment marks',
      flush: true,
      body: el('div', { class: 'table-wrap' },
        el('table', { class: 'table table--compact' },
          el('thead', null, el('tr', null,
            el('th', { text: 'Student' }), el('th', { text: 'Section' }),
            el('th', { class: 'num', text: 'Attendance' }), el('th', { class: 'num', text: 'Coursework' }), el('th', { class: 'num', text: 'Marks' }),
            el('th', { text: 'Score' }), el('th', { class: 'num', text: 'Trend' }), el('th', { text: 'Status' }), el('th', { class: 'actions', text: '' })
          )),
          body
        )
      ),
      foot: pagination(data)
    });
  }

  function pagination(data) {
    var from = data.total ? state.offset + 1 : 0;
    var to = Math.min(state.offset + state.limit, data.total);
    return el('div', { class: 'pagination' },
      el('span', { class: 'pagination__info', text: 'Showing ' + from + '–' + to + ' of ' + data.total }),
      el('button', { class: 'page-btn', type: 'button', disabled: state.offset === 0, onClick: function () { state.offset = Math.max(0, state.offset - state.limit); fetchRows(); } }, el('span', { html: icon('arrowLeft', 14) }), 'Previous'),
      el('button', { class: 'page-btn', type: 'button', disabled: !data.nextCursor, onClick: function () { state.offset += state.limit; fetchRows(); } }, 'Next', el('span', { html: icon('arrowRight', 14) }))
    );
  }

  function summaryChips(data) {
    var counts = data.summary || {};
    return el('div', { class: 'summary-chips mb-4' },
      el('span', { class: 'summary-chip' }, 'All ', el('strong', { text: ui.num(data.total) })),
      el('span', { class: 'summary-chip' }, el('span', { class: 'dot dot--high' }), 'Needs support ', el('strong', { text: ui.num(counts.high) })),
      el('span', { class: 'summary-chip' }, el('span', { class: 'dot dot--medium' }), 'Watch ', el('strong', { text: ui.num(counts.medium) })),
      el('span', { class: 'summary-chip' }, el('span', { class: 'dot dot--low' }), 'On track ', el('strong', { text: ui.num(counts.low) })),
      el('span', { class: 'summary-chip' }, 'No data ', el('strong', { text: ui.num(counts.noData) }))
    );
  }

  function render(data) {
    var content = el('div', null, summaryChips(data), toolbar(data), table(data));
    pages.mount({
      title: 'Students',
      subtitle: data.term.name + ' · ' + (EG.session.user.role === 'HOD' ? 'all sections' : 'students in your assigned sections'),
      actions: actions(data),
      content: content
    });
  }

  function actions(data) {
    var isHod = EG.session.user.role === 'HOD';
    var buttons = [];
    buttons.push(el('button', { class: 'btn', type: 'button', onClick: function () {
      var columns = [
        { key: 'roll', label: 'Roll' }, { key: 'name', label: 'Name' }, { key: 'sectionName', label: 'Section' },
        { key: 'attendance', label: 'Attendance %' }, { key: 'coursework', label: 'Coursework %' },
        { key: 'marks', label: 'Marks %' }, { key: 'score', label: 'Score' }, { key: 'levelLabel', label: 'Band' },
        { key: 'markDelta', label: 'Trend' }, { key: 'forecast', label: 'Forecast %' }, { key: 'topFactor', label: 'Top factor' }
      ];
      pages.download('eduguard-students-' + new Date().toISOString().slice(0, 10) + '.csv', data.rows, columns);
    } }, el('span', { html: icon('download') }), 'Export view'));
    buttons.push(el('button', { class: 'btn btn--soft', type: 'button', onClick: function () {
      EG.api.download('/api/export/at-risk.csv' + EG.api.query({
        sectionId: state.sectionId || undefined, subjectId: undefined
      })).catch(function (error) { ui.toast(error.message, 'error'); });
    } }, el('span', { html: icon('warning') }), 'At-risk CSV'));
    if (isHod) {
      buttons.push(el('button', { class: 'btn', type: 'button', onClick: function () { openImport(); } }, el('span', { html: icon('upload') }), 'Import CSV'));
      buttons.push(el('button', { class: 'btn btn--primary', type: 'button', onClick: function () { openCreate(); } }, el('span', { html: icon('plus') }), 'Add student'));
    }
    return el('div', { class: 'btn-row' }, buttons);
  }

  function openCreate() {
    var sectionList = (EG.session.scope.sections || []).map(function (section) { return { value: section.id, label: section.name + (section.branch ? ' · ' + section.branch : '') }; });
    if (!sectionList.length) { ui.toast('Create an active section first.', 'error'); return; }
    pages.formModal({
      title: 'Add a student',
      subtitle: 'The roll number must be unique across the school.',
      fields: [
        { name: 'name', label: 'Full name', required: true, span: true },
        { name: 'roll', label: 'Roll number', required: true, placeholder: 'e.g. 24CS001' },
        { name: 'sectionId', label: 'Section', type: 'select', options: sectionList, value: sectionList[0].value }
      ],
      submitLabel: 'Add student',
      validate: function (values) {
        if (values.name.length < 2) return 'Enter the student’s full name.';
        if (!values.roll) return 'Enter a roll number.';
        return null;
      },
      onSubmit: function (values) {
        return EG.api.post('/api/students', values).then(function (created) {
          ui.toast(created.name + ' was added.', 'success');
          fetchRows();
          return created;
        });
      }
    });
  }

  function openImport() {
    var sectionList = (EG.session.scope.sections || []).map(function (section) { return { value: section.id, label: section.name + (section.branch ? ' · ' + section.branch : '') }; });
    if (!sectionList.length) { ui.toast('Create an active section first.', 'error'); return; }
    var section = pages.select(sectionList, {});
    var choose = el('button', { class: 'btn btn--soft', type: 'button' }, el('span', { html: icon('upload') }), 'Choose CSV');
    var preview = el('div', { class: 'stack--sm' });
    var confirm = el('button', { class: 'btn btn--primary', type: 'button', disabled: true }, 'Import students');
    var rows = [];
    var errorBox = el('div', { class: 'error-box', hidden: true });

    var modal = ui.modal({
      title: 'Import students from CSV',
      subtitle: 'Use headers named “name” and “roll”. Existing roll numbers are skipped.',
      body: el('div', { class: 'stack' },
        el('div', { class: 'form-grid' },
          el('div', { class: 'field' }, el('label', { text: 'Import into section' }), section),
          el('div', { class: 'field' }, el('label', { text: 'File' }), el('div', { class: 'row gap-2' }, choose, el('span', { class: 'xs muted', text: 'CSV · up to 2 MB' })))
        ),
        el('div', { class: 'info-box' }, el('span', { html: icon('info', 17) }), el('span', { text: 'Example: name,roll — Aisha Khan,24CS001. You will see a preview before anything is saved.' })),
        errorBox,
        preview
      ),
      footer: el('div', { class: 'row row--end gap-2 w-100' },
        el('button', { class: 'btn', type: 'button', onClick: function () { modal.close(); } }, 'Cancel'),
        confirm
      )
    });

    choose.addEventListener('click', function () {
      EG.csv.chooseAndRead('.csv,text/csv').then(function (picked) {
        if (!picked.file) return;
        rows = (picked.table.rows || []).map(function (row) {
          return {
            name: row.name || row.student || row.student_name || '',
            roll: row.roll || row.roll_no || row.roll_number || ''
          };
        }).filter(function (row) { return row.name || row.roll; });
        if (!rows.length) {
          errorBox.hidden = false;
          errorBox.innerHTML = icon('warning', 17) + '<div>No usable rows were found. Check the column headers.</div>';
          return;
        }
        errorBox.hidden = true;
        preview.textContent = '';
        preview.appendChild(el('div', { class: 'row gap-2 muted small' }, el('span', { class: 'spinner' }), 'Checking ' + rows.length + ' rows…'));
        confirm.disabled = true;
        EG.api.post('/api/students/import', { sectionId: section.value, rows: rows, dryRun: true }).then(function (result) {
          preview.textContent = '';
          preview.appendChild(el('div', { class: 'row row--wrap gap-2' },
            el('span', { class: 'pill pill--low', text: result.matched + ' ready' }),
            el('span', { class: 'pill pill--high', text: result.unmatched + ' rejected' })
          ));
          if (result.errors && result.errors.length) {
            preview.appendChild(el('div', { class: 'warning-list mt-3' }, result.errors.slice(0, 8).map(function (error) {
              return el('div', { class: 'warning-item' }, el('span', { class: 'warning-item__icon', html: icon('warning', 16) }), el('p', { text: 'Row ' + error.row + ': ' + error.message }));
            })));
          }
          if (result.matched > 0) {
            preview.appendChild(el('div', { class: 'table-wrap mt-3' }, el('table', { class: 'table table--compact' }, el('thead', null, el('tr', null, el('th', { text: 'Row' }), el('th', { text: 'Name' }), el('th', { text: 'Roll' }))),
              el('tbody', null, (result.valid || []).slice(0, 10).map(function (row) { return el('tr', null, el('td', { text: '—' }), el('td', { text: row.name }), el('td', { text: row.roll })); }))
            )));
            confirm.disabled = false;
            confirm.dataset.pending = 'true';
          }
        }).catch(function (error) {
          preview.textContent = '';
          errorBox.hidden = false;
          errorBox.innerHTML = icon('warning', 17) + '<div>' + ui.esc(error.message) + '</div>';
        });
      }).catch(function (error) { ui.toast(error.message, 'error'); });
    });

    confirm.addEventListener('click', function () {
      if (!rows.length) return;
      pages.busy(confirm, EG.api.post('/api/students/import', { sectionId: section.value, rows: rows, dryRun: false })).then(function (result) {
        ui.toast(result.inserted + ' students imported' + (result.rejected ? ' · ' + result.rejected + ' rejected' : '') + '.', result.rejected ? 'info' : 'success');
        modal.close();
        fetchRows();
      }).catch(function (error) { ui.toast(error.message, 'error'); });
    });
  }

  pages.guard(function (session) {
    readQuery();
    pages.mount({ title: 'Students', subtitle: 'Loading the student directory…', content: ui.skeletonPage() });
    return fetchRows();
  });
})();
