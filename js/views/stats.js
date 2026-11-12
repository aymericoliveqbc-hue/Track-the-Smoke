// STATISTIQUES — analyses tabac, CBD, joints, temporelles, envies, sommeil,
// finances, simulateur et observations comportementales.

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { card, cardHead, segmented, statTile, emptyState, note, delta, select, badge } from '../ui/components.js';
import { barChart, stackedBars, lineChart, heatmap, scatter, splitBar, COLORS, legend } from '../ui/charts.js';
import { openNightForm, openPurchaseForm } from '../ui/forms.js';
import { state, derived, catById, productById } from '../core/store.js';
import {
  addDays, diffDays, formatDayShort, WEEKDAYS_SHORT, DAY_PARTS, formatDuration, startOfMonth, addMonths, endOfMonth, MONTHS_SHORT, startOfWeek, weekday,
} from '../core/dates.js';
import { fmtGrams, fmtMoney, fmtNum, fmtPct, isNum } from '../core/format.js';
import {
  summarize, variation, dailySeries, measures, costMeasure, coverage, entriesIn, isConsumption, isCraving,
  byHour, byWeekday, byDayPart, heatmap as heatGrid, jointAnalysis, avgCostByCategory, histogram, groupSeries, mean,
} from '../domain/stats.js';
import { cravingStats, cravingSeries } from '../domain/cravings.js';
import { sleepStats, computeNight, sleepPairs, pearson, describeCorrelation, sleepConcern, MIN_CORRELATION_N } from '../domain/sleep.js';
import { dailyCostProfile, scenarios, projectSavings, HORIZONS } from '../domain/simulator.js';
import { realizedSavings } from '../domain/goals.js';
import { generateInsights } from '../domain/insights.js';
import { purchaseTotal, purchaseQuantity } from '../domain/costs.js';
import { CAT, CONTEXTS, MOODS, labelOf } from '../domain/models.js';

export const TABS = [
  { id: 'overview', label: 'Synthèse' },
  { id: 'tobacco', label: 'Tabac' },
  { id: 'cbd', label: 'CBD' },
  { id: 'joints', label: 'Joints' },
  { id: 'time', label: 'Temps' },
  { id: 'cravings', label: 'Envies' },
  { id: 'sleep', label: 'Sommeil' },
  { id: 'finance', label: 'Finances' },
  { id: 'simulator', label: 'Simulateur' },
  { id: 'behaviour', label: 'Habitudes' },
];

const RANGES = [
  { id: '7', label: '7 j' }, { id: '30', label: '30 j' }, { id: '90', label: '90 j' }, { id: '365', label: '1 an' }, { id: 'all', label: 'Tout' },
];

const ui = { range: '30', method: 'all', sleepX: 'eveningCbd', sleepY: 'latency', simWindow: '30', simScenario: 'r25' };
const rerender = () => window.dispatchEvent(new Event('tts:render'));

function currentRange() {
  const { ctx, today } = derived();
  if (ui.range === 'all') return { start: ctx.trackingStart || today, end: today };
  return { start: addDays(today, -(Number(ui.range) - 1)), end: today };
}

const g2 = (v) => fmtNum(v, v < 1 ? 2 : 1);
const dayLabel = (d, n) => (n > 31 ? `${Number(d.slice(8))}/${Number(d.slice(5, 7))}` : String(Number(d.slice(8))));

/** Agrège les séries longues par semaine pour rester lisible. */
function chartSeries(series, mode = 'sum') {
  if (series.length <= 45) return series.map((p) => ({ label: dayLabel(p.day, series.length), tip: formatDayShort(p.day), value: p.value }));
  const weeks = groupSeries(series, 'week');
  return weeks.map((w) => ({ label: `${Number(w.key.slice(8))}/${Number(w.key.slice(5, 7))}`, tip: `Semaine du ${formatDayShort(w.key)}`, value: mode === 'avg' ? w.value / w.days : w.value }));
}

export function renderStats(tab = 'overview') {
  const root = h('div', { class: 'view' });
  root.append(h('header', { class: 'view-head' }, h('h1', null, 'Statistiques')));
  const tabs = h('nav', { class: 'tabs-scroll' }, TABS.map((t) => h('a', { href: `#/stats/${t.id}`, class: t.id === tab ? 'on' : '' }, t.label)));
  root.append(tabs);
  requestAnimationFrame(() => tabs.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' }));

  const { ctx } = derived();
  if (!ctx.trackingStart) {
    root.append(card(emptyState({ icon: 'stats', title: 'Pas encore de statistiques', text: 'Les analyses apparaissent dès tes premières saisies. Aucune donnée fictive n’est affichée.' })));
    return root;
  }
  if (tab !== 'simulator') {
    root.append(h('div', { class: 'filters-row' },
      segmented(RANGES, ui.range, (v) => { ui.range = v; rerender(); }, { small: true }),
      ['overview', 'tobacco', 'cbd', 'joints'].includes(tab)
        ? segmented([{ id: 'all', label: 'Toutes' }, { id: 'weighed', label: 'Pesées' }, { id: 'estimated', label: 'Estimées' }], ui.method, (v) => { ui.method = v; rerender(); }, { small: true })
        : null));
  }
  const fn = { overview, tobacco, cbd, joints, time, cravings, sleep, finance, simulator, behaviour }[tab] || overview;
  root.append(fn());
  return root;
}

function coverageNote(s) {
  if (!s.coverage) return null;
  const msgs = [`Basé sur ${s.coverage.days} jour${s.coverage.days > 1 ? 's' : ''} de suivi.`];
  const miss = s.tobacco.missing + s.cbd.missing;
  if (miss) msgs.push(`${miss} saisie(s) sans quantité ne sont pas comptées dans les grammes.`);
  if (s.cost.incomplete) msgs.push(`${s.cost.incomplete} coût(s) incomplet(s).`);
  if (ui.method !== 'all') msgs.push(`Filtre : quantités ${ui.method === 'weighed' ? 'pesées' : 'estimées'} uniquement.`);
  return h('p', { class: 'hint' }, msgs.join(' '));
}

function methodSplit(agg) {
  if (!agg.total) return null;
  return splitBar([
    { label: 'Pesé', value: agg.weighed, color: COLORS.violet },
    { label: 'Estimé', value: agg.estimated, color: COLORS.blue },
    ...(agg.unknownMethod ? [{ label: 'Méthode non précisée', value: agg.unknownMethod, color: COLORS.muted }] : []),
  ], fmtGrams);
}

/* ------------------------------ Synthèse ------------------------------ */

function overview() {
  const { ctx } = derived();
  const range = currentRange();
  const s = summarize(state.entries, range, ctx, { method: ui.method });
  if (!s.coverage) return card(emptyState({ title: 'Pas de suivi sur cette période' }));
  const d = s.coverage.days;
  const len = diffDays(range.start, range.end) + 1;
  const prevR = { start: addDays(range.start, -len), end: addDays(range.start, -1) };
  const p = summarize(state.entries, prevR, ctx, { method: ui.method });
  const pc = (a, b) => (p.coverage ? variation(a, b).pct : null);
  const series = dailySeries(state.entries, range, ctx, (list) => list);
  const gramsData = (() => {
    const raw = series.map((x) => ({ day: x.day, t: x.value ? measures.tobaccoGrams(x.value) : null, c: x.value ? measures.cbdGrams(x.value) : null }));
    if (raw.length <= 45) return raw.map((r) => ({ label: dayLabel(r.day, raw.length), tip: formatDayShort(r.day), parts: r.t == null ? null : [r.t, r.c] }));
    const map = new Map();
    for (const r of raw) { if (r.t == null) continue; const k = startOfWeek(r.day); const v = map.get(k) || [0, 0]; v[0] += r.t; v[1] += r.c; map.set(k, v); }
    return [...map.entries()].map(([k, v]) => ({ label: `${Number(k.slice(8))}/${Number(k.slice(5, 7))}`, tip: `Semaine du ${formatDayShort(k)}`, parts: v }));
  })();
  return h('div', { class: 'stack' },
    h('div', { class: 'tiles' },
      statTile({ label: 'Consommations', value: fmtNum(s.counts.total, 0), sub: `${fmtNum(s.counts.total / d, 1)} / jour`, extra: delta(pc(s.counts.total, p.counts.total)) }),
      statTile({ label: 'Dépenses', value: fmtMoney(s.cost.total), sub: `${fmtMoney(s.cost.total / d)} / jour`, extra: delta(pc(s.cost.total, p.cost.total)) }),
      statTile({ label: 'Tabac', value: fmtGrams(s.tobacco.total), sub: `${fmtGrams(s.tobacco.total / d)} / jour`, extra: delta(pc(s.tobacco.total, p.tobacco.total)) }),
      statTile({ label: 'CBD', value: fmtGrams(s.cbd.total), sub: `${fmtGrams(s.cbd.total / d)} / jour`, extra: delta(pc(s.cbd.total, p.cbd.total)) }),
      statTile({ label: 'Joints', value: fmtNum(s.counts.joint, 0), sub: `${fmtNum(s.counts.joint / d, 1)} / jour` }),
      statTile({ label: 'Roulées', value: fmtNum(s.counts.rolled, 0), sub: `${fmtNum(s.counts.rolled / d, 1)} / jour` }),
    ),
    card(cardHead('Grammes consommés', badge(gramsData.length && gramsData[0]?.tip?.startsWith('Semaine') ? 'par semaine' : 'par jour')),
      stackedBars(gramsData, [{ label: 'Tabac', color: COLORS.blue }, { label: 'CBD', color: COLORS.green }], { format: g2, aria: 'Grammes de tabac et de CBD par jour' })),
    card(cardHead('Comparaison des semaines'), weekCompare(4)),
    card(cardHead('Comparaison des mois'), monthCompare(4)),
    coverageNote(s),
    p.coverage ? null : h('p', { class: 'hint' }, 'Pas de période précédente comparable : les variations ne sont pas affichées.'));
}

function weekCompare(n) {
  const { ctx, today } = derived();
  const rows = [];
  for (let i = n - 1; i >= 0; i--) {
    const end = addDays(today, -7 * i); const start = addDays(end, -6);
    const s = summarize(state.entries, { start, end }, ctx, { method: ui.method });
    rows.push({ label: i === 0 ? '7 derniers j.' : `${formatDayShort(start)} – ${formatDayShort(end)}`, s });
  }
  return compareTable(rows);
}

function monthCompare(n) {
  const { ctx, today } = derived();
  const rows = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = addMonths(startOfMonth(today), -i); const end = endOfMonth(start);
    const s = summarize(state.entries, { start, end: end > today ? today : end }, ctx, { method: ui.method });
    rows.push({ label: `${MONTHS_SHORT[Number(start.slice(5, 7)) - 1]} ${start.slice(2, 4)}`, s });
  }
  return compareTable(rows);
}

function compareTable(rows) {
  return h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
    h('thead', null, h('tr', null, h('th', null, 'Période'), h('th', null, 'Tabac'), h('th', null, 'CBD'), h('th', null, 'Conso.'), h('th', null, 'Dépenses'))),
    h('tbody', null, rows.map((r) => h('tr', null,
      h('td', null, r.label, r.s.coverage && r.s.coverage.days < 7 ? h('span', { class: 'muted small' }, ` (${r.s.coverage.days} j)`) : null),
      ...(r.s.coverage
        ? [h('td', null, fmtGrams(r.s.tobacco.total)), h('td', null, fmtGrams(r.s.cbd.total)), h('td', null, String(r.s.counts.total)), h('td', null, fmtMoney(r.s.cost.total))]
        : [h('td', { colspan: 4, class: 'muted' }, 'Pas de suivi')]))))));
}

/* ------------------------------ Tabac ------------------------------ */

function tobacco() {
  const { ctx, today } = derived();
  const range = currentRange();
  const s = summarize(state.entries, range, ctx, { method: ui.method });
  if (!s.coverage) return card(emptyState({ title: 'Pas de suivi sur cette période' }));
  const d = s.coverage.days;
  const series = dailySeries(state.entries.filter((e) => !e.tobacco || ui.method === 'all' || e.tobacco.method === ui.method), range, ctx, measures.tobaccoGrams);
  const first = summarize(state.entries, { start: ctx.trackingStart, end: addDays(ctx.trackingStart, 6) }, ctx);
  const last = summarize(state.entries, { start: addDays(today, -6), end: today }, ctx);
  return h('div', { class: 'stack' },
    h('div', { class: 'tiles' },
      statTile({ label: 'Total', value: fmtGrams(s.tobacco.total), sub: `${s.tobacco.lines} saisies` }),
      statTile({ label: 'Moyenne / jour', value: fmtGrams(s.tobacco.total / d) }),
      statTile({ label: 'Moyenne / semaine', value: fmtGrams((s.tobacco.total / d) * 7) }),
      statTile({ label: 'Roulées', value: fmtNum(s.counts.rolled, 0), sub: `${fmtNum(s.counts.rolled / d, 1)} / jour` })),
    card(cardHead('Tabac par jour'), lineChart([{ label: 'Tabac', color: COLORS.blue, points: chartSeries(series, 'sum') }], { format: g2, area: true, aria: 'Tabac en grammes' })),
    card(cardHead('Où va le tabac'), splitBar([
      { label: 'Dans les joints', value: s.tobaccoJoint.total, color: COLORS.violet },
      { label: 'Dans les roulées', value: s.tobaccoRolled.total, color: COLORS.blue },
      { label: 'Autres catégories', value: Math.max(0, s.tobacco.total - s.tobaccoJoint.total - s.tobaccoRolled.total), color: COLORS.orange },
    ], fmtGrams)),
    card(cardHead('Pesé ou estimé'), methodSplit(s.tobacco) || h('p', { class: 'muted' }, 'Aucune quantité sur la période.')),
    card(cardHead('Évolution depuis le début'), evolution(first, last, (x) => x.tobacco.total, fmtGrams, 'tabac')),
    coverageNote(s));
}

function evolution(first, last, pick, fmt, what) {
  if (!first.coverage || !last.coverage || first.coverage.start === last.coverage.start) return h('p', { class: 'muted' }, 'Il faut au moins deux semaines de suivi pour comparer le début et aujourd’hui.');
  const a = pick(first) / first.coverage.days; const b = pick(last) / last.coverage.days;
  return h('div', { class: 'evo' },
    h('div', null, h('span', { class: 'muted small' }, 'Premiers jours'), h('b', { class: 'num-lg' }, `${fmt(a)}`), h('span', { class: 'muted small' }, '/ jour')),
    icon('chevron', 18),
    h('div', null, h('span', { class: 'muted small' }, '7 derniers jours'), h('b', { class: 'num-lg' }, `${fmt(b)}`), h('span', { class: 'muted small' }, '/ jour')),
    delta(variation(b, a).pct),
    h('p', { class: 'hint full' }, `Moyenne quotidienne de ${what}, quantités connues uniquement.`));
}

/* ------------------------------ CBD ------------------------------ */

function cbd() {
  const { ctx, today } = derived();
  const range = currentRange();
  const s = summarize(state.entries, range, ctx, { method: ui.method });
  if (!s.coverage) return card(emptyState({ title: 'Pas de suivi sur cette période' }));
  const d = s.coverage.days;
  const ja = jointAnalysis(state.entries, range, ctx);
  const series = dailySeries(state.entries.filter((e) => !e.cbd || ui.method === 'all' || e.cbd.method === ui.method), range, ctx, measures.cbdGrams);
  const bought = state.purchases.filter((p) => p.date >= range.start && p.date <= range.end && productById(p.productId)?.kind === 'cbd' && productById(p.productId)?.unit === 'g');
  const boughtQty = bought.reduce((t, p) => t + (purchaseQuantity(p) || 0), 0);
  const first = summarize(state.entries, { start: ctx.trackingStart, end: addDays(ctx.trackingStart, 6) }, ctx);
  const last = summarize(state.entries, { start: addDays(today, -6), end: today }, ctx);
  const others = Object.entries(s.cbdOther);
  return h('div', { class: 'stack' },
    h('div', { class: 'tiles' },
      statTile({ label: 'Total (g)', value: fmtGrams(s.cbd.total), sub: `${s.cbd.lines} saisies` }),
      statTile({ label: 'Moyenne / jour', value: fmtGrams(s.cbd.total / d) }),
      statTile({ label: 'Joints CBD', value: fmtNum(s.counts.joint, 0), sub: `${fmtNum(s.counts.joint / d, 1)} / jour` }),
      statTile({ label: 'CBD / joint', value: ja.avgCbd.value != null ? fmtGrams(ja.avgCbd.value) : '—', sub: `${ja.avgCbd.n} joint${ja.avgCbd.n > 1 ? 's' : ''} mesuré${ja.avgCbd.n > 1 ? 's' : ''}` }),
      statTile({ label: 'Acheté sur la période', value: fmtGrams(boughtQty), sub: `${bought.length} achat${bought.length > 1 ? 's' : ''}` }),
      statTile({ label: 'Moyenne / semaine', value: fmtGrams((s.cbd.total / d) * 7) })),
    card(cardHead('CBD par jour (grammes)'), lineChart([{ label: 'CBD', color: COLORS.green, points: chartSeries(series, 'sum') }], { format: g2, area: true, aria: 'CBD en grammes' })),
    others.length ? card(cardHead('Autres formes de CBD'), h('div', { class: 'list' }, others.map(([u, agg]) => h('div', { class: 'row' }, h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, u === 'drop' ? 'Huile (gouttes)' : u === 'ml' ? 'Millilitres' : 'Unités')), h('span', { class: 'row-right' }, `${fmtNum(agg.total, 2)} ${u === 'drop' ? 'gouttes' : u === 'ml' ? 'ml' : 'u.'}`)))),
      h('p', { class: 'hint' }, 'Ces quantités ne sont pas converties en grammes et ne sont jamais additionnées aux fleurs ou à la résine.')) : null,
    card(cardHead('Pesé ou estimé'), methodSplit(s.cbd) || h('p', { class: 'muted' }, 'Aucune quantité sur la période.')),
    card(cardHead('Évolution depuis le début'), evolution(first, last, (x) => x.cbd.total, fmtGrams, 'CBD')),
    note('Le CBD et le THC sont des substances distinctes. Cette application ne suit que les quantités de CBD que tu enregistres.', 'info'),
    coverageNote(s));
}

/* ------------------------------ Joints ------------------------------ */

function joints() {
  const { ctx } = derived();
  const range = currentRange();
  const ja = jointAnalysis(state.entries.filter((e) => e.categoryId !== CAT.JOINT || ui.method === 'all' || (e.tobacco?.method === ui.method && e.cbd?.method === ui.method)), range, ctx);
  if (!ja.coverage) return card(emptyState({ title: 'Pas de suivi sur cette période' }));
  if (!ja.count) return card(emptyState({ icon: 'joint', title: 'Aucun joint sur la période' }));
  const share = ja.ratios.length ? chartSeries(dailySeries(state.entries, range, ctx, (list) => {
    const r = list.filter((e) => e.categoryId === CAT.JOINT && isNum(e.tobacco?.grams) && isNum(e.cbd?.amount) && (e.tobacco.grams + e.cbd.amount) > 0)
      .map((e) => e.cbd.amount / (e.tobacco.grams + e.cbd.amount));
    return r.length ? (r.reduce((a, b) => a + b, 0) / r.length) * 100 : null;
  }), 'avg') : [];
  const hist = (vals, color, title) => {
    const bins = histogram(vals, 0.05);
    return card(cardHead(title, badge(`${vals.length} obs.`)), bins.length ? barChart(bins.map((b) => ({ label: fmtNum(b.from, 2), tip: `${fmtNum(b.from, 2)} – ${fmtNum(b.to, 2)} g`, value: b.count })), { color, format: (v) => fmtNum(v, 0), xLabelEvery: Math.ceil(bins.length / 6), aria: title }) : h('p', { class: 'muted' }, 'Aucune quantité mesurée.'));
  };
  return h('div', { class: 'stack' },
    h('div', { class: 'tiles' },
      statTile({ label: 'Joints', value: fmtNum(ja.count, 0), sub: `${fmtNum(ja.count / ja.coverage.days, 1)} / jour` }),
      statTile({ label: 'Coût moyen', value: ja.avgCost.value != null ? fmtMoney(ja.avgCost.value) : '—', sub: `${ja.avgCost.n} coût${ja.avgCost.n > 1 ? 's' : ''} complet${ja.avgCost.n > 1 ? 's' : ''}` }),
      statTile({ label: 'Tabac / joint', value: ja.avgTobacco.value != null ? fmtGrams(ja.avgTobacco.value) : '—', sub: `n = ${ja.avgTobacco.n}` }),
      statTile({ label: 'CBD / joint', value: ja.avgCbd.value != null ? fmtGrams(ja.avgCbd.value) : '—', sub: `n = ${ja.avgCbd.n}` })),
    ja.avgTobacco.value != null && ja.avgCbd.value != null ? card(cardHead('Composition moyenne'), splitBar([
      { label: 'Tabac', value: ja.avgTobacco.value, color: COLORS.blue },
      { label: 'CBD', value: ja.avgCbd.value, color: COLORS.green },
    ], fmtGrams), h('p', { class: 'hint' }, `${ja.weighedCount} joint(s) entièrement pesé(s) sur ${ja.count}.`)) : null,
    hist(ja.tobaccoValues, COLORS.blue, 'Répartition — tabac par joint'),
    hist(ja.cbdValues, COLORS.green, 'Répartition — CBD par joint'),
    share.length ? card(cardHead('Part de CBD dans les joints'), lineChart([{ label: 'Part de CBD', color: COLORS.green, points: share }], { format: (v) => `${Math.round(v)} %`, max: 100, aria: 'Part de CBD' })) : null,
    card(cardHead('Heures des joints'), hourBars(ja.hours, COLORS.violet)),
    h('p', { class: 'hint' }, 'Les moyennes n’utilisent que les joints dont la quantité est connue (n = nombre d’observations).'));
}

function hourBars(hours, color) {
  return barChart(hours.map((v, i) => ({ label: `${i}h`, tip: `${i} h – ${i + 1} h`, value: v })), { color, format: (v) => fmtNum(v, 0), xLabelEvery: 3, aria: 'Répartition par heure' });
}

/* ------------------------------ Temps ------------------------------ */

function time() {
  const { ctx, today } = derived();
  const range = currentRange();
  const cov = coverage(range, ctx.trackingStart, today);
  if (!cov) return card(emptyState({ title: 'Pas de suivi sur cette période' }));
  const cons = entriesIn(state.entries, cov).filter(isConsumption);
  if (!cons.length) return card(emptyState({ title: 'Aucune consommation sur la période' }));
  const wd = byWeekday(cons, cov);
  const parts = byDayPart(cons);
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const end = addDays(today, -7 * i); const start = addDays(end, -6);
    const s = summarize(state.entries, { start, end }, ctx);
    weeks.push({ label: formatDayShort(start).replace(/\.$/, ''), tip: `${formatDayShort(start)} – ${formatDayShort(end)}`, value: s.coverage ? s.counts.total : null });
  }
  return h('div', { class: 'stack' },
    card(cardHead('Par heure', badge(`${cons.length} consommations`)), hourBars(byHour(cons), COLORS.violet)),
    card(cardHead('Par jour de la semaine', badge('moyenne')), barChart(wd.map((v, i) => ({ label: WEEKDAYS_SHORT[i], value: v })), { color: COLORS.blue, format: (v) => fmtNum(v, 1), aria: 'Moyenne par jour de semaine' })),
    card(cardHead('Par période de la journée'), splitBar(DAY_PARTS.map((p, i) => ({ label: `${p.label} (${p.range})`, value: parts[p.id], color: [COLORS.green, COLORS.blue, COLORS.violet, COLORS.orange][i] })), (v) => fmtNum(v, 0))),
    card(cardHead('Carte jour × heure'), heatmap(heatGrid(cons), WEEKDAYS_SHORT, { unit: 'consommation(s)' })),
    card(cardHead('Semaine après semaine'), barChart(weeks, { color: COLORS.violet, format: (v) => fmtNum(v, 0), highlight: weeks.length - 1, xLabelEvery: 2, aria: 'Consommations par semaine' })),
    card(cardHead('Mois après mois'), monthCompare(6)));
}

/* ------------------------------ Envies ------------------------------ */

function cravings() {
  const { ctx } = derived();
  const range = currentRange();
  const cs = cravingStats(state.entries, range, ctx);
  if (!cs.coverage) return card(emptyState({ title: 'Pas de suivi sur cette période' }));
  if (!cs.total) return card(emptyState({ icon: 'wave', title: 'Aucune envie enregistrée', text: 'Enregistrer tes envies, même quand tu ne consommes rien, permet de mieux les comprendre.' }));
  const series = cravingSeries(state.entries, range, ctx);
  const compact = series.length > 45;
  const data = compact
    ? (() => { const m = new Map(); for (const p of series) { if (!p.value) continue; const k = startOfWeek(p.day); const v = m.get(k) || [0, 0]; v[0] += p.value.resisted; v[1] += p.value.consumed; m.set(k, v); } return [...m.entries()].map(([k, v]) => ({ label: `${Number(k.slice(8))}/${Number(k.slice(5, 7))}`, tip: `Semaine du ${formatDayShort(k)}`, parts: v })); })()
    : series.map((p) => ({ label: dayLabel(p.day, series.length), tip: formatDayShort(p.day), parts: p.value ? [p.value.resisted, p.value.consumed] : null }));
  const weekly = groupSeries(series.map((p) => ({ day: p.day, value: p.value ? p.value.resisted : null })), 'week');
  const weeklyTotal = groupSeries(series.map((p) => ({ day: p.day, value: p.value ? p.value.resisted + p.value.consumed : null })), 'week');
  const shareSeries = weekly.map((w, i) => ({ label: `${Number(w.key.slice(8))}/${Number(w.key.slice(5, 7))}`, tip: `Semaine du ${formatDayShort(w.key)}`, value: weeklyTotal[i]?.value ? (w.value / weeklyTotal[i].value) * 100 : null }));
  const maxT = Math.max(...cs.topTriggers.map((t) => t.count));
  return h('div', { class: 'stack' },
    h('div', { class: 'tiles' },
      statTile({ label: 'Envies / jour', value: fmtNum(cs.perDay, 1), sub: `${cs.total} au total` }),
      statTile({ label: 'Résistées', value: fmtNum(cs.resisted, 0), sub: cs.resistedShare != null ? `${fmtPct(cs.resistedShare)} des envies` : null, tone: 'green' }),
      statTile({ label: 'Suivies d’une conso.', value: fmtNum(cs.consumed, 0) }),
      statTile({ label: 'Intensité moyenne', value: cs.avgIntensity.value != null ? `${fmtNum(cs.avgIntensity.value, 1)} / 10` : '—', sub: `n = ${cs.avgIntensity.n}` }),
      statTile({ label: 'Durée moyenne', value: cs.avgDuration.value != null ? formatDuration(cs.avgDuration.value) : '—', sub: `n = ${cs.avgDuration.n}` }),
      statTile({ label: 'Heures difficiles', value: cs.hardest.length ? cs.hardest.map((x) => `${x.h} h`).join(' · ') : '—' })),
    card(cardHead('Envies au fil du temps'), stackedBars(data, [{ label: 'Résistées', color: COLORS.green }, { label: 'Suivies d’une conso.', color: COLORS.orange }], { format: (v) => fmtNum(v, 0), aria: 'Envies par jour' })),
    shareSeries.length > 1 ? card(cardHead('Part des envies résistées', badge('par semaine')), lineChart([{ label: 'Résistées', color: COLORS.green, points: shareSeries }], { format: (v) => `${Math.round(v)} %`, max: 100, aria: 'Part des envies résistées' })) : null,
    card(cardHead('Heures des envies'), hourBars(cs.hours, COLORS.green)),
    card(cardHead('Déclencheurs les plus fréquents'), h('div', { class: 'hbars' }, cs.topTriggers.map((t) => h('div', { class: 'hbar' },
      h('span', { class: 'hbar-label' }, t.label), h('span', { class: 'hbar-track' }, h('i', { style: { width: `${(t.count / maxT) * 100}%` } })), h('b', null, String(t.count)))))),
    card(cardHead('Produit concerné'), splitBar([
      { label: 'Tabac', value: cs.byProduct.tobacco, color: COLORS.blue }, { label: 'CBD', value: cs.byProduct.cbd, color: COLORS.green }, { label: 'Les deux', value: cs.byProduct.both, color: COLORS.violet },
    ], (v) => fmtNum(v, 0))),
    note('Une envie n’est pas un échec : chaque envie notée t’aide à repérer tes moments sensibles.', 'positive'));
}

/* ------------------------------ Sommeil ------------------------------ */

const SLEEP_X = [
  { id: 'eveningCbd', label: 'CBD du soir (g)' }, { id: 'eveningTobacco', label: 'Tabac du soir (g)' }, { id: 'eveningCount', label: 'Consommations du soir' },
  { id: 'dayCbd', label: 'CBD de la journée (g)' }, { id: 'dayTobacco', label: 'Tabac de la journée (g)' }, { id: 'nightCravings', label: 'Envies nocturnes' },
];
const SLEEP_Y = [
  { id: 'latency', label: 'Temps d’endormissement (min)' }, { id: 'quality', label: 'Qualité du sommeil (1–5)' }, { id: 'total', label: 'Durée de sommeil (h)' },
];

function sleep() {
  const { today } = derived();
  const range = currentRange();
  const st = sleepStats(state.nights, range);
  if (!state.nights.length) {
    return card(emptyState({ icon: 'moon', title: 'Aucune nuit enregistrée', text: 'Note tes nuits pour comparer sommeil, envies et consommation.', action: h('button', { class: 'btn btn-primary', onclick: () => openNightForm() }, 'Noter ma nuit') }));
  }
  const nights = state.nights.filter((n) => n.date >= range.start && n.date <= range.end).sort((a, b) => (a.date < b.date ? -1 : 1));
  const pts = (fn) => nights.map((n) => ({ label: `${Number(n.date.slice(8))}/${Number(n.date.slice(5, 7))}`, tip: `Nuit du ${formatDayShort(n.date)}`, value: fn(n) }));
  const pairs = sleepPairs(state.nights, state.entries, range, ui.sleepX, ui.sleepY);
  const corr = pearson(pairs.map((p) => p.x), pairs.map((p) => p.y));
  const xl = SLEEP_X.find((x) => x.id === ui.sleepX).label; const yl = SLEEP_Y.find((x) => x.id === ui.sleepY).label;
  const concern = sleepConcern(state.nights, today);
  return h('div', { class: 'stack' },
    concern ? note(concern, 'warn') : null,
    h('div', { class: 'tiles' },
      statTile({ label: 'Nuits notées', value: `${st.count}`, sub: `sur ${st.days} jours` }),
      statTile({ label: 'Qualité moyenne', value: st.quality.value != null ? `${fmtNum(st.quality.value, 1)} / 5` : '—' }),
      statTile({ label: 'Endormissement', value: st.latency.value != null ? formatDuration(st.latency.value) : '—', sub: `n = ${st.latency.n}` }),
      statTile({ label: 'Durée de sommeil', value: st.total.value != null ? formatDuration(st.total.value) : '—', sub: `n = ${st.total.n}` }),
      statTile({ label: 'Réveils / nuit', value: st.awakenings.value != null ? fmtNum(st.awakenings.value, 1) : '—' }),
      statTile({ label: 'Énergie moyenne', value: st.energy.value != null ? `${fmtNum(st.energy.value, 1)} / 5` : '—' })),
    nights.length ? card(cardHead('Temps d’endormissement'), lineChart([{ label: 'Endormissement', color: COLORS.blue, points: pts((n) => computeNight(n).latencyMin) }], { format: (v) => `${Math.round(v)}′`, aria: 'Temps d’endormissement' })) : null,
    nights.length ? card(cardHead('Qualité et durée'), lineChart([
      { label: 'Qualité (1–5)', color: COLORS.violet, points: pts((n) => n.quality) },
    ], { min: 0, max: 5, format: (v) => fmtNum(v, 1), aria: 'Qualité du sommeil' }),
    lineChart([{ label: 'Durée (h)', color: COLORS.green, points: pts((n) => { const c = computeNight(n).totalSleepMin; return c != null ? c / 60 : null; }) }], { min: 0, format: (v) => `${fmtNum(v, 1)} h`, aria: 'Durée de sommeil' })) : null,
    card(cardHead('Comparer'),
      h('div', { class: 'stack-sm' }, select(SLEEP_X, ui.sleepX, (v) => { ui.sleepX = v; rerender(); }), select(SLEEP_Y, ui.sleepY, (v) => { ui.sleepY = v; rerender(); })),
      pairs.length ? scatter(pairs.map((p) => ({ ...p, tip: `Nuit du ${formatDayShort(p.date)}` })), {
        fx: (v) => fmtNum(v, ui.sleepX.includes('Count') || ui.sleepX === 'nightCravings' ? 0 : 2), fy: (v) => fmtNum(v, 1), xLabel: xl, color: COLORS.blue, aria: `${xl} et ${yl}`,
      }) : h('p', { class: 'muted' }, 'Pas encore de nuits avec ces deux informations.'),
      h('p', { class: 'insight-text' }, describeCorrelation(corr, xl.toLowerCase().replace(/ \(.*\)/, ''), yl.toLowerCase().replace(/ \(.*\)/, ''))),
      h('p', { class: 'hint' }, `Corrélation calculée à partir de ${MIN_CORRELATION_N} nuits minimum. Une corrélation n’est pas une cause, et ces données ne constituent pas un avis médical.`)),
    card(cardHead('Calendrier des nuits'), nightCalendar(today)),
    note('Le CBD n’est pas un traitement du sommeil. En cas de difficultés persistantes, parles-en à un professionnel de santé.', 'info'));
}

function nightCalendar(today) {
  const start = startOfWeek(addDays(today, -34));
  const days = []; for (let d = start; d <= today; d = addDays(d, 1)) days.push(d);
  const colors = ['', '#5b4a8c', '#7462b0', '#8c7bd2', '#A995F5', '#c6b9fa'];
  return h('div', null,
    h('div', { class: 'cal-grid cal-grid-sm' },
      WEEKDAYS_SHORT.map((w) => h('span', { class: 'cal-wd' }, w[0])),
      days.map((d) => {
        const n = state.nights.find((x) => x.date === d);
        const c = n ? computeNight(n) : null;
        return h('button', {
          class: `cal-day ${n ? '' : 'untracked'}`, style: n?.quality ? { background: colors[n.quality], color: n.quality >= 4 ? '#101116' : '#F4F5F8' } : null,
          title: n ? `Nuit du ${formatDayShort(d)} · ${n.quality ?? '?'}/5 · ${c.totalSleepMin != null ? formatDuration(c.totalSleepMin) : '—'}${n.note ? ' · ' + n.note : ''}` : `Nuit du ${formatDayShort(d)} non notée`,
          onclick: () => openNightForm({ date: d }),
        }, h('span', { class: 'cal-num' }, String(Number(d.slice(8)))), n && c.latencyMin != null ? h('span', { class: 'cal-val' }, `${Math.round(c.latencyMin)}′`) : null);
      })),
    legend([1, 2, 3, 4, 5].map((q) => ({ label: `${q}`, color: colors[q] }))),
    h('p', { class: 'hint' }, 'Couleur : qualité (1 à 5). Chiffre : minutes pour s’endormir. Touche une nuit pour voir ou modifier ses notes.'));
}

/* ------------------------------ Finances ------------------------------ */

function finance() {
  const { ctx, today } = derived();
  const range = currentRange();
  const s = summarize(state.entries, range, ctx);
  if (!s.coverage) return card(emptyState({ title: 'Pas de suivi sur cette période' }));
  const d = s.coverage.days;
  const series = dailySeries(state.entries, range, ctx, costMeasure(ctx.cost));
  const per = (id) => summarize(state.entries, { start: id === 'y' ? today.slice(0, 4) + '-01-01' : addDays(today, -(Number(id) - 1)), end: today }, ctx).cost.total;
  const cats = Object.entries(s.counts.byCategory).map(([id]) => {
    const list = entriesIn(state.entries, s.coverage).filter((e) => e.categoryId === id);
    return { id, label: catById(id)?.name || id, value: list.reduce((t, e) => t + ctx.cost(e).total, 0) };
  }).sort((a, b) => b.value - a.value);
  const aj = avgCostByCategory(state.entries, range, ctx, CAT.JOINT);
  const ar = avgCostByCategory(state.entries, range, ctx, CAT.ROLLED);
  const purchases = state.purchases.filter((p) => p.date >= s.coverage.start && p.date <= s.coverage.end);
  const paid = purchases.reduce((t, p) => t + (purchaseTotal(p) || 0), 0);
  const realized = realizedSavings(state.entries, state.settings.baseline, ctx);
  const catColors = [COLORS.violet, COLORS.blue, COLORS.green, COLORS.orange];
  return h('div', { class: 'stack' },
    h('div', { class: 'tiles' },
      statTile({ label: 'Aujourd’hui', value: fmtMoney(per('1')) }),
      statTile({ label: '7 jours', value: fmtMoney(per('7')) }),
      statTile({ label: '30 jours', value: fmtMoney(per('30')) }),
      statTile({ label: 'Cette année', value: fmtMoney(per('y')) }),
      statTile({ label: 'Journée moyenne', value: fmtMoney(s.cost.total / d), sub: `sur ${d} j` }),
      statTile({ label: 'Projection annuelle', value: fmtMoney((s.cost.total / d) * 365), sub: 'au rythme de la période' })),
    card(cardHead('Dépenses par jour'), barChart(chartSeries(series, 'sum'), { color: COLORS.violet, format: (v) => fmtNum(v, v < 10 ? 1 : 0), aria: 'Dépenses par jour' })),
    card(cardHead('Répartition'), splitBar([
      { label: 'Tabac', value: s.cost.tobacco, color: COLORS.blue }, { label: 'CBD', value: s.cost.cbd, color: COLORS.green }, { label: 'Accessoires', value: s.cost.accessories, color: COLORS.violet },
    ], fmtMoney)),
    card(cardHead('Par catégorie'), splitBar(cats.slice(0, 4).map((c, i) => ({ label: c.label, value: c.value, color: catColors[i] })), fmtMoney)),
    h('div', { class: 'tiles tiles-2' },
      statTile({ label: 'Coût moyen d’un joint', value: aj.value != null ? fmtMoney(aj.value) : '—', sub: `${aj.n} sur ${aj.total} complets` }),
      statTile({ label: 'Coût moyen d’une roulée', value: ar.value != null ? fmtMoney(ar.value) : '—', sub: `${ar.n} sur ${ar.total} complets` })),
    card(cardHead('Achats sur la période'),
      h('div', { class: 'evo' }, h('div', null, h('span', { class: 'muted small' }, 'Payé (achats)'), h('b', { class: 'num-lg' }, fmtMoney(paid))), h('div', null, h('span', { class: 'muted small' }, 'Consommé (valeur)'), h('b', { class: 'num-lg' }, fmtMoney(s.cost.total)))),
      h('p', { class: 'hint' }, 'Les achats sont ce que tu as payé ; la valeur consommée est le coût de ce que tu as réellement utilisé. Ils ne sont jamais additionnés.'),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => openPurchaseForm() }, icon('plus', 14), 'Enregistrer un achat')),
    realized ? card(cardHead('Économies réalisées', badge('données réelles', 'green')),
      h('div', { class: 'evo' }, h('div', null, h('span', { class: 'muted small' }, `Depuis ta référence (${realized.days} j)`), h('b', { class: 'num-lg' }, fmtMoney(realized.saved)))),
      h('p', { class: 'hint' }, `Calculé à partir de tes dépenses enregistrées comparées à ta référence de ${fmtMoney(state.settings.baseline.costPerDay)} / jour. Les montants du simulateur, eux, sont théoriques.`)) : null,
    s.cost.incomplete ? note(`${s.cost.incomplete} consommation(s) ont un coût incomplet (prix ou quantité manquants) : les totaux sont sous-estimés.`, 'warn') : null);
}

/* ------------------------------ Simulateur ------------------------------ */

function simulator() {
  const { ctx, today } = derived();
  const days = Number(ui.simWindow);
  const range = { start: addDays(today, -(days - 1)), end: today };
  const profile = dailyCostProfile(state.entries, range, ctx);
  const head = h('div', { class: 'stack' },
    h('p', { class: 'muted' }, 'Calculé uniquement à partir de tes dépenses réellement enregistrées. Les montants obtenus sont des économies théoriques.'),
    field2('Période de référence', segmented([{ id: '7', label: '7 j' }, { id: '14', label: '14 j' }, { id: '30', label: '30 j' }, { id: '90', label: '90 j' }], ui.simWindow, (v) => { ui.simWindow = v; rerender(); }, { small: true })));
  if (!profile || !profile.entries) return h('div', { class: 'stack' }, head, card(emptyState({ icon: 'euro', title: 'Pas assez de données', text: 'Enregistre quelques consommations et tes tarifs pour simuler des économies.' })));
  const sc = scenarios(profile);
  const chosen = sc.find((x) => x.id === ui.simScenario) || sc[2];
  const proj = projectSavings(chosen);
  return h('div', { class: 'stack' }, head,
    card(cardHead('Ton rythme actuel'),
      h('div', { class: 'evo' }, h('div', null, h('span', { class: 'muted small' }, 'Par jour'), h('b', { class: 'num-lg' }, fmtMoney(profile.total))), h('div', null, h('span', { class: 'muted small' }, 'Par an'), h('b', { class: 'num-lg' }, fmtMoney(profile.total * 365)))),
      h('p', { class: 'hint' }, `Moyenne sur ${profile.days} jour(s) suivis, ${profile.entries} consommation(s).${profile.incomplete ? ` ${profile.incomplete} coût(s) incomplet(s) : la simulation est sous-estimée.` : ''}`)),
    card(cardHead('Scénarios'), h('div', { class: 'scenarios' }, sc.filter((x) => x.id !== 'current').map((x) => h('button', {
      class: `scenario ${x.id === chosen.id ? 'on' : ''}`, onclick: () => { ui.simScenario = x.id; rerender(); },
    }, h('span', { class: 'sc-label' }, x.label), h('span', { class: 'sc-val' }, `−${fmtMoney(x.saving)} / j`))))),
    card(cardHead(chosen.label),
      chosen.note ? h('p', { class: 'hint' }, chosen.note) : null,
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, h('th', null, 'Horizon'), h('th', null, 'Économie'), h('th', null, 'Dépense restante'))),
        h('tbody', null, proj.map((p) => h('tr', null, h('td', null, p.label), h('td', { class: 'pos' }, fmtMoney(p.amount)), h('td', null, fmtMoney(p.spend)))))))),
    card(cardHead('Tous les scénarios sur 1 an'), barChart(sc.map((x) => ({ label: x.id === 'current' ? 'Actuel' : x.id.startsWith('r') ? `−${x.id.slice(1)} %` : x.id === 'noTobacco' ? 'Sans tabac' : x.id === 'noCbd' ? 'Sans CBD' : 'Arrêt', tip: x.label, value: x.remaining * 365 })), { color: COLORS.violet, format: (v) => fmtNum(v, 0), xLabelEvery: 1, aria: 'Dépense annuelle par scénario' }),
      h('p', { class: 'hint' }, 'Dépense annuelle restante dans chaque scénario.')));
}

function field2(label, control) { return h('div', { class: 'field' }, h('span', { class: 'field-label' }, label), control); }

/* ------------------------------ Habitudes ------------------------------ */

function behaviour() {
  const { ctx, today } = derived();
  const range = currentRange();
  const cov = coverage(range, ctx.trackingStart, today);
  const ins = generateInsights(state, ctx);
  if (!cov) return card(emptyState({ title: 'Pas de suivi sur cette période' }));
  const cons = entriesIn(state.entries, cov).filter(isConsumption);
  const cr = entriesIn(state.entries, cov).filter(isCraving);
  // Habitudes récurrentes : (catégorie, heure) présentes un grand nombre de jours.
  const slots = new Map();
  for (const e of cons) {
    const key = `${e.categoryId}|${e.at.slice(11, 13)}`;
    if (!slots.has(key)) slots.set(key, new Set());
    slots.get(key).add(e.at.slice(0, 10));
  }
  const habits = [...slots.entries()].map(([k, set]) => { const [cat, hr] = k.split('|'); return { cat, hr: Number(hr), days: set.size }; })
    .filter((x) => cov.days >= 7 && x.days / cov.days >= 0.4).sort((a, b) => b.days - a.days).slice(0, 5);
  // Consommations sans envie notée ni contexte : potentiellement « automatiques ».
  const linked = new Set(cr.map((c) => c.consumptionId).filter(Boolean));
  const auto = cons.filter((e) => !linked.has(e.id) && !e.cravingId);
  const ctxCounts = countBy(cons, (e) => e.context); const moodCounts = countBy(cons, (e) => e.mood);
  const quiet = (() => {
    const wd = byWeekday(cons, cov); let min = null;
    wd.forEach((v, i) => { if (v != null && (min == null || v < wd[min])) min = i; });
    return min;
  })();
  return h('div', { class: 'stack' },
    card(cardHead('Observations automatiques'), ins.length
      ? h('div', { class: 'insights' }, ins.map((i) => h('div', { class: `insight insight-${i.tone}` }, icon(i.tone === 'positive' ? 'sparkle' : 'info', 16), h('p', null, i.text))))
      : h('p', { class: 'muted' }, 'Pas encore assez de données pour formuler des observations fiables. Elles apparaîtront après une à deux semaines de suivi.')),
    card(cardHead('Habitudes récurrentes'), habits.length
      ? h('div', { class: 'list' }, habits.map((x) => h('div', { class: 'row' }, h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, `${catById(x.cat)?.short || 'Consommation'} entre ${x.hr} h et ${x.hr + 1} h`), h('span', { class: 'row-sub' }, `${x.days} jours sur ${cov.days}`)), h('span', { class: 'row-right' }, fmtPct(x.days / cov.days)))))
      : h('p', { class: 'muted' }, 'Aucun créneau ne revient plus de 40 % des jours sur cette période.')),
    card(cardHead('Consommations sans envie notée'),
      h('p', null, `${auto.length} sur ${cons.length} consommations n’ont pas d’envie associée.`),
      h('p', { class: 'hint' }, 'Elles peuvent correspondre à des gestes plus automatiques. Noter l’envie avant de consommer aide à les repérer.')),
    quiet != null && cons.length >= 10 ? card(cardHead('Période avec moins de consommation'), h('p', null, `Le ${['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'][quiet]} est en moyenne ta journée la plus calme.`)) : null,
    ctxCounts.length ? card(cardHead('Contextes'), splitBar(ctxCounts.slice(0, 4).map(([id, n], i) => ({ label: labelOf(CONTEXTS, id), value: n, color: [COLORS.violet, COLORS.blue, COLORS.green, COLORS.orange][i] })), (v) => fmtNum(v, 0)),
      h('p', { class: 'hint' }, `${cons.length - ctxCounts.reduce((t, [, n]) => t + n, 0)} consommation(s) sans contexte renseigné.`)) : null,
    moodCounts.length ? card(cardHead('Humeurs notées'), splitBar(moodCounts.slice(0, 4).map(([id, n], i) => ({ label: labelOf(MOODS, id), value: n, color: [COLORS.violet, COLORS.blue, COLORS.green, COLORS.orange][i] })), (v) => fmtNum(v, 0))) : null);
}

function countBy(list, fn) {
  const m = new Map();
  for (const x of list) { const k = fn(x); if (!k) continue; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

