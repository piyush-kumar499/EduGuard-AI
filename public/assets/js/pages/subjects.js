/* Subjects: coverage, averages and a subject-level deep dive. */
(function () {
  'use strict';

  var EG = window.EG;
  var ui = EG.ui;
  var el = ui.el;
  var pages = EG.pages;
  var icon = ui.icon;

  var state = {
    data: null, cards: [], sectionId: '', q: '',
    selectedSubjectId: '', selectedSectionId: '', detail: null,
    cardsHost: null, kpiHost: null, detailHost: null, search: null, sectionSelect: null
  };

  function updateQuery() {
    var params = new URLSearchParams();
    if (state.sectionId) params.set('sectionId', state.sectionId);
    if (state.selectedSubjectId) params.set('subjectId', state.selectedSubjectId);
    if (state.selectedSectionId) params.set('section', state.selectedSectionId);
    var text = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (text ? '?' + text : ''));
  }

  function visibleCards() {
    var query = state.q.toLowerCase();
    return state.cards.filter(function (card) {
      if (state.sectionId && card.sectionId !== state.sectionId) return false;
      if (!query) return true;
      return (card.subjectName + ' ' + card.sectionName + ' ' + (card.owner || '')).toLowerCase().indexOf(query) !== -1;
    });
  }

  function mean(values) {
    var clean = values.filter(function (value) { return value !== null && value !== undefined && Number.isFinite(Number(value)); });
    return clean.length ? clean.reduce(function (total, value) { return total + Number(value); }, 0) / clean.length : null;
  }

  function renderKpis() {
    if (!state.kpiHost) return;
    var cards = visibleCards();
    var averages = cards.map(function (card) { return card.average; });
    var completeness = cards.map(function (card) { return card.completeness; });
    var atRisk = cards.reduce(function (total, card) { return total + (card.atRisk || 0); }, 0);
    var avg = mean(averages);
    var comp = mean(completeness);
    state.kpiHost.textContent = '';
    [
      { label: 'Subject groups', value: ui.num(cards.length), icon: 'book', foot: 'Subject and section pairs' },
      { label: 'Average marks', value: avg === null ? '-' : ui.pct(avg), icon: 'chart', foot: 'Across visible subject groups' },
      { label: 'Marks entered', value: comp === null ? '-' : ui.pct(comp), icon: 'marks', foot: 'Assessment coverage' },
      { label: 'Students needing support', value: ui.num(atRisk), icon: 'warning', tone: atRisk ? 'warning' : 'success', foot: 'Across visible groups' }
    ].forEach(function (kpi) {
      state.kpiHost.appendChild(pages.kpi({ label: kpi.label, value: kpi.value, icon: kpi.icon, tone: kpi.tone || 'brand', foot: kpi.foot }));
    });
  }

  function openSubject(card) {
    state.selectedSubjectId = card.subjectId;
    state.selectedSectionId = card.sectionId;
    updateQuery();
    loadDetail();
  }

  function cardNode(card) {
    var level = card.completeness >= 90 ? 'low' : card.completeness >= 50 ? 'medium' : 'high';
    return pages.card({
      className: 'card--interactive',
      body: el('div', { class: 'stack--sm' },
        el('div', { class: 'row row--between gap-2' },
          el('div', null,
            el('div', { class: 'row gap-2' },
              el('h2', { text: card.subjectName }),
              card.average !== null ? el('span', { class: 'pill pill--brand', text: ui.pct(card.average) }) : el('span', { class: 'pill pill--nodata', text: 'No marks' })
            ),
            el('p', { class: 'xs muted', text: card.sectionName + (card.owner ? ' - ' + card.owner : ' - unassigned') })
          ),
          el('span', { class: 'kpi__icon', html: icon('book', 15) })
        ),
        el('div', { class: 'row row--between gap-2 small' },
          el('span', { class: 'muted', text: card.students + ' students' }),
          el('span', { class: 'muted', text: card.assessments + ' ' + ui.plural(card.assessments, 'assessment') }),
          card.atRisk ? el('span', { class: 'pill pill--high', text: card.atRisk + ' need support' }) : el('span', { class: 'pill pill--low', text: 'No high flags' })
        ),
        el('div', null,
          el('div', { class: 'row row--between gap-2 xs faint' }, el('span', { text: 'Marks entered' }), el('strong', { text: ui.pct(card.completeness) })),
          pages.meter(card.completeness, level)
        ),
        el('div', { class: 'btn-row mt-2' },
          el('button', { class: 'btn btn--sm btn--primary', type: 'button', onClick: function () { openSubject(card); } }, el('span', { html: icon('analytics', 13) }), 'Analytics'),
          el('a', { class: 'btn btn--sm', href: '/marks' + EG.api.query({ subjectId: card.subjectId, sectionId: card.sectionId }) }, el('span', { html: icon('marks', 13) }), 'Marks'),
          el('a', { class: 'btn btn--sm btn--ghost', href: '/reports' + EG.api.query({ subjectId: card.subjectId, sectionId: card.sectionId }) }, el('span', { html: icon('reports', 13) }), 'Report')
        )
      )
    });
  }

  function renderCards() {
    if (!state.cardsHost) return;
    var cards = visibleCards();
    state.cardsHost.textContent = '';
    if (!cards.length) {
      state.cardsHost.appendChild(pages.empty('No subject groups match', 'Clear the search or choose another section. Subject groups appear once teaching assignments exist.', null, 'book'));
      return;
    }
    var grid = el('div', { class: 'grid grid--auto' });
    cards.forEach(function (card) { grid.appendChild(cardNode(card)); });
    state.cardsHost.appendChild(grid);
  }

  function renderDetail() {
    if (!state.detailHost) return;
    state.detailHost.textContent = '';
    if (!state.selectedSubjectId) return;
    if (!state.detail) {
      state.detailHost.appendChild(pages.card({ title: 'Subject analytics', body: ui.skeletonPage() }));
      return;
    }
    var data = state.detail;
    var stats = el('div', { class: 'stat-list' },
      statLine('Students with marks', ui.num(data.students)),
      statLine('Mean', data.mean === null ? '-' : ui.pct(data.mean)),
      statLine('Median', data.median === null ? '-' : ui.pct(data.median)),
      statLine('Pass rate (40+)', data.passRate === null ? '-' : ui.pct(data.passRate))
    );

    var trend = data.trend && data.trend.length
      ? EG.charts.line([{ name: data.subject.name, points: data.trend }], { height: 210, min: 0, max: 100, label: 'Average percentage by assessment date' })
      : pages.empty('No dated assessments', 'The trend appears once assessments have dates.', null, 'chart');

    var hardest = data.hardest && data.hardest.length
      ? el('div', { class: 'list-rows' }, data.hardest.map(function (row) {
        return el('div', { class: 'list-row' },
          el('div', { class: 'list-row__main' },
            el('div', { class: 'list-row__title', text: row.title }),
            el('div', { class: 'list-row__sub', text: row.typeName + (row.heldOn ? ' - ' + ui.date(row.heldOn) : '') + ' - ' + row.entered + ' entered' })
          ),
          el('span', { class: 'pill ' + (row.average < 40 ? 'pill--high' : row.average < 60 ? 'pill--medium' : 'pill--low'), text: ui.pct(row.average) })
        );
      }))
      : pages.empty('No assessments yet', 'Add an assessment and enter marks to see which papers were hardest.', null, 'marks');

    var comparisons = data.sectionComparison && data.sectionComparison.length
      ? el('div', { class: 'section-compare' }, data.sectionComparison.map(function (row) {
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
      : el('p', { class: 'xs faint', text: 'No section comparison is available.' });

    var histogram = EG.charts.columns((data.histogram || []).map(function (bucket, index) {
      return { label: index === 0 ? '0-9' : bucket.bucket, value: bucket.count, color: index < 4 ? 'var(--danger)' : index < 6 ? 'var(--warning)' : 'var(--success)' };
    }), { height: 190, label: 'Distribution of subject percentages' });

    state.detailHost.appendChild(pages.card({
      title: data.subject.name + (data.section ? ' - ' + data.section : ''),
      subtitle: 'Subject health for the current scope. Averages only use recorded marks.',
      actions: el('button', { class: 'btn btn--sm btn--ghost', type: 'button', onClick: function () {
        state.selectedSubjectId = '';
        state.selectedSectionId = '';
        state.detail = null;
        updateQuery();
        renderDetail();
      } }, el('span', { html: icon('x', 13) }), 'Close'),
      body: el('div', { class: 'stack' },
        el('div', { class: 'analytics-grid' },
          pages.card({ title: 'The basics', subtitle: 'Recorded values only', body: stats }),
          pages.card({ title: 'Score distribution', subtitle: 'Percentage bands', body: histogram })
        ),
        pages.card({
          title: 'Trend over time',
          subtitle: 'Mean percentage by assessment date',
          body: el('div', null,
            trend,
            data.trend && data.trend.length ? el('p', { class: 'xs faint mt-2', text: 'The line may be uneven when different assessments cover different topics.' }) : null
          )
        }),
        el('div', { class: 'analytics-grid' },
          pages.card({ title: 'Hardest assessments', subtitle: 'Lowest class averages first', body: hardest }),
          pages.card({ title: 'Section comparison', subtitle: 'Mean subject percentage', body: comparisons })
        )
      )
    }));
  }

  function statLine(label, value) {
    return el('div', { class: 'stat-line' }, el('span', { class: 'muted', text: label }), el('strong', { text: value }));
  }

  function loadDetail() {
    if (!state.selectedSubjectId) { renderDetail(); return Promise.resolve(); }
    state.detail = null;
    renderDetail();
    return EG.api.get('/api/analytics/subject/' + encodeURIComponent(state.selectedSubjectId), {
      sectionId: state.selectedSectionId || undefined
    }).then(function (data) {
      state.detail = data;
      renderDetail();
    }).catch(function (error) {
      if (error.status === 401) return;
      state.detail = null;
      if (state.detailHost) {
        state.detailHost.textContent = '';
        state.detailHost.appendChild(ui.errorState(error, loadDetail));
      }
      ui.toast(error.message, 'error');
    });
  }

  function exportCsv() {
    var rows = visibleCards().map(function (card) {
      return {
        subject: card.subjectName, section: card.sectionName, owner: card.owner || 'Unassigned',
        students: card.students, assessments: card.assessments,
        completeness: card.completeness, average: card.average, atRisk: card.atRisk
      };
    });
    pages.download('eduguard-subjects-' + new Date().toISOString().slice(0, 10) + '.csv', rows, [
      { key: 'subject', label: 'Subject' }, { key: 'section', label: 'Section' }, { key: 'owner', label: 'Lead faculty' },
      { key: 'students', label: 'Students' }, { key: 'assessments', label: 'Assessments' },
      { key: 'completeness', label: 'Marks entered %' }, { key: 'average', label: 'Average %' }, { key: 'atRisk', label: 'Needing support' }
    ]);
  }

  pages.guard(function () {
    var params = new URLSearchParams(window.location.search);
    state.sectionId = params.get('sectionId') || '';
    state.selectedSubjectId = params.get('subjectId') || '';
    state.selectedSectionId = params.get('section') || '';
    pages.mount({ title: 'Subjects', subtitle: 'Loading subject health...', content: ui.skeletonPage() });

    state.search = el('input', { class: 'input input--search', type: 'search', placeholder: 'Search subject, section or faculty...', 'aria-label': 'Search subjects' });
    state.search.addEventListener('input', ui.debounce(function () {
      state.q = state.search.value.trim();
      renderCards();
      renderKpis();
    }, 200));

    state.sectionSelect = pages.select([{ value: '', label: 'All sections' }].concat(pages.sections().map(function (section) {
      return { value: section.id, label: section.name };
    })), { value: state.sectionId });
    state.sectionSelect.addEventListener('change', function () {
      state.sectionId = state.sectionSelect.value;
      updateQuery();
      renderCards();
      renderKpis();
    });

    state.kpiHost = el('div', { class: 'kpi-grid' });
    state.detailHost = el('div', { class: 'stack' });
    state.cardsHost = el('div');

    pages.mount({
      title: 'Subjects',
      subtitle: 'Subject health, coverage and the classes that need attention next.',
      actions: el('div', { class: 'btn-row' },
        el('button', { class: 'btn', type: 'button', onClick: exportCsv }, el('span', { html: icon('download') }), 'CSV'),
        el('a', { class: 'btn btn--soft', href: '/heatmap' }, el('span', { html: icon('heatmap') }), 'Open heatmap')
      ),
      content: el('div', { class: 'stack' },
        pages.card({ body: el('div', { class: 'row row--wrap gap-3' },
          el('div', { class: 'field grow', style: { minWidth: '220px' } }, el('label', { text: 'Search' }), state.search),
          el('div', { class: 'field', style: { minWidth: '170px' } }, el('label', { text: 'Section' }), state.sectionSelect)
        ) }),
        state.kpiHost,
        state.detailHost,
        pages.card({ title: 'Subject groups', subtitle: 'Average marks, coverage and students needing support', flush: true, body: state.cardsHost })
      )
    });

    return EG.api.get('/api/analytics/subjects').then(function (data) {
      state.data = data;
      state.cards = data.cards || [];
      renderKpis();
      renderCards();
      return loadDetail();
    }).catch(function (error) {
      if (error.status === 401) return;
      if (state.cardsHost) {
        state.cardsHost.textContent = '';
        state.cardsHost.appendChild(ui.errorState(error, function () { window.location.reload(); }));
      }
      ui.toast(error.message, 'error');
    });
  });
})();
