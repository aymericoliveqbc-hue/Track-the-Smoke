// Données envoyées à l'assistant d'analyse IA (facultatif).
//
// Règles :
//  - uniquement des agrégats calculés par l'application, jamais d'entrée
//    brute, de note libre, de nom de produit, de lieu ou d'horodatage précis ;
//  - une valeur absente reste null : l'IA ne doit pas la deviner ;
//  - l'utilisateur voit exactement cet objet avant tout envoi.

import { addDays, diffDays } from '../core/dates.js';
import { isNum, round1, round2 } from '../core/format.js';
import { summarize, entriesIn, coverage, isConsumption, byDayPart } from './stats.js';
import { cravingStats } from './cravings.js';
import { sessionStats } from './sessions.js';
import { sleepStats } from './sleep.js';
import { methodOf } from './methods.js';

const r1 = (x) => (isNum(x) ? round1(x) : null);
const r2 = (x) => (isNum(x) ? round2(x) : null);
const MODE_LABELS = { free: 'suivi libre', reduce: 'réduction', quit: 'arrêt' };
const PART_LABELS = { morning: 'matin', afternoon: 'après-midi', evening: 'soirée', night: 'nuit' };

/** Quantité + part de fiabilité (pesée / calculée ou estimée). */
function qty(agg, days) {
  if (!agg || !agg.lines) return null;
  const known = agg.total;
  return {
    total: r2(known),
    parJour: days ? r2(known / days) : null,
    partPesee: known > 0 ? r2(agg.weighed / known) : null,
    saisiesSansQuantite: agg.missing,
  };
}

function periodBlock(s, days) {
  return {
    consommations: s.counts.total,
    consommationsParJour: days ? r2(s.counts.total / days) : null,
    exceptionnelles: s.counts.exceptional,
    tabac_g: qty(s.tobacco, days),
    cbd_g: qty(s.cbd, days),
    thc_g: qty(s.thc, days),
    cannabinoideNonPrecise_g: qty(s.unknownCannabis, days),
    eLiquide_ml: qty(s.liquid, days),
    cigarettes: s.units.cigarettes || null,
    cigares: s.units.cigars || null,
    bouffees: s.puffs || null,
    depense: r2(s.cost.total),
    consommationsSansPrix: s.cost.incomplete,
  };
}

function variations(cur, d1, prev, d0) {
  const pct = (a, b) => (isNum(a) && isNum(b) && b > 0 ? Math.round(((a / d1 - b / d0) / (b / d0)) * 100) : null);
  return {
    consommations: pct(cur.counts.total, prev.counts.total),
    tabac: pct(cur.tobacco.total, prev.tobacco.total),
    cbd: pct(cur.cbd.total, prev.cbd.total),
    depense: pct(cur.cost.total, prev.cost.total),
    enviesResistees: pct(cur.cravings.resisted, prev.cravings.resisted),
  };
}

/**
 * @param data { entries, nights, categories, settings }
 * @param range { start, end }
 * @param ctx  { cost, trackingStart, today }
 * @param opts { currency }
 */
export function buildAnalysisPayload(data, range, ctx, opts = {}) {
  const cov = coverage(range, ctx.trackingStart, ctx.today);
  if (!cov) return null;
  const days = cov.days;
  const prevRange = { start: addDays(cov.start, -days), end: addDays(cov.start, -1) };
  const prevCov = coverage(prevRange, ctx.trackingStart, ctx.today);
  // Libellés génériques du catalogue : le nom d'une méthode personnalisée peut contenir du texte privé.
  const custom = new Map();
  const labelOf = (id) => {
    const m = methodOf(id);
    if (m) return m.short;
    if (!custom.has(id)) custom.set(id, `Méthode personnalisée ${custom.size + 1}`);
    return custom.get(id);
  };

  const cur = summarize(data.entries, cov, ctx);
  const prev = prevCov ? summarize(data.entries, prevCov, ctx) : null;

  const list = entriesIn(data.entries, cov).filter(isConsumption);
  const parts = byDayPart(list);
  const cs = cravingStats(data.entries, cov, ctx);
  const ss = sessionStats(data.entries, cov, ctx, { categoryLabel: labelOf });
  const sl = sleepStats(data.nights || [], cov);
  const weekend = list.filter((e) => { const d = new Date(`${e.at.slice(0, 10)}T12:00:00Z`).getUTCDay(); return d === 0 || d === 6; }).length;

  const habits = data.settings?.habits || {};
  const modes = Object.entries(habits.modes || {}).map(([id, m]) => ({
    methode: labelOf(id),
    mode: MODE_LABELS[m?.mode] || 'suivi libre',
    joursDepuisArret: m?.mode === 'quit' && m.quitDate ? Math.max(0, diffDays(m.quitDate, ctx.today)) : null,
  }));

  return {
    periode: { jours: days, joursPrecedentsComparables: prevCov ? prevCov.days : 0 },
    devise: opts.currency || 'EUR',
    actuelle: periodBlock(cur, days),
    precedente: prev ? periodBlock(prev, prevCov.days) : null,
    variationsParJourEnPourcent: prev ? variations(cur, days, prev, prevCov.days) : null,
    parMethode: Object.entries(cur.counts.byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => ({ methode: labelOf(id), consommations: n, depense: r2(cur.cost.byCategory[id] || 0) })),
    momentsDeLaJournee: list.length ? Object.fromEntries(Object.entries(parts).map(([k, v]) => [PART_LABELS[k], v])) : null,
    weekEnd: list.length ? { consommationsWeekEnd: weekend, consommationsSemaine: list.length - weekend } : null,
    envies: cs.total ? {
      total: cs.total,
      resistees: cs.resisted,
      intensiteMoyenne: r1(cs.avgIntensity.value),
      declencheursPrincipaux: cs.topTriggers.slice(0, 3).map((t) => ({ declencheur: t.label, fois: t.count })),
    } : null,
    sessions: ss && ss.timed ? {
      chronometrees: ss.timed,
      dureeMoyenneMin: r1(ss.avgDuration.value),
      intervalleMoyenMin: r1(ss.avgInterval.value),
    } : null,
    sommeil: sl.count ? {
      nuitsRenseignees: sl.count,
      qualiteMoyenneSur5: r1(sl.quality.value),
      dureeMoyenneH: isNum(sl.total.value) ? r1(sl.total.value / 60) : null,
      endormissementMoyenMin: r1(sl.latency.value),
    } : null,
    objectifsParMethode: modes,
  };
}

/** Toutes les valeurs numériques du payload. */
export function payloadNumbers(payload) {
  const out = [];
  const walk = (v) => {
    if (isNum(v)) out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(payload);
  return out;
}

/**
 * Nombres cités dans un texte de l'IA qui ne figurent pas dans les données
 * envoyées (tolérance d'arrondi). Sert à signaler « à vérifier », jamais à
 * réécrire le texte.
 */
export function unverifiedNumbers(text, payload) {
  const known = payloadNumbers(payload).flatMap((v) => [v, v * 100, Math.abs(v)]);
  const found = String(text).match(/\d+(?:[.,]\d+)?/g) || [];
  return found.map((t) => Number(t.replace(',', '.'))).filter((n) => {
    if (n <= 7 && Number.isInteger(n)) return false; // « 3 pistes », « 7 jours »…
    return !known.some((k) => Math.abs(k - n) <= Math.max(0.051, Math.abs(k) * 0.01));
  });
}

/** Chaînes du payload qui ressembleraient à des données libres (garde-fou). */
export function payloadFreeText(payload) {
  const out = [];
  const walk = (v) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(payload);
  return out;
}
