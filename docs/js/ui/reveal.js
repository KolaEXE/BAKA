import { h } from '../core/utils.js';
import { serverNow, ensureReveal, saveStats } from '../games/draft/net.js';
import { summarize, perMillion, MAX_POWER } from '../games/draft/scoring.js';
import { barsChart, lineChart, scatterChart } from './charts.js';

const STEP = 3200, INTRO = 1500, OUTRO = 1800;
const fmt = n => Math.round(n).toLocaleString('fr-FR');
const initials = n => n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

/** Révélation carte par carte (J1c1, J2c1, J1c2…) synchronisée sur l'heure serveur, puis écran de résultats. */
export function createReveal({ uid, onReset }) {
  const el = h('div', { class: 'stack reveal' }, h('p', { class: 'result' }, 'La révélation va commencer…'));
  let room, count = -1, results = false, timer = null, skipped = false, saved = false;

  const render = () => {
    const g = room.game, deck = room.deck, S = summarize(g, deck), [p0, p1] = g.players, half = room.settings.cards / 2;
    const name = id => room.players?.[id]?.name ?? 'Joueur', color = id => (id === p0 ? 'var(--pa)' : 'var(--pb)');
    const order = []; for (let i = 0; i < half; i++) order.push([p0, i], [p1, i]);
    const shown = order.slice(0, count), run = id => shown.filter(([p]) => p === id).reduce((a, [p, i]) => a + S.teams[p][i].power, 0);
    const btn = results && room.settings.host === uid
      ? h('button', { class: 'btn primary', onclick: onReset }, 'Retour au lobby') : results ? h('p', { class: 'muted' }, "En attente de l'hôte pour retourner au lobby…") : null;

    if (!results) {
      const col = id => h('div', { class: 'revcol' }, ...shown.filter(([p]) => p === id).map(([p, i], k, arr) => {
        const c = S.teams[p][i], fresh = shown[shown.length - 1][0] === p && shown[shown.length - 1][1] === i;
        return h('figure', { class: `card revcard ${fresh ? 'fresh' : ''}`, style: `--c:${color(p)}` },
          c.image ? h('img', { src: c.image, alt: c.name }) : h('div', { class: 'ph' }, initials(c.name)),
          h('figcaption', {}, h('b', {}, c.name), h('span', { class: 'muted' }, `payé ${c.price}M`),
            h('div', { class: 'bar' }, h('i', { style: `width:${c.power / MAX_POWER * 100}%` })),
            h('span', { class: 'pow', ...(fresh ? { 'data-to': c.power } : {}) }, fresh ? '0' : fmt(c.power))));
      }));
      el.replaceChildren(h('div', { class: 'duel' }, h('div', { class: 'pstrip' }, h('b', {}, name(p0)), h('div', { class: 'budget', style: 'color:var(--pa)' }, fmt(run(p0)))),
        h('span', { class: 'vs' }, 'VS'), h('div', { class: 'pstrip' }, h('b', {}, name(p1)), h('div', { class: 'budget', style: 'color:var(--pb)' }, fmt(run(p1))))),
        count === 0 ? h('p', { class: 'result' }, 'La révélation va commencer…') : null,
        h('div', { class: 'teams' }, col(p0), col(p1)),
        h('button', { class: 'btn small', onclick: () => { skipped = true; poll(); } }, 'Passer la révélation'));
      el.querySelectorAll('[data-to]').forEach(sp => { const to = +sp.dataset.to, t0 = performance.now();
        const f = now => { const k = Math.min(1, (now - t0) / 1200); sp.textContent = fmt(to * (1 - (1 - k) ** 3)); if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); });
      return;
    }
    if (!saved && g.players.includes(uid)) { saved = true; saveStats(uid, g.id, S.winner === uid, S.totals[uid]); }
    const top = Math.max(S.totals[p0], S.totals[p1], 1), best = id => S.teams[id].slice().sort((a, b) => (perMillion(b.power, b.price) ?? 1e9) - (perMillion(a.power, a.price) ?? 1e9))[0];
    const side = id => h('div', { class: 'pstrip' + (S.winner === id ? ' active' : ''), style: `border-color:${S.winner === id ? color(id) : ''}` }, h('b', {}, name(id) + (id === uid ? ' (toi)' : '')),
      h('div', { class: 'budget', style: `color:${color(id)}` }, fmt(S.totals[id])),
      h('div', { class: 'bar big' }, h('i', { style: `width:${S.totals[id] / top * 100}%;background:${color(id)}` })),
      h('p', { class: 'muted', style: 'margin:0' }, `${S.spent[id]}M dépensés · ${perMillion(S.totals[id], S.spent[id])?.toFixed(1) ?? '–'} pts par M`),
      h('p', { class: 'muted', style: 'margin:0' }, `Meilleur rapport : ${best(id).name}`));
    const series = g.players.map(id => ({ name: name(id), color: color(id), values: S.teams[id].map(c => c.power) }));
    const cum = series.map(se => ({ ...se, values: se.values.reduce((a, v) => [...a, (a.at(-1) ?? 0) + v], []) }));
    const pts = g.players.map(id => ({ name: name(id), color: color(id), points: S.teams[id].map(c => ({ x: c.price, y: c.power, label: c.name })) }));
    el.replaceChildren(h('div', { class: 'panel stack winner' }, h('h2', {}, S.winner ? `${name(S.winner)} remporte la partie` : 'Égalité parfaite'),
        h('p', { class: 'muted', style: 'margin:0' }, 'Vainqueur = plus grande somme de puissance (estimation sur 10 000).'),
        h('div', { class: 'duel' }, side(p0), h('span', { class: 'vs' }, 'VS'), side(p1))),
      h('div', { class: 'charts' }, barsChart('Puissance par carte', series, series[0].values.map((_, i) => i + 1)), lineChart('Puissance cumulée', cum), scatterChart('Prix payé et puissance', pts)),
      h('div', { class: 'panel stack' }, h('h3', {}, 'Récapitulatif'), h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ...['Joueur', 'Personnage', 'Prix', 'Puissance', 'Pts par M'].map(t => h('th', {}, t)))),
        h('tbody', {}, ...g.players.flatMap(id => S.teams[id].map(c => h('tr', {}, h('td', { style: `color:${color(id)}` }, name(id)), h('td', {}, c.name), h('td', {}, `${c.price}M`), h('td', {}, fmt(c.power)), h('td', {}, perMillion(c.power, c.price)?.toFixed(1) ?? '–')))))))),
      btn);
  };
  const poll = () => {
    const start = room?.reveal?.startedAt; if (!start) return;
    const t = serverNow() - start - INTRO, N = room.settings.cards;
    const c = skipped ? N : Math.min(N, Math.max(0, Math.floor(t / STEP) + 1)), res = skipped || t >= N * STEP + OUTRO;
    if (c !== count || res !== results) { count = c; results = res; render(); }
  };
  timer = setInterval(() => room && poll(), 300);
  let asked = false;
  return { el, destroy: () => clearInterval(timer), update(r) { room = r; if (!asked) { asked = true; ensureReveal(r.code); } if (count >= 0 && results) render(); else poll(); } };
}
