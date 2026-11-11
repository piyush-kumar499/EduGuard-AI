/* Student record: signals, explainable score, actions and recovery options. */
(function () {
  'use strict';

  var EG = window.EG;
  var ui = EG.ui;
  var el = ui.el;
  var pages = EG.pages;
  var icon = ui.icon;

  var studentId = new URLSearchParams(window.location.search).get('id');
  var state = { data: null, saving: false };

  function levelTone(level) {
    return level === 'high' ? 'danger' : level === 'medium' ? 'warning' : 'success';
  }

  function metric(label, value, hint, iconName) {
    return pages.kpi({
      label: label,
      value: value,
      icon: iconName,
      foot: hint
    });
  }

  function profile(analysis) {
    var student = analysis.student;
    var ring = EG.charts.ring(analysis.hasData ? analysis.score : null, analysis.level, 'Score');
    return el('div', { class: 'profile card' },
      el('span', { class: 'avatar avatar--lg avatar--brand', 'aria-hidden': 'true', text: ui.initials(student.name) }),
      el('div', { class: 'profile__main' },
        el('div', { class: 'row row--wrap gap-2' },
          el('h2', { class: 'profile__name', text: student.name }),
          el('span', { html: ui.levelPill(analysis.hasData ? analysis.level : 'medium', analysis.levelLabel) }),
          student.isDemo ? el('span', { class: 'tag', text: 'Demo record' }) : null
        ),
        el('div', { class: 'profile__meta' },
          el('span', { class: 'mono', text: student.roll }),
          el('span', { text: 'Section ' + student.sectionName }),
          student.branch ? el('span', { text: student.branch }) : null,
          student.semester ? el('span', { text: 'Semester ' + student.semester }) : null,
          el('span', { class: 'faint', text: analysis.scope === 'overall' ? 'Department-wide view' : 'Your assigned subjects only' })
        ),
        el('div', { class: 'profile__stats mt-4' },
          el('div', { class: 'profile-stat' }, el('div', { class: 'profile-stat__label', text: 'Attendance' }), el('div', { class: 'profile-stat__value', text: ui.pct(analysis.signals.attendance) })),
          el('div', { class: 'profile-stat' }, el('div', { class: 'profile-stat__label', text: 'Coursework' }), el('div', { class: 'profile-stat__value', text: ui.pct(analysis.signals.coursework) })),
          el('div', { class: 'profile-stat' }, el('div', { class: 'profile-stat__label', text: 'Weighted marks' }), el('div', { class: 'profile-stat__value', text: ui.pct(analysis.signals.marks) })),
          el('div', { class: 'profile-stat' }, el('div', { class: 'profile-stat__label', text: 'Forecast' }), el('div', { class: 'profile-stat__value', text: analysis.hasData ? ui.pct(analysis.forecast.percent) : '—' }))
        )
      ),
      el('div', { class: 'stack--sm', style: { alignItems: 'center', justifyItems: 'center' } },
        ring,
        el('span', { class: 'xs muted', text: analysis.hasData ? 'Support indicator' : 'No entries yet' })
      )
    );
  }

  function scoreBreakdown(analysis) {
    return pages.card({
      title: 'How this score is built',
      subtitle: analysis.hasData ? 'Weighted signals and any trend adjustments' : 'Nothing recorded for this student yet',
      body: el('div', { class: 'stack--sm' },
        analysis.parts.map(function (part) {
          return el('div', { class: 'bar-row' },
            el('span', { class: 'bar-row__label', text: part.label + ' · ' + part.weight + '%' }),
            el('span', { class: 'bar-row__track' }, el('span', { class: 'bar-row__fill', style: { width: Math.max(0, Math.min(100, Number(part.value) || 0)) + '%' } })),
            el('span', { class: 'bar-row__value', text: ui.num(part.value) + '%' })
          );
        }),
        analysis.penalties.length
          ? el('div', { class: 'warning-list mt-3' }, analysis.penalties.map(function (penalty) {
            return el('div', { class: 'warning-item' },
              el('span', { class: 'warning-item__icon', html: icon('trendDown', 16) }),
              el('p', null, penalty.label + ' (' + penalty.points + ' pts)')
            );
          }))
          : null,
        el('p', { class: 'xs faint mt-3', text: 'Bands: ' + analysis.thresholds.onTrack + '+ on track · ' + analysis.thresholds.watch + '–' + (analysis.thresholds.onTrack - 1) + ' watch closely · below ' + analysis.thresholds.watch + ' needs support. This indicator is a prompt for a conversation, not a decision.' })
      )
    });
  }

  function factors(analysis) {
    return pages.card({
      title: 'What is driving the picture',
      subtitle: 'Each factor is explainable and reviewable',
      body: analysis.factors.length
        ? el('div', null, analysis.factors.map(function (factor) {
          return el('div', { class: 'factor' + (factor.tone === 'positive' ? ' factor--positive' : '') },
            el('span', { class: 'factor__icon', html: icon(factor.tone === 'positive' ? 'check' : 'warning', 15) }),
            el('div', { class: 'grow' },
              el('div', { class: 'factor__title', text: factor.title }),
              el('div', { class: 'factor__text', text: factor.text })
            ),
            factor.impact ? el('span', { class: 'factor__impact', text: '−' + ui.num(factor.impact) + ' pts' }) : null
          );
        }))
        : pages.empty('No factors to show', 'Once attendance or assessment data is recorded, the contributing factors appear here.', null, 'activity')
    });
  }

  function actionStatus(analysis) {
    var map = {};
    (state.data.actionItems || []).forEach(function (item) {
      map[item.actionKey] = item;
    });
    return map;
  }

  function actionsCard(analysis) {
    var status = actionStatus(analysis);
    var canTrack = true;
    return pages.card({
      title: 'Suggested next steps',
      subtitle: 'Tick what has been agreed. Notes are private to your scope.',
      body: analysis.hasData
        ? el('div', null, analysis.actions.map(function (action) {
          var existing = status[action.id];
          var done = Boolean(existing && existing.done);
          var checkbox = el('input', { type: 'checkbox', checked: done, 'aria-label': 'Mark “' + action.title + '” done' });
          checkbox.addEventListener('change', function () {
            checkbox.disabled = true;
            saveAction(action, checkbox.checked, existing).then(function () {
              checkbox.disabled = false;
            }).catch(function (error) {
              checkbox.checked = !checkbox.checked;
              checkbox.disabled = false;
              ui.toast(error.message, 'error');
            });
          });
          return el('div', { class: 'action-item' + (done ? ' is-done' : '') },
            el('span', { class: 'action-item__check' }, checkbox),
            el('div', { class: 'action-item__body' },
              el('div', { class: 'row row--between gap-2' },
                el('div', { class: 'action-item__title', text: action.title }),
                el('span', { class: 'priority priority--' + action.priority.toLowerCase(), text: action.priority })
              ),
              el('div', { class: 'action-item__detail', text: action.detail }),
              existing && existing.note ? el('div', { class: 'xs muted mt-1', text: 'Note: ' + existing.note }) : null,
              el('div', { class: 'row gap-2 mt-1' },
                el('button', { class: 'btn btn--sm btn--ghost', type: 'button', onClick: function () { editNote(action, existing); } },
                  el('span', { html: icon('edit', 12) }), existing && existing.note ? 'Edit note' : 'Add note')
              )
            )
          );
        }))
        : pages.empty('No steps yet', 'There is not enough data to suggest actions. Record attendance or an assessment first.', null, 'check'),
      foot: canTrack ? el('span', { class: 'xs faint', text: 'Suggestions are generated from the recorded signals. You make the final call.' }) : null
    });
  }

  function saveAction(action, done, existing) {
    return EG.api.put('/api/students/' + encodeURIComponent(studentId) + '/actions', {
      actionKey: action.id,
      done: done,
      note: existing && existing.note ? existing.note : ''
    }).then(function (saved) {
      var list = state.data.actionItems || [];
      var index = list.findIndex(function (item) { return item.actionKey === action.id; });
      if (index >= 0) list[index] = saved;
      else list.push(saved);
      state.data.actionItems = list;
      ui.toast(done ? 'Marked as done.' : 'Moved back to open.', 'success');
      return saved;
    });
  }

  function editNote(action, existing) {
    var area = el('textarea', { class: 'textarea', rows: 3, maxlength: 1000, placeholder: 'What was agreed, and when will you check back?' });
    area.value = existing && existing.note ? existing.note : '';
    var modal = ui.modal({
      title: 'Note for “' + action.title + '”',
      subtitle: 'Only you and the HOD can see this note.',
      narrow: true,
      body: el('div', { class: 'field' }, el('label', { text: 'Note' }), area),
      footer: el('div', { class: 'row row--end gap-2 w-100' },
        el('button', { class: 'btn', type: 'button', onClick: function () { modal.close(); } }, 'Cancel'),
        el('button', {
          class: 'btn btn--primary', type: 'button',
          onClick: function () {
            var value = area.value.trim();
            EG.api.put('/api/students/' + encodeURIComponent(studentId) + '/actions', {
              actionKey: action.id,
              done: existing ? Boolean(existing.done) : false,
              note: value
            }).then(function (saved) {
              var list = state.data.actionItems || [];
              var index = list.findIndex(function (item) { return item.actionKey === action.id; });
              if (index >= 0) list[index] = saved;
              else list.push(saved);
              state.data.actionItems = list;
              modal.close();
              ui.toast('Note saved.', 'success');
              render();
            }).catch(function (error) { ui.toast(error.message, 'error'); });
          }
        }, 'Save note')
      )
    });
    setTimeout(function () { area.focus(); }, 40);
  }

  function recovery(analysis) {
    if (!analysis.hasData) return null;
    if (analysis.level === 'low') {
      return pages.card({
        title: 'Keeping momentum',
        subtitle: 'This student is currently on track',
        body: el('div', { class: 'info-box' }, el('span', { html: icon('check', 17) }), el('span', { text: 'Keep the current supports in place. A short check-in after the next assessment is enough unless something changes.' }))
      });
    }
    var target = analysis.level === 'high' ? analysis.thresholds.watch : analysis.thresholds.onTrack;
    var start = {
      attendance: Math.round(analysis.signals.attendance || 0),
      coursework: Math.round(analysis.signals.coursework || 0),
      marks: Math.round(analysis.signals.marks || 0)
    };
    var options = [
      { name: 'Attendance first', delta: { attendance: 14, coursework: 3, marks: 2 } },
      { name: 'Coursework first', delta: { attendance: 3, coursework: 16, marks: 2 } },
      { name: 'Balanced plan', delta: { attendance: 8, coursework: 9, marks: 7 } }
    ];
    function scoreFor(values) {
      var sum = (Math.max(0, Math.min(100, values.attendance)) * analysis.weights.attendance +
        Math.max(0, Math.min(100, values.coursework)) * analysis.weights.coursework +
        Math.max(0, Math.min(100, values.marks)) * analysis.weights.marks) / 100;
      return Math.round(Math.max(0, Math.min(100, sum)) * 10) / 10;
    }
    var reachable = options.map(function (option) {
      var values = {
        attendance: Math.min(100, start.attendance + option.delta.attendance),
        coursework: Math.min(100, start.coursework + option.delta.coursework),
        marks: Math.min(100, start.marks + option.delta.marks)
      };
      return { name: option.name, values: values, score: scoreFor(values) };
    }).filter(function (option) { return option.score >= target; });

    return pages.card({
      title: 'Routes to the next band',
      subtitle: 'Illustrative lifts, not promises. Small consistent steps usually help most.',
      body: el('div', { class: 'recovery' },
        el('div', { class: 'info-box' }, el('span', { html: icon('target', 17) }), el('span', { text: 'Reaching ' + target + ' would move this student to “' + (target === analysis.thresholds.onTrack ? 'On track' : 'Watch closely') + '”.' })),
        reachable.length
          ? reachable.map(function (option) {
            return el('div', { class: 'recovery__option' },
              el('div', { class: 'recovery__top' },
                el('span', { class: 'recovery__name', text: option.name }),
                el('span', { class: 'recovery__score', text: option.score })
              ),
              el('div', { class: 'recovery__text', text: 'Attendance ' + option.values.attendance + '% · Coursework ' + option.values.coursework + '% · Marks ' + option.values.marks + '%' })
            );
          })
          : el('p', { class: 'xs muted', text: 'No single small lift reaches the next band from the current position. Focus on one signal at a time and review in a few weeks.' })
      )
    });
  }

  function subjectsCard(analysis) {
    var list = analysis.signals.subjectData || [];
    return pages.card({
      title: 'Subject picture',
      subtitle: 'Only subjects inside your teaching scope are shown',
      flush: true,
      body: list.length
        ? el('div', { class: 'table-wrap' }, el('table', { class: 'table table--compact' },
          el('thead', null, el('tr', null,
            el('th', { text: 'Subject' }), el('th', { class: 'num', text: 'Attendance' }),
            el('th', { class: 'num', text: 'Coursework' }), el('th', { text: 'Marks' }), el('th', { class: 'actions', text: '' })
          )),
          el('tbody', null, list.map(function (subject) {
            var level = subject.value === null ? null : subject.value >= 70 ? 'low' : subject.value >= 50 ? 'medium' : 'high';
            return el('tr', null,
              el('td', null,
                el('div', { class: 'person__name', text: subject.name }),
                el('div', { class: 'person__sub', text: subject.code + ' · ' + subject.assessmentCount + ' assessments · ' + subject.sessionCount + ' sessions' })
              ),
              el('td', { class: 'num', text: ui.pct(subject.attendance) }),
              el('td', { class: 'num', text: ui.pct(subject.coursework) }),
              el('td', null, el('div', { class: 'score-cell' },
                el('span', { class: 'score-cell__num', text: subject.value === null ? '—' : ui.num(subject.value) }),
                pages.meter(subject.value, level)
              )),
              el('td', { class: 'actions' },
                el('a', { class: 'btn btn--sm btn--soft', href: '/marks?subjectId=' + encodeURIComponent(subject.id) + '&sectionId=' + encodeURIComponent(analysis.student.sectionId) }, 'Marks')
              )
            );
          }))
        ))
        : pages.empty('No subjects in scope', 'You do not currently teach this student’s section, or no subjects are assigned for this term.', null, 'book')
    });
  }

  function timelineCard(analysis) {
    var points = analysis.signals.assessmentTrend || [];
    var rows = [];
    (analysis.signals.subjectData || []).forEach(function (subject) {
      subject.assessments.forEach(function (assessment) {
        rows.push({ subject: subject.name, assessment: assessment });
      });
    });
    rows.sort(function (a, b) { return String(b.assessment.heldOn || '').localeCompare(String(a.assessment.heldOn || '')); });
    return pages.card({
      title: 'Assessment timeline',
      subtitle: points.length ? 'Every recorded assessment in scope' : 'No assessments recorded yet',
      body: el('div', { class: 'stack' },
        points.length ? EG.charts.line([{ name: 'Assessment %', points: points.map(function (point) { return { label: point.heldOn ? point.heldOn.slice(5) : '—', value: point.percent }; }) }], { height: 210, label: 'Assessment percentage over time', max: 100, min: 0 }) : null,
        rows.length
          ? el('div', { class: 'timeline' }, rows.slice(0, 9).map(function (row) {
            var assessment = row.assessment;
            var value = assessment.status === 'absent' ? 'Absent' : assessment.status === 'exempt' ? 'Exempt' : assessment.percent === null ? '—' : ui.pct(assessment.percent);
            return el('div', { class: 'timeline__item' },
              el('div', null,
                el('div', { class: 'timeline__date', text: ui.date(assessment.heldOn, 'short') + ' · ' + row.subject }),
                el('div', { class: 'timeline__name', text: assessment.title + ' · ' + assessment.typeName + ' · /' + assessment.maxMarks })
              ),
              el('div', { class: 'timeline__value' + (assessment.status === 'absent' ? ' muted' : '') },
                value,
                assessment.locked ? el('span', { html: icon('lock', 11), style: { marginLeft: '5px', color: 'var(--warning)' } }) : null
              )
            );
          }))
          : null
      )
    });
  }

  function attendanceCard(analysis) {
    var weeks = analysis.signals.attendanceWeeks || [];
    var records = [];
    (analysis.signals.subjectData || []).forEach(function (subject) {
      subject.attendanceRecords.forEach(function (record) { records.push(record); });
    });
    var present = records.filter(function (record) { return record.present; }).length;
    return pages.card({
      title: 'Attendance pattern',
      subtitle: weeks.length ? 'Weekly attendance across the last four recorded weeks' : 'No attendance sessions recorded yet',
      body: el('div', { class: 'stack--sm' },
        el('div', { class: 'row row--between gap-3' },
          el('span', { class: 'strong', text: ui.pct(analysis.signals.attendance) + ' overall' }),
          el('span', { class: 'xs muted', text: present + ' of ' + records.length + ' sessions present' })
        ),
        weeks.length
          ? el('div', { class: 'bars' }, weeks.map(function (week) {
            return el('div', { class: 'bar-row' },
              el('span', { class: 'bar-row__label', text: week.week }),
              el('span', { class: 'bar-row__track' }, el('span', { class: 'bar-row__fill', style: { width: Math.max(0, Math.min(100, week.percent)) + '%', background: week.percent >= 85 ? 'var(--success)' : week.percent >= 70 ? 'var(--warning)' : 'var(--danger)' } })),
              el('span', { class: 'bar-row__value', text: week.percent + '%' })
            );
          }))
          : el('p', { class: 'xs muted', text: 'Record attendance to see the weekly pattern.' })
      )
    });
  }

  function mentorsCard(analysis) {
    var matches = state.data.mentors || [];
    var assigned = state.data.mentorAssignments || [];
    return pages.card({
      title: 'Peer support',
      subtitle: 'Students in the same section who are strong in the focus subject',
      body: el('div', { class: 'stack--sm' },
        assigned.length
          ? el('div', { class: 'list-rows' }, assigned.map(function (row) {
            return el('div', { class: 'list-row' },
              el('span', { class: 'avatar avatar--sm', text: ui.initials(row.mentorName) }),
              el('div', { class: 'list-row__main' },
                el('div', { class: 'list-row__title', text: row.mentorName || 'Mentor' }),
                el('div', { class: 'list-row__sub', text: (row.subjectName || 'General') + ' · assigned by ' + (row.assignedByName || 'staff') })
              ),
              el('span', { class: 'pill pill--low', text: 'Assigned' })
            );
          }))
          : matches.length
            ? el('div', { class: 'list-rows' }, matches.map(function (row) {
              return el('div', { class: 'list-row' },
                el('span', { class: 'avatar avatar--sm', text: ui.initials(row.name) }),
                el('div', { class: 'list-row__main' },
                  el('div', { class: 'list-row__title', text: row.name }),
                  el('div', { class: 'list-row__sub', text: row.subjectName + ' ' + ui.num(row.subjectValue) + '% · coursework ' + ui.pct(row.coursework) })
                ),
                el('button', { class: 'btn btn--sm btn--soft', type: 'button', onClick: function () { assignMentor(row); } }, 'Assign')
              );
            }))
            : el('p', { class: 'xs muted', text: matches.length ? 'No peer matches found yet.' : 'No strong peer match is available for the current focus subject.' }),
        el('div', { class: 'row mt-2' },
          el('button', { class: 'btn btn--sm', type: 'button', onClick: openMentorPicker }, el('span', { html: icon('users', 13) }), 'Choose a mentor')
        )
      )
    });
  }

  function assignMentor(row) {
    EG.api.put('/api/students/' + encodeURIComponent(studentId) + '/mentors', {
      mentorId: row.id,
      subjectId: row.subjectId,
      assigned: true
    }).then(function () {
      ui.toast(row.name + ' is now a peer mentor.', 'success');
      return reload();
    }).catch(function (error) { ui.toast(error.message, 'error'); });
  }

  function openMentorPicker() {
    var sectionId = state.data.analysis.student.sectionId;
    EG.api.get('/api/students', { sectionId: sectionId, limit: 100 }).then(function (data) {
      var options = data.rows.filter(function (row) { return row.id !== studentId; }).map(function (row) {
        return { value: row.id, label: row.name + ' · ' + row.roll };
      });
      if (!options.length) { ui.toast('No other students are available in this section.', 'error'); return; }
      pages.formModal({
        title: 'Assign a peer mentor',
        subtitle: 'Mentors must be in the same section. Choose the subject the support is for.',
        fields: [
          { name: 'mentorId', label: 'Mentor', type: 'select', options: options },
          { name: 'subjectId', label: 'Subject', type: 'select', options: [{ value: '', label: 'General support' }].concat((EG.session.scope.subjects || []).map(function (subject) { return { value: subject.id, label: subject.name }; })) }
        ],
        submitLabel: 'Assign mentor',
        onSubmit: function (values) {
          return EG.api.put('/api/students/' + encodeURIComponent(studentId) + '/mentors', {
            mentorId: values.mentorId,
            subjectId: values.subjectId || null,
            assigned: true
          }).then(function () {
            ui.toast('Mentor assigned.', 'success');
            return reload();
          });
        }
      });
    }).catch(function (error) { ui.toast(error.message, 'error'); });
  }

  function editStudent() {
    var student = state.data.analysis.student;
    var sections = (EG.session.scope.sections || []).map(function (section) {
      return { value: section.id, label: section.name + (section.branch ? ' · ' + section.branch : '') };
    });
    pages.formModal({
      title: 'Edit student record',
      subtitle: 'Roll numbers must be unique across the school.',
      fields: [
        { name: 'name', label: 'Full name', value: student.name },
        { name: 'roll', label: 'Roll number', value: student.roll },
        { name: 'sectionId', label: 'Section', type: 'select', options: sections, value: student.sectionId },
        { name: 'active', label: 'Active student', type: 'checkbox', value: true, hint: 'Inactive students are hidden from rosters and analytics.' }
      ],
      submitLabel: 'Save changes',
      onSubmit: function (values) {
        return EG.api.patch('/api/students/' + encodeURIComponent(studentId), values).then(function () {
          ui.toast('Student record updated.', 'success');
          return reload();
        });
      }
    });
  }

  function render() {
    var data = state.data;
    var analysis = data.analysis;
    var isHod = EG.session.user.role === 'HOD';
    var headerActions = el('div', { class: 'btn-row' },
      el('a', { class: 'btn', href: '/students' }, el('span', { html: icon('arrowLeft') }), 'All students'),
      el('button', { class: 'btn', type: 'button', onClick: function () { window.print(); } }, el('span', { html: icon('printer') }), 'Print'),
      el('a', { class: 'btn', href: '/reports?student=' + encodeURIComponent(studentId) }, el('span', { html: icon('reports') }), 'Report'),
      el('a', { class: 'btn btn--soft', href: '/assistant?student=' + encodeURIComponent(studentId) }, el('span', { html: icon('sparkles') }), 'Ask assistant'),
      isHod ? el('button', { class: 'btn btn--soft', type: 'button', onClick: editStudent }, el('span', { html: icon('edit') }), 'Edit') : null
    );

    var left = el('div', { class: 'stack' },
      profile(analysis),
      el('div', { class: 'kpi-grid' },
        metric('Attendance', ui.pct(analysis.signals.attendance), 'Threshold ' + analysis.thresholds.attendanceWatch + '%', 'attendance'),
        metric('Coursework', ui.pct(analysis.signals.coursework), 'Threshold ' + analysis.thresholds.courseworkWatch + '%', 'marks'),
        metric('Weighted marks', ui.pct(analysis.signals.marks), 'Threshold ' + analysis.thresholds.marksWatch + '%', 'chart'),
        metric('Forecast', analysis.hasData ? ui.pct(analysis.forecast.percent) : '—', 'Lower is steadier', 'activity')
      ),
      factors(analysis),
      timelineCard(analysis),
      subjectsCard(analysis),
      attendanceCard(analysis)
    );

    var right = el('div', { class: 'stack' },
      actionsCard(analysis),
      scoreBreakdown(analysis),
      recovery(analysis),
      mentorsCard(analysis),
      pages.card({
        title: 'Data scope',
        subtitle: 'What was included in this analysis',
        body: el('div', { class: 'dl' },
          el('div', { class: 'dl__row' }, el('dt', { text: 'Subjects' }), el('dd', { text: analysis.subjectsInScope.length + ' included' })),
          el('div', { class: 'dl__row' }, el('dt', { text: 'Assessments' }), el('dd', { text: (analysis.signals.assessmentTrend || []).length + ' with marks' })),
          el('div', { class: 'dl__row' }, el('dt', { text: 'Attendance sessions' }), el('dd', { text: (analysis.signals.attendanceWeeks || []).reduce(function (sum, week) { return sum + week.total; }, 0) + ' recorded' })),
          el('div', { class: 'dl__row' }, el('dt', { text: 'Scope' }), el('dd', { text: analysis.scope === 'overall' ? 'Whole department' : 'Your assigned classes' })),
          el('div', { class: 'dl__row' }, el('dt', { text: 'Method' }), el('dd', { text: analysis.signals.marks === null ? 'No marks yet' : 'Weighted scheme' }))
        )
      })
    );

    pages.mount({
      title: analysis.student.name,
      subtitle: analysis.student.roll + ' · Section ' + analysis.student.sectionName + ' · ' + data.analysis.term.name,
      actions: headerActions,
      content: el('div', { class: 'student-grid' }, left, right)
    });
  }

  function reload() {
    return EG.api.get('/api/students/' + encodeURIComponent(studentId)).then(function (data) {
      state.data = data;
      render();
      return data;
    });
  }

  pages.guard(function (session) {
    if (!studentId) {
      pages.mount({ title: 'Student record', content: ui.empty({ title: 'No student selected', text: 'Choose a student from the directory to open their support record.', action: el('a', { class: 'btn btn--primary', href: '/students' }, 'Open students', el('span', { html: icon('arrowRight') })) }) });
      return Promise.resolve();
    }
    pages.mount({ title: 'Student record', subtitle: 'Loading the support profile…', content: ui.skeletonPage() });
    return reload().catch(function (error) {
      if (error.status === 404) {
        pages.mount({ title: 'Student not found', content: ui.empty({ title: 'That student could not be found', text: 'The record may have been removed, or it may be outside your teaching scope.', action: el('a', { class: 'btn btn--primary', href: '/students' }, 'Back to students') }) });
        return null;
      }
      throw error;
    });
  });
})();
