// Règles du jeu sous forme de fonction PURE : apply(état, action, contexte) -> { g } ou { error }.
// Le même code sert à valider côté client (messages d'erreur) et dans la transaction Firebase (autorité).
import { BEATS, rpsWinner } from './rps.js';

const clone = o => JSON.parse(JSON.stringify(o));
const deadline = ctx => (ctx.timerOn ? ctx.now + ctx.sec * 1000 : null);

export function newGame({ players, budget }) {
  return { seq: 0, phase: 'rps', players, budgets: { [players[0]]: budget, [players[1]]: budget },
    taken: {}, prices: {}, rps: { round: 1 }, turn: null, pick: null, bid: null, last: null, deadline: null };
}
/** Cartes d'une équipe (Firebase supprime les tableaux vides, d'où le ||). */
export const teamOf = (g, id) => g.teams?.[id] || [];

/**
 * Actions : rps{choice} · first{first} · pick{idx} · bid{amount} · fold · timeout · forfeit{loser}.
 * `seq` doit égaler l'état courant : un doublon ou une action périmée est refusé(e).
 * ctx = { cards, timerOn, sec, now }
 */
export function apply(g, a, ctx) {
  const err = error => ({ error });
  if (!g) return err('Aucune partie en cours.');
  if (a.seq !== g.seq) return err('Action obsolète.');
  if (g.phase === 'done') return err('La partie est terminée.');
  const n = clone(g);
  n.teams ||= {}; n.taken ||= {}; n.prices ||= {}; n.rps ||= { round: 1 }; n.rps.choices ||= {};
  n.players.forEach(p => { n.teams[p] ||= []; });
  const [p0, p1] = n.players, other = u => (u === p0 ? p1 : p0), u = a.uid, half = ctx.cards / 2;
  const ok = () => { n.seq = g.seq + 1; return { g: n }; };

  if (a.type === 'forfeit') {
    if (!n.players.includes(a.loser)) return err('Joueur inconnu.');
    n.phase = 'done'; n.forfeit = a.loser; n.deadline = null; return ok();
  }
  if (a.type === 'timeout') {
    if (!ctx.timerOn || !n.deadline || ctx.now < n.deadline - 300) return err("Le temps n'est pas écoulé.");
    if (n.phase === 'pick') {
      const free = [...Array(ctx.cards).keys()].filter(i => !n.taken['c' + i]);
      return apply(g, { type: 'pick', uid: n.turn, seq: a.seq, idx: free[Math.floor(Math.random() * free.length)] }, ctx);
    }
    if (n.phase === 'bid') return apply(g, n.bid.price === null
      ? { type: 'bid', uid: n.bid.actor, seq: a.seq, amount: 0 } : { type: 'fold', uid: n.bid.actor, seq: a.seq }, ctx);
    return err('Pas de timer dans cette phase.');
  }
  if (!n.players.includes(u)) return err('Seuls les joueurs peuvent agir.');

  // Attribue la carte en cours au gagnant (il paie SA dernière mise), puis passe au tour suivant.
  const resolve = (winner, price) => {
    const idx = n.pick, loser = other(winner), prev = n.turn;
    n.taken['c' + idx] = winner; n.prices['c' + idx] = price; n.budgets[winner] -= price; n.teams[winner].push(idx);
    n.last = { idx, winner, price }; n.pick = null; n.bid = null;
    if (n.teams[winner].length >= half) // équipe pleine : l'autre reçoit le reste à 0M
      for (let i = 0; i < ctx.cards; i++) if (!n.taken['c' + i]) { n.taken['c' + i] = loser; n.prices['c' + i] = 0; n.teams[loser].push(i); }
    if (Object.keys(n.taken).length >= ctx.cards) { n.phase = 'done'; n.deadline = null; }
    else { n.phase = 'pick'; n.turn = other(prev); n.deadline = deadline(ctx); }
  };

  switch (a.type) {
    case 'rps': {
      if (n.phase !== 'rps') return err('Pas de shifumi en cours.');
      if (!(a.choice in BEATS)) return err('Choix invalide.');
      if (n.rps.choices[u]) return err('Choix déjà envoyé.');
      n.rps.choices[u] = a.choice;
      if (n.rps.choices[p0] && n.rps.choices[p1]) {
        const c = { ...n.rps.choices }, r = rpsWinner(c[p0], c[p1]);
        n.rps.last = { choices: c, winner: r === 'tie' ? null : r === 'a' ? p0 : p1 };
        n.rps.choices = {};
        if (r === 'tie') n.rps.round++; else { n.phase = 'rpsWin'; n.rps.winner = n.rps.last.winner; }
      }
      return ok();
    }
    case 'first':
      if (n.phase !== 'rpsWin' || u !== n.rps.winner || !n.players.includes(a.first)) return err('Action impossible.');
      n.phase = 'pick'; n.turn = a.first; n.deadline = deadline(ctx); return ok();
    case 'pick':
      if (n.phase !== 'pick' || u !== n.turn) return err("Ce n'est pas ton tour.");
      if (!Number.isInteger(a.idx) || a.idx < 0 || a.idx >= ctx.cards || n.taken['c' + a.idx]) return err('Carte indisponible.');
      n.phase = 'bid'; n.pick = a.idx; n.bid = { price: null, bidder: null, actor: u }; n.deadline = deadline(ctx); return ok();
    case 'bid': {
      if (n.phase !== 'bid' || u !== n.bid.actor) return err("Ce n'est pas ton tour de miser.");
      if (!Number.isInteger(a.amount) || a.amount < 0) return err('Mise invalide.');
      if (a.amount > n.budgets[u]) return err(`Ton budget est de ${n.budgets[u]}M.`);
      if (n.bid.price !== null && a.amount <= n.bid.price) return err(`Ta mise doit dépasser ${n.bid.price}M.`);
      n.bid = { price: a.amount, bidder: u, actor: other(u) }; n.deadline = deadline(ctx); return ok();
    }
    case 'fold':
      if (n.phase !== 'bid' || u !== n.bid.actor) return err("Ce n'est pas ton tour.");
      if (n.bid.price === null) return err('Tu dois proposer un prix de départ (0M possible).');
      resolve(n.bid.bidder, n.bid.price); return ok();
    default: return err('Action inconnue.');
  }
}
