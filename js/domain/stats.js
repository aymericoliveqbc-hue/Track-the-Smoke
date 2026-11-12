// Statistiques centralisées et réutilisables.
//
// Principes :
//  - le tabac et le CBD sont toujours agrégés séparément ;
//  - les quantités pesées, estimées et inconnues sont comptées séparément ;
//  - les moyennes sont calculées sur les seules données disponibles et
//    renvoient le nombre d'observations (n) utilisé ;
//  - aucune journée antérieure au début du suivi n'est comptée comme « 0 ».

import { addDays, daysBetween, diffDays, hourOf, weekday, dayPart, startOfWeek, startOfMonth, minutesBetween } from '../core/dates.js';
import { isNum } from '../core/format.js';
import { CAT } from './models.js';
import { components, moleculeClass } from './methods.js';

export const isConsumption = (e) => e.kind === 'consumption';
export const isCraving = (e) => e.kind === 'craving';

/** Premier jour de suivi : le plus ancien entre le réglage et la première donnée. */
export function trackingStartOf(state) {
  let min = state.settings?.trackingStart || null;
  for (const e of state.entries || []) { const d = e.at.slice(0, 10); if (!min || d < min) min = d; }
  for (const n of state.nights || []) {
    // Une nuit seulement importée d'Apple Santé ne fait pas commencer le suivi de consommation.
    if (n.source === 'apple-health' && n.quality == null && !n.note) continue;
    if (!min || n.date < min) min = n.date;
  }
  return min;
}

/** Restreint une plage à la période réellement suivie. null si aucune donnée. */
export function coverage(range, trackingStart, today) {
  if (!trackingStart) return null;
  const start = range.start > trackingStart ? range.start : trackingStart;
  const end = range.end < today ? range.end : today;
  if (start > end) return null;
  return { start, end, days: diffDays(start, end) + 1 };
}

export function entriesIn(entries, range) {
  if (!range) return [];
  return entries.filter((e) => { const d = e.at.slice(0, 10); return d >= range.start && d <= range.end; });
}

function qtyAgg() {
  return { total: 0, weighed: 0, estimated: 0, auto: 0, unknownMethod: 0, missing: 0, lines: 0 };
}

function addQty(agg, value, method, filter) {
  agg.lines += 1;
  if (!isNum(value)) { agg.missing += 1; return; }
  if (filter !== 'all' && method !== filter) return;
  agg.total += value;
  if (method === 'weighed') agg.weighed += value;
  else if (method === 'estimated') agg.estimated += value;
  else if (method === 'auto') agg.auto += value;
  else if (method === 'counted') agg.counted = (agg.counted || 0) + value;
  else agg.unknownMethod += value;
}

/**
 * Synthèse d'une période.
 * @param entries toutes les entrées
 * @param range {start, end}
 * @param ctx { cost(entry), trackingStart, today }
 * @param opts { method: 'all'|'weighed'|'estimated'|'auto' }
 */
export function summarize(entries, range, ctx, opts = {}) {
  const method = opts.method || 'all';
  const cov = coverage(range, ctx.trackingStart, ctx.today);
  const list = entriesIn(entries, cov);
  const COST_KEYS = ['tobacco', 'cbd', 'thc', 'unknown', 'liquid', 'cigarettes', 'cigars', 'puffs', 'accessories'];
  const s = {
    range, coverage: cov,
    counts: { total: 0, joint: 0, rolled: 0, cbd: 0, custom: 0, byCategory: {}, exceptional: 0, running: 0 },
    tobacco: qtyAgg(), tobaccoJoint: qtyAgg(), tobaccoRolled: qtyAgg(),
    cbd: qtyAgg(), cbdJoint: qtyAgg(), cbdOther: {},
    thc: qtyAgg(), unknownCannabis: qtyAgg(), liquid: qtyAgg(),
    units: { cigarettes: 0, cigars: 0 }, puffs: 0, nicotineMg: 0, nicotineN: 0,
    sessions: { timed: 0, totalMin: 0 },
    cost: { total: 0, incomplete: 0, entries: 0, byCategory: {}, ...Object.fromEntries(COST_KEYS.map((k) => [k, 0])) },
    cravings: { total: 0, resisted: 0, consumed: 0, intensitySum: 0, intensityN: 0, durationSum: 0, durationN: 0, avgIntensity: null, avgDuration: null },
  };
  for (const e of list) {
    if (isCraving(e)) {
      const c = s.cravings;
      c.total += 1;
      if (e.outcome === 'consumed') c.consumed += 1; else c.resisted += 1;
      if (isNum(e.intensity)) { c.intensitySum += e.intensity; c.intensityN += 1; }
      if (isNum(e.durationMin)) { c.durationSum += e.durationMin; c.durationN += 1; }
      continue;
    }
    if (!isConsumption(e)) continue;
    if (e.status === 'running') s.counts.running += 1;
    s.counts.total += 1;
    s.counts.byCategory[e.categoryId] = (s.counts.byCategory[e.categoryId] || 0) + 1;
    if (e.exceptional) s.counts.exceptional += 1;
    if (e.categoryId === CAT.JOINT) s.counts.joint += 1;
    else if (e.categoryId === CAT.ROLLED) s.counts.rolled += 1;
    else if (e.categoryId === CAT.CBD) s.counts.cbd += 1;
    else s.counts.custom += 1;

    for (const c of components(e)) {
      if (c.substance === 'tobacco') {
        addQty(s.tobacco, c.amount, c.method, method);
        if (e.categoryId === CAT.JOINT) addQty(s.tobaccoJoint, c.amount, c.method, method);
        if (e.categoryId === CAT.ROLLED) addQty(s.tobaccoRolled, c.amount, c.method, method);
      } else if (c.substance === 'cannabis') {
        if ((c.unit || 'g') !== 'g') {
          s.cbdOther[c.unit] = s.cbdOther[c.unit] || qtyAgg();
          addQty(s.cbdOther[c.unit], c.amount, c.method, method);
          continue;
        }
        // Familles jamais mélangées : CBD (et dérivés suivis par molécule), THC, non précisé.
        const cls = moleculeClass(c.molecule);
        const agg = cls === 'thc' ? s.thc : cls === 'unknown' ? s.unknownCannabis : s.cbd;
        addQty(agg, c.amount, c.method, method);
        if (cls === 'cbd' && e.categoryId === CAT.JOINT) addQty(s.cbdJoint, c.amount, c.method, method);
      } else if (c.substance === 'liquid') addQty(s.liquid, c.amount, c.method, method);
      else if (c.substance === 'units' && isNum(c.amount)) s.units[c.productKind === 'cigars' ? 'cigars' : 'cigarettes'] += c.amount;
      else if (c.substance === 'puffs' && isNum(c.amount)) s.puffs += c.amount;
    }
    const dur = sessionMinutes(e);
    if (dur != null) { s.sessions.timed += 1; s.sessions.totalMin += dur; }
    if (ctx.cost) {
      const c = ctx.cost(e);
      s.cost.entries += 1;
      s.cost.total += c.total;
      for (const k of COST_KEYS) s.cost[k] += c[k] || 0;
      s.cost.byCategory[e.categoryId] = (s.cost.byCategory[e.categoryId] || 0) + c.total;
      if (isNum(c.nicotineMg)) { s.nicotineMg += c.nicotineMg; s.nicotineN += 1; }
      if (!c.complete) s.cost.incomplete += 1;
    }
  }
  const c = s.cravings;
  c.avgIntensity = c.intensityN ? c.intensitySum / c.intensityN : null;
  c.avgDuration = c.durationN ? c.durationSum / c.durationN : null;
  return s;
}

/** Durée d'une session terminée, en minutes (traverse minuit), sinon null. */
export function sessionMinutes(e) {
  if (!e?.endAt || e.status === 'running') return null;
  const d = minutesBetween(e.at, e.endAt);
  return d != null && d >= 0 ? d : null;
}

/** Variation relative entre deux valeurs (null si non calculable). */
export function variation(cur, prev) {
  if (!isNum(cur) || !isNum(prev)) return { delta: null, pct: null };
  const delta = cur - prev;
  return { delta, pct: prev !== 0 ? delta / prev : null };
}

/** Moyenne quotidienne sur la couverture réelle. */
export function perDay(value, cov) {
  if (!cov || !isNum(value)) return null;
  return value / cov.days;
}

/**
 * Série quotidienne : [{day, value}] ; value = null avant le début du suivi
 * ou après aujourd'hui (jamais 0 par défaut).
 */
export function dailySeries(entries, range, ctx, fn) {
  const byDay = new Map();
  for (const e of entriesIn(entries, range)) {
    const d = e.at.slice(0, 10);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(e);
  }
  return daysBetween(range.start, range.end).map((day) => {
    const tracked = ctx.trackingStart && day >= ctx.trackingStart && day <= ctx.today;
    return { day, value: tracked ? fn(byDay.get(day) || [], day) : null };
  });
}

/** Fonctions de mesure réutilisables pour les séries. */
const sumComp = (list, pred) => {
  let t = 0;
  for (const e of list) if (isConsumption(e)) for (const c of components(e)) if (pred(c) && isNum(c.amount)) t += c.amount;
  return t;
};
export const measures = {
  tobaccoGrams: (list) => sumComp(list, (c) => c.substance === 'tobacco'),
  cbdGrams: (list) => sumComp(list, (c) => c.substance === 'cannabis' && (c.unit || 'g') === 'g' && moleculeClass(c.molecule) === 'cbd'),
  thcGrams: (list) => sumComp(list, (c) => c.substance === 'cannabis' && (c.unit || 'g') === 'g' && moleculeClass(c.molecule) === 'thc'),
  liquidMl: (list) => sumComp(list, (c) => c.substance === 'liquid'),
  cigarettes: (list) => sumComp(list, (c) => c.substance === 'units' && c.productKind !== 'cigars'),
  puffs: (list) => sumComp(list, (c) => c.substance === 'puffs'),
  count: (list) => list.filter(isConsumption).length,
  joints: (list) => list.filter((e) => e.categoryId === CAT.JOINT).length,
  rolled: (list) => list.filter((e) => e.categoryId === CAT.ROLLED).length,
  resisted: (list) => list.filter((e) => isCraving(e) && e.outcome !== 'consumed').length,
  cravings: (list) => list.filter(isCraving).length,
  ofCategory: (id) => (list) => list.filter((e) => isConsumption(e) && e.categoryId === id).length,
};
export const costMeasure = (costFn) => (list) => sum(list.filter(isConsumption).map((e) => costFn(e).total));

export function sum(values) {
  let t = 0;
  for (const v of values) if (isNum(v)) t += v;
  return t;
}

export function mean(values) {
  const v = values.filter(isNum);
  return { value: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null, n: v.length };
}

export function median(values) {
  const v = values.filter(isNum).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Répartition par heure (24 cases). */
export function byHour(list) {
  const out = Array(24).fill(0);
  for (const e of list) out[hourOf(e.at)] += 1;
  return out;
}

/** Moyenne par jour de la semaine (sur les jours couverts). */
export function byWeekday(list, cov) {
  const counts = Array(7).fill(0);
  const occ = Array(7).fill(0);
  if (!cov) return counts.map(() => null);
  for (const d of daysBetween(cov.start, cov.end)) occ[weekday(d)] += 1;
  for (const e of list) counts[weekday(e.at.slice(0, 10))] += 1;
  return counts.map((c, i) => (occ[i] ? c / occ[i] : null));
}

export function byDayPart(list) {
  const out = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  for (const e of list) out[dayPart(hourOf(e.at))] += 1;
  return out;
}

/** Carte de chaleur jour de semaine × heure. */
export function heatmap(list) {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const e of list) grid[weekday(e.at.slice(0, 10))][hourOf(e.at)] += 1;
  return grid;
}

/** Regroupe une série quotidienne par semaine (lundi) ou par mois. */
export function groupSeries(series, by = 'week') {
  const map = new Map();
  for (const p of series) {
    if (p.value == null) continue;
    const key = by === 'week' ? startOfWeek(p.day) : startOfMonth(p.day);
    const slot = map.get(key) || { key, value: 0, days: 0 };
    slot.value += p.value; slot.days += 1;
    map.set(key, slot);
  }
  return [...map.values()];
}

/** Analyse spécifique des joints tabac + CBD. */
export function jointAnalysis(entries, range, ctx) {
  const cov = coverage(range, ctx.trackingStart, ctx.today);
  const joints = entriesIn(entries, cov).filter((e) => e.categoryId === CAT.JOINT);
  const tob = mean(joints.map((j) => j.tobacco?.grams));
  const cbd = mean(joints.map((j) => j.cbd?.amount));
  const costs = ctx.cost ? joints.map((j) => ctx.cost(j)).filter((c) => c.complete).map((c) => c.total) : [];
  const ratios = joints
    .filter((j) => isNum(j.tobacco?.grams) && isNum(j.cbd?.amount) && j.tobacco.grams + j.cbd.amount > 0)
    .map((j) => ({ day: j.at.slice(0, 10), cbdShare: j.cbd.amount / (j.tobacco.grams + j.cbd.amount) }));
  const weighed = joints.filter((j) => j.tobacco?.method === 'weighed' && j.cbd?.method === 'weighed').length;
  return {
    count: joints.length,
    coverage: cov,
    avgTobacco: tob,
    avgCbd: cbd,
    avgCost: mean(costs),
    weighedCount: weighed,
    ratios,
    avgCbdShare: mean(ratios.map((r) => r.cbdShare)),
    hours: byHour(joints),
    tobaccoValues: joints.map((j) => j.tobacco?.grams).filter(isNum),
    cbdValues: joints.map((j) => j.cbd?.amount).filter(isNum),
  };
}

/** Moyenne et nombre d'observations pour une catégorie. */
export function avgCostByCategory(entries, range, ctx, categoryId) {
  const cov = coverage(range, ctx.trackingStart, ctx.today);
  const list = entriesIn(entries, cov).filter((e) => e.categoryId === categoryId);
  const complete = list.map((e) => ctx.cost(e)).filter((c) => c.complete);
  return { ...mean(complete.map((c) => c.total)), total: list.length };
}

/** Histogramme simple. */
export function histogram(values, step) {
  if (!values.length) return [];
  const max = Math.max(...values);
  const bins = [];
  for (let x = 0; x <= max + 1e-9; x += step) bins.push({ from: x, to: x + step, count: 0 });
  for (const v of values) {
    const i = Math.min(bins.length - 1, Math.floor((v + 1e-9) / step));
    bins[i].count += 1;
  }
  return bins;
}

/** Dernier événement satisfaisant un prédicat. */
export function lastWhere(entries, pred) {
  let best = null;
  for (const e of entries) if (pred(e) && (!best || e.at > best.at)) best = e;
  return best;
}

/** Plage de n jours se terminant à `end`. */
export function lastDays(end, n) {
  return { start: addDays(end, -(n - 1)), end, days: n };
}

/** Grammes par molécule (CBD, 10-OH-HHC, HHC…) — jamais additionnés au tabac. */
export function byMolecule(entries, range, ctx, labelFn) {
  const cov = coverage(range, ctx.trackingStart, ctx.today);
  const map = new Map();
  for (const e of entriesIn(entries, cov)) {
    if (!isConsumption(e) || !e.cbd || (e.cbd.unit || 'g') !== 'g' || !isNum(e.cbd.amount)) continue;
    const k = labelFn(e.cbd);
    map.set(k, (map.get(k) || 0) + e.cbd.amount);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}
