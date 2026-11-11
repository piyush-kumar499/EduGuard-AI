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
        : pages.empty('No factors to show', 'Once attendance or assessment data is recorded, the contributing factors appear here.', null, 'activity'),
      foot: analysis.hasData
        ? el('div', { class: 'forecast-box' },
          el('span', { text: 'Next-term support forecast' }),
          el('strong', { text: ui.pct(analysis.forecast.percent) }),
          el('p', { text: (analysis.forecast.factors && analysis.forecast.factors[0] && analysis.forecast.factors[0].text) || 'No single factor is driving the forecast.' })
        )
        : null
    });
  }

  /* What-if simulator: client-side only, using the same weights as the indicator. */
  function simulatorCard(analysis) {
    if (!analysis.hasData) return null;
    var start = {
      attendance: Math.round(Number(analysis.signals.attendance) || 0),
      coursework: Math.round(Number(analysis.signals.coursework) || 0),
      marks: Math.round(Number(analysis.signals.marks) || 0)
    };
    var penalty = (analysis.penalties || []).reduce(function (sum, item) { return sum + Number(item.points || 0); }, 0);
    var weights = analysis.settings.weights;
    var thresholds = analysis.thresholds;
    var rows = [
      { key: 'attendance', label: 'Attendance' },
      { key: 'coursework', label: 'Coursework' },
      { key: 'marks', label: 'Weighted marks' }
    ];
    var values = {};
    var labels = {};
    var sliders = rows.map(function (row) {
      values[row.key] = start[row.key];
      labels[row.key] = el('b', { text: start[row.key] + '%' });
      var input = el('input', {
        type: 'range', min: '0', max: '100', step: '1', value: String(start[row.key]),
        'aria-label': row.label + ' what-if value'
      });
      input.addEventListener('input', function () {
        values[row.key] = Number(input.value);
        labels[row.key].textContent = input.value + '%';
        update();
      });
      return el('label', { class: 'sim-row' },
        el('span', null, row.label, labels[row.key]),
        input
      );
    });

    var scoreOut = el('strong', { text: ui.num(analysis.score) });
    var bandOut = el('strong', { text: analysis.levelLabel });
    var result = el('div', { class: 'sim-result' },
      el('div', null, el('span', { text: 'Projected score' }), scoreOut),
      el('div', null, el('span', { text: 'Projected band' }), bandOut),
      el('p', { text: 'Current penalties of ' + ui.num(Math.abs(penalty)) + ' points stay included. This is a planning aid, not a prediction.' })
    );

    function update() {
      var available = [
        [values.attendance, Number(weights.attendance)],
        [values.coursework, Number(weights.coursework)],
        [values.marks, Number(weights.marks)]
      ].filter(function (pair) { return pair[1] > 0; });
      var totalWeight = available.reduce(function (sum, pair) { return sum + pair[1]; }, 0) || 1;
      var base = available.reduce(function (sum, pair) { return sum + pair[0] * pair[1]; }, 0) / totalWeight;
      var score = Math.max(0, Math.min(100, Math.round((base + penalty) * 10) / 10));
      var level = score >= thresholds.onTrack ? 'low' : score >= thresholds.watch ? 'medium' : 'high';
      scoreOut.textContent = ui.num(score);
      bandOut.textContent = level === 'low' ? 'On track' : level === 'medium' ? 'Watch closely' : 'Needs support';
      bandOut.className = 'sim-band sim-band--' + level;
    }

    var card = pages.card({
      title: 'What-if simulator',
      subtitle: 'Move the sliders to see how small changes would affect the band. This is a planning aid, not a prediction.',
      body: el('div', null, el('div', { class: 'sim-grid' }, sliders), result)
    });
    update();
    return card;
  }

  function offlinePlan(analysis) {
    var risky = (analysis.factors || []).filter(function (item) { return item.tone !== 'positive'; });
    var actions = analysis.actions || [];
    var plan = actions.slice(0, 4).map(function (action) {
      return { step: action.title, detail: action.detail, priority: action.priority };
    });
    if (!plan.length) {
      plan = [{ step: 'Keep the current supports in place', detail: 'Review the full picture after the next assessment.', priority: 'Monitor' }];
    }
    var first = plan[0];
    return {
      summary: analysis.student.name.split(' ')[0] + ' is currently in the ' + analysis.levelLabel.toLowerCase() +
        ' band with a support score of ' + ui.num(analysis.score) + '/100. ' +
        (risky[0] ? risky[0].text : 'The core signals are steady.') +
        ' Small, consistent changes over the next two weeks are likely to help most.',
      plan: plan,
      parentMessage: {
        en: 'Thank you for your support at home. ' +
          (risky[0] ? 'We are focusing on ' + risky[0].title.toLowerCase() + ' this week. ' : '') +
          'The next step is small and practical: ' + first.detail +
          ' We would be glad to hear what you have noticed as well.',
        hi: 'घर पर आपके सहयोग के लिए धन्यवाद। इस सप्ताह हम ' +
          (risky[0] ? risky[0].title.toLowerCase() : 'नियमित अभ्यास') +
          ' पर ध्यान दे रहे हैं। अगला कदम छोटा और व्यावहारिक है: ' + first.detail +
          ' आपने क्या देखा है, यह जानना हमारे लिए उपयोगी होगा।'
      },
      offline: true
    };
  }

  function renderPlan(host, result) {
    host.textContent = '';
    if (!result) return;
    var message = result.parentMessage || {};
    var language = message.hi ? 'hi' : 'en';
    var messageText = el('p', { text: message[language] || '' });
    var enButton = el('button', {
      class: 'chip' + (language === 'en' ? ' is-active' : ''), type: 'button',
      onClick: function () {
        language = 'en';
        messageText.textContent = message.en || '';
        enButton.classList.add('is-active');
        hiButton.classList.remove('is-active');
      }
    }, 'English');
    var hiButton = el('button', {
      class: 'chip' + (language === 'hi' ? ' is-active' : ''), type: 'button',
      onClick: function () {
        language = 'hi';
        messageText.textContent = message.hi || message.en || '';
        hiButton.classList.add('is-active');
        enButton.classList.remove('is-active');
      }
    }, 'Hindi');
    var again = el('button', { class: 'btn btn--sm btn--ghost', type: 'button' }, el('span', { html: icon('refresh', 13) }), 'Generate again');
    again.addEventListener('click', function () { generatePlan(again); });
    host.appendChild(el('div', { class: 'ai-block' },
      el('div', { class: 'row row--between gap-2' },
        el('h3', { text: 'Support plan draft' }),
        result.offline ? el('span', { class: 'pill pill--nodata', text: 'Offline template' }) : el('span', { class: 'pill pill--brand', text: 'AI draft' })
      ),
      el('p', { class: 'mt-2', text: result.summary || '' }),
      el('div', { class: 'mt-3' }, (result.plan || []).map(function (step, index) {
        return el('div', { class: 'ai-step' },
          el('span', { class: 'ai-step__num', text: String(index + 1) }),
          el('div', null,
            el('div', { class: 'row row--between gap-2' },
              el('strong', { text: step.step || step.title || '' }),
              step.priority ? el('span', { class: 'priority priority--' + String(step.priority).toLowerCase(), text: step.priority }) : null
            ),
            el('div', { class: 'xs muted', text: step.detail || '' })
          )
        );
      })),
      el('div', { class: 'hr-text mt-4', text: 'Message for home' }),
      el('div', { class: 'chips mt-2' }, enButton, message.hi ? hiButton : null),
      messageText,
      el('div', { class: 'btn-row mt-3' },
        el('button', {
          class: 'btn btn--sm', type: 'button',
          onClick: function () { pages.copy(messageText.textContent); }
        }, el('span', { html: icon('copy', 13) }), 'Copy message'),
        again
      ),
      el('p', { class: 'xs faint mt-2', text: 'This is a draft. Review the wording, then use your own judgement before sharing it.' })
    ));
  }

  function generatePlan(button) {
    var host = document.getElementById('student-ai-output');
    if (!host || !state.data) return;
    var analysis = state.data.analysis;
    if (button) button.disabled = true;
    host.textContent = '';
    host.appendChild(el('div', { class: 'skeleton', style: { height: '160px' } }));
    EG.api.post('/api/ai', { type: 'student', studentId: studentId }).then(function (result) {
      var payload = result && result.result;
      if (!payload) throw new Error('The assistant returned an empty plan.');
      renderPlan(host, payload);
    }).catch(function (error) {
      if (error && error.status === 401) return;
      if (error && error.status === 429) ui.toast('You have reached the AI request limit for this minute.', 'info');
      renderPlan(host, offlinePlan(analysis));
      ui.toast('The AI draft was unavailable, so a local template was used.', 'info');
    }).then(function () {
      if (button) button.disabled = false;
    });
  }

  function aiCard() {
    var host = el('div', { id: 'student-ai-output' },
      el('p', { class: 'muted', text: 'Generate a short plan and a parent message in English and Hindi. Names and roll numbers never leave the app.' }),
      el('button', { class: 'btn btn--primary mt-2', type: 'button', 'data-ai-inline': 'true' }, el('span', { html: icon('sparkles', 15) }), 'Generate draft')
    );
    var card = pages.card({
      title: 'AI support draft',
      subtitle: 'Anonymous numbers only. Review before sharing.',
      body: host
    });
    return card;
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
      el('button', { class: 'btn btn--primary', type: 'button', id: 'student-ai-action', onClick: function (event) { generatePlan(event.currentTarget); } }, el('span', { html: icon('sparkles') }), 'AI draft'),
      el('a', { class: 'btn btn--soft', href: '/assistant?student=' + encodeURIComponent(studentId) }, el('span', { html: icon('assistant') }), 'Ask assistant'),
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
      simulatorCard(analysis),
      timelineCard(analysis),
      subjectsCard(analysis),
      attendanceCard(analysis)
    );

    var right = el('div', { class: 'stack' },
      actionsCard(analysis),
      aiCard(),
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

    var inline = document.querySelector('[data-ai-inline]');
    if (inline) inline.addEventListener('click', function () { generatePlan(inline); });
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
