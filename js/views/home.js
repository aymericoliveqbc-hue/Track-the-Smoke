// ACCUEIL — épuré : la journée en un coup d'œil, quatre gestes, la semaine.

import { h } from '../ui/dom.js';
import { icon, logo } from '../ui/icons.js';
import { card, badge } from '../ui/components.js';
import { barChart, COLORS } from '../ui/charts.js';
import { entryRow, nightRow, entriesOfDay } from '../ui/entries.js';
import { openCravingForm, quickLog, openQuickAdd } from '../ui/forms.js';
import { state, derived, isDemo } from '../core/store.js';
import { addDays, formatDayLong, WEEKDAYS_LETTER, weekday } from '../core/dates.js';
import { fmtGrams, fmtMoney, fmtNum } from '../core/format.js';
import { summarize, dailySeries, measures } from '../domain/stats.js';
import { observationStatus } from '../domain/goals.js';
import { CAT } from '../domain/models.js';
import { pendingReminders, dismissReminder } from '../app-reminders.js';
import { packsHomeCard } from './packs.js';

function greeting() {
  const hr = new Date().getHours();
  return hr < 5 ? 'Bonne nuit' : hr < 12 ? 'Bonjour' : hr < 18 ? 'Bon après-midi' : 'Bonsoir';
}

export function renderHome() {
  const { ctx, today } = derived();
  const root = h('div', { class: 'view view-home' });

  root.append(h('header', { class: 'home-head' },
    h('div', null, h('h1', { class: 'hello' }, greeting()), h('span', { class: 'brand-date' }, formatDayLong(today))),
    isDemo() ? badge('Démo', 'orange') : logo(30)));

  // Un seul rappel à la fois, discret.
  const r = pendingReminders()[0];
  if (r) {
    root.append(h('div', { class: 'reminder' },
      h('button', { class: 'reminder-main', onclick: () => { dismissReminder(r.id); r.action(); } }, icon(r.icon, 18), h('span', null, r.text)),
      h('button', { class: 'icon-btn', 'aria-label': 'Masquer', onclick: () => { dismissReminder(r.id); window.dispatchEvent(new Event('tts:render')); } }, icon('close', 16))));
  }

  root.append(todayCard(ctx, today));
  root.append(actions());
  root.append(packsHomeCard());
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
    compare = diff <= -0.5 ? { tone: 'good', text: `${fmtNum(Math.abs(diff), 0)} de moins que ta moyenne` }
      : diff >= 0.5 ? { tone: 'neutral', text: `Ta moyenne : ${fmtNum(avg, 1)} par jour` }
        : { tone: 'neutral', text: 'Dans ta moyenne' };
  }
  const total = s.counts.total;
  return h('section', { class: 'hero' },
    h('div', { class: 'hero-top' },
      h('span', { class: 'hero-label' }, 'Aujourd’hui'),
      obs && !obs.done ? h('span', { class: 'pill' }, `Observation · jour ${obs.elapsed}/${obs.days}`) : null),
    h('div', { class: 'hero-main' },
      h('span', { class: 'hero-num' }, String(total)),
      h('span', { class: 'hero-unit' }, total > 1 ? 'consommations' : 'consommation')),
    h('div', { class: 'hero-split' },
      stat(s.counts.joint, s.counts.joint > 1 ? 'joints' : 'joint'),
      stat(s.counts.rolled, s.counts.rolled > 1 ? 'roulées' : 'roulée'),
      stat(s.cravings.resisted, s.cravings.resisted > 1 ? 'envies résistées' : 'envie résistée')),
    h('div', { class: 'hero-foot' },
      h('span', null, [`${fmtGrams(s.tobacco.total)} tabac`, `${fmtGrams(s.cbd.total)} CBD`, s.cost.total > 0 ? fmtMoney(s.cost.total) : null].filter(Boolean).join(' · ')),
      compare ? h('span', { class: `hero-cmp ${compare.tone}` }, compare.text) : null));
}

const stat = (n, label) => h('div', { class: 'hero-stat' }, h('b', null, String(n)), h('span', null, label));

function actions() {
  const btn = (label, ic, fn) => h('button', { class: 'action', onclick: fn }, h('span', { class: 'action-icon' }, icon(ic, 24)), h('span', null, label));
  return h('div', { class: 'actions' },
    btn('Joint', 'joint', () => quickLog(CAT.JOINT)),
    btn('Roulée', 'rolled', () => quickLog(CAT.ROLLED)),
    btn('Envie', 'wave', () => openCravingForm()),
    btn('Autre', 'plus', () => openQuickAdd()));
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
