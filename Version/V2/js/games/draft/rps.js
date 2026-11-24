/** Shifumi : r = pierre, p = feuille, s = ciseaux. Retourne 'a', 'b' ou 'tie'. */
export const BEATS = { r: 's', p: 'r', s: 'p' };
export const rpsWinner = (a, b) => (a === b ? 'tie' : BEATS[a] === b ? 'a' : 'b');
