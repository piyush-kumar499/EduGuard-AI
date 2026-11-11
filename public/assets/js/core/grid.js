/* Marks spreadsheet: keyboard navigation, paste, validation and autosave. */
(function () {
  'use strict';

  var EG = window.EG = window.EG || {};
  var ui = EG.ui;
  var el = ui.el;
  var icon = ui.icon;

  function round(value, digits) {
    var factor = Math.pow(10, digits === undefined ? 1 : digits);
    return Math.round(Number(value) * factor) / factor;
  }

  function percentOf(mark, max, absentCountsAsZero) {
    if (!mark) return null;
    if (mark.status === 'exempt') return null;
    if (mark.status === 'absent') return absentCountsAsZero === false ? null : 0;
    if (mark.score === null || mark.score === undefined || mark.score === '') return null;
    var maxValue = Number(max);
    if (!(maxValue > 0)) return null;
    return round(Math.max(0, Math.min(100, (Number(mark.score) / maxValue) * 100)), 1);
  }

  function applyRule(entries, rule, n) {
    var usable = entries.filter(function (entry) { return entry.percent !== null && entry.percent !== undefined; });
    if (!usable.length) return null;
    if (rule === 'best_n') {
      var take = Math.max(1, Math.min(Number(n) || usable.length, usable.length));
      var best = usable.slice().sort(function (a, b) { return b.percent - a.percent; }).slice(0, take);
      return round(best.reduce(function (sum, item) { return sum + item.percent; }, 0) / best.length, 1);
    }
    if (rule === 'sum') {
      var score = usable.reduce(function (sum, item) { return sum + item.score; }, 0);
      var max = usable.reduce(function (sum, item) { return sum + item.max; }, 0);
      return max > 0 ? round(Math.max(0, Math.min(100, (score / max) * 100)), 1) : null;
    }
    return round(usable.reduce(function (sum, item) { return sum + item.percent; }, 0) / usable.length, 1);
  }

  function MarksGrid(container, options) {
    this.container = container;
    this.options = options || {};
    this.data = this.options.data;
    this.selectedId = this.options.selectedAssessmentId || (this.data.assessment && this.data.assessment.id);
    this.role = (this.data.scope || 'HOD');
    this.dirty = new Map();
    this.saving = false;
    this.pending = false;
    this.timer = null;
    this.lastSavedAt = null;
    this.root = null;
    this.beforeUnload = this.beforeUnload.bind(this);
    this.render();
    window.addEventListener('beforeunload', this.beforeUnload);
  }

  MarksGrid.prototype.beforeUnload = function (event) {
    if (!this.dirty.size) return;
    event.preventDefault();
    event.returnValue = 'You have unsaved marks.';
    return event.returnValue;
  };

  MarksGrid.prototype.render = function () {
    var self = this;
    var data = this.data;
    var currentUserId = data.currentUserId;
    var role = data.scope;
    this.dirty.clear();
    var wrap = el('div', { class: 'marks-grid' });

    if (data.assessment.locked && role !== 'HOD') {
      wrap.appendChild(el('div', { class: 'locked-banner' },
        el('span', { html: icon('lock', 14) }),
        'This assessment is finalised and read-only. Ask the HOD to unlock it if a correction is needed.'
      ));
    }

    var sheetWrap = el('div', { class: 'sheet-wrap', tabindex: '-1' });
    var table = el('table', { class: 'sheet', 'aria-label': 'Marks for ' + data.assessment.title });
    var thead = el('thead');
    var headRow = el('tr',
      el('th', { class: 'roll-col', scope: 'col', text: 'Roll' }),
      el('th', { class: 'name-col', scope: 'col', text: 'Student' })
    );
    data.assessments.forEach(function (assessment) {
      var selected = assessment.id === self.selectedId;
      var average = data.stats[assessment.id] && data.stats[assessment.id].average;
      var th = el('th', {
        class: 'assessment-col' + (selected ? ' is-current' : ''),
        scope: 'col',
        title: assessment.title + ' · ' + assessment.typeName + ' · out of ' + assessment.maxMarks,
        dataset: { aid: assessment.id }
      },
        el('div', { class: 'row gap-1', style: { justifyContent: 'center' } },
          assessment.locked ? el('span', { html: icon('lock', 11), style: { color: 'var(--warning)' } }) : null,
          el('span', { text: assessment.title })
        ),
        el('div', { class: 'xs faint', style: { fontWeight: '500', textTransform: 'none', letterSpacing: '0' } },
          assessment.typeName + ' · /' + assessment.maxMarks + ' · avg ',
          el('span', { dataset: { statAid: assessment.id }, text: average === null || average === undefined ? '—' : String(average) })
        )
      );
      headRow.appendChild(th);
    });
    headRow.appendChild(el('th', { scope: 'col', text: 'Subject %' }));
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = el('tbody');
    data.students.forEach(function (student) {
      var row = el('tr', { dataset: { sid: student.id } },
        el('td', { class: 'roll-col', text: student.roll }),
        el('td', { class: 'name-col' },
          el('a', { class: 'row-link', href: '/student?id=' + encodeURIComponent(student.id), text: student.name })
        )
      );
      data.assessments.forEach(function (assessment) {
        var mark = data.marks[assessment.id] && data.marks[assessment.id][student.id];
        var locked = assessment.locked && role !== 'HOD';
        var input = el('input', {
          class: 'cell-input' + (mark && mark.status === 'absent' ? ' is-absent' : '') + (mark && mark.status === 'exempt' ? ' is-exempt' : ''),
          type: 'text',
          inputmode: 'text',
          autocapitalize: 'characters',
          autocomplete: 'off',
          spellcheck: 'false',
          value: self.valueFor(mark),
          readOnly: locked,
          dataset: { aid: assessment.id, sid: student.id },
          'aria-label': student.name + ' · ' + assessment.title + ' · out of ' + assessment.maxMarks
        });
        var cell = el('td', { class: 'cell' + (assessment.id === self.selectedId ? ' is-current' : '') }, input);
        row.appendChild(cell);
      });
      var score = data.rowScores[student.id];
      row.appendChild(el('td', {
        class: 'score-col',
        dataset: { scoreSid: student.id },
        title: score && score.method ? 'Method: ' + score.method + ' · coverage ' + score.coverage + '%' : ''
      }, score && score.value !== null ? String(score.value) : '—'));
      tbody.appendChild(row);
    });
    table.appendChild(tbody);

    var tfoot = el('tfoot');
    var footRow = el('tr', null,
      el('td', { class: 'roll-col faint', text: '' }),
      el('td', { class: 'name-col faint xs', text: 'Class average' })
    );
    data.assessments.forEach(function (assessment) {
      var stats = data.stats[assessment.id] || {};
      footRow.appendChild(el('td', { class: 'status-col xs faint', dataset: { footAid: assessment.id } },
        stats.entered ? (stats.average === null ? '—' : stats.average + '%') : '—'
      ));
    });
    footRow.appendChild(el('td', { class: 'score-col faint xs', text: '—' }));
    tfoot.appendChild(footRow);
    table.appendChild(tfoot);
    sheetWrap.appendChild(table);
    wrap.appendChild(sheetWrap);

    var legend = el('div', { class: 'row row--between gap-3 mt-3' },
      el('div', { class: 'legend-inline' },
        el('span', null, 'Type ', el('strong', { text: 'A' }), ' for absent'),
        el('span', null, 'Type ', el('strong', { text: 'E' }), ' for exempt'),
        el('span', null, 'Leave blank to clear'),
        el('span', null, 'Paste a column from a spreadsheet to fill down')
      ),
      el('div', { class: 'save-state', dataset: { saveState: 'true' } },
        el('span', { html: icon('check', 13) }), el('span', { text: 'All changes saved' })
      )
    );
    wrap.appendChild(legend);

    self.container.textContent = '';
    self.container.appendChild(wrap);
    this.root = wrap;
    this.sheetWrap = sheetWrap;
    this.table = table;
    this.status(0, 'idle');
    this.wire();
  };

  MarksGrid.prototype.valueFor = function (mark) {
    if (!mark) return '';
    if (mark.status === 'absent') return 'A';
    if (mark.status === 'exempt') return 'E';
    if (mark.score === null || mark.score === undefined) return '';
    return String(mark.score);
  };

  MarksGrid.prototype.wire = function () {
    var self = this;
    var inputs = Array.prototype.slice.call(this.table.querySelectorAll('.cell-input'));
    this.inputs = inputs;
    this.inputs.forEach(function (input) {
      input.addEventListener('focus', function () { self.active = input; });
      input.addEventListener('input', function () { self.onInput(input); });
      input.addEventListener('blur', function () {
        self.onInput(input);
        self.flush();
      });
      input.addEventListener('keydown', function (event) { self.onKey(event, input); });
    });

    this.table.addEventListener('paste', function (event) { self.onPaste(event); }, true);
    var columns = this.data.assessments.length;
    this.columns = columns;
  };

  MarksGrid.prototype.position = function (input) {
    var index = this.inputs.indexOf(input);
    if (index < 0) return null;
    return { row: Math.floor(index / this.columns), col: index % this.columns, index: index };
  };

  MarksGrid.prototype.cellAt = function (row, col) {
    if (row < 0 || col < 0 || row >= this.data.students.length || col >= this.columns) return null;
    return this.inputs[row * this.columns + col] || null;
  };

  MarksGrid.prototype.focusCell = function (row, col) {
    var input = this.cellAt(row, col);
    if (!input) return;
    input.focus();
    if (input.select) input.select();
  };

  MarksGrid.prototype.onKey = function (event, input) {
    var self = this;
    var pos = this.position(input);
    if (!pos) return;
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      this.flush(true);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      if (this.options.onUndo) {
        event.preventDefault();
        this.options.onUndo();
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      var mark = (this.data.marks[input.dataset.aid] || {})[input.dataset.sid];
      input.value = this.valueFor(mark);
      this.dirty.delete(this.keyFor(input));
      this.decorate(input, mark);
      this.status(this.dirty.size, this.dirty.size ? 'dirty' : 'saved');
      input.blur();
      return;
    }
    if (event.key === 'ArrowDown' || (event.key === 'Enter' && !event.shiftKey)) {
      event.preventDefault();
      this.onInput(input);
      this.focusCell(pos.row + 1, pos.col);
      return;
    }
    if (event.key === 'ArrowUp' || (event.key === 'Enter' && event.shiftKey)) {
      event.preventDefault();
      this.onInput(input);
      this.focusCell(pos.row - 1, pos.col);
      return;
    }
    if (event.key === 'ArrowRight') {
      if (input.selectionStart === input.value.length) {
        event.preventDefault();
        this.onInput(input);
        this.focusCell(pos.row, pos.col + 1);
      }
      return;
    }
    if (event.key === 'ArrowLeft') {
      if (input.selectionStart === 0 && input.selectionEnd === 0) {
        event.preventDefault();
        this.onInput(input);
        this.focusCell(pos.row, pos.col - 1);
      }
      return;
    }
    var wholeSelected = input.selectionStart === 0 && input.selectionEnd === input.value.length;
    if (event.key.toLowerCase() === 'a' && !event.ctrlKey && !event.metaKey && (input.value === '' || wholeSelected)) {
      event.preventDefault();
      input.value = 'A';
      this.onInput(input);
      this.focusCell(pos.row + 1, pos.col);
      return;
    }
    if (event.key.toLowerCase() === 'e' && !event.ctrlKey && !event.metaKey && (input.value === '' || wholeSelected)) {
      event.preventDefault();
      input.value = 'E';
      this.onInput(input);
      this.focusCell(pos.row + 1, pos.col);
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && input.value === '') {
      event.preventDefault();
      return;
    }
    if (event.key === 'Tab' && !event.shiftKey && pos.col === this.columns - 1) {
      this.onInput(input);
      this.flush();
    }
  };

  MarksGrid.prototype.keyFor = function (input) {
    return input.dataset.aid + ':' + input.dataset.sid;
  };

  MarksGrid.prototype.onInput = function (input) {
    var key = this.keyFor(input);
    var assessment = this.data.assessments.find(function (item) { return item.id === input.dataset.aid; });
    if (!assessment) return;
    var parsed = this.parse(input.value, assessment.maxMarks);
    if (parsed.invalid) {
      input.classList.add('is-invalid');
      this.dirty.set(key, { input: input, assessmentId: assessment.id, studentId: input.dataset.sid, invalid: true, raw: input.value });
      this.status(this.dirty.size, 'invalid');
      return;
    }
    var existing = (this.data.marks[assessment.id] || {})[input.dataset.sid] || null;
    input.classList.remove('is-invalid');
    this.decorate(input, parsed.status === 'absent' ? { status: 'absent', score: null } : parsed.status === 'exempt' ? { status: 'exempt', score: null } : { status: 'present', score: parsed.score });
    if (this.matches(existing, parsed)) {
      this.dirty.delete(key);
    } else {
      this.dirty.set(key, {
        input: input,
        assessmentId: assessment.id,
        studentId: input.dataset.sid,
        status: parsed.status,
        score: parsed.score,
        invalid: false,
        existing: existing
      });
    }
    if (!parsed.invalid && this.dirty.size === 0) this.status(0, 'saved');
    else this.status(this.dirty.size, 'dirty');
    this.schedule();
  };

  MarksGrid.prototype.decorate = function (input, parsed) {
    input.classList.remove('is-absent', 'is-exempt', 'is-dirty', 'is-invalid');
    if (parsed && parsed.status === 'absent') input.classList.add('is-absent');
    if (parsed && parsed.status === 'exempt') input.classList.add('is-exempt');
    if (this.dirty.has(this.keyFor(input)) && !this.dirty.get(this.keyFor(input)).invalid) input.classList.add('is-dirty');
  };

  MarksGrid.prototype.parse = function (raw, maxMarks) {
    var text = String(raw === null || raw === undefined ? '' : raw).trim();
    var upper = text.toUpperCase();
    if (!text) return { status: 'present', score: null };
    if (['A', 'ABS', 'ABSENT'].indexOf(upper) >= 0) return { status: 'absent', score: null };
    if (['E', 'EX', 'EXEMPT', 'NA', 'N/A'].indexOf(upper) >= 0) return { status: 'exempt', score: null };
    var value = Number(text.replace('%', '').replace(',', '.'));
    if (!Number.isFinite(value) || value < 0 || value > Number(maxMarks)) return { invalid: true, raw: text };
    return { status: 'present', score: value };
  };

  MarksGrid.prototype.matches = function (existing, parsed) {
    if (!existing) return parsed.status === 'present' && parsed.score === null;
    if (parsed.status === 'present' && parsed.score === null) return false;
    return existing.status === parsed.status && (existing.score === null ? parsed.score === null : Number(existing.score) === Number(parsed.score));
  };

  MarksGrid.prototype.schedule = function () {
    var self = this;
    clearTimeout(this.timer);
    this.timer = setTimeout(function () { self.flush(); }, 850);
  };

  MarksGrid.prototype.status = function (count, state) {
    var node = this.root && this.root.querySelector('[data-save-state]');
    if (!node) return;
    var iconName = 'check';
    var text = 'All changes saved';
    var cls = 'save-state';
    if (state === 'saving') { text = 'Saving…'; cls += ' save-state--saving'; iconName = 'refresh'; }
    else if (state === 'dirty') { text = count + ' unsaved ' + ui.plural(count, 'change'); cls += ' save-state--saving'; iconName = 'clock'; }
    else if (state === 'invalid') { text = 'Fix highlighted scores'; cls += ' save-state--error'; iconName = 'warning'; }
    else if (state === 'error') { text = 'Could not save'; cls += ' save-state--error'; iconName = 'warning'; }
    else if (state === 'saved' && this.lastSavedAt) { text = 'Saved ' + ui.timeAgo(this.lastSavedAt); cls += ' save-state--saved'; }
    else if (state === 'saving') { cls += ' save-state--saving'; }
    node.className = cls;
    node.innerHTML = ui.icon(iconName, 13) + '<span>' + ui.esc(text) + '</span>';
  };

  MarksGrid.prototype.flush = function (immediate) {
    var self = this;
    clearTimeout(this.timer);
    if (this.saving) { this.pending = true; return Promise.resolve(false); }
    if (!this.dirty.size) { this.status(0, 'saved'); return Promise.resolve(true); }
    var invalid = Array.from(this.dirty.values()).filter(function (item) { return item.invalid; });
    if (invalid.length) { this.status(invalid.length, 'invalid'); return Promise.resolve(false); }
    var ops = Array.from(this.dirty.values());
    var reasonNeeded = ops.some(function (op) {
      var assessment = self.data.assessments.find(function (item) { return item.id === op.assessmentId; });
      if (assessment && assessment.locked && self.role === 'HOD') return true;
      return op.existing && String(op.existing.updatedBy || '') !== String(self.data.currentUserId);
    });
    if (!reasonNeeded) return this.performSave(ops, null);
    return ui.promptReason({
      title: 'Reason for this correction',
      message: 'You are editing a finalised assessment or a mark entered by someone else. The reason will be stored in the audit log.',
      label: 'Reason',
      min: 4
    }).then(function (reason) {
      if (!reason) { self.status(self.dirty.size, 'dirty'); return false; }
      return self.performSave(ops, reason);
    });
  };

  MarksGrid.prototype.performSave = async function (ops, reason) {
    var self = this;
    this.saving = true;
    this.status(ops.length, 'saving');
    var byAssessment = new Map();
    ops.forEach(function (op) {
      if (!byAssessment.has(op.assessmentId)) byAssessment.set(op.assessmentId, []);
      byAssessment.get(op.assessmentId).push({ studentId: op.studentId, status: op.status, score: op.score });
    });
    try {
      for (var entry of byAssessment.entries()) {
        var assessmentId = entry[0];
        var changes = entry[1];
        var result = await EG.api.put('/api/assessments/' + encodeURIComponent(assessmentId) + '/marks', reason ? { changes: changes, reason: reason } : { changes: changes });
        changes.forEach(function (change) {
          var map = self.data.marks[assessmentId] || (self.data.marks[assessmentId] = {});
          if (change.status === 'present' && change.score === null) delete map[change.studentId];
          else map[change.studentId] = {
            score: change.score, status: change.status,
            updatedBy: self.data.currentUserId, updatedAt: new Date().toISOString()
          };
        });
        if (result && result.saved) self.lastSavedAt = new Date().toISOString();
      }
      ops.forEach(function (op) {
        self.dirty.delete(op.assessmentId + ':' + op.studentId);
        op.input.classList.remove('is-dirty', 'is-invalid');
        self.decorate(op.input, self.parse(op.input.value, self.maxFor(op.assessmentId)));
      });
      this.recompute();
      this.status(0, 'saved');
      if (this.options.onSaved) this.options.onSaved(this.data);
      return true;
    } catch (error) {
      if (error.code === 'REASON_REQUIRED') {
        var reasonText = await ui.promptReason({
          title: 'Reason required',
          message: error.message,
          label: 'Reason',
          min: 4
        });
        this.saving = false;
        if (reasonText) return this.performSave(ops, reasonText);
        this.status(this.dirty.size, 'dirty');
        return false;
      }
      this.status(this.dirty.size, 'error');
      ui.toast(error.message || 'Marks could not be saved.', 'error');
      return false;
    } finally {
      this.saving = false;
      if (this.pending) {
        this.pending = false;
        setTimeout(function () { self.flush(); }, 50);
      }
    }
  };

  MarksGrid.prototype.maxFor = function (assessmentId) {
    var assessment = this.data.assessments.find(function (item) { return item.id === assessmentId; });
    return assessment ? assessment.maxMarks : 100;
  };

  MarksGrid.prototype.onPaste = function (event) {
    var self = this;
    var input = event.target;
    if (!input || !input.classList || !input.classList.contains('cell-input')) return;
    var text = event.clipboardData && event.clipboardData.getData('text/plain');
    if (!text) return;
    var cells;
    if (text.indexOf('\t') >= 0 || text.indexOf('\n') >= 0 || text.indexOf(',') >= 0) {
      cells = EG.csv.parse(text).map(function (row) { return row.map(function (cell) { return String(cell).trim(); }); });
    } else {
      cells = [[text.trim()]];
    }
    if (!cells.length) return;
    var pos = this.position(input);
    if (!pos) return;
    event.preventDefault();
    cells.forEach(function (row, rowOffset) {
      row.forEach(function (value, colOffset) {
        var target = self.cellAt(pos.row + rowOffset, pos.col + colOffset);
        if (!target) return;
        target.value = value;
        self.onInput(target);
      });
    });
    this.focusCell(pos.row, pos.col);
    this.flush();
  };

  MarksGrid.prototype.recompute = function () {
    var self = this;
    var absentCountsAsZero = this.data.settings ? this.data.settings.absentCountsAsZero : true;
    var stats = {};
    this.data.assessments.forEach(function (assessment) {
      var values = [];
      var entered = 0, absent = 0, exempt = 0;
      self.data.students.forEach(function (student) {
        var mark = (self.data.marks[assessment.id] || {})[student.id];
        if (!mark) return;
        entered += 1;
        if (mark.status === 'absent') absent += 1;
        if (mark.status === 'exempt') exempt += 1;
        var percent = percentOf(mark, assessment.maxMarks, absentCountsAsZero);
        if (percent !== null) values.push(percent);
      });
      stats[assessment.id] = {
        entered: entered, absent: absent, exempt: exempt, total: self.data.students.length,
        average: values.length ? round(values.reduce(function (sum, value) { return sum + value; }, 0) / values.length, 1) : null,
        highest: values.length ? round(Math.max.apply(null, values), 1) : null,
        lowest: values.length ? round(Math.min.apply(null, values), 1) : null
      };
      var headerStat = self.root.querySelector('[data-stat-aid="' + CSS.escape(assessment.id) + '"]');
      if (headerStat) headerStat.textContent = stats[assessment.id].average === null ? '—' : String(stats[assessment.id].average);
      var foot = self.root.querySelector('[data-foot-aid="' + CSS.escape(assessment.id) + '"]');
      if (foot) foot.textContent = stats[assessment.id].entered ? (stats[assessment.id].average === null ? '—' : stats[assessment.id].average + '%') : '—';
    });
    this.data.stats = stats;

    var scheme = this.data.scheme || [];
    this.data.students.forEach(function (student) {
      var byType = new Map();
      var allPercents = [];
      self.data.assessments.forEach(function (assessment) {
        var mark = (self.data.marks[assessment.id] || {})[student.id];
        var percent = percentOf(mark, assessment.maxMarks, absentCountsAsZero);
        if (percent !== null) allPercents.push(percent);
        if (!byType.has(assessment.typeId)) byType.set(assessment.typeId, []);
        byType.get(assessment.typeId).push({ percent: percent, score: mark && mark.score !== null ? Number(mark.score) : 0, max: Number(assessment.maxMarks) });
      });
      var rows = [];
      scheme.forEach(function (rule) {
        var value = applyRule(byType.get(rule.typeId) || [], rule.rule, rule.ruleN);
        if (value !== null && rule.weight > 0) rows.push({ value: value, weight: Number(rule.weight) });
      });
      var final = null;
      if (rows.length) {
        var weightTotal = rows.reduce(function (sum, item) { return sum + item.weight; }, 0);
        final = weightTotal > 0 ? round(rows.reduce(function (sum, item) { return sum + item.value * item.weight; }, 0) / weightTotal, 1) : null;
      }
      if (final === null && allPercents.length) {
        final = round(allPercents.reduce(function (sum, value) { return sum + value; }, 0) / allPercents.length, 1);
      }
      self.data.rowScores[student.id] = { value: final, method: rows.length ? 'scheme' : 'average', coverage: 100 };
      var cell = self.root.querySelector('[data-score-sid="' + CSS.escape(student.id) + '"]');
      if (cell) cell.textContent = final === null ? '—' : String(final);
    });
  };

  MarksGrid.prototype.setSelected = function (assessmentId) {
    this.selectedId = assessmentId;
    if (!this.root) return;
    this.root.querySelectorAll('.is-current').forEach(function (node) { node.classList.remove('is-current'); });
    this.root.querySelectorAll('[data-aid="' + CSS.escape(assessmentId) + '"]').forEach(function (node) {
      if (node.tagName === 'TH' || node.classList.contains('cell')) node.classList.add('is-current');
    });
  };

  MarksGrid.prototype.reload = function (data) {
    var scrollTop = this.sheetWrap ? this.sheetWrap.scrollTop : 0;
    var scrollLeft = this.sheetWrap ? this.sheetWrap.scrollLeft : 0;
    this.data = data;
    this.selectedId = this.selectedId || data.assessment.id;
    this.render();
    if (this.sheetWrap) { this.sheetWrap.scrollTop = scrollTop; this.sheetWrap.scrollLeft = scrollLeft; }
  };

  MarksGrid.prototype.destroy = function () {
    clearTimeout(this.timer);
    window.removeEventListener('beforeunload', this.beforeUnload);
  };

  EG.grid = {
    Marks: MarksGrid,
    percentOf: percentOf,
    applyRule: applyRule
  };
})();
