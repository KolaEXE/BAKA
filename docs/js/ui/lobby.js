import { h, toast, friendly } from '../core/utils.js';
import { watchRoom, watchPresence, connectPresence, leaveRoom, setSetting, watchConnection, createMaintainer } from '../platform/rooms.js';
import { createChat } from './chat.js';
import { createBoard } from './board.js';
import { createSettings } from './settings.js';
import { renderJoin } from './join.js';
import { startGame, resetToLobby } from '../games/draft/net.js';

export function renderLobby(root, ctx, code, nav) {
  const uid = ctx.user.uid;
  let room = null, online = {}, stopPresence = null, chat = null, board = null, mode = null;
  let leaving = false, joinShown = false, chatOpen = true, codeHidden = false, gameSeen = false;
  const maint = createMaintainer(code, uid);
  const link = () => `${location.origin}${location.pathname}#/room/${code}`;
  const copyLink = () => navigator.clipboard.writeText(link()).then(() => toast("Lien d'invitation copié."), () => toast(link()));

  const banner = h('div', { class: 'banner', role: 'status', hidden: true }, 'Connexion perdue. Reconnexion en cours…');
  const settings = createSettings({ code, onCopy: copyLink });
  const playersBox = h('section', { class: 'panel stack' });
  const lobbyView = h('div', { class: 'grid' }, settings.el, playersBox);
  const main = h('div', { class: 'stack main' });
  const chatBox = h('section', { class: 'panel chatbox' });
  const layout = h('div', { class: 'layout' }, main, chatBox);
  const crumb = h('div', { class: 'crumb' });
  const chatBtn = h('button', { class: 'btn small', onclick: () => { chatOpen = !chatOpen; applyChat(); } });
  const applyChat = () => { layout.classList.toggle('chat-closed', !chatOpen); chatBtn.textContent = chatOpen ? 'Masquer le chat' : 'Afficher le chat'; };
  const drawCrumb = () => crumb.replaceChildren(h('a', { class: 'logo', href: '#/' }, 'BAKA'), h('span', { class: 'sep' }, '/'), h('span', { class: 'muted' }, 'room'), h('span', { class: 'sep' }, '/'),
    h('button', { class: `codebtn ${codeHidden ? 'blur' : ''}`, title: "Copier le lien d'invitation", onclick: copyLink }, code),
    h('button', { class: 'btn small', onclick: () => { codeHidden = !codeHidden; drawCrumb(); } }, codeHidden ? 'Afficher le code' : 'Masquer le code'));
  // Quitter : on coupe d'abord la présence et on bloque tout redessin, sinon l'écran « rejoindre » ré-inscrirait le joueur.
  const leave = async () => { leaving = true; stopPresence?.(); stopPresence = null; try { await leaveRoom(code, uid); } catch (e) { toast(friendly(e), 'error'); } nav('/'); };
  const shell = h('div', { class: 'wrap' }, banner, h('header', { class: 'top' }, crumb,
    h('div', { class: 'row' }, chatBtn, h('button', { class: 'btn', onclick: leave }, 'Quitter la room'))), layout);
  applyChat(); drawCrumb();

  let bannerTimer = null; // bandeau seulement si la coupure dure plus d'1,5 s
  const offConn = watchConnection(ok => { clearTimeout(bannerTimer); if (ok) banner.hidden = true; else bannerTimer = setTimeout(() => { banner.hidden = false; }, 1500); });
  const teardownView = () => { chat?.destroy(); chat = null; board?.destroy(); board = null; mode = null; };
  const message = text => { teardownView(); root.replaceChildren(h('div', { class: 'wrap stack' }, h('p', { class: 'empty' }, text), h('button', { class: 'btn', onclick: () => nav('/') }, "Retour à l'accueil"))); };

  const draw = () => {
    if (leaving) return;
    if (!room) return message(`La room ${code} n'existe pas ou a été supprimée.`);
    const { settings: s, players = {} } = room, me = players[uid];
    if (!me) {
      if (!joinShown) { joinShown = true; teardownView(); stopPresence?.(); stopPresence = null; root.replaceChildren(renderJoin(ctx, code, room, nav)); }
      return;
    }
    if (joinShown || !root.contains(shell)) { joinShown = false; root.replaceChildren(shell); }
    if (!stopPresence) stopPresence = connectPresence(code, uid, me.role);
    maint.update(room, online);
    if (!chat) {
      chat = createChat({ code, user: ctx.user, getMe: () => room.players[uid], getSettings: () => room.settings, isHost: () => room.settings.host === uid,
        setGlobalHide: v => setSetting(code, 'hideSpecChat', v), onClose: () => { chatOpen = false; applyChat(); } });
      chatBox.replaceChildren(chat.el);
    }
    const inGame = !!room.game;
    if (inGame && !gameSeen) { gameSeen = true; codeHidden = true; } // le code est masqué (flouté) dès que la partie démarre
    if (!inGame) gameSeen = false;
    drawCrumb();
    const want = inGame ? 'game' : 'lobby';
    if (mode !== want) {
      mode = want;
      if (inGame) { board = createBoard({ uid, onReset: () => resetToLobby(code).catch(e => toast(friendly(e), 'error')) }); main.replaceChildren(board.el); }
      else { board?.destroy(); board = null; main.replaceChildren(lobbyView); }
    }
    if (inGame) board.update(room, online);
    else {
      settings.refresh(room, s.host === uid);
      const list = Object.entries(players).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
      const row = ([id, p]) => h('div', { class: 'player' }, h('span', { class: `dot ${online[id] ? 'on' : ''}`, title: online[id] ? 'En ligne' : 'Hors ligne' }),
        h('b', {}, p.name), id === uid ? h('span', { class: 'muted' }, '(toi)') : null, s.host === id ? h('span', { class: 'tag wait' }, 'Hôte') : null, online[id] ? null : h('span', { class: 'muted' }, 'hors ligne'));
      const gamers = list.filter(([, p]) => p.role === 'player'), specs = list.filter(([, p]) => p.role === 'spectator'), ready = gamers.length === s.maxPlayers;
      playersBox.replaceChildren(...[h('h3', {}, `Joueurs (${gamers.length}/${s.maxPlayers})`), h('div', {}, gamers.map(row)),
        specs.length ? h('h3', {}, `Spectateurs (${specs.length})`) : null, specs.length ? h('div', {}, specs.map(row)) : null,
        s.host === uid ? h('button', { class: 'btn primary', disabled: !ready, onclick: async e => {
          e.target.disabled = true;
          try { await startGame(code, room); } catch (x) { toast(friendly(x), 'error'); e.target.disabled = false; }
        } }, ready ? 'Lancer la partie' : "En attente d'un 2e joueur") : h('p', { class: 'muted' }, "En attente de l'hôte…")].filter(Boolean));
    }
    chat.refresh();
  };
  const a = watchRoom(code, r => { room = r && { ...r, code }; draw(); });
  const b = watchPresence(code, p => { online = p; if (room) draw(); });
  return () => { leaving = true; a(); b(); offConn(); clearTimeout(bannerTimer); maint.stop(); teardownView(); stopPresence?.(); };
}
