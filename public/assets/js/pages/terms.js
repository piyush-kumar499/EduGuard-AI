/* Terms: create, activate, roll over and archive academic terms. */
(function () {
  'use strict';

  var EG = window.EG;
  var ui = EG.ui;
  var el = ui.el;
  var pages = EG.pages;
  var icon = ui.icon;

  var state = {
    terms: [],
    kpiHost: null,
    listHost: null
  };

  function activeTerm() {
    return state.terms.filter(function (term) { return term.active; })[0] || null;
  }

  function renderKpis() {
    if (!state.kpiHost) return;
    var active = state.terms.filter(function (term) { return term.active; });
    var archived = state.terms.filter(function (term) { return term.archived; });
    var current = active[0];
    state.kpiHost.textContent = '';
    [
      { label: 'Terms', value: state.terms.length, icon: 'terms', foot: 'All recorded academic terms' },
      { label: 'Active term', value: current ? current.name : 'None', icon: 'calendar', tone: current ? 'brand' : 'warning', foot: current ? current.startsOn + ' to ' + current.endsOn : 'Create and activate a term' },
      { label: 'Archived', value: archived.length, icon: 'lock', foot: 'Read-only historical terms' },
      { label: 'Assessments', value: state.terms.reduce(function (total, term) { return total + term.assessments; }, 0), icon: 'marks', foot: 'Across every term' }
    ].forEach(function (kpi) {
      state.kpiHost.appendChild(pages.kpi({ label: kpi.label, value: String(kpi.value), icon: kpi.icon, tone: kpi.tone || 'brand', foot: kpi.foot }));
    });
  }

  function termCard(term) {
    var statusPill = term.active
      ? el('span', { class: 'pill pill--low', text: 'Active' })
      : term.archived
        ? el('span', { class: 'pill pill--nodata', text: 'Archived' })
        : el('span', { class: 'pill pill--outline', text: 'Inactive' });
    var actions = el('div', { class: 'btn-row' });
    if (!term.active) {
      actions.appendChild(el('button', {
        class: 'btn btn--sm', type: 'button',
        onClick: function () { activate(term); }
      }, el('span', { html: icon('check', 13) }), term.archived ? 'Reactivate' : 'Set active'));
    }
    actions.appendChild(el('button', {
      class: 'btn btn--sm btn--soft', type: 'button',
      onClick: function () { rollover(term); }
    }, el('span', { html: icon('refresh', 13) }), 'Roll over'));
    return pages.card({
      className: term.active ? 'card--accent' : 'card--interactive',
      body: el('div', { class: 'stack--sm' },
        el('div', { class: 'row row--between gap-3' },
          el('div', null,
            el('div', { class: 'row gap-2' },
              el('h2', { text: term.name }),
              statusPill
            ),
            el('div', { class: 'small muted', text: term.startsOn ? ui.date(term.startsOn, 'long') + ' to ' + ui.date(term.endsOn, 'long') : 'No dates set' })
          ),
          el('span', { class: 'kpi__icon', html: icon(term.archived ? 'lock' : 'calendar', 15) })
        ),
        el('div', { class: 'row row--wrap gap-3 small muted' },
          el('span', null, el('strong', { text: String(term.assignments) }), ' teaching assignments'),
          el('span', null, el('strong', { text: String(term.assessments) }), ' assessments'),
          term.archived ? el('span', { class: 'pill pill--outline', text: 'Read-only' }) : el('span', { class: 'pill pill--brand', text: 'Writable' })
        ),
        actions,
        term.archived ? el('p', { class: 'xs faint', text: 'Archived terms keep their marks and attendance for reporting, but no new edits are accepted.' }) : null
      )
    });
  }

  function renderList() {
    if (!state.listHost) return;
    state.listHost.textContent = '';
    if (!state.terms.length) {
      state.listHost.appendChild(pages.empty('No terms yet', 'Create the first academic term, then activate it so faculty can enter data.', null, 'terms'));
      return;
    }
    var grid = el('div', { class: 'grid grid--auto' });
    state.terms.forEach(function (term) { grid.appendChild(termCard(term)); });
    state.listHost.appendChild(grid);
  }

  function render() {
    renderKpis();
    renderList();
  }

  function reload() {
    return EG.api.get('/api/terms').then(function (data) {
      state.terms = data.terms || [];
      render();
    }).catch(function (error) {
      if (error.status === 401) return;
      if (state.listHost) {
        state.listHost.textContent = '';
        state.listHost.appendChild(ui.errorState(error, reload));
      }
      ui.toast(error.message, 'error');
    });
  }

  function createTerm() {
    var today = new Date().toISOString().slice(0, 10);
    pages.formModal({
      title: 'Create a term',
      subtitle: 'Only one term can be active at a time.',
      submitLabel: 'Create term',
      fields: [
        { name: 'name', label: 'Term name', placeholder: '2026-27 Even semester' },
        { name: 'startsOn', label: 'Start date', type: 'date', value: today },
        { name: 'endsOn', label: 'End date', type: 'date', value: '' },
        { name: 'active', label: 'Make this the active term', type: 'checkbox', value: false, hint: 'The current active term becomes inactive, not archived.' }
      ],
      validate: function (values) {
        if (!values.name || values.name.length < 2) return 'Enter a term name.';
        if (values.startsOn && values.endsOn && values.endsOn < values.startsOn) return 'The end date must be after the start date.';
        return null;
      },
      onSubmit: function (values) {
        return EG.api.post('/api/terms', {
          name: values.name,
          startsOn: values.startsOn || undefined,
          endsOn: values.endsOn || undefined,
          active: values.active
        }).then(function () {
          ui.toast(values.active ? 'Term created and activated.' : 'Term created.', 'success');
          return reload();
        });
      }
    });
  }

  function activate(term) {
    ui.confirm({
      title: 'Make ' + term.name + ' the active term?',
      message: 'All marks, attendance and analytics will switch to this term. The current active term becomes inactive.',
      confirmLabel: 'Set active'
    }).then(function (confirmed) {
      if (!confirmed) return;
      EG.api.post('/api/terms/' + encodeURIComponent(term.id) + '/activate').then(function () {
        ui.toast('Active term updated. Reloading the workspace...', 'success');
        setTimeout(function () { window.location.reload(); }, 700);
      }).catch(function (error) {
        if (error.status !== 401) ui.toast(error.message, 'error');
      });
    });
  }

  function rollover(term) {
    var nextYear = new Date().getFullYear() + 1;
    var suggested = term.name.replace(/\b(odd|even)\b/i, function (word) { return /odd/i.test(word) ? 'Even' : 'Odd'; });
    if (suggested === term.name) suggested = term.name + ' (copy) ' + nextYear;
    pages.formModal({
      title: 'Roll over ' + term.name,
      subtitle: 'A new active term is created. The old term is archived and becomes read-only.',
      submitLabel: 'Roll over term',
      fields: [
        { name: 'name', label: 'New term name', value: suggested },
        { name: 'startsOn', label: 'Start date', type: 'date', value: '' },
        { name: 'endsOn', label: 'End date', type: 'date', value: '' },
        { name: 'copyAssignments', label: 'Copy teaching assignments', type: 'checkbox', value: true, hint: 'Copies the subject and section assignments into the new term.' }
      ],
      validate: function (values) {
        if (!values.name || values.name.length < 2) return 'Enter a name for the new term.';
        if (values.startsOn && values.endsOn && values.endsOn < values.startsOn) return 'The end date must be after the start date.';
        return null;
      },
      onSubmit: function (values) {
        return EG.api.post('/api/terms/' + encodeURIComponent(term.id) + '/rollover', {
          name: values.name,
          startsOn: values.startsOn || undefined,
          endsOn: values.endsOn || undefined,
          copyAssignments: values.copyAssignments
        }).then(function (result) {
          ui.toast('Rolled over into ' + result.name + ' with ' + result.copiedAssignments + ' assignments. Reloading...', 'success');
          setTimeout(function () { window.location.reload(); }, 900);
        });
      }
    });
  }

  pages.guard(function () {
    if (EG.session.user.role !== 'HOD') return null;

    state.kpiHost = el('div', { class: 'kpi-grid' });
    state.listHost = el('div');

    pages.mount({
      title: 'Terms',
      subtitle: 'Create, switch and roll over the academic terms that hold marks and attendance.',
      actions: el('div', { class: 'btn-row' },
        el('button', { class: 'btn btn--primary', type: 'button', onClick: createTerm }, el('span', { html: icon('plus') }), 'Create term')
      ),
      content: el('div', { class: 'stack' },
        state.kpiHost,
        state.listHost,
        pages.card({
          title: 'Rollover rules',
          className: 'card--accent',
          body: el('div', { class: 'grid grid--auto' },
            el('div', null, el('h3', { class: 'small strong', text: 'One active term' }), el('p', { class: 'xs muted', text: 'Every screen follows the single active term. Activating another term switches the workspace immediately.' })),
            el('div', null, el('h3', { class: 'small strong', text: 'Archived is read-only' }), el('p', { class: 'xs muted', text: 'Rolling over archives the old term. Its records remain available for reports but cannot be edited.' })),
            el('div', null, el('h3', { class: 'small strong', text: 'Assignments can follow' }), el('p', { class: 'xs muted', text: 'Copy recommendations keep the same faculty on the same subject and section in the new term.' }))
          )
        })
      )
    });

    return reload();
  });
})();
