/* Faculty directory: accounts, roles, teaching load and password resets. */
(function () {
  'use strict';

  var EG = window.EG;
  var ui = EG.ui;
  var el = ui.el;
  var pages = EG.pages;
  var icon = ui.icon;

  var state = {
    data: null,
    q: '',
    role: '',
    status: '',
    tableHost: null,
    kpiHost: null,
    search: null,
    roleSelect: null,
    statusSelect: null,
    loaded: false
  };

  function visibleUsers() {
    var rows = (state.data && state.data.users) || [];
    var query = state.q.toLowerCase();
    return rows.filter(function (user) {
      if (state.role && user.role !== state.role) return false;
      if (state.status === 'active' && !user.active) return false;
      if (state.status === 'inactive' && user.active) return false;
      if (!query) return true;
      var haystack = (user.name + ' ' + user.email + ' ' + user.assignments.map(function (row) { return row.subjectName + ' ' + row.sectionName; }).join(' ')).toLowerCase();
      return haystack.indexOf(query) !== -1;
    });
  }

  function renderKpis() {
    if (!state.kpiHost) return;
    var users = (state.data && state.data.users) || [];
    var active = users.filter(function (user) { return user.active; });
    var faculty = active.filter(function (user) { return user.role === 'FACULTY'; });
    var hods = active.filter(function (user) { return user.role === 'HOD'; });
    var pending = users.filter(function (user) { return user.active && user.must_change_password; });
    state.kpiHost.textContent = '';
    [
      { label: 'Active people', value: active.length, icon: 'users', foot: users.length + ' accounts in total' },
      { label: 'Faculty', value: faculty.length, icon: 'faculty', foot: 'Active teaching accounts' },
      { label: 'Heads of department', value: hods.length, icon: 'shield', foot: hods.length === 1 ? 'One active HOD' : 'Multiple active HODs' },
      { label: 'Password changes pending', value: pending.length, icon: 'key', tone: pending.length ? 'warning' : 'success', foot: 'Temporary passwords still in use' }
    ].forEach(function (kpi) {
      state.kpiHost.appendChild(pages.kpi({ label: kpi.label, value: String(kpi.value), icon: kpi.icon, tone: kpi.tone || 'brand', foot: kpi.foot }));
    });
  }

  function credentialModal(data, email) {
    var generated = Boolean(data.temporaryPassword);
    var code = el('code', { class: 'code-block', text: data.temporaryPassword || '' });
    var modal = ui.modal({
      title: generated ? 'Share this password once' : 'Password set',
      subtitle: generated ? 'It will not be shown again after this dialog closes.' : 'Share it through a private channel.',
      narrow: true,
      body: el('div', { class: 'stack' },
        el('div', { class: 'info-box' }, generated
          ? 'Send this password to ' + email + ' through a private channel. They must change it after signing in.'
          : 'The account for ' + email + ' now uses the password you set. ' + (data.mustChangePassword ? 'They must change it after signing in.' : 'They can sign in with it now.')),
        generated ? code : null,
        data.note ? el('p', { class: 'xs faint', text: data.note }) : null
      ),
      footer: el('div', { class: 'row row--end gap-2 w-100' },
        generated ? el('button', { class: 'btn', type: 'button', onClick: function () { pages.copy(data.temporaryPassword || ''); } },
          el('span', { html: icon('copy', 14) }), 'Copy password') : null,
        el('button', { class: 'btn btn--primary', type: 'button', onClick: function () { modal.close(); } }, 'Done')
      )
    });
  }

  function passwordStrength(value) {
    var text = String(value || '');
    var score = 0;
    if (text.length >= 10) score += 1;
    if (text.length >= 14) score += 1;
    if (/[a-z]/.test(text) && /[A-Z]/.test(text)) score += 1;
    if (/\d/.test(text)) score += 1;
    if (/[^A-Za-z0-9]/.test(text)) score += 1;
    if (!text) return { score: 0, label: 'Use at least 10 characters with a letter and a number.' };
    if (score <= 2) return { score: 2, label: 'Weak: add length and a number.' };
    if (score === 3) return { score: 3, label: 'Fair: add a capital letter or symbol.' };
    return { score: 4, label: 'Strong password.' };
  }

  function passwordBlock(fields, options) {
    options = options || {};
    var meter = el('div', { class: 'pw-meter', 'aria-live': 'polite' },
      el('span', { class: 'pw-meter__track' }, el('span', { class: 'pw-meter__fill' })),
      el('span', { class: 'pw-meter__label', text: passwordStrength('').label })
    );
    var canMatch = true;
    return {
      fields: fields,
      extra: meter,
      afterRender: function (inputs) {
        var password = inputs.password;
        var confirm = inputs.confirmPassword;
        if (!password) return;
        var fieldNode = password.closest ? password.closest('.field') : password.parentNode;
        if (fieldNode && fieldNode.parentNode) fieldNode.parentNode.insertBefore(meter, fieldNode.nextSibling);
        var fill = meter.querySelector('.pw-meter__fill');
        var label = meter.querySelector('.pw-meter__label');
        password.addEventListener('input', function () {
          var strength = passwordStrength(password.value);
          fill.style.width = (strength.score >= 4 ? 100 : strength.score === 3 ? 70 : 40) + '%';
          fill.dataset.level = strength.score >= 4 ? 'strong' : strength.score >= 3 ? 'fair' : 'weak';
          label.textContent = strength.label;
        });
        if (confirm) {
          confirm.addEventListener('input', function () {
            canMatch = !password.value || confirm.value === password.value;
            confirm.setAttribute('aria-invalid', canMatch ? 'false' : 'true');
          });
        }
      },
      validate: function (values) {
        if (!values.password) {
          if (options.required) return 'Set a password for this account.';
          if (values.confirmPassword) return 'Confirm the password you entered.';
          return null;
        }
        if (values.password.length < 10) return 'The password must be at least 10 characters.';
        if (!/[A-Za-z]/.test(values.password) || !/\d/.test(values.password)) return 'The password must include a letter and a number.';
        if (values.password !== values.confirmPassword) return 'The two passwords do not match.';
        return null;
      }
    };
  }

  function createUser() {
    var createdAccount = null;
    var password = passwordBlock([
      {
        name: 'password', label: 'Password (optional)', type: 'password', span: true,
        autocomplete: 'new-password',
        hint: 'Leave blank to generate a temporary password. Minimum 10 characters with a letter and a number.'
      },
      { name: 'confirmPassword', label: 'Confirm password', type: 'password', autocomplete: 'new-password' },
      {
        name: 'requireChange', label: 'Require a password change at next sign-in', type: 'checkbox',
        value: true, span: true,
        hint: 'The person is prompted to choose their own password after signing in.'
      }
    ], { required: false });
    pages.formModal({
      title: 'Add a person',
      subtitle: 'Set a password yourself, or generate a temporary one to share once.',
      submitLabel: 'Create account',
      fields: [
        { name: 'name', label: 'Full name', placeholder: 'Dr. Maya Iyer' },
        { name: 'email', label: 'Email address', type: 'email', placeholder: 'maya@school.edu' },
        {
          name: 'role', label: 'Role', type: 'select', value: 'FACULTY',
          options: [{ value: 'FACULTY', label: 'Faculty' }, { value: 'HOD', label: 'Head of department' }],
          hint: 'HOD accounts can see and manage the whole department.'
        }
      ].concat(password.fields),
      extra: password.extra,
      afterRender: password.afterRender,
      validate: function (values) {
        if (!values.name || values.name.length < 2) return 'Enter the person\'s full name.';
        if (!values.email.includes('@')) return 'Enter a valid email address.';
        return password.validate(values);
      },
      onSubmit: function (values) {
        var body = {
          name: values.name,
          email: values.email,
          role: values.role,
          requireChange: Boolean(values.requireChange)
        };
        if (values.password) body.password = values.password;
        return EG.api.post('/api/users', body).then(function (created) {
          createdAccount = created;
          ui.toast('Account created for ' + created.email + '.', 'success');
          return refresh();
        });
      }
    }).then(function () {
      if (createdAccount) credentialModal(createdAccount, createdAccount.email);
    });
  }

  function editUser(user) {
    var password = passwordBlock([
      { name: 'password', label: 'New password (optional)', type: 'password', span: true, autocomplete: 'new-password', hint: 'Leave blank to keep the current password. Setting one signs them out everywhere.' },
      { name: 'confirmPassword', label: 'Confirm new password', type: 'password', autocomplete: 'new-password' },
      {
        name: 'mustChangePassword', label: 'Require a password change at next sign-in', type: 'checkbox',
        value: Boolean(user.must_change_password), span: true
      }
    ], { required: false });
    pages.formModal({
      title: 'Edit ' + user.name,
      subtitle: 'Name, email, role and password changes are recorded in the audit log.',
      submitLabel: 'Save changes',
      fields: [
        { name: 'name', label: 'Full name', value: user.name },
        { name: 'email', label: 'Email address', type: 'email', value: user.email },
        {
          name: 'role', label: 'Role', type: 'select', value: user.role,
          options: [{ value: 'FACULTY', label: 'Faculty' }, { value: 'HOD', label: 'Head of department' }],
          hint: 'You cannot change your own role. At least one active HOD must remain.'
        }
      ].concat(password.fields),
      extra: password.extra,
      afterRender: password.afterRender,
      validate: function (values) {
        if (!values.name || values.name.length < 2) return 'Enter a full name.';
        if (!values.email.includes('@')) return 'Enter a valid email address.';
        return password.validate(values);
      },
      onSubmit: function (values) {
        var body = {
          name: values.name,
          email: values.email,
          role: values.role,
          mustChangePassword: Boolean(values.mustChangePassword)
        };
        if (values.password) body.password = values.password;
        return EG.api.patch('/api/users/' + encodeURIComponent(user.id), body).then(function () {
          ui.toast('Account updated.', 'success');
          return refresh();
        });
      }
    });
  }

  function resetPassword(user) {
    ui.confirm({
      title: 'Reset password for ' + user.name + '?',
      message: 'A new temporary password will be generated. All of their sessions will end immediately.',
      confirmLabel: 'Reset password',
      danger: true
    }).then(function (confirmed) {
      if (!confirmed) return;
      EG.api.post('/api/users/' + encodeURIComponent(user.id) + '/reset-password').then(function (data) {
        credentialModal(data, user.email);
        refresh();
      }).catch(function (error) {
        if (error.status !== 401) ui.toast(error.message, 'error');
      });
    });
  }

  function toggleActive(user) {
    var next = !user.active;
    ui.confirm({
      title: (next ? 'Reactivate ' : 'Deactivate ') + user.name + '?',
      message: next
        ? 'They will be able to sign in again. Their teaching assignments are unchanged.'
        : 'They will be signed out everywhere and cannot sign in until reactivated. Assignments stay in place.',
      confirmLabel: next ? 'Reactivate' : 'Deactivate',
      danger: !next
    }).then(function (confirmed) {
      if (!confirmed) return;
      EG.api.patch('/api/users/' + encodeURIComponent(user.id), { active: next }).then(function () {
        ui.toast(next ? 'Account reactivated.' : 'Account deactivated and signed out.', 'success');
        refresh();
      }).catch(function (error) {
        if (error.status !== 401) ui.toast(error.message, 'error');
      });
    });
  }

  function deleteUser(user) {
    var input = el('input', {
      class: 'input', type: 'email', placeholder: user.email,
      autocomplete: 'off', 'aria-label': 'Type the account email to confirm deletion'
    });
    var errorBox = el('div', { class: 'error-box', hidden: true });
    var confirmButton = el('button', { class: 'btn btn--danger', type: 'button', disabled: 'disabled' }, 'Delete account');
    var modal = ui.modal({
      title: 'Delete ' + user.name + '?',
      subtitle: 'This removes the account and its teaching assignments. Assessment and attendance history is transferred to you so the audit trail stays intact.',
      narrow: true,
      body: el('div', { class: 'stack' },
        el('div', { class: 'info-box is-danger' }, 'This cannot be undone. If you only need to pause access, deactivate the account instead.'),
        el('div', { class: 'field' },
          el('label', { text: 'Type ' + user.email + ' to confirm' }),
          input
        ),
        errorBox
      ),
      footer: el('div', { class: 'row row--end gap-2 w-100' },
        el('button', { class: 'btn', type: 'button', onClick: function () { modal.close(); } }, 'Cancel'),
        confirmButton
      )
    });
    input.addEventListener('input', function () {
      confirmButton.disabled = input.value.trim().toLowerCase() !== String(user.email).toLowerCase();
    });
    confirmButton.addEventListener('click', function () {
      confirmButton.disabled = true;
      confirmButton.innerHTML = '<span class="spinner" aria-hidden="true"></span> Deleting…';
      errorBox.hidden = true;
      EG.api.del('/api/users/' + encodeURIComponent(user.id), { confirmEmail: input.value.trim() }).then(function (result) {
        modal.close();
        var transferred = result && result.transferred ? result.transferred : {};
        ui.toast('Account deleted. ' + (transferred.assessments || 0) + ' assessments and ' + (transferred.attendanceSessions || 0) + ' attendance sessions were transferred.', 'success');
        return refresh();
      }).catch(function (error) {
        confirmButton.disabled = false;
        confirmButton.textContent = 'Delete account';
        errorBox.hidden = false;
        errorBox.innerHTML = ui.icon('warning', 17) + '<div>' + ui.esc(error.message) + '</div>';
      });
    });
    setTimeout(function () { input.focus(); }, 40);
  }

  function assignmentsNode(user) {
    if (user.role === 'HOD') return el('span', { class: 'xs faint', text: 'Department-wide access' });
    if (!user.assignments.length) return el('span', { class: 'pill pill--medium', text: 'Unassigned' });
    return el('div', { class: 'assignment-tags' }, user.assignments.slice(0, 6).map(function (row) {
      return el('span', { class: 'tag', text: row.subjectName + ' - ' + row.sectionName });
    }).concat(user.assignments.length > 6 ? [el('span', { class: 'tag', text: '+' + (user.assignments.length - 6) })] : []));
  }

  function userRow(user) {
    var actions = el('div', { class: 'row row--end gap-1' },
      el('button', { class: 'btn btn--sm btn--ghost', type: 'button', title: 'Edit account', onClick: function () { editUser(user); } },
        el('span', { html: icon('edit', 13) }), 'Edit'),
      el('button', { class: 'btn btn--sm btn--ghost', type: 'button', title: 'Reset password', onClick: function () { resetPassword(user); } },
        el('span', { html: icon('key', 13) }), 'Reset'),
      el('button', {
        class: 'btn btn--sm ' + (user.active ? 'btn--danger-ghost' : ''),
        type: 'button', title: user.active ? 'Deactivate account' : 'Reactivate account',
        onClick: function () { toggleActive(user); }
      }, el('span', { html: icon(user.active ? 'lock' : 'unlock', 13) }), user.active ? 'Deactivate' : 'Reactivate'),
      user.role === 'FACULTY' && user.id !== EG.session.user.id
        ? el('button', {
          class: 'btn btn--sm btn--danger-ghost', type: 'button', title: 'Delete this faculty account',
          onClick: function () { deleteUser(user); }
        }, el('span', { html: icon('trash', 13) }), 'Delete')
        : null
    );
    return el('tr', { class: user.active ? null : 'inactive-row' },
      el('td', null,
        el('div', { class: 'user-cell' },
          el('span', { class: 'avatar', text: ui.initials(user.name) }),
          el('div', { class: 'user-cell__meta' },
            el('div', { class: 'user-cell__name', text: user.name }),
            el('div', { class: 'user-cell__email', text: user.email })
          )
        )
      ),
      el('td', null, el('span', { class: 'pill ' + (user.role === 'HOD' ? 'pill--brand' : 'pill--info'), text: user.role === 'HOD' ? 'HOD' : 'Faculty' })),
      el('td', null, assignmentsNode(user)),
      el('td', null,
        el('div', { class: 'stack--sm' },
          el('span', { class: 'pill ' + (user.active ? 'pill--low' : 'pill--nodata'), text: user.active ? 'Active' : 'Inactive' }),
          user.active && user.must_change_password ? el('span', { class: 'xs faint', text: 'Password change pending' }) : null
        )
      ),
      el('td', null, el('span', { class: 'small muted', text: user.last_login_at ? ui.timeAgo(user.last_login_at) : 'Never' })),
      el('td', { class: 'actions' }, actions)
    );
  }

  function renderTable() {
    if (!state.tableHost) return;
    state.tableHost.textContent = '';
    var rows = visibleUsers();
    if (!rows.length) {
      state.tableHost.appendChild(pages.empty('No people match', 'Clear the search or filters, or add a faculty member.', null, 'users'));
      return;
    }
    var table = el('table', { class: 'table table--compact' },
      el('thead', null,
        el('tr', null,
          el('th', { text: 'Person' }),
          el('th', { text: 'Role' }),
          el('th', { text: 'Teaching load' }),
          el('th', { text: 'Status' }),
          el('th', { text: 'Last sign-in' }),
          el('th', { class: 'actions', text: 'Actions' })
        )
      ),
      el('tbody', null, rows.map(userRow))
    );
    state.tableHost.appendChild(el('div', { class: 'table-wrap' }, table));
  }

  function render() {
    renderKpis();
    renderTable();
  }

  function refresh() {
    return EG.api.get('/api/users').then(function (data) {
      state.data = data;
      state.loaded = true;
      render();
    }).catch(function (error) {
      if (error.status === 401) return;
      if (state.tableHost) {
        state.tableHost.textContent = '';
        state.tableHost.appendChild(ui.errorState(error, function () { refresh(); }));
      }
      ui.toast(error.message, 'error');
    });
  }

  function exportCsv() {
    var rows = visibleUsers().map(function (user) {
      return {
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.active ? 'Active' : 'Inactive',
        teachingLoad: user.assignments.map(function (row) { return row.subjectName + ' - ' + row.sectionName; }).join('; '),
        lastSignIn: user.last_login_at || ''
      };
    });
    pages.download('eduguard-faculty-' + new Date().toISOString().slice(0, 10) + '.csv', rows, [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'role', label: 'Role' },
      { key: 'status', label: 'Status' },
      { key: 'teachingLoad', label: 'Teaching load' },
      { key: 'lastSignIn', label: 'Last sign-in' }
    ]);
  }

  pages.guard(function () {
    if (EG.session.user.role !== 'HOD') return null;

    state.search = el('input', { class: 'input input--search', type: 'search', placeholder: 'Search name, email or subject...', 'aria-label': 'Search people' });
    state.search.addEventListener('input', ui.debounce(function () {
      state.q = state.search.value.trim();
      renderTable();
    }, 180));

    state.roleSelect = pages.select([
      { value: '', label: 'All roles' }, { value: 'HOD', label: 'HOD only' }, { value: 'FACULTY', label: 'Faculty only' }
    ], { value: '' });
    state.roleSelect.addEventListener('change', function () {
      state.role = state.roleSelect.value;
      renderTable();
    });

    state.statusSelect = pages.select([
      { value: '', label: 'All statuses' }, { value: 'active', label: 'Active only' }, { value: 'inactive', label: 'Inactive only' }
    ], { value: '' });
    state.statusSelect.addEventListener('change', function () {
      state.status = state.statusSelect.value;
      renderTable();
    });

    state.kpiHost = el('div', { class: 'kpi-grid' });
    state.tableHost = el('div');

    pages.mount({
      title: 'Faculty',
      subtitle: 'Accounts, roles, password setup, teaching load and account deletion.',
      actions: el('div', { class: 'btn-row' },
        el('button', { class: 'btn', type: 'button', onClick: exportCsv }, el('span', { html: icon('download') }), 'CSV'),
        el('button', { class: 'btn btn--primary', type: 'button', onClick: createUser }, el('span', { html: icon('plus') }), 'Add person')
      ),
      content: el('div', { class: 'stack' },
        state.kpiHost,
        pages.card({
          body: el('div', { class: 'row row--wrap gap-3' },
            el('div', { class: 'field grow', style: { minWidth: '220px' } }, el('label', { text: 'Search' }), state.search),
            el('div', { class: 'field' }, el('label', { text: 'Role' }), state.roleSelect),
            el('div', { class: 'field' }, el('label', { text: 'Status' }), state.statusSelect)
          )
        }),
        pages.card({
          title: 'Department directory',
          subtitle: 'Temporary passwords are generated on the server and shown once',
          flush: true,
          body: state.tableHost
        })
      )
    });

    var params = new URLSearchParams(window.location.search);
    return refresh().then(function () {
      if (params.get('new') === '1') createUser();
    });
  });
})();
