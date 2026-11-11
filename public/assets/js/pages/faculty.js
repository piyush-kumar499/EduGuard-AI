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
    var code = el('code', { class: 'code-block', text: data.temporaryPassword || '' });
    var modal = ui.modal({
      title: 'Share this password once',
      subtitle: 'It will not be shown again after this dialog closes.',
      narrow: true,
      body: el('div', { class: 'stack' },
        el('div', { class: 'info-box' }, 'Send this password to ' + email + ' through a private channel. They must change it after signing in.'),
        code,
        data.note ? el('p', { class: 'xs faint', text: data.note }) : null
      ),
      footer: el('div', { class: 'row row--end gap-2 w-100' },
        el('button', { class: 'btn', type: 'button', onClick: function () { pages.copy(data.temporaryPassword || ''); } },
          el('span', { html: icon('copy', 14) }), 'Copy password'),
        el('button', { class: 'btn btn--primary', type: 'button', onClick: function () { modal.close(); } }, 'Done')
      )
    });
  }

  function createUser() {
    var createdAccount = null;
    pages.formModal({
      title: 'Add a person',
      subtitle: 'A temporary password is generated unless you set one.',
      submitLabel: 'Create account',
      fields: [
        { name: 'name', label: 'Full name', placeholder: 'Dr. Maya Iyer' },
        { name: 'email', label: 'Email address', type: 'email', placeholder: 'maya@school.edu' },
        {
          name: 'role', label: 'Role', type: 'select', value: 'FACULTY',
          options: [{ value: 'FACULTY', label: 'Faculty' }, { value: 'HOD', label: 'Head of department' }],
          hint: 'HOD accounts can see and manage the whole department.'
        },
        {
          name: 'password', label: 'Password (optional)', type: 'password',
          autocomplete: 'new-password',
          hint: 'Leave blank to generate a temporary password. Minimum 10 characters with a letter and a number.'
        }
      ],
      validate: function (values) {
        if (!values.name || values.name.length < 2) return 'Enter the person\'s full name.';
        if (!values.email.includes('@')) return 'Enter a valid email address.';
        if (values.password && values.password.length < 10) return 'The password must be at least 10 characters.';
        return null;
      },
      onSubmit: function (values) {
        var body = { name: values.name, email: values.email, role: values.role };
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
    pages.formModal({
      title: 'Edit ' + user.name,
      subtitle: 'Name, email and role changes are recorded in the audit log.',
      submitLabel: 'Save changes',
      fields: [
        { name: 'name', label: 'Full name', value: user.name },
        { name: 'email', label: 'Email address', type: 'email', value: user.email },
        {
          name: 'role', label: 'Role', type: 'select', value: user.role,
          options: [{ value: 'FACULTY', label: 'Faculty' }, { value: 'HOD', label: 'Head of department' }],
          hint: 'You cannot change your own role. At least one active HOD must remain.'
        }
      ],
      validate: function (values) {
        if (!values.name || values.name.length < 2) return 'Enter a full name.';
        if (!values.email.includes('@')) return 'Enter a valid email address.';
        return null;
      },
      onSubmit: function (values) {
        return EG.api.patch('/api/users/' + encodeURIComponent(user.id), values).then(function () {
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
      }, el('span', { html: icon(user.active ? 'lock' : 'unlock', 13) }), user.active ? 'Deactivate' : 'Reactivate')
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
      subtitle: 'Accounts, roles, teaching load and password resets for the department.',
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
