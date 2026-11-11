/* Application shell: guard, navigation, page header and command palette. */
(function () {
  'use strict';

  var EG = window.EG = window.EG || {};
  var ui = EG.ui;
  var el = ui.el;
  var icon = ui.icon;

  var NAV = [
    { group: 'Workspace', items: [
      { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: 'dashboard', keyHint: 'D' },
      { key: 'students', label: 'Students', href: '/students', icon: 'students' },
      { key: 'subjects', label: 'Subjects', href: '/subjects', icon: 'book' },
      { key: 'marks', label: 'Marks', href: '/marks', icon: 'marks' },
      { key: 'attendance', label: 'Attendance', href: '/attendance', icon: 'attendance' },
      { key: 'heatmap', label: 'Heatmap', href: '/heatmap', icon: 'heatmap' },
      { key: 'analytics', label: 'Analytics', href: '/analytics', icon: 'analytics' },
      { key: 'reports', label: 'Reports', href: '/reports', icon: 'reports' },
      { key: 'assistant', label: 'Assistant', href: '/assistant', icon: 'assistant' }
    ] },
    { group: 'Department', hod: true, items: [
      { key: 'faculty', label: 'Faculty', href: '/faculty', icon: 'faculty' },
      { key: 'structure', label: 'Structure', href: '/structure', icon: 'structure' },
      { key: 'assignments', label: 'Assignments', href: '/assignments', icon: 'assignments' },
      { key: 'progress', label: 'Data progress', href: '/progress', icon: 'progress' },
      { key: 'audit', label: 'Audit log', href: '/audit', icon: 'audit' },
      { key: 'terms', label: 'Terms', href: '/terms', icon: 'terms' },
      { key: 'settings', label: 'Settings', href: '/settings', icon: 'settings' }
    ] }
  ];

  var HOD_ONLY = {
    faculty: true, structure: true, assignments: true, progress: true,
    audit: true, settings: true, terms: true
  };

  var TITLES = {
    dashboard: 'Dashboard', students: 'Students', student: 'Student record', marks: 'Marks',
    attendance: 'Attendance', subjects: 'Subjects', heatmap: 'Class heatmap',
    analytics: 'Analytics', reports: 'Reports', assistant: 'EduGuard Assistant',
    account: 'Account', faculty: 'Faculty', structure: 'Structure',
    assignments: 'Teaching assignments', progress: 'Data progress', audit: 'Audit log',
    settings: 'Settings', terms: 'Terms'
  };

  var session = { user: null, term: null, scope: null };
  var state = { title: '', subtitle: '', actions: null, content: null, forced: false };

  function pageKey() {
    return document.body.dataset.page || 'dashboard';
  }

  function initials(name) {
    return ui.initials(name);
  }

  function avatar(name, extra) {
    return el('span', { class: 'avatar ' + (extra || ''), 'aria-hidden': 'true', text: initials(name) });
  }

  function currentKey() {
    var key = pageKey();
    if (key === 'student') return 'students';
    return key;
  }

  function navHref(key) {
    var href = '/' + key;
    return key === 'dashboard' ? '/dashboard' : href;
  }

  function buildSidebar() {
    var nav = el('nav', { class: 'sidebar__scroll', 'aria-label': 'Primary navigation' });
    NAV.forEach(function (group) {
      if (group.hod && session.user.role !== 'HOD') return;
      var section = el('div', { class: 'nav-group' },
        el('div', { class: 'nav-group__label', text: group.group })
      );
      group.items.forEach(function (item) {
        var link = el('a', {
          class: 'nav-link' + (currentKey() === item.key ? ' is-active' : ''),
          href: item.href,
          'aria-current': currentKey() === item.key ? 'page' : null
        },
          el('span', { html: icon(item.icon) }),
          el('span', { text: item.label }),
          item.keyHint ? el('span', { class: 'nav-key', text: item.keyHint }) : null
        );
        section.appendChild(link);
      });
      nav.appendChild(section);
    });

    var themeLabel = ui.resolvedTheme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    return el('aside', { class: 'sidebar', id: 'sidebar', 'aria-label': 'Sidebar' },
      el('a', { class: 'sidebar__brand', href: '/dashboard' },
        el('span', { class: 'brand-mark', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>' }),
        el('span', { class: 'brand-text' },
          el('span', { class: 'brand-name', text: 'EduGuard' }),
          el('span', { class: 'brand-meta', text: session.term ? session.term.name : 'Student support workspace' })
        )
      ),
      nav,
      el('div', { class: 'sidebar__foot' },
        el('button', { class: 'sidebar-user', type: 'button', id: 'sidebar-user', 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: themeLabel },
          avatar(session.user.name, 'avatar--brand'),
          el('span', { class: 'sidebar-user__meta' },
            el('span', { class: 'sidebar-user__name', text: session.user.name }),
            el('span', { class: 'sidebar-user__role', text: session.user.role === 'HOD' ? 'Head of department' : 'Faculty' })
          ),
          el('span', { html: icon('more') })
        )
      )
    );
  }

  function buildTopbar() {
    var crumb = TITLES[currentKey()] || 'EduGuard';
    var themeBtn = el('button', {
      class: 'icon-btn', type: 'button', id: 'theme-toggle',
      'aria-label': 'Toggle colour theme', title: 'Toggle colour theme'
    }, el('span', { html: icon(ui.resolvedTheme() === 'dark' ? 'sun' : 'moon') }));

    return el('header', { class: 'topbar' },
      el('button', { class: 'icon-btn topbar__menu', type: 'button', id: 'nav-toggle', 'aria-label': 'Open navigation', 'aria-expanded': 'false', 'aria-controls': 'sidebar' }, el('span', { html: icon('menu') })),
      el('div', { class: 'topbar__crumbs' },
        el('span', { text: 'EduGuard' }),
        el('span', { html: icon('arrowRight') }),
        el('strong', { text: crumb, id: 'crumb-current' })
      ),
      el('div', { class: 'topbar__spacer' }),
      session.term ? el('span', { class: 'term-chip', title: session.term.name },
        el('span', { class: 'dot dot--low' }),
        el('span', { text: session.term.name })
      ) : null,
      themeBtn,
      el('button', { class: 'search-trigger', type: 'button', id: 'command-trigger', 'aria-label': 'Open command palette' },
        el('span', { html: icon('search') }),
        el('span', { text: 'Search' }),
        el('kbd', { text: 'Ctrl K' })
      )
    );
  }

  function render() {
    var shell = el('div', { class: 'app-shell' },
      buildSidebar(),
      el('div', { class: 'main' },
        buildTopbar(),
        el('main', { class: 'page', id: 'page' })
      ),
      el('div', { class: 'nav-scrim', id: 'nav-scrim' })
    );
    var root = document.getElementById('app');
    root.textContent = '';
    root.appendChild(shell);
    document.body.classList.remove('is-booting');
    renderPage();
    wireShell();
  }

  function renderPage() {
    var page = document.getElementById('page');
    page.textContent = '';
    var head = el('div', { class: 'page-head' },
      el('div', { class: 'page-head__text' },
        state.eyebrow ? el('div', { class: 'eyebrow mb-2', text: state.eyebrow }) : null,
        el('h1', { class: 'page-title', text: state.title || TITLES[currentKey()] || 'EduGuard' }),
        state.subtitle ? el('p', { class: 'page-sub', text: state.subtitle }) : null
      ),
      state.actions ? el('div', { class: 'page-actions', id: 'page-actions' }) : null
    );
    if (state.actions) {
      var actions = state.actions;
      if (typeof actions === 'string') head.querySelector('#page-actions').innerHTML = actions;
      else if (Array.isArray(actions)) actions.forEach(function (action) { if (action) head.querySelector('#page-actions').appendChild(action); });
      else head.querySelector('#page-actions').appendChild(actions);
    }
    page.appendChild(head);
    var content = el('div', { class: 'page-content', id: 'page-content' });
    page.appendChild(content);
    if (state.content) {
      if (typeof state.content === 'string') content.innerHTML = state.content;
      else if (Array.isArray(state.content)) state.content.forEach(function (node) { content.appendChild(node); });
      else content.appendChild(state.content);
    }
  }

  function wireShell() {
    var body = document.body;
    var toggle = document.getElementById('nav-toggle');
    var scrim = document.getElementById('nav-scrim');
    function closeNav() {
      body.classList.remove('nav-open');
      if (toggle) { toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Open navigation'); }
    }
    if (toggle) {
      toggle.addEventListener('click', function () {
        var open = body.classList.toggle('nav-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      });
    }
    if (scrim) scrim.addEventListener('click', closeNav);
    document.querySelectorAll('.nav-link').forEach(function (link) { link.addEventListener('click', closeNav); });

    var themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', function () {
        var next = ui.resolvedTheme() === 'dark' ? 'light' : 'dark';
        ui.setTheme(next);
        themeToggle.innerHTML = icon(next === 'dark' ? 'sun' : 'moon');
      });
    }

    var userButton = document.getElementById('sidebar-user');
    if (userButton) {
      userButton.addEventListener('click', function (event) {
        event.stopPropagation();
        openUserMenu(userButton);
      });
    }

    var search = document.getElementById('command-trigger');
    if (search) search.addEventListener('click', openCommand);

    document.addEventListener('keydown', function (event) {
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (document.activeElement && document.activeElement.isContentEditable);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openCommand();
        return;
      }
      if (!typing && event.key === '/') {
        event.preventDefault();
        openCommand();
        return;
      }
      if (!typing && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'd' && pageKey() !== 'dashboard') {
        event.preventDefault();
        window.location.href = '/dashboard';
      }
    });

    document.addEventListener('eg:theme', function () {
      var btn = document.getElementById('theme-toggle');
      if (btn) btn.innerHTML = icon(ui.resolvedTheme() === 'dark' ? 'sun' : 'moon');
    });
  }

  function openUserMenu(anchor) {
    closeMenu();
    var menu = el('div', { class: 'menu', id: 'user-menu', role: 'menu' },
      el('div', { class: 'menu__head', text: session.user.email }),
      el('a', { class: 'menu__item', href: '/account', role: 'menuitem' }, el('span', { html: icon('account') }), 'Account & security'),
      el('a', { class: 'menu__item', href: '/assistant', role: 'menuitem' }, el('span', { html: icon('assistant') }), 'Ask EduGuard'),
      el('button', { class: 'menu__item', type: 'button', role: 'menuitem', onClick: function () { ui.setTheme(ui.resolvedTheme() === 'dark' ? 'light' : 'dark'); closeMenu(); } },
        el('span', { html: icon(ui.resolvedTheme() === 'dark' ? 'sun' : 'moon') }), 'Toggle theme'),
      el('div', { class: 'menu__sep' }),
      el('button', { class: 'menu__item menu__item--danger', type: 'button', role: 'menuitem', onClick: signOut },
        el('span', { html: icon('logout') }), 'Sign out')
    );
    var parent = anchor.parentNode;
    parent.classList.add('relative');
    parent.appendChild(menu);
    anchor.setAttribute('aria-expanded', 'true');
    setTimeout(function () {
      document.addEventListener('click', onOutside);
      document.addEventListener('keydown', onKey);
    }, 0);
    function closeMenu() {
      var existing = document.getElementById('user-menu');
      if (existing) existing.remove();
      var button = document.getElementById('sidebar-user');
      if (button) button.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', onOutside);
      document.removeEventListener('keydown', onKey);
    }
    function onOutside(event) {
      if (!menu.contains(event.target) && !anchor.contains(event.target)) closeMenu();
    }
    function onKey(event) { if (event.key === 'Escape') closeMenu(); }
    openUserMenu.close = closeMenu;
  }
  function closeMenu() { if (openUserMenu.close) openUserMenu.close(); }

  async function signOut() {
    closeMenu();
    try { await EG.api.post('/api/auth/logout'); } catch (error) { /* session already gone */ }
    session.user = null;
    window.location.replace('/login');
  }

  function commands() {
    var list = [];
    NAV.forEach(function (group) {
      if (group.hod && session.user.role !== 'HOD') return;
      group.items.forEach(function (item) {
        list.push({
          label: item.label,
          hint: group.group,
          icon: item.icon,
          run: function () { window.location.href = item.href; }
        });
      });
    });
    list.push({ label: 'Account & security', hint: 'You', icon: 'account', run: function () { window.location.href = '/account'; } });
    list.push({ label: 'Toggle colour theme', hint: 'Display', icon: 'sun', run: function () { ui.setTheme(ui.resolvedTheme() === 'dark' ? 'light' : 'dark'); } });
    if (session.user.role === 'HOD') {
      list.push({ label: 'Invite a faculty member', hint: 'Action', icon: 'plus', run: function () { window.location.href = '/faculty?new=1'; } });
      list.push({ label: 'Review data progress', hint: 'Action', icon: 'progress', run: function () { window.location.href = '/progress'; } });
      list.push({ label: 'Export at-risk students', hint: 'Action', icon: 'download', run: function () { EG.api.download('/api/export/at-risk.csv').catch(function (error) { ui.toast(error.message, 'error'); }); } });
      list.push({ label: 'Reset demo data', hint: 'Danger zone', icon: 'refresh', run: function () { window.location.href = '/settings#demo'; } });
    }
    list.push({ label: 'Sign out', hint: 'Session', icon: 'logout', run: signOut });
    return list;
  }

  function openCommand() {
    closeMenu();
    if (document.getElementById('command-palette')) return;
    var input = el('input', { class: 'command__input', type: 'search', placeholder: 'Search pages and actions…', autocomplete: 'off', 'aria-label': 'Search pages and actions' });
    var list = el('div', { class: 'command__list', role: 'listbox' });
    var palette = el('div', { class: 'command', id: 'command-palette', onMousedown: function (event) { if (event.target === palette) close(); } },
      el('div', { class: 'command__panel' },
        input,
        list,
        el('div', { class: 'command__foot' },
          el('span', null, el('kbd', { text: '↑' }), el('kbd', { text: '↓' }), 'navigate'),
          el('span', null, el('kbd', { text: '↵' }), 'open'),
          el('span', null, el('kbd', { text: 'esc' }), 'close')
        )
      )
    );
    document.body.appendChild(palette);
    var all = commands();
    var filtered = all;
    var active = 0;

    function renderList() {
      var q = ui.deburr(input.value.trim());
      filtered = !q ? all : all.filter(function (item) { return ui.deburr(item.label + ' ' + item.hint).includes(q); });
      active = 0;
      list.textContent = '';
      if (!filtered.length) {
        list.appendChild(el('div', { class: 'empty', style: { padding: '24px' } }, el('p', { text: 'No matching commands.' })));
        return;
      }
      filtered.forEach(function (item, index) {
        var button = el('button', {
          class: 'command__item' + (index === 0 ? ' is-active' : ''),
          type: 'button', role: 'option',
          onClick: function () { run(item); }
        }, el('span', { html: icon(item.icon) }), el('span', { text: item.label }), el('span', { class: 'faint small', text: item.hint }));
        list.appendChild(button);
      });
    }

    function highlight() {
      Array.prototype.forEach.call(list.children, function (node, index) { node.classList.toggle('is-active', index === active); });
      var node = list.children[active];
      if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest' });
    }

    function run(item) {
      if (!item) return;
      close();
      item.run();
    }

    function close() {
      palette.remove();
      document.removeEventListener('keydown', onKey);
    }

    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key === 'ArrowDown') { event.preventDefault(); active = Math.min(filtered.length - 1, active + 1); highlight(); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); active = Math.max(0, active - 1); highlight(); return; }
      if (event.key === 'Enter') { event.preventDefault(); run(filtered[active]); }
    }

    input.addEventListener('input', renderList);
    document.addEventListener('keydown', onKey);
    renderList();
    input.focus();
  }

  function mount(options) {
    options = options || {};
    state.title = options.title || state.title || TITLES[currentKey()];
    state.subtitle = options.subtitle || '';
    state.eyebrow = options.eyebrow || '';
    state.actions = options.actions || null;
    state.content = options.content || null;
    document.title = state.title + ' · EduGuard';
    renderPage();
    return document.getElementById('page-content');
  }

  function setContent(content) {
    state.content = content;
    renderPage();
    return document.getElementById('page-content');
  }

  function setActions(actions) {
    state.actions = actions;
    renderPage();
    return document.getElementById('page-actions');
  }

  function boot() {
    ui.initTheme();
    if (document.body.dataset.guest === 'true' || document.body.dataset.standalone === 'true') {
      document.body.classList.remove('is-booting');
      return Promise.resolve(null);
    }
    var key = pageKey();
    return EG.api.request('/api/auth/me', { skipAuthRedirect: true }).then(function (data) {
      session.user = data.user;
      session.term = data.term;
      session.scope = data.scope;
      EG.session = session;
      if (data.user.must_change_password && key !== 'account') {
        window.location.replace('/account?force=1');
        return null;
      }
      if (HOD_ONLY[key] && data.user.role !== 'HOD') {
        window.location.replace('/403');
        return null;
      }
      render();
      return session;
    }).catch(function (error) {
      if (error.status === 401) {
        var next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.replace('/login?next=' + next);
        return null;
      }
      document.body.classList.remove('is-booting');
      var root = document.getElementById('app');
      root.textContent = '';
      root.appendChild(el('div', { class: 'status-page' },
        el('div', { class: 'status-card' },
          el('div', { class: 'status-code', text: '!' }),
          el('h1', { text: 'Could not load the workspace' }),
          el('p', { text: error.message || 'Check the connection and try again.' }),
          el('div', { class: 'btn-row' },
            el('button', { class: 'btn btn--primary', type: 'button', onClick: function () { window.location.reload(); } }, 'Try again'),
            el('a', { class: 'btn', href: '/login' }, 'Sign in again')
          )
        )
      ));
      return null;
    });
  }

  EG.shell = {
    mount: mount,
    setContent: setContent,
    setActions: setActions,
    boot: boot,
    session: session,
    signOut: signOut,
    navigate: function (path) { window.location.href = path; },
    titles: TITLES,
    nav: NAV
  };

  EG.ready = boot();
})();
