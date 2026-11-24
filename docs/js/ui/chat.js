import { h, toast, friendly } from '../core/utils.js';
import { sendMessage, watchChat } from '../platform/chat.js';

const LS_KEY = 'baka.hideSpecChat';
const readLocal = () => { try { return localStorage.getItem(LS_KEY) === '1'; } catch { return false; } };
const writeLocal = v => { try { localStorage.setItem(LS_KEY, v ? '1' : '0'); } catch { /* stockage indisponible */ } };

/**
 * Chat de room. Masquage des spectateurs : choix personnel (local) pour tous,
 * et choix global (settings.hideSpecChat) réservé à l'hôte.
 */
export function createChat({ code, user, getMe, getSettings, isHost, setGlobalHide }) {
  const msgs = [];
  let localHide = readLocal(), last = 0;
  const log = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite' });
  const ctl = h('div', { class: 'stack', style: 'gap:0' });
  const input = h('input', { type: 'text', maxlength: 200, placeholder: 'Écrire un message…', 'aria-label': 'Message', autocomplete: 'off' });
  const form = h('form', { class: 'row chat-form', onsubmit: async e => {
    e.preventDefault();
    if (Date.now() - last < 700) return toast('Doucement : un message toutes les secondes environ.', 'error');
    const text = input.value; if (!text.trim()) return;
    last = Date.now(); input.value = '';
    try { const me = getMe(); await sendMessage(code, user, me.name, me.role, text); } catch (x) { toast(friendly(x), 'error'); input.value = text; }
  } }, input, h('button', { class: 'btn primary', type: 'submit' }, 'Envoyer'));

  const render = () => {
    const hide = localHide || getSettings().hideSpecChat;
    const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    log.replaceChildren(...msgs.filter(m => !(hide && m.role === 'spectator')).map(m => m.type === 'sys'
      ? h('p', { class: 'msg sys' }, m.text)
      : h('p', { class: 'msg' }, h('b', {}, m.name), m.role === 'spectator' ? h('span', { class: 'tag' }, 'spectateur') : null, ' ', m.text)));
    if (stick) log.scrollTop = log.scrollHeight;
  };
  const controls = () => {
    const s = getSettings();
    const box = (label, checked, onchange) => { const i = h('input', { type: 'checkbox', checked, onchange: () => onchange(i.checked) }); return h('label', { class: 'check' }, i, label); };
    ctl.replaceChildren(...[
      box('Masquer les messages des spectateurs (pour moi)', localHide, v => { localHide = v; writeLocal(v); render(); }),
      isHost() ? box('Masquer les messages des spectateurs pour tout le monde', !!s.hideSpecChat, v => setGlobalHide(v).catch(x => toast(friendly(x), 'error'))) : null,
      s.hideSpecChat && !isHost() ? h('p', { class: 'muted', style: 'margin:0' }, "L'hôte a masqué les messages des spectateurs.") : null].filter(Boolean));
  };
  const stop = watchChat(code, (_k, m) => { msgs.push(m); if (msgs.length > 200) msgs.shift(); render(); });
  controls();
  return { el: h('div', { class: 'stack' }, h('h3', {}, 'Chat'), log, form, ctl), refresh: () => { controls(); render(); }, destroy: stop };
}
