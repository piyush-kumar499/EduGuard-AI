/* Teaching assignments: a subject-by-section matrix that maps classes to faculty. */
(function () {
  'use strict';

  var EG = window.EG;
  var ui = EG.ui;
  var el = ui.el;
  var pages = EG.pages;
  var icon = ui.icon;

  var state = {
    data: null,
    matrix: {},
    faculty: [],
    subjects: [],
    sections: [],
    dirty: false,
    q: '',
    tableHost: null,
    kpiHost: null,
    search: null,
    saveButton: null,
    resetButton: null,
    beforeUnload: null
  };

  function key(subjectId, sectionId) {
    return subjectId + ':' + sectionId;
  }

  function cellCount() {
    return state.subjects.length * state.sections.length;
  }

  function assignedCount() {
    return Object.keys(state.matrix).filter(function (pair) { return Boolean(state.matrix[pair]); }).length;
  }

  function setDirty(value) {
    state.dirty = value;
    if (state.saveButton) state.saveButton.disabled = !value;
    if (state.resetButton) state.resetButton.disabled = !value;
  }

  function hydrate() {
    state.matrix = {};
    state.faculty = (state.data && state.data.faculty) || [];
    state.subjects = (state.data && state.data.subjects) || [];
    state.sections = (state.data && state.data.sections) || [];
    ((state.data && state.data.assignments) || []).forEach(function (row) {
      state.matrix[key(row.subjectId, row.sectionId)] = row.userId;
    });
    setDirty(false);
  }

  function renderKpis() {
    if (!state.kpiHost) return;
    var total = cellCount();
    var filled = assignedCount();
    var coverage = total ? Math.round((filled / total) * 100) : 0;
    var involved = {};
    Object.keys(state.matrix).forEach(function (pair) {
      if (state.matrix[pair]) involved[state.matrix[pair]] = true;
    });
    state.kpiHost.textContent = '';
    [
      { label: 'Teaching pairs', value: filled, icon: 'assignments', foot: total + ' subject and section combinations' },
      { label: 'Coverage', value: coverage + '%', icon: 'target', tone: coverage === 100 ? 'success' : coverage >= 70 ? 'brand' : 'warning', foot: 'Combinations with a named teacher' },
      { label: 'Faculty involved', value: Object.keys(involved).length, icon: 'faculty', foot: 'People with at least one class' },
      { label: 'Gaps', value: total - filled, icon: 'warning', tone: total - filled ? 'warning' : 'success', foot: 'Combinations still unassigned' }
    ].forEach(function (kpi) {
      state.kpiHost.appendChild(pages.kpi({ label: kpi.label, value: String(kpi.value), icon: kpi.icon, tone: kpi.tone || 'brand', foot: kpi.foot }));
    });
  }

  function facultyOptions(current) {
    var options = [{ value: '', label: 'Unassigned' }];
    state.faculty.forEach(function (person) {
      options.push({
        value: person.id,
        label: person.name + (person.role === 'HOD' ? ' (HOD)' : '')
      });
    });
    return options.map(function (option) {
      return { value: option.value, label: option.label, selected: option.value === (current || '') };
    });
  }

  function renderTable() {
    if (!state.tableHost) return;
    state.tableHost.textContent = '';
    if (!state.subjects.length || !state.sections.length) {
      state.tableHost.appendChild(pages.empty('Assignments need subjects and sections', 'Create at least one subject and one section in Structure first.', null, 'structure'));
      return;
    }
    var query = state.q.toLowerCase();
    var subjects = state.subjects.filter(function (subject) {
      if (!query) return true;
      return (subject.name + ' ' + (subject.code || '')).toLowerCase().indexOf(query) !== -1;
    });
    if (!subjects.length) {
      state.tableHost.appendChild(pages.empty('No subjects match', 'Clear the search to see the full matrix.', null, 'search'));
      return;
    }
    var head = el('tr', null,
      el('th', { text: 'Subject' }),
      state.sections.map(function (section) {
        return el('th', { text: section.name, title: (section.branch || '') + ' ' + (section.semester || '') });
      })
    );
    var body = subjects.map(function (subject) {
      return el('tr', null,
        el('td', null,
          el('div', { class: 'structure-item__title', text: subject.name }),
          subject.code ? el('div', { class: 'structure-item__sub', text: subject.code }) : null
        ),
        state.sections.map(function (section) {
          var pair = key(subject.id, section.id);
          var select = el('select', {
            class: 'select', 'aria-label': subject.name + ' section ' + section.name,
            onChange: function () {
              if (select.value) state.matrix[pair] = select.value;
              else delete state.matrix[pair];
              select.closest('td').className = select.value ? 'is-assigned' : 'is-unassigned';
              setDirty(true);
              renderKpis();
            }
          }, facultyOptions(state.matrix[pair]).map(function (option) {
            return el('option', { value: option.value, text: option.label, selected: option.selected });
          }));
          var holder = el('td', { class: state.matrix[pair] ? 'is-assigned' : 'is-unassigned' }, select);
          return holder;
        })
      );
    });
    state.tableHost.appendChild(el('div', { class: 'table-wrap' },
      el('table', { class: 'table assignment-matrix' },
        el('thead', null, head),
        el('tbody', null, body)
      )
    ));
  }

  function render() {
    renderKpis();
    renderTable();
  }

  function reload() {
    return EG.api.get('/api/assignments').then(function (data) {
      state.data = data;
      hydrate();
      render();
    }).catch(function (error) {
      if (error.status === 401) return;
      if (state.tableHost) {
        state.tableHost.textContent = '';
        state.tableHost.appendChild(ui.errorState(error, function () { reload(); }));
      }
      ui.toast(error.message, 'error');
    });
  }

  function changesModal(changes, reassigned) {
    if (!changes.length) {
      ui.toast('No assignment changes were needed.', 'info');
      return;
    }
    var rows = reassigned.length ? reassigned : changes;
    var modal = ui.modal({
      title: 'Assignments saved',
      subtitle: changes.length + ' ' + ui.plural(changes.length, 'change') + ' recorded in the audit log.',
      body: el('div', { class: 'stack' },
        reassigned.length ? el('div', { class: 'warning-box' }, 'Some classes were reassigned. The previous teacher no longer has access to them.') : null,
        el('div', { class: 'list-rows' }, rows.map(function (change) {
          var parts = String(change.pair || '').split(':');
          var pair = parts.length === 2 ? (change.subject || parts[0]) + ' - ' + (change.section || parts[1]) : change.pair;
          return el('div', { class: 'list-row' },
            el('div', { class: 'list-row__main' },
              el('div', { class: 'list-row__title', text: pair }),
              el('div', { class: 'list-row__sub', text: (change.from || 'Unassigned') + ' -> ' + (change.to || 'Unassigned') })
            )
          );
        }))
      ),
      footer: el('button', { class: 'btn btn--primary', type: 'button', onClick: function () { modal.close(); } }, 'Done')
    });
  }

  function save() {
    if (!state.dirty) return;
    var assignments = [];
    state.subjects.forEach(function (subject) {
      state.sections.forEach(function (section) {
        var userId = state.matrix[key(subject.id, section.id)];
        if (userId) assignments.push({ subjectId: subject.id, sectionId: section.id, userId: userId });
      });
    });
    pages.busy(state.saveButton, EG.api.put('/api/assignments', { assignments: assignments }).then(function (result) {
      setDirty(false);
      ui.toast(result.saved + ' ' + ui.plural(result.saved, 'assignment') + ' saved.', 'success');
      changesModal(result.changes || [], result.reassigned || []);
      return reload();
    }).catch(function (error) {
      if (error.status !== 401) ui.toast(error.message, 'error');
    }));
  }

  function exportCsv() {
    var rows = [];
    state.subjects.forEach(function (subject) {
      state.sections.forEach(function (section) {
        var userId = state.matrix[key(subject.id, section.id)];
        var person = state.faculty.filter(function (item) { return item.id === userId; })[0];
        rows.push({
          subject: subject.name,
          section: section.name,
          faculty: person ? person.name : 'Unassigned',
          role: person ? person.role : ''
        });
      });
    });
    pages.download('eduguard-assignments-' + new Date().toISOString().slice(0, 10) + '.csv', rows, [
      { key: 'subject', label: 'Subject' },
      { key: 'section', label: 'Section' },
      { key: 'faculty', label: 'Faculty' },
      { key: 'role', label: 'Role' }
    ]);
  }

  pages.guard(function () {
    if (EG.session.user.role !== 'HOD') return null;

    state.search = el('input', { class: 'input input--search', type: 'search', placeholder: 'Search subject...', 'aria-label': 'Search subjects' });
    state.search.addEventListener('input', ui.debounce(function () {
      state.q = state.search.value.trim();
      renderTable();
    }, 180));

    state.kpiHost = el('div', { class: 'kpi-grid' });
    state.tableHost = el('div');
    state.saveButton = el('button', { class: 'btn btn--primary', type: 'button', disabled: true, onClick: save },
      el('span', { html: icon('check') }), 'Save changes');
    state.resetButton = el('button', { class: 'btn', type: 'button', disabled: true, onClick: function () { hydrate(); render(); } },
      el('span', { html: icon('refresh') }), 'Discard');

    state.beforeUnload = function (event) {
      if (!state.dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', state.beforeUnload);

    pages.mount({
      title: 'Teaching assignments',
      subtitle: 'Connect each subject and section to the faculty member who teaches it.',
      actions: el('div', { class: 'btn-row' },
        state.resetButton,
        el('button', { class: 'btn', type: 'button', onClick: exportCsv }, el('span', { html: icon('download') }), 'CSV'),
        state.saveButton
      ),
      content: el('div', { class: 'stack' },
        state.kpiHost,
        pages.card({
          body: el('div', { class: 'row row--wrap gap-3' },
            el('div', { class: 'field grow', style: { minWidth: '240px' } }, el('label', { text: 'Search subjects' }), state.search),
            el('div', { class: 'field', style: { maxWidth: '320px' } },
              el('div', { class: 'field__hint', text: 'Unassigned cells are highlighted. Changes take effect immediately for faculty scope.' })
            )
          )
        }),
        pages.card({
          title: 'Assignment matrix',
          subtitle: 'Subjects down the side, sections across the top',
          flush: true,
          body: state.tableHost
        }),
        pages.card({
          title: 'What changes mean',
          className: 'card--accent',
          body: el('div', { class: 'grid grid--auto' },
            el('div', null, el('h3', { class: 'small strong', text: 'Access follows the matrix' }), el('p', { class: 'xs muted', text: 'Faculty can only see the subjects and sections listed here. Removing an assignment removes that access on the next request.' })),
            el('div', null, el('h3', { class: 'small strong', text: 'Unassigned classes' }), el('p', { class: 'xs muted', text: 'A subject and section with no teacher still appears for the HOD. Only HODs can enter marks for it.' })),
            el('div', null, el('h3', { class: 'small strong', text: 'Audit trail' }), el('p', { class: 'xs muted', text: 'Every assignment, reassignment and removal is recorded with who made the change and when.' }))
          )
        })
      )
    });

    return reload();
  });
})();
