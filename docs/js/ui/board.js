import { h, toast, friendly } from '../core/utils.js';
import { act, serverNow } from '../games/draft/net.js';
import { teamOf } from '../games/draft/auction.js';
import { saveStats } from '../games/draft/net.js';
import { createReveal } from './reveal.js';

const RPS = { r: 'Pierre', p: 'Feuille', s: 'Ciseaux' };
const initials = n => n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

/** Plateau de jeu. update() ne redessine que si l'état a changé (le champ de mise garde donc sa valeur). */
export function createBoard({ uid, onReset }) {
  const el = h('div', { class: 'stack board' });
  let room, online = {}, sig = '', reveal = null, statsSaved = false, timer = null, tick = null, bidVal = 0, bidSeq = -1;
  const run = async a => { try { await act(room.code, room, a); } catch (e) { toast(friendly(e), 'error'); } };

  const render = () => {
    clearTimeout(timer); clearInterval(tick);
    if (room.game.phase === 'done' && !room.game.forfeit) { // fin normale : révélation puis résultats
      if (!reveal) { reveal = createReveal({ uid, onReset }); el.replaceChildren(reveal.el); }
      reveal.update(room); return;
    }
    const g = room.game, s = room.settings, deck = room.deck || [], [p0, p1] = g.players, half = s.cards / 2;
    const name = id => room.players?.[id]?.name ?? 'Joueur', other = id => (id === p0 ? p1 : p0);
    const isPlayer = g.players.includes(uid), actor = g.phase === 'pick' ? g.turn : g.phase === 'bid' ? g.bid.actor : g.phase === 'rpsWin' ? g.rps.winner : null;
    const p = t => h('p', { class: 'muted', style: 'margin:0' }, t);
    const btn = (label, fn, cls = '') => h('button', { class: `btn ${cls}`, onclick: fn }, label);

    const card = (i, { price, fresh } = {}) => { const c = deck[i];
      return h('figure', { class: `card ${fresh ? 'fresh' : ''}` }, c.image ? h('img', { src: c.image, alt: c.name, loading: 'lazy' }) : h('div', { class: 'ph' }, initials(c.name)),
        h('figcaption', {}, c.name, price != null ? h('span', { class: 'muted' }, ` ${price}M`) : null)); };
    const back = (fn, label) => h(fn ? 'button' : 'div', { class: 'card back', onclick: fn, 'aria-label': label }, '?');
    const strip = id => h('div', { class: `pstrip ${actor === id ? 'active' : ''}` }, h('b', {}, name(id) + (id === uid ? ' (toi)' : '')),
      online[id] ? null : h('span', { class: 'tag' }, 'hors ligne'), h('div', { class: 'budget' }, `${g.budgets[id]}M`), p(`${teamOf(g, id).length}/${half} cartes`));
    const team = id => h('div', { class: 'cards small' }, teamOf(g, id).map(i => card(i, { price: g.prices['c' + i], fresh: g.last?.idx === i })));

    let mid = [];
    if (g.phase === 'rps') {
      const last = g.rps.last, mine = g.rps.choices?.[uid];
      mid = [h('h3', {}, `Shifumi · manche ${g.rps.round}`), last && !last.winner ? p(`Égalité (${RPS[last.choices[p0]]}). On recommence.`) : null,
        isPlayer ? (mine ? p("Choix envoyé. En attente de l'adversaire…") : h('div', { class: 'row' }, Object.entries(RPS).map(([k, l]) => btn(l, () => run({ type: 'rps', uid, choice: k }), 'primary'))))
          : p('Les joueurs jouent au shifumi.')];
    } else if (g.phase === 'rpsWin') {
      const c = g.rps.last.choices;
      mid = [h('h3', {}, `${name(g.rps.winner)} gagne le shifumi`), p(`${name(p0)} : ${RPS[c[p0]]} · ${name(p1)} : ${RPS[c[p1]]}`),
        uid === g.rps.winner ? h('div', { class: 'row' }, btn('Je commence', () => run({ type: 'first', uid, first: uid }), 'primary'), btn(`${name(other(uid))} commence`, () => run({ type: 'first', uid, first: other(uid) })))
          : p(`${name(g.rps.winner)} choisit qui commence…`)];
    } else if (g.phase === 'pick' || g.phase === 'bid') {
      const l = g.last;
      mid = [l ? h('p', { class: 'result', key: g.seq }, `${name(l.winner)} remporte ${deck[l.idx].name} pour ${l.price}M.`) : null];
      if (g.phase === 'pick') {
        const mine = uid === g.turn;
        mid.push(h('h3', {}, mine ? 'À toi de choisir une carte' : `${name(g.turn)} choisit une carte…`),
          h('div', { class: 'cards' }, deck.map((_, i) => g.taken?.['c' + i] != null ? card(i, { price: g.prices['c' + i] }) : back(mine ? () => run({ type: 'pick', uid, idx: i }) : null, `Carte ${i + 1}`))));
      } else {
        const b = g.bid, isPicker = uid === g.turn, mine = uid === b.actor, min = b.price === null ? 0 : b.price + 1, max = g.budgets[uid];
        if (bidSeq !== g.seq) { bidVal = min; bidSeq = g.seq; }
        const input = h('input', { type: 'number', min, max, step: 1, value: bidVal, 'aria-label': 'Ta mise en millions', oninput: e => { bidVal = +e.target.value; } });
        mid.push(h('div', { class: 'bidzone' }, isPicker ? card(g.pick) : back(null, 'Carte choisie, face cachée'),
          h('div', { class: 'stack' }, h('h3', {}, b.price === null ? `${name(b.actor)} fixe un prix de départ` : `${b.price}M par ${name(b.bidder)}`),
            isPicker ? p('Toi seul(e) vois cette carte pour le moment.') : p('Carte face cachée : estime sa valeur.'),
            mine ? h('div', { class: 'stack' }, min <= max ? h('div', { class: 'row' }, input, btn(b.price === null ? 'Proposer' : 'Surenchérir', () => run({ type: 'bid', uid, amount: Math.round(+input.value) }), 'primary')) : p(`Budget insuffisant (${max}M).`),
              b.price !== null ? btn(`Laisser à ${name(b.bidder)} (${b.price}M)`, () => run({ type: 'fold', uid })) : null) : p(`En attente de ${name(b.actor)}…`))));
      }
    } else { // fin par forfait
      if (isPlayer && !statsSaved) { statsSaved = true; saveStats(uid, g.id, g.forfeit !== uid, 0); }
      mid = [h('h3', {}, `${name(g.forfeit)} a abandonné`), p(`${name(other(g.forfeit))} gagne par forfait.`),
        room.settings.host === uid ? btn('Retour au lobby', onReset, 'primary') : p("En attente de l'hôte pour retourner au lobby…")];
    }

    const countdown = h('span', { class: 'timer' });
    const showTime = () => { countdown.textContent = `${Math.max(0, Math.ceil((g.deadline - serverNow()) / 1000))} s`; };
    if (g.deadline && g.phase !== 'done') {
      showTime(); tick = setInterval(showTime, 250);
      if (isPlayer && online[p0] && online[p1]) // pause : pas d'expiration tant qu'un joueur est hors ligne
        timer = setTimeout(() => run({ type: 'timeout', uid }), Math.max(0, g.deadline - serverNow()) + (uid === actor ? 0 : 1500));
    }
    el.replaceChildren(h('div', { class: 'duel' }, strip(p0), g.deadline && g.phase !== 'done' ? countdown : h('span', { class: 'vs' }, 'VS'), strip(p1)),
      h('div', { class: 'panel stack midzone' }, ...mid.filter(Boolean)),
      h('div', { class: 'teams' }, h('div', {}, h('b', {}, name(p0)), team(p0)), h('div', {}, h('b', {}, name(p1)), team(p1))));
  };
  return {
    el, destroy: () => { clearTimeout(timer); clearInterval(tick); reveal?.destroy(); },
    update(r, o) { room = r; online = o; const k = `${r.game.seq}|${Object.keys(o).sort()}|${Object.keys(r.players || {}).length}`; if (k !== sig) { sig = k; render(); } }
  };
}
