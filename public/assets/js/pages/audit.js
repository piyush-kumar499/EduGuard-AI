/* Audit log: every sensitive change, with filters, diffs and CSV export. */
(function () {
  'use strict';

  var EG = window.EG;
  var ui = EG.ui;
  var el = ui.el;
  var pages = EG.pages;
  var icon = ui.icon;

  var LIMIT = 50;

  var state = {
    rows: [],
    total: 0,
    offset: 0,
    filters: { userId: '', action: '', entity: '', from: '', to: '' },
    tableHost: null,
    pagerHost: null,
    summaryHost: null,
    userSelect: null,
    actionSelect: null,
    entityInput: null,
    fromInput: null,
    toInput: null,
    populated: false
  };

  function queryParams() {
    return {
      limit: LIMIT,
      offset: state.offset,
      userId: state.filters.userId || undefined,
      action: state.filters.action || undefined,
      entity: state.filters.entity || undefined,
      from: state.filters.from || undefined,
      to: state.filters.to || undefined
    };
  }

  function actionLabel(action) {
    return String(action || '').replace(/[._]/g, ' ').replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
  }

  function shortId(id) {
    if (!id) return '';
    var text = String(id);
    return text.length > 14 ? text.slice(0, 8) + '...' : text;
  }

  function pretty(value) {
    if (value === null || value === undefined) return 'No value';
    if (typeof value === 'string') {
      try { return JSON.stringify(JSON.parse(value), null, 2); } catch (error) { return value; }
    }
    return JSON.stringify(value, null, 2);
  }

  function details(row) {
    var modal = ui.modal({
      title: actionLabel(row.action),
      subtitle: ui.dateTime(row.at) + ' - ' + (row.userName || 'System'),
      wide: true,
      body: el('div', { class: 'stack' },
        el('dl', { class: 'dl' },
          el('div', { class: 'dl__row' }, el('dt', { text: 'Entity' }), el('dd', { text: row.entity || '-' })),
          el('div', { class: 'dl__row' }, el('dt', { text: 'Entity id' }), el('dd', { text: row.entityId || '-' })),
          el('div', { class: 'dl__row' }, el('dt', { text: 'User role' }), el('dd', { text: row.userRole || '-' })),
          el('div', { class: 'dl__row' }, el('dt', { text: 'IP address' }), el('dd', { text: row.ip || '-' })),
          el('div', { class: 'dl__row' }, el('dt', { text: 'Reason' }), el('dd', { text: row.reason || 'No reason recorded' }))
        ),
        el('div', { class: 'diff' },
          el('div', null,
            el('div', { class: 'diff__label', text: 'Before' }),
            el('pre', { text: pretty(row.before) })
          ),
          el('div', null,
            el('div', { class: 'diff__label', text: 'After' }),
            el('pre', { text: pretty(row.after) })
          )
        )
      ),
      footer: el('div', { class: 'row row--end gap-2 w-100' },
        el('button', { class: 'btn', type: 'button', onClick: function () { pages.copy(JSON.stringify(row, null, 2)); } }, el('span', { html: icon('copy', 14) }), 'Copy record'),
        el('button', { class: 'btn btn--primary', type: 'button', onClick: function () { modal.close(); } }, 'Close')
      )
    });
  }

  function renderTable() {
    if (!state.tableHost) return;
    state.tableHost.textContent = '';
    if (!state.rows.length) {
      state.tableHost.appendChild(pages.empty('No audit entries match', 'Change the filters or clear them to see recent activity.', null, 'audit'));
      return;
    }
    var table = el('table', { class: 'table table--compact' },
      el('thead', null, el('tr', null,
        el('th', { text: 'When' }),
        el('th', { text: 'Who' }),
        el('th', { text: 'Action' }),
        el('th', { text: 'Entity' }),
        el('th', { text: 'Reason' }),
        el('th', { class: 'actions', text: '' })
      )),
      el('tbody', null, state.rows.map(function (row) {
        return el('tr', null,
          el('td', null,
            el('div', { class: 'small', text: ui.dateTime(row.at) }),
            el('div', { class: 'xs faint', text: ui.timeAgo(row.at) })
          ),
          el('td', null,
            el('div', { class: 'person' },
              el('span', { class: 'avatar', text: ui.initials(row.userName) }),
              el('div', { class: 'person__meta' },
                el('div', { class: 'person__name', text: row.userName || 'System' }),
                el('div', { class: 'person__sub', text: row.userRole || 'Automated' })
              )
            )
          ),
          el('td', null, el('span', { class: 'audit-action', text: row.action })),
          el('td', null,
            el('div', { class: 'small', text: row.entity || '-' }),
            row.entityId ? el('div', { class: 'xs faint', text: shortId(row.entityId) }) : null
          ),
          el('td', null, el('span', { class: 'small muted', text: row.reason || '-' })),
          el('td', { class: 'actions' },
            el('button', { class: 'btn btn--sm btn--ghost', type: 'button', onClick: function () { details(row); } },
              el('span', { html: icon('eye', 13) }), 'View')
          )
        );
      }))
    );
    state.tableHost.appendChild(el('div', { class: 'table-wrap' }, table));
  }

  function renderPager() {
    if (!state.pagerHost) return;
    state.pagerHost.textContent = '';
    var start = state.total ? state.offset + 1 : 0;
    var end = Math.min(state.offset + state.rows.length, state.total);
    var pagesCount = Math.max(1, Math.ceil(state.total / LIMIT));
    var current = Math.floor(state.offset / LIMIT) + 1;
    state.pagerHost.appendChild(el('div', { class: 'pagination' },
      el('span', { class: 'pagination__info', text: 'Showing ' + start + '-' + end + ' of ' + state.total + ' entries' }),
      el('button', { class: 'btn btn--sm', type: 'button', disabled: state.offset === 0, onClick: function () { go(state.offset - LIMIT); } }, 'Previous'),
      el('span', { class: 'xs muted', text: 'Page ' + current + ' of ' + pagesCount }),
      el('button', { class: 'btn btn--sm', type: 'button', disabled: end >= state.total, onClick: function () { go(state.offset + LIMIT); } }, 'Next')
    ));
  }

  function renderSummary() {
    if (!state.summaryHost) return;
    state.summaryHost.textContent = '';
    state.summaryHost.appendChild(el('span', { class: 'summary-chip' }, el('strong', { text: String(state.total) }), ' matching entries'));
    if (state.filters.action) state.summaryHost.appendChild(el('span', { class: 'summary-chip' }, 'Action: ', el('strong', { text: actionLabel(state.filters.action) })));
    if (state.filters.entity) state.summaryHost.appendChild(el('span', { class: 'summary-chip' }, 'Entity: ', el('strong', { text: state.filters.entity })));
    if (state.filters.from || state.filters.to) {
      state.summaryHost.appendChild(el('span', { class: 'summary-chip' }, 'Dates: ', el('strong', { text: (state.filters.from || 'start') + ' to ' + (state.filters.to || 'today') })));
    }
  }

  function populateFilters(users, actions) {
    if (!state.populated) {
      users.forEach(function (user) {
        state.userSelect.appendChild(el('option', { value: user.id, text: user.name }));
      });
      actions.forEach(function (action) {
        state.actionSelect.appendChild(el('option', { value: action, text: actionLabel(action) }));
      });
      state.populated = true;
    }
    if (state.userSelect.options.length > 1) state.userSelect.disabled = false;
  }

  function load() {
    if (state.tableHost) {
      state.tableHost.textContent = '';
      state.tableHost.appendChild(el('div', { class: 'skeleton', style: { height: '220px' } }));
    }
    return EG.api.get('/api/audit', queryParams()).then(function (data) {
      state.rows = data.rows || [];
      state.total = data.total || 0;
      populateFilters(data.users || [], data.actions || []);
      renderTable();
      renderPager();
      renderSummary();
    }).catch(function (error) {
      if (error.status === 401) return;
      if (state.tableHost) {
        state.tableHost.textContent = '';
        state.tableHost.appendChild(ui.errorState(error, load));
      }
      ui.toast(error.message, 'error');
    });
  }

  function go(offset) {
    state.offset = Math.max(0, offset);
    load();
  }

  function applyFilters() {
    state.filters.userId = state.userSelect.value;
    state.filters.action = state.actionSelect.value;
    state.filters.entity = state.entityInput.value.trim();
    state.filters.from = state.fromInput.value;
    state.filters.to = state.toInput.value;
    state.offset = 0;
    load();
  }

  function clearFilters() {
    state.userSelect.value = '';
    state.actionSelect.value = '';
    state.entityInput.value = '';
    state.fromInput.value = '';
    state.toInput.value = '';
    applyFilters();
  }

  function exportCsv() {
    var params = queryParams();
    delete params.limit;
    delete params.offset;
    EG.api.download('/api/audit.csv' + EG.api.query(params), 'eduguard-audit.csv').catch(function (error) {
      if (error.status !== 401) ui.toast(error.message, 'error');
    });
  }

  pages.guard(function () {
    if (EG.session.user.role !== 'HOD') return null;

    state.userSelect = pages.select([{ value: '', label: 'Everyone' }], { value: '' });
    state.actionSelect = pages.select([{ value: '', label: 'All actions' }], { value: '' });
    state.entityInput = el('input', { class: 'input', type: 'text', placeholder: 'e.g. mark, user', 'aria-label': 'Entity type' });
    state.fromInput = el('input', { class: 'input', type: 'date', 'aria-label': 'From date' });
    state.toInput = el('input', { class: 'input', type: 'date', 'aria-label': 'To date' });

    [state.userSelect, state.actionSelect].forEach(function (select) {
      select.addEventListener('change', applyFilters);
    });
    [state.entityInput, state.fromInput, state.toInput].forEach(function (input) {
      input.addEventListener('change', applyFilters);
    });

    state.summaryHost = el('div', { class: 'summary-chips' });
    state.tableHost = el('div');
    state.pagerHost = el('div');

    pages.mount({
      title: 'Audit log',
      subtitle: 'A durable record of authentication, marks, attendance, assignments and settings changes.',
      actions: el('div', { class: 'btn-row' },
        el('button', { class: 'btn', type: 'button', onClick: exportCsv }, el('span', { html: icon('download') }), 'Export CSV')
      ),
      content: el('div', { class: 'stack' },
        pages.card({
          body: el('div', { class: 'stack' },
            el('div', { class: 'audit-filters' },
              el('div', { class: 'field' }, el('label', { text: 'Person' }), state.userSelect),
              el('div', { class: 'field' }, el('label', { text: 'Action' }), state.actionSelect),
              el('div', { class: 'field' }, el('label', { text: 'Entity' }), state.entityInput),
              el('div', { class: 'field' }, el('label', { text: 'From' }), state.fromInput),
              el('div', { class: 'field' }, el('label', { text: 'To' }), state.toInput),
              el('div', { class: 'btn-row' },
                el('button', { class: 'btn', type: 'button', onClick: applyFilters }, 'Apply'),
                el('button', { class: 'btn btn--ghost', type: 'button', onClick: clearFilters }, 'Clear')
              )
            ),
            state.summaryHost
          )
        }),
        pages.card({ title: 'Recent activity', subtitle: 'Newest first', flush: true, body: state.tableHost, foot: state.pagerHost })
      )
    });

    return load();
  });
})();
