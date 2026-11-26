import { isConfigured } from './core/firebase.js';
import { h, friendly, normCode } from './core/utils.js';

const app = document.getElementById('app');

if (!isConfigured) {
  app.replaceChildren(h('div', { class: 'setup stack' }, h('h2', {}, "Firebase n'est pas configuré"),
    h('p', {}, 'Ouvre docs/js/config/firebase-config.js et colle les valeurs de ton projet Firebase.')));
} else boot();

async function boot() {
  try {
    const { whenUser, loadProfile } = await import('./core/auth.js');
    const { renderHub } = await import('./ui/hub.js');
    const { renderLobby } = await import('./ui/lobby.js');
    const user = await whenUser();
    const ctx = { user, profile: await loadProfile(user) };
    const nav = path => { location.hash = '#' + path; };
    let cleanup = null;
    // Routes : #/ (hub) et #/room/CODE (lien d'invitation = entrée directe dans la room)
    const route = () => {
      cleanup?.(); cleanup = null;
      const [, page, arg] = location.hash.slice(1).split('/'), code = normCode(arg);
      cleanup = page === 'room' && code ? renderLobby(app, ctx, code, nav) : renderHub(app, ctx, nav);
    };
    addEventListener('hashchange', route);
    route();
  } catch (e) {
    app.replaceChildren(h('div', { class: 'setup stack' }, h('h2', {}, 'Connexion impossible'), h('p', {}, friendly(e)),
      h('p', { class: 'muted' }, 'Vérifie que la connexion anonyme est activée dans Firebase Auth et que ce domaine est autorisé.')));
  }
}
