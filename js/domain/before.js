// « Avant l'app » : dépenses habituelles déclarées approximativement,
// puis comparées en continu aux dépenses réelles enregistrées.
//
//  avant / mois = paquets de tabac × prix du paquet
//               + grammes de CBD × prix au gramme
//               + feuilles & filtres (€ / mois)
//  économisé    = avant / jour × jours écoulés − dépenses réelles
//  (la journée en cours compte au prorata de l'heure : l'économie « monte »
//   en direct si l'on consomme moins que d'habitude).

import { diffDays } from '../core/dates.js';
import { isNum, round2 } from '../core/format.js';
import { summarize, entriesIn, isConsumption, coverage } from './stats.js';

export const DAYS_PER_MONTH = 30.44;

export function emptyBefore() {
  return {
    tobaccoPacksPerMonth: null, tobaccoPackPrice: null, tobaccoPackSize: null,
    cbdGramsPerMonth: null, cbdPricePerGram: null,
    accessoriesPerMonth: null, startDate: null,
  };
}

const n = (x) => (isNum(x) && x > 0 ? x : 0);

/** Budget mensuel « avant » et quantités équivalentes. */
export function beforeMonthly(b) {
  if (!b) return null;
  const tobacco = n(b.tobaccoPacksPerMonth) * n(b.tobaccoPackPrice);
  const cbd = n(b.cbdGramsPerMonth) * n(b.cbdPricePerGram);
  const accessories = n(b.accessoriesPerMonth);
  const total = tobacco + cbd + accessories;
  if (!total) return null;
  return {
    tobacco: round2(tobacco), cbd: round2(cbd), accessories: round2(accessories), total: round2(total),
    perDay: total / DAYS_PER_MONTH,
    tobaccoGramsPerMonth: n(b.tobaccoPacksPerMonth) * n(b.tobaccoPackSize) || null,
    cbdGramsPerMonth: n(b.cbdGramsPerMonth) || null,
  };
}

/**
 * Économies depuis le début, en direct.
 * @param nowFraction fraction de la journée en cours écoulée (0..1)
 */
export function beforeSavings(b, entries, ctx, nowFraction = 1, { includeAccessories = true } = {}) {
  const m = beforeMonthly(b);
  const start = b?.startDate || ctx.trackingStart;
  if (!m || !start || start > ctx.today) return null;
  const s = summarize(entries, { start, end: ctx.today }, ctx);
  const fullDays = diffDays(start, ctx.today); // jours terminés
  const days = fullDays + Math.max(0, Math.min(1, nowFraction));
  // Comparer ce qui est comparable : sans prix connus pour les feuilles et
  // filtres, ils sont retirés des deux côtés.
  const perDay = includeAccessories ? m.perDay : (m.total - m.accessories) / DAYS_PER_MONTH;
  const expected = perDay * days;
  const actual = includeAccessories ? s.cost.total : s.cost.total - s.cost.accessories;
  // Incomplet seulement si le prix du tabac ou du CBD manque.
  let incomplete = 0;
  for (const e of entriesIn(entries, coverage({ start, end: ctx.today }, ctx.trackingStart, ctx.today))) {
    if (!isConsumption(e)) continue;
    const c = ctx.cost(e);
    if (c.missing.some((x) => /tabac|CBD/.test(x))) incomplete += 1;
  }
  return {
    start, days, fullDays: fullDays + 1,
    expected, actual, saved: expected - actual,
    incomplete, includeAccessories,
    tobaccoGrams: s.tobacco.total, cbdGrams: s.cbd.total,
    expectedTobaccoGrams: m.tobaccoGramsPerMonth ? (m.tobaccoGramsPerMonth / DAYS_PER_MONTH) * days : null,
    expectedCbdGrams: m.cbdGramsPerMonth ? (m.cbdGramsPerMonth / DAYS_PER_MONTH) * days : null,
  };
}

/** Rythme mensuel actuel mesuré (sur les n derniers jours suivis). */
export function currentMonthly(entries, ctx, lastDays = 14) {
  const start = ctx.trackingStart && ctx.trackingStart > shift(ctx.today, -(lastDays - 1)) ? ctx.trackingStart : shift(ctx.today, -(lastDays - 1));
  const s = summarize(entries, { start, end: ctx.today }, ctx);
  if (!s.coverage) return null;
  return { total: (s.cost.total / s.coverage.days) * DAYS_PER_MONTH, days: s.coverage.days, incomplete: s.cost.incomplete };
}

function shift(day, k) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + k)).toISOString().slice(0, 10);
}
