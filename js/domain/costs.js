// Calculs financiers centralisés.
//
// Règles :
//  - prix unitaire = prix du paquet / contenance du paquet ;
//  - le prix appliqué à une consommation est celui du dernier achat du
//    produit effectué au plus tard le jour de la consommation ; à défaut,
//    le tarif de référence du produit ; à défaut, le premier achat connu ;
//  - une donnée manquante (quantité ou prix) n'est jamais remplacée :
//    le coût correspondant est null et l'entrée est signalée incomplète ;
//  - les accessoires sont comptés une seule fois par ligne (cf. normalizeAccessories).

import { isNum } from '../core/format.js';
import { normalizeAccessories } from './models.js';
import { components, moleculeClass } from './methods.js';

export function unitPrice(packPrice, packSize) {
  if (!isNum(packPrice) || !isNum(packSize) || packPrice < 0 || packSize <= 0) return null;
  return packPrice / packSize;
}

/** Total payé pour un achat. */
export function purchaseTotal(p) {
  if (!isNum(p.packPrice)) return null;
  return p.packPrice * (isNum(p.packCount) && p.packCount > 0 ? p.packCount : 1);
}

/** Quantité totale achetée (g, ml, unités…). */
export function purchaseQuantity(p) {
  if (!isNum(p.packSize)) return null;
  return p.packSize * (isNum(p.packCount) && p.packCount > 0 ? p.packCount : 1);
}

/** Index des prix : productId -> { history: [{date, price}], ref } */
export function buildPriceIndex(products = [], purchases = []) {
  const index = new Map();
  for (const prod of products) {
    index.set(prod.id, { product: prod, history: [], ref: unitPrice(prod.refPackPrice, prod.refPackSize) });
  }
  for (const p of purchases) {
    const slot = index.get(p.productId);
    if (!slot) continue;
    const price = unitPrice(p.packPrice, p.packSize);
    if (price == null) continue;
    slot.history.push({ date: p.date, price, purchaseId: p.id });
  }
  for (const slot of index.values()) slot.history.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return index;
}

/** Prix unitaire applicable à un produit pour un jour donné. */
export function priceAt(index, productId, day) {
  const slot = index.get(productId);
  if (!slot) return { price: null, source: null };
  let found = null;
  for (const h of slot.history) {
    if (h.date <= day) found = h; else break;
  }
  if (found) return { price: found.price, source: 'purchase' };
  if (slot.ref != null) return { price: slot.ref, source: 'reference' };
  if (slot.history.length) return { price: slot.history[0].price, source: 'purchase-later' };
  return { price: null, source: null };
}

/** Produit à utiliser pour une ligne (produit choisi ou produit par défaut). */
export function resolveProduct(settings, kind, explicitId) {
  if (explicitId) return explicitId;
  return settings?.defaultProducts?.[kind] ?? null;
}

const SUB_LABEL = {
  tobacco: 'tabac', cbd: 'CBD', thc: 'THC', unknown: 'cannabinoïde', liquid: 'liquide', cigarettes: 'cigarettes', cigars: 'cigares', puffs: 'bouffées',
};

/** Poste de coût d'un composant (clé de ventilation). */
export function costKey(c) {
  if (c.substance === 'cannabis') return moleculeClass(c.molecule);
  if (c.substance === 'units') return c.productKind === 'cigars' ? 'cigars' : 'cigarettes';
  if (c.substance === 'puffs') return 'puffs';
  return c.substance; // tobacco | liquid
}

/**
 * Coût d'une consommation, composant par composant (moteur unique).
 * @returns {{tobacco, cbd, thc, unknown, liquid, cigarettes, cigars, puffs, accessories,
 *   total, complete, missing:string[], nicotineMg:number|null, estimatedParts:string[]}}
 */
export function entryCost(entry, ctx) {
  const res = {
    tobacco: null, cbd: null, thc: null, unknown: null, liquid: null, cigarettes: null, cigars: null, puffs: null,
    accessories: 0, total: 0, complete: true, missing: [], nicotineMg: null, estimatedParts: [],
  };
  if (!entry || entry.kind !== 'consumption') return { ...res, accessories: null };
  const day = entry.at.slice(0, 10);
  const { index, settings } = ctx;
  const add = (k, v) => { res[k] = (res[k] || 0) + v; res.total += v; };

  for (const c of components(entry)) {
    const key = costKey(c);
    const label = SUB_LABEL[key] || 'produit';
    const pid = resolveProduct(settings, c.productKind, c.productId);
    const slot = index.get(pid);
    let { price } = priceAt(index, pid, day);
    const unitOk = !slot || c.substance !== 'cannabis' || !c.unit || slot.product.unit === c.unit;
    if (!isNum(c.amount)) { res.complete = false; res.missing.push(`quantité de ${label}`); continue; }
    if (!unitOk) { res.complete = false; res.missing.push(`unité du ${label} différente du produit`); continue; }
    if (c.substance === 'puffs' && price != null) {
      // Prix par bouffée : annoncé (estimation) tant que la puff n'est pas terminée,
      // puis réel (prix / bouffées réellement enregistrées).
      const f = ctx.puffActual?.get(pid);
      if (f) price *= f; else res.estimatedParts.push('bouffées');
    }
    if (price == null) { res.complete = false; res.missing.push(`prix du ${label}`); }
    else add(key, c.amount * price);
    // Nicotine CONTENUE dans le produit consommé (≠ nicotine absorbée).
    const prod = slot?.product;
    if (c.substance === 'liquid' && isNum(prod?.nicotineMgPerMl)) res.nicotineMg = (res.nicotineMg || 0) + c.amount * prod.nicotineMgPerMl;
    if (c.substance === 'units' && isNum(prod?.nicotinePerUnit)) res.nicotineMg = (res.nicotineMg || 0) + c.amount * prod.nicotinePerUnit;
  }

  for (const a of normalizeAccessories(entry.accessories)) {
    const pid = resolveProduct(settings, a.type, a.productId);
    const { price } = priceAt(index, pid, day);
    if (price == null) {
      res.complete = false;
      res.missing.push(`prix ${a.type === 'filter' ? 'des filtres' : a.type === 'slim' ? 'des feuilles slim' : a.type === 'classic' ? 'des feuilles classiques' : "d'un accessoire"}`);
      continue;
    }
    res.accessories += price * a.count;
  }
  res.total += res.accessories;
  return res;
}

/**
 * Facteur prix réel / prix annoncé des puffs terminées :
 * bouffées annoncées / bouffées réellement enregistrées.
 */
export function puffActualFactors(products, purchases, entries) {
  const out = new Map();
  for (const p of products.filter((x) => x.kind === 'puff' && x.finishedAt)) {
    const announced = purchases.filter((x) => x.productId === p.id && isNum(x.packSize)).map((x) => x.packSize).pop() ?? p.refPackSize;
    const recorded = entries.filter((e) => e.kind === 'consumption' && e.puffs?.productId === p.id && e.at <= p.finishedAt && (!p.openedAt || e.at >= p.openedAt))
      .reduce((t, e) => t + (e.puffs.count || 0), 0);
    if (isNum(announced) && recorded > 0) out.set(p.id, announced / recorded);
  }
  return out;
}

/** Mémoïsation simple des coûts (invalidée quand l'index change). */
export function makeCostFn(ctx) {
  const cache = new Map();
  return (entry) => {
    const key = entry.id + '|' + (entry.updatedAt || '');
    if (!cache.has(key)) cache.set(key, entryCost(entry, ctx));
    return cache.get(key);
  };
}
