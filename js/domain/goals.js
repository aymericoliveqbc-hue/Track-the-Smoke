// Référence, objectifs personnalisés et parcours d'arrêt.
//
//  - Aucun calendrier n'est imposé : l'utilisateur fixe ses cibles et paliers.
//  - Modifier un objectif conserve l'historique (revisions) et les données.
//  - Une consommation après un arrêt n'efface jamais les progrès : on compte
//    les jours sans, on ne remet aucun compteur à zéro.

import { addDays, diffDays, daysBetween, minutesOfDay, nowLocal, minutesSince, minutesBetween } from '../core/dates.js';
import { isNum } from '../core/format.js';
import { summarize, coverage, entriesIn, isConsumption, lastWhere, mean } from './stats.js';
import { sinceLastConsumption } from './sessions.js';
import { uid } from './models.js';

/* ------------------------------------------------------------------ */
/* Référence (baseline)                                                */
/* ------------------------------------------------------------------ */

export function computeBaseline(entries, range, ctx, source = 'observation') {
  const s = summarize(entries, range, ctx);
  const cov = s.coverage;
  if (!cov) return null;
  const d = cov.days;
  const firstTimes = firstConsumptionTimes(entries, cov);
  return {
    from: cov.start, to: cov.end, days: d, source,
    computedAt: new Date().toISOString(),
    tobaccoPerDay: s.tobacco.total / d,
    cbdPerDay: s.cbd.total / d,
    jointsPerDay: s.counts.joint / d,
    rolledPerDay: s.counts.rolled / d,
    consumptionsPerDay: s.counts.total / d,
    costPerDay: s.cost.total / d,
    tobaccoCostPerDay: s.cost.tobacco / d,
    cbdCostPerDay: s.cost.cbd / d,
    cravingsPerDay: s.cravings.total / d,
    resistedShare: s.cravings.total ? s.cravings.resisted / s.cravings.total : null,
    firstHourMin: mean(firstTimes).value,
    missingQuantities: s.tobacco.missing + s.cbd.missing,
    incompleteCosts: s.cost.incomplete,
  };
}

function firstConsumptionTimes(entries, cov) {
  const first = new Map();
  for (const e of entriesIn(entries, cov)) {
    if (!isConsumption(e)) continue;
    const d = e.at.slice(0, 10);
    const m = minutesOfDay(e.at);
    if (m < 4 * 60) continue; // une consommation de nuit n'est pas « la première de la journée »
    if (!first.has(d) || m < first.get(d)) first.set(d, m);
  }
  return [...first.values()];
}

/** État de la phase d'observation. */
export function observationStatus(settings, today) {
  const o = settings.observation;
  if (!o?.enabled || !o.startDate) return null;
  const end = addDays(o.startDate, o.days - 1);
  const elapsed = Math.min(o.days, diffDays(o.startDate, today) + 1);
  return { start: o.startDate, end, days: o.days, elapsed, done: today > end, remaining: Math.max(0, diffDays(today, end)) };
}

/* ------------------------------------------------------------------ */
/* Objectifs                                                           */
/* ------------------------------------------------------------------ */

export const GOAL_METRICS = [
  { id: 'tobacco_g', label: 'Tabac', unit: 'g / jour', dir: 'down', track: 'tobacco', base: 'tobaccoPerDay' },
  { id: 'cbd_g', label: 'CBD', unit: 'g / jour', dir: 'down', track: 'cbd', base: 'cbdPerDay' },
  { id: 'joints', label: 'Joints', unit: 'joints / jour', dir: 'down', track: 'cbd', base: 'jointsPerDay' },
  { id: 'rolled', label: 'Roulées', unit: 'roulées / jour', dir: 'down', track: 'tobacco', base: 'rolledPerDay' },
  { id: 'spend', label: 'Budget', unit: '€ / semaine', dir: 'down', track: 'budget', base: 'costPerDay', weekly: true },
  { id: 'resisted_share', label: 'Envies résistées', unit: '% des envies', dir: 'up', track: 'cravings', base: 'resistedShare', pct: true },
  { id: 'first_hour', label: 'Première consommation', unit: 'heure', dir: 'up', track: 'habits', base: 'firstHourMin', time: true },
];

export const metricOf = (id) => {
  if (id?.startsWith('method:')) return { id, label: `Consommations · ${id.slice(7)}`, unit: '/ jour', dir: 'down', track: 'method', base: null, methodId: id.slice(7) };
  if (id === 'interval') return { id, label: 'Temps entre deux consommations', unit: 'min', dir: 'up', track: 'habits', base: null, minutes: true };
  return GOAL_METRICS.find((m) => m.id === id);
};

export function newGoal(metric, target, startDate) {
  return {
    id: uid('goal'), metric, target, startDate, active: true, note: '',
    steps: [], revisions: [], createdAt: new Date().toISOString(),
  };
}

/** Modifie un objectif en archivant la version précédente. */
export function reviseGoal(goal, patch) {
  const snapshot = { at: new Date().toISOString(), target: goal.target, steps: goal.steps, note: goal.note, active: goal.active };
  return { ...goal, ...patch, revisions: [...(goal.revisions || []), snapshot] };
}

/** Cible applicable à une date (palier le plus récent déjà atteint). */
export function targetAt(goal, day) {
  // Paliers : le plus récent dont la date est passée ; avant le premier palier,
  // c'est le premier palier qui s'applique ; sans palier, la cible finale.
  const steps = [...(goal.steps || [])].filter((s) => s.date && isNum(s.target)).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!steps.length) return goal.target;
  let current = steps[0];
  for (const s of steps) if (s.date <= day) current = s;
  return current.target;
}

/** Valeur mesurée d'une métrique sur une plage. */
export function measureMetric(metric, entries, range, ctx) {
  const s = summarize(entries, range, ctx);
  const cov = s.coverage;
  if (!cov) return { value: null, coverage: null };
  const d = cov.days;
  switch (metric) {
    case 'tobacco_g': return { value: s.tobacco.total / d, coverage: cov, missing: s.tobacco.missing };
    case 'cbd_g': return { value: s.cbd.total / d, coverage: cov, missing: s.cbd.missing };
    case 'joints': return { value: s.counts.joint / d, coverage: cov };
    case 'rolled': return { value: s.counts.rolled / d, coverage: cov };
    case 'spend': return { value: (s.cost.total / d) * 7, coverage: cov, missing: s.cost.incomplete };
    case 'resisted_share': return { value: s.cravings.total ? s.cravings.resisted / s.cravings.total : null, coverage: cov, n: s.cravings.total };
    case 'first_hour': { const m = mean(firstConsumptionTimes(entries, cov)); return { value: m.value, coverage: cov, n: m.n }; }
    case 'interval': {
      const starts = entriesIn(entries, cov).filter(isConsumption).map((e) => e.at).sort();
      const iv = [];
      for (let i = 1; i < starts.length; i++) { const d = minutesBetween(starts[i - 1], starts[i]); if (d != null && d < 16 * 60) iv.push(d); }
      const m = mean(iv); return { value: m.value, coverage: cov, n: m.n };
    }
    default:
      if (metric?.startsWith('method:')) return { value: (s.counts.byCategory[metric.slice(7)] || 0) / d, coverage: cov };
      return { value: null, coverage: cov };
  }
}

export function baselineValue(metric, baseline) {
  if (!baseline) return null;
  const m = metricOf(metric);
  if (!m) return null;
  const v = baseline[m.base];
  if (!isNum(v)) return null;
  return m.weekly ? v * 7 : v;
}

/** Évaluation bienveillante d'un objectif sur les 7 derniers jours. */
export function evaluateGoal(goal, entries, ctx, baseline) {
  const m = metricOf(goal.metric);
  const range = { start: addDays(ctx.today, -6), end: ctx.today };
  const cur = measureMetric(goal.metric, entries, range, ctx);
  const target = targetAt(goal, ctx.today);
  const base = baselineValue(goal.metric, baseline);
  let reached = null, progress = null;
  if (isNum(cur.value) && isNum(target)) {
    reached = m.dir === 'down' ? cur.value <= target + 1e-9 : cur.value >= target - 1e-9;
    if (isNum(base) && base !== target) {
      progress = (m.dir === 'down' ? base - cur.value : cur.value - base) / Math.abs(base - target);
      progress = Math.max(0, Math.min(1, progress));
    }
  }
  return { metric: m, current: cur, target, baseline: base, reached, progress };
}

/* ------------------------------------------------------------------ */
/* Parcours d'arrêt                                                    */
/* ------------------------------------------------------------------ */

export const hasSubstance = (kind) => (e) =>
  isConsumption(e) && (kind === 'tobacco' ? !!e.tobacco : !!e.cbd);

/**
 * Statistiques d'un parcours (tabac ou CBD).
 * Ne remet jamais rien à zéro : on rapporte des jours sans, des quantités
 * évitées par rapport à la référence et le temps écoulé depuis la dernière.
 */
export function journeyStats(kind, journey, entries, ctx, baseline, now = nowLocal()) {
  const pred = hasSubstance(kind);
  const { last, running, sinceMin: sinceLastMin } = sinceLastConsumption(entries, pred, now);
  const out = { kind, status: journey?.status || 'tracking', last, running, sinceLastMin };

  const quit = journey?.quitDate;
  if (quit && quit <= ctx.today) {
    const days = daysBetween(quit, ctx.today);
    const after = entries.filter((e) => pred(e) && e.at.slice(0, 10) >= quit);
    const daysWith = new Set(after.map((e) => e.at.slice(0, 10)));
    out.quit = {
      date: quit,
      days: days.length,
      daysWithout: days.length - daysWith.size,
      occurrences: after.length,
      // Plus longue série de jours sans — informative, jamais « remise à zéro ».
      bestStreak: bestStreak(days, daysWith),
    };
    const consumedQty = after.reduce((t, e) => t + (kind === 'tobacco' ? (e.tobacco?.grams || 0) : ((e.cbd?.unit || 'g') === 'g' ? e.cbd?.amount || 0 : 0)), 0);
    const consumedCost = after.reduce((t, e) => { const c = ctx.cost(e); return t + (kind === 'tobacco' ? c.tobacco || 0 : c.cbd || 0); }, 0);
    if (baseline) {
      const perDay = kind === 'tobacco' ? baseline.tobaccoPerDay : baseline.cbdPerDay;
      const costPerDay = kind === 'tobacco' ? baseline.tobaccoCostPerDay : baseline.cbdCostPerDay;
      out.quit.avoidedQty = Math.max(0, perDay * days.length - consumedQty);
      out.quit.avoidedCost = Math.max(0, costPerDay * days.length - consumedCost);
      out.quit.avoidedUnits = kind === 'tobacco'
        ? Math.max(0, baseline.rolledPerDay * days.length - after.filter((e) => e.categoryId === 'rolled').length)
        : Math.max(0, baseline.jointsPerDay * days.length - after.filter((e) => e.categoryId === 'joint').length);
    }
  }
  return out;
}

function bestStreak(days, daysWith) {
  let best = 0, cur = 0;
  for (const d of days) { if (daysWith.has(d)) cur = 0; else { cur += 1; best = Math.max(best, cur); } }
  return best;
}

/**
 * Économies estimées depuis la fin de la référence, à partir des
 * dépenses réellement enregistrées (≠ simulateur, qui est théorique).
 */
export function realizedSavings(entries, baseline, ctx) {
  if (!baseline) return null;
  const start = addDays(baseline.to, 1);
  if (start > ctx.today) return null;
  const range = { start, end: ctx.today };
  const s = summarize(entries, range, ctx);
  if (!s.coverage) return null;
  const expected = baseline.costPerDay * s.coverage.days;
  return { days: s.coverage.days, expected, actual: s.cost.total, saved: expected - s.cost.total, incomplete: s.cost.incomplete };
}

export { coverage };

/**
 * Parcours d'une méthode (mode réduction ou arrêt) : dernière fois, jours
 * sans depuis l'arrêt, plus longue série. Rien n'est remis à zéro.
 */
export function methodJourney(categoryId, mode, entries, ctx, now = nowLocal()) {
  const pred = (e) => isConsumption(e) && e.categoryId === categoryId;
  const { last, running, sinceMin } = sinceLastConsumption(entries, pred, now);
  const out = { categoryId, mode: mode?.mode || 'free', last, running, sinceLastMin: sinceMin };
  const quit = mode?.mode === 'quit' ? mode.quitDate : null;
  if (quit && quit <= ctx.today) {
    const days = daysBetween(quit, ctx.today);
    const after = entries.filter((e) => pred(e) && e.at.slice(0, 10) >= quit);
    const withC = new Set(after.map((e) => e.at.slice(0, 10)));
    out.quit = { date: quit, days: days.length, daysWithout: days.length - withC.size, occurrences: after.length, bestStreak: bestStreak(days, withC) };
  }
  const r7 = summarize(entries, { start: addDays(ctx.today, -6), end: ctx.today }, ctx);
  const p7 = summarize(entries, { start: addDays(ctx.today, -13), end: addDays(ctx.today, -7) }, ctx);
  out.last7 = r7.coverage ? (r7.counts.byCategory[categoryId] || 0) / r7.coverage.days : null;
  out.prev7 = p7.coverage ? (p7.counts.byCategory[categoryId] || 0) / p7.coverage.days : null;
  return out;
}
