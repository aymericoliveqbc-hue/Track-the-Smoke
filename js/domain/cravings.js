// Analyse des envies (résistées ou suivies d'une consommation).
// Une envie n'est jamais un échec : on décrit, on ne juge pas.

import { coverage, entriesIn, isCraving, byHour, mean, dailySeries } from './stats.js';
import { TRIGGERS, labelOf } from './models.js';
import { isNum } from '../core/format.js';

export function cravingStats(entries, range, ctx) {
  const cov = coverage(range, ctx.trackingStart, ctx.today);
  const list = entriesIn(entries, cov).filter(isCraving);
  const resisted = list.filter((c) => c.outcome !== 'consumed');
  const consumed = list.filter((c) => c.outcome === 'consumed');
  const triggers = new Map();
  for (const c of list) {
    const k = c.trigger || 'unknown';
    triggers.set(k, (triggers.get(k) || 0) + 1);
  }
  const topTriggers = [...triggers.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ id, label: id === 'unknown' ? 'Non renseigné' : labelOf(TRIGGERS, id) || id, count }));
  const hours = byHour(list);
  const intensityByHour = Array(24).fill(null).map((_, h) => mean(list.filter((c) => Number(c.at.slice(11, 13)) === h).map((c) => c.intensity)));
  const hardest = hours
    .map((count, h) => ({ h, count, intensity: intensityByHour[h].value }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count || (b.intensity ?? 0) - (a.intensity ?? 0))
    .slice(0, 3);
  return {
    coverage: cov,
    total: list.length,
    resisted: resisted.length,
    consumed: consumed.length,
    perDay: cov ? list.length / cov.days : null,
    resistedPerDay: cov ? resisted.length / cov.days : null,
    resistedShare: list.length ? resisted.length / list.length : null,
    avgIntensity: mean(list.map((c) => c.intensity)),
    avgDuration: mean(list.map((c) => c.durationMin)),
    avgIntensityResisted: mean(resisted.map((c) => c.intensity)),
    hours, hardest, topTriggers,
    byProduct: {
      tobacco: list.filter((c) => c.product === 'tobacco').length,
      cbd: list.filter((c) => c.product === 'cbd').length,
      both: list.filter((c) => c.product === 'both').length,
    },
  };
}

/** Série quotidienne envies résistées / suivies d'une consommation. */
export function cravingSeries(entries, range, ctx) {
  return dailySeries(entries, range, ctx, (list) => {
    const cr = list.filter(isCraving);
    return { resisted: cr.filter((c) => c.outcome !== 'consumed').length, consumed: cr.filter((c) => c.outcome === 'consumed').length };
  });
}

export function intensityLabel(i) {
  if (!isNum(i)) return '';
  if (i <= 3) return 'légère';
  if (i <= 6) return 'modérée';
  if (i <= 8) return 'forte';
  return 'très forte';
}
