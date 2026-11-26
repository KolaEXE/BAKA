import { h, toast, friendly } from '../core/utils.js';
import { UNIVERSES, universeLabel } from '../config/constants.js';
import { updateSettings } from '../platform/rooms.js';

/** Paramètres de la room : modifiables par l'hôte (champs persistants, sans perte de focus), lisibles par les autres. */
export function createSettings({ code, onCopy }) {
  const el = h('section', { class: 'panel stack' });
  const codeBtn = h('button', { class: 'code', title: "Copier le lien d'invitation", onclick: onCopy }, code);
  let mode = null, last = null; const f = {};
  const save = async patch => { try { await updateSettings(code, patch); } catch (e) { toast(friendly(e), 'error'); } };
  const put = (i, v) => { if (document.activeElement === i) return; if (i.type === 'checkbox') i.checked = !!v; else i.value = v; };
  const field = (l, i) => h('label', { class: 'field' }, h('span', {}, l), i);
  const check = (l, i) => h('label', { class: 'check' }, i, l);
  const num = (min, max, step, ok, msg, key) => { const i = h('input', { type: 'number', min, max, step, onchange: () => { const v = +i.value; if (Number.isInteger(v) && v >= min && v <= max && ok(v)) save({ [key]: v }); else { toast(msg, 'error'); fill(); } } }); return i; };
  const saveTimer = () => save({ timer: { on: f.tOn.checked, sec: Math.min(120, Math.max(10, +f.tSec.value || 30)) } });

  const build = () => {
    f.name = h('input', { type: 'text', maxlength: 30, onchange: () => save({ name: f.name.value.trim() || 'Room' }) });
    f.uni = h('select', { onchange: () => save({ universe: f.uni.value }) }, UNIVERSES.map(u => h('option', { value: u.id }, u.label)));
    f.cards = num(4, 40, 2, v => v % 2 === 0, 'Cartes : un nombre pair entre 4 et 40.', 'cards');
    f.budget = num(10, 100000, 10, () => true, 'Budget : minimum 10M.', 'budget');
    f.spec = h('input', { type: 'checkbox', onchange: () => save({ spectators: f.spec.checked }) });
    f.pub = h('input', { type: 'checkbox', onchange: () => save({ isPublic: f.pub.checked }) });
    f.tOn = h('input', { type: 'checkbox', onchange: saveTimer });
    f.tSec = h('input', { type: 'number', min: 10, max: 120, onchange: saveTimer });
    f.pw = h('input', { type: 'password', maxlength: 30, placeholder: 'Nouveau mot de passe', autocomplete: 'new-password',
      onchange: () => { if (f.pw.value) { save({ password: f.pw.value }); f.pw.value = ''; toast('Mot de passe enregistré.'); } } });
    f.pwState = h('p', { class: 'muted', style: 'margin:0' });
    f.pwOff = h('button', { class: 'btn small', onclick: () => save({ password: '' }) }, 'Retirer le mot de passe');
    el.replaceChildren(codeBtn, h('p', { class: 'muted', style: 'margin:0' }, 'Clique sur le code pour copier le lien.'), h('h3', {}, 'Paramètres'),
      field('Nom de la room', f.name), field('Univers', f.uni), h('div', { class: 'row' }, field('Cartes (pair)', f.cards), field('Budget (M)', f.budget)),
      field('Joueurs', h('input', { type: 'text', value: '2 (1 contre 1)', disabled: true })),
      check('Autoriser les spectateurs', f.spec), check('Room publique', f.pub), check('Activer le timer', f.tOn), field('Durée du timer (s)', f.tSec),
      field('Mot de passe', f.pw), f.pwState, f.pwOff);
  };
  function fill() {
    const s = last.settings;
    put(f.name, s.name); put(f.uni, s.universe); put(f.cards, s.cards); put(f.budget, s.budget); put(f.spec, s.spectators); put(f.pub, s.isPublic);
    put(f.tOn, s.timer.on); put(f.tSec, s.timer.sec);
    f.pwState.textContent = s.passHash ? 'Un mot de passe est actif.' : 'Aucun mot de passe.'; f.pwOff.hidden = !s.passHash;
  }
  return { el, refresh(room, isHost) {
    last = room; const s = room.settings, m = isHost ? 'host' : 'ro';
    if (isHost) { if (mode !== m) build(); fill(); }
    else el.replaceChildren(codeBtn, h('h2', {}, s.name), h('p', { class: 'muted', style: 'margin:0' },
      `${universeLabel(s.universe)} · ${s.cards} cartes · budget ${s.budget}M · ${s.isPublic ? 'publique' : 'privée'} · spectateurs ${s.spectators ? 'autorisés' : 'interdits'}${s.timer.on ? ` · timer ${s.timer.sec}s` : ''}${s.passHash ? ' · mot de passe' : ''}`),
      h('p', { class: 'muted', style: 'margin:0' }, "Seul l'hôte peut modifier les paramètres."));
    mode = m;
  } };
}
