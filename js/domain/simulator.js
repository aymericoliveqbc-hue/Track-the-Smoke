// Simulateur d'économies — basé exclusivement sur les dépenses enregistrées.
// Les montants obtenus sont des économies THÉORIQUES (règle métier n° 9).

import { coverage, entriesIn, isConsumption } from './stats.js';
import { CAT } from './models.js';

export const HORIZONS = [
  { id: '7', days: 7, label: '7 jours' },
  { id: '30', days: 30, label: '30 jours' },
  { id: '90', days: 90, label: '90 jours' },
  { id: '182', days: 182, label: '6 mois' },
  { id: '365', days: 365, label: '1 an' },
];

/** Coûts quotidiens moyens observés, ventilés par composante. */
export function dailyCostProfile(entries, range, ctx) {
  const cov = coverage(range, ctx.trackingStart, ctx.today);
  if (!cov) return null;
  const list = entriesIn(entries, cov).filter(isConsumption);
  const p = {
    days: cov.days, coverage: cov, entries: list.length, incomplete: 0,
    tobacco: 0, cbd: 0, other: 0,
    accJoint: 0, accRolled: 0, accCbd: 0, accCustom: 0,
    customTobaccoOnly: 0, byCategory: {},
  };
  for (const e of list) {
    const c = ctx.cost(e);
    if (!c.complete) p.incomplete += 1;
    p.tobacco += c.tobacco || 0;
    p.cbd += c.cbd || 0;
    // THC, liquides, cigarettes, cigares, puffs… : comptés dans le total.
    p.other += (c.thc || 0) + (c.unknown || 0) + (c.liquid || 0) + (c.cigarettes || 0) + (c.cigars || 0) + (c.puffs || 0);
    p.byCategory[e.categoryId] = (p.byCategory[e.categoryId] || 0) + c.total;
    const acc = c.accessories || 0;
    if (e.categoryId === CAT.JOINT) p.accJoint += acc;
    else if (e.categoryId === CAT.ROLLED) p.accRolled += acc;
    else if (e.categoryId === CAT.CBD) p.accCbd += acc;
    else p.accCustom += acc;
  }
  for (const k of ['tobacco', 'cbd', 'other', 'accJoint', 'accRolled', 'accCbd', 'accCustom']) p[k] /= cov.days;
  for (const k of Object.keys(p.byCategory)) p.byCategory[k] /= cov.days;
  p.total = p.tobacco + p.cbd + p.other + p.accJoint + p.accRolled + p.accCbd + p.accCustom;
  return p;
}

/** Scénarios : coût quotidien restant et économie quotidienne. */
export function scenarios(profile) {
  if (!profile) return [];
  const t = profile.total;
  const mk = (id, label, remaining, note) => ({ id, label, remaining, saving: Math.max(0, t - remaining), note });
  return [
    mk('current', 'Consommation actuelle', t, 'Rythme observé sur la période.'),
    mk('r10', 'Réduction de 10 %', t * 0.9),
    mk('r25', 'Réduction de 25 %', t * 0.75),
    mk('r50', 'Réduction de 50 %', t * 0.5),
    mk('noTobacco', 'Arrêt du tabac uniquement', t - profile.tobacco - profile.accRolled,
      'Hypothèse : les roulées disparaissent ; les joints restent, sans tabac, avec leurs feuilles et filtres.'),
    mk('noCbd', 'Arrêt du CBD uniquement', t - profile.cbd - profile.accCbd,
      'Hypothèse : le CBD seul disparaît ; les joints restent, sans CBD, avec leurs feuilles et filtres.'),
    mk('none', 'Arrêt des deux', 0, 'Plus aucune dépense de tabac, de CBD ni d’accessoires.'),
  ];
}

export function projectSavings(scenario, horizons = HORIZONS) {
  return horizons.map((h) => ({ ...h, amount: scenario.saving * h.days, spend: scenario.remaining * h.days }));
}

/**
 * Arrêt d'une ou plusieurs méthodes : leur coût quotidien observé disparaît
 * (ingrédients et accessoires compris), les autres restent identiques.
 */
export function stopMethodsScenario(profile, categoryIds, labelOf = (id) => id) {
  if (!profile) return null;
  const avoided = categoryIds.reduce((t, id) => t + (profile.byCategory[id] || 0), 0);
  const label = categoryIds.length ? `Arrêt : ${categoryIds.map(labelOf).join(', ')}` : 'Aucune méthode choisie';
  return { id: `stop:${categoryIds.join('+')}`, label, remaining: Math.max(0, profile.total - avoided), saving: avoided };
}

/** Réduction en pourcentage sur l'ensemble. */
export function reductionScenario(profile, share) {
  if (!profile) return null;
  return { id: `r${Math.round(share * 100)}`, label: `Réduction de ${Math.round(share * 100)} %`, remaining: profile.total * (1 - share), saving: profile.total * share };
}
