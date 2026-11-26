import { ref, get, set, update, remove, onValue, runTransaction, onDisconnect, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { db } from '../core/firebase.js';
import { AppError, genCode, sha256 } from '../core/utils.js';
import { GRACE_EMPTY_MS, HOST_GRACE_MS, ABSENT_MS, FORFEIT_MS } from '../config/constants.js';
import { sendSystem } from './chat.js';
import { act } from '../games/draft/net.js';

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
      sendSystem(code, `${name} a créé la room.`);
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
  sendSystem(code, `${name} a rejoint en tant que ${role === 'player' ? 'joueur' : 'spectateur'}.`);
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

/** Quitte volontairement. Dernier membre = room supprimée. Si l'hôte part, le plus ancien membre restant devient hôte. */
export async function leaveRoom(code, uid) {
  await remove(ref(db, `presence/${code}/${uid}`));
  const snap = await get(roomRef(code));
  if (!snap.exists()) return;
  const full = snap.val(), { settings, players = {} } = full;
  if (settings.status === 'playing' && full.game && full.game.phase !== 'done' && full.game.players.includes(uid)) // quitter en pleine partie = forfait
    await act(code, full, { type: 'forfeit', uid, loser: uid }).catch(() => {});
  const rest = Object.entries(players).filter(([id]) => id !== uid).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
  if (!rest.length) {
    await Promise.all([roomRef(code), listRef(code), ref(db, `chat/${code}`), ref(db, `presence/${code}`)].map(r => remove(r)));
    return;
  }
  await remove(ref(db, `rooms/${code}/players/${uid}`));
  sendSystem(code, `${players[uid]?.name ?? 'Un joueur'} a quitté la room.`);
  if (settings.host === uid) {
    const next = (rest.find(([, p]) => p.role === 'player') || rest[0])[0];
    await update(roomRef(code), { 'settings/host': next });
    await update(listRef(code), { host: next });
  }
}

/** Modifie les paramètres (hôte). `password` : texte = nouveau mot de passe, '' = retirer. */
export async function updateSettings(code, patch) {
  const { password, ...upd } = patch;
  if (password !== undefined) upd.passHash = password ? await sha256(password) : null;
  await update(ref(db, `rooms/${code}/settings`), upd);
  const l = {};
  for (const k of ['name', 'universe', 'isPublic', 'spectators']) if (k in upd) l[k] = upd[k];
  if ('passHash' in upd) l.hasPass = !!upd.passHash;
  if (Object.keys(l).length) await update(listRef(code), l);
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
    remove(roomRef(r.code)); remove(listRef(r.code)); remove(ref(db, `chat/${r.code}`)); remove(ref(db, `presence/${r.code}`));
  }
}

export const setSetting = (code, key, value) => update(ref(db, `rooms/${code}/settings`), { [key]: value });

/** Indique si le navigateur est connecté à Firebase (true/false), pour afficher un bandeau de reconnexion. */
export const watchConnection = cb => onValue(ref(db, '.info/connected'), s => cb(s.val() === true));

/**
 * Maintenance de la room, exécutée par UN seul client (le plus ancien en ligne) :
 *  - hôte hors ligne depuis HOST_GRACE_MS -> transfert au plus ancien joueur en ligne ;
 *  - joueur/spectateur hors ligne depuis ABSENT_MS (room en attente) -> retiré pour libérer sa place.
 * Les transactions garantissent qu'un seul transfert est appliqué même en cas de doublon.
 */
export function createMaintainer(code, uid) {
  let room = null, online = {}, sig = '', timers = [];
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  const byAge = () => Object.entries(room?.players || {}).filter(([id]) => online[id]).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
  const leader = () => byAge()[0]?.[0];
  const plan = () => {
    clear();
    if (!room || leader() !== uid) return;
    const { settings: s, players = {} } = room;
    if (!online[s.host]) timers.push(setTimeout(() => takeOverHost(s.host).catch(console.warn), HOST_GRACE_MS));
    if (s.status === 'waiting') for (const id of Object.keys(players))
      if (id !== s.host && !online[id]) timers.push(setTimeout(() => dropAbsent(id).catch(console.warn), ABSENT_MS));
    if (s.status === 'playing' && room.game && room.game.phase !== 'done') for (const id of room.game.players)
      if (!online[id]) timers.push(setTimeout(() => forfeitAbsent(id).catch(console.warn), FORFEIT_MS));
  };
  async function takeOverHost(old) {
    if (online[old] || room?.settings.host !== old || leader() !== uid) return;
    const next = (byAge().find(([, p]) => p.role === 'player') || byAge()[0])[0];
    const res = await runTransaction(ref(db, `rooms/${code}/settings/host`), cur => cur === old ? next : undefined);
    if (res.committed) { update(listRef(code), { host: next }); sendSystem(code, `${room.players[next].name} est le nouvel hôte.`); }
  }
  async function dropAbsent(id) {
    if (online[id] || !room?.players?.[id] || leader() !== uid) return;
    const name = room.players[id].name;
    await remove(ref(db, `rooms/${code}/players/${id}`));
    sendSystem(code, `${name} a été retiré (absent).`);
  }
  async function forfeitAbsent(id) {
    if (online[id] || leader() !== uid || !room?.game || room.game.phase === 'done') return;
    await act(code, room, { type: 'forfeit', uid, loser: id });
  }
  return {
    update(r, o) {
      room = r; online = o;
      const next = r ? `${r.settings.host}|${r.settings.status}|${r.game?.phase}|${leader()}|${Object.keys(r.players || {}).filter(id => !o[id]).sort()}` : '';
      if (next !== sig) { sig = next; plan(); }
    },
    stop: clear
  };
}
