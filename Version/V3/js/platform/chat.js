import { ref, push, query, limitToLast, onChildAdded, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { db } from '../core/firebase.js';

const chatRef = c => ref(db, `chat/${c}`);

export async function sendMessage(code, user, name, role, text) {
  text = text.trim().slice(0, 200);
  if (!text) return;
  await push(chatRef(code), { uid: user.uid, name, role, text, at: serverTimestamp() });
}
/** Événement système (arrivée, départ, nouvel hôte…) affiché dans le même fil que le chat. */
export const sendSystem = (code, text) => push(chatRef(code), { type: 'sys', text, at: serverTimestamp() }).catch(() => {});

/** Reçoit les 100 derniers messages puis les nouveaux. Retourne la fonction d'arrêt. */
export const watchChat = (code, cb) => onChildAdded(query(chatRef(code), limitToLast(100)), s => cb(s.key, s.val()));
