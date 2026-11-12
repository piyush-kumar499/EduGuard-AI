/* Marks workspace: assessment list, spreadsheet grid, imports and locking. */
(function () {
  'use strict';

  var EG = window.EG;
  var ui = EG.ui;
  var el = ui.el;
  var pages = EG.pages;
  var icon = ui.icon;

  var state = {
    subjectId: '', sectionId: '', selectedId: '',
    assessments: [], types: [], data: null, grid: null,
    listHost: null, headHost: null, kpiHost: null, gridHost: null, busy: false
  };
  var loadToken = 0;

  function current() {
    return (state.assessments || []).find(function (item) { return item.id === state.selectedId; }) || null;
  }

  function pair() {
    return { subjectId: state.subjectId, sectionId: state.sectionId };
  }

  function applyQuery() {
    var params = new URLSearchParams(window.location.search);
    params.set('subjectId', state.subjectId);
    params.set('sectionId', state.sectionId);
    if (state.selectedId) params.set('assessmentId', state.selectedId);
    else params.delete('assessmentId');
    window.history.replaceState({}, '', window.location.pathname + '?' + params.toString());
  }

  function readQuery() {
    var params = new URLSearchParams(window.location.search);
    var list = pages.pairs();
    var wanted = params.get('subjectId') && params.get('sectionId')
      ? { subjectId: params.get('subjectId'), sectionId: params.get('sectionId') }
      : list[0];
    if (!wanted) return false;
    state.subjectId = wanted.subjectId;
    state.sectionId = wanted.sectionId;
    var assessmentId = params.get('assessmentId');
    if (assessmentId) state.selectedId = assessmentId;
    return true;
  }

  function assessmentMeta(item, data) {
    var stats = data && data.stats && data.stats[item.id];
    return el('div', { class: 'assessment-item__meta' },
      item.locked ? el('span', { class: 'tag tag--locked', text: 'Finalised' }) : null,
      el('span', { text: item.typeName }),
      el('span', { text: '·' }),
      el('span', { text: 'out of ' + item.maxMarks }),
      stats ? el('span', { text: '· ' + stats.entered + '/' + stats.total + ' entered' }) : null,
      item.heldOn ? el('span', { text: '· ' + ui.date(item.heldOn, 'short') }) : null
    );
  }

  function refreshList() {
    if (!state.listHost) return;
    state.listHost.textContent = '';
    if (!state.assessments.length) {
      state.listHost.appendChild(el('p', { class: 'xs muted', text: 'No assessments yet for this subject and section.' }));
      return;
    }
    state.assessments.forEach(function (item) {
      var active = item.id === state.selectedId;
      state.listHost.appendChild(el('button', {
        class: 'assessment-item' + (active ? ' is-active' : ''),
        type: 'button',
        onClick: function () { selectAssessment(item.id); },
        'aria-pressed': active ? 'true' : 'false'
      },
        el('div', { class: 'assessment-item__title', text: item.title }),
        assessmentMeta(item, state.data)
      ));
    });
  }

  function statFor(id, key) {
    var stats = state.data && state.data.stats && state.data.stats[id];
    return stats ? stats[key] : null;
  }

  function refreshKpis() {
    if (!state.kpiHost) return;
    var item = current();
    if (!item) { state.kpiHost.textContent = ''; return; }
    var entered = statFor(item.id, 'entered') || 0;
    var total = statFor(item.id, 'total') || 0;
    var average = statFor(item.id, 'average');
    var highest = statFor(item.id, 'highest');
    var lowest = statFor(item.id, 'lowest');
    state.kpiHost.textContent = '';
    [
      { label: 'Marks entered', value: ui.num(entered) + ' / ' + ui.num(total), icon: 'marks', foot: total ? Math.round((entered / total) * 100) + '% complete' : 'No students' },
      { label: 'Class average', value: average === null ? '—' : ui.pct(average), icon: 'chart', foot: 'Assessment ' + item.typeName.toLowerCase() },
      { label: 'Highest', value: highest === null ? '—' : ui.pct(highest), icon: 'trendUp', foot: 'Best recorded mark' },
      { label: 'Lowest', value: lowest === null ? '—' : ui.pct(lowest), icon: 'trendDown', foot: 'Needs the most support' }
    ].forEach(function (kpi) {
      state.kpiHost.appendChild(pages.kpi({ label: kpi.label, value: kpi.value, icon: kpi.icon, tone: kpi.label === 'Lowest' ? 'warning' : 'brand', foot: kpi.foot }));
    });
  }

  function refreshHeader() {
    if (!state.headHost) return;
    var item = current();
    state.headHost.textContent = '';
    if (!item) {
      state.headHost.appendChild(el('div', null,
        el('h2', { text: 'Marks spreadsheet' }),
        el('p', { text: 'Choose an assessment to start entering marks.' })
      ));
      state.headHost.appendChild(el('button', { class: 'btn btn--primary', type: 'button', onClick: createAssessment }, el('span', { html: icon('plus') }), 'New assessment'));
      return;
    }
    var actions = el('div', { class: 'sheet-tools' });
    actions.appendChild(el('button', { class: 'btn btn--sm', type: 'button', onClick: importMarks }, el('span', { html: icon('upload', 13) }), 'Import CSV'));
    actions.appendChild(el('button', { class: 'btn btn--sm', type: 'button', onClick: exportMarks }, el('span', { html: icon('download', 13) }), 'Export'));
    actions.appendChild(el('button', { class: 'btn btn--sm', type: 'button', onClick: undoMarks }, el('span', { html: icon('refresh', 13) }), 'Undo save'));
    actions.appendChild(el('button', { class: 'btn btn--sm', type: 'button', onClick: editAssessment }, el('span', { html: icon('edit', 13) }), 'Details'));
    if (state.data && state.data.canUnlock && item.locked) {
      actions.appendChild(el('button', { class: 'btn btn--sm btn--soft', type: 'button', onClick: unlockAssessment }, el('span', { html: icon('unlock', 13) }), 'Unlock'));
    }
    if (!item.locked) {
      actions.appendChild(el('button', { class: 'btn btn--sm', type: 'button', onClick: lockAssessment }, el('span', { html: icon('lock', 13) }), 'Finalise'));
    }
    actions.appendChild(el('button', { class: 'btn btn--sm btn--danger-ghost', type: 'button', onClick: deleteAssessment }, el('span', { html: icon('trash', 13) }), 'Delete'));

    state.headHost.appendChild(el('div', null,
      el('div', { class: 'row row--wrap gap-2' },
        el('h2', { text: item.title }),
        item.locked ? el('span', { class: 'tag tag--locked', text: 'Finalised' }) : null
      ),
      el('p', { text: item.typeName + ' · out of ' + item.maxMarks + ' · ' + (item.heldOn ? ui.date(item.heldOn, 'long') : 'no date') + ' · ' + (state.data ? state.data.students.length : 0) + ' students' })
    ));
    state.headHost.appendChild(actions);
  }

  function selectAssessment(id) {
    state.selectedId = id;
    applyQuery();
    if (state.grid) state.grid.setSelected(id);
    refreshList();
    refreshHeader();
    refreshKpis();
  }

  function mountGrid(data) {
    state.data = data;
    state.gridHost.textContent = '';
    if (state.grid) {
      state.grid.destroy();
      state.grid = null;
    }
    state.grid = new EG.grid.Marks(state.gridHost, {
      data: data,
      selectedAssessmentId: state.selectedId,
      onSaved: function (next) {
        state.data = next;
        refreshKpis();
        refreshList();
      },
      onUndo: undoMarks
    });
  }

  function layout(data) {
    state.listHost = el('div', { class: 'stack--sm assessment-list' });
    state.headHost = el('div', { class: 'card__head' });
    state.kpiHost = el('div', { class: 'kpi-grid mb-4' });
    state.gridHost = el('div', {});

    var sidebar = pages.card({
      title: 'Assessments',
      subtitle: 'This subject · this section',
      body: el('div', { class: 'stack--sm' },
        state.listHost,
        el('button', { class: 'btn btn--sm btn--block mt-2', type: 'button', onClick: createAssessment }, el('span', { html: icon('plus', 13) }), 'New assessment')
      )
    });

    var main = el('section', { class: 'card' },
      state.headHost,
      el('div', { class: 'card__body' }, state.gridHost)
    );

    var picker = pages.pairPicker({
      value: pair(),
      onChange: function (subjectId, sectionId) {
        state.subjectId = subjectId;
        state.sectionId = sectionId;
        state.selectedId = '';
        load();
      }
    });

    pages.mount({
      title: 'Marks',
      subtitle: (data && data.term ? data.term.name : 'Active term') + ' · enter, import and finalise assessment marks',
      actions: el('div', { class: 'row row--wrap gap-2' }, picker.root, el('button', { class: 'btn', type: 'button', onClick: function () { load(); } }, el('span', { html: icon('refresh') }), 'Refresh')),
      content: el('div', null, state.kpiHost, el('div', { class: 'marks-layout' }, sidebar, main))
    });

    if (state.assessments.length) {
      mountGrid(data);
      refreshList();
      refreshHeader();
      refreshKpis();
    } else {
      state.headHost.textContent = '';
      state.headHost.appendChild(el('div', null,
        el('h2', { text: 'No assessments yet' }),
        el('p', { text: 'Create the first assessment for this subject and section to start entering marks.' })
      ));
      state.headHost.appendChild(el('button', { class: 'btn btn--primary', type: 'button', onClick: createAssessment }, el('span', { html: icon('plus') }), 'Create assessment'));
      refreshList();
      refreshKpis();
    }
  }

  function load() {
    var token = ++loadToken;
    if (!pages.pairs().length) {
      pages.mount({
        title: 'Marks',
        subtitle: 'No teaching assignments found',
        content: ui.empty({ title: 'No classes assigned', text: 'The HOD needs to assign you a subject and section for this term before marks can be entered.', action: el('a', { class: 'btn', href: '/dashboard' }, 'Back to dashboard') })
      });
      return Promise.resolve();
    }
    pages.mount({ title: 'Marks', subtitle: 'Loading the marks workspace…', content: ui.skeletonPage() });
    var p = pair();
    return EG.api.get('/api/assessments', p).then(function (list) {
      if (token !== loadToken) return null;
      state.assessments = list.assessments || [];
      state.types = list.types || [];
      if (!state.selectedId) {
        var latest = state.assessments.slice().sort(function (a, b) { return String(b.heldOn || b.createdAt || '').localeCompare(String(a.heldOn || a.createdAt || '')); })[0];
        state.selectedId = latest ? latest.id : '';
      }
      if (!state.assessments.some(function (item) { return item.id === state.selectedId; })) {
        state.selectedId = state.assessments[0] ? state.assessments[0].id : '';
      }
      applyQuery();
      if (!state.selectedId) {
        layout(null);
        return null;
      }
      return EG.api.get('/api/assessments/' + encodeURIComponent(state.selectedId) + '/marks').then(function (data) {
        if (token !== loadToken) return null;
        layout(data);
        return data;
      });
    });
  }

  function createAssessment() {
    if (!state.types.length) {
      EG.api.get('/api/assessments', pair()).then(function (list) {
        state.types = list.types || [];
        createAssessment();
      }).catch(function (error) { ui.toast(error.message, 'error'); });
      return;
    }
    pages.formModal({
      title: 'New assessment',
      subtitle: 'It will appear as a new column in the marks sheet.',
      fields: [
        { name: 'title', label: 'Title', span: true, placeholder: 'e.g. Unit 2 class test' },
        { name: 'typeId', label: 'Assessment type', type: 'select', options: state.types.map(function (type) { return { value: type.id, label: type.name + (type.isCoursework ? ' · coursework' : '') }; }) },
        { name: 'maxMarks', label: 'Maximum marks', type: 'number', min: 1, max: 10000, step: '0.01', value: 100 },
        { name: 'heldOn', label: 'Held on', type: 'date', value: new Date().toISOString().slice(0, 10) }
      ],
      submitLabel: 'Create assessment',
      validate: function (values) {
        if (!values.title || values.title.length < 2) return 'Give the assessment a short title.';
        if (!(values.maxMarks > 0)) return 'Maximum marks must be greater than zero.';
        return null;
      },
      onSubmit: function (values) {
        return EG.api.post('/api/assessments', Object.assign({}, values, pair())).then(function (created) {
          state.selectedId = created.id;
          ui.toast('Assessment created.', 'success');
          return load();
        });
      }
    });
  }

  function editAssessment() {
    var item = current();
    if (!item) return;
    pages.formModal({
      title: 'Assessment details',
      subtitle: item.title,
      fields: [
        { name: 'title', label: 'Title', span: true, value: item.title },
        { name: 'typeId', label: 'Type', type: 'select', options: state.types.map(function (type) { return { value: type.id, label: type.name }; }), value: item.typeId },
        { name: 'maxMarks', label: 'Maximum marks', type: 'number', min: 0.01, max: 10000, step: '0.01', value: item.maxMarks },
        { name: 'heldOn', label: 'Held on', type: 'date', value: item.heldOn || '' }
      ],
      submitLabel: 'Save details',
      onSubmit: function (values) {
        return EG.api.patch('/api/assessments/' + encodeURIComponent(item.id), values).then(function () {
          ui.toast('Assessment updated.', 'success');
          return load();
        });
      }
    });
  }

  function lockAssessment() {
    var item = current();
    if (!item) return;
    var ready = state.grid ? state.grid.flush(true) : Promise.resolve(true);
    ready.then(function (saved) {
      if (saved === false) return;
      var total = state.data ? state.data.students.length : 0;
      var entered = statFor(item.id, 'entered') || 0;
      var missing = Math.max(0, total - entered);
      var check = el('div', { class: 'finalise-check' + (missing ? ' is-warn' : ' is-ready') },
        el('span', { class: 'finalise-check__icon', html: icon(missing ? 'warning' : 'check', 17) }),
        el('div', null,
          el('strong', { text: entered + ' of ' + total + ' students entered' }),
          el('span', {
            text: missing
              ? missing + ' ' + ui.plural(missing, 'student') + ' still ' + (missing === 1 ? 'has' : 'have') + ' no mark. You can still finalise, but those gaps will be locked too.'
              : 'Every active student has a mark or status. This assessment is ready to finalise.'
          })
        )
      );
      ui.confirm({
        title: 'Finalise this assessment?',
        message: 'Faculty will no longer be able to edit these marks. The HOD can still unlock it with a reason.',
        body: check,
        confirmLabel: 'Finalise',
        danger: true
      }).then(function (ok) {
        if (!ok) return;
        EG.api.post('/api/assessments/' + encodeURIComponent(item.id) + '/lock').then(function () {
          ui.toast('Assessment finalised.', 'success');
          return load();
        }).catch(function (error) { ui.toast(error.message, 'error'); });
      });
    });
  }

  function unlockAssessment() {
    var item = current();
    if (!item) return;
    ui.promptReason({
      title: 'Unlock this assessment',
      message: 'The reason is stored in the audit log. Faculty will be able to edit again.',
      label: 'Reason for unlocking',
      confirmLabel: 'Unlock'
    }).then(function (reason) {
      if (!reason) return;
      EG.api.post('/api/assessments/' + encodeURIComponent(item.id) + '/unlock', { reason: reason }).then(function () {
        ui.toast('Assessment unlocked.', 'success');
        return load();
      }).catch(function (error) { ui.toast(error.message, 'error'); });
    });
  }

  function deleteAssessment() {
    var item = current();
    if (!item) return;
    function perform(reason) {
      EG.api.del('/api/assessments/' + encodeURIComponent(item.id), reason ? { reason: reason } : {}).then(function () {
        ui.toast('Assessment deleted.', 'success');
        state.selectedId = '';
        return load();
      }).catch(function (error) { ui.toast(error.message, 'error'); });
    }
    ui.confirm({
      title: 'Delete “' + item.title + '”?',
      message: 'The assessment and its marks are removed from this term. This is recorded in the audit log.',
      confirmLabel: 'Delete assessment',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      if (item.locked) {
        ui.promptReason({ title: 'Reason for deleting a finalised assessment', min: 4 }).then(function (reason) { if (reason) perform(reason); });
      } else perform(null);
    });
  }

  function undoMarks() {
    var item = current();
    if (!item) return;
    ui.confirm({
      title: 'Undo the most recent save?',
      message: 'This restores the marks from your last save in the past 30 minutes. It is logged.',
      confirmLabel: 'Undo save'
    }).then(function (ok) {
      if (!ok) return;
      EG.api.post('/api/assessments/' + encodeURIComponent(item.id) + '/marks/undo').then(function (result) {
        ui.toast('Restored ' + result.restored + ' ' + ui.plural(result.restored, 'mark') + '.', 'success');
        return load();
      }).catch(function (error) { ui.toast(error.message, 'error'); });
    });
  }

  function exportMarks() {
    if (!state.data) return;
    var query = EG.api.query({ subjectId: state.subjectId, sectionId: state.sectionId });
    return EG.api.download('/api/export/marks.csv' + query).then(function () {
      ui.toast('Gradebook exported.', 'success');
    }).catch(function (error) {
      ui.toast(error.message || 'The gradebook could not be exported.', 'error');
    });
  }

  function importMarks() {
    var item = current();
    if (!item) return;
    var preview = el('div', { class: 'stack--sm' });
    var errorBox = el('div', { class: 'error-box', hidden: true });
    var choose = el('button', { class: 'btn btn--soft', type: 'button' }, el('span', { html: icon('upload') }), 'Choose CSV');
    var confirm = el('button', { class: 'btn btn--primary', type: 'button', disabled: true }, 'Import marks');
    var rows = [];
    var modal = ui.modal({
      title: 'Import marks from CSV',
      subtitle: item.title + ' · out of ' + item.maxMarks,
      wide: true,
      body: el('div', { class: 'stack' },
        el('div', { class: 'info-box' }, el('span', { html: icon('info', 17) }), el('span', { text: 'Columns: roll, score. Use A for absent and E for exempt. A blank score clears an existing mark. You will see a preview before saving.' })),
        el('div', { class: 'row gap-2' }, choose, el('span', { class: 'xs muted', text: 'CSV · up to 2 MB' })),
        errorBox,
        preview
      ),
      footer: el('div', { class: 'row row--end gap-2 w-100' },
        el('button', { class: 'btn', type: 'button', onClick: function () { modal.close(); } }, 'Cancel'),
        confirm
      )
    });

    function submit(dryRun, reason) {
      var body = { rows: rows, dryRun: dryRun };
      if (!dryRun) body.reason = reason || undefined;
      return EG.api.post('/api/assessments/' + encodeURIComponent(item.id) + '/marks/import', body);
    }

    choose.addEventListener('click', function () {
      EG.csv.chooseAndRead('.csv,text/csv').then(function (picked) {
        if (!picked.file) return;
        rows = (picked.table.rows || []).map(function (row) {
          return {
            roll: row.roll || row.roll_no || row.roll_number || '',
            score: row.score !== undefined ? row.score : row.marks,
            status: row.status || row.mark || ''
          };
        }).filter(function (row) { return row.roll || row.score !== undefined && row.score !== ''; });
        if (!rows.length) {
          errorBox.hidden = false;
          errorBox.innerHTML = icon('warning', 17) + '<div>No usable rows were found. Check that the CSV has a “roll” column.</div>';
          return;
        }
        errorBox.hidden = true;
        preview.textContent = '';
        preview.appendChild(el('div', { class: 'row gap-2 muted small' }, el('span', { class: 'spinner' }), 'Checking ' + rows.length + ' rows…'));
        confirm.disabled = true;
        submit(true).then(function (result) {
          preview.textContent = '';
          preview.appendChild(el('div', { class: 'row row--wrap gap-2' },
            el('span', { class: 'pill pill--low', text: result.matched + ' ready' }),
            result.unmatched ? el('span', { class: 'pill pill--high', text: result.unmatched + ' unmatched' }) : null,
            result.outOfRange ? el('span', { class: 'pill pill--medium', text: result.outOfRange + ' out of range' }) : null,
            result.duplicates ? el('span', { class: 'pill pill--medium', text: result.duplicates + ' duplicates' }) : null
          ));
          if (result.preview && result.preview.length) {
            var body = el('tbody', null, result.preview.slice(0, 30).map(function (row) {
              return el('tr', null,
                el('td', { text: row.row }),
                el('td', { text: row.roll }),
                el('td', { text: row.name }),
                el('td', { text: row.status === 'absent' ? 'Absent' : row.status === 'exempt' ? 'Exempt' : row.score === null ? '—' : row.score }),
                el('td', null, el('span', { class: 'pill ' + (row.type === 'ok' ? 'pill--low' : 'pill--high'), text: row.message }))
              );
            }));
            preview.appendChild(el('div', { class: 'table-wrap mt-3' },
              el('table', { class: 'table table--compact' },
                el('thead', null, el('tr', null, el('th', { text: 'Row' }), el('th', { text: 'Roll' }), el('th', { text: 'Name' }), el('th', { text: 'Score' }), el('th', { text: 'Status' }))),
                body
              )
            ));
          }
          if (result.matched > 0) confirm.disabled = false;
        }).catch(function (error) {
          preview.textContent = '';
          errorBox.hidden = false;
          errorBox.innerHTML = icon('warning', 17) + '<div>' + ui.esc(error.message) + '</div>';
        });
      }).catch(function (error) { ui.toast(error.message, 'error'); });
    });

    confirm.addEventListener('click', function () {
      confirm.disabled = true;
      confirm.innerHTML = '<span class="spinner" aria-hidden="true"></span> Importing…';
      submit(false).then(function (result) {
        ui.toast(result.saved + ' marks imported.', 'success');
        modal.close();
        return load();
      }).catch(function (error) {
        confirm.disabled = false;
        confirm.innerHTML = 'Import marks';
        if (error.code === 'REASON_REQUIRED') {
          ui.promptReason({ title: 'Reason for changing these marks', message: error.message, min: 4 }).then(function (reason) {
            if (!reason) return;
            submit(false, reason).then(function (result) {
              ui.toast(result.saved + ' marks imported.', 'success');
              modal.close();
              load();
            }).catch(function (next) { ui.toast(next.message, 'error'); });
          });
          return;
        }
        errorBox.hidden = false;
        errorBox.innerHTML = icon('warning', 17) + '<div>' + ui.esc(error.message) + '</div>';
      });
    });
  }

  pages.guard(function () {
    if (!readQuery()) {
      pages.mount({
        title: 'Marks',
        content: ui.empty({ title: 'No classes assigned', text: 'The HOD needs to assign you a subject and section for this term before marks can be entered.', action: el('a', { class: 'btn btn--primary', href: '/dashboard' }, 'Back to dashboard') })
      });
      return Promise.resolve();
    }
    return load();
  });
})();
