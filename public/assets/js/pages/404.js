/* 404: the page does not exist. */
(function () {
  'use strict';

  var EG = window.EG;
  var ui = EG.ui;
  var el = ui.el;
  var icon = ui.icon;

  function render() {
    var root = document.getElementById('app');
    root.textContent = '';
    root.appendChild(el('main', { class: 'status-page' },
      el('div', { class: 'status-card' },
        el('a', { class: 'status-brand', href: '/dashboard' },
          el('span', { class: 'brand-mark', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>' }),
          el('span', { text: 'EduGuard' })
        ),
        el('div', { class: 'status-code', text: '404' }),
        el('h1', { text: 'We could not find that page' }),
        el('p', { text: 'The link may be old, or the address may have a typo. Try the dashboard, or press Ctrl K to search every page you can open.' }),
        el('div', { class: 'btn-row' },
          el('a', { class: 'btn btn--primary', href: '/dashboard' }, el('span', { html: icon('dashboard', 15) }), 'Go to dashboard'),
          el('button', { class: 'btn', type: 'button', onClick: function () { window.history.length > 1 ? window.history.back() : window.location.assign('/dashboard'); } }, 'Go back')
        )
      )
    ));
  }

  render();
})();
