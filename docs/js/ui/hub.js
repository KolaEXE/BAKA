import { h, toast, friendly, cleanName, normCode } from '../core/utils.js';
import { signInGoogle, saveName } from '../core/auth.js';
import { UNIVERSES, DEFAULTS, universeLabel } from '../config/constants.js';
import { createRoom, joinRoom, watchHub } from '../platform/rooms.js';

export function renderHub(root, ctx, nav) {
  const { user, profile } = ctx;
  const nameIn = h('input', { type: 'text', id: 'pseudo', maxlength: 20, value: profile.name, placeholder: 'Guest1234' });
  const getName = () => cleanName(nameIn.value) || profile.name;
  const codeIn = h('input', { type: 'text', id: 'code', maxlength: 5, placeholder: 'Code (ex. K7P2X)', autocomplete: 'off' });
  const list = h('div', { class: 'rooms' }, h('p', { class: 'empty' }, 'Chargement des rooms…'));
  const fUni = h('select', { 'aria-label': 'Filtrer par univers' }, h('option', { value: '' }, 'Tous les univers'), UNIVERSES.map(u => h('option', { value: u.id }, u.label)));
  const fStat = h('select', { 'aria-label': 'Filtrer par statut' }, h('option', { value: '' }, 'Tous les statuts'), h('option', { value: 'waiting' }, 'En attente'), h('option', { value: 'playing' }, 'En cours'));
  let rooms = [];

  const persistName = async () => { const n = getName(); ctx.profile.name = n; try { await saveName(user.uid, n); } catch {} return n; };
  const go = code => { ctx.profile.name = getName(); nav(`/room/${code}`); };

  const draw = () => {
    const shown = rooms.filter(r => r.isPublic && r.players + r.specs > 0 && (!fUni.value || r.universe === fUni.value) && (!fStat.value || r.status === fStat.value));
    list.replaceChildren(...(shown.length ? shown.map(r => h('div', { class: 'room' },
      h('div', {}, h('b', {}, r.name), ' ', r.hasPass ? h('span', { class: 'tag' }, 'Mot de passe') : null,
        h('div', { class: 'muted' }, `${universeLabel(r.universe)} · ${r.players}/${r.maxPlayers} joueurs · ${r.specs} spectateur${r.specs > 1 ? 's' : ''}`)),
      h('div', { class: 'row' },
        h('span', { class: `tag ${r.status === 'waiting' ? 'wait' : 'live'}` }, r.status === 'waiting' ? 'En attente' : 'En cours'),
        h('button', { class: 'btn small primary', onclick: () => go(r.code) }, 'Rejoindre'))))
      : [h('p', { class: 'empty' }, 'Aucune room publique. Crée la première et invite tes amis.')]));
  };
  fUni.onchange = fStat.onchange = draw;
  const stop = watchHub(r => { rooms = r; draw(); });

  const googleBtn = h('button', { class: 'btn small', onclick: async () => {
    try { await signInGoogle(); toast('Connecté avec Google. Ton profil est conservé.'); location.reload(); } catch (e) { toast(friendly(e), 'error'); }
  } }, user.isAnonymous ? 'Se connecter avec Google' : 'Compte Google lié');
  googleBtn.disabled = !user.isAnonymous;

  const dlg = createDialog(async form => {
    const n = await persistName();
    const code = await createRoom(user, n, form);
    await joinRoom(user, n, code);
    nav(`/room/${code}`);
  });

  root.replaceChildren(h('div', { class: 'wrap' },
    h('header', { class: 'top' }, h('a', { class: 'logo', href: '#/' }, 'BAKA'),
      h('div', { class: 'me' }, h('label', { class: 'muted', for: 'pseudo' }, 'Pseudo'), nameIn, googleBtn)),
    h('div', { class: 'grid' },
      h('section', { class: 'panel stack' },
        h('h2', {}, 'Draft'),
        h('p', { class: 'muted' }, 'Enchéris sur des personnages sans voir leur puissance. Les stats tombent à la fin.'),
        h('button', { class: 'btn primary', onclick: () => dlg.showModal() }, 'Créer une room'),
        h('div', { class: 'field' }, h('label', { for: 'code' }, h('span', {}, 'Rejoindre avec un code')), codeIn),
        h('button', { class: 'btn', onclick: () => { const c = normCode(codeIn.value); c.length === 5 ? go(c) : toast('Le code contient 5 caractères.', 'error'); } }, 'Rejoindre')),
      h('section', { class: 'panel' }, h('h2', {}, 'Rooms publiques'), h('div', { class: 'filters' }, fUni, fStat), list)),
    dlg));
  return () => stop();
}

function createDialog(onSubmit) {
  const f = (label, input) => h('label', { class: 'field' }, h('span', {}, label), input);
  const ck = (label, checked = false) => { const i = h('input', { type: 'checkbox', checked }); return [i, h('label', { class: 'check' }, i, label)]; };
  const name = h('input', { type: 'text', maxlength: 30, placeholder: 'Ma room' });
  const uni = h('select', {}, UNIVERSES.map(u => h('option', { value: u.id }, u.label)));
  const cards = h('input', { type: 'number', min: 4, max: 40, step: 2, value: DEFAULTS.cards });
  const budget = h('input', { type: 'number', min: 10, max: 100000, step: 10, value: DEFAULTS.budget });
  const [specI, specL] = ck('Autoriser les spectateurs', true);
  const [pubI, pubL] = ck('Room publique', true);
  const [timI, timL] = ck('Activer le timer');
  const sec = h('input', { type: 'number', min: 10, max: 120, value: DEFAULTS.timerSec });
  const pass = h('input', { type: 'password', maxlength: 30, placeholder: 'Facultatif', autocomplete: 'new-password' });
  const err = h('p', { role: 'alert', style: 'color:var(--bad);margin:0' });
  const submit = h('button', { class: 'btn primary', type: 'submit' }, 'Créer la room');
  const dlg = h('dialog', {}, h('form', { class: 'stack', onsubmit: async e => {
    e.preventDefault(); err.textContent = '';
    const c = +cards.value, b = +budget.value;
    if (!Number.isInteger(c) || c < 4 || c % 2) return err.textContent = 'Le nombre de cartes doit être pair (minimum 4).';
    if (!Number.isInteger(b) || b < 10) return err.textContent = 'Le budget minimum est de 10M.';
    submit.disabled = true; submit.textContent = 'Création…';
    try { await onSubmit({ name: name.value.trim(), universe: uni.value, cards: c, budget: b, spectators: specI.checked, isPublic: pubI.checked,
      password: pass.value, timerOn: timI.checked, timerSec: Math.min(120, Math.max(10, +sec.value || 30)) }); }
    catch (x) { err.textContent = friendly(x); submit.disabled = false; submit.textContent = 'Créer la room'; }
  } },
    h('h2', {}, 'Nouvelle room'), f('Nom de la room', name), f('Univers', uni),
    h('div', { class: 'row' }, f('Cartes (pair)', cards), f('Budget (M)', budget)),
    f('Joueurs', h('input', { type: 'text', value: '2 (1 contre 1)', disabled: true })),
    specL, pubL, timL, f('Durée du timer (secondes)', sec), f('Mot de passe', pass), err,
    h('div', { class: 'row between' }, h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'Annuler'), submit)));
  return dlg;
}
