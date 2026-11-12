// Sessions : début / fin, durées, intervalles, temps sans consommation.
//
// Distinction stricte :
//  - temps passé à consommer   = Σ (fin − début) des sessions chronométrées ;
//  - intervalle entre consommations = début(n+1) − début(n) ;
//  - temps sans consommation   = début(n+1) − fin(n) (ou début(n) si pas de fin).
// Une session « en cours » n'entre dans aucune durée.

import { minutesBetween } from '../core/dates.js';
import { coverage, entriesIn, isConsumption, sessionMinutes, mean } from './stats.js';

export const isRunning = (e) => e.kind === 'consumption' && e.status === 'running';

export function runningSessions(entries) {
  return entries.filter(isRunning).sort((a, b) => (a.at < b.at ? -1 : 1));
}

/** Session en cours « identique » (même méthode et même produit). */
export function duplicateRunning(entries, categoryId, productId = null) {
  return entries.find((e) => isRunning(e) && e.categoryId === categoryId && (productId == null || productIdOf(e) === productId)) || null;
}

export function productIdOf(e) {
  return e.units?.productId || e.liquid?.productId || e.puffs?.productId || e.tobacco?.productId || e.cbd?.productId || null;
}

/** Termine une session : maintenant, ou à une heure donnée (jamais avant le début). */
export function finishSession(e, endAt, { completion = 'done' } = {}) {
  const d = minutesBetween(e.at, endAt);
  if (d == null || d < 0) throw new Error('L’heure de fin doit être après le début.');
  return { ...e, endAt, status: 'done', completion: e.completion || completion };
}

export function sessionStats(entries, range, ctx, { categoryLabel = (id) => id, productLabel = (id) => id } = {}) {
  const cov = coverage(range, ctx.trackingStart, ctx.today);
  if (!cov) return null;
  const list = entriesIn(entries, cov).filter((e) => isConsumption(e) && e.status !== 'running').sort((a, b) => (a.at < b.at ? -1 : 1));
  const timed = list.filter((e) => sessionMinutes(e) != null);
  const group = (keyFn, labelFn) => {
    const m = new Map();
    for (const e of timed) {
      const k = keyFn(e); if (!k) continue;
      const slot = m.get(k) || { id: k, label: labelFn(k), durations: [] };
      slot.durations.push(sessionMinutes(e));
      m.set(k, slot);
    }
    return [...m.values()].map((x) => ({ ...x, avg: mean(x.durations).value, n: x.durations.length, total: x.durations.reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.n - a.n);
  };
  const intervals = [];
  const gaps = [];
  for (let i = 1; i < list.length; i++) {
    const prev = list[i - 1]; const cur = list[i];
    const iv = minutesBetween(prev.at, cur.at);
    if (iv != null && iv >= 0) intervals.push(iv);
    const gap = minutesBetween(prev.endAt && prev.status !== 'running' ? prev.endAt : prev.at, cur.at);
    if (gap != null && gap >= 0) gaps.push(gap);
  }
  const totalMin = timed.reduce((t, e) => t + sessionMinutes(e), 0);
  // Durée par jour : une session qui traverse minuit est rattachée à son jour de début.
  const byDay = new Map();
  for (const e of timed) byDay.set(e.at.slice(0, 10), (byDay.get(e.at.slice(0, 10)) || 0) + sessionMinutes(e));
  return {
    coverage: cov,
    count: list.length,
    timed: timed.length,
    totalMin,
    perDayMin: totalMin / cov.days,
    perWeekMin: (totalMin / cov.days) * 7,
    avgDuration: mean(timed.map(sessionMinutes)),
    byMethod: group((e) => e.categoryId, categoryLabel),
    byProduct: group((e) => productIdOf(e), productLabel),
    avgInterval: mean(intervals),
    avgGap: mean(gaps),
    longestGap: gaps.length ? Math.max(...gaps) : null,
    byDay,
  };
}
