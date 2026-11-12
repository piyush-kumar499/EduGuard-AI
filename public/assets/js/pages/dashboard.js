/* Dashboard: the morning overview. */
(function () {
  'use strict';

  var EG = window.EG;
  var ui = EG.ui;
  var el = ui.el;
  var pages = EG.pages;
  var icon = ui.icon;

  var PAGE_SIZE = 9;
  var state = { sectionId: '', subjectId: '', page: 0, q: '', band: '', sort: 'priority', direction: 'desc' };
  var loadToken = 0;
  var tableToken = 0;
  var tableHost = null;

  function readQuery() {
    var params = new URLSearchParams(window.location.search);
    state.sectionId = params.get('sectionId') || '';
    state.subjectId = params.get('subjectId') || '';
    state.page = Math.max(0, Number(params.get('page')) || 0);
    state.q = params.get('q') || '';
    state.band = params.get('band') || '';
    state.sort = params.get('sort') || 'priority';
    state.direction = params.get('direction') === 'asc' ? 'asc' : 'desc';
  }

  function writeQuery() {
    var params = new URLSearchParams();
    if (state.sectionId) params.set('sectionId', state.sectionId);
    if (state.subjectId) params.set('subjectId', state.subjectId);
    if (state.page) params.set('page', String(state.page));
    if (state.q) params.set('q', state.q);
    if (state.band) params.set('band', state.band);
    if (state.sort && state.sort !== 'priority') params.set('sort', state.sort);
    if (state.sort && state.sort !== 'priority' && state.direction === 'asc') params.set('direction', 'asc');
    var text = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (text ? '?' + text : ''));
  }

  function personRow(row, rank) {
    return el('a', { class: 'focus-item', href: pages.studentHref(row.id) },
      el('span', { class: 'focus-item__rank', text: String(rank).padStart(2, '0') }),
      el('span', { class: 'grow' },
        el('span', { class: 'focus-item__name', text: row.name }),
        el('span', { class: 'focus-item__sub', text: row.roll + ' · ' + row.sectionName + ' · ' + row.topFactor })
      ),
      el('span', { class: 'focus-item__score' },
        el('strong', { text: row.hasData ? ui.num(row.score, 1) : '—' }),
        el('span', { html: ui.levelPill(row.level, row.levelLabel) })
      )
    );
  }

  function distribution(data) {
    var counts = data.distribution || {};
    var segments = [
      { value: counts.high || 0, label: 'Needs support', color: 'var(--danger)' },
      { value: counts.medium || 0, label: 'Watch closely', color: 'var(--warning)' },
      { value: counts.low || 0, label: 'On track', color: 'var(--success)' },
      { value: counts.noData || 0, label: 'No data', color: 'var(--faint)' }
    ];
    var donut = EG.charts.donut(segments, { centerValue: data.summary.students, centerLabel: 'students', size: 138, thickness: 14 });
    var legend = el('div', { class: 'dist-legend' }, segments.map(function (segment) {
      return el('div', { class: 'dist-legend__row' },
        el('i', { class: 'dot', style: { background: segment.color } }),
        el('span', { text: segment.label }),
        el('strong', { text: ui.num(segment.value) })
      );
    }));
    return el('div', { class: 'dist-wrap' }, donut, legend);
  }

  function reasonBars(data) {
    if (!data.reasons.length) return pages.empty('No recurring risk pattern', 'Once assessments and attendance are recorded, the top reasons will appear here.', null, 'check');
    var max = Math.max.apply(null, data.reasons.map(function (row) { return row.count; }));
    return el('div', { class: 'bars' }, data.reasons.map(function (row) {
      return el('div', { class: 'bar-row' },
        el('span', { class: 'bar-row__label', text: row.label }),
        el('span', { class: 'bar-row__track' }, el('span', { class: 'bar-row__fill', style: { width: (row.count / Math.max(1, max)) * 100 + '%' } })),
        el('span', { class: 'bar-row__value', text: ui.num(row.count) })
      );
    }));
  }

  function sectionTable(data) {
    var body = el('tbody');
    data.sections.forEach(function (row) {
      var level = row.flaggedShare > 25 ? 'high' : row.flaggedShare > 10 ? 'medium' : 'low';
      body.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'person__name', text: row.name }), el('div', { class: 'person__sub', text: [row.branch, row.semester].filter(Boolean).join(' · ') })),
        el('td', { class: 'num', text: ui.num(row.students) }),
        el('td', null,
          el('div', { class: 'row gap-2' },
            el('span', { class: 'pill pill--' + level, text: ui.pct(row.flaggedShare) }),
            el('div', { class: 'grow' }, pages.meter(row.flaggedShare, level))
          )
        ),
        el('td', { class: 'num', text: ui.pct(row.attendance) }),
        el('td', { class: 'num', text: ui.pct(row.marks) })
      ));
    });
    return el('div', { class: 'table-wrap' },
      el('table', { class: 'table table--compact' },
        el('thead', null, el('tr', null,
          el('th', { text: 'Section' }), el('th', { class: 'num', text: 'Students' }),
          el('th', { text: 'Flagged' }), el('th', { class: 'num', text: 'Attendance' }), el('th', { class: 'num', text: 'Marks' })
        )),
        body
      )
    );
  }

  function departmentPulse(data) {
    if (!data.department) return null;
    var faculty = data.department.facultyProgress || [];
    var attention = data.department.attention || [];
    var body = el('div', { class: 'stack--sm' });
    if (faculty.length) {
      body.appendChild(el('div', { class: 'eyebrow', text: 'Faculty entry progress' }));
      body.appendChild(el('div', { class: 'pulse-list' }, faculty.map(function (row) {
        var level = row.filledPct >= 90 ? 'low' : row.filledPct >= 50 ? 'medium' : 'high';
        return el('div', { class: 'pulse-row' },
          el('div', { class: 'pulse-row__top' },
            el('span', { class: 'truncate', text: row.owner }),
            el('span', { class: 'xs muted', text: row.pairs + ' ' + ui.plural(row.pairs, 'class', 'classes') + (row.overdue ? ' · ' + row.overdue + ' overdue' : '') })
          ),
          el('div', { class: 'row gap-2' },
            el('div', { class: 'grow' }, pages.meter(row.filledPct, level)),
            el('strong', { class: 'xs', text: ui.pct(row.filledPct) })
          )
        );
      })));
    } else {
      body.appendChild(el('p', { class: 'small muted', text: 'No faculty assignments have marks activity yet.' }));
    }
    if (attention.length) {
      body.appendChild(el('div', { class: 'eyebrow mt-2', text: 'Sections over 40% flagged' }));
      attention.forEach(function (row) {
        body.appendChild(el('div', { class: 'attention-item' },
          el('div', null,
            el('div', { class: 'strong', text: row.name }),
            el('div', { class: 'xs muted', text: row.students + ' students · ' + ui.pct(row.attendance) + ' attendance' })
          ),
          el('span', { class: 'pill pill--medium', text: ui.pct(row.flaggedShare) + ' flagged' })
        ));
      });
    }
    return pages.card({
      title: 'Department pulse',
      subtitle: 'Where entry and support effort should land first',
      body: body,
      foot: el('a', { class: 'btn btn--sm btn--soft', href: '/progress' }, 'Open data progress', el('span', { html: icon('arrowRight', 13) }))
    });
  }

  function tableParams() {
    return {
      q: state.q || undefined,
      sectionId: state.sectionId || undefined,
      subjectId: state.subjectId || undefined,
      band: state.band || undefined,
      sort: state.sort,
      direction: state.direction,
      limit: PAGE_SIZE,
      offset: state.page * PAGE_SIZE
    };
  }

  function refreshTable(options) {
    var token = ++tableToken;
    writeQuery();
    return EG.api.get('/api/students', tableParams()).then(function (data) {
      if (token !== tableToken || !tableHost) return;
      tableHost.textContent = '';
      tableHost.appendChild(studentTable(data));
      if (options && options.focusSearch) {
        var input = tableHost.querySelector('input[type=search]');
        if (input) {
          input.focus();
          var value = input.value;
          try { input.setSelectionRange(value.length, value.length); } catch (error) { /* unsupported */ }
        }
      }
    }).catch(function (error) {
      if (error.status === 401 || token !== tableToken) return;
      ui.toast(error.message, 'error');
    });
  }

  function sortHeader(label, key, numeric) {
    var active = state.sort === key;
    var sortDir = active ? (state.direction === 'asc' ? 'desc' : 'asc') : (numeric ? 'desc' : 'asc');
    return el('th', { class: numeric ? 'num' : null, 'aria-sort': active ? (state.direction === 'asc' ? 'ascending' : 'descending') : 'none' },
      el('button', {
        class: 'th-sort' + (active ? ' is-active' : ''), type: 'button',
        title: 'Sort by ' + label,
        onClick: function () {
          state.sort = key;
          state.direction = sortDir;
          state.page = 0;
          refreshTable();
        }
      }, label, active ? el('span', { html: icon(state.direction === 'asc' ? 'arrowUp' : 'arrowDown', 11) }) : null)
    );
  }

  function trendCell(value) {
    var delta = Number(value);
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.05) return el('td', { class: 'num faint', text: '—' });
    var good = delta > 0;
    return el('td', { class: 'num', style: { color: good ? 'var(--success)' : 'var(--danger)' } },
      el('span', { html: icon(good ? 'arrowUp' : 'arrowDown', 11) }),
      (good ? '+' : '') + ui.num(delta, 1)
    );
  }

  function studentTable(students) {
    var rows = students.rows || [];
    var total = students.total || 0;
    var pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    var current = Math.min(state.page, pageCount - 1);
    var start = total ? current * PAGE_SIZE + 1 : 0;
    var end = Math.min(total, current * PAGE_SIZE + rows.length);

    var search = el('input', {
      class: 'input input--search', type: 'search', placeholder: 'Search name, roll or section…',
      'aria-label': 'Search students', value: state.q
    });
    var timer = null;
    search.addEventListener('input', function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        state.q = search.value.trim();
        state.page = 0;
        refreshTable({ focusSearch: true });
      }, 300);
    });

    var bands = [['', 'All bands'], ['high', 'Needs support'], ['medium', 'Watch'], ['low', 'On track']];
    var chips = el('div', { class: 'chips' }, bands.map(function (pair) {
      return el('button', {
        class: 'chip' + (state.band === pair[0] ? ' is-active' : ''), type: 'button',
        'aria-pressed': state.band === pair[0] ? 'true' : 'false',
        onClick: function () {
          state.band = pair[0];
          state.page = 0;
          refreshTable();
        }
      }, pair[1]);
    }));

    var body = el('tbody');
    rows.forEach(function (row) {
      body.appendChild(el('tr', {
        class: 'is-clickable',
        onClick: function (event) {
          if (event.target && event.target.closest && event.target.closest('a, button')) return;
          window.location.href = pages.studentHref(row.id);
        }
      },
        el('td', null,
          el('div', { class: 'row gap-2' },
            el('span', { class: 'avatar avatar--sm', text: ui.initials(row.name) }),
            el('div', null,
              el('a', { class: 'row-link strong', href: pages.studentHref(row.id), text: row.name }),
              el('div', { class: 'person__sub mono', text: row.roll })
            )
          )
        ),
        el('td', { text: row.sectionName }),
        el('td', { class: 'num', text: ui.pct(row.attendance) }),
        el('td', { class: 'num', text: ui.pct(row.marks) }),
        el('td', { class: 'num', text: row.hasData ? ui.num(row.score, 1) : '—' }),
        el('td', null, el('span', { html: ui.levelPill(row.level, row.levelLabel) })),
        trendCell(row.markDelta)
      ));
    });

    var pager = el('div', { class: 'row row--between gap-3 mt-3' },
      el('span', { class: 'xs faint', text: total ? 'Showing ' + start + '–' + end + ' of ' + total + ' ' + ui.plural(total, 'student') : 'No students match this view.' }),
      el('div', { class: 'btn-row' },
        el('button', {
          class: 'btn btn--sm', type: 'button', disabled: current === 0 ? 'disabled' : null,
          onClick: function () { state.page = Math.max(0, current - 1); refreshTable(); }
        }, el('span', { html: icon('arrowLeft', 13) }), 'Previous'),
        el('span', { class: 'xs muted', text: 'Page ' + (current + 1) + ' of ' + pageCount }),
        el('button', {
          class: 'btn btn--sm', type: 'button', disabled: current >= pageCount - 1 ? 'disabled' : null,
          onClick: function () { state.page = Math.min(pageCount - 1, current + 1); refreshTable(); }
        }, 'Next', el('span', { html: icon('arrowRight', 13) }))
      )
    );

    return pages.card({
      title: 'Student overview',
      subtitle: 'The whole cohort, ranked by support priority',
      body: el('div', null,
        el('div', { class: 'row row--wrap row--between gap-2 mb-3' },
          el('div', { class: 'row row--wrap gap-2' }, search, chips),
          el('span', { class: 'xs faint', text: total + ' ' + ui.plural(total, 'student') + ' in view' })
        ),
        rows.length
          ? el('div', null,
            el('div', { class: 'table-wrap' },
              el('table', { class: 'table table--compact' },
                el('thead', null, el('tr', null,
                  sortHeader('Student', 'name'),
                  el('th', { text: 'Section' }),
                  sortHeader('Attendance', 'attendance', true),
                  sortHeader('Marks', 'marks', true),
                  sortHeader('Score', 'score', true),
                  el('th', { text: 'Band' }),
                  sortHeader('Trend', 'trend', true)
                )),
                body
              )
            ),
            pager
          )
          : pages.empty('No students in this view', 'Adjust the search, band, section or subject filters to widen the view.', null, 'students')
      )
    });
  }

  function render(data, students, session) {
    var isHod = session.user.role === 'HOD';
    var firstName = session.user.name.split(' ')[0];
    var hour = new Date().getHours();
    var greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    var summary = data.summary;

    var hero = el('div', { class: 'dash-hero' },
      el('span', { class: 'eyebrow', text: greeting + ', ' + firstName }),
      el('h2', { text: isHod ? 'Here is where the department needs you today.' : 'Here is where your classes need you today.' }),
      el('p', { text: summary.students + ' ' + ui.plural(summary.students, 'student') + ' in view. ' + (summary.high + summary.medium) + ' need a check-in, ' + summary.improved + ' improved, and ' + summary.noData + ' have no entries yet.' }),
      el('div', { class: 'dash-hero__badges' },
        el('span', { class: 'pill pill--danger' }, el('span', { class: 'dot dot--high' }), summary.high + ' need support'),
        el('span', { class: 'pill pill--medium' }, el('span', { class: 'dot dot--medium' }), summary.medium + ' watch closely'),
        el('span', { class: 'pill pill--low' }, el('span', { class: 'dot dot--low' }), summary.low + ' on track'),
        summary.noData ? el('span', { class: 'pill pill--nodata', text: summary.noData + ' no data' }) : null
      ),
      el('div', { class: 'btn-row mt-4' },
        el('a', { class: 'btn btn--primary', href: '/students?band=high' }, el('span', { html: icon('target') }), 'Review priority students'),
        el('a', { class: 'btn', href: '/marks' }, el('span', { html: icon('marks') }), 'Enter marks'),
        isHod ? el('a', { class: 'btn', href: '/progress' }, el('span', { html: icon('progress') }), 'Data progress') : null
      )
    );

    var focus = pages.card({
      title: 'Priority follow-ups',
      subtitle: 'Ranked by current score, forecast and urgent steps',
      flush: true,
      body: data.focus.length
        ? el('div', { class: 'focus-list' }, data.focus.map(function (row, index) { return personRow(row, index + 1); }))
        : pages.empty('No follow-ups right now', 'All students with data are currently on track.', null, 'check')
    });

    var trendCard = pages.card({
      title: 'Assessment trend',
      subtitle: 'Average assessment percentage by section',
      body: el('div', null,
        el('div', { class: 'row row--between gap-3 mb-3' },
          el('span', { class: 'pill ' + (data.trend.delta >= 0 ? 'pill--low' : 'pill--high') },
            el('span', { html: icon(data.trend.delta >= 0 ? 'trendUp' : 'trendDown', 12) }),
            (data.trend.delta >= 0 ? '+' : '') + ui.num(data.trend.delta) + ' pts overall'
          )
        ),
        EG.charts.line(data.trend.series.map(function (series) { return { name: series.section, points: series.points }; }), { height: 230, label: 'Average assessment percentage by section' }),
        EG.charts.legend(data.trend.series.map(function (series, index) { return { name: series.section, color: EG.charts.palette[index % EG.charts.palette.length] }; }))
      )
    });

    var distCard = pages.card({ title: 'Support distribution', subtitle: 'Current bands across ' + summary.students + ' students', body: distribution(data) });

    var reasonsCard = pages.card({ title: 'Why students are flagged', subtitle: 'Top contributing factors', body: reasonBars(data) });

    var warnings = pages.card({
      title: 'Early warnings',
      subtitle: 'Changes worth a conversation this week',
      body: data.warnings.length
        ? el('div', { class: 'warning-list' }, data.warnings.map(function (row) {
          return el('div', { class: 'warning-item' },
            el('span', { class: 'warning-item__icon', html: icon('warning', 16) }),
            el('div', { class: 'grow' },
              el('p', null, el('a', { href: pages.studentHref(row.id), text: row.name }), ' — ' + row.reason),
              el('div', { class: 'xs faint', text: row.roll + ' · ' + row.sectionName })
            )
          );
        }))
        : pages.empty('No sudden changes', 'No recent attendance or marks drops were detected.', null, 'activity')
    });

    var attention = pages.card({
      title: 'Sections to watch',
      subtitle: 'High flagged share or attendance below 75%',
      body: data.needsAttention.length
        ? el('div', null, data.needsAttention.map(function (row) {
          return el('div', { class: 'attention-item' },
            el('div', null,
              el('div', { class: 'strong', text: row.name }),
              el('div', { class: 'xs muted', text: row.students + ' students · ' + ui.pct(row.attendance) + ' attendance' })
            ),
            el('span', { class: 'pill pill--medium', text: ui.pct(row.flaggedShare) + ' flagged' })
          );
        }))
        : pages.empty('Sections look steady', 'No section crossed the attention lines this week.', null, 'check')
    });

    var progress = null;
    if (isHod && data.progress) {
      progress = pages.card({
        title: 'Data completeness',
        subtitle: data.progress.total + ' subject-section pairs · ' + data.progress.incomplete + ' need attention',
        body: el('div', { class: 'progress-mini' }, data.progress.rows.map(function (row) {
          var level = row.completeness >= 90 ? 'low' : row.completeness >= 50 ? 'medium' : 'high';
          return el('div', { class: 'progress-mini__row' },
            el('div', { class: 'progress-mini__top' },
              el('span', { class: 'truncate', text: row.subjectName + ' · ' + row.sectionName }),
              el('strong', { text: ui.pct(row.completeness) })
            ),
            pages.meter(row.completeness, level)
          );
        })),
        foot: el('a', { class: 'btn btn--sm btn--soft', href: '/progress' }, 'Open data progress', el('span', { html: icon('arrowRight', 13) }))
      });
    }

    var right = el('div', { class: 'stack' }, distCard, warnings, progress);
    var left = el('div', { class: 'stack' }, hero, trendCard, pages.card({ title: 'Section comparison', subtitle: 'Flagged share, attendance and marks', flush: true, body: sectionTable(data) }));

    var container = pages.mount({
      title: 'Dashboard',
      subtitle: data.term.name + ' · ' + (isHod ? 'whole department' : 'your assigned classes'),
      actions: buildActions(data, session),
      content: el('div', { class: 'dash-grid' }, left, right)
    });
    container.appendChild(el('div', { class: 'dash-grid mt-4' },
      el('div', { class: 'stack' }, focus, reasonsCard),
      el('div', { class: 'stack' }, attention, departmentPulse(data), pages.card({
        title: 'How the score works',
        subtitle: 'Transparent, reviewable and never a decision on its own',
        body: el('div', { class: 'stack--sm small muted' },
          el('p', { text: 'Each student gets a 0–100 indicator built from attendance, coursework completion and weighted assessment marks. Falling trends apply a small penalty.' }),
          el('p', { text: 'Bands: 70+ on track, 50–69 watch closely, below 50 needs support. A blank record is shown as “no entries yet”, never as a low score.' })
        )
      }))
    ));
    tableHost = el('div', { class: 'mt-4' });
    tableHost.appendChild(studentTable(students));
    container.appendChild(tableHost);
  }

  function buildActions(data) {
    var sectionSelect = pages.select([{ value: '', label: 'All sections' }].concat(data.scope.sections.map(function (section) { return { value: section.id, label: section.name }; })), { value: state.sectionId });
    sectionSelect.id = 'dash-section';
    sectionSelect.addEventListener('change', function () { state.sectionId = sectionSelect.value; state.page = 0; load(); });

    var subjectSelect = pages.select([{ value: '', label: 'All subjects' }].concat(data.scope.subjects.map(function (subject) { return { value: subject.id, label: subject.name }; })), { value: state.subjectId });
    subjectSelect.id = 'dash-subject';
    subjectSelect.addEventListener('change', function () { state.subjectId = subjectSelect.value; state.page = 0; load(); });

    return el('div', { class: 'row row--wrap gap-2' },
      subjectSelect,
      sectionSelect,
      el('button', { class: 'btn', type: 'button', onClick: function () { load(); } }, el('span', { html: icon('refresh') }), 'Refresh'),
      el('button', { class: 'btn btn--soft', type: 'button', onClick: function () { EG.api.download('/api/export/at-risk.csv' + EG.api.query({ sectionId: state.sectionId, subjectId: state.subjectId })).catch(function (error) { ui.toast(error.message, 'error'); }); } }, el('span', { html: icon('download') }), 'At-risk CSV')
    );
  }

  function load() {
    var token = ++loadToken;
    tableToken += 1;
    tableHost = null;
    writeQuery();
    pages.mount({ title: 'Dashboard', subtitle: 'Loading your workspace…', content: ui.skeletonPage() });
    return Promise.all([
      EG.api.get('/api/analytics/dashboard', { sectionId: state.sectionId || undefined, subjectId: state.subjectId || undefined }),
      EG.api.get('/api/students', tableParams())
    ]).then(function (result) {
      if (token !== loadToken) return;
      render(result[0], result[1], EG.session);
    });
  }

  pages.guard(function () {
    readQuery();
    return load();
  });
})();
