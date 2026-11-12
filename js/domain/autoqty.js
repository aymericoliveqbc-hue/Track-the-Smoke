// Quantités automatiques (sans balance) — moyennes adaptatives.
//
// 1. Valeurs de départ PAR VARIANTE (modifiables, historisées) :
//    roulée classique ≠ roulée slim ≠ joint mélangé ≠ joint pur…
// 2. Repères réels :
//    - paquets déclarés (ouverture, « il en reste… », terminé) ;
//    - comptages de stock (stock initial / compté) + achats + ajustements − pertes.
//    Entre deux repères, la quantité réellement partie d'un produit est connue :
//    on retire les quantités saisies à la main (pesées / estimées), puis on
//    répartit le reste sur les consommations « auto » de ce produit, au prorata
//    de leurs valeurs de départ (× fraction réellement consommée).
// 3. Facteur réel / départ : par segment (rétroactif), par produit, par substance.
// 4. Chaque quantité auto porte sa base : 'segment' | 'product' | 'average'
//    (CALCULÉE) ou 'default' (ESTIMATION PROVISOIRE).
// Sans repère exploitable, rien n'est présenté comme calculé.

import { isNum, round2 } from '../core/format.js';
import { uid } from './models.js';
import { resolveProduct } from './costs.js';
import { components, amountKeyOf, withComponent } from './methods.js';

/** Valeurs de départ par variante (g, ml par session). null = aucune valeur générique. */
export const DEFAULT_PRIORS_V2 = {
  rolled: { tobacco: 0.3 },
  rolledSlim: { tobacco: 0.25 },
  jointMix: { tobacco: 0.2, cannabis: 0.2 },
  jointPure: { cannabis: 0.35 },
  jointExtra: { cannabis: 0.15 },
  cbd: { cannabis: 0.25 },
  pipe: { tobacco: 1.5 },
  hookah: { tobacco: 12 },
  vape: { liquid: null },
  custom: { tobacco: 0.25, cannabis: 0.25 },
};

export const PRIOR_LABELS = {
  rolled: 'Roulée (feuille classique)',
  rolledSlim: 'Roulée (feuille slim)',
  jointMix: 'Joint avec tabac',
  jointPure: 'Joint sans tabac',
  jointExtra: 'Ingrédient supplémentaire d’un joint',
  cbd: 'CBD / cannabinoïde seul',
  pipe: 'Pipe (par session)',
  hookah: 'Chicha (par session)',
  vape: 'Vape (par session)',
  custom: 'Catégorie personnalisée',
};

/** Compatibilité V1 : { joint:{tobacco,cbd}, rolled:{tobacco}, cbd:{cbd} }. */
export const DEFAULT_PRIORS = {
  joint: { tobacco: 0.2, cbd: 0.2 },
  rolled: { tobacco: 0.3 },
  cbd: { cbd: 0.25 },
  custom: { tobacco: 0.25, cbd: 0.25 },
};

export const REMAINING_CHOICES = [
  { id: 'full', label: 'Plein', fraction: 1 },
  { id: '3q', label: '¾', fraction: 0.75 },
  { id: 'half', label: 'La moitié', fraction: 0.5 },
  { id: '1q', label: '¼', fraction: 0.25 },
  { id: 'low', label: 'Presque vide', fraction: 0.1 },
];

const K_MIN = 0.15;
const K_MAX = 6;
const MAX_SEGMENTS = 6;

/** Valeurs de départ effectives (défauts ← réglages V1 ← réglages V2). */
export function priorsOf(settings) {
  const p = JSON.parse(JSON.stringify(DEFAULT_PRIORS_V2));
  const v1 = settings?.autoPriors || {};
  if (isNum(v1.joint?.tobacco)) p.jointMix.tobacco = v1.joint.tobacco;
  if (isNum(v1.joint?.cbd)) p.jointMix.cannabis = v1.joint.cbd;
  if (isNum(v1.rolled?.tobacco)) p.rolled.tobacco = v1.rolled.tobacco;
  if (isNum(v1.cbd?.cbd)) p.cbd.cannabis = v1.cbd.cbd;
  for (const [k, v] of Object.entries(settings?.autoPriorsV2 || {})) p[k] = { ...(p[k] || {}), ...v };
  // Accès V1 conservé (joint.tobacco, joint.cbd, rolled.tobacco, cbd.cbd).
  p.joint = { tobacco: p.jointMix.tobacco, cbd: p.jointMix.cannabis };
  p.cbd.cbd = p.cbd.cannabis;
  return p;
}

/** Variante d'un composant : clé de valeur de départ. */
export function priorKeyFor(e, c) {
  const cat = e.categoryId;
  const hasSlim = (e.accessories || []).some((a) => a.type === 'slim');
  if (c.substance === 'liquid') return 'vape';
  if (c.substance === 'tobacco') {
    if (cat === 'rolled') return hasSlim ? 'rolledSlim' : 'rolled';
    if (cat === 'joint') return 'jointMix';
    if (cat === 'pipe' || cat === 'hookah') return cat;
    return 'custom';
  }
  if (c.substance === 'cannabis') {
    if (cat === 'joint') return c.path === 'cbd' ? (e.tobacco ? 'jointMix' : 'jointPure') : 'jointExtra';
    if (cat === 'cbd') return 'cbd';
    return 'custom';
  }
  return null;
}

const SUB_KEY = { tobacco: 'tobacco', cannabis: 'cannabis', liquid: 'liquid' };
const AUTO_SUBSTANCES = ['tobacco', 'cannabis', 'liquid'];

/** Poids de répartition d'un composant (valeur de départ × fraction consommée). */
function weightOf(e, c, priors) {
  const key = priorKeyFor(e, c);
  if (!key) return null;
  const v = priors[key]?.[SUB_KEY[c.substance]];
  const base = isNum(v) && v > 0 ? v : (c.substance === 'liquid' ? 1 : null); // vape : 1 session = 1 part
  if (base == null) return null;
  const f = isNum(e.usedFraction) ? Math.max(0, Math.min(1, e.usedFraction)) : 1;
  return base * f;
}

/** Ancienne API : valeur de départ d'une substance pour une entrée. */
export function priorFor(entry, substance, priors) {
  const comp = components(entry).find((c) => (substance === 'tobacco' ? c.substance === 'tobacco' : c.path === 'cbd'));
  if (!comp) return null;
  if (comp.substance === 'cannabis' && (comp.unit || 'g') !== 'g') return null;
  const key = priorKeyFor(entry, comp);
  const v = priors[key]?.[SUB_KEY[comp.substance]];
  return isNum(v) && v > 0 ? v : null;
}

const productOf = (c, settings) => resolveProduct(settings, c.productKind, c.productId);

export function newPack({ productId, kind, size, openedAt, startRemaining = null }) {
  return {
    id: uid('pack'), productId, kind, size,
    openedAt, startRemaining: isNum(startRemaining) ? startRemaining : size,
    checkpoints: [], finishedAt: null, createdAt: new Date().toISOString(),
  };
}

/** Repères d'un paquet : [{at, remaining, quality}] triés. */
function packMarkers(pack) {
  const pts = [{ at: pack.openedAt, remaining: pack.startRemaining, quality: pack.startRemaining === pack.size ? 1 : 0.6, opening: true }];
  for (const c of [...(pack.checkpoints || [])].sort((a, b) => (a.at < b.at ? -1 : 1))) {
    if (pack.finishedAt && c.at > pack.finishedAt) continue;
    pts.push({ at: c.at, remaining: c.remaining, quality: 0.6 });
  }
  if (pack.finishedAt) pts.push({ at: pack.finishedAt, remaining: 0, quality: 1 });
  return pts;
}

const SUBSTANCE_OF_KIND = { tobacco: 'tobacco', cbd: 'cannabis', liquid: 'liquid' };

/**
 * Segments issus des comptages de stock : entre deux comptages A et B d'un
 * produit, consommé = A + achats + ajustements − pertes − B.
 */
function stockSegments(products, purchases, inventories) {
  const out = [];
  for (const prod of products) {
    const sub = SUBSTANCE_OF_KIND[prod.kind];
    if (!sub) continue;
    const counts = inventories.filter((i) => i.productId === prod.id && (!i.type || i.type === 'count' || i.type === 'initial'))
      .sort((a, b) => (a.at < b.at ? -1 : 1));
    for (let i = 1; i < counts.length; i++) {
      const A = counts[i - 1]; const B = counts[i];
      const day = (at) => at.slice(0, 10);
      const bought = purchases.filter((p) => p.productId === prod.id && p.addToStock !== false && day(`${p.date}T00:00`) >= day(A.at) && `${p.date}T00:00` > A.at && `${p.date}T00:00` <= B.at)
        .reduce((t, p) => t + (isNum(p.packSize) ? p.packSize * (p.packCount || 1) : 0), 0);
      const deltas = inventories.filter((x) => x.productId === prod.id && (x.type === 'adjust' || x.type === 'loss') && x.at > A.at && x.at <= B.at)
        .reduce((t, x) => t + (x.type === 'loss' ? -Math.abs(x.quantity) : x.quantity), 0);
      out.push({ productId: prod.id, substance: sub, from: A.at, to: B.at, consumed: A.quantity + bought + deltas - B.quantity, quality: 0.8, source: 'stock', inclusiveStart: false });
    }
  }
  return out;
}

/**
 * Calibration complète.
 * @returns {{ factors, calibrations, segments, byProduct:Map, quantities:Map<entryId,{[path]:number}>, bases:Map<entryId,{[path]:string}> }}
 */
export function calibrate(entries, packs, settings, { products = [], purchases = [], inventories = [] } = {}) {
  const priors = priorsOf(settings);
  const out = { factors: {}, calibrations: {}, segments: [], byProduct: new Map(), quantities: new Map(), bases: new Map() };
  const segOf = new Map(); // `${entryId}|${path}` → segment

  // Fenêtres de calcul : paquets + comptages de stock.
  const windows = [];
  for (const pack of packs) {
    const sub = SUBSTANCE_OF_KIND[pack.kind];
    if (!sub) continue;
    const pts = packMarkers(pack);
    for (let i = 1; i < pts.length; i++) {
      windows.push({ productId: pack.productId, substance: sub, from: pts[i - 1].at, to: pts[i].at, consumed: pts[i - 1].remaining - pts[i].remaining,
        quality: Math.min(pts[i - 1].quality, pts[i].quality), source: 'pack', packId: pack.id, inclusiveStart: !!pts[i - 1].opening });
    }
  }
  windows.push(...stockSegments(products, purchases, inventories));

  for (const w of windows) {
    let known = 0; let units = 0; const autos = [];
    for (const e of entries) {
      if (e.kind !== 'consumption') continue;
      if (!(w.inclusiveStart ? e.at >= w.from : e.at > w.from) || e.at > w.to) continue;
      for (const c of components(e)) {
        if (c.substance !== w.substance || productOf(c, settings) !== w.productId) continue;
        if (c.substance === 'cannabis' && (c.unit || 'g') !== 'g') continue;
        if (c.method === 'auto') {
          const wt = weightOf(e, c, priors);
          if (wt != null) { units += wt; autos.push({ e, c, wt }); }
        } else if (isNum(c.amount)) known += c.amount;
      }
    }
    const rest = w.consumed - known;
    if (!(units > 0) || !(rest > 0)) continue;
    const k = rest / units;
    // Vape : k = ml par session (pas de valeur de départ) ; bornes larges.
    const bounded = w.substance === 'liquid' ? k > 0 && k < 50 : k >= K_MIN && k <= K_MAX;
    if (!bounded) continue;
    const seg = { ...w, k, units, count: autos.length, weight: units * w.quality, exact: w.quality === 1 };
    out.segments.push(seg);
    for (const a of autos) segOf.set(`${a.e.id}|${a.c.path}`, seg);
  }

  for (const sub of AUTO_SUBSTANCES) {
    const segs = out.segments.filter((s) => s.substance === sub).sort((a, b) => (a.to < b.to ? -1 : 1));
    const recent = segs.slice(-MAX_SEGMENTS);
    const wsum = recent.reduce((t, g) => t + g.weight, 0);
    out.factors[sub] = wsum ? recent.reduce((t, g) => t + g.k * g.weight, 0) / wsum : (sub === 'liquid' ? null : 1);
    out.calibrations[sub] = segs.length;
    const byP = new Map();
    for (const g of segs) { const l = byP.get(g.productId) || []; l.push(g); byP.set(g.productId, l); }
    for (const [pid, l] of byP) {
      const r = l.slice(-MAX_SEGMENTS); const ws = r.reduce((t, g) => t + g.weight, 0);
      out.byProduct.set(pid, { k: r.reduce((t, g) => t + g.k * g.weight, 0) / ws, n: l.length, substance: sub });
    }
  }
  // Alias V1
  out.factors.cbd = out.factors.cannabis;
  out.calibrations.cbd = out.calibrations.cannabis;

  for (const e of entries) {
    if (e.kind !== 'consumption') continue;
    const q = {}; const b = {};
    for (const c of components(e)) {
      if (c.method !== 'auto' || !AUTO_SUBSTANCES.includes(c.substance)) continue;
      if (c.substance === 'cannabis' && (c.unit || 'g') !== 'g') continue;
      const wt = weightOf(e, c, priors);
      if (wt == null) continue;
      const seg = segOf.get(`${e.id}|${c.path}`);
      const prodK = out.byProduct.get(productOf(c, settings));
      let k; let basis;
      if (seg) { k = seg.k; basis = 'segment'; }
      else if (prodK) { k = prodK.k; basis = 'product'; }
      else if (out.calibrations[c.substance]) { k = out.factors[c.substance]; basis = 'average'; }
      else if (c.substance === 'liquid') continue; // aucune valeur générique pour la vape
      else { k = 1; basis = 'default'; }
      const key = c.path === 'tobacco' ? 'tobacco' : c.path;
      q[key] = round2(wt * k);
      b[key] = basis;
    }
    if (Object.keys(q).length) { out.quantities.set(e.id, q); out.bases.set(e.id, b); }
  }
  return out;
}

/** Ancienne API : quantité auto d'une catégorie (valeur de départ × facteur). */
export function autoEstimate(categoryId, substance, settings, factors) {
  const p = priorsOf(settings);
  let v;
  if (categoryId === 'joint') v = substance === 'tobacco' ? p.jointMix.tobacco : p.jointMix.cannabis;
  else if (categoryId === 'rolled') v = substance === 'tobacco' ? p.rolled.tobacco : null;
  else if (categoryId === 'cbd') v = substance === 'cbd' ? p.cbd.cannabis : null;
  else if (categoryId === 'pipe' || categoryId === 'hookah') v = substance === 'tobacco' ? p[categoryId].tobacco : null;
  else v = substance === 'tobacco' ? p.custom.tobacco : p.custom.cannabis;
  if (!isNum(v)) return null;
  const f = substance === 'tobacco' ? factors?.tobacco : (factors?.cannabis ?? factors?.cbd);
  return round2(v * (isNum(f) ? f : 1));
}

/**
 * Quantité auto d'un composant précis d'une entrée (variante, produit,
 * fraction consommée). { amount, basis } ou null si indisponible.
 */
export function autoEstimateFor(entry, path, settings, cal) {
  const c = components(entry).find((x) => x.path === path);
  if (!c || !AUTO_SUBSTANCES.includes(c.substance)) return null;
  const wt = weightOf(entry, c, priorsOf(settings));
  if (wt == null) return null;
  const prodK = cal?.byProduct?.get(productOf(c, settings));
  if (prodK) return { amount: round2(wt * prodK.k), basis: 'product' };
  if (cal?.calibrations?.[c.substance]) return { amount: round2(wt * cal.factors[c.substance]), basis: 'average' };
  if (c.substance === 'liquid') return null;
  return { amount: round2(wt), basis: 'default' };
}

/** Entrées dont une quantité « auto » (ou sa base) doit être mise à jour. */
export function autoUpdates(entries, calibration) {
  const changed = [];
  for (const e of entries) {
    const q = calibration.quantities.get(e.id);
    if (!q) continue;
    const b = calibration.bases?.get(e.id) || {};
    let next = e;
    for (const [path, amount] of Object.entries(q)) {
      const comp = components(next).find((c) => c.path === path);
      if (!comp || comp.method !== 'auto') continue;
      const key = amountKeyOf(path);
      if (Math.abs((comp.amount ?? -1) - amount) > 0.004 || (b[path] && comp.basis !== b[path])) {
        next = withComponent(next, path, { [key]: amount, ...(b[path] ? { basis: b[path] } : {}) });
      }
    }
    if (next !== e) changed.push(next);
  }
  return changed;
}

/** Restant estimé d'un paquet ouvert. */
export function packRemaining(pack, entries, settings) {
  const pts = packMarkers(pack);
  const last = pts[pts.length - 1];
  if (pack.finishedAt) return { remaining: 0, since: last.at };
  const sub = SUBSTANCE_OF_KIND[pack.kind];
  let used = 0; let n = 0;
  for (const e of entries) {
    if (e.kind !== 'consumption' || (pts.length === 1 ? e.at < last.at : e.at <= last.at)) continue;
    for (const c of components(e)) {
      if (c.substance !== sub || productOf(c, settings) !== pack.productId) continue;
      if (isNum(c.amount)) { used += c.amount; n += 1; }
    }
  }
  return { remaining: Math.max(0, last.remaining - used), used, count: n, since: last.at, base: last.remaining };
}

/** Niveau de précision de l'estimation pour une substance. */
export function precisionLabel(calibrations) {
  if (!calibrations) return { level: 0, label: 'Estimation provisoire', hint: 'Déclare tes paquets ou ton stock pour que l’app calcule tes vraies quantités.' };
  if (calibrations < 2) return { level: 1, label: 'Calculée sur 1 repère', hint: 'Chaque paquet terminé ou comptage de stock affine le calcul.' };
  if (calibrations < 4) return { level: 2, label: `Calculée sur ${calibrations} repères`, hint: 'Le calcul se précise.' };
  return { level: 3, label: `Précise (${calibrations} repères)`, hint: 'Basée sur ta consommation réelle.' };
}

/**
 * Tableau des moyennes par variante : valeur de départ, valeur calculée,
 * moyennes des saisies pesées et estimées (séparées), nombre d'observations.
 */
export function averagesTable(entries, settings, cal) {
  const priors = priorsOf(settings);
  const rows = new Map();
  for (const e of entries) {
    if (e.kind !== 'consumption') continue;
    for (const c of components(e)) {
      if (!AUTO_SUBSTANCES.includes(c.substance) || !isNum(c.amount)) continue;
      if (c.substance === 'cannabis' && (c.unit || 'g') !== 'g') continue;
      const key = priorKeyFor(e, c);
      if (!key) continue;
      const id = `${key}|${c.substance}`;
      const r = rows.get(id) || { key, substance: c.substance, label: PRIOR_LABELS[key], start: priors[key]?.[SUB_KEY[c.substance]] ?? null, weighed: [], estimated: [], calculated: [], provisional: 0 };
      if (c.method === 'weighed') r.weighed.push(c.amount);
      else if (c.method === 'estimated') r.estimated.push(c.amount);
      else if (c.method === 'auto') { if (c.basis && c.basis !== 'default') r.calculated.push(c.amount); else r.provisional += 1; }
      rows.set(id, r);
    }
  }
  const avg = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
  return [...rows.values()].map((r) => ({
    ...r,
    weighedAvg: avg(r.weighed), weighedN: r.weighed.length,
    estimatedAvg: avg(r.estimated), estimatedN: r.estimated.length,
    calculatedAvg: avg(r.calculated), calculatedN: r.calculated.length,
    current: isNum(r.start) && cal?.calibrations?.[r.substance] ? round2(r.start * cal.factors[r.substance]) : (r.substance === 'liquid' && cal?.factors?.liquid ? round2(cal.factors.liquid) : null),
  })).sort((a, b) => (b.weighedN + b.estimatedN + b.calculatedN + b.provisional) - (a.weighedN + a.estimatedN + a.calculatedN + a.provisional));
}
