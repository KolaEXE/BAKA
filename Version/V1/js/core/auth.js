import { signInAnonymously, onAuthStateChanged, GoogleAuthProvider, linkWithPopup, signInWithPopup, signOut }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { ref, get, set, update } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { auth, db } from './firebase.js';
import { guestName } from './utils.js';

/** Résout avec l'utilisateur courant (connexion anonyme automatique au premier lancement). */
export const whenUser = () => new Promise((resolve, reject) => {
  const off = onAuthStateChanged(auth, u => {
    if (u) { off(); resolve(u); } else signInAnonymously(auth).catch(reject);
  });
});

/** Lie le compte anonyme à Google (même uid, profil conservé). Si le compte Google existe déjà, on s'y connecte. */
export async function signInGoogle() {
  const provider = new GoogleAuthProvider();
  try { return (await linkWithPopup(auth.currentUser, provider)).user; }
  catch (e) {
    if (e.code === 'auth/credential-already-in-use') return (await signInWithPopup(auth, provider)).user;
    throw e;
  }
}
export const logout = () => signOut(auth);

export async function loadProfile(user) {
  const r = ref(db, `users/${user.uid}`);
  const snap = await get(r);
  if (snap.exists()) return snap.val();
  const profile = { name: user.displayName || guestName(), createdAt: Date.now() };
  await set(r, profile);
  return profile;
}
export const saveName = (uid, name) => update(ref(db, `users/${uid}`), { name });
