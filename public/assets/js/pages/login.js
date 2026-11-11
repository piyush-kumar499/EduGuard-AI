/* Sign-in experience. */
(function () {
  'use strict';

  var EG = window.EG;
  var ui = EG.ui;
  var el = ui.el;
  var icon = ui.icon;

  function safeNext() {
    var next = new URLSearchParams(window.location.search).get('next');
    if (!next || next.charAt(0) !== '/' || next.charAt(1) === '/' || next.charAt(1) === '\\') return '/dashboard';
    return next;
  }

  function brand() {
    return el('div', { class: 'auth__brand' },
      el('span', { class: 'brand-mark', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>' }),
      el('span', { class: 'brand-text' },
        el('span', { class: 'brand-name', text: 'EduGuard' }),
        el('span', { class: 'brand-meta', text: 'Student support workspace' })
      )
    );
  }

  function render() {
    var form = el('form', { class: 'stack', novalidate: true });
    var email = el('input', { class: 'input', type: 'email', name: 'email', id: 'login-email', autocomplete: 'username', placeholder: 'you@school.edu', required: true, autofocus: true });
    var password = el('input', { class: 'input', type: 'password', name: 'password', id: 'login-password', autocomplete: 'current-password', placeholder: 'Your password', required: true });
    var reveal = el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Show password', title: 'Show password', onClick: function () {
      var showing = password.type === 'text';
      password.type = showing ? 'password' : 'text';
      reveal.innerHTML = icon(showing ? 'eye' : 'eyeOff');
      reveal.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      password.focus();
    } }, el('span', { html: icon('eye') }));
    var errorBox = el('div', { class: 'error-box', hidden: true });
    var submit = el('button', { class: 'btn btn--primary btn--lg btn--block', type: 'submit' }, el('span', { html: icon('arrowRight') }), 'Sign in');
    var remember = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: true }),
      el('span', { text: 'Keep me signed in on this device' })
    );

    form.appendChild(el('div', { class: 'field' },
      el('label', { for: 'login-email', text: 'School email' }),
      email
    ));
    form.appendChild(el('div', { class: 'field' },
      el('label', { for: 'login-password', text: 'Password' }),
      el('div', { class: 'row gap-2' }, password, reveal)
    ));
    form.appendChild(el('div', { class: 'row row--between gap-3' }, remember));
    form.appendChild(errorBox);
    form.appendChild(submit);
    form.appendChild(el('p', { class: 'auth__legal', text: 'Access is limited to staff invited by the Head of Department. Sessions are logged.' }));

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      errorBox.hidden = true;
      submit.disabled = true;
      submit.innerHTML = '<span class="spinner" aria-hidden="true"></span> Signing in…';
      EG.api.post('/api/auth/login', { email: email.value.trim(), password: password.value }, { skipAuthRedirect: true })
        .then(function () { window.location.replace(safeNext()); })
        .catch(function (error) {
          errorBox.hidden = false;
          errorBox.innerHTML = icon('warning', 17) + '<div>' + ui.esc(error.message) + '</div>';
          submit.disabled = false;
          submit.innerHTML = icon('arrowRight') + ' Sign in';
          password.focus();
          password.select();
        });
    });

    var root = document.getElementById('app');
    root.textContent = '';
    root.appendChild(el('div', { class: 'auth' },
      el('aside', { class: 'auth__aside' },
        brand(),
        el('div', { class: 'auth__pitch' },
          el('span', { class: 'eyebrow', style: { color: '#5eead4' }, text: 'Early support, not labels' }),
          el('h1', { text: 'See the whole student. Act while it still helps.' }),
          el('p', { text: 'EduGuard brings attendance, coursework and assessment signals together so teachers can start a calm, specific conversation early.' }),
          el('div', { class: 'auth__points' },
            [['shield', 'Private by default — every view is filtered by your teaching scope.'],
              ['target', 'Explainable scores that show exactly which signals need attention.'],
              ['assistant', 'Optional AI drafts, always reviewed by a teacher before use.']].map(function (item) {
              return el('div', { class: 'auth__point' }, el('span', { html: icon(item[0], 18) }), el('span', { text: item[1] }));
            })
          )
        ),
        el('div', { class: 'auth__foot', text: '© ' + new Date().getFullYear() + ' EduGuard · Built for small teaching teams' })
      ),
      el('main', { class: 'auth__main' },
        el('div', { class: 'auth__form' },
          el('div', { class: 'auth__mobile-brand' }, brand()),
          el('h2', { text: 'Welcome back' }),
          el('p', { text: 'Sign in to review your students and record this term’s work.' }),
          el('div', { class: 'auth__card' }, form),
          el('div', { class: 'auth__note' },
            el('span', { html: icon('info', 17) }),
            el('span', { text: 'Use the account your HOD created. Forgotten passwords are reset from the Faculty page.' })
          )
        )
      )
    ));
    document.body.classList.remove('is-booting');
    setTimeout(function () { email.focus(); }, 50);
  }

  function init() {
    ui.initTheme();
    render();
    EG.api.get('/api/auth/me', null, { skipAuthRedirect: true }).then(function () {
      window.location.replace(safeNext());
    }).catch(function () { /* no active session */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
