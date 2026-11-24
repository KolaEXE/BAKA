import { ref, get, set, update, remove, onValue, runTransaction, onDisconnect, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { db } from '../core/firebase.js';
import { AppError, genCode, sha256 } from '../core/utils.js';
import { GRACE_EMPTY_MS } from '../config/constants.js';

const roomRef = c => ref(db, `rooms/${c}`);
const listRef = c => ref(db, `roomList/${c}`);

/** Crée une room. Le code est réservé par transaction : deux créations ne peuvent pas entrer en collision. */
export async function createRoom(user, name, form) {
  const settings = {
    name: form.name || `Room de ${name}`, universe: form.universe, cards: form.cards, budget: form.budget,
    maxPlayers: 2, spectators: form.spectators, isPublic: form.isPublic, passHash: form.password ? await sha256(form.password) : null,
    timer: { on: form.timerOn, sec: form.timerSec }, status: 'waiting', host: user.uid, createdAt: Date.now()
  };
  for (let i = 0; i < 8; i++) {
    const code = genCode();
    const res = await runTransaction(roomRef(code), cur => cur === null
      ? { settings, players: { [user.uid]: { name, role: 'player', joinedAt: Date.now() } } } : undefined);
    if (res.committed) {
      await set(listRef(code), { name: settings.name, universe: settings.universe, status: 'waiting', host: user.uid,
        isPublic: settings.isPublic, hasPass: !!settings.passHash, maxPlayers: 2, spectators: settings.spectators, emptySince: null });
      return code;
    }
  }
  throw new AppError('Impossible de générer un code de room. Réessaie.');
}

/** Rejoint une room. L'ajout est transactionnel : une room pleine ne peut jamais dépasser sa capacité. */
export async function joinRoom(user, name, code, { asSpectator = false, password = '' } = {}) {
  const snap = await get(roomRef(code));
  if (!snap.exists()) throw new AppError(`La room ${code} n'existe pas.`);
  const { settings, players = {} } = snap.val();
  if (players[user.uid]) { await update(ref(db, `rooms/${code}/players/${user.uid}`), { name }); return players[user.uid].role; }
  if (settings.passHash && settings.passHash !== await sha256(password)) throw new AppError('Mot de passe incorrect.');
  const wantsPlayer = !asSpectator && settings.status === 'waiting';
  let role = null;
  const res = await runTransaction(ref(db, `rooms/${code}/players`), cur => {
    cur = cur || {};
    const count = Object.values(cur).filter(p => p.role === 'player').length;
    role = wantsPlayer && count < settings.maxPlayers ? 'player' : 'spectator';
    if (role === 'spectator' && !settings.spectators) { role = null; return undefined; }
    cur[user.uid] = { name, role, joinedAt: Date.now() };
    return cur;
  });
  if (!res.committed) throw new AppError(settings.status === 'waiting' ? 'La room est complète et les spectateurs sont désactivés.' : 'La partie a commencé et les spectateurs sont désactivés.');
  return role;
}

/** Présence : disparaît toute seule à la déconnexion, et se rétablit à la reconnexion réseau. */
export function connectPresence(code, uid, role) {
  const p = ref(db, `presence/${code}/${uid}`);
  const off = onValue(ref(db, '.info/connected'), s => {
    if (s.val() !== true) return;
    onDisconnect(p).remove().then(() => set(p, { role, at: serverTimestamp() }));
  });
  return () => { off(); remove(p); };
}

/** Quitte volontairement. Si l'hôte part, le plus ancien joueur restant devient hôte. */
export async function leaveRoom(code, uid) {
  await remove(ref(db, `presence/${code}/${uid}`));
  const snap = await get(roomRef(code));
  if (!snap.exists()) return;
  const { settings, players = {} } = snap.val();
  await remove(ref(db, `rooms/${code}/players/${uid}`));
  const rest = Object.entries(players).filter(([id]) => id !== uid).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
  if (settings.host === uid && rest.length) {
    const next = (rest.find(([, p]) => p.role === 'player') || rest[0])[0];
    await update(roomRef(code), { 'settings/host': next });
    await update(listRef(code), { host: next });
  }
}

export const watchRoom = (code, cb) => onValue(roomRef(code), s => cb(s.val()));
export const watchPresence = (code, cb) => onValue(ref(db, `presence/${code}`), s => cb(s.val() || {}));

/** Liste temps réel des rooms + présence ; nettoie les rooms vides après un délai de grâce. */
export function watchHub(cb) {
  let list = {}, presence = {};
  const emit = () => {
    const rooms = Object.entries(list).map(([code, r]) => {
      const on = Object.values(presence[code] || {});
      return { code, ...r, players: on.filter(p => p.role === 'player').length, specs: on.filter(p => p.role === 'spectator').length };
    });
    cb(rooms);
    for (const r of rooms) sweep(r);
  };
  const a = onValue(ref(db, 'roomList'), s => { list = s.val() || {}; emit(); });
  const b = onValue(ref(db, 'presence'), s => { presence = s.val() || {}; emit(); });
  return () => { a(); b(); };
}
function sweep(r) {
  const empty = r.players + r.specs === 0;
  if (!empty && r.emptySince) update(listRef(r.code), { emptySince: null });
  else if (empty && !r.emptySince) update(listRef(r.code), { emptySince: Date.now() });
  else if (empty && Date.now() - r.emptySince > GRACE_EMPTY_MS) {
    remove(roomRef(r.code)); remove(listRef(r.code));
  }
}
