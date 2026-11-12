// ACCUEIL — épuré : la journée en un coup d'œil, quatre gestes, la semaine.

import { h } from '../ui/dom.js';
import { icon, logo } from '../ui/icons.js';
import { art, sprig } from '../ui/art.js';
import { card, badge } from '../ui/components.js';
import { barChart, COLORS } from '../ui/charts.js';
import { entryRow, nightRow, entriesOfDay } from '../ui/entries.js';
import { openCravingForm, quickLog, openQuickAdd } from '../ui/forms.js';
import { orderedCategories, runningCard } from '../ui/record.js';
import { openHabits } from './profile.js';
import { state, derived, isDemo, catById, saveSettings } from '../core/store.js';
import { addDays, formatDayLong, WEEKDAYS_LETTER, weekday, nowLocal, minutesSince, formatElapsed } from '../core/dates.js';
import { fmtGrams, fmtMoney, fmtNum } from '../core/format.js';
import { summarize, dailySeries, measures } from '../domain/stats.js';
import { observationStatus } from '../domain/goals.js';
import { CAT } from '../domain/models.js';
import { pendingReminders, dismissReminder } from '../app-reminders.js';
import { packsHomeCard } from './packs.js';
import { homeProjectCard } from './projects.js';
import { beforeHomeCard } from './before.js';

function greeting() {
  const hr = new Date().getHours();
  return hr < 5 ? 'Bonne nuit' : hr < 12 ? 'Bonjour' : hr < 18 ? 'Bon après-midi' : 'Bonsoir';
}

export function renderHome() {
  const { ctx, today } = derived();
  const root = h('div', { class: 'view view-home' });

  root.append(h('header', { class: 'home-head' },
    h('div', null, h('span', { class: 'brand-date' }, formatDayLong(today)), h('h1', { class: 'hello' }, greeting())),
    isDemo() ? badge('Démo', 'orange') : logo(34)));

  // Un seul rappel à la fois, discret.
  const r = pendingReminders()[0];
  if (r) {
    root.append(h('div', { class: 'reminder' },
      h('button', { class: 'reminder-main', onclick: () => { dismissReminder(r.id); r.action(); } }, icon(r.icon, 18), h('span', null, r.text)),
      h('button', { class: 'icon-btn', 'aria-label': 'Masquer', onclick: () => { dismissReminder(r.id); window.dispatchEvent(new Event('tts:render')); } }, icon('close', 16))));
  }

  const run = runningCard();
  if (run) root.append(run);
  if (!state.settings.v2IntroSeen && state.entries.length && state.settings.onboarded) root.append(v2Intro());
  root.append(todayCard(ctx, today));
  const sav = beforeHomeCard();
  if (sav) root.append(sav);
  root.append(actions());
  root.append(packsHomeCard());
  const proj = homeProjectCard();
  if (proj) root.append(proj);
  const week = weekCard(ctx, today);
  if (week) root.append(week);

  const list = entriesOfDay(today).slice().reverse();
  const night = state.nights.find((n) => n.date === addDays(today, -1));
  if (list.length || night) {
    root.append(card(
      h('div', { class: 'card-head' }, h('h3', { class: 'card-title' }, 'Aujourd’hui'), h('a', { class: 'link', href: '#/journal' }, 'Tout voir')),
      h('div', { class: 'timeline' }, list.slice(0, 6).map((e) => entryRow(e)), night ? nightRow(night) : null)));
  }
  return root;
}

function todayCard(ctx, today) {
  const s = summarize(state.entries, { start: today, end: today }, ctx);
  const week = summarize(state.entries, { start: addDays(today, -7), end: addDays(today, -1) }, ctx);
  const obs = observationStatus(state.settings, today);
  const avg = week.coverage ? week.counts.total / week.coverage.days : null;
  let compare = null;
  if (avg != null && avg > 0) {
    const diff = s.counts.total - avg;
    compare = diff <= -0.5 ? { tone: 'good', icon: 'arrowDown', text: `${fmtNum(Math.abs(diff), 0)} de moins que ta moyenne` }
      : diff >= 0.5 ? { tone: 'neutral', icon: 'clock', text: `Ta moyenne : ${fmtNum(avg, 1)} par jour` }
        : { tone: 'neutral', icon: 'check', text: 'Dans ta moyenne' };
  }
  const total = s.counts.total;
  const methods = heroMethods(s).slice(0, 3);
  return h('section', { class: 'hero', 'aria-label': 'Résumé du jour' },
    sprig(150, 'hero-sprig'),
    h('div', { class: 'hero-top' },
      h('span', { class: 'hero-label' }, 'Aujourd’hui'),
      obs && !obs.done ? h('span', { class: 'pill' }, `Observation · jour ${obs.elapsed}/${obs.days}`) : null),
    h('div', { class: 'hero-main' },
      h('span', { class: 'hero-num count-up', 'data-value': total }, String(total)),
      h('span', { class: 'hero-unit' }, total > 1 ? 'consommations' : 'consommation')),
    methods.length ? h('div', { class: 'hero-methods' }, methods.map(([id, n]) => h('span', { class: `hero-chip ${n ? '' : 'zero'}` },
      art(catById(id)?.icon || 'custom', 22), h('b', null, fmtNum(n, 0)), ' ', shortName(id, n)))) : null,
    h('p', { class: 'hero-qty' }, heroQuantities(s).filter((q) => !q.includes('€')).join(' · ') || 'Aucune quantité aujourd’hui'),
    h('div', { class: 'hero-metrics' },
      metric(s.cost.total > 0 ? fmtMoney(s.cost.total) : '0 €', 'dépensé'),
      metric(String(s.cravings.resisted), s.cravings.resisted > 1 ? 'envies résistées' : 'envie résistée'),
      metric(sinceLast(), 'depuis la dernière')),
    compare ? h('div', { class: 'hero-foot' }, h('span', { class: `hero-cmp ${compare.tone}` }, icon(compare.icon, 15), compare.text)) : null);
}

const metric = (value, label) => h('div', { class: 'hero-metric' }, h('b', null, value), h('span', null, label));

/** Temps écoulé depuis la dernière consommation terminée (donnée réelle, sinon —). */
function sinceLast() {
  const now = nowLocal();
  const last = state.entries.filter((e) => e.kind === 'consumption' && e.at <= now).reduce((m, e) => (!m || e.at > m ? e.at : m), null);
  if (!last) return '—';
  const min = minutesSince(last, now);
  return min < 1 ? 'à l’instant' : formatElapsed(min);
}

/** Gestes de l'accueil : méthode principale mise en avant, autres habitudes, envie, autre. */
function actions() {
  let cats = orderedCategories().slice(0, 3);
  if (!cats.length) cats = [catById(CAT.JOINT), catById(CAT.ROLLED)].filter(Boolean);
  const primaryId = state.settings.habits?.primary;
  const [first, ...others] = cats;
  const tile = (label, artName, fn, { cls = '', sub } = {}) => h('button', { class: `action ${cls}`, onclick: fn },
    art(artName, 44), h('span', { class: 'action-label' }, label), sub ? h('span', { class: 'action-sub' }, sub) : null);
  const primary = first ? h('button', { class: `action action-primary ${first.id === primaryId ? 'is-main' : ''}`, onclick: () => quickLog(first.id) },
    art(first.icon, 56),
    h('span', { class: 'action-text' }, h('span', { class: 'action-label' }, first.short || first.name), h('span', { class: 'action-sub' }, primarySub(first))),
    h('span', { class: 'action-go' }, icon('plus', 18, 'bold'))) : null;
  const rest = [...others.map((c) => tile(c.short || c.name, c.icon, () => quickLog(c.id))), tile('Envie', 'craving', () => openCravingForm())];
  // « Autre » complète la dernière rangée (grille de 3).
  const used = (primary ? 2 : 0) + rest.length;
  const span = 3 - (used % 3);
  const other = h('button', { class: `action ghost ${span === 3 ? 'action-full' : span === 2 ? 'action-wide' : ''}`, onclick: () => openQuickAdd() },
    h('span', { class: 'action-icon' }, icon('plus', 20)), h('span', { class: 'action-label' }, 'Autre'));
  return h('section', { class: 'stack-sm' },
    h('div', { class: 'section-title' }, h('h2', null, 'Enregistrer')),
    h('div', { class: 'actions' }, primary, ...rest, other));
}

function primarySub(cat) {
  return cat.id === state.settings.habits?.primary ? 'Méthode principale' : 'En un geste';
}

/** Méthodes du jour à afficher : habitudes activées, puis celles réellement utilisées. */
function heroMethods(s) {
  const enabled = orderedCategories().map((c) => c.id);
  const used = Object.entries(s.counts.byCategory).sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const ids = [...new Set([...enabled.slice(0, 2), ...used])];
  return ids.map((id) => [id, s.counts.byCategory[id] || 0]).sort((a, b) => b[1] - a[1] || enabled.indexOf(a[0]) - enabled.indexOf(b[0]));
}
function shortName(id, n) {
  const c = catById(id);
  const base = (c?.short || c?.name || id).toLowerCase();
  return n > 1 && !base.endsWith('s') && !base.includes(' ') ? `${base}s` : base;
}
/** Quantités du jour, seulement pour ce qui est réellement concerné. */
function heroQuantities(s) {
  const out = [];
  if (s.tobacco.total) out.push(`${fmtGrams(s.tobacco.total)} tabac`);
  if (s.cbd.total) out.push(`${fmtGrams(s.cbd.total)} CBD`);
  if (s.thc.total) out.push(`${fmtGrams(s.thc.total)} THC`);
  if (s.units.cigarettes) out.push(`${fmtNum(s.units.cigarettes, 1)} cig.`);
  if (s.liquid.total) out.push(`${fmtNum(s.liquid.total, 1)} ml`);
  if (s.puffs) out.push(`${fmtNum(s.puffs, 0)} bouffées`);
  if (s.cost.total > 0) out.push(fmtMoney(s.cost.total));
  return out;
}

function v2Intro() {
  return h('section', { class: 'v2-intro' }, h('span', { class: 'setup-ic' }, icon('sparkle', 18)),
    h('div', { class: 'grow' }, h('b', null, 'Nouveau : toutes tes habitudes'),
      h('span', { class: 'muted small' }, 'Cigarettes, vape, puff, chicha, sessions chronométrées… Tes données sont conservées. Vérifie tes méthodes en un instant.'),
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn btn-primary btn-sm', onclick: async () => { await saveSettings({ v2IntroSeen: true }); openHabits(); } }, 'Mes habitudes'),
        h('button', { class: 'btn btn-ghost btn-sm', onclick: () => saveSettings({ v2IntroSeen: true }) }, 'Plus tard'))));
}

function weekCard(ctx, today) {
  const range = { start: addDays(today, -6), end: today };
  const series = dailySeries(state.entries, range, ctx, measures.count);
  if (series.filter((p) => p.value != null).length < 2) return null;
  const s = summarize(state.entries, range, ctx);
  const prev = summarize(state.entries, { start: addDays(today, -13), end: addDays(today, -7) }, ctx);
  let line = `${s.counts.total} consommations sur ${s.coverage.days} jours`;
  if (prev.coverage?.days === 7 && s.coverage.days === 7 && prev.counts.total) {
    const pct = Math.round(((s.counts.total - prev.counts.total) / prev.counts.total) * 100);
    line = pct < 0 ? `${Math.abs(pct)} % de moins que la semaine d’avant` : pct > 0 ? `${pct} % de plus que la semaine d’avant` : 'Comme la semaine d’avant';
  }
  return card(
    h('div', { class: 'card-head' }, h('h3', { class: 'card-title' }, '7 derniers jours'), h('a', { class: 'link', href: '#/progress' }, 'Progrès')),
    h('p', { class: 'card-lead' }, line),
    barChart(series.map((p) => ({ label: WEEKDAYS_LETTER[weekday(p.day)], tip: formatDayLong(p.day), value: p.value })), { color: COLORS.primary, format: (v) => fmtNum(v, 0), height: 120, highlight: series.length - 1, xLabelEvery: 1, aria: 'Consommations par jour' }));
}
