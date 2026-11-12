// JOURNAL — historique, recherche, filtres et calendrier mensuel.

import { h, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { card, segmented, chips, emptyState, openSheet, sectionTitle, badge } from '../ui/components.js';
import { entryRow, nightRow, entriesOfDay, entryTitle } from '../ui/entries.js';
import { openEntryForm, openCravingForm, openNightForm, openQuickAdd } from '../ui/forms.js';
import { state, derived } from '../core/store.js';
import {
  relativeDay, addMonths, startOfMonth, endOfMonth, daysBetween, weekday, WEEKDAYS_LETTER, MONTHS, formatDayLong, dayKey, addDays,
} from '../core/dates.js';
import { fmtGrams, fmtMoney, fmtNum, isNum } from '../core/format.js';
import { summarize } from '../domain/stats.js';
import { computeNight } from '../domain/sleep.js';
import { labelOf, CONTEXTS, MOODS, TRIGGERS } from '../domain/models.js';
import { formatDuration } from '../core/dates.js';

const ui = { mode: 'list', filter: 'all', query: '', month: null, metric: 'count', limitDays: 21 };

export function renderJournal() {
  const root = h('div', { class: 'view' });
  root.append(h('header', { class: 'view-head' }, h('h1', null, 'Journal'),
    h('button', { class: 'icon-btn icon-btn-solid', 'aria-label': 'Ajouter', onclick: openQuickAdd }, icon('plus', 20))));
  root.append(segmented([{ id: 'list', label: 'Historique' }, { id: 'calendar', label: 'Calendrier' }], ui.mode, (v) => { ui.mode = v; rerender(); }));
  root.append(ui.mode === 'list' ? listView() : calendarView());
  return root;
}

const rerender = () => window.dispatchEvent(new Event('tts:render'));

function filterOptions() {
  const cats = state.categories.filter((c) => !c.archived).map((c) => ({ id: c.id, label: c.short || c.name }));
  return [{ id: 'all', label: 'Tout' }, ...cats, { id: 'craving', label: 'Envies' }, { id: 'resisted', label: 'Résistées' }, { id: 'night', label: 'Nuits' }];
}

function matches(e) {
  const f = ui.filter;
  if (f === 'craving' && e.kind !== 'craving') return false;
  if (f === 'resisted' && !(e.kind === 'craving' && e.outcome !== 'consumed')) return false;
  if (f !== 'all' && f !== 'craving' && f !== 'resisted' && f !== 'night' && e.categoryId !== f) return false;
  if (f === 'night') return false;
  const q = ui.query.trim().toLowerCase();
  if (!q) return true;
  const hay = [entryTitle(e), e.note, e.triggerOther, labelOf(CONTEXTS, e.context), labelOf(MOODS, e.mood), labelOf(TRIGGERS, e.trigger), labelOf(CONTEXTS, e.situation), e.at.slice(0, 10), e.at.slice(11)]
    .filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

function listView() {
  const wrap = h('div', { class: 'stack' });
  const search = h('div', { class: 'search' }, icon('search', 18),
    h('input', { class: 'search-input', type: 'search', placeholder: 'Rechercher (note, contexte, déclencheur, date…)', value: ui.query,
      oninput: (e) => { ui.query = e.target.value; renderList(); } }));
  const filters = chips(filterOptions(), ui.filter, (v) => { ui.filter = v || 'all'; renderList(); }, { allowNone: false });
  filters.classList.add('chips-scroll');
  const listEl = h('div', { class: 'stack' });
  wrap.append(search, filters, listEl);

  const renderList = () => {
    const nightsMode = ui.filter === 'night';
    const items = nightsMode ? [] : state.entries.filter(matches);
    const nights = (ui.filter === 'all' || nightsMode) && !ui.query ? state.nights : [];
    const days = new Map();
    for (const e of items) { const d = e.at.slice(0, 10); if (!days.has(d)) days.set(d, { entries: [], night: null }); days.get(d).entries.push(e); }
    for (const n of nights) { const d = addDays(n.date, 1); if (!days.has(d)) days.set(d, { entries: [], night: null }); days.get(d).night = n; }
    const keys = [...days.keys()].sort().reverse();
    if (!keys.length) {
      fill(listEl, card(emptyState(state.entries.length || state.nights.length
        ? { icon: 'search', title: 'Aucun résultat', text: 'Essaie un autre filtre ou une autre recherche.' }
        : { icon: 'journal', title: 'Journal vide', text: 'Tes consommations, envies et nuits apparaîtront ici.', action: h('button', { class: 'btn btn-primary', onclick: openQuickAdd }, 'Ajouter une entrée') })));
      return;
    }
    const { ctx } = derived();
    const shown = keys.slice(0, ui.limitDays);
    fill(listEl, 
      ...shown.map((d) => {
        const g = days.get(d);
        const s = summarize(state.entries, { start: d, end: d }, ctx);
        const list = g.entries.sort((a, b) => (a.at < b.at ? 1 : -1));
        return h('section', { class: 'day-group' },
          h('button', { class: 'day-head', onclick: () => openDay(d) },
            h('span', { class: 'day-name' }, relativeDay(d)),
            h('span', { class: 'day-sum' }, [
              s.counts.total ? `${s.counts.total} conso.` : null,
              s.tobacco.total ? fmtGrams(s.tobacco.total) + ' tabac' : null,
              s.cbd.total ? fmtGrams(s.cbd.total) + ' CBD' : null,
              s.cost.total ? fmtMoney(s.cost.total) : null,
            ].filter(Boolean).join(' · ')), icon('chevron', 14)),
          h('div', { class: 'timeline card' }, g.night ? nightRow(g.night) : null, list.map((e) => entryRow(e))));
      }),
      keys.length > shown.length ? h('button', { class: 'btn btn-ghost btn-block', onclick: () => { ui.limitDays += 21; renderList(); } }, `Afficher plus (${keys.length - shown.length} jours)`) : null);
  };
  renderList();
  return wrap;
}

/* ----------------------------- Calendrier ----------------------------- */

const METRICS = [
  { id: 'count', label: 'Conso.' },
  { id: 'tobacco', label: 'Tabac' },
  { id: 'cbd', label: 'CBD' },
  { id: 'cost', label: '€' },
  { id: 'resisted', label: 'Envies' },
  { id: 'sleep', label: 'Sommeil' },
];

function calendarView() {
  const { ctx, today } = derived();
  const month = ui.month || startOfMonth(today);
  const start = startOfMonth(month); const end = endOfMonth(month);
  const days = daysBetween(start, end);
  const vals = new Map();
  for (const d of days) {
    const s = summarize(state.entries, { start: d, end: d }, ctx);
    const night = state.nights.find((n) => n.date === addDays(d, -1));
    vals.set(d, { s, night, tracked: !!s.coverage });
  }
  const valueOf = (v) => {
    if (!v.tracked) return null;
    switch (ui.metric) {
      case 'count': return v.s.counts.total;
      case 'tobacco': return v.s.tobacco.total;
      case 'cbd': return v.s.cbd.total;
      case 'cost': return v.s.cost.total;
      case 'resisted': return v.s.cravings.resisted;
      case 'sleep': return v.night?.quality ?? null;
      default: return null;
    }
  };
  const max = Math.max(1e-9, ...[...vals.values()].map(valueOf).filter(isNum));
  const lead = weekday(start);
  const label = (v) => {
    const x = valueOf(v);
    if (x == null) return '';
    switch (ui.metric) {
      case 'tobacco': case 'cbd': return x ? fmtNum(x, 1) : '0';
      case 'cost': return x ? fmtNum(x, 0) : '0';
      case 'sleep': return `${x}/5`;
      default: return String(x);
    }
  };
  const [y, m] = month.split('-').map(Number);
  const grid = h('div', { class: 'cal-grid' },
    WEEKDAYS_LETTER.map((w) => h('span', { class: 'cal-wd' }, w)),
    Array.from({ length: lead }, () => h('span')),
    days.map((d) => {
      const v = vals.get(d);
      const x = valueOf(v);
      const intensity = x != null && max ? x / max : 0;
      const future = d > today;
      const color = ui.metric === 'resisted' || ui.metric === 'sleep' ? '141,213,175' : '169,149,245';
      return h('button', {
        class: `cal-day ${d === today ? 'today' : ''} ${future ? 'future' : ''} ${!v.tracked ? 'untracked' : ''}`,
        disabled: future,
        style: x ? { background: `rgba(${color},${0.12 + 0.55 * intensity})` } : null,
        onclick: () => openDay(d),
        'aria-label': `${formatDayLong(d)} ${label(v)}`,
      },
      h('span', { class: 'cal-num' }, String(Number(d.slice(8)))),
      h('span', { class: 'cal-val' }, label(v)),
      h('span', { class: 'cal-dots' },
        v.s.cravings.resisted ? h('i', { class: 'd-green' }) : null,
        v.night ? h('i', { class: 'd-blue' }) : null,
        v.s.cost.incomplete ? h('i', { class: 'd-orange' }) : null));
    }));
  const ms = summarize(state.entries, { start, end }, ctx);
  return h('div', { class: 'stack' },
    h('div', { class: 'cal-nav' },
      h('button', { class: 'icon-btn', 'aria-label': 'Mois précédent', onclick: () => { ui.month = addMonths(month, -1); rerender(); } }, icon('back', 18)),
      h('h3', null, `${MONTHS[m - 1]} ${y}`),
      h('button', { class: 'icon-btn', 'aria-label': 'Mois suivant', disabled: addMonths(month, 1) > today, onclick: () => { ui.month = addMonths(month, 1); rerender(); } }, icon('chevron', 18))),
    segmented(METRICS, ui.metric, (v) => { ui.metric = v; rerender(); }, { small: true }),
    card(grid, h('div', { class: 'legend' },
      h('span', { class: 'legend-item' }, h('i', { class: 'd-green' }), 'Envie résistée'),
      h('span', { class: 'legend-item' }, h('i', { class: 'd-blue' }), 'Nuit notée'),
      h('span', { class: 'legend-item' }, h('i', { class: 'd-orange' }), 'Coût incomplet'))),
    ms.coverage ? card(h('div', { class: 'mini-grid' },
      h('div', null, h('b', null, String(ms.counts.total)), h('span', null, 'consommations')),
      h('div', null, h('b', null, fmtGrams(ms.tobacco.total)), h('span', null, 'tabac')),
      h('div', null, h('b', null, fmtGrams(ms.cbd.total)), h('span', null, 'CBD')),
      h('div', null, h('b', null, fmtMoney(ms.cost.total)), h('span', null, 'dépenses')),
      h('div', null, h('b', null, String(ms.cravings.resisted)), h('span', null, 'envies résistées')),
      h('div', null, h('b', null, `${ms.coverage.days} j`), h('span', null, 'suivis')))) : null);
}

/* ----------------------------- Détail du jour ----------------------------- */

export function openDay(day) {
  openSheet({
    title: relativeDay(day),
    size: 'full',
    build: (close) => {
      const { ctx } = derived();
      const s = summarize(state.entries, { start: day, end: day }, ctx);
      const list = entriesOfDay(day);
      const nightBefore = state.nights.find((n) => n.date === addDays(day, -1));
      const nightAfter = state.nights.find((n) => n.date === day);
      const at = `${day}T${day === dayKey() ? new Date().toTimeString().slice(0, 5) : '12:00'}`;
      const go = (fn) => () => { close(); fn(); };
      return h('div', { class: 'stack' },
        s.coverage ? h('div', { class: 'mini-grid' },
          h('div', null, h('b', null, String(s.counts.total)), h('span', null, 'consommations')),
          h('div', null, h('b', null, fmtGrams(s.tobacco.total)), h('span', null, 'tabac')),
          h('div', null, h('b', null, fmtGrams(s.cbd.total)), h('span', null, 'CBD')),
          h('div', null, h('b', null, fmtMoney(s.cost.total)), h('span', null, 'dépenses')),
          h('div', null, h('b', null, String(s.cravings.resisted)), h('span', null, 'envies résistées')),
          h('div', null, h('b', null, nightBefore?.quality ? `${nightBefore.quality}/5` : '—'), h('span', null, 'sommeil'))) : null,
        s.cost.incomplete ? badge(`${s.cost.incomplete} coût(s) incomplet(s)`, 'orange') : null,
        sectionTitle('Journal'),
        list.length || nightBefore ? h('div', { class: 'timeline card' }, nightBefore ? nightRow(nightBefore) : null, list.map((e) => {
          const row = entryRow(e);
          row.addEventListener('click', () => close(), { capture: true });
          return row;
        })) : h('p', { class: 'muted' }, 'Aucune entrée ce jour-là.'),
        nightAfter ? h('p', { class: 'muted small' }, `Nuit suivante : ${nightAfter.quality ? nightAfter.quality + '/5' : 'notée'}${computeNight(nightAfter).latencyMin != null ? ` · endormissement ${formatDuration(computeNight(nightAfter).latencyMin)}` : ''}`) : null,
        sectionTitle('Ajouter à cette date'),
        h('div', { class: 'chips' },
          state.categories.filter((c) => !c.archived).map((c) => h('button', { class: 'chip', onclick: go(() => openEntryForm({ categoryId: c.id, at })) }, icon(c.icon, 14), c.short || c.name)),
          h('button', { class: 'chip', onclick: go(() => openCravingForm({ at })) }, icon('wave', 14), 'Envie'),
          h('button', { class: 'chip', onclick: go(() => openNightForm({ date: day })) }, icon('moon', 14), 'Nuit de ce soir')));
    },
  });
}
