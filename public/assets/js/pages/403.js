/* 403: signed in but outside the role boundary. */
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
        el('div', { class: 'status-code', text: '403' }),
        el('h1', { text: 'That page is outside your role' }),
        el('p', { text: 'Faculty accounts can open the workspace, their assigned classes and their own account. Department pages such as Faculty, Structure, Assignments, Data progress, Audit, Terms and Settings are limited to the Head of Department.' }),
        el('div', { class: 'btn-row' },
          el('a', { class: 'btn btn--primary', href: '/dashboard' }, el('span', { html: icon('dashboard', 15) }), 'Back to dashboard'),
          el('a', { class: 'btn', href: '/login' }, 'Switch account')
        ),
        el('p', { class: 'xs faint mt-4', text: 'If you believe your role is wrong, ask the HOD to check your account in Faculty.' })
      )
    ));
  }

  render();
})();
