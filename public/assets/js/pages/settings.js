/* Settings: scoring weights, support thresholds, data rules and the demo zone. */
(function () {
  'use strict';

  var EG = window.EG;
  var ui = EG.ui;
  var el = ui.el;
  var pages = EG.pages;
  var icon = ui.icon;

  var DEFAULTS = {
    score_weights: { attendance: 35, coursework: 25, marks: 40 },
    thresholds: {
      onTrack: 70, watch: 50,
      attendanceWatch: 85, attendanceConcern: 75,
      courseworkWatch: 80, courseworkConcern: 65,
      marksWatch: 65, marksConcern: 50,
      attendanceDrop: 10
    },
    absent_counts_as_zero: true,
    min_assessments_for_trend: 3
  };

  var state = {
    settings: null,
    dirty: false,
    weights: {},
    thresholds: {},
    absent: null,
    minAssessments: null,
    totalNode: null,
    formulaNode: null,
    saveButton: null,
    discardButton: null,
    demoHost: null
  };

  function numberInput(value, min, max, label, step) {
    return el('input', {
      class: 'input', type: 'number', value: value, min: min, max: max, step: step || 1,
      'aria-label': label,
      onInput: markDirty
    });
  }

  function weightInput(key, label, hint) {
    var input = numberInput(state.settings.score_weights[key], 0, 100, label + ' weight');
    state.weights[key] = input;
    return el('div', { class: 'weight-input' },
      el('div', { class: 'field grow' },
        el('label', { text: label }),
        input,
        hint ? el('div', { class: 'field__hint', text: hint }) : null
      ),
      el('span', { class: 'small muted', text: '%' })
    );
  }

  function thresholdInput(key, label, hint) {
    var input = numberInput(state.settings.thresholds[key], 0, 100, label);
    state.thresholds[key] = input;
    return el('div', { class: 'field' }, el('label', { text: label }), input, hint ? el('div', { class: 'field__hint', text: hint }) : null);
  }

  function markDirty() {
    state.dirty = true;
    if (state.saveButton) state.saveButton.disabled = false;
    if (state.discardButton) state.discardButton.disabled = false;
    syncDerived();
  }

  function totalWeight() {
    return Number(state.weights.attendance.value || 0) + Number(state.weights.coursework.value || 0) + Number(state.weights.marks.value || 0);
  }

  function syncDerived() {
    if (state.totalNode) {
      var total = totalWeight();
      state.totalNode.textContent = total + '%';
      state.totalNode.parentNode.classList.toggle('is-bad', Math.abs(total - 100) > 0.01);
    }
    if (state.formulaNode) {
      state.formulaNode.textContent = 'score = attendance x ' + (Number(state.weights.attendance.value) || 0) + '% + coursework x ' +
        (Number(state.weights.coursework.value) || 0) + '% + weighted marks x ' + (Number(state.weights.marks.value) || 0) + '%';
    }
  }

  function applySettings(settings) {
    Object.keys(state.weights).forEach(function (key) {
      state.weights[key].value = settings.score_weights[key];
    });
    Object.keys(state.thresholds).forEach(function (key) {
      state.thresholds[key].value = settings.thresholds[key];
    });
    state.absent.checked = Boolean(settings.absent_counts_as_zero);
    state.minAssessments.value = settings.min_assessments_for_trend;
    syncDerived();
  }

  function validate() {
    var total = totalWeight();
    if (Math.abs(total - 100) > 0.01) return 'Attendance, coursework and marks weights must total 100. The current total is ' + total + '%.';
    var thresholds = {};
    Object.keys(state.thresholds).forEach(function (key) {
      thresholds[key] = Number(state.thresholds[key].value);
    });
    if (thresholds.onTrack < thresholds.watch) return 'The on-track threshold must be at or above the watch threshold.';
    var pairs = [
      ['attendanceWatch', 'attendanceConcern', 'Attendance'],
      ['courseworkWatch', 'courseworkConcern', 'Coursework'],
      ['marksWatch', 'marksConcern', 'Marks']
    ];
    for (var index = 0; index < pairs.length; index += 1) {
      if (thresholds[pairs[index][0]] < thresholds[pairs[index][1]]) {
        return pairs[index][2] + ' watch must be at or above the concern line.';
      }
    }
    var min = Number(state.minAssessments.value);
    if (!Number.isInteger(min) || min < 2 || min > 20) return 'Minimum assessments for a trend must be between 2 and 20.';
    return null;
  }

  function payload() {
    var thresholds = {};
    Object.keys(state.thresholds).forEach(function (key) {
      thresholds[key] = Number(state.thresholds[key].value);
    });
    return {
      score_weights: {
        attendance: Number(state.weights.attendance.value),
        coursework: Number(state.weights.coursework.value),
        marks: Number(state.weights.marks.value)
      },
      thresholds: thresholds,
      absent_counts_as_zero: state.absent.checked,
      min_assessments_for_trend: Number(state.minAssessments.value)
    };
  }

  function save() {
    var message = validate();
    if (message) {
      ui.toast(message, 'error');
      return;
    }
    pages.busy(state.saveButton, EG.api.put('/api/settings', payload()).then(function (data) {
      state.settings = data.settings;
      state.dirty = false;
      state.saveButton.disabled = true;
      state.discardButton.disabled = true;
      applySettings(data.settings);
      ui.toast('Scoring settings saved. New and refreshed analyses will use them.', 'success');
    }).catch(function (error) {
      if (error.status !== 401) ui.toast(error.message, 'error');
    }));
  }

  function restoreDefaults() {
    applySettings(DEFAULTS);
    markDirty();
    ui.toast('Recommended defaults loaded. Save to apply them.', 'info');
  }

  function demoReset() {
    ui.confirm({
      title: 'Regenerate demo data?',
      message: 'This replaces the demo students, assessments, marks and attendance with a fresh deterministic set. Real data and accounts are kept. Demo faculty passwords are only printed in the server console.',
      confirmLabel: 'Regenerate demo data',
      danger: true
    }).then(function (confirmed) {
      if (!confirmed) return;
      EG.api.post('/api/demo/reset').then(function (result) {
        ui.toast('Demo data regenerated with ' + result.students + ' students. Reloading...', 'success');
        setTimeout(function () { window.location.reload(); }, 900);
      }).catch(function (error) {
        if (error.status !== 401) ui.toast(error.message, 'error');
      });
    });
  }

  function demoRemove() {
    ui.confirm({
      title: 'Remove all demo data?',
      message: 'Demo students, demo assessments, marks and attendance will be deleted. Real records and accounts are kept. This cannot be undone.',
      confirmLabel: 'Remove demo data',
      danger: true
    }).then(function (confirmed) {
      if (!confirmed) return;
      EG.api.del('/api/demo').then(function (result) {
        ui.toast('Removed ' + result.removed.students + ' demo students and ' + result.removed.assessments + ' demo assessments.', 'success');
        setTimeout(function () { window.location.reload(); }, 900);
      }).catch(function (error) {
        if (error.status !== 401) ui.toast(error.message, 'error');
      });
    });
  }

  pages.guard(function () {
    if (EG.session.user.role !== 'HOD') return null;

    state.settings = JSON.parse(JSON.stringify(DEFAULTS));
    state.totalNode = el('strong', { text: '0%' });
    state.formulaNode = el('code', { class: 'small', text: '' });
    var totalRow = el('div', { class: 'weight-total' }, el('span', { text: 'Total weight' }), state.totalNode);

    state.absent = el('input', { type: 'checkbox', onChange: markDirty, 'aria-label': 'Count absent as zero' });
    state.minAssessments = el('input', { class: 'input', type: 'number', min: 2, max: 20, step: 1, 'aria-label': 'Minimum assessments for trend', onInput: markDirty });

    state.saveButton = el('button', { class: 'btn btn--primary', type: 'button', disabled: true, onClick: save },
      el('span', { html: icon('check') }), 'Save changes');
    state.discardButton = el('button', { class: 'btn', type: 'button', disabled: true, onClick: function () {
      applySettings(state.settings);
      state.dirty = false;
      state.saveButton.disabled = true;
      state.discardButton.disabled = true;
    } }, 'Discard');

    pages.mount({
      title: 'Settings',
      subtitle: 'Tune how EduGuard turns attendance, coursework and marks into a support signal.',
      actions: el('div', { class: 'btn-row' }, state.discardButton, state.saveButton),
      content: el('div', { class: 'stack' },
        el('div', { class: 'callout' },
          el('span', { html: icon('info', 18) }),
          el('div', null,
            el('strong', { text: 'Changes are workspace-wide.' }),
            ' Saving settings adds an audit entry. Existing student analyses are recalculated on the next request; no stored score is rewritten.'
          )
        ),
        el('div', { class: 'settings-grid' },
          pages.card({
            title: 'Score weights',
            subtitle: 'How much each signal contributes',
            body: el('div', { class: 'stack' },
              weightInput('attendance', 'Attendance', 'Weekly attendance percentage'),
              weightInput('coursework', 'Coursework', 'Completion of coursework-type assessments'),
              weightInput('marks', 'Weighted marks', 'Subject marks after scheme weighting'),
              totalRow,
              el('div', { class: 'info-box' }, state.formulaNode),
              el('div', { class: 'btn-row' },
                el('button', { class: 'btn btn--sm', type: 'button', onClick: restoreDefaults }, 'Load recommended defaults')
              )
            )
          }),
          pages.card({
            title: 'Support thresholds',
            subtitle: 'Bands and watch lines on a 0-100 scale',
            body: el('div', { class: 'stack' },
              el('div', { class: 'threshold-grid' },
                thresholdInput('onTrack', 'On track at or above', 'Scores at or above this are on track'),
                thresholdInput('watch', 'Watch at or above', 'Scores below this need support'),
                thresholdInput('attendanceWatch', 'Attendance watch', 'Below this line attendance is flagged'),
                thresholdInput('attendanceConcern', 'Attendance concern', 'Used for urgent action wording'),
                thresholdInput('courseworkWatch', 'Coursework watch', 'Below this line coursework is flagged'),
                thresholdInput('courseworkConcern', 'Coursework concern', 'Used for urgent action wording'),
                thresholdInput('marksWatch', 'Marks watch', 'Below this line marks are flagged'),
                thresholdInput('marksConcern', 'Marks concern', 'Used for urgent action wording')
              ),
              thresholdInput('attendanceDrop', 'Attendance drop over four weeks', 'A fall of this many points adds a penalty')
            )
          }),
          pages.card({
            title: 'Data rules',
            subtitle: 'How missing records are treated',
            body: el('div', { class: 'stack' },
              el('div', { class: 'setting-row' },
                el('div', { class: 'setting-row__text' },
                  el('div', { class: 'setting-row__title', text: 'Count absent as zero' }),
                  el('div', { class: 'setting-row__desc', text: 'When enabled, an absent mark contributes 0% to the marks signal. When disabled, it is excluded like an exempt mark.' })
                ),
                el('label', { class: 'switch' }, state.absent, el('span', { class: 'switch__track' }))
              ),
              el('div', { class: 'setting-row' },
                el('div', { class: 'setting-row__text' },
                  el('div', { class: 'setting-row__title', text: 'Minimum assessments for a trend' }),
                  el('div', { class: 'setting-row__desc', text: 'The number of recorded assessments needed before the trend line and falling-marks penalty are used.' })
                ),
                el('div', { style: { width: '96px' } }, state.minAssessments)
              )
            )
          }),
          pages.card({
            title: 'How the score is built',
            subtitle: 'Explainable by design',
            body: el('div', { class: 'stack--sm small muted' },
              el('p', { text: 'Each signal is clamped to 0-100 and multiplied by its weight. The weighted parts are added together.' }),
              el('p', { text: 'Two five-point penalties can apply: marks falling across the recent trend, and attendance dropping by the configured amount over four weeks.' }),
              el('p', null,
                'Bands use the thresholds above: ',
                el('strong', { text: 'on track' }),
                ', ',
                el('strong', { text: 'watch closely' }),
                ' and ',
                el('strong', { text: 'needs support' }),
                '. A student with no usable data is shown as having no entries rather than a zero score.'
              ),
              el('p', { class: 'xs faint', text: 'AI drafts use the same numbers. They never see names and never decide the band.' })
            )
          })
        ),
        el('div', { id: 'demo' },
          pages.card({
            title: 'Demo data',
            subtitle: 'Only affects records marked as demo',
            className: 'card--warning',
            body: el('div', { class: 'stack' },
              el('p', { class: 'small muted', text: 'The seeded workspace is useful for training and screenshots. Regenerating it is deterministic; removing it cleans up the demo students and assessments while keeping real accounts.' }),
              el('div', { class: 'btn-row' },
                el('button', { class: 'btn', type: 'button', onClick: demoReset }, el('span', { html: icon('refresh', 14) }), 'Regenerate demo data'),
                el('button', { class: 'btn btn--danger-ghost', type: 'button', onClick: demoRemove }, el('span', { html: icon('trash', 14) }), 'Remove demo data')
              ),
              el('p', { class: 'xs faint', text: 'Demo faculty passwords are not stored in the browser. Reset individual passwords in Faculty if needed.' })
            )
          })
        )
      )
    });

    return EG.api.get('/api/settings').then(function (data) {
      state.settings = data.settings;
      applySettings(data.settings);
      if (window.location.hash === '#demo') {
        var anchor = document.getElementById('demo');
        if (anchor) setTimeout(function () { anchor.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 120);
      }
    }).catch(function (error) {
      if (error.status === 401) return;
      ui.toast(error.message, 'error');
      var content = document.getElementById('page-content');
      if (content) {
        content.textContent = '';
        content.appendChild(ui.errorState(error, function () { window.location.reload(); }));
      }
    });
  });
})();
