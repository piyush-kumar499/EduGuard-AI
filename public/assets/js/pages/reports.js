/* Reports: printable class sheets and individual student summaries. */
(function () {
  'use strict';

  var EG = window.EG;
  var ui = EG.ui;
  var el = ui.el;
  var pages = EG.pages;
  var icon = ui.icon;

  var state = {
    tab: 'class', picker: null, classData: null, studentData: null,
    students: [], studentId: '', classHost: null, studentHost: null,
    classPane: null, studentPane: null, studentSelect: null,
    classBuilt: false, studentBuilt: false
  };

  function updateQuery() {
    var params = new URLSearchParams();
    if (state.tab === 'student') params.set('tab', 'student');
    var pair = state.picker ? state.picker.value() : null;
    if (pair && pair.subjectId) params.set('subjectId', pair.subjectId);
    if (pair && pair.sectionId) params.set('sectionId', pair.sectionId);
    if (state.studentId) params.set('studentId', state.studentId);
    var text = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (text ? '?' + text : ''));
  }

  function switchTab(tab) {
    state.tab = tab;
    if (state.classPane) state.classPane.hidden = tab !== 'class';
    if (state.studentPane) state.studentPane.hidden = tab !== 'student';
    document.querySelectorAll('[data-report-tab]').forEach(function (button) {
      button.classList.toggle('is-active', button.dataset.reportTab === tab);
    });
    updateQuery();
    if (tab === 'class' && !state.classBuilt) buildClass();
    if (tab === 'student' && state.studentId && !state.studentBuilt) buildStudent();
  }

  function reportHead(title, subtitle, meta) {
    return el('div', { class: 'report-paper__head' },
      el('div', null,
        el('div', { class: 'status-brand', style: { marginBottom: '4px' } },
          el('span', { class: 'brand-mark', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>' }),
          el('span', { text: 'EduGuard' })
        ),
        el('h2', { text: title }),
        el('p', { class: 'report-meta', text: subtitle })
      ),
      el('div', { class: 'report-meta', style: { textAlign: 'right' } },
        el('div', { text: meta.term || '' }),
        el('div', { text: 'Generated ' + ui.dateTime(new Date().toISOString()) }),
        el('div', { text: meta.scope || '' })
      )
    );
  }

  function renderClass(data) {
    state.classData = data;
    state.classHost.textContent = '';
    if (!data.assessments.length) {
      state.classHost.appendChild(pages.empty('No assessments for this class', 'Add an assessment and enter marks, then rebuild this report.', el('a', { class: 'btn btn--primary btn--sm', href: '/marks' + EG.api.query({ subjectId: data.subject.id, sectionId: data.section.id }) }, 'Open marks'), 'marks'));
      return;
    }
    var body = el('tbody');
    data.students.forEach(function (student) {
      var cells = [
        el('td', { class: 'mono', text: student.roll }),
        el('td', { text: student.name })
      ];
      data.assessments.forEach(function (assessment) {
        var cell = student.cells[assessment.id] || { score: null, status: 'missing', percent: null };
        var text = cell.status === 'absent' ? 'AB' : cell.status === 'exempt' ? 'EX' : cell.score === null ? '-' : ui.num(cell.score);
        cells.push(el('td', { class: 'num', title: cell.percent === null ? 'No recorded percentage' : Math.round(cell.percent) + '%', text: text }));
      });
      cells.push(el('td', { class: 'num', text: student.percent === null ? '-' : ui.pct(student.percent) }));
      cells.push(el('td', { class: 'num', text: student.entered + ' / ' + data.assessments.length }));
      body.appendChild(el('tr', null, cells));
    });

    var head = el('thead', null, el('tr', null,
      el('th', { text: 'Roll' }), el('th', { text: 'Student' }),
      data.assessments.map(function (assessment) {
        return el('th', { class: 'num' }, el('div', { text: assessment.title }), el('div', { class: 'faint', text: '/' + assessment.maxMarks + (assessment.heldOn ? ' - ' + ui.date(assessment.heldOn, 'short') : '') }));
      }),
      el('th', { class: 'num', text: 'Final %' }), el('th', { class: 'num', text: 'Entered' })
    ));

    state.classHost.appendChild(el('div', { class: 'report-paper' },
      reportHead(data.subject.name + ' - ' + data.section.name, 'Class assessment report', {
        term: data.term.name,
        scope: data.subject.code ? 'Subject code ' + data.subject.code : 'Subject report'
      }),
      el('div', { class: 'grid grid--4 mt-4' },
        miniStat('Students', ui.num(data.stats.students)),
        miniStat('Marks entered', ui.num(data.stats.entered) + ' / ' + ui.num(data.stats.possible)),
        miniStat('Class average', data.stats.average === null ? '-' : ui.pct(data.stats.average)),
        miniStat('Pass rate', data.stats.passRate === null ? '-' : ui.pct(data.stats.passRate))
      ),
      el('h3', { text: 'Assessment sheet' }),
      el('div', { class: 'table-wrap' }, el('table', { class: 'report-table' }, head, body)),
      el('p', { class: 'report-meta mt-3', text: 'AB = absent, EX = exempt, - = no mark recorded. Final % uses the subject marking scheme. This report supports a conversation; it is not a decision about a student.' })
    ));
  }

  function miniStat(label, value) {
    return el('div', { class: 'card card--pad' },
      el('div', { class: 'profile-stat__label', text: label }),
      el('div', { class: 'profile-stat__value', text: value })
    );
  }

  function renderStudent(data) {
    state.studentData = data;
    var analysis = data.analysis;
    var student = analysis.student;
    state.studentHost.textContent = '';
    var signals = analysis.signals;
    var subjects = signals.subjectData || [];

    var subjectRows = subjects.map(function (subject) {
      return el('tr', null,
        el('td', { text: subject.name }),
        el('td', { class: 'num', text: subject.value === null ? '-' : ui.pct(subject.value) }),
        el('td', { class: 'num', text: ui.pct(subject.attendance) }),
        el('td', { class: 'num', text: ui.pct(subject.coursework) }),
        el('td', { class: 'num', text: ui.num(subject.assessmentCount) }),
        el('td', { class: 'num', text: ui.num(subject.sessionCount) })
      );
    });

    var factors = analysis.factors.length
      ? el('div', null, analysis.factors.map(function (factor) {
        return el('div', { class: 'factor' + (factor.tone === 'positive' ? ' factor--positive' : '') },
          el('span', { class: 'factor__icon', html: icon(factor.tone === 'positive' ? 'check' : 'warning', 15) }),
          el('div', { class: 'grow' },
            el('div', { class: 'factor__title', text: factor.title }),
            el('div', { class: 'factor__text', text: factor.text })
          )
        );
      }))
      : el('p', { class: 'xs faint', text: 'No contributing factors are available yet.' });

    var actions = analysis.actions.length
      ? el('div', { class: 'ai-block' }, analysis.actions.map(function (action, index) {
        return el('div', { class: 'ai-step' },
          el('span', { class: 'ai-step__num', text: String(index + 1) }),
          el('div', null,
            el('strong', { text: action.title }),
            el('div', { class: 'xs muted', text: action.detail }),
            el('span', { class: 'priority priority--' + action.priority.toLowerCase(), text: action.priority })
          )
        );
      }))
      : el('p', { class: 'xs faint', text: 'No suggested steps yet.' });

    var mentors = data.mentors && data.mentors.length
      ? el('div', { class: 'list-rows' }, data.mentors.map(function (mentor) {
        return el('div', { class: 'list-row' },
          el('div', { class: 'list-row__main' },
            el('div', { class: 'list-row__title', text: mentor.name }),
            el('div', { class: 'list-row__sub', text: mentor.roll + ' - strong in ' + mentor.subjectName + ' (' + ui.pct(mentor.subjectValue) + ')' })
          ),
          el('span', { class: 'pill pill--low', text: 'Peer mentor' })
        );
      }))
      : el('p', { class: 'xs faint', text: 'No peer mentor suggestion is available right now.' });

    state.studentHost.appendChild(el('div', { class: 'report-paper' },
      reportHead(student.name, 'Individual support summary', {
        term: data.term.name,
        scope: student.roll + ' - ' + student.sectionName
      }),
      el('div', { class: 'grid grid--4 mt-4' },
        miniStat('Attendance', ui.pct(signals.attendance)),
        miniStat('Coursework', ui.pct(signals.coursework)),
        miniStat('Weighted marks', ui.pct(signals.marks)),
        miniStat('Support score', analysis.hasData ? ui.num(analysis.score) + ' (' + analysis.levelLabel + ')' : 'No entries yet')
      ),
      el('h3', { text: 'Signals in this term' }),
      el('table', { class: 'report-table' },
        el('thead', null, el('tr', null,
          el('th', { text: 'Subject' }), el('th', { class: 'num', text: 'Marks' }), el('th', { class: 'num', text: 'Attendance' }),
          el('th', { class: 'num', text: 'Coursework' }), el('th', { class: 'num', text: 'Assessments' }), el('th', { class: 'num', text: 'Sessions' })
        )),
        el('tbody', null, subjectRows.length ? subjectRows : el('tr', null, el('td', { colspan: '6', text: 'No subject data recorded yet.' })))
      ),
      el('h3', { text: 'What is driving the picture' }),
      factors,
      el('h3', { text: 'Suggested next steps' }),
      actions,
      el('h3', { text: 'Peer mentor suggestions' }),
      mentors,
      el('h3', { text: 'How to read this report' }),
      el('p', { class: 'report-meta', text: 'The support score combines attendance, coursework completion and weighted assessment marks. Bands are prompts for a calm conversation. The forecast is not a prediction of failure and should never be used as a label. Generated from the data visible to your role.' })
    ));
  }

  function buildClass() {
    if (!state.picker) return Promise.resolve();
    var pair = state.picker.value();
    if (!pair || !pair.subjectId || !pair.sectionId) return Promise.resolve();
    state.classBuilt = true;
    state.classHost.textContent = '';
    state.classHost.appendChild(el('div', { class: 'page-loader' }, el('div', { class: 'skeleton skeleton--card' })));
    updateQuery();
    return EG.api.get('/api/reports/class', { subjectId: pair.subjectId, sectionId: pair.sectionId }).then(function (data) {
      renderClass(data);
    }).catch(function (error) {
      if (error.status === 401) return;
      state.classBuilt = false;
      state.classHost.textContent = '';
      state.classHost.appendChild(ui.errorState(error, buildClass));
      ui.toast(error.message, 'error');
    });
  }

  function loadStudents() {
    return EG.api.get('/api/students', { limit: 200, sort: 'name', direction: 'asc' }).then(function (data) {
      state.students = data.rows || [];
      if (state.studentSelect) {
        state.studentSelect.textContent = '';
        state.students.forEach(function (student) {
          state.studentSelect.appendChild(el('option', { value: student.id, text: student.name + ' - ' + student.roll + ' - ' + student.sectionName, selected: student.id === state.studentId }));
        });
      }
      return state.students;
    }).catch(function (error) {
      ui.toast(error.message, 'error');
      return [];
    });
  }

  function buildStudent() {
    if (!state.studentId) {
      ui.toast('Choose a student first.', 'error');
      return Promise.resolve();
    }
    state.studentBuilt = true;
    state.studentHost.textContent = '';
    state.studentHost.appendChild(el('div', { class: 'page-loader' }, el('div', { class: 'skeleton skeleton--card' })));
    updateQuery();
    return EG.api.get('/api/reports/student/' + encodeURIComponent(state.studentId)).then(function (data) {
      renderStudent(data);
    }).catch(function (error) {
      if (error.status === 401) return;
      state.studentBuilt = false;
      state.studentHost.textContent = '';
      state.studentHost.appendChild(ui.errorState(error, buildStudent));
      ui.toast(error.message, 'error');
    });
  }

  function exportCsv() {
    if (state.tab === 'class' && state.classData) {
      var data = state.classData;
      var rows = data.students.map(function (student) {
        var record = { roll: student.roll, name: student.name };
        data.assessments.forEach(function (assessment) {
          var cell = student.cells[assessment.id] || {};
          record['a_' + assessment.id] = cell.status === 'absent' ? 'AB' : cell.status === 'exempt' ? 'EX' : cell.score;
        });
        record.final = student.percent;
        record.entered = student.entered;
        return record;
      });
      var columns = [
        { key: 'roll', label: 'Roll' }, { key: 'name', label: 'Student' }
      ].concat(data.assessments.map(function (assessment) { return { key: 'a_' + assessment.id, label: assessment.title + ' /' + assessment.maxMarks }; }))
        .concat([{ key: 'final', label: 'Final %' }, { key: 'entered', label: 'Entered' }]);
      pages.download('eduguard-class-' + data.section.name + '-' + data.subject.name + '.csv', rows, columns);
      return;
    }
    if (state.tab === 'student' && state.studentData) {
      var analysis = state.studentData.analysis;
      var row = {
        name: analysis.student.name, roll: analysis.student.roll, section: analysis.student.sectionName,
        attendance: analysis.signals.attendance, coursework: analysis.signals.coursework,
        marks: analysis.signals.marks, score: analysis.score, band: analysis.levelLabel,
        forecast: analysis.forecast.percent
      };
      pages.download('eduguard-student-' + analysis.student.roll + '.csv', [row], [
        { key: 'name', label: 'Name' }, { key: 'roll', label: 'Roll' }, { key: 'section', label: 'Section' },
        { key: 'attendance', label: 'Attendance %' }, { key: 'coursework', label: 'Coursework %' },
        { key: 'marks', label: 'Marks %' }, { key: 'score', label: 'Score' }, { key: 'band', label: 'Band' },
        { key: 'forecast', label: 'Forecast %' }
      ]);
      return;
    }
    ui.toast('Build a report before exporting.', 'info');
  }

  pages.guard(function () {
    var params = new URLSearchParams(window.location.search);
    var list = pages.pairs();
    if (!list.length) {
      pages.mount({
        title: 'Reports',
        subtitle: 'No teaching assignments are configured',
        content: pages.empty('No classes to report on', 'Ask the HOD to create a term and teaching assignments first.', el('a', { class: 'btn btn--primary', href: '/dashboard' }, 'Back to dashboard'), 'reports')
      });
      return Promise.resolve(null);
    }
    state.studentId = params.get('studentId') || '';
    state.tab = params.get('tab') === 'student' || state.studentId ? 'student' : 'class';
    var wanted = params.get('subjectId') && params.get('sectionId')
      ? list.find(function (pair) { return pair.subjectId === params.get('subjectId') && pair.sectionId === params.get('sectionId'); })
      : null;

    pages.mount({ title: 'Reports', subtitle: 'Loading report tools...', content: ui.skeletonPage() });

    state.picker = pages.pairPicker({ value: wanted || list[0] });
    state.classHost = el('div');
    state.studentHost = el('div');
    state.studentSelect = pages.select(state.students.map(function (student) {
      return { value: student.id, label: student.name };
    }), { value: state.studentId });

    var tabs = el('div', { class: 'tabs' },
      el('button', { class: 'tab' + (state.tab === 'class' ? ' is-active' : ''), type: 'button', dataset: { reportTab: 'class' }, onClick: function () { switchTab('class'); } }, 'Class report'),
      el('button', { class: 'tab' + (state.tab === 'student' ? ' is-active' : ''), type: 'button', dataset: { reportTab: 'student' }, onClick: function () { switchTab('student'); } }, 'Student report')
    );

    state.classPane = el('div', { hidden: state.tab !== 'class' },
      pages.card({
        body: el('div', { class: 'row row--wrap gap-3' },
          el('div', { class: 'grow' }, state.picker.root),
          el('div', { class: 'field' }, el('label', { text: ' ' }), el('button', { class: 'btn btn--primary', type: 'button', onClick: buildClass }, el('span', { html: icon('reports', 14) }), 'Build report'))
        )
      }),
      el('div', { class: 'mt-4' }, state.classHost)
    );

    state.studentPane = el('div', { hidden: state.tab !== 'student' },
      pages.card({
        body: el('div', { class: 'row row--wrap gap-3' },
          el('div', { class: 'field grow', style: { minWidth: '240px' } },
            el('label', { text: 'Student' }),
            (function () {
              var wrap = el('div', { class: 'row gap-2' });
              wrap.appendChild(state.studentSelect);
              wrap.appendChild(el('button', { class: 'btn btn--soft', type: 'button', onClick: function () { loadStudents(); } }, el('span', { html: icon('refresh', 13) }), 'Refresh list'));
              return wrap;
            })()
          ),
          el('div', { class: 'field' }, el('label', { text: ' ' }), el('button', { class: 'btn btn--primary', type: 'button', onClick: function () {
            state.studentId = state.studentSelect.value;
            buildStudent();
          } }, el('span', { html: icon('user', 14) }), 'Build report'))
        )
      }),
      el('div', { class: 'mt-4' }, state.studentHost)
    );

    pages.mount({
      title: 'Reports',
      subtitle: 'Printable, plain-language reports for a class or one student.',
      actions: el('div', { class: 'btn-row' },
        el('button', { class: 'btn', type: 'button', onClick: function () { window.print(); } }, el('span', { html: icon('printer') }), 'Print'),
        el('button', { class: 'btn', type: 'button', onClick: exportCsv }, el('span', { html: icon('download') }), 'CSV'),
        el('button', { class: 'btn btn--soft', type: 'button', onClick: function () {
          if (state.tab === 'class') buildClass(); else buildStudent();
        } }, el('span', { html: icon('refresh') }), 'Rebuild')
      ),
      content: el('div', { class: 'stack' }, tabs, state.classPane, state.studentPane)
    });

    updateQuery();
    loadStudents().then(function () {
      if (state.studentId && state.studentSelect) state.studentSelect.value = state.studentId;
      if (state.tab === 'class') buildClass();
      else if (state.studentId) buildStudent();
    });
    return Promise.resolve(null);
  });
})();
