import { h, toast, friendly } from '../core/utils.js';
import { universeLabel } from '../config/constants.js';
import { watchRoom, watchPresence, connectPresence, leaveRoom } from '../platform/rooms.js';

export function renderLobby(root, ctx, code, nav) {
  let room = null, online = {}, stopPresence = null;
  const draw = () => {
    if (!room) { root.replaceChildren(h('div', { class: 'wrap' }, h('p', { class: 'empty' }, `La room ${code} n'existe plus.`), h('button', { class: 'btn', onclick: () => nav('/') }, "Retour à l'accueil"))); return; }
    const { settings: s, players = {} } = room;
    const me = players[ctx.user.uid];
    if (!me) { nav(`/join/${code}`); return; }
    if (!stopPresence) stopPresence = connectPresence(code, ctx.user.uid, me.role);
    const list = Object.entries(players).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
    const row = ([id, p]) => h('div', { class: 'player' }, h('span', { class: `dot ${online[id] ? 'on' : ''}`, title: online[id] ? 'En ligne' : 'Hors ligne' }),
      h('b', {}, p.name), id === ctx.user.uid ? h('span', { class: 'muted' }, '(toi)') : null,
      s.host === id ? h('span', { class: 'tag wait' }, 'Hôte') : null);
    const link = `${location.origin}${location.pathname}#/join/${code}`;
    root.replaceChildren(h('div', { class: 'wrap' },
      h('header', { class: 'top' }, h('a', { class: 'logo', href: '#/' }, 'BAKA'),
        h('button', { class: 'btn', onclick: async () => { try { await leaveRoom(code, ctx.user.uid); } catch (e) { toast(friendly(e), 'error'); } nav('/'); } }, 'Quitter la room')),
      h('div', { class: 'grid' },
        h('section', { class: 'panel stack' }, h('h2', {}, s.name), h('div', { class: 'code' }, code),
          h('button', { class: 'btn', onclick: () => navigator.clipboard.writeText(link).then(() => toast("Lien d'invitation copié."), () => toast(link)) }, "Copier le lien d'invitation"),
          h('p', { class: 'muted' }, `${universeLabel(s.universe)} · ${s.cards} cartes · budget ${s.budget}M · ${s.isPublic ? 'publique' : 'privée'} · spectateurs ${s.spectators ? 'autorisés' : 'interdits'}${s.timer.on ? ` · timer ${s.timer.sec}s` : ''}`)),
        h('section', { class: 'panel stack' },
          h('h3', {}, `Joueurs (${list.filter(([, p]) => p.role === 'player').length}/${s.maxPlayers})`), h('div', {}, list.filter(([, p]) => p.role === 'player').map(row)),
          h('h3', {}, 'Spectateurs'), h('div', {}, list.filter(([, p]) => p.role === 'spectator').map(row)),
          s.host === ctx.user.uid ? h('button', { class: 'btn primary', disabled: true }, 'Lancer la partie (étape 5)') : h('p', { class: 'muted' }, "En attente de l'hôte…")))));
  };
  const a = watchRoom(code, r => { room = r; draw(); });
  const b = watchPresence(code, p => { online = p; if (room) draw(); });
  return () => { a(); b(); stopPresence?.(); };
}
