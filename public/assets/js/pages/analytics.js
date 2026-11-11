/* Analytics: support distribution, fairness and subject deep dives. */
(function () {
  'use strict';

  var EG = window.EG;
  var ui = EG.ui;
  var el = ui.el;
  var pages = EG.pages;
  var icon = ui.icon;

  var state = {
    dashboard: null, fairness: null,
    subjectId: '', sectionId: '', detail: null,
    detailHost: null, subjectSelect: null, sectionSelect: null
  };

  function statLine(label, value) {
    return el('div', { class: 'stat-line' }, el('span', { class: 'muted', text: label }), el('strong', { text: value }));
  }

  function distributionCard(data) {
    var counts = data.distribution || {};
    var segments = [
      { value: counts.high || 0, label: 'Needs support', color: 'var(--danger)' },
      { value: counts.medium || 0, label: 'Watch closely', color: 'var(--warning)' },
      { value: counts.low || 0, label: 'On track', color: 'var(--success)' },
      { value: counts.noData || 0, label: 'No data', color: 'var(--faint)' }
    ];
    return pages.card({
      title: 'Support distribution',
      subtitle: data.summary.students + ' students in the current view',
      body: el('div', { class: 'dist-wrap' },
        EG.charts.donut(segments, { centerValue: data.summary.students, centerLabel: 'students', size: 138, thickness: 14 }),
        el('div', { class: 'dist-legend' }, segments.map(function (segment) {
          return el('div', { class: 'dist-legend__row' },
            el('i', { class: 'dot', style: { background: segment.color } }),
            el('span', { text: segment.label }),
            el('strong', { text: ui.num(segment.value) })
          );
        }))
      )
    });
  }

  function trendCard(data) {
    var series = (data.trend.series || []).map(function (row) { return { name: row.section, points: row.points }; });
    return pages.card({
      title: 'Assessment trend',
      subtitle: 'Mean assessment percentage by section',
      actions: el('span', { class: 'pill ' + (data.trend.delta >= 0 ? 'pill--low' : 'pill--high') },
        el('span', { html: icon(data.trend.delta >= 0 ? 'trendUp' : 'trendDown', 12) }),
        (data.trend.delta >= 0 ? '+' : '') + ui.num(data.trend.delta) + ' pts'
      ),
      body: series.length
        ? el('div', null,
          EG.charts.line(series, { height: 250, label: 'Average assessment percentage by section' }),
          EG.charts.legend(series.map(function (item, index) { return { name: item.name, color: EG.charts.palette[index % EG.charts.palette.length] }; }))
        )
        : pages.empty('No assessment trend yet', 'Enter dated assessments to see how sections are moving.', null, 'chart')
    });
  }

  function fairnessCard(fairness) {
    var rows = fairness.rows || [];
    return pages.card({
      title: 'Fairness check',
      subtitle: 'Compare how often students are flagged in each section',
      body: el('div', { class: 'stack' },
        fairness.warning
          ? el('div', { class: 'fairness-banner' },
            el('span', { html: icon('warning', 18) }),
            el('div', null, el('strong', { text: 'The flagged share differs by ' + ui.num(fairness.gap) + ' points.' }), ' ', fairness.note)
          )
          : el('div', { class: 'fairness-banner' },
            el('span', { html: icon('check', 18) }),
            el('div', null, el('strong', { text: 'Sections are broadly comparable.' }), ' The gap is ' + ui.num(fairness.gap) + ' points. ', fairness.note)
          ),
        rows.length
          ? el('div', { class: 'section-compare' }, rows.map(function (row) {
            var level = row.share > 25 ? 'high' : row.share > 10 ? 'medium' : 'low';
            return el('div', { class: 'section-compare__row' },
              el('span', { class: 'section-compare__badge', text: String(row.section).slice(0, 2).toUpperCase() }),
              el('div', null,
                el('div', { class: 'row row--between gap-2' },
                  el('span', { text: row.section }),
                  el('span', { class: 'xs muted', text: row.flagged + ' of ' + row.students + ' flagged' })
                ),
                pages.meter(row.share, level)
              ),
              el('span', { class: 'num strong', text: ui.pct(row.share) })
            );
          }))
          : el('p', { class: 'xs faint', text: 'No section data is available yet.' }),
        el('p', { class: 'xs faint', text: 'A gap is a prompt to review context, not proof of bias.' })
      )
    });
  }

  function reasonsCard(data) {
    if (!data.reasons.length) return pages.empty('No recurring reason yet', 'Reasons appear once assessments and attendance are recorded.', null, 'activity');
    var max = Math.max.apply(null, data.reasons.map(function (row) { return row.count; }));
    return el('div', { class: 'bars' }, data.reasons.map(function (row) {
      return el('div', { class: 'bar-row' },
        el('span', { class: 'bar-row__label', text: row.label }),
        el('span', { class: 'bar-row__track' }, el('span', { class: 'bar-row__fill', style: { width: (row.count / Math.max(1, max)) * 100 + '%' } })),
        el('span', { class: 'bar-row__value', text: ui.num(row.count) })
      );
    }));
  }

  function warningsCard(data) {
    return data.warnings.length
      ? el('div', { class: 'warning-list' }, data.warnings.map(function (row) {
        return el('div', { class: 'warning-item' },
          el('span', { class: 'warning-item__icon', html: icon('warning', 16) }),
          el('div', { class: 'grow' },
            el('p', null, el('a', { href: pages.studentHref(row.id), text: row.name }), ' - ' + row.reason),
            el('div', { class: 'xs faint', text: row.roll + ' - ' + row.sectionName })
          )
        );
      }))
      : pages.empty('No sudden changes', 'No recent attendance or marks drops were detected.', null, 'activity');
  }

  function renderChrome(data, fairness) {
    var summary = data.summary;
    var active = summary.students - summary.noData;
    var flagged = summary.high + summary.medium;
    var flaggedShare = active ? Math.round((flagged / active) * 100) : 0;
    var kpis = [
      { label: 'Students in view', value: ui.num(summary.students), icon: 'students', foot: summary.noData + ' with no entries' },
      { label: 'Average score', value: summary.averageScore === null ? '-' : ui.num(summary.averageScore), icon: 'analytics', foot: 'Weighted support indicator' },
      { label: 'Flagged share', value: ui.pct(flaggedShare), icon: 'warning', tone: flaggedShare > 25 ? 'warning' : 'brand', foot: flagged + ' need a check-in' },
      { label: 'Section gap', value: ui.num(fairness.gap) + ' pts', icon: 'activity', tone: fairness.warning ? 'warning' : 'success', foot: fairness.warning ? 'Review the fairness check' : 'Sections are comparable' }
    ];

    var subjectOptions = pages.subjects().map(function (subject) { return { value: subject.id, label: subject.name }; });
    if (!subjectOptions.length) {
      state.detailHost.appendChild(pages.empty('No subjects in scope', 'Analytics needs at least one assigned subject.', null, 'book'));
    } else {
      if (!state.subjectId) state.subjectId = subjectOptions[0].value;
      state.subjectSelect = pages.select(subjectOptions, { value: state.subjectId });
      state.sectionSelect = pages.select([{ value: '', label: 'All sections' }].concat(pages.sections().map(function (section) {
        return { value: section.id, label: section.name };
      })), { value: state.sectionId });
      state.subjectSelect.addEventListener('change', function () { state.subjectId = state.subjectSelect.value; loadDetail(); });
      state.sectionSelect.addEventListener('change', function () { state.sectionId = state.sectionSelect.value; loadDetail(); });
      state.detailHost.appendChild(pages.card({
        title: 'Subject deep dive',
        subtitle: 'Choose a subject and section to inspect coverage and difficulty.',
        body: el('div', { class: 'stack' },
          el('div', { class: 'row row--wrap gap-3' },
            el('div', { class: 'field', style: { minWidth: '190px' } }, el('label', { text: 'Subject' }), state.subjectSelect),
            el('div', { class: 'field', style: { minWidth: '170px' } }, el('label', { text: 'Section' }), state.sectionSelect)
          ),
          el('div', { id: 'analytics-subject-detail' })
        )
      }));
      loadDetail();
    }

    var grid = el('div', { class: 'analytics-grid' },
      el('div', { class: 'span-2' }, trendCard(data)),
      fairnessCard(fairness),
      distributionCard(data),
      pages.card({ title: 'Why students are flagged', subtitle: 'Top contributing factors in the current view', body: reasonsCard(data) }),
      pages.card({ title: 'Early warnings', subtitle: 'Changes worth a conversation this week', body: warningsCard(data) }),
      el('div', { class: 'span-2' }, pages.card({ title: 'Sections at a glance', subtitle: 'Attendance, coursework and flagged share', flush: true, body: sectionTable(data) }))
    );

    pages.mount({
      title: 'Analytics',
      subtitle: data.term.name + ' - patterns that deserve a closer look, never automatic decisions.',
      actions: el('div', { class: 'btn-row' },
        el('button', { class: 'btn', type: 'button', onClick: function () { EG.api.download('/api/export/at-risk.csv').catch(function (error) { ui.toast(error.message, 'error'); }); } }, el('span', { html: icon('download') }), 'At-risk CSV'),
        el('a', { class: 'btn btn--soft', href: '/heatmap' }, el('span', { html: icon('heatmap') }), 'Heatmap')
      ),
      content: el('div', { class: 'stack' },
        el('div', { class: 'kpi-grid' }, kpis.map(function (kpi) { return pages.kpi(kpi); })),
        state.detailHost,
        grid
      )
    });
  }

  function sectionTable(data) {
    if (!data.sections.length) return pages.empty('No sections in scope', 'Sections appear once students and teaching assignments exist.', null, 'structure');
    var body = el('tbody');
    data.sections.forEach(function (row) {
      var level = row.flaggedShare > 25 ? 'high' : row.flaggedShare > 10 ? 'medium' : 'low';
      body.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'person__name', text: row.name }), el('div', { class: 'person__sub', text: [row.branch, row.semester].filter(Boolean).join(' - ') })),
        el('td', { class: 'num', text: ui.num(row.students) }),
        el('td', null, el('div', { class: 'row gap-2' }, el('span', { class: 'pill pill--' + level, text: ui.pct(row.flaggedShare) }), el('div', { class: 'grow' }, pages.meter(row.flaggedShare, level)))),
        el('td', { class: 'num', text: ui.pct(row.attendance) }),
        el('td', { class: 'num', text: ui.pct(row.coursework) }),
        el('td', { class: 'num', text: ui.pct(row.marks) })
      ));
    });
    return el('div', { class: 'table-wrap' },
      el('table', { class: 'table table--compact' },
        el('thead', null, el('tr', null,
          el('th', { text: 'Section' }), el('th', { class: 'num', text: 'Students' }), el('th', { text: 'Flagged' }),
          el('th', { class: 'num', text: 'Attendance' }), el('th', { class: 'num', text: 'Coursework' }), el('th', { class: 'num', text: 'Marks' })
        )),
        body
      )
    );
  }

  function renderDetail() {
    var host = document.getElementById('analytics-subject-detail');
    if (!host) return;
    host.textContent = '';
    if (!state.detail) {
      host.appendChild(el('div', { class: 'page-loader' }, el('div', { class: 'skeleton skeleton--card' })));
      return;
    }
    var data = state.detail;
    var hardest = data.hardest.length
      ? el('div', { class: 'list-rows' }, data.hardest.map(function (row) {
        return el('div', { class: 'list-row' },
          el('div', { class: 'list-row__main' },
            el('div', { class: 'list-row__title', text: row.title }),
            el('div', { class: 'list-row__sub', text: row.typeName + (row.heldOn ? ' - ' + ui.date(row.heldOn) : '') + ' - ' + row.entered + ' entered' })
          ),
          el('span', { class: 'pill ' + (row.average < 40 ? 'pill--high' : row.average < 60 ? 'pill--medium' : 'pill--low'), text: ui.pct(row.average) })
        );
      }))
      : el('p', { class: 'xs faint', text: 'No assessments recorded for this selection yet.' });

    var trend = data.trend.length
      ? EG.charts.line([{ name: data.subject.name, points: data.trend }], { height: 210, min: 0, max: 100, label: 'Average percentage by assessment date' })
      : pages.empty('No dated assessments', 'The trend appears once assessments have dates.', null, 'chart');

    var histogram = EG.charts.columns((data.histogram || []).map(function (bucket, index) {
      return { label: bucket.bucket, value: bucket.count, color: index < 4 ? 'var(--danger)' : index < 6 ? 'var(--warning)' : 'var(--success)' };
    }), { height: 190, label: 'Distribution of subject percentages' });

    host.appendChild(el('div', { class: 'stack' },
      el('div', { class: 'analytics-grid' },
        pages.card({ body: el('div', { class: 'stat-list' },
          statLine('Students with marks', ui.num(data.students)),
          statLine('Mean', data.mean === null ? '-' : ui.pct(data.mean)),
          statLine('Median', data.median === null ? '-' : ui.pct(data.median)),
          statLine('Pass rate (40+)', data.passRate === null ? '-' : ui.pct(data.passRate))
        ) }),
        pages.card({ title: 'Distribution', subtitle: 'Percentage bands', body: histogram })
      ),
      el('div', { class: 'split-2' },
        pages.card({ title: 'Trend', subtitle: 'Mean percentage by assessment date', body: trend }),
        pages.card({ title: 'Hardest assessments', subtitle: 'Lowest class averages first', body: hardest })
      ),
      pages.card({
        title: 'Section comparison',
        subtitle: 'Mean subject percentage by section',
        body: el('div', { class: 'section-compare' }, (data.sectionComparison || []).map(function (row) {
          return el('div', { class: 'section-compare__row' },
            el('span', { class: 'section-compare__badge', text: String(row.section).slice(0, 2).toUpperCase() }),
            el('div', null,
              el('div', { class: 'row row--between gap-2' },
                el('span', { text: row.section }),
                el('span', { class: 'xs muted', text: row.students + ' students' + (row.atRisk ? ' - ' + row.atRisk + ' flagged' : '') })
              ),
              pages.meter(row.mean === null ? 0 : row.mean, row.mean === null ? null : row.mean >= 70 ? 'low' : row.mean >= 50 ? 'medium' : 'high')
            ),
            el('span', { class: 'num strong', text: row.mean === null ? '-' : ui.num(row.mean) })
          );
        }))
      })
    ));
  }

  function loadDetail() {
    if (!state.subjectId) return Promise.resolve();
    state.detail = null;
    renderDetail();
    return EG.api.get('/api/analytics/subject/' + encodeURIComponent(state.subjectId), {
      sectionId: state.sectionId || undefined
    }).then(function (data) {
      state.detail = data;
      renderDetail();
    }).catch(function (error) {
      if (error.status === 401) return;
      state.detail = null;
      var host = document.getElementById('analytics-subject-detail');
      if (host) {
        host.textContent = '';
        host.appendChild(ui.errorState(error, loadDetail));
      }
      ui.toast(error.message, 'error');
    });
  }

  pages.guard(function () {
    pages.mount({ title: 'Analytics', subtitle: 'Loading analytics...', content: ui.skeletonPage() });
    state.detailHost = el('div', { class: 'stack' });
    return Promise.all([
      EG.api.get('/api/analytics/dashboard'),
      EG.api.get('/api/analytics/fairness')
    ]).then(function (results) {
      state.dashboard = results[0];
      state.fairness = results[1];
      renderChrome(state.dashboard, state.fairness);
    }).catch(function (error) {
      if (error.status === 401) return;
      pages.mount({
        title: 'Analytics',
        subtitle: 'Analytics could not be loaded',
        content: ui.errorState(error, function () { window.location.reload(); })
      });
      ui.toast(error.message, 'error');
    });
  });
})();
