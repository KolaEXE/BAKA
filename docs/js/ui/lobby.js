import { h, toast, friendly } from '../core/utils.js';
import { universeLabel } from '../config/constants.js';
import { watchRoom, watchPresence, connectPresence, leaveRoom, setSetting, watchConnection, createMaintainer } from '../platform/rooms.js';
import { createChat } from './chat.js';

export function renderLobby(root, ctx, code, nav) {
  const uid = ctx.user.uid;
  let room = null, online = {}, stopPresence = null, chat = null;
  const maint = createMaintainer(code, uid);
  const banner = h('div', { class: 'banner', role: 'status', hidden: true }, 'Connexion perdue. Reconnexion en cours…');
  const info = h('section', { class: 'panel stack' });
  const side = h('section', { class: 'panel stack' });
  const chatBox = h('section', { class: 'panel' });

  // Bandeau affiché seulement si la coupure dure plus d'1,5 s (évite le clignotement au chargement).
  let bannerTimer = null;
  const offConn = watchConnection(ok => {
    clearTimeout(bannerTimer);
    if (ok) banner.hidden = true; else bannerTimer = setTimeout(() => { banner.hidden = false; }, 1500);
  });

  const message = text => { teardownView(); root.replaceChildren(h('div', { class: 'wrap stack' }, h('p', { class: 'empty' }, text), h('button', { class: 'btn', onclick: () => nav('/') }, "Retour à l'accueil"))); };
  const teardownView = () => { chat?.destroy(); chat = null; };

  const draw = () => {
    if (!room) { message(`La room ${code} n'existe plus.`); return; }
    const { settings: s, players = {} } = room;
    const me = players[uid];
    if (!me) { nav(`/join/${code}`); return; }
    if (!stopPresence) stopPresence = connectPresence(code, uid, me.role);
    maint.update(room, online);

    if (!chat) { // squelette construit une seule fois : le chat garde son focus et son défilement
      chat = createChat({ code, user: ctx.user, getMe: () => room.players[uid], getSettings: () => room.settings,
        isHost: () => room.settings.host === uid, setGlobalHide: v => setSetting(code, 'hideSpecChat', v) });
      chatBox.replaceChildren(chat.el);
      root.replaceChildren(h('div', { class: 'wrap' }, banner,
        h('header', { class: 'top' }, h('a', { class: 'logo', href: '#/' }, 'BAKA'),
          h('button', { class: 'btn', onclick: async () => { try { await leaveRoom(code, uid); } catch (e) { toast(friendly(e), 'error'); } nav('/'); } }, 'Quitter la room')),
        h('div', { class: 'grid' }, info, h('div', { class: 'stack' }, side, chatBox))));
    }

    const list = Object.entries(players).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
    const row = ([id, p]) => h('div', { class: 'player' }, h('span', { class: `dot ${online[id] ? 'on' : ''}`, title: online[id] ? 'En ligne' : 'Hors ligne' }),
      h('b', {}, p.name), id === uid ? h('span', { class: 'muted' }, '(toi)') : null,
      s.host === id ? h('span', { class: 'tag wait' }, 'Hôte') : null,
      online[id] ? null : h('span', { class: 'muted' }, 'hors ligne'));
    const link = `${location.origin}${location.pathname}#/join/${code}`;
    const gamers = list.filter(([, p]) => p.role === 'player'), specs = list.filter(([, p]) => p.role === 'spectator');
    info.replaceChildren(h('h2', {}, s.name), h('div', { class: 'code' }, code),
      h('button', { class: 'btn', onclick: () => navigator.clipboard.writeText(link).then(() => toast("Lien d'invitation copié."), () => toast(link)) }, "Copier le lien d'invitation"),
      h('p', { class: 'muted' }, `${universeLabel(s.universe)} · ${s.cards} cartes · budget ${s.budget}M · ${s.isPublic ? 'publique' : 'privée'} · spectateurs ${s.spectators ? 'autorisés' : 'interdits'}${s.timer.on ? ` · timer ${s.timer.sec}s` : ''}`));
    side.replaceChildren(h('h3', {}, `Joueurs (${gamers.length}/${s.maxPlayers})`), h('div', {}, gamers.map(row)),
      specs.length ? h('h3', {}, `Spectateurs (${specs.length})`) : null, specs.length ? h('div', {}, specs.map(row)) : null,
      s.host === uid ? h('button', { class: 'btn primary', disabled: true }, 'Lancer la partie (étape 5)') : h('p', { class: 'muted' }, "En attente de l'hôte…"));
    chat.refresh();
  };
  const a = watchRoom(code, r => { room = r; draw(); });
  const b = watchPresence(code, p => { online = p; if (room) draw(); });
  return () => { a(); b(); offConn(); clearTimeout(bannerTimer); maint.stop(); teardownView(); stopPresence?.(); };
}
