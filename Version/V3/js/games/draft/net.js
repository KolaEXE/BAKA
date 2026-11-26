import { ref, update, runTransaction, onValue } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { db } from '../../core/firebase.js';
import { AppError } from '../../core/utils.js';
import { sendSystem } from '../../platform/chat.js';
import { loadDeck } from './characters.js';
import { newGame, apply } from './auction.js';

// Horloge serveur : tous les timers se basent dessus, jamais sur l'heure du navigateur.
let offset = 0;
onValue(ref(db, '.info/serverTimeOffset'), s => { offset = s.val() || 0; });
export const serverNow = () => Date.now() + offset;

export async function startGame(code, room) {
  const s = room.settings;
  const players = Object.entries(room.players).filter(([, p]) => p.role === 'player').sort((a, b) => a[1].joinedAt - b[1].joinedAt).map(([id]) => id);
  if (players.length !== 2) throw new AppError('Il faut 2 joueurs pour lancer la partie.');
  const deck = await loadDeck(s.universe, s.cards);
  await update(ref(db, `rooms/${code}`), { deck, game: newGame({ players, budget: s.budget }), 'settings/status': 'playing' });
  await update(ref(db, `roomList/${code}`), { status: 'playing' });
  sendSystem(code, 'La partie commence : shifumi pour désigner qui choisit en premier.');
}

/** Applique une action de façon atomique. Un doublon ou une action périmée est rejeté(e). */
export async function act(code, room, action) {
  const s = room.settings, g = room.game;
  const ctx = { cards: s.cards, timerOn: s.timer.on, sec: s.timer.sec, now: serverNow() };
  const a = { ...action, seq: g.seq };
  const pre = apply(g, a, ctx);
  if (pre.error) throw new AppError(pre.error);
  const res = await runTransaction(ref(db, `rooms/${code}/game`), cur => {
    if (cur === null) return cur; // cache local vide : Firebase relance avec la vraie valeur
    const r = apply(cur, a, ctx);
    return r.error ? undefined : r.g;
  });
  if (!res.committed) throw new AppError("Action ignorée : l'état de la partie a déjà changé.");
  const after = res.snapshot.val(), name = id => room.players?.[id]?.name ?? 'Un joueur';
  if (after.last && after.last.idx !== g.last?.idx) sendSystem(code, `${name(after.last.winner)} remporte ${room.deck[after.last.idx].name} pour ${after.last.price}M.`);
  if (after.phase === 'done' && g.phase !== 'done') sendSystem(code, after.forfeit ? `${name(after.forfeit)} a abandonné la partie.` : 'Toutes les cartes sont distribuées.');
}

export async function resetToLobby(code) {
  await update(ref(db, `rooms/${code}`), { game: null, deck: null, 'settings/status': 'waiting' });
  await update(ref(db, `roomList/${code}`), { status: 'waiting' });
}
