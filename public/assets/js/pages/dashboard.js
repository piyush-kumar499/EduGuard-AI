/* Dashboard: the morning overview. */
(function () {
  'use strict';

  var EG = window.EG;
  var ui = EG.ui;
  var el = ui.el;
  var pages = EG.pages;
  var icon = ui.icon;

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

  function render(data, session) {
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
      el('div', { class: 'stack' }, attention, pages.card({
        title: 'How the score works',
        subtitle: 'Transparent, reviewable and never a decision on its own',
        body: el('div', { class: 'stack--sm small muted' },
          el('p', { text: 'Each student gets a 0–100 indicator built from attendance, coursework completion and weighted assessment marks. Falling trends apply a small penalty.' }),
          el('p', { text: 'Bands: 70+ on track, 50–69 watch closely, below 50 needs support. A blank record is shown as “no entries yet”, never as a low score.' })
        )
      }))
    ));
  }

  function buildActions(data, session) {
    var sectionSelect = pages.select([{ value: '', label: 'All sections' }].concat(data.scope.sections.map(function (section) { return { value: section.id, label: section.name }; })), { value: new URLSearchParams(window.location.search).get('sectionId') || '' });
    sectionSelect.id = 'dash-section';
    sectionSelect.addEventListener('change', function () {
      var params = new URLSearchParams(window.location.search);
      if (sectionSelect.value) params.set('sectionId', sectionSelect.value);
      else params.delete('sectionId');
      window.location.search = params.toString();
    });
    return el('div', { class: 'row row--wrap gap-2' },
      sectionSelect,
      el('button', { class: 'btn', type: 'button', onClick: function () { window.location.reload(); } }, el('span', { html: icon('refresh') }), 'Refresh'),
      el('button', { class: 'btn btn--soft', type: 'button', onClick: function () { EG.api.download('/api/export/at-risk.csv' + EG.api.query({ sectionId: new URLSearchParams(window.location.search).get('sectionId') })).catch(function (error) { ui.toast(error.message, 'error'); }); } }, el('span', { html: icon('download') }), 'At-risk CSV')
    );
  }

  pages.guard(function (session) {
    pages.mount({ title: 'Dashboard', subtitle: 'Loading your workspace…', content: ui.skeletonPage() });
    var sectionId = new URLSearchParams(window.location.search).get('sectionId');
    return EG.api.get('/api/analytics/dashboard', { sectionId: sectionId || undefined }).then(function (data) {
      render(data, session);
    });
  });
})();
