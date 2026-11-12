// PROGRÈS — statistiques lisibles + objectifs, en phrases simples.

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { card, segmented, emptyState } from '../ui/components.js';
import { barChart, stackedBars, lineChart, splitBar, ring, COLORS } from '../ui/charts.js';
import { openNightForm, openCravingForm } from '../ui/forms.js';
import { state, derived } from '../core/store.js';
import { addDays, formatDayShort, formatDuration, DAY_PARTS, startOfWeek } from '../core/dates.js';
import { fmtGrams, fmtMoney, fmtNum, isNum } from '../core/format.js';
import { summarize, dailySeries, measures, costMeasure, entriesIn, isConsumption, byDayPart, groupSeries, byMolecule } from '../domain/stats.js';
import { moleculeLabel } from '../domain/models.js';
import { cravingStats, cravingSeries } from '../domain/cravings.js';
import { sleepStats, computeNight, sleepPairs, pearson, describeCorrelation, sleepConcern } from '../domain/sleep.js';
import { dailyCostProfile, scenarios } from '../domain/simulator.js';
import { generateInsights } from '../domain/insights.js';
import { renderGoals } from './goals.js';

const TABS = [
  { id: 'conso', label: 'Conso' },
  { id: 'money', label: 'Argent' },
  { id: 'cravings', label: 'Envies' },
  { id: 'sleep', label: 'Sommeil' },
  { id: 'goals', label: 'Objectifs' },
];
const ui = { days: 30, sim: 'r25' };
const rerender = () => window.dispatchEvent(new Event('tts:render'));

export function renderProgress(tab = 'conso') {
  const root = h('div', { class: 'view' });
  root.append(h('header', { class: 'view-head' }, h('h1', null, 'Progrès')));
  root.append(segmented(TABS, tab, (v) => { location.hash = `#/progress/${v}`; }));
  if (tab === 'goals') { root.append(renderGoals({ embedded: true })); return root; }

  const { ctx } = derived();
  if (!ctx.trackingStart) {
    root.append(card(emptyState({ icon: 'stats', title: 'Rien à montrer pour l’instant', text: 'Tes progrès apparaîtront dès tes premières saisies.' })));
    return root;
  }
  root.append(h('div', { class: 'period-pills' }, [7, 30, 90].map((d) => h('button', { class: `pill-btn ${ui.days === d ? 'on' : ''}`, onclick: () => { ui.days = d; rerender(); } }, `${d} jours`))));
  const fn = { conso, money, cravings, sleep }[tab] || conso;
  root.append(fn());
  if (tab !== 'sleep') root.append(h('a', { class: 'more-link', href: '#/stats/overview' }, 'Analyses détaillées', icon('chevron', 14)));
  return root;
}

function range() {
  const { today } = derived();
  return { start: addDays(today, -(ui.days - 1)), end: today };
}

/** Série compacte : jours si ≤ 31, sinon semaines. */
function compact(series, mode = 'sum') {
  if (series.length <= 31) return series.map((p) => ({ label: String(Number(p.day.slice(8))), tip: formatDayShort(p.day), value: p.value }));
  return groupSeries(series, 'week').map((w) => ({ label: `${Number(w.key.slice(8))}/${Number(w.key.slice(5, 7))}`, tip: `Semaine du ${formatDayShort(w.key)}`, value: mode === 'avg' ? w.value / w.days : w.value }));
}

const big = (value, label, sub) => h('div', { class: 'big' }, h('b', null, value), h('span', null, label), sub ? h('em', null, sub) : null);
const head = (title, right) => h('div', { class: 'card-head' }, h('h3', { class: 'card-title' }, title), right || null);

/* ------------------------------ Conso ------------------------------ */

function conso() {
  const { ctx } = derived();
  const r = range();
  const s = summarize(state.entries, r, ctx);
  if (!s.coverage) return card(emptyState({ title: 'Pas de suivi sur cette période' }));
  const d = s.coverage.days;
  const len = ui.days;
  const prev = summarize(state.entries, { start: addDays(r.start, -len), end: addDays(r.start, -1) }, ctx);
  let trend = null;
  if (prev.coverage && prev.counts.total) {
    const a = s.counts.total / d; const b = prev.counts.total / prev.coverage.days;
    const pct = Math.round(((a - b) / b) * 100);
    trend = pct <= -5 ? { good: true, text: `${Math.abs(pct)} % de moins qu’avant` } : pct >= 5 ? { good: false, text: `${pct} % de plus qu’avant` } : { good: true, text: 'Stable' };
  }
  const series = dailySeries(state.entries, r, ctx, (list) => list);
  const gram = series.length <= 31
    ? series.map((p) => ({ label: String(Number(p.day.slice(8))), tip: formatDayShort(p.day), parts: p.value ? [measures.tobaccoGrams(p.value), measures.cbdGrams(p.value)] : null }))
    : (() => { const m = new Map(); for (const p of series) { if (!p.value) continue; const k = startOfWeek(p.day); const v = m.get(k) || [0, 0]; v[0] += measures.tobaccoGrams(p.value); v[1] += measures.cbdGrams(p.value); m.set(k, v); } return [...m.entries()].map(([k, v]) => ({ label: `${Number(k.slice(8))}/${Number(k.slice(5, 7))}`, tip: `Semaine du ${formatDayShort(k)}`, parts: v })); })();
  const cons = entriesIn(state.entries, s.coverage).filter(isConsumption);
  const parts = byDayPart(cons);
  const ins = generateInsights(state, ctx).slice(0, 3);
  const mols = byMolecule(state.entries, r, ctx, moleculeLabel);
  return h('div', { class: 'stack' },
    card(
      h('div', { class: 'big-row' },
        big(fmtNum(s.counts.total / d, 1), 'par jour', trend ? h('span', { class: trend.good ? 'up-good' : '' }, trend.text) : null),
        big(fmtNum(s.counts.joint / d, 1), 'joints / jour'),
        big(fmtNum(s.counts.rolled / d, 1), 'roulées / jour')),
      h('div', { class: 'big-row' },
        big(fmtGrams(s.tobacco.total / d), 'tabac / jour'),
        big(fmtGrams(s.cbd.total / d), 'CBD / jour'))),
    card(head('Grammes par jour'), stackedBars(gram, [{ label: 'Tabac', color: COLORS.blue }, { label: 'CBD', color: COLORS.green }], { format: (v) => fmtNum(v, 1), height: 150, aria: 'Grammes de tabac et de CBD' })),
    mols.length > 1 || (mols.length === 1 && mols[0][0] !== 'CBD') ? card(head('Par molécule'), splitBar(mols.slice(0, 4).map(([k, v], i) => ({ label: k, value: v, color: [COLORS.green, COLORS.violet, COLORS.orange, COLORS.blue][i] })), fmtGrams)) : null,
    cons.length ? card(head('Tes moments'), splitBar(DAY_PARTS.map((p, i) => ({ label: p.label, value: parts[p.id], color: [COLORS.green, COLORS.blue, COLORS.violet, COLORS.orange][i] })), (v) => fmtNum(v, 0))) : null,
    ins.length ? card(head('À retenir'), h('div', { class: 'insights' }, ins.map((i) => h('div', { class: `insight insight-${i.tone}` }, icon(i.tone === 'positive' ? 'sparkle' : 'info', 16), h('p', null, i.text))))) : null);
}

/* ------------------------------ Argent ------------------------------ */

function money() {
  const { ctx } = derived();
  const r = range();
  const s = summarize(state.entries, r, ctx);
  if (!s.coverage) return card(emptyState({ title: 'Pas de suivi sur cette période' }));
  const d = s.coverage.days;
  const perDay = s.cost.total / d;
  const series = dailySeries(state.entries, r, ctx, costMeasure(ctx.cost));
  const profile = dailyCostProfile(state.entries, r, ctx);
  const sc = scenarios(profile);
  const chosen = sc.find((x) => x.id === ui.sim) || sc[2];
  return h('div', { class: 'stack' },
    card(h('div', { class: 'big-row' },
      big(fmtMoney(s.cost.total, { digits: 0 }), `sur ${d} jours`),
      big(fmtMoney(perDay), 'par jour'),
      big(fmtMoney(perDay * 30, { digits: 0 }), 'par mois')),
    s.cost.incomplete ? h('p', { class: 'hint' }, 'Certains prix manquent : ajoute tes paquets avec leur prix pour un total exact.') : null),
    card(head('Dépenses'), barChart(compact(series), { color: COLORS.primary, format: (v) => fmtNum(v, v < 10 ? 1 : 0), height: 140, aria: 'Dépenses par jour' })),
    s.cost.total ? card(head('Où va l’argent'), splitBar([
      { label: 'Tabac', value: s.cost.tobacco, color: COLORS.blue }, { label: 'CBD', value: s.cost.cbd, color: COLORS.green }, { label: 'Feuilles & filtres', value: s.cost.accessories, color: COLORS.violet },
    ], fmtMoney)) : null,
    profile && profile.total ? card(head('Et si…'),
      segmented([{ id: 'r25', label: '−25 %' }, { id: 'r50', label: '−50 %' }, { id: 'noTobacco', label: 'Sans tabac' }, { id: 'none', label: 'Arrêt' }], chosen.id, (v) => { ui.sim = v; rerender(); }, { small: true }),
      h('div', { class: 'big-row' },
        big(fmtMoney(chosen.saving * 30, { digits: 0 }), 'économisés / mois'),
        big(fmtMoney(chosen.saving * 365, { digits: 0 }), 'économisés / an')),
      h('p', { class: 'hint' }, 'Estimation basée sur tes dépenses réelles de la période.')) : null);
}

/* ------------------------------ Envies ------------------------------ */

function cravings() {
  const { ctx } = derived();
  const r = range();
  const cs = cravingStats(state.entries, r, ctx);
  if (!cs.total) {
    return card(emptyState({ icon: 'wave', title: 'Aucune envie notée', text: 'Note tes envies, même quand tu ne fumes pas : c’est la meilleure façon de les apprivoiser.', action: h('button', { class: 'btn btn-primary', onclick: () => openCravingForm() }, 'Noter une envie') }));
  }
  const series = cravingSeries(state.entries, r, ctx);
  const data = series.length <= 31
    ? series.map((p) => ({ label: String(Number(p.day.slice(8))), tip: formatDayShort(p.day), parts: p.value ? [p.value.resisted, p.value.consumed] : null }))
    : (() => { const m = new Map(); for (const p of series) { if (!p.value) continue; const k = startOfWeek(p.day); const v = m.get(k) || [0, 0]; v[0] += p.value.resisted; v[1] += p.value.consumed; m.set(k, v); } return [...m.entries()].map(([k, v]) => ({ label: `${Number(k.slice(8))}/${Number(k.slice(5, 7))}`, tip: `Semaine du ${formatDayShort(k)}`, parts: v })); })();
  const maxT = Math.max(...cs.topTriggers.map((t) => t.count));
  return h('div', { class: 'stack' },
    card(h('div', { class: 'ring-row' },
      ring(cs.resistedShare, 84, COLORS.green, `${Math.round((cs.resistedShare || 0) * 100)} %`),
      h('div', null, h('b', { class: 'ring-title' }, `${cs.resisted} envie${cs.resisted > 1 ? 's' : ''} résistée${cs.resisted > 1 ? 's' : ''}`),
        h('p', { class: 'muted' }, `sur ${cs.total} notée${cs.total > 1 ? 's' : ''}${cs.avgIntensity.value != null ? ` · intensité moyenne ${fmtNum(cs.avgIntensity.value, 1)}/10` : ''}`),
        cs.hardest.length ? h('p', { class: 'muted small' }, `Moments sensibles : ${cs.hardest.map((x) => `${x.h} h`).join(', ')}`) : null))),
    card(head('Au fil des jours'), stackedBars(data, [{ label: 'Résistées', color: COLORS.green }, { label: 'Suivies d’une conso.', color: COLORS.orange }], { format: (v) => fmtNum(v, 0), height: 140, aria: 'Envies par jour' })),
    cs.topTriggers.length ? card(head('Ce qui les déclenche'), h('div', { class: 'hbars' }, cs.topTriggers.slice(0, 5).map((t) => h('div', { class: 'hbar' },
      h('span', { class: 'hbar-label' }, t.label), h('span', { class: 'hbar-track' }, h('i', { style: { width: `${(t.count / maxT) * 100}%` } })), h('b', null, String(t.count)))))) : null);
}

/* ------------------------------ Sommeil ------------------------------ */

function sleep() {
  const { today } = derived();
  const r = range();
  const nights = state.nights.filter((n) => n.date >= r.start && n.date <= r.end).sort((a, b) => (a.date < b.date ? -1 : 1));
  const actionsRow = h('div', { class: 'row-actions' },
    h('button', { class: 'btn btn-primary', onclick: () => openNightForm() }, icon('moon', 16), 'Noter ma nuit'),
    h('a', { class: 'btn btn-ghost', href: '#/profile/applehealth' }, icon('heart', 16), 'Apple Santé'));
  if (!nights.length) return h('div', { class: 'stack' }, card(emptyState({ icon: 'moon', title: 'Aucune nuit sur cette période', text: 'Note tes nuits ou importe-les depuis Apple Santé.' })), actionsRow);
  const st = sleepStats(state.nights, r);
  const pts = (fn) => nights.map((n) => ({ label: `${Number(n.date.slice(8))}/${Number(n.date.slice(5, 7))}`, tip: `Nuit du ${formatDayShort(n.date)}`, value: fn(n) }));
  const pairs = sleepPairs(state.nights, state.entries, r, 'eveningCbd', 'latency');
  const corr = pearson(pairs.map((p) => p.x), pairs.map((p) => p.y));
  const concern = sleepConcern(state.nights, today);
  return h('div', { class: 'stack' },
    concern ? h('div', { class: 'note note-warn' }, icon('info', 16), h('span', null, concern)) : null,
    card(h('div', { class: 'big-row' },
      big(st.total.value != null ? formatDuration(st.total.value) : '—', 'de sommeil'),
      big(st.latency.value != null ? formatDuration(st.latency.value) : '—', 'pour s’endormir'),
      big(st.quality.value != null ? `${fmtNum(st.quality.value, 1)}/5` : '—', 'qualité'))),
    card(head('Temps pour s’endormir'), lineChart([{ label: 'Endormissement', color: COLORS.blue, points: pts((n) => computeNight(n).latencyMin) }], { format: (v) => `${Math.round(v)}′`, height: 130, aria: 'Temps d’endormissement' })),
    card(head('Durée de sommeil'), lineChart([{ label: 'Durée', color: COLORS.green, points: pts((n) => { const c = computeNight(n).totalSleepMin; return isNum(c) ? c / 60 : null; }) }], { min: 0, format: (v) => `${fmtNum(v, 1)} h`, height: 130, area: true, aria: 'Durée de sommeil' })),
    card(head('CBD du soir et endormissement'), h('p', { class: 'muted' }, describeCorrelation(corr, 'le CBD du soir', 'le temps d’endormissement'))),
    actionsRow);
}

