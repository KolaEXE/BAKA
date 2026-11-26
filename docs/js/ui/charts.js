// Graphiques SVG faits main (aucune bibliothèque). series = [{ name, color, values | points }]
import { h } from '../core/utils.js';
const NS = 'http://www.w3.org/2000/svg', W = 420, H = 230, L = 46, R = 12, T = 12, B = 28, PW = W - L - R, PH = H - T - B;
const s = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); e.append(...kids.flat().filter(k => k != null)); return e; };
const nice = (m, step) => Math.max(step, Math.ceil(m / step) * step);
const txt = (x, y, t, anchor = 'middle') => s('text', { x, y, 'text-anchor': anchor, style: 'fill:var(--muted);font-size:11px' }, String(t));

function frame(yMax, xLabels, xPos) {
  const y = v => T + PH * (1 - v / yMax), els = [];
  for (let k = 0; k <= 4; k++) { const v = yMax * k / 4; els.push(s('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), style: 'stroke:var(--line)' }), txt(L - 6, y(v) + 4, Math.round(v).toLocaleString('fr-FR'), 'end')); }
  xLabels.forEach((l, i) => els.push(txt(xPos(i), H - 8, l)));
  return { els, y };
}
const box = (title, svg, series) => h('figure', { class: 'chart' }, h('figcaption', {}, title),
  h('div', { class: 'legend' }, series.map(se => h('span', {}, h('i', { style: `background:${se.color}` }), se.name))), svg);
const root = label => s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label, width: '100%' });

/** Barres groupées : puissance de chaque carte (dans l'ordre d'obtention). */
export function barsChart(title, series, labels) {
  const n = labels.length, gw = PW / n, bw = Math.min(26, gw / 2.6), { els, y } = frame(10000, labels, i => L + gw * (i + .5));
  const r = root(title);
  r.append(...els, ...series.flatMap((se, k) => se.values.map((v, i) =>
    s('rect', { x: L + gw * (i + .5) + (k - series.length / 2) * bw, y: y(v), width: bw - 2, height: T + PH - y(v), rx: 3, fill: se.color }))));
  return box(title, r, series);
}
/** Courbes : puissance cumulée après chaque carte. */
export function lineChart(title, series) {
  const n = series[0].values.length, max = nice(Math.max(...series.flatMap(x => x.values)), 5000), pos = i => L + PW * i / n;
  const { els, y } = frame(max, ['0', ...series[0].values.map((_, i) => i + 1)], pos), r = root(title);
  r.append(...els, ...series.flatMap(se => { const pts = [0, ...se.values].map((v, i) => [pos(i), y(v)]);
    return [s('polyline', { points: pts.map(p => p.join(',')).join(' '), fill: 'none', stroke: se.color, 'stroke-width': 3, 'stroke-linejoin': 'round' }), ...pts.map(p => s('circle', { cx: p[0], cy: p[1], r: 4, fill: se.color }))]; }));
  return box(title, r, series);
}
/** Nuage de points : prix payé (M) contre puissance obtenue. */
export function scatterChart(title, series) {
  const xs = series.flatMap(x => x.points.map(p => p.x)), xMax = nice(Math.max(1, ...xs), 50), xp = v => L + PW * v / xMax;
  const { els, y } = frame(10000, [], () => 0), r = root(title);
  for (let k = 0; k <= 4; k++) els.push(txt(xp(xMax * k / 4), H - 8, Math.round(xMax * k / 4) + 'M'));
  r.append(...els, ...series.flatMap(se => se.points.map(p => s('circle', { cx: xp(p.x), cy: y(p.y), r: 6, fill: se.color, 'fill-opacity': .85 }, s('title', {}, `${p.label} : ${p.x}M, ${p.y}`)))));
  return box(title, r, series);
}
