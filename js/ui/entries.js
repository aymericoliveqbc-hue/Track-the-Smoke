// Rendu des entrées du journal (timeline, listes).

import { h } from './dom.js';
import { icon } from './icons.js';
import { badge } from './components.js';
import { state, derived, catById } from '../core/store.js';
import { fmtGrams, fmtMoney, fmtQty, isNum } from '../core/format.js';
import { formatDuration } from '../core/dates.js';
import { TRIGGERS, CRAVING_PRODUCTS, labelOf, CONTEXTS } from '../domain/models.js';
import { computeNight } from '../domain/sleep.js';
import { openEntryForm, openCravingForm, openNightForm } from './forms.js';

const methodBadge = (m) => (m === 'weighed' ? badge('pesé', 'violet') : m === 'estimated' ? badge('estimé', 'muted') : null);

export function entryTitle(e) {
  if (e.kind === 'craving') return e.outcome === 'consumed' ? 'Envie suivie d’une consommation' : 'Envie résistée';
  return catById(e.categoryId)?.name || 'Consommation';
}

export function entryRow(e, { showDate = false } = {}) {
  if (e.kind === 'craving') {
    const resisted = e.outcome !== 'consumed';
    return h('button', { class: 'tl-item', onclick: () => openCravingForm({ craving: e }) },
      h('span', { class: 'tl-time' }, showDate ? `${e.at.slice(8, 10)}/${e.at.slice(5, 7)} ` : '', e.at.slice(11, 16)),
      h('span', { class: `tl-dot ${resisted ? 'tone-green' : 'tone-orange'}` }, icon('wave', 14)),
      h('span', { class: 'tl-main' },
        h('span', { class: 'tl-title' }, entryTitle(e)),
        h('span', { class: 'tl-sub' }, [
          isNum(e.intensity) ? `Intensité ${e.intensity}/10` : null,
          labelOf(CRAVING_PRODUCTS, e.product),
          e.trigger ? (e.trigger === 'other' && e.triggerOther ? e.triggerOther : labelOf(TRIGGERS, e.trigger)) : null,
          isNum(e.durationMin) ? formatDuration(e.durationMin) : null,
        ].filter(Boolean).join(' · '))),
      icon('chevron', 14, 'row-chevron'));
  }
  const cat = catById(e.categoryId);
  const { cost } = derived();
  const c = cost(e);
  const parts = [];
  if (e.tobacco) parts.push(h('span', null, `Tabac ${isNum(e.tobacco.grams) ? fmtGrams(e.tobacco.grams) : '?'}`, methodBadge(e.tobacco.method)));
  if (e.cbd) parts.push(h('span', null, `CBD ${isNum(e.cbd.amount) ? fmtQty(e.cbd.amount, e.cbd.unit) : '?'}`, e.tobacco?.method !== e.cbd.method || !e.tobacco ? methodBadge(e.cbd.method) : null));
  if (e.quantity && isNum(e.quantity.amount)) parts.push(h('span', null, `${fmtQty(e.quantity.amount, e.quantity.unit)}`));
  if (e.context) parts.push(h('span', null, labelOf(CONTEXTS, e.context)));
  return h('button', { class: 'tl-item', onclick: () => openEntryForm({ entry: e }) },
    h('span', { class: 'tl-time' }, showDate ? `${e.at.slice(8, 10)}/${e.at.slice(5, 7)} ` : '', e.at.slice(11, 16)),
    h('span', { class: `tl-dot tone-${cat?.color || 'violet'}` }, icon(cat?.icon || 'custom', 14)),
    h('span', { class: 'tl-main' },
      h('span', { class: 'tl-title' }, cat?.name || 'Consommation', e.note ? h('span', { class: 'tl-note' }, ' · ', e.note) : null),
      h('span', { class: 'tl-sub' }, parts.length ? parts.reduce((acc, p, i) => (i ? [...acc, ' · ', p] : [p]), []) : 'Quantités non renseignées')),
    h('span', { class: 'tl-cost' }, c.total > 0 || c.complete ? fmtMoney(c.total) : '—', !c.complete ? h('i', { class: 'warn-dot', title: 'Coût incomplet' }) : null));
}

export function nightRow(n) {
  const c = computeNight(n);
  return h('button', { class: 'tl-item', onclick: () => openNightForm({ date: n.date }) },
    h('span', { class: 'tl-time' }, n.bedTime || '—'),
    h('span', { class: 'tl-dot tone-blue' }, icon('moon', 14)),
    h('span', { class: 'tl-main' },
      h('span', { class: 'tl-title' }, 'Nuit', isNum(n.quality) ? ` · qualité ${n.quality}/5` : '', n.source === 'apple-health' || n.health ? badge('Santé', 'orange') : null),
      h('span', { class: 'tl-sub' }, [
        c.totalSleepMin != null ? `${formatDuration(c.totalSleepMin)} de sommeil` : null,
        c.latencyMin != null ? `endormissement ${formatDuration(c.latencyMin)}` : null,
        isNum(n.awakenings) ? `${n.awakenings} réveil${n.awakenings > 1 ? 's' : ''}` : null,
      ].filter(Boolean).join(' · ') || 'Nuit enregistrée')),
    icon('chevron', 14, 'row-chevron'));
}

export function entriesOfDay(day) {
  return state.entries.filter((e) => e.at.slice(0, 10) === day).sort((a, b) => (a.at < b.at ? -1 : 1));
}
