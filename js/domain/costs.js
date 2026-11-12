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

/**
 * Coût d'une consommation.
 * @returns {{tobacco:number|null, cbd:number|null, accessories:number|null,
 *   total:number, complete:boolean, missing:string[]}}
 */
export function entryCost(entry, ctx) {
  const res = { tobacco: null, cbd: null, accessories: 0, total: 0, complete: true, missing: [] };
  if (!entry || entry.kind !== 'consumption') return { ...res, accessories: null };
  const day = entry.at.slice(0, 10);
  const { index, settings } = ctx;

  if (entry.tobacco) {
    const g = entry.tobacco.grams;
    const pid = resolveProduct(settings, 'tobacco', entry.tobacco.productId);
    const { price } = priceAt(index, pid, day);
    if (!isNum(g)) { res.complete = false; res.missing.push('quantité de tabac'); }
    else if (price == null) { res.complete = false; res.missing.push('prix du tabac'); }
    else { res.tobacco = g * price; res.total += res.tobacco; }
  }

  if (entry.cbd) {
    const q = entry.cbd.amount;
    const pid = resolveProduct(settings, 'cbd', entry.cbd.productId);
    const slot = index.get(pid);
    const { price } = priceAt(index, pid, day);
    const unitOk = !slot || !entry.cbd.unit || slot.product.unit === entry.cbd.unit;
    if (!isNum(q)) { res.complete = false; res.missing.push('quantité de CBD'); }
    else if (!unitOk) { res.complete = false; res.missing.push('unité du CBD différente du produit'); }
    else if (price == null) { res.complete = false; res.missing.push('prix du CBD'); }
    else { res.cbd = q * price; res.total += res.cbd; }
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

/** Mémoïsation simple des coûts (invalidée quand l'index change). */
export function makeCostFn(ctx) {
  const cache = new Map();
  return (entry) => {
    const key = entry.id + '|' + (entry.updatedAt || '');
    if (!cache.has(key)) cache.set(key, entryCost(entry, ctx));
    return cache.get(key);
  };
}
