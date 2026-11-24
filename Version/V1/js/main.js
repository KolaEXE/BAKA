import { isConfigured } from './core/firebase.js';
import { h, toast, friendly, cleanName, normCode } from './core/utils.js';

const app = document.getElementById('app');

if (!isConfigured) {
  app.replaceChildren(h('div', { class: 'setup stack' }, h('h2', {}, "Firebase n'est pas configuré"),
    h('p', {}, 'Ouvre docs/js/config/firebase-config.js et colle les valeurs de ton projet Firebase. Le README explique chaque clic.')));
} else boot();

async function boot() {
  try {
    const { whenUser, loadProfile } = await import('./core/auth.js');
    const { renderHub } = await import('./ui/hub.js');
    const { renderLobby } = await import('./ui/lobby.js');
    const { joinRoom } = await import('./platform/rooms.js');
    const user = await whenUser();
    const ctx = { user, profile: await loadProfile(user) };
    const nav = path => { location.hash = '#' + path; };
    let cleanup = null;

    const route = async () => {
      cleanup?.(); cleanup = null;
      const [, page, arg] = location.hash.slice(1).split('/');
      const code = normCode(arg);
      if (page === 'room' && code) cleanup = renderLobby(app, ctx, code, nav);
      else if (page === 'join' && code) {
        // Lien d'invitation : on rejoint avec le pseudo du profil (spectateur si la room est pleine).
        try { await joinRoom(ctx.user, cleanName(ctx.profile.name), code, { password: '' }); nav(`/room/${code}`); }
        catch (e) {
          if (e.message === 'Mot de passe incorrect.') {
            const pw = prompt('Mot de passe de la room :');
            try { if (pw !== null) { await joinRoom(ctx.user, cleanName(ctx.profile.name), code, { password: pw }); return nav(`/room/${code}`); } } catch (e2) { e = e2; }
          }
          toast(friendly(e), 'error'); nav('/');
        }
      } else cleanup = renderHub(app, ctx, nav);
    };
    addEventListener('hashchange', route);
    route();
  } catch (e) {
    app.replaceChildren(h('div', { class: 'setup stack' }, h('h2', {}, 'Connexion impossible'), h('p', {}, friendly(e)),
      h('p', { class: 'muted' }, 'Vérifie que la connexion anonyme est activée dans Firebase Auth et que ce domaine est autorisé (README).')));
  }
}
