/** Crée un élément DOM : h('div', {class:'x', onclick:fn}, enfants…) */
export const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...kids.flat().filter(k => k != null && k !== false));
  return e;
};
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I pour éviter les confusions
export const genCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
export const guestName = () => 'Guest' + (1000 + Math.floor(Math.random() * 9000));
export const cleanName = s => (s || '').trim().replace(/\s+/g, ' ').slice(0, 20);
export const normCode = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
export async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function toast(msg, kind = 'info') {
  const t = h('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), 4500);
}
export class AppError extends Error {}
/** Message lisible pour l'utilisateur à partir de n'importe quelle erreur. */
export const friendly = e => e instanceof AppError ? e.message
  : /permission_denied/i.test(e?.code + e?.message) ? "Action refusée par la base de données. Vérifie les règles Firebase (README)."
  : e?.code === 'auth/popup-closed-by-user' ? 'Connexion Google annulée.'
  : 'Une erreur est survenue : ' + (e?.message || e);
