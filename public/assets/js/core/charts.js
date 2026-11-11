/* Lightweight SVG charts (no chart library). */
(function () {
  'use strict';

  var EG = window.EG = window.EG || {};
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svg(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (key) {
      if (attrs[key] !== null && attrs[key] !== undefined) node.setAttribute(key, attrs[key]);
    });
    return node;
  }

  function text(tag, value) {
    var node = document.createElementNS(SVG_NS, tag);
    node.textContent = value;
    return node;
  }

  var PALETTE = ['var(--brand)', '#0f766e', '#b45309', '#be123c', '#175cd3', '#7e22ce'];

  function normalise(series) {
    if (!Array.isArray(series)) return [];
    if (!series.length) return [];
    if (series[0] && Array.isArray(series[0].points)) return series;
    return [{ name: '', points: series }];
  }

  function niceBounds(values, min, max) {
    var clean = values.filter(function (value) { return Number.isFinite(Number(value)); }).map(Number);
    var lo = min !== undefined ? min : (clean.length ? Math.min.apply(null, clean) : 0);
    var hi = max !== undefined ? max : (clean.length ? Math.max.apply(null, clean) : 100);
    if (lo === hi) { lo -= 5; hi += 5; }
    if (min === undefined) lo = Math.max(0, Math.floor((lo - 4) / 10) * 10);
    if (max === undefined) hi = Math.min(100, Math.ceil((hi + 4) / 10) * 10);
    if (hi <= lo) hi = lo + 10;
    return { min: lo, max: hi };
  }

  /**
   * lineChart(series, options)
   * series: [{ name, points: [{ label, value }], color }]
   */
  function lineChart(series, options) {
    options = options || {};
    var groups = normalise(series).map(function (group, index) {
      return {
        name: group.name || '',
        color: group.color || PALETTE[index % PALETTE.length],
        points: (group.points || []).map(function (point) {
          return { label: point.label !== undefined ? point.label : (point.date || ''), value: Number(point.value) };
        }).filter(function (point) { return Number.isFinite(point.value); })
      };
    }).filter(function (group) { return group.points.length; });

    var width = options.width || 680;
    var height = options.height || 230;
    var pad = { top: 18, right: 16, bottom: 30, left: 34 };
    var root = svg('svg', {
      class: 'chart', viewBox: '0 0 ' + width + ' ' + height,
      role: 'img', 'aria-label': options.label || 'Line chart', preserveAspectRatio: 'none'
    });
    root.style.height = (options.cssHeight || height) + 'px';
    root.style.width = '100%';

    if (!groups.length) {
      var empty = text('text', options.emptyText || 'No data yet');
      empty.setAttribute('x', width / 2);
      empty.setAttribute('y', height / 2);
      empty.setAttribute('text-anchor', 'middle');
      empty.setAttribute('class', 'axis-label');
      root.appendChild(empty);
      return root;
    }

    var allValues = [];
    groups.forEach(function (group) { group.points.forEach(function (point) { allValues.push(point.value); }); });
    var bounds = niceBounds(allValues, options.min, options.max);
    var plotW = width - pad.left - pad.right;
    var plotH = height - pad.top - pad.bottom;
    var maxLen = Math.max.apply(null, groups.map(function (group) { return group.points.length; }));

    function x(index, total) {
      if (total <= 1) return pad.left + plotW / 2;
      return pad.left + (index / (total - 1)) * plotW;
    }
    function y(value) {
      return pad.top + plotH - ((value - bounds.min) / (bounds.max - bounds.min)) * plotH;
    }

    [0, 0.25, 0.5, 0.75, 1].forEach(function (ratio) {
      var value = bounds.min + (bounds.max - bounds.min) * ratio;
      var yy = y(value);
      var line = svg('line', { x1: pad.left, x2: width - pad.right, y1: yy, y2: yy, class: 'grid-line' });
      root.appendChild(line);
      var labelEl = text('text', String(Math.round(value)));
      labelEl.setAttribute('x', pad.left - 7);
      labelEl.setAttribute('y', yy + 3);
      labelEl.setAttribute('text-anchor', 'end');
      labelEl.setAttribute('class', 'axis-label');
      root.appendChild(labelEl);
    });

    var first = groups[0].points;
    var labelCount = Math.min(maxLen, options.maxLabels || 7);
    var step = Math.max(1, Math.ceil(maxLen / labelCount));
    for (var i = 0; i < maxLen; i += step) {
      var labelPoint = first[i] || groups[0].points[groups[0].points.length - 1];
      var xPos = x(i, maxLen);
      var labelNode = text('text', (labelPoint && labelPoint.label) || '');
      labelNode.setAttribute('x', xPos);
      labelNode.setAttribute('y', height - 9);
      labelNode.setAttribute('text-anchor', 'middle');
      labelNode.setAttribute('class', 'axis-label');
      root.appendChild(labelNode);
    }

    groups.forEach(function (group) {
      var pts = group.points;
      var d = pts.map(function (point, index) { return (index ? 'L' : 'M') + x(index, maxLen).toFixed(1) + ',' + y(point.value).toFixed(1); }).join(' ');
      if (options.area !== false) {
        var areaD = d + ' L' + x(pts.length - 1, maxLen).toFixed(1) + ',' + (pad.top + plotH) + ' L' + x(0, maxLen).toFixed(1) + ',' + (pad.top + plotH) + ' Z';
        root.appendChild(svg('path', { d: areaD, class: 'series-area', style: 'fill:' + group.color + ';fill-opacity:0.10' }));
      }
      var path = svg('path', { d: d, class: 'series-line', style: 'stroke:' + group.color });
      root.appendChild(path);
      pts.forEach(function (point, index) {
        var circle = svg('circle', { cx: x(index, maxLen), cy: y(point.value), r: 3.1, class: 'point', style: 'stroke:' + group.color });
        var title = text('title', ((group.name ? group.name + ' · ' : '') + (point.label || '') + ': ' + Math.round(point.value) + '%'));
        circle.appendChild(title);
        root.appendChild(circle);
      });
    });

    return root;
  }

  function legend(groups) {
    var wrap = document.createElement('div');
    wrap.className = 'chart-legend';
    groups.forEach(function (group, index) {
      var item = document.createElement('span');
      var swatch = document.createElement('i');
      swatch.style.background = group.color || PALETTE[index % PALETTE.length];
      item.appendChild(swatch);
      item.appendChild(document.createTextNode(group.name));
      wrap.appendChild(item);
    });
    return wrap;
  }

  function donut(segments, options) {
    options = options || {};
    var size = options.size || 132;
    var thickness = options.thickness || 13;
    var radius = (size - thickness) / 2;
    var circumference = 2 * Math.PI * radius;
    var total = segments.reduce(function (sum, segment) { return sum + Number(segment.value || 0); }, 0);
    var root = svg('svg', { viewBox: '0 0 ' + size + ' ' + size, class: 'chart', role: 'img', 'aria-label': options.label || 'Distribution chart' });
    root.style.width = size + 'px';
    root.style.height = size + 'px';
    var group = svg('g', { transform: 'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')' });
    var track = svg('circle', { cx: size / 2, cy: size / 2, r: radius, fill: 'none', stroke: 'var(--surface-3)', 'stroke-width': thickness });
    group.appendChild(track);
    var offset = 0;
    segments.forEach(function (segment, index) {
      var value = Number(segment.value || 0);
      if (!value || !total) return;
      var length = (value / total) * circumference;
      var arc = svg('circle', {
        cx: size / 2, cy: size / 2, r: radius, fill: 'none',
        stroke: segment.color || PALETTE[index % PALETTE.length],
        'stroke-width': thickness, 'stroke-linecap': 'butt',
        'stroke-dasharray': (Math.max(0, length - 1.5)) + ' ' + (circumference - length + 1.5),
        'stroke-dashoffset': -offset
      });
      var title = text('title', segment.label + ': ' + value);
      arc.appendChild(title);
      group.appendChild(arc);
      offset += length;
    });
    root.appendChild(group);
    if (options.centerValue !== undefined) {
      var valueNode = text('text', String(options.centerValue));
      valueNode.setAttribute('x', size / 2);
      valueNode.setAttribute('y', size / 2 + 2);
      valueNode.setAttribute('text-anchor', 'middle');
      valueNode.setAttribute('fill', 'var(--ink)');
      valueNode.setAttribute('font-size', '22');
      valueNode.setAttribute('font-weight', '800');
      valueNode.setAttribute('font-family', 'Manrope, sans-serif');
      root.appendChild(valueNode);
      if (options.centerLabel) {
        var labelNode = text('text', options.centerLabel);
        labelNode.setAttribute('x', size / 2);
        labelNode.setAttribute('y', size / 2 + 18);
        labelNode.setAttribute('text-anchor', 'middle');
        labelNode.setAttribute('fill', 'var(--muted)');
        labelNode.setAttribute('font-size', '9');
        labelNode.setAttribute('letter-spacing', '0.06em');
        labelNode.setAttribute('text-transform', 'uppercase');
        root.appendChild(labelNode);
      }
    }
    return root;
  }

  function scoreRing(value, level, label) {
    var size = 104;
    var radius = 46;
    var circumference = 2 * Math.PI * radius;
    var safe = Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Number(value))) : 0;
    var root = document.createElement('div');
    root.className = 'score-ring is-' + (level || 'low');
    var chart = svg('svg', { viewBox: '0 0 ' + size + ' ' + size, 'aria-hidden': 'true' });
    chart.appendChild(svg('circle', { cx: 52, cy: 52, r: radius, class: 'track' }));
    var arc = svg('circle', {
      cx: 52, cy: 52, r: radius, class: 'value',
      'stroke-dasharray': circumference,
      'stroke-dashoffset': circumference - (safe / 100) * circumference
    });
    chart.appendChild(arc);
    var center = document.createElement('div');
    center.className = 'score-ring__text';
    var valueNode = document.createElement('div');
    valueNode.className = 'score-ring__value';
    valueNode.textContent = value === null || value === undefined ? '—' : String(Math.round(safe));
    var labelNode = document.createElement('div');
    labelNode.className = 'score-ring__label';
    labelNode.textContent = label || 'Score';
    center.appendChild(valueNode);
    center.appendChild(labelNode);
    root.appendChild(chart);
    root.appendChild(center);
    return root;
  }

  function columns(points, options) {
    options = options || {};
    var width = options.width || 640;
    var height = options.height || 220;
    var pad = { top: 16, right: 14, bottom: 30, left: 32 };
    var root = svg('svg', { class: 'chart', viewBox: '0 0 ' + width + ' ' + height, role: 'img', 'aria-label': options.label || 'Bar chart' });
    root.style.width = '100%';
    root.style.height = (options.cssHeight || height) + 'px';
    if (!points || !points.length) {
      var empty = text('text', 'No data yet');
      empty.setAttribute('x', width / 2); empty.setAttribute('y', height / 2);
      empty.setAttribute('text-anchor', 'middle'); empty.setAttribute('class', 'axis-label');
      root.appendChild(empty);
      return root;
    }
    var max = options.max !== undefined ? options.max : Math.max.apply(null, points.map(function (point) { return Number(point.value) || 0; }));
    max = Math.max(max, 1);
    var plotW = width - pad.left - pad.right;
    var plotH = height - pad.top - pad.bottom;
    var slot = plotW / points.length;
    var barW = Math.max(4, Math.min(28, slot * 0.58));
    points.forEach(function (point, index) {
      var value = Number(point.value) || 0;
      var barH = (value / max) * plotH;
      var x = pad.left + index * slot + (slot - barW) / 2;
      var rect = svg('rect', {
        x: x, y: pad.top + plotH - barH, width: barW, height: barH,
        rx: 3, fill: point.color || 'var(--brand)', opacity: 0.9
      });
      var title = text('title', (point.label || '') + ': ' + value);
      rect.appendChild(title);
      root.appendChild(rect);
      if (index % Math.max(1, Math.ceil(points.length / 10)) === 0) {
        var label = text('text', point.label || '');
        label.setAttribute('x', x + barW / 2);
        label.setAttribute('y', height - 9);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('class', 'axis-label');
        root.appendChild(label);
      }
    });
    var baseline = svg('line', { x1: pad.left, x2: width - pad.right, y1: pad.top + plotH, y2: pad.top + plotH, stroke: 'var(--line)' });
    root.appendChild(baseline);
    return root;
  }

  function sparkline(values, options) {
    options = options || {};
    var width = options.width || 120;
    var height = options.height || 32;
    var clean = (values || []).map(Number).filter(function (value) { return Number.isFinite(value); });
    var root = svg('svg', { viewBox: '0 0 ' + width + ' ' + height, class: 'chart', 'aria-hidden': 'true' });
    root.style.width = width + 'px';
    root.style.height = height + 'px';
    if (clean.length < 2) return root;
    var min = Math.min.apply(null, clean);
    var max = Math.max.apply(null, clean);
    if (min === max) { min -= 1; max += 1; }
    var d = clean.map(function (value, index) {
      var x = (index / (clean.length - 1)) * (width - 4) + 2;
      var y = height - 3 - ((value - min) / (max - min)) * (height - 6);
      return (index ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    root.appendChild(svg('path', { d: d, fill: 'none', stroke: options.color || 'var(--brand)', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    return root;
  }

  EG.charts = {
    line: lineChart,
    donut: donut,
    ring: scoreRing,
    columns: columns,
    sparkline: sparkline,
    legend: legend,
    palette: PALETTE
  };
})();
