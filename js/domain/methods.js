// Catalogue universel des méthodes de consommation et normalisation
// des composants d'une consommation.
//
// Une consommation référence une méthode (categoryId) et des composants
// indépendants :
//   tobacco  { grams, method, productId }                  tabac (g)
//   cbd      { amount, unit, method, productId, form, molecule }  1er ingrédient cannabinoïde
//   extra[]  { id, amount, unit, method, productId, form, molecule } ingrédients supplémentaires
//   liquid   { ml, method, productId, fills }              e-liquide (ml)
//   units    { count, method, productId }                   cigarettes, cigares… (fractionnable)
//   puffs    { count, productId, mode }                     bouffées
//   quantity { amount, unit }                               catégorie personnalisée
// Toute la logique de calcul (coûts, stocks, statistiques, quantités
// automatiques) passe par components(entry) : un seul moteur.

export const METHOD_CATALOG = [
  {
    id: 'cigarette', name: 'Cigarette industrielle', short: 'Cigarette', icon: 'cigarette', color: 'blue', group: 'tabac',
    mechanics: { units: 'cigarettes' }, unitLabel: 'cigarette', accessories: [], session: 'unit',
    blurb: 'Paquets de cigarettes manufacturées',
  },
  {
    id: 'rolled', name: 'Cigarette roulée', short: 'Roulée', icon: 'rolled', color: 'blue', group: 'tabac',
    mechanics: { tobacco: true }, accessories: [{ type: 'classic', count: 1 }], session: 'unit',
    blurb: 'Tabac à rouler, feuilles, avec ou sans filtre',
  },
  {
    id: 'joint', name: 'Joint', short: 'Joint', icon: 'joint', color: 'violet', group: 'cannabis',
    mechanics: { composition: true }, accessories: [{ type: 'slim', count: 1 }, { type: 'filter', count: 1 }], session: 'unit',
    blurb: 'Tabac, CBD, THC, résine… en toute composition',
  },
  {
    id: 'cbd', name: 'CBD / cannabinoïde seul', short: 'CBD seul', icon: 'leafless', color: 'green', group: 'cannabis',
    mechanics: { cannabis: true }, accessories: [], session: 'unit',
    blurb: 'Fleurs vaporisées, huile, infusion…',
  },
  {
    id: 'vape', name: 'Vape rechargeable', short: 'Vape', icon: 'vape', color: 'blue', group: 'vape',
    mechanics: { liquid: true }, accessories: [], session: 'session',
    blurb: 'Cigarette électronique et e-liquides',
  },
  {
    id: 'puff', name: 'Puff', short: 'Puff', icon: 'puff', color: 'orange', group: 'vape',
    mechanics: { puffs: true }, accessories: [], session: 'session',
    blurb: 'Jetable, rechargeable ou à pods',
  },
  {
    id: 'cigar', name: 'Cigare', short: 'Cigare', icon: 'cigar', color: 'orange', group: 'tabac',
    mechanics: { units: 'cigars' }, unitLabel: 'cigare', accessories: [], session: 'session',
  },
  {
    id: 'cigarillo', name: 'Cigarillo', short: 'Cigarillo', icon: 'cigarillo', color: 'orange', group: 'tabac',
    mechanics: { units: 'cigars' }, unitLabel: 'cigarillo', accessories: [], session: 'unit',
  },
  {
    id: 'pipe', name: 'Pipe', short: 'Pipe', icon: 'pipe', color: 'orange', group: 'tabac',
    mechanics: { tobacco: true }, accessories: [], session: 'session',
  },
  {
    id: 'hookah', name: 'Chicha', short: 'Chicha', icon: 'hookah', color: 'violet', group: 'tabac',
    mechanics: { tobacco: true }, accessories: [], session: 'session',
  },
];

export const methodOf = (id) => METHOD_CATALOG.find((m) => m.id === id) || null;

/** Mécanique d'une catégorie (catalogue, ou catégorie personnalisée historique). */
export function mechanicsOf(cat) {
  if (!cat) return {};
  const m = methodOf(cat.id);
  if (m) return m.mechanics;
  return { tobacco: !!cat.tobacco, cannabis: !!cat.cbd, quantity: !!cat.tracksQuantity };
}

/* ------------------------------------------------------------------ */
/* Compositions de joints                                              */
/* ------------------------------------------------------------------ */

const ing = (molecule, form) => ({ molecule, form });
export const JOINT_COMPOSITIONS = [
  { id: 'tobacco_cbd', label: 'Tabac + CBD', tobacco: true, cannabis: [ing('cbd', 'flower')] },
  { id: 'cbd_pure', label: 'CBD pur', tobacco: false, cannabis: [ing('cbd', 'flower')] },
  { id: 'tobacco_thc', label: 'Tabac + THC', tobacco: true, cannabis: [ing('thc', 'flower')] },
  { id: 'thc_pure', label: 'THC pur', tobacco: false, cannabis: [ing('thc', 'flower')] },
  { id: 'tobacco_resin', label: 'Tabac + résine', tobacco: true, cannabis: [ing('unknown', 'resin')] },
  { id: 'resin_cbd', label: 'Résine + CBD', tobacco: false, cannabis: [ing('unknown', 'resin'), ing('cbd', 'flower')] },
  { id: 'resin_thc', label: 'Résine + THC', tobacco: false, cannabis: [ing('thc', 'resin'), ing('thc', 'flower')] },
  { id: 'flower_cbd', label: 'Fleurs CBD', tobacco: false, cannabis: [ing('cbd', 'flower')] },
  { id: 'flower_thc', label: 'Fleurs THC', tobacco: false, cannabis: [ing('thc', 'flower')] },
  { id: 'custom', label: 'Mélange personnalisé', tobacco: null, cannabis: null },
];
export const compositionOf = (id) => JOINT_COMPOSITIONS.find((c) => c.id === id) || null;

/** Composition déduite des ingrédients présents (migration, affichage). */
export function inferComposition(e) {
  const mols = [e.cbd, ...(e.extra || [])].filter(Boolean).map((c) => c.molecule || 'cbd');
  if (!mols.length) return e.tobacco ? 'custom' : 'custom';
  if (mols.length === 1) {
    const isThc = mols[0] === 'thc';
    if (e.tobacco) return isThc ? 'tobacco_thc' : (e.cbd?.form === 'resin' ? 'tobacco_resin' : 'tobacco_cbd');
    return isThc ? 'thc_pure' : 'cbd_pure';
  }
  return 'custom';
}

/* ------------------------------------------------------------------ */
/* Molécules : familles distinctes dans les statistiques               */
/* ------------------------------------------------------------------ */

/** 'thc' | 'unknown' | 'cbd' (CBD et dérivés non-THC, suivis par molécule). */
export function moleculeClass(molecule) {
  if (molecule === 'thc') return 'thc';
  if (molecule === 'unknown') return 'unknown';
  return 'cbd';
}

/* ------------------------------------------------------------------ */
/* Composants normalisés                                               */
/* ------------------------------------------------------------------ */

/**
 * @returns {Array<{path, substance, productKind, productId, amount, unit, method, molecule?, form?}>}
 *  substance : 'tobacco' | 'cannabis' | 'liquid' | 'units' | 'puffs'
 */
export function components(e) {
  if (!e || e.kind !== 'consumption') return [];
  const out = [];
  if (e.tobacco) out.push({ path: 'tobacco', substance: 'tobacco', productKind: 'tobacco', productId: e.tobacco.productId, amount: e.tobacco.grams, unit: 'g', method: e.tobacco.method, basis: e.tobacco.basis });
  if (e.cbd) out.push({ path: 'cbd', substance: 'cannabis', productKind: 'cbd', productId: e.cbd.productId, amount: e.cbd.amount, unit: e.cbd.unit || 'g', method: e.cbd.method, molecule: e.cbd.molecule || 'cbd', moleculeOther: e.cbd.moleculeOther, form: e.cbd.form, basis: e.cbd.basis });
  (e.extra || []).forEach((x, i) => out.push({ path: `extra.${i}`, substance: 'cannabis', productKind: 'cbd', productId: x.productId, amount: x.amount, unit: x.unit || 'g', method: x.method, molecule: x.molecule || 'unknown', moleculeOther: x.moleculeOther, form: x.form, basis: x.basis }));
  if (e.liquid) out.push({ path: 'liquid', substance: 'liquid', productKind: 'liquid', productId: e.liquid.productId, amount: e.liquid.ml, unit: 'ml', method: e.liquid.method, basis: e.liquid.basis });
  if (e.units) out.push({ path: 'units', substance: 'units', productKind: e.units.kind || 'cigarettes', productId: e.units.productId, amount: e.units.count, unit: 'unit', method: e.units.method || 'counted' });
  if (e.puffs) out.push({ path: 'puffs', substance: 'puffs', productKind: 'puff', productId: e.puffs.productId, amount: e.puffs.count, unit: 'puff', method: 'counted' });
  return out;
}

/** Écrit une quantité dans le composant désigné par son chemin (copie). */
export function withComponent(e, path, patch) {
  const next = { ...e };
  if (path.startsWith('extra.')) {
    const i = Number(path.slice(6));
    next.extra = (e.extra || []).map((x, k) => (k === i ? { ...x, ...patch } : x));
  } else {
    next[path] = { ...e[path], ...patch };
  }
  return next;
}

export const AMOUNT_KEY = { tobacco: 'grams', cbd: 'amount', liquid: 'ml', units: 'count', puffs: 'count' };
export const amountKeyOf = (path) => (path.startsWith('extra.') ? 'amount' : AMOUNT_KEY[path]);

/* ------------------------------------------------------------------ */
/* Fiabilité des quantités                                             */
/* ------------------------------------------------------------------ */

export const RELIABILITY = {
  weighed: { label: 'Pesée', short: 'pesé', tone: 'violet' },
  calculated: { label: 'Calculée', short: 'calculé', tone: 'green' },
  provisional: { label: 'Estimation provisoire', short: '≈ provisoire', tone: 'orange' },
  estimated: { label: 'Estimée', short: 'estimé', tone: 'muted' },
  counted: { label: 'Comptée', short: '', tone: 'muted' },
  unknown: { label: 'Inconnue', short: 'inconnu', tone: 'muted' },
};

/** Niveau de fiabilité d'un composant. */
export function reliabilityOf(c) {
  if (c.amount == null || c.method == null || c.method === 'unknown') return 'unknown';
  if (c.method === 'weighed') return 'weighed';
  if (c.method === 'estimated') return 'estimated';
  if (c.method === 'counted') return 'counted';
  if (c.method === 'auto') return c.basis && c.basis !== 'default' ? 'calculated' : 'provisional';
  return 'estimated';
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

export const COMPLETION = [
  { id: 'done', label: 'Terminée' },
  { id: 'partial', label: 'Partiellement' },
  { id: 'interrupted', label: 'Interrompue' },
  { id: 'abandoned', label: 'Abandonnée' },
];
