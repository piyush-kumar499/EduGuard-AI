/* Shared page-building helpers. Loaded after the shell and before page modules. */
(function () {
  'use strict';

  var EG = window.EG = window.EG || {};
  var ui = EG.ui;
  var el = ui.el;

  function scope() {
    return (EG.ready && EG.session && EG.session.scope) || (EG.session && EG.session.scope) || { role: 'FACULTY', subjects: [], sections: [], assignments: [] };
  }

  function subjects() {
    return scope().subjects || [];
  }

  function sections() {
    return scope().sections || [];
  }

  function pairs() {
    var s = scope();
    if (s.role !== 'HOD') {
      return (s.assignments || []).map(function (row) {
        return { subjectId: row.subjectId, sectionId: row.sectionId, subjectName: row.subjectName, sectionName: row.sectionName };
      });
    }
    var list = [];
    (s.subjects || []).forEach(function (subject) {
      (s.sections || []).forEach(function (section) {
        list.push({ subjectId: subject.id, sectionId: section.id, subjectName: subject.name, sectionName: section.name });
      });
    });
    return list;
  }

  function sectionsForSubject(subjectId) {
    var s = scope();
    if (s.role === 'HOD') return sections();
    var seen = {};
    return (s.assignments || []).filter(function (row) { return row.subjectId === subjectId; }).map(function (row) {
      if (seen[row.sectionId]) return null;
      seen[row.sectionId] = true;
      return { id: row.sectionId, name: row.sectionName };
    }).filter(Boolean);
  }

  function option(value, label) {
    return { value: value, label: label };
  }

  function subjectOptions(extra) {
    return (extra ? [option('', extra)] : []).concat(subjects().map(function (subject) {
      return option(subject.id, subject.code ? subject.name + ' · ' + subject.code : subject.name);
    }));
  }

  function sectionOptions(extra) {
    return (extra ? [option('', extra)] : []).concat(sections().map(function (section) {
      return option(section.id, section.name + (section.branch ? ' · ' + section.branch : ''));
    }));
  }

  function field(label, control, hint, className) {
    return el('div', { class: 'field' + (className ? ' ' + className : '') },
      el('label', { for: control.id || null, text: label }),
      control,
      hint ? el('div', { class: 'field__hint', text: hint }) : null
    );
  }

  function select(options, attrs) {
    attrs = attrs || {};
    var node = el('select', { class: 'select' + (attrs.class ? ' ' + attrs.class : ''), name: attrs.name || '', id: attrs.id || '' });
    (options || []).forEach(function (item) {
      node.appendChild(el('option', { value: item.value, text: item.label, selected: String(item.value) === String(attrs.value) }));
    });
    if (attrs.disabled) node.disabled = true;
    return node;
  }

  function kpi(options) {
    var tone = options.tone || 'brand';
    return el('div', { class: 'kpi' + (tone !== 'brand' ? ' kpi--' + tone : '') },
      el('div', { class: 'kpi__top' },
        el('span', { class: 'kpi__label', text: options.label }),
        options.icon ? el('span', { class: 'kpi__icon', html: ui.icon(options.icon, 15) }) : null
      ),
      el('div', { class: 'kpi__value', html: options.html || ui.esc(options.value) }, options.suffix ? el('small', { text: ' ' + options.suffix }) : null),
      options.foot ? el('div', { class: 'kpi__foot', html: options.footHtml ? options.foot : ui.esc(options.foot) }) : null
    );
  }

  function card(options) {
    var head = options.title || options.actions
      ? el('div', { class: 'card__head' },
        el('div', null,
          options.title ? el('h2', { text: options.title }) : null,
          options.subtitle ? el('p', { text: options.subtitle }) : null
        ),
        options.actions || null
      )
      : null;
    var body;
    if (options.raw) body = options.body;
    else {
      body = el('div', { class: options.flush ? 'card__body card__body--flush' : 'card__body' });
      if (typeof options.body === 'string') body.innerHTML = options.body;
      else if (options.body) body.appendChild(options.body);
    }
    var node = el('section', { class: 'card' + (options.className ? ' ' + options.className : '') }, head, body);
    if (options.foot) node.appendChild(el('div', { class: 'card__foot' }, options.foot));
    return node;
  }

  function meter(value, level, extra) {
    var width = value === null || value === undefined || !Number.isFinite(Number(value)) ? 0 : Math.max(0, Math.min(100, Number(value)));
    return el('div', { class: 'meter' + (extra ? ' ' + extra : '') },
      el('span', { class: 'meter__fill' + (level ? ' meter__fill--' + level : ''), style: { width: width + '%' } })
    );
  }

  function empty(title, text, action, icon) {
    return ui.empty({ title: title, text: text, action: action, icon: icon || 'info' });
  }

  function pageHead(options) {
    return { title: options.title, subtitle: options.subtitle, actions: options.actions || null };
  }

  function mount(options) {
    return EG.shell.mount(options);
  }

  function setActions(actions) {
    return EG.shell.setActions(actions);
  }

  function setContent(content) {
    return EG.shell.setContent(content);
  }

  function guard(loader) {
    return EG.ready.then(function (session) {
      if (!session) return null;
      EG.pages.session = session;
      EG.pages.scope = session.scope;
      return Promise.resolve(loader(session)).catch(function (error) {
        if (error && error.status === 401) return null;
        var content = document.getElementById('page-content');
        if (content) {
          content.textContent = '';
          content.appendChild(ui.errorState(error, function () { window.location.reload(); }));
        } else {
          ui.toast(error.message || 'The page could not be loaded.', 'error');
        }
        return null;
      });
    });
  }

  function loading(nodes) {
    if (nodes) return nodes;
    return ui.skeletonPage();
  }

  function busy(button, promise) {
    var original = button ? button.innerHTML : null;
    if (button) {
      button.disabled = true;
      button.innerHTML = '<span class="spinner" aria-hidden="true"></span> Working…';
    }
    return Promise.resolve(promise).finally(function () {
      if (button) {
        button.disabled = false;
        button.innerHTML = original;
      }
    });
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { ui.toast('Copied to the clipboard.', 'success'); });
    }
    var area = el('textarea', { style: { position: 'fixed', opacity: '0' } });
    area.value = text;
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); ui.toast('Copied to the clipboard.', 'success'); } catch (error) { ui.toast('Copy failed. Select the text manually.', 'error'); }
    area.remove();
    return Promise.resolve();
  }

  function download(filename, rows, columns) {
    EG.csv.download(filename, rows, columns);
  }

  /** Modal form with server-side field error rendering. */
  function formModal(options) {
    return new Promise(function (resolve) {
      var settled = false;
      function finish(value) { if (!settled) { settled = true; resolve(value); } }
      var form = el('form', { class: 'stack', id: 'modal-form', novalidate: true });
      var grid = el('div', { class: 'form-grid' });
      var inputs = {};
      (options.fields || []).forEach(function (spec) {
        var id = 'f-' + spec.name;
        var control;
        var value = spec.value === undefined || spec.value === null ? '' : spec.value;
        if (spec.type === 'select') {
          control = select(spec.options || [], { id: id, name: spec.name, value: value, disabled: spec.disabled });
        } else if (spec.type === 'checkbox') {
          control = el('label', { class: 'check' },
            el('input', { type: 'checkbox', id: id, name: spec.name, checked: Boolean(value) }),
            el('span', { text: spec.label || '' })
          );
        } else if (spec.type === 'textarea') {
          control = el('textarea', { class: 'textarea', id: id, name: spec.name, rows: spec.rows || 3, placeholder: spec.placeholder || '', maxlength: spec.maxlength || null });
          control.value = value;
        } else {
          control = el('input', {
            class: 'input', id: id, name: spec.name,
            type: spec.type || 'text', placeholder: spec.placeholder || '',
            autocomplete: spec.autocomplete || 'off',
            min: spec.min, max: spec.max, step: spec.step, maxlength: spec.maxlength
          });
          control.value = value;
        }
        inputs[spec.name] = control;
        grid.appendChild(el('div', { class: spec.span ? 'span-2' : null },
          spec.type === 'checkbox'
            ? el('div', { class: 'field' }, control, spec.hint ? el('div', { class: 'field__hint', text: spec.hint }) : null)
            : field(spec.label || spec.name, control, spec.hint)
        ));
      });
      form.appendChild(grid);
      var errorBox = el('div', { class: 'error-box', hidden: true });
      if (options.extra) form.appendChild(options.extra);
      form.appendChild(errorBox);
      if (options.afterRender) options.afterRender(inputs, form);

      var submit = el('button', { class: 'btn btn--primary', type: 'submit', form: 'modal-form', text: options.submitLabel || 'Save' });
      var cancel = el('button', { class: 'btn', type: 'button', onClick: function () { modal.close(); }, text: 'Cancel' });
      var modal = ui.modal({
        title: options.title,
        subtitle: options.subtitle,
        wide: options.wide,
        narrow: options.narrow,
        body: form,
        footer: el('div', { class: 'row row--end gap-2 w-100' }, cancel, submit),
        onClose: function () { finish(null); }
      });

      function read() {
        var values = {};
        (options.fields || []).forEach(function (spec) {
          var control = inputs[spec.name];
          if (spec.type === 'checkbox') values[spec.name] = control.checked;
          else if (spec.type === 'number') values[spec.name] = control.value === '' ? null : Number(control.value);
          else values[spec.name] = control.value.trim();
        });
        return values;
      }

      form.addEventListener('submit', function (event) {
        event.preventDefault();
        errorBox.hidden = true;
        form.querySelectorAll('.field__error[data-generated]').forEach(function (node) { node.remove(); });
        form.querySelectorAll('.is-invalid').forEach(function (node) { node.classList.remove('is-invalid'); });
        var values = read();
        if (options.validate) {
          var message = options.validate(values);
          if (message) {
            errorBox.hidden = false;
            errorBox.innerHTML = ui.icon('warning', 17) + '<div>' + ui.esc(message) + '</div>';
            return;
          }
        }
        submit.disabled = true;
        submit.innerHTML = '<span class="spinner" aria-hidden="true"></span> Saving…';
        Promise.resolve(options.onSubmit(values, form)).then(function (result) {
          if (result === false) return;
          finish(result === undefined ? values : result);
          modal.close(result);
        }).catch(function (error) {
          errorBox.hidden = false;
          errorBox.innerHTML = ui.icon('warning', 17) + '<div>' + ui.esc(error.message || 'Check the form and try again.') + '</div>';
          ui.applyFieldErrors(form, error);
        }).finally(function () {
          submit.disabled = false;
          submit.innerHTML = options.submitLabel || 'Save';
        });
      });
    });
  }

  /** Subject + section pickers that respect faculty assignments. */
  function pairPicker(options) {
    options = options || {};
    var list = pairs();
    if (!list.length) {
      return { root: el('div', { class: 'info-box' }, 'No teaching assignments are configured for this term.'), value: function () { return null; }, subjectSelect: null, sectionSelect: null };
    }
    var current = options.value || list[0];
    var subjectSelect = select(subjects().map(function (subject) { return option(subject.id, subject.name); }), { value: current.subjectId });
    var sectionSelect = select([], { value: current.sectionId });
    function syncSections(preferred) {
      var allowed = sectionsForSubject(subjectSelect.value);
      sectionSelect.textContent = '';
      allowed.forEach(function (section) {
        sectionSelect.appendChild(el('option', { value: section.id, text: section.name, selected: section.id === preferred }));
      });
      if (!sectionSelect.value && allowed.length) sectionSelect.value = allowed[0].id;
    }
    syncSections(current.sectionId);
    subjectSelect.addEventListener('change', function () {
      syncSections(null);
      if (options.onChange) options.onChange(subjectSelect.value, sectionSelect.value);
    });
    sectionSelect.addEventListener('change', function () {
      if (options.onChange) options.onChange(subjectSelect.value, sectionSelect.value);
    });
    var root = el('div', { class: 'row row--wrap gap-3' },
      el('div', { class: 'field' }, el('label', { text: options.subjectLabel || 'Subject' }), subjectSelect),
      el('div', { class: 'field' }, el('label', { text: options.sectionLabel || 'Section' }), sectionSelect)
    );
    return {
      root: root,
      subjectSelect: subjectSelect,
      sectionSelect: sectionSelect,
      value: function () {
        var subjectId = subjectSelect.value;
        var valid = sectionsForSubject(subjectId).some(function (section) { return section.id === sectionSelect.value; });
        return { subjectId: subjectId, sectionId: valid ? sectionSelect.value : (sectionsForSubject(subjectId)[0] || {}).id };
      },
      set: function (subjectId, sectionId) {
        subjectSelect.value = subjectId;
        syncSections(sectionId);
      }
    };
  }

  function studentHref(id) {
    return '/student?id=' + encodeURIComponent(id);
  }

  function optionLabel(row) {
    if (!row) return '';
    return row.name || row.label || '';
  }

  EG.pages = {
    scope: scope,
    subjects: subjects,
    sections: sections,
    pairs: pairs,
    sectionsForSubject: sectionsForSubject,
    subjectOptions: subjectOptions,
    sectionOptions: sectionOptions,
    field: field,
    select: select,
    kpi: kpi,
    card: card,
    meter: meter,
    empty: empty,
    mount: mount,
    setActions: setActions,
    setContent: setContent,
    guard: guard,
    busy: busy,
    copy: copy,
    download: download,
    formModal: formModal,
    pairPicker: pairPicker,
    studentHref: studentHref,
    optionLabel: optionLabel
  };
})();
