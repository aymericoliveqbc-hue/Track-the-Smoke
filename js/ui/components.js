// Composants d'interface réutilisables.

import { h, haptic, fill } from './dom.js';
import { icon } from './icons.js';
import { parseDecimal, toInput, round2, isNum } from '../core/format.js';

/* ----------------------------- Feuilles ----------------------------- */

const sheetStack = [];

/**
 * Ouvre une feuille modale (bottom sheet).
 * build(close) doit renvoyer le contenu. Renvoie close().
 */
export function openSheet({ title, build, onClose, size = 'auto', actions }) {
  const root = document.getElementById('sheets');
  const backdrop = h('div', { class: 'sheet-backdrop' });
  let closed = false;
  const close = (result) => {
    if (closed) return; closed = true;
    panel.classList.remove('open'); backdrop.classList.remove('open');
    setTimeout(() => { backdrop.remove(); panel.remove(); }, 260);
    sheetStack.splice(sheetStack.indexOf(close), 1);
    document.body.classList.toggle('sheet-open', sheetStack.length > 0);
    onClose?.(result);
  };
  const header = h('div', { class: 'sheet-head' },
    h('div', { class: 'grabber' }),
    h('div', { class: 'sheet-title-row' },
      h('h2', { class: 'sheet-title' }, title || ''),
      actions || null,
      h('button', { class: 'icon-btn', 'aria-label': 'Fermer', onclick: () => close() }, icon('close', 20))));
  const body = h('div', { class: 'sheet-body' });
  const panel = h('div', { class: `sheet sheet-${size}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '' }, header, body);
  body.append(build(close));
  backdrop.addEventListener('click', () => close());
  // Glisser vers le bas pour fermer.
  let startY = null;
  header.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; }, { passive: true });
  header.addEventListener('touchmove', (e) => {
    if (startY == null) return;
    const dy = Math.max(0, e.touches[0].clientY - startY);
    panel.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  header.addEventListener('touchend', (e) => {
    const dy = (e.changedTouches[0].clientY - (startY ?? 0));
    panel.style.transform = '';
    startY = null;
    if (dy > 90) close();
  });
  root.append(backdrop, panel);
  sheetStack.push(close);
  document.body.classList.add('sheet-open');
  requestAnimationFrame(() => { backdrop.classList.add('open'); panel.classList.add('open'); });
  return close;
}

export function closeAllSheets() { [...sheetStack].reverse().forEach((c) => c()); }

/* ----------------------------- Toast ----------------------------- */

export function toast(message, { action, onAction, tone = 'default', duration = 3200 } = {}) {
  const root = document.getElementById('toasts');
  const el = h('div', { class: `toast toast-${tone}` }, h('span', null, message),
    action ? h('button', { class: 'toast-action', onclick: () => { onAction?.(); dismiss(); } }, action) : null);
  root.append(el);
  requestAnimationFrame(() => el.classList.add('on'));
  const dismiss = () => { el.classList.remove('on'); setTimeout(() => el.remove(), 250); };
  setTimeout(dismiss, duration);
}

/* ----------------------------- Confirmation ----------------------------- */

export function confirmDialog({ title, message, confirm = 'Confirmer', danger = false, requireText }) {
  return new Promise((resolve) => {
    let ok = false;
    openSheet({
      title,
      onClose: () => resolve(ok),
      build: (close) => {
        const input = requireText ? h('input', { class: 'input', placeholder: requireText, autocomplete: 'off' }) : null;
        const btn = h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'} btn-block`, disabled: !!requireText, onclick: () => { ok = true; close(); } }, confirm);
        input?.addEventListener('input', () => { btn.disabled = input.value.trim().toUpperCase() !== requireText.toUpperCase(); });
        return h('div', { class: 'stack' },
          h('p', { class: 'muted' }, message),
          input ? h('label', { class: 'field' }, h('span', { class: 'field-label' }, `Tape « ${requireText} » pour confirmer`), input) : null,
          btn,
          h('button', { class: 'btn btn-ghost btn-block', onclick: () => close() }, 'Annuler'));
      },
    });
  });
}

/* ----------------------------- Champs ----------------------------- */

export function field(label, control, hint) {
  // Sur iPhone (WebKit), un toucher sur un bouton placé dans un <label> est
  // renvoyé au PREMIER bouton du label : seuls les champs simples utilisent
  // donc un <label> ; les groupes de boutons utilisent un <div>.
  const simple = control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement;
  return h(simple ? 'label' : 'div', { class: 'field' },
    label ? h('span', { class: 'field-label' }, label) : null,
    control,
    hint ? h('span', { class: 'field-hint' }, hint) : null);
}

export function textInput({ value = '', placeholder = '', oninput, type = 'text', ...rest }) {
  return h('input', { class: 'input', type, value, placeholder, oninput: (e) => oninput?.(e.target.value), ...rest });
}

export function textArea({ value = '', placeholder = '', oninput, rows = 2 }) {
  const t = h('textarea', { class: 'input textarea', placeholder, rows, oninput: (e) => oninput?.(e.target.value) });
  t.value = value || '';
  return t;
}

/** Saisie décimale (clavier numérique iOS) avec boutons ±. */
export function decimalInput({ value, onchange, step = 0.01, min = 0, max, unit = 'g', placeholder = '—', label, stepper = true }) {
  const input = h('input', { class: 'input num-input', inputmode: 'decimal', placeholder, value: toInput(value), 'aria-label': label || 'Quantité', enterkeyhint: 'done' });
  let current = isNum(value) ? value : null;
  const set = (v, fromInput = false) => {
    current = v == null ? null : round2(Math.max(min, max != null ? Math.min(max, v) : v));
    if (!fromInput) input.value = toInput(current);
    onchange?.(current);
  };
  input.addEventListener('input', () => {
    const raw = input.value.trim();
    if (raw === '') { set(null, true); return; }
    const n = parseDecimal(raw);
    if (n != null) set(n, true);
  });
  input.addEventListener('blur', () => { input.value = toInput(current); });
  input.addEventListener('focus', () => setTimeout(() => input.select(), 0));
  const btn = (delta, ic) => h('button', { type: 'button', class: 'step-btn', 'aria-label': delta > 0 ? 'Augmenter' : 'Diminuer', onclick: () => { haptic(); set((current ?? 0) + delta); } }, icon(ic, 18));
  const el = h('div', { class: 'num-field' },
    stepper ? btn(-step, 'minus') : null,
    h('div', { class: 'num-wrap' }, input, h('span', { class: 'num-unit' }, unit)),
    stepper ? btn(step, 'plus') : null);
  el.setValue = (v) => set(v);
  el.getValue = () => current;
  return el;
}

/** Contrôle segmenté. options: [{id,label}] */
export function segmented(options, value, onchange, { small = false } = {}) {
  const el = h('div', { class: `segmented ${small ? 'segmented-sm' : ''}`, role: 'tablist' });
  const render = (val) => {
    fill(el, ...options.map((o) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(o.id === val), class: o.id === val ? 'on' : '',
      onclick: () => { if (o.id !== val) { haptic(); render(o.id); onchange(o.id); } },
    }, o.label)));
  };
  render(value);
  return el;
}

/** Puces de sélection (simple ou multiple). */
export function chips(options, value, onchange, { multiple = false, allowNone = true } = {}) {
  const el = h('div', { class: 'chips' });
  let val = value;
  const render = () => {
    fill(el, ...options.map((o) => {
      const on = multiple ? (val || []).includes(o.id) : val === o.id;
      return h('button', {
        type: 'button', class: `chip ${on ? 'on' : ''}`, 'aria-pressed': String(on),
        onclick: () => {
          haptic(5);
          if (multiple) { val = on ? val.filter((x) => x !== o.id) : [...(val || []), o.id]; }
          else { val = on && allowNone ? null : o.id; }
          render(); onchange(val);
        },
      }, o.label);
    }));
  };
  render();
  return el;
}

/** Interrupteur. */
export function toggle(checked, onchange, label) {
  const input = h('input', { type: 'checkbox', checked, role: 'switch', onchange: (e) => { haptic(); onchange(e.target.checked); } });
  return h('label', { class: 'toggle-row' }, h('span', { class: 'grow' }, label), h('span', { class: 'switch' }, input, h('span', { class: 'switch-ui' })));
}

/** Échelle 0–10 / 1–5. */
export function scale(min, max, value, onchange, { labels } = {}) {
  const el = h('div', { class: 'scale', style: { gridTemplateColumns: `repeat(${max - min + 1}, 1fr)` } });
  let val = value;
  const render = () => fill(el, ...Array.from({ length: max - min + 1 }, (_, i) => {
    const v = min + i;
    return h('button', { type: 'button', class: `scale-btn ${val === v ? 'on' : ''} ${val != null && v <= val ? 'fill' : ''}`, onclick: () => { haptic(5); val = val === v ? null : v; render(); onchange(val); } }, String(v));
  }));
  render();
  const wrapEl = h('div', null, el, labels ? h('div', { class: 'scale-labels' }, h('span', null, labels[0]), h('span', null, labels[1])) : null);
  return wrapEl;
}

/** Sélecteur natif stylé. */
export function select(options, value, onchange, { placeholder } = {}) {
  const s = h('select', { class: 'input select', onchange: (e) => onchange(e.target.value || null) },
    placeholder ? h('option', { value: '' }, placeholder) : null,
    options.map((o) => h('option', { value: o.id, selected: o.id === value }, o.label)));
  return s;
}

/* ----------------------------- Mise en page ----------------------------- */

export function card(...children) { return h('section', { class: 'card' }, ...children); }

export function cardHead(title, right) {
  return h('div', { class: 'card-head' }, h('h3', { class: 'card-title' }, title), right || null);
}

export function sectionTitle(title, right) {
  return h('div', { class: 'section-title' }, h('h2', null, title), right || null);
}

export function statTile({ label, value, sub, tone, onclick, extra }) {
  return h(onclick ? 'button' : 'div', { class: `tile ${tone ? 'tile-' + tone : ''}`, onclick },
    h('span', { class: 'tile-label' }, label),
    h('span', { class: 'tile-value' }, value),
    sub ? h('span', { class: 'tile-sub' }, sub) : null,
    extra || null);
}

export function emptyState({ icon: ic = 'sparkle', title, text, action }) {
  return h('div', { class: 'empty' },
    h('div', { class: 'empty-icon' }, icon(ic, 26)),
    h('h3', null, title),
    text ? h('p', null, text) : null,
    action || null);
}

export function listRow({ icon: ic, iconTone, title, sub, right, onclick, chevron = !!onclick }) {
  return h(onclick ? 'button' : 'div', { class: 'row', onclick },
    ic ? h('span', { class: `row-icon tone-${iconTone || 'violet'}` }, icon(ic, 18)) : null,
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, title), sub ? h('span', { class: 'row-sub' }, sub) : null),
    right != null ? h('span', { class: 'row-right' }, right) : null,
    chevron ? icon('chevron', 16, 'row-chevron') : null);
}

export function badge(text, tone = 'muted') { return h('span', { class: `badge badge-${tone}` }, text); }

export function note(text, tone = 'info') {
  return h('div', { class: `note note-${tone}` }, icon(tone === 'warn' ? 'info' : tone === 'positive' ? 'sparkle' : 'info', 16), h('span', null, text));
}

export function delta(pct, { lowerIsBetter = true } = {}) {
  if (pct == null) return h('span', { class: 'delta delta-none' }, '—');
  const v = Math.round(pct * 100);
  if (v === 0) return h('span', { class: 'delta delta-flat' }, 'stable');
  const good = lowerIsBetter ? v < 0 : v > 0;
  return h('span', { class: `delta ${good ? 'delta-good' : 'delta-neutral'}` }, icon(v < 0 ? 'arrowDown' : 'arrowUp', 12), `${Math.abs(v)} %`);
}
