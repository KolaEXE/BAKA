import { teamOf } from './auction.js';
export const MAX_POWER = 10000;

/** Résumé de fin de partie. Le vainqueur est celui qui a la plus grande somme de PUISSANCE (estimation /10 000). */
export function summarize(g, deck) {
  const teams = {}, totals = {}, spent = {};
  for (const id of g.players) {
    teams[id] = teamOf(g, id).map(i => ({ i, ...deck[i], price: g.prices['c' + i] }));
    totals[id] = teams[id].reduce((a, c) => a + c.power, 0);
    spent[id] = teams[id].reduce((a, c) => a + c.price, 0);
  }
  const [a, b] = g.players;
  return { teams, totals, spent, winner: totals[a] === totals[b] ? null : totals[a] > totals[b] ? a : b };
}
/** Points de puissance obtenus par million dépensé (null si 0M dépensé). */
export const perMillion = (power, spent) => (spent > 0 ? power / spent : null);
