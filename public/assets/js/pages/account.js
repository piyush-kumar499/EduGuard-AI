/* Account: profile, password, appearance and session details. */
(function () {
  'use strict';

  var EG = window.EG;
  var ui = EG.ui;
  var el = ui.el;
  var pages = EG.pages;
  var icon = ui.icon;

  var state = {
    session: null,
    force: false,
    banner: null,
    passwordCard: null,
    current: null,
    next: null,
    confirm: null,
    submit: null,
    criteria: null
  };

  function passwordChecks(value) {
    return {
      length: String(value || '').length >= 10,
      letter: /[A-Za-z]/.test(String(value || '')),
      number: /[0-9]/.test(String(value || ''))
    };
  }

  function renderCriteria() {
    if (!state.criteria) return;
    var checks = passwordChecks(state.next ? state.next.value : '');
    state.criteria.textContent = '';
    [
      ['At least 10 characters', checks.length],
      ['Contains a letter', checks.letter],
      ['Contains a number', checks.number]
    ].forEach(function (row) {
      state.criteria.appendChild(el('div', { class: 'row gap-2 xs ' + (row[1] ? 'muted' : 'faint') },
        el('span', { html: icon(row[1] ? 'check' : 'minus', 13), style: { color: row[1] ? 'var(--success)' : 'var(--faint)' } }),
        el('span', { text: row[0] })
      ));
    });
  }

  function themeCard() {
    var options = [
      { key: 'light', label: 'Light', icon: 'sun' },
      { key: 'dark', label: 'Dark', icon: 'moon' },
      { key: 'system', label: 'System', icon: 'monitor' }
    ];
    var buttons = [];
    var current = ui.theme();
    options.forEach(function (option) {
      var active = current === option.key;
      var button = el('button', {
        class: 'theme-option' + (active ? ' is-active' : ''), type: 'button',
        'aria-pressed': active ? 'true' : 'false',
        onClick: function () {
          ui.setTheme(option.key);
          buttons.forEach(function (node) {
            node.button.classList.remove('is-active');
            node.button.setAttribute('aria-pressed', 'false');
          });
          button.classList.add('is-active');
          button.setAttribute('aria-pressed', 'true');
        }
      },
        el('span', { class: 'theme-swatch theme-swatch--' + option.key }),
        el('span', { class: 'row gap-2 justify-between' },
          el('span', { class: 'small strong', text: option.label }),
          el('span', { class: 'faint', html: icon(option.icon, 14) })
        )
      );
      buttons.push({ button: button });
    });
    document.addEventListener('eg:theme', function () {
      var choice = ui.theme();
      buttons.forEach(function (item, index) {
        var on = options[index].key === choice;
        item.button.classList.toggle('is-active', on);
        item.button.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    });
    return pages.card({
      title: 'Appearance',
      subtitle: 'Your choice is stored on this device',
      body: el('div', { class: 'stack' },
        el('div', { class: 'theme-options' }, buttons.map(function (item) { return item.button; })),
        el('p', { class: 'xs faint', text: 'System follows your operating system setting. Print reports always use the light palette.' })
      )
    });
  }

  function scopeText(scope) {
    if (!scope) return 'No active teaching scope.';
    if (scope.role === 'HOD') {
      return scope.subjects.length + ' ' + ui.plural(scope.subjects.length, 'subject') + ' and ' +
        scope.sections.length + ' ' + ui.plural(scope.sections.length, 'section') + ' across the department.';
    }
    if (!scope.assignments.length) return 'No teaching assignments for the active term yet.';
    return scope.assignments.length + ' teaching ' + ui.plural(scope.assignments.length, 'assignment') + ' in the active term.';
  }

  function profileCard(session) {
    var user = session.user;
    return pages.card({
      body: el('div', { class: 'profile-card' },
        el('span', { class: 'avatar avatar--lg avatar--brand', text: ui.initials(user.name) }),
        el('div', { class: 'profile-card__meta' },
          el('div', { class: 'profile-card__name', text: user.name }),
          el('div', { class: 'small muted', text: user.email }),
          el('div', { class: 'row gap-2 mt-2' },
            el('span', { class: 'pill pill--brand', text: user.role === 'HOD' ? 'Head of department' : 'Faculty' }),
            user.must_change_password ? el('span', { class: 'pill pill--medium', text: 'Password change required' }) : el('span', { class: 'pill pill--low', text: 'Password up to date' })
          )
        )
      )
    });
  }

  function detailsCard(session) {
    var user = session.user;
    var term = session.term;
    return pages.card({
      title: 'Workspace details',
      subtitle: 'This account and the term it can see',
      body: el('dl', { class: 'dl' },
        el('div', { class: 'dl__row' }, el('dt', { text: 'Role' }), el('dd', { text: user.role === 'HOD' ? 'HOD' : 'Faculty' })),
        el('div', { class: 'dl__row' }, el('dt', { text: 'Active term' }), el('dd', { text: term ? term.name : 'No term configured' })),
        term && term.starts_on ? el('div', { class: 'dl__row' }, el('dt', { text: 'Term dates' }), el('dd', { text: ui.date(term.starts_on) + ' - ' + ui.date(term.ends_on) })) : null,
        el('div', { class: 'dl__row' }, el('dt', { text: 'Teaching scope' }), el('dd', { text: scopeText(session.scope) })),
        el('div', { class: 'dl__row' }, el('dt', { text: 'Last sign-in' }), el('dd', { text: user.last_login_at ? ui.dateTime(user.last_login_at) : 'First session' }))
      )
    });
  }

  function scopeCard(session) {
    var scope = session.scope || { assignments: [], subjects: [], sections: [] };
    var body;
    if (scope.role === 'HOD') {
      body = el('div', { class: 'stack--sm' },
        el('p', { class: 'small muted', text: 'As HOD you can see every active subject and section, manage faculty, assignments, terms and workspace settings.' }),
        el('div', { class: 'chips' }, scope.subjects.map(function (subject) {
          return el('span', { class: 'tag', text: subject.name });
        })),
        el('div', { class: 'chips' }, scope.sections.map(function (section) {
          return el('span', { class: 'tag', text: section.name });
        }))
      );
    } else if (!scope.assignments.length) {
      body = el('div', { class: 'info-box' }, 'No teaching assignments are configured for this term. Ask the HOD to assign a subject and section.');
    } else {
      body = el('div', { class: 'list-rows' }, scope.assignments.map(function (row) {
        return el('div', { class: 'list-row' },
          el('div', { class: 'list-row__main' },
            el('div', { class: 'list-row__title', text: row.subjectName }),
            el('div', { class: 'list-row__sub', text: 'Section ' + row.sectionName + (row.branch ? ' - ' + row.branch : '') })
          ),
          el('span', { class: 'pill pill--outline', text: 'Term ' + (session.term ? session.term.name.split(' ')[0] : 'active') })
        );
      }));
    }
    return pages.card({
      title: 'Your teaching scope',
      subtitle: 'Server-enforced visibility',
      body: el('div', { class: 'stack' },
        body,
        el('p', { class: 'xs faint', text: 'Every request is checked on the server. A link or a changed URL cannot widen this scope.' })
      )
    });
  }

  function markPasswordChanged() {
    if (!state.session || !state.session.user) return;
    state.session.user.must_change_password = false;
    EG.session.user.must_change_password = false;
    state.force = false;
    if (state.banner) state.banner.remove();
    var url = new URL(window.location.href);
    url.searchParams.delete('force');
    window.history.replaceState({}, '', url.toString());
  }

  pages.guard(function (session) {
    state.session = session;
    var params = new URLSearchParams(window.location.search);
    state.force = params.get('force') === '1' || Boolean(session.user.must_change_password);

    if (state.force) {
      state.banner = el('div', { class: 'warning-box' },
        el('span', { html: icon('shield', 18) }),
        el('div', null,
          el('strong', { text: 'Choose a new password before continuing.' }),
          el('div', { class: 'small', text: 'Temporary passwords are shown once and must be changed. Your other sessions have already been signed out.' })
        )
      );
    }

    state.current = el('input', { class: 'input', type: 'password', autocomplete: 'current-password', id: 'current-password', placeholder: 'Current password' });
    state.next = el('input', { class: 'input', type: 'password', autocomplete: 'new-password', id: 'new-password', placeholder: 'At least 10 characters' });
    state.confirm = el('input', { class: 'input', type: 'password', autocomplete: 'new-password', id: 'confirm-password', placeholder: 'Repeat the new password' });
    state.criteria = el('div', { class: 'stack--sm', 'aria-live': 'polite' });
    state.next.addEventListener('input', renderCriteria);
    renderCriteria();

    var errorBox = el('div', { class: 'error-box', hidden: true });
    state.submit = el('button', { class: 'btn btn--primary', type: 'submit' },
      el('span', { html: icon('key', 15) }), 'Update password');

    var form = el('form', { class: 'stack', novalidate: true },
      el('div', { class: 'field' }, el('label', { for: 'current-password', text: 'Current password' }), state.current),
      el('div', { class: 'field' }, el('label', { for: 'new-password', text: 'New password' }), state.next, state.criteria),
      el('div', { class: 'field' }, el('label', { for: 'confirm-password', text: 'Confirm new password' }), state.confirm),
      errorBox,
      el('div', { class: 'btn-row' }, state.submit)
    );

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      errorBox.hidden = true;
      form.querySelectorAll('.field__error[data-generated]').forEach(function (node) { node.remove(); });
      var checks = passwordChecks(state.next.value);
      if (!state.current.value) {
        errorBox.hidden = false;
        errorBox.textContent = 'Enter your current password.';
        return;
      }
      if (!checks.length || !checks.letter || !checks.number) {
        errorBox.hidden = false;
        errorBox.textContent = 'The new password needs at least 10 characters, including a letter and a number.';
        return;
      }
      if (state.next.value !== state.confirm.value) {
        errorBox.hidden = false;
        errorBox.textContent = 'The two new passwords do not match.';
        return;
      }
      pages.busy(state.submit, EG.api.post('/api/auth/change-password', {
        current_password: state.current.value,
        new_password: state.next.value
      }).then(function () {
        state.current.value = '';
        state.next.value = '';
        state.confirm.value = '';
        renderCriteria();
        markPasswordChanged();
        ui.toast('Your password was updated. Other sessions have been signed out.', 'success');
        state.passwordCard.classList.add('card--success');
      }).catch(function (error) {
        if (error.status === 401) return;
        errorBox.hidden = false;
        errorBox.textContent = error.message;
        ui.applyFieldErrors(form, error);
      }));
    });

    state.passwordCard = pages.card({
      title: 'Password & security',
      subtitle: 'Keep your account private',
      className: state.force ? 'card--warning' : null,
      body: el('div', { class: 'stack' }, form,
        el('p', { class: 'xs faint', text: 'Changing your password signs out every other device but keeps this session active.' })
      )
    });

    var signOutButton = el('button', { class: 'btn btn--danger-ghost', type: 'button', onClick: function () { EG.shell.signOut(); } },
      el('span', { html: icon('logout', 15) }), 'Sign out of this device');
    var securityCard = pages.card({
      title: 'Session',
      subtitle: 'Signed in with a secure cookie',
      body: el('div', { class: 'stack' },
        el('p', { class: 'small muted', text: 'Sessions are signed, HttpOnly and expire automatically. Deactivating an account ends every session immediately.' }),
        el('div', { class: 'btn-row' }, signOutButton)
      )
    });

    pages.mount({
      title: 'Account & security',
      subtitle: 'Your profile, password, appearance and teaching scope.',
      content: el('div', { class: 'stack' },
        state.banner,
        el('div', { class: 'account-grid' },
          el('div', { class: 'stack' }, profileCard(session), state.passwordCard, scopeCard(session)),
          el('div', { class: 'stack' }, detailsCard(session), themeCard(), securityCard)
        )
      )
    });

    if (state.force) {
      setTimeout(function () { state.current.focus(); }, 80);
    }
    return Promise.resolve();
  });
})();
