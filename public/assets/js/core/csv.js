/* CSV parsing, generation and file helpers. */
(function () {
  'use strict';

  var EG = window.EG = window.EG || {};

  function detectDelimiter(sample) {
    var counts = { ',': 0, ';': 0, '\t': 0 };
    var quoted = false;
    for (var index = 0; index < sample.length; index += 1) {
      var char = sample[index];
      if (char === '"') {
        if (quoted && sample[index + 1] === '"') index += 1;
        else quoted = !quoted;
      } else if (!quoted) {
        if (char === '\n') break;
        if (counts[char] !== undefined) counts[char] += 1;
      }
    }
    return Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0] || ',';
  }

  function parse(text) {
    var input = String(text || '').replace(/^\uFEFF/, '');
    if (!input.trim()) return [];
    var delimiter = detectDelimiter(input);
    var rows = [];
    var row = [];
    var field = '';
    var quoted = false;
    for (var index = 0; index < input.length; index += 1) {
      var char = input[index];
      if (quoted) {
        if (char === '"') {
          if (input[index + 1] === '"') { field += '"'; index += 1; }
          else quoted = false;
        } else field += char;
      } else if (char === '"') {
        quoted = true;
      } else if (char === delimiter) {
        row.push(field);
        field = '';
      } else if (char === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (char === '\r') {
        /* handled with the following \n */
      } else {
        field += char;
      }
    }
    row.push(field);
    if (row.length > 1 || row[0].trim() !== '') rows.push(row);
    return rows.filter(function (item) {
      return item.some(function (cell) { return String(cell).trim() !== ''; });
    });
  }

  function normaliseHeader(value) {
    return String(value || '').trim().toLowerCase()
      .replace(/[\s\-]+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
  }

  function objects(text) {
    var rows = parse(text);
    if (!rows.length) return { headers: [], rows: [] };
    var headers = rows[0].map(function (header) { return String(header).trim(); });
    var keys = headers.map(normaliseHeader);
    var records = rows.slice(1).map(function (cells) {
      var record = {};
      keys.forEach(function (key, index) { record[key] = cells[index] !== undefined ? String(cells[index]).trim() : ''; });
      return record;
    });
    return { headers: headers, keys: keys, rows: records };
  }

  function cell(value) {
    if (value === null || value === undefined) return '';
    var text = String(value);
    return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function toCsv(rows, columns) {
    if (!rows || !rows.length) return columns ? columns.map(function (column) { return cell(column.label || column.key); }).join(',') + '\n' : '';
    var keys;
    var labels;
    if (columns && columns.length) {
      keys = columns.map(function (column) { return column.key; });
      labels = columns.map(function (column) { return column.label || column.key; });
    } else {
      keys = Object.keys(rows[0]);
      labels = keys;
    }
    var lines = [labels.map(cell).join(',')];
    rows.forEach(function (row) {
      lines.push(keys.map(function (key) { return cell(row[key]); }).join(','));
    });
    return lines.join('\n') + '\n';
  }

  function download(filename, rows, columns) {
    var csv = toCsv(rows, columns);
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2500);
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error('Choose a CSV file first.'));
      if (file.size > 2 * 1024 * 1024) return reject(new Error('That file is larger than 2 MB. Split it and try again.'));
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(new Error('The file could not be read.')); };
      reader.readAsText(file);
    });
  }

  function pickFile(accept) {
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = accept || '.csv,text/csv';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        input.remove();
        resolve(file || null);
      });
      input.click();
    });
  }

  async function chooseAndRead(accept) {
    var file = await pickFile(accept);
    if (!file) return { file: null, text: '', rows: [] };
    var text = await readFile(file);
    return { file: file, text: text, table: objects(text) };
  }

  EG.csv = {
    parse: parse,
    objects: objects,
    normaliseHeader: normaliseHeader,
    toCsv: toCsv,
    download: download,
    readFile: readFile,
    pickFile: pickFile,
    chooseAndRead: chooseAndRead
  };
})();
