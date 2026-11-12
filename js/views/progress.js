// PROGRÈS — analyses universelles, adaptées aux méthodes réellement utilisées.

import { h } from '../ui/dom.js';
import { analysisCard } from './analysis.js';
import { icon } from '../ui/icons.js';
import { card, segmented, emptyState, note, select, chips } from '../ui/components.js';
import { barChart, stackedBars, lineChart, splitBar, ring, COLORS } from '../ui/charts.js';
import { openNightForm, openCravingForm } from '../ui/forms.js';
import { state, derived, catById, productById } from '../core/store.js';
import { addDays, formatDayShort, formatDuration, DAY_PARTS, startOfWeek, diffDays } from '../core/dates.js';
import { fmtGrams, fmtMoney, fmtNum, isNum, fmtQty } from '../core/format.js';
import { summarize, dailySeries, measures, costMeasure, entriesIn, isConsumption, byDayPart, groupSeries, byMolecule, byHour } from '../domain/stats.js';
import { cravingStats, cravingSeries } from '../domain/cravings.js';
import { sleepStats, computeNight, sleepPairs, pearson, describeCorrelation, sleepConcern } from '../domain/sleep.js';
import { dailyCostProfile, reductionScenario, stopMethodsScenario, HORIZONS } from '../domain/simulator.js';
import { generateInsights } from '../domain/insights.js';
import { sessionStats } from '../domain/sessions.js';
import { financeOverview, budgetSplit, costByProduct, realizedWindows, avoidedSinceQuit, weekSplit, mostUsedMethod } from '../domain/finance.js';
import { computeStock, productFinance } from '../domain/stock.js';
import { moleculeLabel, productKindOf } from '../domain/models.js';
import { renderGoals } from './goals.js';
import { beforeMoneyCard } from './before.js';

const TABS = [
  { id: 'conso', label: 'Conso' }, { id: 'money', label: 'Argent' }, { id: 'sessions', label: 'Sessions' },
  { id: 'cravings', label: 'Envies' }, { id: 'sleep', label: 'Sommeil' }, { id: 'goals', label: 'Objectifs' }, { id: 'products', label: 'Produits' },
];
const PERIODS = [{ id: 7, label: '7 j' }, { id: 30, label: '30 j' }, { id: 90, label: '90 j' }, { id: 182, label: '6 mois' }, { id: 365, label: '1 an' }, { id: 'custom', label: 'Autre' }];
const ui = { days: 30, from: null, to: null, sim: 'r25', stop: [], sleepX: null };
const rerender = () => window.dispatchEvent(new Event('tts:render'));
const PALETTE = [COLORS.green, COLORS.blue, COLORS.orange, COLORS.violet];
const catName = (id) => catById(id)?.short || catById(id)?.name || id;

export function renderProgress(tab = 'conso') {
  const root = h('div', { class: 'view' });
  root.append(h('header', { class: 'view-head' }, h('h1', null, 'Progrès')));
  const tabs = h('nav', { class: 'tabs-scroll' }, TABS.map((t) => h('a', { href: `#/progress/${t.id}`, class: t.id === tab ? 'on' : '' }, t.label)));
  root.append(tabs);
  requestAnimationFrame(() => tabs.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' }));
  if (tab === 'goals') { root.append(renderGoals({ embedded: true })); return root; }

  const { ctx } = derived();
  if (!ctx.trackingStart) {
    root.append(card(emptyState({ icon: 'stats', title: 'Rien à montrer pour l’instant', text: 'Tes analyses apparaîtront dès tes premières saisies. Aucune donnée fictive n’est affichée.' })));
    return root;
  }
  // Rien n'a encore été enregistré : pas de zéros ni de moyennes sans objet.
  const nothingYet = !state.entries.some((e) => e.kind === 'consumption') && !state.purchases.length;
  if (nothingYet && (tab === 'conso' || tab === 'money')) {
    root.append(card(emptyState({ icon: 'stats', title: 'Rien à montrer pour l’instant', text: 'Tes analyses apparaîtront dès tes premières saisies. Aucune donnée fictive n’est affichée.' })));
    return root;
  }
  root.append(periodPicker());
  const fn = { conso, money, sessions, cravings, sleep, products }[tab] || conso;
  root.append(fn());
  if (tab !== 'products') { const ai = analysisCard(range()); if (ai) root.append(ai); }
  if (['conso', 'money', 'cravings'].includes(tab)) root.append(h('a', { class: 'more-link', href: '#/stats/overview' }, 'Analyses détaillées', icon('chevron', 14)));
  return root;
}

function periodPicker() {
  const { today } = derived();
  return h('div', { class: 'stack-sm' },
    h('div', { class: 'period-pills' }, PERIODS.map((p) => h('button', { class: `pill-btn ${ui.days === p.id ? 'on' : ''}`, onclick: () => { ui.days = p.id; if (p.id === 'custom' && !ui.from) { ui.from = addDays(today, -13); ui.to = today; } rerender(); } }, p.label))),
    ui.days === 'custom' ? h('div', { class: 'grid-2' },
      h('input', { class: 'input', type: 'date', value: ui.from, max: today, onchange: (e) => { ui.from = e.target.value || ui.from; rerender(); } }),
      h('input', { class: 'input', type: 'date', value: ui.to, max: today, onchange: (e) => { ui.to = e.target.value || ui.to; rerender(); } })) : null);
}

function range() {
  const { today } = derived();
  if (ui.days === 'custom' && ui.from && ui.to) return ui.from <= ui.to ? { start: ui.from, end: ui.to } : { start: ui.to, end: ui.from };
  const n = ui.days === 'custom' ? 30 : ui.days;
  return { start: addDays(today, -(n - 1)), end: today };
}
const rangeLen = (r) => diffDays(r.start, r.end) + 1;

function compact(series, mode = 'sum') {
  if (series.length <= 31) return series.map((p) => ({ label: String(Number(p.day.slice(8))), tip: formatDayShort(p.day), value: p.value }));
  return groupSeries(series, 'week').map((w) => ({ label: `${Number(w.key.slice(8))}/${Number(w.key.slice(5, 7))}`, tip: `Semaine du ${formatDayShort(w.key)}`, value: mode === 'avg' ? w.value / w.days : w.value }));
}
const big = (value, label, sub) => h('div', { class: 'big' }, h('b', null, value), h('span', null, label), sub ? h('em', null, sub) : null);
const head = (title, right) => h('div', { class: 'card-head' }, h('h3', { class: 'card-title' }, title), right || null);
const top4 = (list) => (list.length <= 4 ? list : [...list.slice(0, 3), { label: 'Autres', value: list.slice(3).reduce((t, x) => t + x.value, 0) }]);

/* ------------------------------ Conso ------------------------------ */

function conso() {
  const { ctx } = derived();
  const r = range();
  const s = summarize(state.entries, r, ctx);
  if (!s.coverage) return card(emptyState({ title: 'Pas de suivi sur cette période' }));
  const d = s.coverage.days;
  const prev = summarize(state.entries, { start: addDays(r.start, -rangeLen(r)), end: addDays(r.start, -1) }, ctx);
  let trend = null;
  if (prev.coverage && prev.counts.total) {
    const pct = Math.round(((s.counts.total / d - prev.counts.total / prev.coverage.days) / (prev.counts.total / prev.coverage.days)) * 100);
    trend = pct <= -5 ? { good: true, text: `${Math.abs(pct)} % de moins qu’avant` } : pct >= 5 ? { good: false, text: `${pct} % de plus qu’avant` } : { good: true, text: 'Stable' };
  }
  const methods = Object.entries(s.counts.byCategory).sort((a, b) => b[1] - a[1]);
  const mu = mostUsedMethod(state.entries, r, ctx);
  const declared = state.settings.habits?.primary;
  const qty = [
    s.tobacco.total ? big(fmtGrams(s.tobacco.total / d), 'tabac / jour', reliability(s.tobacco)) : null,
    s.cbd.total ? big(fmtGrams(s.cbd.total / d), 'CBD / jour', reliability(s.cbd)) : null,
    s.thc.total ? big(fmtGrams(s.thc.total / d), 'THC / jour', reliability(s.thc)) : null,
    s.unknownCannabis.total ? big(fmtGrams(s.unknownCannabis.total / d), 'cannabinoïde non précisé / j') : null,
    s.units.cigarettes ? big(fmtNum(s.units.cigarettes / d, 1), 'cigarettes / jour') : null,
    s.units.cigars ? big(fmtNum(s.units.cigars / d, 2), 'cigares / jour') : null,
    s.liquid.total ? big(`${fmtNum(s.liquid.total / d, 2)} ml`, 'e-liquide / jour', reliability(s.liquid)) : null,
    s.puffs ? big(fmtNum(s.puffs / d, 0), 'bouffées / jour') : null,
    s.nicotineN ? big(`${fmtNum(s.nicotineMg / d, 1)} mg`, 'nicotine contenue / jour', 'contenue, pas absorbée') : null,
  ].filter(Boolean);
  const rows = []; for (let i = 0; i < qty.length; i += 3) rows.push(h('div', { class: 'big-row' }, qty.slice(i, i + 3)));
  const series = dailySeries(state.entries, r, ctx, (list) => list);
  const gramKeys = [['Tabac', measures.tobaccoGrams, COLORS.blue], ['CBD', measures.cbdGrams, COLORS.green], ['THC', measures.thcGrams, COLORS.orange]]
    .filter(([, fn]) => series.some((p) => p.value && fn(p.value) > 0));
  const gram = series.length <= 31
    ? series.map((p) => ({ label: String(Number(p.day.slice(8))), tip: formatDayShort(p.day), parts: p.value ? gramKeys.map(([, fn]) => fn(p.value)) : null }))
    : (() => { const m = new Map(); for (const p of series) { if (!p.value) continue; const k = startOfWeek(p.day); const v = m.get(k) || gramKeys.map(() => 0); gramKeys.forEach(([, fn], i) => { v[i] += fn(p.value); }); m.set(k, v); } return [...m.entries()].map(([k, v]) => ({ label: `${Number(k.slice(8))}/${Number(k.slice(5, 7))}`, tip: `Semaine du ${formatDayShort(k)}`, parts: v })); })();
  const cons = entriesIn(state.entries, s.coverage).filter(isConsumption);
  const parts = byDayPart(cons);
  const ws = weekSplit(state.entries, r, ctx, measures.count);
  const mols = byMolecule(state.entries, r, ctx, moleculeLabel);
  const ins = generateInsights(state, ctx).slice(0, 3);
  return h('div', { class: 'stack' },
    card(h('div', { class: 'big-row' },
      big(fmtNum(s.counts.total / d, 1), 'consommations / jour', trend ? h('span', { class: trend.good ? 'up-good' : '' }, trend.text) : null),
      big(fmtNum(s.counts.total, 0), `en ${d} jour${d > 1 ? 's' : ''}`),
      s.counts.exceptional ? big(fmtNum(s.counts.exceptional, 0), 'exceptionnelles') : null),
    ...rows),
    methods.length ? card(head('Par méthode'),
      splitBar(top4(methods.map(([id, n]) => ({ label: catName(id), value: n }))).map((x, i) => ({ ...x, color: PALETTE[i] || COLORS.muted })), (v) => fmtNum(v, 0)),
      h('p', { class: 'hint' }, [
        declared ? `Méthode principale déclarée : ${catName(declared)}.` : null,
        mu.top ? `La plus utilisée sur la période : ${catName(mu.top)}.` : null,
      ].filter(Boolean).join(' '))) : null,
    gramKeys.length ? card(head('Grammes par jour'), stackedBars(gram, gramKeys.map(([label, , color]) => ({ label, color })), { format: (v) => fmtNum(v, 1), height: 150, aria: 'Grammes par jour' })) : null,
    card(head('Consommations par jour'), barChart(compact(dailySeries(state.entries, r, ctx, measures.count)), { color: COLORS.primary, format: (v) => fmtNum(v, 0), height: 130, aria: 'Consommations par jour' })),
    mols.length > 1 || (mols.length === 1 && mols[0][0] !== 'CBD') ? card(head('Par molécule'), splitBar(top4(mols.map(([k, v]) => ({ label: k, value: v }))).map((x, i) => ({ ...x, color: PALETTE[i] })), fmtGrams)) : null,
    cons.length ? card(head('Tes moments'), splitBar(DAY_PARTS.map((p, i) => ({ label: p.label, value: parts[p.id], color: PALETTE[i] })), (v) => fmtNum(v, 0)),
      ws && ws.weekdayDays && ws.weekendDays ? h('p', { class: 'hint' }, `En semaine : ${fmtNum(ws.weekday, 1)} / jour · le week-end : ${fmtNum(ws.weekend, 1)} / jour.`) : null) : null,
    ins.length ? card(head('À retenir'), h('div', { class: 'insights' }, ins.map((i) => h('div', { class: `insight insight-${i.tone}` }, icon(i.tone === 'positive' ? 'sparkle' : 'info', 16), h('p', null, i.text))))) : null);
}

function reliability(agg) {
  if (!agg.total) return null;
  const parts = [];
  if (agg.weighed) parts.push(`${Math.round((agg.weighed / agg.total) * 100)} % pesé`);
  if (agg.auto) parts.push(`${Math.round((agg.auto / agg.total) * 100)} % auto`);
  if (agg.estimated) parts.push(`${Math.round((agg.estimated / agg.total) * 100)} % estimé`);
  return `${parts.join(' · ')}${agg.missing ? ` · ${agg.missing} inconnue(s)` : ''}`;
}

/* ------------------------------ Argent ------------------------------ */

const fractionOfDay = () => { const t = new Date(); return (t.getHours() * 60 + t.getMinutes()) / 1440; };

function money() {
  const { ctx, index } = derived();
  const r = range();
  const s = summarize(state.entries, r, ctx);
  const f = financeOverview(state.entries, ctx);
  const split = budgetSplit(s);
  const methods = Object.entries(s.cost.byCategory).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const byP = costByProduct(state.entries, r, ctx, { index, settings: state.settings }).filter((x) => x.cost > 0).slice(0, 5);
  const profile = dailyCostProfile(state.entries, r, ctx);
  const win = realizedWindows(state.settings.before, state.entries, ctx, fractionOfDay());
  const modes = state.settings.habits?.modes || {};
  const quits = Object.entries(modes).filter(([, m]) => m?.mode === 'quit' && m.quitDate).map(([id, m]) => ({ id, a: avoidedSinceQuit(id, m.quitDate, state.entries, ctx) }));
  const scen = !profile ? null : ui.sim === 'stop' ? stopMethodsScenario(profile, ui.stop, catName) : ui.sim === 'all' ? stopMethodsScenario(profile, Object.keys(profile.byCategory || {}), catName) : reductionScenario(profile, Number(ui.sim.slice(1)) / 100);
  const paid = state.purchases.filter((p) => s.coverage && p.date >= s.coverage.start && p.date <= s.coverage.end).reduce((t, p) => t + (isNum(p.packPrice) ? p.packPrice * (p.packCount || 1) : 0), 0);
  return h('div', { class: 'stack' },
    card(h('div', { class: 'big-row' }, big(fmtMoney(f.today), 'aujourd’hui'), big(fmtMoney(f.week, { digits: 0 }), '7 derniers jours'), big(fmtMoney(f.month, { digits: 0 }), 'ce mois')),
      h('div', { class: 'big-row' }, big(fmtMoney(f.year, { digits: 0 }), 'cette année'), big(f.avgDaily != null ? fmtMoney(f.avgDaily) : '—', 'par jour en moyenne'), big(f.avgMonthly != null ? fmtMoney(f.avgMonthly, { digits: 0 }) : '—', 'par mois en moyenne')),
      f.incomplete ? h('p', { class: 'hint' }, `${f.incomplete} consommation(s) sans prix : complète tes produits pour un total exact.`) : null),
    beforeMoneyCard(),
    win.length ? card(head('Économies réalisées', h('span', { class: 'badge badge-green' }, 'réel')),
      h('div', { class: 'list' }, win.map((w) => h('div', { class: 'row' }, h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, w.label), w.available && w.partial ? h('span', { class: 'row-sub' }, `suivi sur ${w.coveredDays} j seulement`) : null),
        h('span', { class: `row-right ${w.saved >= 0 ? 'pos' : ''}` }, w.available ? fmtMoney(w.saved, { digits: 0 }) : '—')))),
      h('p', { class: 'hint' }, 'Ta dépense « avant l’app » comparée à tes dépenses réellement enregistrées. Ce ne sont pas des projections.')) : null,
    quits.length ? card(head('Dépenses évitées depuis un arrêt', h('span', { class: 'badge badge-orange' }, 'estimation')),
      h('div', { class: 'list' }, quits.map(({ id, a }) => h('div', { class: 'row' }, h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, catName(id)),
        h('span', { class: 'row-sub' }, !a || a.insufficient ? 'Données insuffisantes avant l’arrêt' : `${a.days} j · ~${fmtNum(a.avoidedCount, 0)} consommations évitées`)), h('span', { class: 'row-right' }, a && !a.insufficient ? fmtMoney(a.avoidedCost, { digits: 0 }) : '—')))),
      h('p', { class: 'hint' }, 'Basé sur ton rythme des 30 jours suivis avant l’arrêt. Une consommation ponctuelle est simplement déduite.')) : null,
    split.length ? card(head('Où va l’argent'), splitBar(top4(split).map((x, i) => ({ ...x, color: PALETTE[i] })), fmtMoney)) : null,
    methods.length > 1 ? card(head('Par méthode'), splitBar(top4(methods.map(([id, v]) => ({ label: catName(id), value: v }))).map((x, i) => ({ ...x, color: PALETTE[i] })), fmtMoney)) : null,
    byP.length ? card(head('Produits les plus coûteux'), h('div', { class: 'list' }, byP.map((x) => h('div', { class: 'row' },
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, productById(x.productId)?.name || 'Produit'), h('span', { class: 'row-sub' }, `${fmtQty(x.qty, x.unit === 'unit' ? 'unit' : x.unit)} consommés`)),
      h('span', { class: 'row-right' }, fmtMoney(x.cost)))))) : null,
    card(head('Dépenses par jour'), barChart(compact(dailySeries(state.entries, r, ctx, costMeasure(ctx.cost))), { color: COLORS.primary, format: (v) => fmtNum(v, v < 10 ? 1 : 0), height: 130, aria: 'Dépenses par jour' }),
      h('p', { class: 'hint' }, `Achats payés sur la période : ${fmtMoney(paid)} · valeur consommée : ${fmtMoney(s.cost.total)} (jamais additionnés).`)),
    profile && profile.total ? card(head('Économies potentielles', h('span', { class: 'badge badge-muted' }, 'simulation')),
      segmented([{ id: 'r10', label: '−10 %' }, { id: 'r25', label: '−25 %' }, { id: 'r50', label: '−50 %' }, { id: 'stop', label: 'Arrêter…' }, { id: 'all', label: 'Tout' }], ui.sim, (v) => { ui.sim = v; rerender(); }, { small: true }),
      ui.sim === 'stop' ? chips(Object.keys(profile.byCategory).map((id) => ({ id, label: catName(id) })), ui.stop, (v) => { ui.stop = v || []; rerender(); }, { multiple: true }) : null,
      scen ? h('div', { class: 'list' }, HORIZONS.map((hz) => h('div', { class: 'row' }, h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, hz.label)), h('span', { class: 'row-right pos' }, fmtMoney(scen.saving * hz.days, { digits: 0 }))))) : null,
      h('p', { class: 'hint' }, `Calculé sur tes dépenses réelles de la période (${fmtMoney(profile.total)} / jour). Économies théoriques, pas encore réalisées.`)) : null);
}

/* ------------------------------ Sessions ------------------------------ */

function sessions() {
  const { ctx } = derived();
  const r = range();
  const st = sessionStats(state.entries, r, ctx, { categoryLabel: catName, productLabel: (id) => productById(id)?.name || 'Produit' });
  if (!st || !st.count) return card(emptyState({ icon: 'timer', title: 'Pas encore de sessions', text: 'Appuie sur « Commencer » (vape, chicha…) ou ajoute une heure de fin à une consommation pour voir tes durées.' }));
  const cons = entriesIn(state.entries, st.coverage).filter(isConsumption);
  return h('div', { class: 'stack' },
    card(h('div', { class: 'big-row' },
      big(fmtNum(st.count, 0), 'consommations'),
      big(st.avgInterval.value != null ? formatDuration(st.avgInterval.value) : '—', 'entre deux débuts', 'intervalle moyen'),
      big(st.avgGap.value != null ? formatDuration(st.avgGap.value) : '—', 'sans consommer', 'en moyenne')),
    h('div', { class: 'big-row' },
      big(st.timed ? formatDuration(st.avgDuration.value) : '—', 'durée moyenne', `${st.timed} chronométrée(s)`),
      big(st.timed ? formatDuration(st.perDayMin) : '—', 'à consommer / jour'),
      big(st.timed ? formatDuration(st.perWeekMin) : '—', 'par semaine'))),
    st.byMethod.length ? card(head('Durée moyenne par méthode'), h('div', { class: 'list' }, st.byMethod.map((m) => h('div', { class: 'row' },
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, m.label), h('span', { class: 'row-sub' }, `${m.n} session(s) · total ${formatDuration(m.total)}`)), h('span', { class: 'row-right' }, formatDuration(m.avg)))))) : null,
    st.byProduct.length ? card(head('Par produit'), h('div', { class: 'list' }, st.byProduct.slice(0, 5).map((m) => h('div', { class: 'row' },
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, m.label), h('span', { class: 'row-sub' }, `${m.n} session(s)`)), h('span', { class: 'row-right' }, formatDuration(m.avg)))))) : null,
    card(head('Heures habituelles'), barChart(byHour(cons).map((v, i) => ({ label: `${i}h`, tip: `${i} h – ${i + 1} h`, value: v })), { color: COLORS.primary, format: (v) => fmtNum(v, 0), xLabelEvery: 3, height: 120, aria: 'Consommations par heure' })),
    h('p', { class: 'hint' }, 'Temps passé à consommer = durées chronométrées. Intervalle = d’un début au suivant. Temps sans consommer = de la fin d’une consommation au début de la suivante.'));
}

/* ------------------------------ Envies ------------------------------ */

function cravings() {
  const { ctx } = derived();
  const r = range();
  const cs = cravingStats(state.entries, r, ctx);
  if (!cs.total) {
    return card(emptyState({ icon: 'wave', title: 'Aucune envie notée', text: 'Note tes envies, même quand tu ne consommes pas : c’est la meilleure façon de les apprivoiser.', action: h('button', { class: 'btn btn-primary', onclick: () => openCravingForm() }, 'Noter une envie') }));
  }
  const series = cravingSeries(state.entries, r, ctx);
  const data = series.length <= 31
    ? series.map((p) => ({ label: String(Number(p.day.slice(8))), tip: formatDayShort(p.day), parts: p.value ? [p.value.resisted, p.value.consumed] : null }))
    : (() => { const m = new Map(); for (const p of series) { if (!p.value) continue; const k = startOfWeek(p.day); const v = m.get(k) || [0, 0]; v[0] += p.value.resisted; v[1] += p.value.consumed; m.set(k, v); } return [...m.entries()].map(([k, v]) => ({ label: `${Number(k.slice(8))}/${Number(k.slice(5, 7))}`, tip: `Semaine du ${formatDayShort(k)}`, parts: v })); })();
  const maxT = Math.max(...cs.topTriggers.map((t) => t.count));
  const ws = weekSplit(state.entries, r, ctx, measures.cravings);
  const byProd = new Map();
  for (const c of entriesIn(state.entries, cs.coverage).filter((e) => e.kind === 'craving')) byProd.set(c.product || 'other', (byProd.get(c.product || 'other') || 0) + 1);
  const prodLabel = { tobacco: 'Tabac', cbd: 'CBD', thc: 'THC', vape: 'Vape', puff: 'Puff', both: 'Tabac + CBD', other: 'Autre' };
  return h('div', { class: 'stack' },
    card(h('div', { class: 'ring-row' },
      ring(cs.resistedShare, 84, COLORS.green, `${Math.round((cs.resistedShare || 0) * 100)} %`),
      h('div', null, h('b', { class: 'ring-title' }, `${cs.resisted} envie${cs.resisted > 1 ? 's' : ''} résistée${cs.resisted > 1 ? 's' : ''}`),
        h('p', { class: 'muted' }, `sur ${cs.total} notée${cs.total > 1 ? 's' : ''}${cs.avgIntensity.value != null ? ` · intensité moyenne ${fmtNum(cs.avgIntensity.value, 1)}/10` : ''}${cs.avgDuration.value != null ? ` · ${formatDuration(cs.avgDuration.value)}` : ''}`),
        cs.hardest.length ? h('p', { class: 'muted small' }, `Moments sensibles : ${cs.hardest.map((x) => `${x.h} h`).join(', ')}`) : null))),
    card(head('Au fil des jours'), stackedBars(data, [{ label: 'Résistées', color: COLORS.green }, { label: 'Suivies d’une conso.', color: COLORS.orange }], { format: (v) => fmtNum(v, 0), height: 140, aria: 'Envies par jour' })),
    cs.topTriggers.length ? card(head('Ce qui les déclenche'), h('div', { class: 'hbars' }, cs.topTriggers.slice(0, 5).map((t) => h('div', { class: 'hbar' },
      h('span', { class: 'hbar-label' }, t.label), h('span', { class: 'hbar-track' }, h('i', { style: { width: `${(t.count / maxT) * 100}%` } })), h('b', null, String(t.count)))))) : null,
    card(head('Envie de quoi ?'), splitBar(top4([...byProd.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: prodLabel[k] || k, value: v }))).map((x, i) => ({ ...x, color: PALETTE[i] })), (v) => fmtNum(v, 0)),
      ws && ws.weekdayDays && ws.weekendDays ? h('p', { class: 'hint' }, `En semaine : ${fmtNum(ws.weekday, 1)} envie(s) / jour · le week-end : ${fmtNum(ws.weekend, 1)} / jour.`) : null));
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
  const used = Object.keys(summarize(state.entries, r, derived().ctx).counts.byCategory);
  const options = [
    ...used.map((id) => ({ id: `eveningCat:${id}`, label: `${catName(id)} le soir (nombre)` })),
    { id: 'eveningTobacco', label: 'Tabac du soir (g)' }, { id: 'eveningCbd', label: 'CBD du soir (g)' }, { id: 'nightCravings', label: 'Envies nocturnes' },
  ];
  if (!ui.sleepX || !options.find((o) => o.id === ui.sleepX)) ui.sleepX = options[0].id;
  const xl = options.find((o) => o.id === ui.sleepX).label;
  const pairs = sleepPairs(state.nights, state.entries, r, ui.sleepX, 'latency');
  const corr = pearson(pairs.map((p) => p.x), pairs.map((p) => p.y));
  const concern = sleepConcern(state.nights, today);
  return h('div', { class: 'stack' },
    concern ? note(concern, 'warn') : null,
    card(h('div', { class: 'big-row' },
      big(st.total.value != null ? formatDuration(st.total.value) : '—', 'de sommeil'),
      big(st.latency.value != null ? formatDuration(st.latency.value) : '—', 'pour s’endormir'),
      big(st.quality.value != null ? `${fmtNum(st.quality.value, 1)}/5` : '—', 'qualité'))),
    card(head('Temps pour s’endormir'), lineChart([{ label: 'Endormissement', color: COLORS.blue, points: pts((n) => computeNight(n).latencyMin) }], { format: (v) => `${Math.round(v)}′`, height: 130, aria: 'Temps d’endormissement' })),
    card(head('Durée de sommeil'), lineChart([{ label: 'Durée', color: COLORS.green, points: pts((n) => { const c = computeNight(n).totalSleepMin; return isNum(c) ? c / 60 : null; }) }], { min: 0, format: (v) => `${fmtNum(v, 1)} h`, height: 130, area: true, aria: 'Durée de sommeil' })),
    card(head('Comparer avec'), select(options, ui.sleepX, (v) => { ui.sleepX = v; rerender(); }),
      h('p', { class: 'muted' }, describeCorrelation(corr, xl.toLowerCase().replace(/ \(.*\)/, ''), 'le temps d’endormissement')),
      h('p', { class: 'hint' }, 'Une corrélation observée n’est pas une cause, et ces données ne sont pas un avis médical.')),
    actionsRow);
}

/* ------------------------------ Produits ------------------------------ */

function products() {
  const { ctx, index, today } = derived();
  const r = range();
  const consumed = new Map(costByProduct(state.entries, r, ctx, { index, settings: state.settings }).map((x) => [x.productId, x]));
  const list = state.products.filter((p) => !p.archived && p.kind !== 'device');
  const data = { purchases: state.purchases, inventories: state.inventories, entries: state.entries, settings: state.settings };
  const rows = list.map((p) => {
    const st = state.settings.stock?.enabled ? computeStock(p, data, today) : null;
    const fin = productFinance(p, state.purchases, st?.quantity);
    const c = consumed.get(p.id);
    if (!fin.purchases && !c) return null;
    const unit = p.kind === 'accessory' ? 'unit' : p.unit;
    return card(head(`${p.brand ? p.brand + ' · ' : ''}${p.name}`, h('span', { class: 'muted small' }, productKindOf(p.kind).label)),
      h('div', { class: 'avg-grid' },
        cellBox('Consommé', c ? fmtQty(c.qty, unit) : '—', c ? fmtMoney(c.cost) : 'sur la période'),
        cellBox('Acheté', fin.purchases ? fmtMoney(fin.spent, { digits: 0 }) : '—', fin.purchases ? `${fin.purchases} achat(s)` : 'aucun achat'),
        cellBox('Prix moyen', fin.avgUnitPrice != null ? fmtMoney(fin.avgUnitPrice, { digits: fin.avgUnitPrice < 0.1 ? 3 : 2 }) : '—', `par ${unit === 'g' ? 'g' : unit === 'ml' ? 'ml' : unit === 'puff' ? 'bouffée' : 'unité'}`)),
      st && st.quantity != null ? h('p', { class: 'hint' }, `Stock : ${fmtQty(st.quantity, unit)}${fin.stockValue != null ? ` · valeur ${fmtMoney(fin.stockValue)}` : ''}${st.daysLeft != null ? ` · ~${fmtNum(st.daysLeft, 0)} j restants` : ''}`) : null);
  }).filter(Boolean);
  if (!rows.length) return card(emptyState({ icon: 'tag', title: 'Aucun produit utilisé', text: 'Ajoute tes produits et leurs prix dans Réglages › Produits.' }));
  return h('div', { class: 'stack' }, ...rows,
    h('p', { class: 'hint' }, 'Acheté = argent dépensé. Consommé = coût de ce que tu as réellement utilisé. Valeur du stock = ce qu’il reste, au prix moyen d’achat. Trois notions distinctes.'));
}

const cellBox = (label, value, sub) => h('div', { class: 'avg-cell' }, h('span', { class: 'avg-label' }, label), h('b', null, value), h('span', { class: 'muted small' }, sub));
