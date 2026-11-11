/* Application shell: guard, navigation, page header, inbox, quick actions and palette. */
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

  var COLLAPSE_KEY = 'eg:collapsed';
  var session = { user: null, term: null, scope: null };
  var state = { title: '', subtitle: '', actions: null, content: null, forced: false };
  var inbox = { loaded: false, data: null };

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

  function isHod() {
    return session.user && session.user.role === 'HOD';
  }

  function roleLabel() {
    return isHod() ? 'Head of department' : 'Faculty';
  }

  function collapsed() {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch (error) { return false; }
  }

  function setCollapsed(value) {
    var shell = document.querySelector('.app-shell');
    if (shell) shell.classList.toggle('is-collapsed', Boolean(value));
    try { localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0'); } catch (error) { /* private mode */ }
    var button = document.getElementById('sidebar-collapse');
    if (button) {
      button.setAttribute('aria-label', value ? 'Expand sidebar' : 'Collapse sidebar');
      button.setAttribute('title', value ? 'Expand sidebar' : 'Collapse sidebar');
    }
  }

  function navItems() {
    var list = [];
    NAV.forEach(function (group) {
      if (group.hod && !isHod()) return;
      group.items.forEach(function (item) { list.push(item); });
    });
    return list;
  }

  function buildSidebar() {
    var nav = el('nav', { class: 'sidebar__scroll', 'aria-label': 'Primary navigation' });
    NAV.forEach(function (group) {
      if (group.hod && !isHod()) return;
      var section = el('div', { class: 'nav-group' },
        el('div', { class: 'nav-group__label', text: group.group })
      );
      group.items.forEach(function (item) {
        var link = el('a', {
          class: 'nav-link' + (currentKey() === item.key ? ' is-active' : ''),
          href: item.href,
          title: item.label,
          'aria-current': currentKey() === item.key ? 'page' : null
        },
          el('span', { class: 'nav-icon', html: icon(item.icon) }),
          el('span', { class: 'nav-text', text: item.label }),
          item.keyHint ? el('span', { class: 'nav-key', text: item.keyHint }) : null
        );
        section.appendChild(link);
      });
      nav.appendChild(section);
    });

    return el('aside', { class: 'sidebar', id: 'sidebar', 'aria-label': 'Sidebar' },
      el('a', { class: 'sidebar__brand', href: '/dashboard' },
        el('span', { class: 'brand-mark', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>' }),
        el('span', { class: 'brand-text' },
          el('span', { class: 'brand-name', text: 'EduGuard' }),
          el('span', { class: 'brand-meta', text: isHod() ? 'Department workspace' : 'Teaching workspace' })
        )
      ),
      nav,
      el('div', { class: 'sidebar__foot' },
        el('button', { class: 'voice-link', type: 'button', id: 'voice-open' },
          el('span', { class: 'voice-link__icon', html: icon('wave') }),
          el('span', { text: 'Talk to EduGuard' })
        ),
        el('button', { class: 'collapse-btn', type: 'button', id: 'sidebar-collapse', 'aria-label': 'Collapse sidebar' },
          el('span', { class: 'collapse-btn__icon', html: icon('collapse') }),
          el('span', { text: 'Collapse' })
        ),
        el('button', { class: 'sidebar-user', type: 'button', id: 'sidebar-user', title: session.user.email },
          avatar(session.user.name, 'avatar--brand'),
          el('span', { class: 'sidebar-user__meta' },
            el('span', { class: 'sidebar-user__name', text: session.user.name }),
            el('span', { class: 'sidebar-user__role', text: roleLabel() })
          ),
          el('span', { class: 'sidebar-user__more', html: icon('more') })
        )
      )
    );
  }

  function buildSearch() {
    var input = el('input', {
      type: 'search', class: 'global-search__input', id: 'global-search-input',
      placeholder: 'Search students…', 'aria-label': 'Search students', autocomplete: 'off'
    });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        var value = input.value.trim();
        if (value) window.location.assign('/students?q=' + encodeURIComponent(value));
      } else if (event.key === 'Escape') {
        input.blur();
      }
    });
    return el('div', { class: 'global-search', id: 'global-search' },
      el('span', { class: 'global-search__icon', html: icon('search') }),
      input,
      el('kbd', { text: 'Ctrl K' })
    );
  }

  function buildInbox() {
    var badge = el('span', { class: 'alert-badge', id: 'alert-badge', hidden: 'hidden', text: '0' });
    var summary = el('span', { id: 'alert-summary', text: 'Checking entry progress…' });
    var list = el('div', { class: 'alerts-list', id: 'alerts-list' },
      el('div', { class: 'alerts-loading' }, el('span', { class: 'skeleton skeleton--line' }), el('span', { class: 'skeleton skeleton--line' }))
    );
    var menu = el('div', { class: 'alerts-menu', id: 'alerts-menu', hidden: 'hidden' },
      el('div', { class: 'alerts-head' }, el('strong', { text: 'Operations inbox' }), summary),
      list,
      el('a', { class: 'alerts-foot', href: isHod() ? '/progress' : '/marks' },
        el('span', { text: isHod() ? 'Open data progress' : 'Open marks entry' }),
        el('span', { html: icon('arrowRight') })
      )
    );
    var button = el('button', {
      class: 'icon-btn alerts-toggle', type: 'button', id: 'alerts-toggle',
      'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Operations inbox', title: 'Operations inbox'
    }, el('span', { html: icon('bell') }), badge);

    var wrap = el('div', { class: 'alerts-wrap' }, button, menu);
    wrap.load = function () { loadInbox(); };
    wrap.button = button;
    wrap.menu = menu;
    return wrap;
  }

  function buildQuick() {
    var items = isHod()
      ? [
        { href: '/marks', icon: 'marks', label: 'Enter or finalise marks', note: 'Open the gradebook' },
        { href: '/attendance', icon: 'attendance', label: 'Take attendance', note: 'Start today’s register' },
        { href: '/faculty?add=1', icon: 'userPlus', label: 'Add faculty access', note: 'Create or provision an account' },
        { href: '/progress', icon: 'progress', label: 'Review entry progress', note: 'Find incomplete classes' }
      ]
      : [
        { href: '/marks', icon: 'marks', label: 'Enter marks', note: 'Open your gradebook' },
        { href: '/attendance', icon: 'attendance', label: 'Take attendance', note: 'Start today’s register' },
        { href: '/students', icon: 'students', label: 'Review student signals', note: 'See who needs support' },
        { href: '/assistant', icon: 'sparkles', label: 'Ask the assistant', note: 'Plan the next intervention' }
      ];
    var menu = el('div', { class: 'quick-menu', id: 'quick-menu', hidden: 'hidden' },
      el('div', { class: 'quick-head', text: 'Quick actions' }),
      items.map(function (item) {
        return el('a', { class: 'quick-item', href: item.href },
          el('span', { class: 'quick-item__icon', html: icon(item.icon) }),
          el('span', { class: 'quick-item__copy' },
            el('strong', { text: item.label }),
            el('small', { text: item.note })
          )
        );
      })
    );
    var button = el('button', {
      class: 'icon-btn quick-toggle', type: 'button', id: 'quick-toggle',
      'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Quick actions', title: 'Quick actions'
    }, el('span', { html: icon('plus') }));
    var wrap = el('div', { class: 'quick-wrap' }, button, menu);
    wrap.button = button;
    wrap.menu = menu;
    return wrap;
  }

  function buildUserMenu() {
    var menu = el('div', { class: 'user-menu', id: 'user-menu', hidden: 'hidden' },
      el('div', { class: 'menu__head' },
        el('strong', { text: session.user.name }),
        el('span', { text: session.user.email })
      ),
      el('a', { class: 'menu__item', href: '/account' }, el('span', { html: icon('account') }), 'Profile & password'),
      el('a', { class: 'menu__item', href: '/assistant' }, el('span', { html: icon('assistant') }), 'Ask EduGuard'),
      el('button', { class: 'menu__item', type: 'button', id: 'menu-theme' }, el('span', { html: icon('sun') }), 'Toggle colour theme'),
      el('div', { class: 'menu__sep' }),
      el('button', { class: 'menu__item menu__item--danger', type: 'button', id: 'menu-signout' }, el('span', { html: icon('logout') }), 'Sign out')
    );
    var button = el('button', {
      class: 'user-btn', type: 'button', id: 'user-toggle', 'aria-haspopup': 'menu', 'aria-expanded': 'false'
    },
      avatar(session.user.name),
      el('span', { class: 'user-meta' },
        el('span', { class: 'user-name', text: session.user.name }),
        el('span', { class: 'user-role', text: roleLabel() })
      ),
      el('span', { class: 'user-caret', html: icon('chevron') })
    );
    var wrap = el('div', { class: 'user-wrap' }, button, menu);
    wrap.button = button;
    wrap.menu = menu;
    return wrap;
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
        el('span', { class: 'topbar__brand', text: 'EduGuard' }),
        el('span', { class: 'topbar__sep', html: icon('chevron') }),
        el('strong', { text: crumb, id: 'crumb-current' })
      ),
      el('div', { class: 'topbar__spacer' }),
      session.term ? el('span', { class: 'term-chip', title: session.term.name },
        el('span', { class: 'dot dot--low' }),
        el('span', { text: session.term.name })
      ) : null,
      buildSearch(),
      themeBtn,
      buildInbox(),
      buildQuick(),
      buildUserMenu()
    );
  }

  function render() {
    inbox.loaded = false;
    inbox.data = null;
    var shell = el('div', { class: 'app-shell' + (collapsed() ? ' is-collapsed' : '') },
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
    setCollapsed(collapsed());
  }

  function renderPage() {
    var page = document.getElementById('page');
    if (!page) return;
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
      var holder = head.querySelector('#page-actions');
      if (typeof actions === 'string') holder.innerHTML = actions;
      else if (Array.isArray(actions)) actions.forEach(function (action) { if (action) holder.appendChild(action); });
      else holder.appendChild(actions);
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

    var collapseButton = document.getElementById('sidebar-collapse');
    if (collapseButton) collapseButton.addEventListener('click', function () { setCollapsed(!collapsed()); });

    var voice = document.getElementById('voice-open');
    if (voice) {
      voice.addEventListener('click', function () {
        if (currentKey() === 'assistant') {
          var mic = document.getElementById('assistant-mic');
          if (mic) { mic.click(); return; }
        }
        window.location.assign('/assistant?voice=1');
      });
    }

    var themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', function () {
        var next = ui.resolvedTheme() === 'dark' ? 'light' : 'dark';
        ui.setTheme(next);
        themeToggle.innerHTML = icon(next === 'dark' ? 'sun' : 'moon');
      });
    }

    /* Popovers: inbox, quick actions, user menu --------------------------------- */
    var alertsMenu = document.getElementById('alerts-menu');
    var alertsToggle = document.getElementById('alerts-toggle');
    var quickMenu = document.getElementById('quick-menu');
    var quickToggle = document.getElementById('quick-toggle');
    var userMenu = document.getElementById('user-menu');
    var userToggle = document.getElementById('user-toggle');

    function closeAll() {
      [alertsMenu, quickMenu, userMenu].forEach(function (menu) {
        if (menu) menu.hidden = true;
      });
      [alertsToggle, quickToggle, userToggle].forEach(function (button) {
        if (button) button.setAttribute('aria-expanded', 'false');
      });
    }
    function bind(button, menu, onOpen) {
      if (!button || !menu) return;
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        var open = menu.hidden;
        closeAll();
        menu.hidden = !open;
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open && onOpen) onOpen();
      });
      menu.addEventListener('click', function (event) { event.stopPropagation(); });
    }
    bind(alertsToggle, alertsMenu, loadInbox);
    bind(quickToggle, quickMenu);
    bind(userToggle, userMenu);
    document.addEventListener('click', closeAll);
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeAll(); });

    var menuTheme = document.getElementById('menu-theme');
    if (menuTheme) {
      menuTheme.addEventListener('click', function () {
        ui.setTheme(ui.resolvedTheme() === 'dark' ? 'light' : 'dark');
        closeAll();
      });
    }
    var menuSignout = document.getElementById('menu-signout');
    if (menuSignout) menuSignout.addEventListener('click', signOut);
    var sidebarUser = document.getElementById('sidebar-user');
    if (sidebarUser) {
      sidebarUser.addEventListener('click', function () { window.location.assign('/account'); });
    }

    if (alertsMenu) loadInbox();

    var searchTrigger = document.getElementById('command-trigger');
    if (searchTrigger) searchTrigger.addEventListener('click', openCommand);

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

  function loadInbox() {
    if (inbox.loaded) return Promise.resolve(inbox.data);
    var menu = document.getElementById('alerts-menu');
    if (!menu) return Promise.resolve(null);
    var list = document.getElementById('alerts-list');
    var summary = document.getElementById('alert-summary');
    var toggle = document.getElementById('alerts-toggle');
    var badge = document.getElementById('alert-badge');
    return EG.api.get('/api/alerts').then(function (data) {
      inbox.loaded = true;
      inbox.data = data;
      var total = Number(data.total) || 0;
      if (badge) {
        badge.textContent = total > 9 ? '9+' : String(total);
        if (total === 0) badge.hidden = true; else badge.hidden = false;
      }
      if (toggle) toggle.setAttribute('aria-label', total ? 'Operations inbox, ' + total + ' open' : 'Operations inbox, all clear');
      if (summary) summary.textContent = total ? data.message : (data.classes ? 'No open entry gaps.' : data.message);
      if (!list) return data;
      list.textContent = '';
      if (!data.items || !data.items.length) {
        list.appendChild(el('div', { class: 'alerts-empty' },
          el('span', { class: 'alerts-empty__icon', html: icon('check') }),
          el('strong', { text: 'All clear' }),
          el('span', { text: data.message })
        ));
        return data;
      }
      data.items.forEach(function (item) {
        list.appendChild(el('a', { class: 'alert-item is-' + item.tone, href: item.href },
          el('span', { class: 'alert-icon', html: icon(item.tone === 'info' ? 'info' : 'warning') }),
          el('span', { class: 'alert-copy' },
            el('strong', { text: item.title }),
            el('small', { text: item.detail }),
            el('em', { text: item.meta })
          )
        ));
      });
      if (total > data.items.length) {
        list.appendChild(el('p', { class: 'alerts-more', text: 'Showing ' + data.items.length + ' of ' + total + '. Open the workspace for the full list.' }));
      }
      return data;
    }).catch(function (error) {
      if (summary) summary.textContent = 'Could not load alerts.';
      if (!list) return null;
      list.textContent = '';
      list.appendChild(el('div', { class: 'alerts-empty is-error' },
        el('span', { class: 'alerts-empty__icon', html: icon('warning') }),
        el('strong', { text: 'Inbox unavailable' }),
        el('span', { text: error.message }),
        el('button', {
          class: 'btn btn--sm', type: 'button',
          onClick: function () { inbox.loaded = false; loadInbox(); }
        }, 'Try again')
      ));
      return null;
    });
  }

  async function signOut() {
    try { await EG.api.post('/api/auth/logout'); } catch (error) { /* session already gone */ }
    session.user = null;
    window.location.replace('/login');
  }

  function commands() {
    var list = navItems().map(function (item) {
      return {
        label: item.label,
        hint: 'Page',
        icon: item.icon,
        run: function () { window.location.href = item.href; }
      };
    });
    list.push({ label: 'Profile & password', hint: 'You', icon: 'account', run: function () { window.location.href = '/account'; } });
    list.push({ label: 'Toggle colour theme', hint: 'Display', icon: 'sun', run: function () { ui.setTheme(ui.resolvedTheme() === 'dark' ? 'light' : 'dark'); } });
    if (isHod()) {
      list.push({ label: 'Invite a faculty member', hint: 'Action', icon: 'plus', run: function () { window.location.href = '/faculty?add=1'; } });
      list.push({ label: 'Review data progress', hint: 'Action', icon: 'progress', run: function () { window.location.href = '/progress'; } });
      list.push({ label: 'Export at-risk students', hint: 'Action', icon: 'download', run: function () { EG.api.download('/api/export/at-risk.csv').catch(function (error) { ui.toast(error.message, 'error'); }); } });
      list.push({ label: 'Reset demo data', hint: 'Danger zone', icon: 'refresh', run: function () { window.location.href = '/settings#demo'; } });
    }
    list.push({ label: 'Sign out', hint: 'Session', icon: 'logout', run: signOut });
    return list;
  }

  function openCommand() {
    if (document.getElementById('command-palette')) return;
    var input = el('input', { class: 'command__input', type: 'search', placeholder: 'Search pages or a student name…', autocomplete: 'off', 'aria-label': 'Search pages and students' });
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
    var students = [];
    var active = 0;
    var controller = null;

    function studentCommand(row) {
      return {
        label: row.name,
        hint: row.roll + ' · ' + row.sectionName,
        icon: 'students',
        student: true,
        run: function () { window.location.href = EG.pages && EG.pages.studentHref ? EG.pages.studentHref(row.id) : '/student?id=' + encodeURIComponent(row.id); }
      };
    }

    function renderList() {
      var q = ui.deburr(input.value.trim());
      var pages = !q ? all : all.filter(function (item) {
        return ui.deburr(item.label + ' ' + item.hint).includes(q);
      });
      var people = students.map(studentCommand);
      filtered = pages.concat(people);
      if (active >= filtered.length) active = Math.max(0, filtered.length - 1);
      list.textContent = '';
      if (!filtered.length) {
        list.appendChild(el('div', { class: 'empty', style: { padding: '24px' } }, el('p', { text: 'No matching commands.' })));
        return;
      }
      if (pages.length) list.appendChild(el('p', { class: 'command__group', text: 'Pages & actions' }));
      pages.forEach(function (item, index) {
        list.appendChild(commandButton(item, index === active));
      });
      if (people.length) list.appendChild(el('p', { class: 'command__group', text: 'Students' }));
      people.forEach(function (item, index) {
        list.appendChild(commandButton(item, pages.length + index === active));
      });
    }

    function commandButton(item, isActive) {
      return el('button', {
        class: 'command__item' + (isActive ? ' is-active' : ''),
        type: 'button', role: 'option',
        onClick: function () { run(item); }
      }, el('span', { html: icon(item.icon) }), el('span', { text: item.label }), el('span', { class: 'faint small', text: item.hint }));
    }

    var searchStudents = ui.debounce(function (value) {
      if (value.length < 2) { students = []; renderList(); return; }
      if (controller) controller.abort();
      controller = typeof AbortController === 'function' ? new AbortController() : null;
      EG.api.get('/api/students', { q: value, limit: 5 }, controller ? { signal: controller.signal } : undefined)
        .then(function (data) { students = data.rows || []; renderList(); })
        .catch(function () { /* a failed quick search should not interrupt the palette */ });
    }, 180);

    function highlight() {
      Array.prototype.forEach.call(list.querySelectorAll('.command__item'), function (node, index) {
        node.classList.toggle('is-active', index === active);
        if (index === active && node.scrollIntoView) node.scrollIntoView({ block: 'nearest' });
      });
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

    input.addEventListener('input', function () {
      active = 0;
      renderList();
      searchStudents(input.value.trim());
    });
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
    nav: NAV,
    refreshInbox: function () { inbox.loaded = false; return loadInbox(); },
    openCommand: openCommand
  };

  EG.ready = boot();
})();
