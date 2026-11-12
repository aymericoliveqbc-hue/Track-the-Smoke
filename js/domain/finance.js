// Tableau de bord financier : dépenses, coûts par méthode et par produit,
// économies RÉALISÉES (référence « avant » vs dépenses réelles), dépenses
// ÉVITÉES après un arrêt (estimation), économies POTENTIELLES (simulateur).
// Une projection n'est jamais présentée comme une économie réalisée.

import { addDays, diffDays, startOfMonth, weekday } from '../core/dates.js';
import { isNum } from '../core/format.js';
import { summarize, coverage, entriesIn, isConsumption } from './stats.js';
import { components } from './methods.js';
import { priceAt, resolveProduct, costKey } from './costs.js';
import { beforeMonthly, DAYS_PER_MONTH } from './before.js';

export const COST_LABELS = {
  tobacco: 'Tabac', cbd: 'CBD', thc: 'THC', unknown: 'Cannabinoïde non précisé', liquid: 'E-liquides',
  cigarettes: 'Cigarettes', cigars: 'Cigares', puffs: 'Puffs', accessories: 'Feuilles & filtres',
};

/** Dépenses aujourd'hui / 7 j / mois / année, moyennes quotidienne et mensuelle. */
export function financeOverview(entries, ctx) {
  const t = ctx.today;
  const spend = (start) => summarize(entries, { start, end: t }, ctx);
  const all = ctx.trackingStart ? spend(ctx.trackingStart) : null;
  const avgDaily = all?.coverage ? all.cost.total / all.coverage.days : null;
  return {
    today: spend(t).cost.total,
    week: spend(addDays(t, -6)).cost.total,
    month: spend(startOfMonth(t)).cost.total,
    year: spend(`${t.slice(0, 4)}-01-01`).cost.total,
    avgDaily, avgMonthly: avgDaily != null ? avgDaily * DAYS_PER_MONTH : null,
    trackedDays: all?.coverage?.days || 0,
    incomplete: all?.cost.incomplete || 0,
  };
}

/** Ventilation des coûts d'une synthèse (postes non nuls, triés). */
export function budgetSplit(s) {
  return Object.keys(COST_LABELS).map((k) => ({ id: k, label: COST_LABELS[k], value: s.cost[k] || 0 }))
    .filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
}

/** Coût et quantité consommés par produit sur une période. */
export function costByProduct(entries, range, ctx, { index, settings }) {
  const cov = coverage(range, ctx.trackingStart, ctx.today);
  const out = new Map();
  for (const e of entriesIn(entries, cov)) {
    if (!isConsumption(e)) continue;
    for (const c of components(e)) {
      const pid = resolveProduct(settings, c.productKind, c.productId);
      if (!pid) continue;
      const slot = out.get(pid) || { productId: pid, cost: 0, qty: 0, unit: c.unit, uses: 0, unknownQty: 0, key: costKey(c) };
      slot.uses += 1;
      if (isNum(c.amount)) {
        slot.qty += c.amount;
        const { price } = priceAt(index, pid, e.at.slice(0, 10));
        if (price != null) slot.cost += c.amount * price;
      } else slot.unknownQty += 1;
      out.set(pid, slot);
    }
  }
  return [...out.values()].sort((a, b) => b.cost - a.cost);
}

export const WINDOWS = [
  { days: 7, label: '7 jours' }, { days: 30, label: '30 jours' }, { days: 90, label: '90 jours' },
  { days: 182, label: '6 mois' }, { days: 365, label: '1 an' },
];

/**
 * Économies RÉALISÉES sur des fenêtres glissantes, par rapport à la
 * référence « avant l'app ». Seuls les jours suivis comptent ; une fenêtre
 * plus longue que le suivi est signalée comme partielle.
 */
export function realizedWindows(before, entries, ctx, nowFraction = 1) {
  const m = beforeMonthly(before);
  const start0 = before?.startDate || ctx.trackingStart;
  if (!m || !start0) return [];
  return WINDOWS.map((w) => {
    let start = addDays(ctx.today, -(w.days - 1));
    const partial = start < start0;
    if (partial) start = start0;
    if (start > ctx.today) return { ...w, available: false };
    const s = summarize(entries, { start, end: ctx.today }, ctx);
    const days = diffDays(start, ctx.today) + Math.max(0, Math.min(1, nowFraction));
    const expected = m.perDay * days;
    return { ...w, available: true, partial, coveredDays: diffDays(start, ctx.today) + 1, expected, actual: s.cost.total, saved: expected - s.cost.total };
  });
}

/**
 * Dépenses ÉVITÉES (estimation) pour une méthode arrêtée : coût quotidien
 * moyen des 30 jours suivis avant l'arrêt × jours depuis − dépenses réelles
 * de la méthode depuis. null si pas de données avant l'arrêt.
 */
export function avoidedSinceQuit(categoryId, quitDate, entries, ctx) {
  if (!quitDate || quitDate > ctx.today) return null;
  const before = summarize(entries.filter((e) => e.categoryId === categoryId), { start: addDays(quitDate, -30), end: addDays(quitDate, -1) }, ctx);
  if (!before.coverage || !before.counts.total) return { insufficient: true };
  const refPerDay = before.cost.total / before.coverage.days;
  const refCountPerDay = before.counts.total / before.coverage.days;
  const after = summarize(entries.filter((e) => e.categoryId === categoryId), { start: quitDate, end: ctx.today }, ctx);
  const days = diffDays(quitDate, ctx.today) + 1;
  return {
    refPerDay, refCountPerDay, days,
    avoidedCost: Math.max(0, refPerDay * days - after.cost.total),
    avoidedCount: Math.max(0, refCountPerDay * days - after.counts.total),
    occurrences: after.counts.total, basedOnDays: before.coverage.days,
  };
}

/** Semaine vs week-end : moyenne par jour d'une mesure. */
export function weekSplit(entries, range, ctx, measure) {
  const cov = coverage(range, ctx.trackingStart, ctx.today);
  if (!cov) return null;
  const acc = { weekday: { v: 0, d: 0 }, weekend: { v: 0, d: 0 } };
  const byDay = new Map();
  for (const e of entriesIn(entries, cov)) { const d = e.at.slice(0, 10); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(e); }
  for (let d = cov.start; d <= cov.end; d = addDays(d, 1)) {
    const k = weekday(d) >= 5 ? 'weekend' : 'weekday';
    acc[k].d += 1; acc[k].v += measure(byDay.get(d) || []);
  }
  return {
    weekday: acc.weekday.d ? acc.weekday.v / acc.weekday.d : null, weekdayDays: acc.weekday.d,
    weekend: acc.weekend.d ? acc.weekend.v / acc.weekend.d : null, weekendDays: acc.weekend.d,
  };
}

/** Méthode la plus utilisée réellement (sans jamais modifier la préférence déclarée). */
export function mostUsedMethod(entries, range, ctx) {
  const s = summarize(entries, range, ctx);
  const top = Object.entries(s.counts.byCategory).sort((a, b) => b[1] - a[1]);
  return { top: top[0]?.[0] || null, split: top, total: s.counts.total };
}
