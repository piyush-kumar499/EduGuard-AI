/* Structure: sections, subjects, assessment types and subject weighting schemes. */
(function () {
  'use strict';

  var EG = window.EG;
  var ui = EG.ui;
  var el = ui.el;
  var pages = EG.pages;
  var icon = ui.icon;

  var state = {
    sections: [],
    subjects: [],
    types: [],
    tab: 'sections',
    kpiHost: null,
    tabHost: null,
    panelHost: null,
    tabs: []
  };

  function activeCount(rows) {
    return rows.filter(function (row) { return row.active; }).length;
  }

  function renderKpis() {
    if (!state.kpiHost) return;
    var enrolled = state.sections.reduce(function (total, section) { return total + (section.students || 0); }, 0);
    state.kpiHost.textContent = '';
    [
      { label: 'Sections', value: activeCount(state.sections), icon: 'structure', foot: enrolled + ' enrolled students' },
      { label: 'Subjects', value: activeCount(state.subjects), icon: 'book', foot: state.subjects.filter(function (row) { return !row.active; }).length + ' inactive' },
      { label: 'Assessment types', value: activeCount(state.types), icon: 'list', foot: state.types.filter(function (row) { return row.isCoursework; }).length + ' count as coursework' },
      { label: 'Assessments created', value: state.subjects.reduce(function (total, row) { return total + (row.assessments || 0); }, 0), icon: 'marks', foot: 'Across all subjects' }
    ].forEach(function (kpi) {
      state.kpiHost.appendChild(pages.kpi({ label: kpi.label, value: String(kpi.value), icon: kpi.icon, foot: kpi.foot }));
    });
  }

  function pill(active) {
    return el('span', { class: 'pill ' + (active ? 'pill--low' : 'pill--nodata'), text: active ? 'Active' : 'Inactive' });
  }

  function sectionModal(section) {
    var editing = Boolean(section);
    pages.formModal({
      title: editing ? 'Edit section ' + section.name : 'Add a section',
      subtitle: 'Sections group students for attendance, marks and reports.',
      submitLabel: editing ? 'Save section' : 'Create section',
      fields: [
        { name: 'branch', label: 'Branch', value: editing ? section.branch : '', placeholder: 'Computer Science' },
        { name: 'semester', label: 'Semester', value: editing ? section.semester : '', placeholder: '3' },
        { name: 'name', label: 'Section name', value: editing ? section.name : '', placeholder: 'A' },
        editing ? { name: 'active', label: 'Active', type: 'checkbox', value: section.active, hint: 'Inactive sections stay in historical data but are hidden from pickers.' } : null
      ].filter(Boolean),
      validate: function (values) {
        if (!values.branch) return 'Enter a branch.';
        if (!values.semester) return 'Enter a semester.';
        if (!values.name) return 'Enter a section name.';
        return null;
      },
      onSubmit: function (values) {
        var body = { branch: values.branch, semester: String(values.semester), name: values.name };
        if (editing) body.active = values.active;
        var request = editing
          ? EG.api.patch('/api/sections/' + encodeURIComponent(section.id), body)
          : EG.api.post('/api/sections', body);
        return request.then(function () {
          ui.toast(editing ? 'Section updated.' : 'Section created.', 'success');
          return refresh();
        });
      }
    });
  }

  function subjectModal(subject) {
    var editing = Boolean(subject);
    pages.formModal({
      title: editing ? 'Edit ' + subject.name : 'Add a subject',
      submitLabel: editing ? 'Save subject' : 'Create subject',
      fields: [
        { name: 'name', label: 'Subject name', value: editing ? subject.name : '', placeholder: 'Mathematics' },
        { name: 'code', label: 'Subject code (optional)', value: editing ? subject.code : '', placeholder: 'MATH-101' },
        editing ? { name: 'active', label: 'Active', type: 'checkbox', value: subject.active, hint: 'Inactive subjects are removed from new assessments and pickers.' } : null
      ].filter(Boolean),
      validate: function (values) {
        if (!values.name || values.name.length < 2) return 'Enter a subject name with at least two characters.';
        return null;
      },
      onSubmit: function (values) {
        var body = { name: values.name, code: values.code || '' };
        if (editing) body.active = values.active;
        var request = editing
          ? EG.api.patch('/api/subjects/' + encodeURIComponent(subject.id), body)
          : EG.api.post('/api/subjects', body);
        return request.then(function () {
          ui.toast(editing ? 'Subject updated.' : 'Subject created.', 'success');
          return refresh();
        });
      }
    });
  }

  function typeModal(type) {
    var editing = Boolean(type);
    pages.formModal({
      title: editing ? 'Edit ' + type.name : 'Add an assessment type',
      subtitle: 'Coursework types feed the coursework signal in the scoring engine.',
      submitLabel: editing ? 'Save type' : 'Create type',
      fields: [
        { name: 'name', label: 'Type name', value: editing ? type.name : '', placeholder: 'Lab report' },
        { name: 'isCoursework', label: 'This type counts as coursework', type: 'checkbox', value: editing ? type.isCoursework : false, hint: 'Exempt and present statuses affect the coursework percentage.' },
        editing ? { name: 'active', label: 'Active', type: 'checkbox', value: type.active } : null
      ].filter(Boolean),
      validate: function (values) {
        if (!values.name || values.name.length < 2) return 'Enter a type name with at least two characters.';
        return null;
      },
      onSubmit: function (values) {
        var body = { name: values.name, isCoursework: values.isCoursework };
        if (editing) body.active = values.active;
        var request = editing
          ? EG.api.patch('/api/assessment-types/' + encodeURIComponent(type.id), body)
          : EG.api.post('/api/assessment-types', body);
        return request.then(function () {
          ui.toast(editing ? 'Assessment type updated.' : 'Assessment type created.', 'success');
          return refresh();
        });
      }
    });
  }

  function openScheme(subject) {
    EG.api.get('/api/schemes/' + encodeURIComponent(subject.id)).then(function (data) {
      var rows = new Map();
      (data.rows || []).forEach(function (row) { rows.set(row.typeId, row); });
      var controls = [];
      var body = el('div', { class: 'stack' });
      var totalNode = el('strong', { text: '0%' });
      var totalRow = el('div', { class: 'weight-total' }, el('span', { text: 'Total weight' }), totalNode);

      function total() {
        return controls.reduce(function (sum, item) { return sum + (Number(item.weight.value) || 0); }, 0);
      }
      function syncTotal() {
        var value = total();
        totalNode.textContent = value + '%';
        var bad = Math.abs(value - 100) > 0.01;
        totalRow.classList.toggle('is-bad', bad);
      }

      body.appendChild(el('div', { class: 'info-box' }, 'Weights must total 100. Types with a weight of zero are left out of the combined subject mark. When only some types have data, the remaining weights are re-normalised.'));
      var header = el('div', { class: 'scheme-row xs faint strong' },
        el('span', { text: 'Assessment type' }),
        el('span', { text: 'Weight' }),
        el('span', { text: 'Rule' }),
        el('span', { text: 'Best N' }),
        el('span', { class: 'text-right', text: 'Included' })
      );
      body.appendChild(header);

      (data.types || []).forEach(function (type) {
        var existing = rows.get(type.id);
        var weight = el('input', { class: 'input input--sm', type: 'number', min: 0, max: 100, step: 1, value: existing ? existing.weight : 0, 'aria-label': 'Weight for ' + type.name });
        var rule = pages.select([
          { value: 'average', label: 'Average' },
          { value: 'best_n', label: 'Best N' },
          { value: 'sum', label: 'Sum' }
        ], { value: existing ? existing.rule : 'average' });
        var bestN = el('input', { class: 'input input--sm', type: 'number', min: 1, max: 50, step: 1, value: existing && existing.ruleN ? existing.ruleN : 1, 'aria-label': 'Best N for ' + type.name });
        function syncBestN() {
          bestN.disabled = rule.value !== 'best_n';
          bestN.style.opacity = bestN.disabled ? '0.45' : '1';
        }
        rule.addEventListener('change', syncBestN);
        weight.addEventListener('input', syncTotal);
        syncBestN();
        var include = el('button', {
          class: 'btn btn--sm btn--ghost', type: 'button',
          onClick: function () {
            weight.value = Number(weight.value) ? 0 : Math.max(0, 100 - total());
            syncTotal();
          }
        }, el('span', { html: icon('check', 13) }), 'Toggle');
        controls.push({ typeId: type.id, weight: weight, rule: rule, bestN: bestN });
        body.appendChild(el('div', { class: 'scheme-row' },
          el('div', null, el('div', { class: 'structure-item__title', text: type.name }), el('div', { class: 'structure-item__sub', text: type.isCoursework ? 'Coursework' : 'Assessment' })),
          weight, rule, bestN, include
        ));
      });

      if (!controls.length) {
        body.appendChild(pages.empty('No assessment types', 'Create at least one assessment type before building a scheme.', null, 'list'));
      }
      body.appendChild(totalRow);
      syncTotal();

      var save = el('button', { class: 'btn btn--primary', type: 'button' }, el('span', { html: icon('check', 15) }), 'Save scheme');
      var modal = ui.modal({
        title: 'Weighting scheme - ' + subject.name,
        subtitle: 'Choose how assessment types combine into the subject mark.',
        wide: true,
        body: body,
        footer: el('div', { class: 'row row--end gap-2 w-100' },
          el('button', { class: 'btn', type: 'button', onClick: function () { modal.close(); } }, 'Cancel'),
          save
        )
      });

      save.addEventListener('click', function () {
        var payload = controls.map(function (item) {
          return {
            typeId: item.typeId,
            weight: Number(item.weight.value) || 0,
            rule: item.rule.value,
            ruleN: item.rule.value === 'best_n' ? Number(item.bestN.value) || 1 : null
          };
        }).filter(function (row) { return row.weight > 0; });
        var sum = payload.reduce(function (acc, row) { return acc + row.weight; }, 0);
        if (payload.length && Math.abs(sum - 100) > 0.01) {
          ui.toast('Weights must total 100 before saving. The current total is ' + sum + '%.', 'error');
          return;
        }
        pages.busy(save, EG.api.put('/api/schemes/' + encodeURIComponent(subject.id), { rows: payload }).then(function () {
          ui.toast('Weighting scheme saved for ' + subject.name + '.', 'success');
          modal.close();
        }).catch(function (error) {
          if (error.status !== 401) ui.toast(error.message, 'error');
        }));
      });
    }).catch(function (error) {
      if (error.status !== 401) ui.toast(error.message, 'error');
    });
  }

  function renderSections() {
    var card = pages.card({
      title: 'Sections',
      subtitle: 'Classes that students belong to',
      actions: el('button', { class: 'btn btn--sm btn--primary', type: 'button', onClick: function () { sectionModal(null); } },
        el('span', { html: icon('plus', 13) }), 'Add section'),
      flush: true
    });
    if (!state.sections.length) {
      card.querySelector('.card__body').appendChild(pages.empty('No sections yet', 'Create a section before importing students.', null, 'structure'));
    } else {
      var table = el('table', { class: 'table' },
        el('thead', null, el('tr', null,
          el('th', { text: 'Section' }), el('th', { text: 'Branch' }), el('th', { text: 'Semester' }),
          el('th', { class: 'num', text: 'Students' }), el('th', { text: 'Status' }), el('th', { class: 'actions', text: '' })
        )),
        el('tbody', null, state.sections.map(function (section) {
          return el('tr', { class: section.active ? null : 'inactive-row' },
            el('td', null, el('strong', { text: section.name })),
            el('td', { text: section.branch }),
            el('td', { text: section.semester }),
            el('td', { class: 'num', text: String(section.students) }),
            el('td', null, pill(section.active)),
            el('td', { class: 'actions' },
              el('button', { class: 'btn btn--sm btn--ghost', type: 'button', onClick: function () { sectionModal(section); } },
                el('span', { html: icon('edit', 13) }), 'Edit')
            )
          );
        }))
      );
      card.querySelector('.card__body').appendChild(el('div', { class: 'table-wrap' }, table));
    }
    state.panelHost.appendChild(card);
  }

  function renderSubjects() {
    var card = pages.card({
      title: 'Subjects',
      subtitle: 'Subjects and their weighting schemes',
      actions: el('button', { class: 'btn btn--sm btn--primary', type: 'button', onClick: function () { subjectModal(null); } },
        el('span', { html: icon('plus', 13) }), 'Add subject'),
      flush: true
    });
    if (!state.subjects.length) {
      card.querySelector('.card__body').appendChild(pages.empty('No subjects yet', 'Create a subject, then add assessments and marks.', null, 'book'));
    } else {
      var table = el('table', { class: 'table' },
        el('thead', null, el('tr', null,
          el('th', { text: 'Subject' }), el('th', { text: 'Code' }), el('th', { class: 'num', text: 'Assessments' }),
          el('th', { text: 'Status' }), el('th', { class: 'actions', text: '' })
        )),
        el('tbody', null, state.subjects.map(function (subject) {
          return el('tr', { class: subject.active ? null : 'inactive-row' },
            el('td', null, el('strong', { text: subject.name })),
            el('td', null, subject.code ? el('span', { class: 'tag', text: subject.code }) : el('span', { class: 'faint', text: '-' })),
            el('td', { class: 'num', text: String(subject.assessments) }),
            el('td', null, pill(subject.active)),
            el('td', { class: 'actions' },
              el('div', { class: 'row row--end gap-1' },
                el('button', { class: 'btn btn--sm btn--soft', type: 'button', onClick: function () { openScheme(subject); } },
                  el('span', { html: icon('target', 13) }), 'Scheme'),
                el('button', { class: 'btn btn--sm btn--ghost', type: 'button', onClick: function () { subjectModal(subject); } },
                  el('span', { html: icon('edit', 13) }), 'Edit')
              )
            )
          );
        }))
      );
      card.querySelector('.card__body').appendChild(el('div', { class: 'table-wrap' }, table));
    }
    state.panelHost.appendChild(card);
  }

  function renderTypes() {
    var card = pages.card({
      title: 'Assessment types',
      subtitle: 'How assessments are grouped for reporting and scoring',
      actions: el('button', { class: 'btn btn--sm btn--primary', type: 'button', onClick: function () { typeModal(null); } },
        el('span', { html: icon('plus', 13) }), 'Add type'),
      flush: true
    });
    if (!state.types.length) {
      card.querySelector('.card__body').appendChild(pages.empty('No assessment types', 'Add types such as test, quiz, project or lab report.', null, 'list'));
    } else {
      var table = el('table', { class: 'table' },
        el('thead', null, el('tr', null,
          el('th', { text: 'Type' }), el('th', { text: 'Feeds coursework' }), el('th', { text: 'Status' }), el('th', { class: 'actions', text: '' })
        )),
        el('tbody', null, state.types.map(function (type) {
          return el('tr', { class: type.active ? null : 'inactive-row' },
            el('td', null, el('strong', { text: type.name })),
            el('td', null, type.isCoursework ? el('span', { class: 'pill pill--brand', text: 'Coursework' }) : el('span', { class: 'xs muted', text: 'Assessment only' })),
            el('td', null, pill(type.active)),
            el('td', { class: 'actions' },
              el('button', { class: 'btn btn--sm btn--ghost', type: 'button', onClick: function () { typeModal(type); } },
                el('span', { html: icon('edit', 13) }), 'Edit')
            )
          );
        }))
      );
      card.querySelector('.card__body').appendChild(el('div', { class: 'table-wrap' }, table));
    }
    state.panelHost.appendChild(card);
  }

  function renderTabs() {
    if (!state.tabHost) return;
    state.tabHost.textContent = '';
    var items = [
      { key: 'sections', label: 'Sections', count: state.sections.length },
      { key: 'subjects', label: 'Subjects', count: state.subjects.length },
      { key: 'types', label: 'Assessment types', count: state.types.length }
    ];
    var tabs = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Structure sections' }, items.map(function (item) {
      var button = el('button', {
        class: 'tab' + (state.tab === item.key ? ' is-active' : ''),
        type: 'button', role: 'tab', 'aria-selected': state.tab === item.key ? 'true' : 'false',
        onClick: function () {
          state.tab = item.key;
          renderTabs();
        }
      }, item.label + ' (' + item.count + ')');
      return button;
    }));
    state.tabHost.appendChild(tabs);
    renderPanel();
  }

  function renderPanel() {
    if (!state.panelHost) return;
    state.panelHost.textContent = '';
    if (state.tab === 'subjects') renderSubjects();
    else if (state.tab === 'types') renderTypes();
    else renderSections();
  }

  function refresh() {
    return Promise.all([
      EG.api.get('/api/sections'),
      EG.api.get('/api/subjects'),
      EG.api.get('/api/assessment-types')
    ]).then(function (results) {
      state.sections = results[0].sections || [];
      state.subjects = results[1].subjects || [];
      state.types = results[2].types || [];
      renderKpis();
      renderTabs();
    }).catch(function (error) {
      if (error.status === 401) return;
      if (state.panelHost) {
        state.panelHost.textContent = '';
        state.panelHost.appendChild(ui.errorState(error, function () { refresh(); }));
      }
      ui.toast(error.message, 'error');
    });
  }

  pages.guard(function () {
    if (EG.session.user.role !== 'HOD') return null;

    state.kpiHost = el('div', { class: 'kpi-grid' });
    state.tabHost = el('div');
    state.panelHost = el('div');

    pages.mount({
      title: 'Structure',
      subtitle: 'The sections, subjects, assessment types and weighting rules behind every score.',
      content: el('div', { class: 'stack' },
        state.kpiHost,
        state.tabHost,
        state.panelHost,
        pages.card({
          title: 'How the pieces fit',
          className: 'card--accent',
          body: el('div', { class: 'grid grid--auto' },
            el('div', null, el('h3', { class: 'small strong', text: 'Sections' }), el('p', { class: 'xs muted', text: 'A section is a class group. Students belong to one section and appear in that section roster everywhere.' })),
            el('div', null, el('h3', { class: 'small strong', text: 'Subjects' }), el('p', { class: 'xs muted', text: 'A subject can be taught to many sections. Teaching assignments connect a subject and section to faculty.' })),
            el('div', null, el('h3', { class: 'small strong', text: 'Schemes' }), el('p', { class: 'xs muted', text: 'A weighting scheme decides how each assessment type contributes to the subject mark. Types without data are re-normalised.' }))
          )
        })
      )
    });

    var params = new URLSearchParams(window.location.search);
    if (params.get('tab')) state.tab = params.get('tab');
    return refresh();
  });
})();
