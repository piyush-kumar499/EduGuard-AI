/* Shared UI primitives: icons, DOM, toasts, modals, formatting, theme. */
(function () {
  'use strict';

  var EG = window.EG = window.EG || {};

  var ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    students: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    marks: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    attendance: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/>',
    subjects: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    heatmap: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    analytics: '<path d="M3 3v18h18"/><path d="m7 15 4-5 3 3 5-7"/>',
    reports: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
    assistant: '<path d="M12 3l1.9 4.6L18 9.5l-4.1 1.9L12 16l-1.9-4.6L6 9.5l4.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>',
    account: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    faculty: '<path d="M12 3 2 8l10 5 10-5-10-5z"/><path d="M6 10v6c0 1.7 2.7 3 6 3s6-1.3 6-3v-6"/>',
    structure: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M6.5 10v4a2 2 0 0 0 2 2H14"/><path d="M14 3h7v7"/>',
    assignments: '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>',
    progress: '<path d="M3 12a9 9 0 1 0 9-9"/><path d="M12 7v5l3 2"/>',
    audit: '<path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.9 19a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    terms: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 15h3M8 18h6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.4-2"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
    check: '<path d="m5 13 4 4L19 7"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    warning: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    sparkles: '<path d="m12 3 1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/><path d="m19 15 .8 1.9L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-1.1z"/><path d="m5 15 .6 1.4L7 17l-1.4.6L5 19l-.6-1.4L3 17l1.4-.6z"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 19v3"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    trendUp: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    trendDown: '<path d="m3 7 6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
    filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    more: '<circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/><circle cx="5" cy="12" r="1.6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    chart: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="0.6"/><rect x="12" y="8" width="3" height="10" rx="0.6"/><rect x="17" y="5" width="3" height="13" rx="0.6"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M16 7l2 2M18 5l2 2"/>',
    eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M17.9 17.9A10.4 10.4 0 0 1 12 19C5 19 1 12 1 12a18.4 18.4 0 0 1 5.1-5.9"/><path d="M9.9 4.2A10.5 10.5 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.2 3.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M1 1l22 22"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    play: '<path d="M6 3l14 9-14 9z"/>',
    pause: '<path d="M8 4v16M16 4v16"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    zap: '<path d="M13 2 3 14h8l-1 8 10-12h-8z"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="m8.2 13.4-1.4 7.1 5.2-3 5.2 3-1.4-7.1"/>',
    database2: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    collapse: '<path d="M15 5 8 12l7 7"/><path d="M19 5v14"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    wave: '<path d="M3 10v4M7 7v10M11 4v16M15 8v8M19 11v2"/>',
    userPlus: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0M18 8v6M15 11h6"/>'
  };

  function icon(name, size) {
    var body = ICONS[name] || ICONS.info;
    return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"' +
      (size ? ' width="' + size + '" height="' + size + '"' : '') + '>' + body + '</svg>';
  }

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    var children = Array.prototype.slice.call(arguments, 2);
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
      children.unshift(attrs);
      attrs = null;
    }
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'class' || key === 'className') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key === 'dataset') Object.keys(value).forEach(function (dataKey) { node.dataset[dataKey] = value[dataKey]; });
        else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
        else if (key.slice(0, 2) === 'on' && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
        else if (key === 'value' || key === 'checked' || key === 'disabled' || key === 'selected' || key === 'readOnly' || key === 'multiple' || key === 'required') node[key] = value;
        else node.setAttribute(key, value);
      });
    }
    children.forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      if (Array.isArray(child)) child.forEach(function (item) { if (item !== null && item !== undefined && item !== false) appendChild(node, item); });
      else appendChild(node, child);
    });
    return node;
  }

  function appendChild(node, child) {
    node.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }

  function frag() {
    var fragment = document.createDocumentFragment();
    Array.prototype.slice.call(arguments).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      if (Array.isArray(child)) child.forEach(function (item) { if (item !== null && item !== undefined && item !== false) appendChild(fragment, item); });
      else appendChild(fragment, child);
    });
    return fragment;
  }

  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function num(value, digits) {
    if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return '—';
    return Number(value).toLocaleString(undefined, {
      minimumFractionDigits: digits === undefined ? 0 : digits,
      maximumFractionDigits: digits === undefined ? 1 : digits
    });
  }

  function pct(value, digits) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    return num(value, digits === undefined ? 1 : digits) + '%';
  }

  function date(value, style) {
    if (!value) return '—';
    var parsed = new Date(String(value).length <= 10 ? String(value) + 'T00:00:00' : value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    var options = style === 'long'
      ? { day: 'numeric', month: 'long', year: 'numeric' }
      : style === 'short'
        ? { day: 'numeric', month: 'short' }
        : { day: '2-digit', month: 'short', year: 'numeric' };
    return parsed.toLocaleDateString('en-GB', options);
  }

  function dateTime(value) {
    if (!value) return '—';
    var parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function timeAgo(value) {
    if (!value) return '—';
    var then = new Date(value).getTime();
    if (Number.isNaN(then)) return String(value);
    var diff = Math.round((Date.now() - then) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.round(diff / 60) + 'm ago';
    if (diff < 86400) return Math.round(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.round(diff / 86400) + 'd ago';
    return date(value);
  }

  function plural(count, singular, pluralForm) {
    return count === 1 ? singular : (pluralForm || singular + 's');
  }

  function levelPill(level, label) {
    var labels = { high: 'Needs support', medium: 'Watch closely', low: 'On track' };
    return '<span class="pill pill--' + esc(level || 'nodata') + '"><span class="dot dot--' + esc(level || '') + '"></span>' +
      esc(label || labels[level] || 'No entries yet') + '</span>';
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      var context = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(context, args); }, wait || 250);
    };
  }

  function throttle(fn, wait) {
    var last = 0;
    var timer = null;
    return function () {
      var args = arguments;
      var context = this;
      var now = Date.now();
      var remaining = wait - (now - last);
      if (remaining <= 0) {
        clearTimeout(timer);
        timer = null;
        last = now;
        fn.apply(context, args);
      } else if (!timer) {
        timer = setTimeout(function () {
          last = Date.now();
          timer = null;
          fn.apply(context, args);
        }, remaining);
      }
    };
  }

  function toast(message, type, title) {
    var region = document.getElementById('toast-region');
    if (!region) {
      region = el('div', { id: 'toast-region', class: 'toast-region', 'aria-live': 'polite' });
      document.body.appendChild(region);
    }
    type = type || 'info';
    var iconName = type === 'error' ? 'warning' : type === 'success' ? 'check' : 'info';
    var node = el('div', { class: 'toast toast--' + type, role: 'status' },
      el('span', { html: icon(iconName, 17) }),
      el('div', { class: 'toast__body' },
        title ? el('div', { class: 'toast__title', text: title }) : null,
        el('div', { text: message })
      ),
      el('button', { class: 'toast__close', type: 'button', 'aria-label': 'Dismiss', onClick: function () { dismiss(); } }, el('span', { html: icon('x', 15) }))
    );
    region.appendChild(node);
    var timer = setTimeout(dismiss, type === 'error' ? 6500 : 4200);
    function dismiss() {
      clearTimeout(timer);
      if (!node.isConnected) return;
      node.classList.add('is-leaving');
      setTimeout(function () { node.remove(); }, 170);
    }
    return dismiss;
  }

  var activeModals = [];

  function openModal(options) {
    options = options || {};
    var previousFocus = document.activeElement;
    var panel = el('div', { class: 'modal__panel' + (options.wide ? ' modal__panel--wide' : '') + (options.narrow ? ' modal__panel--narrow' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': options.title || 'Dialog' });
    var body = el('div', { class: 'modal__body' });
    var content = options.body;
    if (typeof content === 'string') body.innerHTML = content;
    else if (content) body.appendChild(content);

    var head = el('div', { class: 'modal__head' },
      el('div', null,
        el('h2', { text: options.title || 'Dialog' }),
        options.subtitle ? el('p', { text: options.subtitle }) : null
      ),
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onClick: function () { close(); } }, el('span', { html: icon('x') }))
    );

    panel.appendChild(head);
    panel.appendChild(body);
    if (options.footer) {
      var foot = el('div', { class: 'modal__foot' });
      if (typeof options.footer === 'string') foot.innerHTML = options.footer;
      else foot.appendChild(options.footer);
      panel.appendChild(foot);
    }

    var overlay = el('div', { class: 'modal', onMousedown: function (event) { if (event.target === overlay && options.dismissible !== false) close(); } }, panel);
    document.body.appendChild(overlay);
    document.body.classList.add('no-scroll');
    activeModals.push(overlay);

    function onKey(event) {
      if (event.key === 'Escape' && options.dismissible !== false) { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab') return;
      var focusable = panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);

    var closed = false;
    function close(result) {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      activeModals = activeModals.filter(function (item) { return item !== overlay; });
      if (!activeModals.length) document.body.classList.remove('no-scroll');
      if (previousFocus && previousFocus.focus) previousFocus.focus();
      if (options.onClose) options.onClose(result);
    }

    setTimeout(function () {
      var target = panel.querySelector('[autofocus]') || panel.querySelector('input, select, textarea, button');
      if (target) target.focus();
    }, 30);

    return { close: close, panel: panel, body: body, overlay: overlay };
  }

  function confirmDialog(options) {
    options = options || {};
    return new Promise(function (resolve) {
      var settled = false;
      function finish(value) { if (!settled) { settled = true; resolve(value); } }
      var modal = openModal({
        title: options.title || 'Are you sure?',
        subtitle: options.message || '',
        narrow: true,
        onClose: function () { finish(false); },
        body: options.body || null,
        footer: frag(
          el('button', { class: 'btn', type: 'button', onClick: function () { modal.close(); } }, 'Cancel'),
          el('button', { class: 'btn ' + (options.danger ? 'btn--danger' : 'btn--primary'), type: 'button', onClick: function () { finish(true); modal.close(); } }, options.confirmLabel || 'Confirm')
        )
      });
    });
  }

  function promptReason(options) {
    options = options || {};
    return new Promise(function (resolve) {
      var settled = false;
      function finish(value) { if (!settled) { settled = true; resolve(value); } }
      var input = el('textarea', { class: 'textarea', rows: 3, placeholder: options.placeholder || 'Explain briefly why this change is needed.', maxlength: 500 });
      var error = el('div', { class: 'field__error', hidden: true });
      var min = options.min || 4;
      var modal = openModal({
        title: options.title || 'Add a reason',
        subtitle: options.message || 'This reason is stored in the audit log.',
        narrow: true,
        onClose: function () { finish(null); },
        body: el('div', { class: 'field' }, el('label', { text: options.label || 'Reason' }), input, error),
        footer: frag(
          el('button', { class: 'btn', type: 'button', onClick: function () { modal.close(); } }, 'Cancel'),
          el('button', { class: 'btn btn--primary', type: 'button', onClick: submit }, options.confirmLabel || 'Save reason')
        )
      });
      function submit() {
        var value = input.value.trim();
        if (value.length < min) {
          error.hidden = false;
          error.textContent = 'Please write at least ' + min + ' characters.';
          input.focus();
          return;
        }
        finish(value);
        modal.close();
      }
      input.addEventListener('keydown', function (event) {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); submit(); }
      });
      setTimeout(function () { input.focus(); }, 40);
    });
  }

  function emptyState(options) {
    options = options || {};
    return el('div', { class: 'empty' },
      el('div', { class: 'empty__icon', html: icon(options.icon || 'info', 22) }),
      el('h3', { text: options.title || 'Nothing here yet' }),
      options.text ? el('p', { text: options.text }) : null,
      options.action || null
    );
  }

  function errorState(error, retry) {
    return el('div', { class: 'empty' },
      el('div', { class: 'empty__icon', style: { background: 'var(--danger-soft)', color: 'var(--danger)' }, html: icon('warning', 22) }),
      el('h3', { text: 'Something went wrong' }),
      el('p', { text: error && error.message ? error.message : 'Please try again.' }),
      retry ? el('button', { class: 'btn btn--sm', type: 'button', onClick: retry }, 'Try again') : null
    );
  }

  function skeletonPage() {
    return el('div', { class: 'page-loader', 'aria-label': 'Loading' },
      el('div', { class: 'skeleton skeleton--title' }),
      el('div', { class: 'grid grid--4' }, [1, 2, 3, 4].map(function () { return el('div', { class: 'skeleton', style: { height: '96px' } }); })),
      el('div', { class: 'skeleton skeleton--card' }),
      el('div', { class: 'skeleton skeleton--card' })
    );
  }

  function fieldError(error, name) {
    return error && error.fields && error.fields[name] ? error.fields[name] : null;
  }

  function applyFieldErrors(form, error) {
    if (!form) return;
    form.querySelectorAll('.field__error[data-generated]').forEach(function (node) { node.remove(); });
    form.querySelectorAll('.is-invalid').forEach(function (node) { node.classList.remove('is-invalid'); });
    var fields = error && error.fields;
    if (!fields) return;
    Object.keys(fields).forEach(function (name) {
      var input = form.querySelector('[name="' + name.replace(/"/g, '\\"') + '"]');
      if (!input) return;
      input.classList.add('is-invalid');
      var message = document.createElement('div');
      message.className = 'field__error';
      message.dataset.generated = 'true';
      message.textContent = fields[name];
      input.closest('.field') ? input.closest('.field').appendChild(message) : input.parentNode.appendChild(message);
    });
  }

  function serialize(form) {
    var result = {};
    new FormData(form).forEach(function (value, key) {
      if (result[key] === undefined) result[key] = value;
      else if (Array.isArray(result[key])) result[key].push(value);
      else result[key] = [result[key], value];
    });
    return result;
  }

  function themeChoice() {
    return localStorage.getItem('eg-theme') || 'system';
  }

  function resolvedTheme(choice) {
    choice = choice || themeChoice();
    if (choice === 'system') {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return choice;
  }

  function applyTheme(choice) {
    var resolved = resolvedTheme(choice);
    document.documentElement.setAttribute('data-theme', resolved);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0d1020' : '#ffffff');
  }

  function setTheme(choice) {
    localStorage.setItem('eg-theme', choice);
    applyTheme(choice);
    document.dispatchEvent(new CustomEvent('eg:theme', { detail: { choice: choice, resolved: resolvedTheme(choice) } }));
  }

  function initTheme() {
    applyTheme();
    if (window.matchMedia) {
      var query = window.matchMedia('(prefers-color-scheme: dark)');
      var listener = function () { if (themeChoice() === 'system') applyTheme('system'); };
      if (query.addEventListener) query.addEventListener('change', listener);
      else if (query.addListener) query.addListener(listener);
    }
  }

  function deburr(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function sortBy(rows, getter, direction) {
    var dir = direction === 'desc' ? -1 : 1;
    return rows.slice().sort(function (a, b) {
      var left = getter(a);
      var right = getter(b);
      if (left === right) return 0;
      if (left === null || left === undefined) return 1;
      if (right === null || right === undefined) return -1;
      if (typeof left === 'string') return left.localeCompare(right) * dir;
      return (left < right ? -1 : 1) * dir;
    });
  }

  function queryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function setQuery(params, replace) {
    var url = new URL(window.location.href);
    Object.keys(params).forEach(function (key) {
      var value = params[key];
      if (value === null || value === undefined || value === '') url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    });
    window.history[replace ? 'replaceState' : 'pushState']({}, '', url.toString());
  }

  EG.ui = {
    icon: icon,
    esc: esc,
    el: el,
    frag: frag,
    initials: initials,
    num: num,
    pct: pct,
    date: date,
    dateTime: dateTime,
    timeAgo: timeAgo,
    plural: plural,
    levelPill: levelPill,
    debounce: debounce,
    throttle: throttle,
    toast: toast,
    modal: openModal,
    confirm: confirmDialog,
    promptReason: promptReason,
    empty: emptyState,
    errorState: errorState,
    skeletonPage: skeletonPage,
    fieldError: fieldError,
    applyFieldErrors: applyFieldErrors,
    serialize: serialize,
    theme: themeChoice,
    resolvedTheme: resolvedTheme,
    applyTheme: applyTheme,
    setTheme: setTheme,
    initTheme: initTheme,
    deburr: deburr,
    sortBy: sortBy,
    queryParam: queryParam,
    setQuery: setQuery
  };
})();
