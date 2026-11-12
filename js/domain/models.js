// Modèle de données, référentiels et valeurs par défaut.
//
// Aucune valeur par défaut ne contient de prix ou de quantité : ces données
// doivent toujours provenir de l'utilisateur (règle métier n° 1 et 2).

export const SCHEMA_VERSION = 1;

export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/* ------------------------------------------------------------------ */
/* Catégories de consommation                                          */
/* ------------------------------------------------------------------ */

export const CAT = {
  JOINT: 'joint',
  ROLLED: 'rolled',
  CBD: 'cbd',
};

export const SYSTEM_CATEGORIES = [
  {
    id: CAT.JOINT, system: true, name: 'Joint tabac + CBD', short: 'Joint',
    icon: 'joint', color: 'violet', tobacco: true, cbd: true, cbdUnit: 'g',
    accessories: [{ type: 'slim', count: 1 }, { type: 'filter', count: 1 }],
  },
  {
    id: CAT.ROLLED, system: true, name: 'Cigarette roulée', short: 'Roulée',
    icon: 'rolled', color: 'blue', tobacco: true, cbd: false,
    accessories: [{ type: 'classic', count: 1 }],
  },
  {
    id: CAT.CBD, system: true, name: 'CBD seul', short: 'CBD seul',
    icon: 'leafless', color: 'green', tobacco: false, cbd: true, cbdUnit: 'g',
    accessories: [],
  },
];

/** Catégorie personnalisée : modèle vierge. */
export function newCustomCategory() {
  return {
    id: uid('cat'), system: false, name: '', short: '', icon: 'custom', color: 'orange',
    tobacco: false, cbd: false, cbdUnit: 'g', unit: 'unit', unitLabel: 'unité',
    tracksQuantity: true, accessories: [], fields: [], archived: false,
  };
}

export const CBD_FORMS = [
  { id: 'flower', label: 'Fleurs', unit: 'g' },
  { id: 'resin', label: 'Résine', unit: 'g' },
  { id: 'oil', label: 'Huile', unit: 'drop' },
  { id: 'other', label: 'Autre produit', unit: 'unit' },
];

/**
 * Molécule réellement consommée dans le « CBD ». Les cannabinoïdes
 * hémisynthétiques (HHC, 10-OH-HHC, Δ10…) ne sont PAS du CBD : ils sont
 * suivis séparément et jamais assimilés au CBD ni au THC.
 */
export const MOLECULES = [
  { id: 'cbd', label: 'CBD', short: 'CBD', synthetic: false },
  { id: '10oh', label: '10-OH-HHC', short: '10-OH', synthetic: true },
  { id: 'hhc', label: 'HHC', short: 'HHC', synthetic: true },
  { id: 'hhcp', label: 'HHC-P', short: 'HHC-P', synthetic: true },
  { id: 'd10', label: 'Δ10-THC (D10)', short: 'D10', synthetic: true },
  { id: 'd8', label: 'Δ8-THC (D8)', short: 'D8', synthetic: true },
  { id: 'h4cbd', label: 'H4-CBD', short: 'H4-CBD', synthetic: true },
  { id: 'thcp', label: 'THC-P', short: 'THC-P', synthetic: true },
  { id: 'cbn', label: 'CBN', short: 'CBN', synthetic: false },
  { id: 'cbg', label: 'CBG', short: 'CBG', synthetic: false },
  { id: 'other', label: 'Autre', short: 'Autre', synthetic: true },
];
export const moleculeOf = (id) => MOLECULES.find((m) => m.id === id) || MOLECULES[0];
/** Libellé court d'une entrée : molécule précise (ou texte libre « Autre »). */
export const moleculeLabel = (cbd) => (cbd?.molecule === 'other' && cbd.moleculeOther ? cbd.moleculeOther : moleculeOf(cbd?.molecule || 'cbd').short);

export const CBD_MODES = [
  { id: 'smoked', label: 'Fumé' },
  { id: 'vaped', label: 'Vaporisé' },
  { id: 'sublingual', label: 'Sublingual' },
  { id: 'ingested', label: 'Ingéré' },
  { id: 'infusion', label: 'Infusion' },
  { id: 'other', label: 'Autre' },
];

export const ACCESSORY_TYPES = [
  { id: 'slim', label: 'Feuilles slim', single: 'Feuille slim' },
  { id: 'classic', label: 'Feuilles classiques', single: 'Feuille classique' },
  { id: 'filter', label: 'Filtres', single: 'Filtre' },
  { id: 'other', label: 'Autres accessoires', single: 'Accessoire' },
];

export const CONTEXTS = [
  { id: 'home', label: 'À la maison' },
  { id: 'work', label: 'Travail / études' },
  { id: 'social', label: 'Entre amis' },
  { id: 'outside', label: 'Dehors' },
  { id: 'transport', label: 'Trajet' },
  { id: 'after_meal', label: 'Après un repas' },
  { id: 'coffee', label: 'Café / pause' },
  { id: 'bedtime', label: 'Avant de dormir' },
  { id: 'night', label: 'Réveil nocturne' },
  { id: 'other', label: 'Autre' },
];

export const MOODS = [
  { id: 'calm', label: 'Calme' },
  { id: 'good', label: 'Bien' },
  { id: 'tired', label: 'Fatigué·e' },
  { id: 'stressed', label: 'Stressé·e' },
  { id: 'anxious', label: 'Anxieux·se' },
  { id: 'bored', label: 'Ennuyé·e' },
  { id: 'sad', label: 'Triste' },
  { id: 'irritated', label: 'Irrité·e' },
  { id: 'restless', label: 'Agité·e' },
];

export const TRIGGERS = [
  { id: 'stress', label: 'Stress' },
  { id: 'mental', label: 'Agitation mentale' },
  { id: 'boredom', label: 'Ennui' },
  { id: 'habit', label: 'Habitude' },
  { id: 'after_meal', label: 'Après un repas' },
  { id: 'bedtime', label: 'Avant de dormir' },
  { id: 'focus', label: 'Difficulté à se concentrer' },
  { id: 'night_wake', label: 'Réveil nocturne' },
  { id: 'relax', label: 'Besoin de se détendre' },
  { id: 'other', label: 'Autre' },
];

export const CRAVING_PRODUCTS = [
  { id: 'tobacco', label: 'Tabac' },
  { id: 'cbd', label: 'CBD' },
  { id: 'both', label: 'Les deux' },
];

export const WAKE_FEELINGS = [
  { id: 'rested', label: 'Reposé·e' },
  { id: 'ok', label: 'Correct' },
  { id: 'groggy', label: 'Vaseux·se' },
  { id: 'tired', label: 'Fatigué·e' },
  { id: 'exhausted', label: 'Épuisé·e' },
];

export const labelOf = (list, id) => list.find((x) => x.id === id)?.label ?? '';

/* ------------------------------------------------------------------ */
/* Produits                                                            */
/* ------------------------------------------------------------------ */

/**
 * Produit : tabac, CBD ou accessoire.
 * refPackPrice / refPackSize : tarif de référence facultatif, utilisé si aucun
 * achat n'est enregistré à la date de la consommation.
 */
export function newProduct(kind, extra = {}) {
  return {
    id: uid('prd'), kind, name: '', brand: '', supplier: '',
    cbdForm: kind === 'cbd' ? 'flower' : null,
    accessoryType: kind === 'accessory' ? 'slim' : null,
    unit: kind === 'accessory' ? 'unit' : 'g',
    refPackPrice: null, refPackSize: null,
    archived: false, createdAt: new Date().toISOString(),
    ...extra,
  };
}

export function defaultProducts() {
  return [
    newProduct('tobacco', { id: 'prd_tobacco', name: 'Tabac à rouler' }),
    newProduct('cbd', { id: 'prd_cbd_flower', name: 'CBD fleurs', cbdForm: 'flower' }),
    newProduct('accessory', { id: 'prd_slim', name: 'Feuilles slim', accessoryType: 'slim' }),
    newProduct('accessory', { id: 'prd_classic', name: 'Feuilles classiques', accessoryType: 'classic' }),
    newProduct('accessory', { id: 'prd_filter', name: 'Filtres', accessoryType: 'filter' }),
  ];
}

/* ------------------------------------------------------------------ */
/* Réglages                                                            */
/* ------------------------------------------------------------------ */

export function defaultSettings() {
  return {
    id: 'settings',
    schema: SCHEMA_VERSION,
    onboarded: false,
    currency: 'EUR',
    theme: 'light', // 'light' (Sable) | 'dark' (Forêt) | 'auto'
    themeV2: true,
    trackingStart: null,
    defaultProducts: {
      tobacco: 'prd_tobacco', cbd: 'prd_cbd_flower',
      slim: 'prd_slim', classic: 'prd_classic', filter: 'prd_filter', other: null,
    },
    quickDefaults: {}, // dernières valeurs par catégorie
    defaultMethod: 'auto', // pas de balance : estimation automatique
    autoV1: true,
    autoPriors: {},
    observation: { enabled: false, startDate: null, days: 14 },
    baseline: null,
    journeys: {
      tobacco: { status: 'tracking', quitDate: null },
      cbd: { status: 'tracking', quitDate: null },
    },
    stock: { enabled: false, since: null },
    notifications: {
      inApp: true, // rappels discrets dans l'application
      enabled: false, // notifications système (si autorisées)
      journal: { on: true, time: '21:30' },
      sleep: { on: true, time: '09:30' },
      weekly: { on: true, weekday: 6, time: '19:00' },
      goals: { on: false, time: '12:00' },
      monthly: { on: true },
    },
    privacy: { lock: 'none', pinHash: null, pinSalt: null, credentialId: null, autoBackup: true },
    lastExportAt: null,
    statsMethod: 'all',
    dismissedTips: [],
  };
}

/* ------------------------------------------------------------------ */
/* Entrées du journal                                                  */
/* ------------------------------------------------------------------ */

/**
 * Consommation :
 * { id, kind:'consumption', categoryId, at:'YYYY-MM-DDTHH:mm', tzOffset,
 *   tobacco: { grams, method, productId } | null,
 *   cbd: { amount, unit, method, productId, form } | null,
 *   accessories: [{ type, productId, count }],
 *   context, mood, mode, note, custom:{}, cravingId, createdAt, updatedAt }
 *
 * Envie :
 * { id, kind:'craving', at, tzOffset, intensity, product, trigger, triggerOther,
 *   durationMin, situation, emotion, note, outcome:'resisted'|'consumed',
 *   consumptionId, createdAt, updatedAt }
 *
 * method : 'auto' (calculée depuis les paquets) | 'weighed' (pesée) | 'estimated' (estimation) | null
 */
export const METHODS = [
  { id: 'auto', label: 'Auto', hint: 'Calculée par l\u2019app à partir de tes paquets' },
  { id: 'estimated', label: 'Estimée', hint: 'Quantité approximative saisie' },
  { id: 'weighed', label: 'Pesée', hint: 'Balance de précision' },
];

/** Normalise une liste d'accessoires : une seule ligne par type/produit. */
export function normalizeAccessories(list) {
  const map = new Map();
  for (const a of list || []) {
    if (!a || !a.type) continue;
    const count = Number.isFinite(Number(a.count)) ? Math.max(0, Math.round(Number(a.count))) : 1;
    if (count === 0) continue;
    const key = `${a.type}|${a.productId || ''}`;
    // Doublon : on conserve la dernière saisie, on n'additionne jamais.
    map.set(key, { type: a.type, productId: a.productId || null, count });
  }
  return [...map.values()];
}
