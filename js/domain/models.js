import { METHOD_CATALOG } from './methods.js';

// Modèle de données, référentiels et valeurs par défaut.
//
// Aucune valeur par défaut ne contient de prix ou de quantité : ces données
// doivent toujours provenir de l'utilisateur (règle métier n° 1 et 2).

export const SCHEMA_VERSION = 2; // v2 : méthodes universelles, sessions, habitudes

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

/**
 * Catégories système = méthodes du catalogue (domain/methods.js).
 * tobacco / cbd : mécanique par défaut (pour le joint, la composition choisie
 * prime : un joint n'est jamais supposé contenir du tabac ou du CBD).
 */
export const SYSTEM_CATEGORIES = METHOD_CATALOG.map((m) => ({
  id: m.id, system: true, name: m.name, short: m.short, icon: m.icon, color: m.color,
  tobacco: !!m.mechanics.tobacco || m.id === 'joint', cbd: !!m.mechanics.cannabis || m.id === 'joint', cbdUnit: 'g',
  accessories: m.accessories,
}));

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
  { id: 'thc', label: 'THC', short: 'THC', synthetic: false, thc: true },
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
  { id: 'unknown', label: 'Non précisée', short: 'Résine ?', synthetic: false },
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
  { id: 'thc', label: 'THC' },
  { id: 'vape', label: 'Vape' },
  { id: 'puff', label: 'Puff' },
  { id: 'both', label: 'Tabac + CBD' },
  { id: 'other', label: 'Autre' },
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
/**
 * Types de produits (même système d'achats datés, de prix et de stock) :
 *  tobacco    tabac à rouler / pipe / chicha        unité : g
 *  cbd        fleurs, résine… (molécule : CBD, THC…) unité : g (ou ml, gouttes)
 *  cigarettes paquet de N cigarettes (+ nicotine/cig) unité : cigarette
 *  cigars     boîte de cigares / cigarillos          unité : pièce
 *  liquid     flacon d'e-liquide (+ nicotine mg/ml)  unité : ml
 *  puff       puff / pod (+ bouffées annoncées)      unité : bouffée
 *  device     appareil de vape (réservoir)           pas de consommation
 *  accessory  feuilles, filtres…                     unité : pièce
 */
export const PRODUCT_KINDS = [
  { id: 'tobacco', label: 'Tabac', unit: 'g', sizeLabel: 'Poids (g)' },
  { id: 'cbd', label: 'CBD / cannabinoïde', unit: 'g', sizeLabel: 'Quantité (g)' },
  { id: 'cigarettes', label: 'Cigarettes', unit: 'unit', sizeLabel: 'Cigarettes par paquet' },
  { id: 'cigars', label: 'Cigares / cigarillos', unit: 'unit', sizeLabel: 'Pièces par boîte' },
  { id: 'liquid', label: 'E-liquide', unit: 'ml', sizeLabel: 'Contenance (ml)' },
  { id: 'puff', label: 'Puff / pod', unit: 'puff', sizeLabel: 'Bouffées annoncées' },
  { id: 'device', label: 'Appareil de vape', unit: 'unit', sizeLabel: 'Quantité' },
  { id: 'accessory', label: 'Accessoire', unit: 'unit', sizeLabel: 'Unités par paquet' },
];
export const productKindOf = (id) => PRODUCT_KINDS.find((k) => k.id === id) || PRODUCT_KINDS[0];

export function newProduct(kind, extra = {}) {
  return {
    id: uid('prd'), kind, name: '', brand: '', supplier: '',
    cbdForm: kind === 'cbd' ? 'flower' : null,
    molecule: kind === 'cbd' ? 'cbd' : null,
    accessoryType: kind === 'accessory' ? 'slim' : null,
    unit: productKindOf(kind).unit,
    refPackPrice: null, refPackSize: null,
    // cigarettes / cigares
    nicotinePerUnit: null, cigarType: kind === 'cigars' ? 'cigar' : null,
    // e-liquide
    nicotineMgPerMl: null, liquidType: null,
    // puff
    puffType: kind === 'puff' ? 'disposable' : null, puffMl: null, nicotineTotalMg: null, openedAt: null, finishedAt: null,
    // appareil
    model: '', tankMl: null, deviceType: null,
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
    theme: 'light', // 'light' | 'dark' | 'auto'
    themeV2: true,
    trackingStart: null,
    defaultProducts: {
      tobacco: 'prd_tobacco', cbd: 'prd_cbd_flower',
      slim: 'prd_slim', classic: 'prd_classic', filter: 'prd_filter', other: null,
      cigarettes: null, cigars: null, liquid: null, puff: null, device: null,
    },
    // V2 — habitudes : méthodes activées, méthode principale déclarée, mode par méthode.
    habits: { configured: false, enabled: [], primary: null, modes: {} },
    sessions: { reminderMin: 30 },
    ai: { dataConsent: false, consentAt: null },
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
