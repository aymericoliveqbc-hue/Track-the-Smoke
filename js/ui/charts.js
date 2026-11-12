// Graphiques SVG légers, sans dépendance.
// Marques fines, extrémités arrondies de 4 px, grille discrète, info-bulle au
// survol / toucher, valeurs manquantes (null) jamais dessinées comme des zéros.

import { h } from './dom.js';

export const COLORS = {
  // Couleurs pilotées par le thème (variables CSS, validées clair et sombre).
  primary: 'var(--c1)', green: 'var(--c1)', blue: 'var(--c2)', orange: 'var(--c3)', violet: 'var(--c4)',
  grid: 'var(--grid)', axis: 'var(--text-3)', surface: 'var(--card)', muted: 'var(--surface-2)',
};

const W = 340;

function wrap(svg, height, legend) {
  const tip = h('div', { class: 'chart-tip', role: 'status' });
  const el = h('div', { class: 'chart', style: { aspectRatio: `${W} / ${height}` } }, svg, tip);
  return { el: legend ? h('div', { class: 'chart-block' }, legend, el) : el, tip, box: el };
}

function hover(box, svg, tip, locate) {
  const show = (ev) => {
    const r = svg.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * W;
    const res = locate(x);
    if (!res) { tip.classList.remove('on'); clearMarks(svg); return; }
    tip.innerHTML = res.html;
    tip.classList.add('on');
    const px = (res.x / W) * r.width;
    tip.style.left = `${Math.max(60, Math.min(r.width - 60, px))}px`;
    clearMarks(svg);
    if (res.mark) res.mark.classList.add('hl');
    if (res.cross != null) {
      const line = svg.querySelector('.crosshair');
      if (line) { line.setAttribute('x1', res.cross); line.setAttribute('x2', res.cross); line.style.opacity = 1; }
    }
  };
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointerleave', () => { tip.classList.remove('on'); clearMarks(svg); });
}
function clearMarks(svg) {
  svg.querySelectorAll('.hl').forEach((m) => m.classList.remove('hl'));
  const line = svg.querySelector('.crosshair');
  if (line) line.style.opacity = 0;
}

function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  const s = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return s * p;
}

function roundedTopBar(x, y, w, hgt, r = 4) {
  if (hgt <= 0) return '';
  const rr = Math.min(r, w / 2, hgt);
  return `M${x},${y + hgt}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + hgt}Z`;
}

export function legend(items) {
  return h('div', { class: 'legend' }, items.map((i) => h('span', { class: 'legend-item' }, h('i', { style: { background: i.color } }), i.label)));
}

/**
 * Histogramme vertical.
 * data: [{label, value|null, tip?}] ; opts: {color, format, height, target, xLabelEvery, highlight}
 */
export function barChart(data, opts = {}) {
  const height = opts.height || 150;
  const padL = 30, padB = 20, padT = 10;
  const innerW = W - padL - 6, innerH = height - padB - padT;
  const values = data.map((d) => d.value).filter((v) => v != null);
  const max = niceMax(Math.max(opts.target || 0, ...values, 0));
  const fmt = opts.format || ((v) => String(Math.round(v * 100) / 100));
  const bw = innerW / Math.max(1, data.length);
  const gap = Math.min(6, Math.max(2, bw * 0.28));
  const svg = h('svg', { viewBox: `0 0 ${W} ${height}`, class: 'chart-svg', role: 'img', 'aria-label': opts.aria || 'Graphique' });
  for (let i = 0; i <= 2; i++) {
    const y = padT + innerH - (innerH * i) / 2;
    svg.append(h('line', { x1: padL, x2: W - 6, y1: y, y2: y, stroke: COLORS.grid }));
    svg.append(h('text', { x: padL - 6, y: y + 3, 'text-anchor': 'end', class: 'axis' }, fmt((max * i) / 2)));
  }
  const marks = [];
  data.forEach((d, i) => {
    const x = padL + i * bw + gap / 2;
    const w = bw - gap;
    if (d.value == null) {
      marks.push(null);
      svg.append(h('rect', { x, y: padT + innerH - 2, width: w, height: 2, rx: 1, fill: COLORS.muted, opacity: 0.5 }));
      return;
    }
    const bh = (d.value / max) * innerH;
    const p = h('path', { d: roundedTopBar(x, padT + innerH - bh, w, Math.max(bh, d.value > 0 ? 2 : 0)), fill: d.color || opts.color || COLORS.primary, class: 'mark', opacity: opts.highlight != null && opts.highlight !== i ? 0.55 : 1 });
    marks.push(p);
    svg.append(p);
  });
  const every = opts.xLabelEvery || Math.ceil(data.length / 7);
  data.forEach((d, i) => {
    if (i % every !== 0 && i !== data.length - 1) return;
    if (i !== data.length - 1 && data.length - 1 - i < every && i % every === 0 && data.length > 8) return;
    svg.append(h('text', { x: padL + i * bw + bw / 2, y: height - 5, 'text-anchor': 'middle', class: 'axis' }, d.label));
  });
  if (opts.target != null) {
    const y = padT + innerH - (opts.target / max) * innerH;
    svg.append(h('line', { x1: padL, x2: W - 6, y1: y, y2: y, stroke: COLORS.green, 'stroke-dasharray': '4 4', 'stroke-width': 1.2 }));
  }
  const { el, tip, box } = wrap(svg, height);
  hover(box, svg, tip, (x) => {
    const i = Math.floor((x - padL) / bw);
    const d = data[i];
    if (!d) return null;
    return { x: padL + i * bw + bw / 2, mark: marks[i], html: `<b>${d.tip || d.label}</b><span>${d.value == null ? 'Pas de suivi' : fmt(d.value)}</span>` };
  });
  return el;
}

/**
 * Barres empilées. data: [{label, parts:[v…], tip}] ; keys: [{label, color}]
 */
export function stackedBars(data, keys, opts = {}) {
  const height = opts.height || 160;
  const padL = 30, padB = 20, padT = 10;
  const innerW = W - padL - 6, innerH = height - padB - padT;
  const totals = data.map((d) => (d.parts ? d.parts.reduce((a, b) => a + (b || 0), 0) : null));
  const max = niceMax(Math.max(0, ...totals.filter((t) => t != null)));
  const fmt = opts.format || ((v) => String(Math.round(v * 100) / 100));
  const bw = innerW / Math.max(1, data.length);
  const gap = Math.min(6, Math.max(2, bw * 0.28));
  const svg = h('svg', { viewBox: `0 0 ${W} ${height}`, class: 'chart-svg', role: 'img', 'aria-label': opts.aria || 'Graphique empilé' });
  for (let i = 0; i <= 2; i++) {
    const y = padT + innerH - (innerH * i) / 2;
    svg.append(h('line', { x1: padL, x2: W - 6, y1: y, y2: y, stroke: COLORS.grid }));
    svg.append(h('text', { x: padL - 6, y: y + 3, 'text-anchor': 'end', class: 'axis' }, fmt((max * i) / 2)));
  }
  const groups = [];
  data.forEach((d, i) => {
    const x = padL + i * bw + gap / 2; const w = bw - gap;
    const g = h('g', { class: 'mark' });
    groups.push(g);
    if (!d.parts) { svg.append(h('rect', { x, y: padT + innerH - 2, width: w, height: 2, rx: 1, fill: COLORS.muted, opacity: 0.5 })); return; }
    let y = padT + innerH;
    const nonZero = d.parts.map((v, k) => [v, k]).filter(([v]) => v > 0);
    nonZero.forEach(([v, k], idx) => {
      const bh = (v / max) * innerH;
      const top = idx === nonZero.length - 1;
      const yy = y - bh;
      const segH = Math.max(0, bh - (idx > 0 ? 2 : 0));
      g.append(top ? h('path', { d: roundedTopBar(x, yy, w, segH), fill: keys[k].color })
        : h('rect', { x, y: yy, width: w, height: segH, fill: keys[k].color }));
      y = yy;
    });
    svg.append(g);
  });
  const every = opts.xLabelEvery || Math.ceil(data.length / 7);
  data.forEach((d, i) => { if (i % every === 0) svg.append(h('text', { x: padL + i * bw + bw / 2, y: height - 5, 'text-anchor': 'middle', class: 'axis' }, d.label)); });
  const { el, tip, box } = wrap(svg, height, keys.length > 1 ? legend(keys) : null);
  hover(box, svg, tip, (x) => {
    const i = Math.floor((x - padL) / bw);
    const d = data[i];
    if (!d) return null;
    const rows = d.parts ? keys.map((k, j) => `<span><i style="background:${k.color}"></i>${k.label} · ${fmt(d.parts[j] || 0)}</span>`).join('') : '<span>Pas de suivi</span>';
    return { x: padL + i * bw + bw / 2, mark: groups[i], html: `<b>${d.tip || d.label}</b>${rows}` };
  });
  return el;
}

/**
 * Courbe(s). series: [{label, color, points:[{label, value|null, tip}]}]
 */
export function lineChart(series, opts = {}) {
  const height = opts.height || 150;
  const padL = 30, padB = 20, padT = 12;
  const innerW = W - padL - 10, innerH = height - padB - padT;
  const n = Math.max(...series.map((s) => s.points.length));
  const all = series.flatMap((s) => s.points.map((p) => p.value)).filter((v) => v != null);
  const min = opts.min ?? 0;
  const max = opts.max ?? niceMax(Math.max(...all, 0));
  const fmt = opts.format || ((v) => String(Math.round(v * 100) / 100));
  const X = (i) => padL + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const Y = (v) => padT + innerH - ((v - min) / (max - min || 1)) * innerH;
  const svg = h('svg', { viewBox: `0 0 ${W} ${height}`, class: 'chart-svg', role: 'img', 'aria-label': opts.aria || 'Courbe' });
  for (let i = 0; i <= 2; i++) {
    const v = min + ((max - min) * i) / 2;
    svg.append(h('line', { x1: padL, x2: W - 10, y1: Y(v), y2: Y(v), stroke: COLORS.grid }));
    svg.append(h('text', { x: padL - 6, y: Y(v) + 3, 'text-anchor': 'end', class: 'axis' }, fmt(v)));
  }
  if (opts.target != null) svg.append(h('line', { x1: padL, x2: W - 10, y1: Y(opts.target), y2: Y(opts.target), stroke: COLORS.green, 'stroke-dasharray': '4 4', 'stroke-width': 1.2 }));
  svg.append(h('line', { class: 'crosshair', x1: 0, x2: 0, y1: padT, y2: padT + innerH, stroke: COLORS.axis, 'stroke-width': 1, style: 'opacity:0' }));
  for (const s of series) {
    let d = ''; let pen = false;
    s.points.forEach((p, i) => {
      if (p.value == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.value).toFixed(1)}`; pen = true;
    });
    if (opts.area && series.length === 1) {
      const pts = s.points.map((p, i) => [p, i]).filter(([p]) => p.value != null);
      if (pts.length > 1) svg.append(h('path', { d: `${d}L${X(pts[pts.length - 1][1])},${Y(min)}L${X(pts[0][1])},${Y(min)}Z`, fill: s.color, opacity: 0.12 }));
    }
    svg.append(h('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    s.points.forEach((p, i) => {
      if (p.value == null) return;
      const isolated = (s.points[i - 1]?.value == null) && (s.points[i + 1]?.value == null);
      if (isolated || n <= 14) svg.append(h('circle', { cx: X(i), cy: Y(p.value), r: n <= 14 ? 3 : 2.5, fill: s.color, stroke: COLORS.surface, 'stroke-width': 1.5 }));
    });
  }
  const pts0 = series[0]?.points || [];
  const every = opts.xLabelEvery || Math.ceil(n / 6);
  pts0.forEach((p, i) => { if (i % every === 0) svg.append(h('text', { x: X(i), y: height - 5, 'text-anchor': 'middle', class: 'axis' }, p.label)); });
  const { el, tip, box } = wrap(svg, height, series.length > 1 ? legend(series) : null);
  hover(box, svg, tip, (x) => {
    const i = Math.round(((x - padL) / innerW) * (n - 1));
    if (i < 0 || i >= n) return null;
    const rows = series.map((s) => `<span>${series.length > 1 ? `<i style="background:${s.color}"></i>${s.label} · ` : ''}${s.points[i]?.value == null ? 'Pas de donnée' : fmt(s.points[i].value)}</span>`).join('');
    return { x: X(i), cross: X(i), html: `<b>${pts0[i]?.tip || pts0[i]?.label || ''}</b>${rows}` };
  });
  return el;
}

/** Carte de chaleur 7 × 24 (jour × heure), teinte unique. */
export function heatmap(grid, rowLabels, opts = {}) {
  const padL = 28, padT = 4, padB = 16;
  const cw = (W - padL - 4) / 24, ch = 16;
  const height = padT + ch * grid.length + padB;
  const max = Math.max(1, ...grid.flat());
  const svg = h('svg', { viewBox: `0 0 ${W} ${height}`, class: 'chart-svg', role: 'img', 'aria-label': opts.aria || 'Carte de chaleur' });
  const cells = [];
  grid.forEach((row, r) => {
    svg.append(h('text', { x: padL - 6, y: padT + r * ch + ch / 2 + 3, 'text-anchor': 'end', class: 'axis' }, rowLabels[r]));
    row.forEach((v, c) => {
      const cell = h('rect', { x: padL + c * cw + 1, y: padT + r * ch + 1, width: cw - 2, height: ch - 2, rx: 2.5, fill: v ? opts.color || COLORS.primary : 'var(--surface)', 'fill-opacity': v ? 0.18 + 0.82 * (v / max) : 1, class: 'mark' });
      cells.push({ cell, r, c, v });
      svg.append(cell);
    });
  });
  for (const hr of [0, 6, 12, 18, 23]) svg.append(h('text', { x: padL + hr * cw + cw / 2, y: height - 3, 'text-anchor': 'middle', class: 'axis' }, `${hr}h`));
  const { el, tip } = wrap(svg, height);
  const show = (ev) => {
    const rect = svg.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * W;
    const y = ((ev.clientY - rect.top) / rect.height) * height;
    const c = Math.floor((x - padL) / cw); const r = Math.floor((y - padT) / ch);
    const found = cells.find((k) => k.r === r && k.c === c);
    clearMarks(svg);
    if (!found) { tip.classList.remove('on'); return; }
    found.cell.classList.add('hl');
    tip.innerHTML = `<b>${rowLabels[r]} · ${c} h – ${c + 1} h</b><span>${found.v} ${opts.unit || 'événement(s)'}</span>`;
    tip.classList.add('on');
    tip.style.left = `${Math.max(60, Math.min(rect.width - 60, ((padL + c * cw) / W) * rect.width))}px`;
  };
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointerleave', () => { tip.classList.remove('on'); clearMarks(svg); });
  return el;
}

/** Nuage de points. points: [{x, y, tip}] */
export function scatter(points, opts = {}) {
  const height = opts.height || 180;
  const padL = 32, padB = 26, padT = 10, padR = 10;
  const innerW = W - padL - padR, innerH = height - padT - padB;
  const xmax = niceMax(Math.max(0, ...points.map((p) => p.x)));
  const ymax = opts.ymax ?? niceMax(Math.max(0, ...points.map((p) => p.y)));
  const X = (v) => padL + (v / xmax) * innerW;
  const Y = (v) => padT + innerH - (v / ymax) * innerH;
  const svg = h('svg', { viewBox: `0 0 ${W} ${height}`, class: 'chart-svg', role: 'img', 'aria-label': opts.aria || 'Nuage de points' });
  for (let i = 0; i <= 2; i++) {
    const vy = (ymax * i) / 2; const vx = (xmax * i) / 2;
    svg.append(h('line', { x1: padL, x2: W - padR, y1: Y(vy), y2: Y(vy), stroke: COLORS.grid }));
    svg.append(h('text', { x: padL - 6, y: Y(vy) + 3, 'text-anchor': 'end', class: 'axis' }, (opts.fy || String)(vy)));
    svg.append(h('text', { x: X(vx), y: padT + innerH + 13, 'text-anchor': 'middle', class: 'axis' }, (opts.fx || String)(vx)));
  }
  svg.append(h('text', { x: W - padR, y: height - 2, 'text-anchor': 'end', class: 'axis' }, opts.xLabel || ''));
  const dots = points.map((p) => {
    const c = h('circle', { cx: X(p.x), cy: Y(p.y), r: 4.5, fill: opts.color || COLORS.blue, 'fill-opacity': 0.85, stroke: COLORS.surface, 'stroke-width': 2, class: 'mark' });
    svg.append(c);
    return c;
  });
  const { el, tip, box } = wrap(svg, height);
  hover(box, svg, tip, (x) => {
    if (!points.length) return null;
    let best = 0;
    points.forEach((p, i) => { if (Math.abs(X(p.x) - x) < Math.abs(X(points[best].x) - x)) best = i; });
    const p = points[best];
    return { x: X(p.x), mark: dots[best], html: `<b>${p.tip || ''}</b><span>${(opts.fx || String)(p.x)} · ${(opts.fy || String)(p.y)}</span>` };
  });
  return el;
}

/** Barre de répartition horizontale (parts d'un tout), avec étiquettes. */
export function splitBar(parts, fmt) {
  const total = parts.reduce((a, p) => a + (p.value || 0), 0);
  const bar = h('div', { class: 'split-bar' }, parts.filter((p) => p.value > 0).map((p) =>
    h('span', { style: { flexGrow: p.value, background: p.color }, title: `${p.label} : ${fmt(p.value)}` })));
  const rows = h('div', { class: 'split-legend' }, parts.map((p) => h('div', { class: 'split-row' },
    h('i', { style: { background: p.color } }), h('span', { class: 'grow' }, p.label),
    h('b', null, fmt(p.value)), h('span', { class: 'muted pct' }, total ? `${Math.round(((p.value || 0) / total) * 100)} %` : '—'))));
  return h('div', { class: 'split' }, bar, rows);
}

/** Mini-courbe pour les tuiles. */
export function sparkline(values, color = COLORS.primary) {
  const w = 80, hgt = 26;
  const v = values.map((x) => (x == null ? null : x));
  const nums = v.filter((x) => x != null);
  if (nums.length < 2) return h('span');
  const max = Math.max(...nums) || 1; const min = Math.min(0, ...nums);
  let d = ''; let pen = false;
  v.forEach((x, i) => {
    if (x == null) { pen = false; return; }
    const px = (i / (v.length - 1)) * (w - 4) + 2; const py = hgt - 3 - ((x - min) / (max - min || 1)) * (hgt - 6);
    d += `${pen ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`; pen = true;
  });
  return h('svg', { viewBox: `0 0 ${w} ${hgt}`, width: w, height: hgt, class: 'spark' }, h('path', { d, fill: 'none', stroke: color, 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
}

/** Anneau de progression. */
export function ring(progress, size = 64, color = COLORS.primary, label = '') {
  const r = (size - 8) / 2; const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress ?? 0));
  return h('div', { class: 'ring', style: { width: `${size}px`, height: `${size}px` } },
    h('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size },
      h('circle', { cx: size / 2, cy: size / 2, r, stroke: 'var(--surface-2)', 'stroke-width': 5, fill: 'none' }),
      h('circle', { cx: size / 2, cy: size / 2, r, stroke: color, 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round', 'stroke-dasharray': `${c * p} ${c}`, transform: `rotate(-90 ${size / 2} ${size / 2})` })),
    h('span', { class: 'ring-label' }, label));
}
