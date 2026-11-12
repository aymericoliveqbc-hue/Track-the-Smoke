// ACCUEIL — tableau de bord.

import { h } from '../ui/dom.js';
import { icon, logo } from '../ui/icons.js';
import { card, cardHead, segmented, statTile, emptyState, note, delta, badge } from '../ui/components.js';
import { sparkline, COLORS } from '../ui/charts.js';
import { entryRow, nightRow, entriesOfDay } from '../ui/entries.js';
import { openEntryForm, openCravingForm, openNightForm, openQuickAdd } from '../ui/forms.js';
import { state, derived, isDemo } from '../core/store.js';
import { PERIODS, periodRange, previousRange, formatDayLong, addDays, formatElapsed } from '../core/dates.js';
import { fmtGrams, fmtMoney, fmtNum } from '../core/format.js';
import { summarize, variation, dailySeries, costMeasure } from '../domain/stats.js';
import { generateInsights } from '../domain/insights.js';
import { observationStatus, journeyStats } from '../domain/goals.js';
import { CAT } from '../domain/models.js';
import { pendingReminders, dismissReminder } from '../app-reminders.js';

let period = 'today';

export function renderHome() {
  const { ctx, today } = derived();
  const hasData = state.entries.length > 0 || state.nights.length > 0;
  const root = h('div', { class: 'view view-home' });

  root.append(h('header', { class: 'home-head' },
    h('div', { class: 'brand' }, logo(30), h('div', null, h('span', { class: 'brand-name' }, 'TRACK THE SMOKE'), h('span', { class: 'brand-date' }, formatDayLong(today)))),
    isDemo() ? badge('Démo', 'orange') : null));

  const obs = observationStatus(state.settings, today);
  if (obs && !obs.done) {
    root.append(h('div', { class: 'banner' }, icon('sparkle', 18), h('div', null,
      h('b', null, `Phase d'observation · jour ${obs.elapsed} sur ${obs.days}`),
      h('span', null, 'Aucun objectif pour l’instant : enregistre simplement ce qui se passe.'))));
  }
  for (const r of pendingReminders()) {
    root.append(h('div', { class: 'banner banner-soft' },
      h('button', { class: 'banner-main', onclick: () => { dismissReminder(r.id); r.action(); } }, icon(r.icon, 18), h('div', null, h('b', null, r.title), h('span', null, r.text))),
      h('button', { class: 'icon-btn', 'aria-label': 'Masquer ce rappel', onclick: () => { dismissReminder(r.id); window.dispatchEvent(new Event('tts:render')); } }, icon('close', 16))));
  }

  if (!hasData) {
    root.append(card(emptyState({
      icon: 'sparkle', title: 'Bienvenue',
      text: 'Ton tableau de bord se remplira au fil de tes saisies. Aucune statistique n’est affichée tant qu’il n’y a pas de données réelles.',
      action: h('button', { class: 'btn btn-primary', onclick: openQuickAdd }, icon('plus', 16), 'Première saisie'),
    })));
    root.append(shortcuts());
    return root;
  }

  // Dépenses aujourd'hui / semaine / mois
  const spend = (id) => summarize(state.entries, periodRange(id, today), ctx).cost;
  const sToday = spend('today'); const sWeek = spend('7d'); const sMonth = spend('month');
  const incomplete = sToday.incomplete + sWeek.incomplete + sMonth.incomplete > 0;
  root.append(card(
    cardHead('Dépenses', incomplete ? badge('incomplet', 'orange') : null),
    h('div', { class: 'spend-row' },
      spendCol("Aujourd'hui", sToday.total),
      spendCol('7 jours', sWeek.total),
      spendCol('Ce mois', sMonth.total)),
    h('div', { class: 'spark-row' }, sparkline(dailySeries(state.entries, { start: addDays(today, -13), end: today }, ctx, costMeasure(ctx.cost)).map((p) => p.value), COLORS.violet), h('span', { class: 'muted small' }, '14 derniers jours')),
    incomplete ? h('p', { class: 'hint warn' }, 'Certains coûts sont incomplets (prix ou quantité manquants). Complète tes tarifs dans Profil › Produits.') : null));

  // Indicateurs de la période
  const range = periodRange(period, today);
  const prev = previousRange(range);
  const s = summarize(state.entries, range, ctx);
  const p = summarize(state.entries, prev, ctx);
  const cmp = (a, b) => (p.coverage ? variation(a, b).pct : null);
  root.append(h('div', { class: 'period-bar' }, segmented(PERIODS.map((x) => ({ id: x.id, label: x.short })), period, (v) => { period = v; window.dispatchEvent(new Event('tts:render')); }, { small: true })));
  if (!s.coverage) {
    root.append(card(emptyState({ icon: 'calendar', title: 'Pas de suivi sur cette période', text: 'Le suivi a commencé après cette période.' })));
  } else {
    const missingT = s.tobacco.missing; const missingC = s.cbd.missing;
    root.append(h('div', { class: 'tiles' },
      statTile({ label: 'Joints CBD', value: fmtNum(s.counts.joint, 0), extra: delta(cmp(s.counts.joint, p.counts.joint)) }),
      statTile({ label: 'Roulées', value: fmtNum(s.counts.rolled, 0), extra: delta(cmp(s.counts.rolled, p.counts.rolled)) }),
      statTile({ label: 'Tabac', value: fmtGrams(s.tobacco.total), sub: missingT ? `${missingT} sans quantité` : quantitySub(s.tobacco), extra: delta(cmp(s.tobacco.total, p.tobacco.total)) }),
      statTile({ label: 'CBD', value: fmtGrams(s.cbd.total), sub: missingC ? `${missingC} sans quantité` : quantitySub(s.cbd), extra: delta(cmp(s.cbd.total, p.cbd.total)) }),
      statTile({ label: 'Envies résistées', value: fmtNum(s.cravings.resisted, 0), sub: s.cravings.total ? `sur ${s.cravings.total} envies` : null, extra: delta(cmp(s.cravings.resisted, p.cravings.resisted), { lowerIsBetter: false }) }),
      statTile({ label: 'Dépenses', value: fmtMoney(s.cost.total), sub: s.coverage.days > 1 ? `${fmtMoney(s.cost.total / s.coverage.days)} / jour` : null, extra: delta(cmp(s.cost.total, p.cost.total)) }),
    ));
    if (s.coverage.days < range.days) root.append(h('p', { class: 'hint center' }, `Suivi sur ${s.coverage.days} jour${s.coverage.days > 1 ? 's' : ''} de cette période.`));
  }

  root.append(shortcuts());

  // Timeline du jour
  const todayList = entriesOfDay(today);
  const night = state.nights.find((n) => n.date === addDays(today, -1));
  root.append(card(
    cardHead("Aujourd'hui", h('a', { class: 'link', href: '#/journal' }, 'Journal')),
    night ? h('div', { class: 'timeline' }, nightRow(night)) : null,
    todayList.length ? h('div', { class: 'timeline' }, todayList.map((e) => entryRow(e)))
      : h('p', { class: 'muted pad' }, 'Rien d’enregistré aujourd’hui pour le moment.')));

  // Progression
  const [pa, pb, subtitle] = period === 'today'
    ? [summarize(state.entries, periodRange('7d', today), ctx), summarize(state.entries, previousRange(periodRange('7d', today)), ctx), '7 derniers jours vs 7 précédents']
    : [s, p, undefined];
  if (pa.coverage && pb.coverage) root.append(progressCard(pa, pb, subtitle));

  // Parcours
  const jt = journeyStats('tobacco', state.settings.journeys.tobacco, state.entries, ctx, state.settings.baseline);
  const jc = journeyStats('cbd', state.settings.journeys.cbd, state.entries, ctx, state.settings.baseline);
  root.append(h('div', { class: 'tiles tiles-2' },
    statTile({ label: 'Dernier tabac', value: jt.last ? `il y a ${formatElapsed(jt.sinceLastMin)}` : '—', sub: jt.quit ? `${jt.quit.daysWithout} j sans depuis l’arrêt` : null, onclick: () => { location.hash = '#/goals'; } }),
    statTile({ label: 'Dernier CBD', value: jc.last ? `il y a ${formatElapsed(jc.sinceLastMin)}` : '—', sub: jc.quit ? `${jc.quit.daysWithout} j sans depuis l’arrêt` : null, onclick: () => { location.hash = '#/goals'; } })));

  // Observations
  const ins = generateInsights(state, ctx);
  if (ins.length) {
    root.append(card(cardHead('Observations', h('a', { class: 'link', href: '#/stats/behaviour' }, 'Plus')),
      h('div', { class: 'insights' }, ins.slice(0, 3).map((i) => h('div', { class: `insight insight-${i.tone}` }, icon(i.tone === 'positive' ? 'sparkle' : 'info', 16), h('p', null, i.text))))));
  }
  return root;
}

function quantitySub(agg) {
  if (!agg.total) return null;
  if (agg.weighed && agg.estimated) return `${fmtGrams(agg.weighed)} pesés`;
  if (agg.weighed) return 'pesé';
  return 'estimé';
}

function spendCol(label, v) {
  return h('div', { class: 'spend-col' }, h('span', { class: 'muted small' }, label), h('b', { class: 'num-lg' }, fmtMoney(v)));
}

function shortcuts() {
  const item = (label, ic, tone, fn) => h('button', { class: `shortcut tone-${tone}`, onclick: fn }, h('span', { class: 'shortcut-icon' }, icon(ic, 20)), h('span', null, label));
  return h('div', { class: 'shortcuts' },
    item('Joint', 'joint', 'violet', () => openEntryForm({ categoryId: CAT.JOINT })),
    item('Roulée', 'rolled', 'blue', () => openEntryForm({ categoryId: CAT.ROLLED })),
    item('CBD', 'leafless', 'green', () => openEntryForm({ categoryId: CAT.CBD })),
    item('Envie', 'wave', 'green', () => openCravingForm()),
    item('Nuit', 'moon', 'blue', () => openNightForm()));
}

function progressCard(s, p, subtitle = 'Par rapport à la période précédente') {
  const rows = [
    ['Tabac', s.tobacco.total, p.tobacco.total, fmtGrams, true],
    ['CBD', s.cbd.total, p.cbd.total, fmtGrams, true],
    ['Dépenses', s.cost.total, p.cost.total, fmtMoney, true],
    ['Consommations', s.counts.total, p.counts.total, (v) => fmtNum(v, 0), true],
    ['Envies résistées', s.cravings.resisted, p.cravings.resisted, (v) => fmtNum(v, 0), false],
  ];
  const sameLen = s.coverage.days === p.coverage.days;
  return card(
    cardHead('Progression'),
    h('p', { class: 'muted small' }, subtitle, sameLen ? '' : ` (${s.coverage.days} j vs ${p.coverage.days} j suivis)`),
    h('div', { class: 'compare' }, rows.map(([label, a, b, fmt, lower]) => {
      const max = Math.max(a, b) || 1;
      return h('div', { class: 'compare-row' },
        h('div', { class: 'compare-head' }, h('span', null, label), delta(variation(a, b).pct, { lowerIsBetter: lower })),
        h('div', { class: 'compare-bars' },
          h('div', { class: 'cbar' }, h('i', { style: { width: `${(b / max) * 100}%` }, class: 'prev' }), h('span', null, fmt(b))),
          h('div', { class: 'cbar' }, h('i', { style: { width: `${(a / max) * 100}%` } }), h('span', null, fmt(a)))));
    })),
    h('div', { class: 'legend' }, h('span', { class: 'legend-item' }, h('i', { class: 'prev-swatch' }), 'Précédente'), h('span', { class: 'legend-item' }, h('i', { style: { background: COLORS.primary } }), 'Actuelle')),
    h('p', { class: 'hint' }, 'Une hausse n’efface rien : chaque période est une information, pas un jugement.'));
}

