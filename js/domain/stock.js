// Suivi des stocks (facultatif).
//
// Le stock n'est jamais « décrémenté » en place : il est recalculé à partir
// d'un registre (inventaires, achats, consommations). Corriger une
// consommation corrige donc automatiquement le stock.
//
//  stock = dernier inventaire (ou 0 au premier achat suivi)
//        + achats ajoutés au stock postérieurs
//        − consommations postérieures dont la quantité est connue.
// Les consommations sans quantité ne sont jamais déduites : elles sont comptées
// à part pour signaler une estimation incomplète.

import { diffDays, addDays } from '../core/dates.js';
import { isNum } from '../core/format.js';
import { purchaseQuantity, purchaseTotal, resolveProduct } from './costs.js';
import { components } from './methods.js';
import { isConsumption } from './stats.js';
import { normalizeAccessories } from './models.js';

/** Quantité consommée d'un produit par une entrée (null si inconnue, 0 si non concernée). */
export function usageOf(entry, product, settings) {
  if (!isConsumption(entry)) return 0;
  if (product.kind === 'accessory') {
    let n = 0;
    for (const a of normalizeAccessories(entry.accessories)) {
      if (resolveProduct(settings, a.type, a.productId) === product.id) n += a.count;
    }
    return n;
  }
  let total = 0; let unknown = false; let concerned = false;
  for (const c of components(entry)) {
    if (c.productKind !== product.kind) continue;
    if (resolveProduct(settings, c.productKind, c.productId) !== product.id) continue;
    concerned = true;
    if (c.substance === 'cannabis' && c.unit && c.unit !== product.unit) { unknown = true; continue; }
    if (isNum(c.amount)) total += c.amount; else unknown = true;
  }
  if (!concerned) return 0;
  return unknown && total === 0 ? null : total;
}

export function stockLedger(product, { purchases, inventories, entries, settings }) {
  const since = settings.stock?.since || null;
  const events = [];
  for (const inv of inventories.filter((i) => i.productId === product.id)) {
    // type : 'count' / 'initial' (quantité comptée, absolue), 'adjust' (± relatif), 'loss' (perte)
    const t = inv.type || 'count';
    if (t === 'adjust' || t === 'loss') events.push({ at: inv.at, type: t, qty: t === 'loss' ? -Math.abs(inv.quantity) : inv.quantity, ref: inv });
    else events.push({ at: inv.at, type: 'inventory', qty: inv.quantity, ref: inv, rank: t === 'initial' ? 0 : 3 });
  }
  for (const p of purchases.filter((x) => x.productId === product.id && x.addToStock !== false)) {
    const q = purchaseQuantity(p);
    if (q != null) events.push({ at: `${p.date}T00:00`, type: 'purchase', qty: q, ref: p });
  }
  for (const e of entries) {
    const u = usageOf(e, product, settings);
    if (u === 0) continue;
    events.push({ at: e.at, type: 'usage', qty: u, ref: e });
  }
  // À horodatage égal : stock initial, puis achats, consommations et ajustements, puis comptage réel.
  const rank = (ev) => ev.rank ?? (ev.type === 'purchase' ? 1 : 2);
  events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : rank(a) - rank(b)));
  return { events, since };
}

/**
 * Stock courant d'un produit.
 * @returns {{quantity:number|null, unknownUsages:number, history:Array, avgDaily:number|null, daysLeft:number|null}}
 */
export function computeStock(product, data, today) {
  const { events, since } = stockLedger(product, data);
  let qty = null;
  let unknown = 0;
  let losses = 0;
  const history = [];
  for (const ev of events) {
    if (since && ev.at.slice(0, 10) < since && ev.type !== 'inventory') continue;
    if (ev.type === 'inventory') { qty = ev.qty; unknown = 0; }
    else if (ev.type === 'purchase') { qty = (qty ?? 0) + ev.qty; }
    else if (ev.type === 'adjust' || ev.type === 'loss') { qty = (qty ?? 0) + ev.qty; }
    else if (ev.type === 'usage') {
      if (qty == null) continue; // rien à déduire tant qu'aucun stock n'est connu
      if (ev.qty == null) { unknown += 1; continue; }
      qty -= ev.qty;
    }
    if (qty != null) history.push({ at: ev.at, type: ev.type, qty, delta: ev.type === 'usage' ? -ev.qty : ev.qty });
    if (ev.type === 'loss') losses += -ev.qty;
  }
  // Consommation moyenne quotidienne sur les 30 derniers jours (quantités connues).
  const start = addDays(today, -29);
  let used = 0;
  let firstDay = null;
  for (const ev of events) {
    if (ev.type !== 'usage' || ev.qty == null) continue;
    const d = ev.at.slice(0, 10);
    if (d < start || d > today) continue;
    used += ev.qty;
    if (!firstDay || d < firstDay) firstDay = d;
  }
  const days = firstDay ? diffDays(firstDay, today) + 1 : 0;
  const avgDaily = days ? used / days : null;
  const daysLeft = qty != null && avgDaily ? Math.max(0, qty / avgDaily) : null;
  return { quantity: qty, unknownUsages: unknown, history, avgDaily, daysLeft, losses };
}

/**
 * Finances d'un produit : argent dépensé à l'achat, prix moyen pondéré,
 * valeur du stock restant. (≠ coût des quantités consommées.)
 */
export function productFinance(product, purchases, stockQty = null) {
  const list = purchases.filter((p) => p.productId === product.id);
  let spent = 0; let qty = 0;
  for (const p of list) {
    const t = purchaseTotal(p); const q = purchaseQuantity(p);
    if (isNum(t)) spent += t;
    if (isNum(t) && isNum(q) && q > 0) qty += q;
  }
  const pricedSpent = list.reduce((t, p) => (isNum(purchaseTotal(p)) && isNum(purchaseQuantity(p)) ? t + purchaseTotal(p) : t), 0);
  const avgUnitPrice = qty > 0 ? pricedSpent / qty : null;
  return {
    purchases: list.length, spent, quantity: qty, avgUnitPrice,
    stockValue: isNum(stockQty) && avgUnitPrice != null ? Math.max(0, stockQty) * avgUnitPrice : null,
    lastPrice: list.length ? [...list].sort((a, b) => (a.date < b.date ? 1 : -1))[0] : null,
  };
}
