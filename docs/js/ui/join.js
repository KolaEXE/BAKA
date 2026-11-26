import { h, friendly, cleanName } from '../core/utils.js';
import { universeLabel } from '../config/constants.js';
import { joinRoom } from '../platform/rooms.js';
import { saveName } from '../core/auth.js';

/** Écran affiché quand on ouvre #/room/CODE sans être dans la room : pseudo + mot de passe dans des champs du site. */
export function renderJoin(ctx, code, room, nav) {
  const s = room.settings, all = Object.values(room.players || {});
  const gamers = all.filter(p => p.role === 'player').length, specs = all.filter(p => p.role === 'spectator').length;
  const pseudo = h('input', { type: 'text', id: 'jp', maxlength: 20, value: ctx.profile.name, autocomplete: 'nickname' });
  const pass = s.passHash ? h('input', { type: 'password', id: 'jpw', placeholder: 'Mot de passe de la room', autocomplete: 'off' }) : null;
  const err = h('p', { role: 'alert', style: 'color:var(--bad);margin:0' });
  const btns = [];
  const go = async asSpectator => {
    err.textContent = ''; btns.forEach(b => { b.disabled = true; });
    try {
      const n = cleanName(pseudo.value) || ctx.profile.name; ctx.profile.name = n; saveName(ctx.user.uid, n).catch(() => {});
      await joinRoom(ctx.user, n, code, { asSpectator, password: pass ? pass.value : '' });
    } catch (e) { err.textContent = friendly(e); btns.forEach(b => { b.disabled = false; }); }
  };
  const canPlay = s.status === 'waiting' && gamers < s.maxPlayers;
  if (canPlay) btns.push(h('button', { class: 'btn primary', onclick: () => go(false) }, 'Rejoindre la partie'));
  if (s.spectators) btns.push(h('button', { class: 'btn', onclick: () => go(true) }, 'Regarder'));
  return h('div', { class: 'wrap' }, h('header', { class: 'top' }, h('a', { class: 'logo', href: '#/' }, 'BAKA')),
    h('section', { class: 'setup stack' }, h('h2', {}, s.name),
      h('p', { class: 'muted', style: 'margin:0' }, `${universeLabel(s.universe)} · ${gamers}/${s.maxPlayers} joueurs · ${specs} spectateur${specs > 1 ? 's' : ''} · ${s.status === 'waiting' ? 'en attente' : 'en cours'}`),
      h('label', { class: 'field' }, h('span', {}, 'Ton pseudo'), pseudo), pass ? h('label', { class: 'field' }, h('span', {}, 'Mot de passe'), pass) : null,
      err, btns.length ? h('div', { class: 'row' }, ...btns) : h('p', { class: 'empty' }, 'La room est complète et les spectateurs sont interdits.'),
      h('button', { class: 'btn small', onclick: () => nav('/') }, "Retour à l'accueil")));
}
