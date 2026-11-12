// Estimation automatique des quantités (sans balance).
//
// Principe :
//  1. chaque catégorie a une valeur de départ générique (modifiable) :
//     ex. roulée 0,30 g de tabac, joint 0,20 g de tabac + 0,20 g de CBD ;
//  2. l'utilisateur déclare ses paquets (contenance, déjà entamé ou non) et,
//     quand il le souhaite, ce qu'il en reste (« environ la moitié ») ou
//     qu'un paquet est terminé ;
//  3. entre deux repères, la quantité réellement partie du paquet est connue
//     (à l'œil près) : elle est répartie entre les consommations « auto »
//     de cette période, au prorata de leurs valeurs de départ, après avoir
//     retiré les quantités saisies à la main (pesées ou estimées) ;
//  4. le facteur obtenu (réel / générique) s'applique rétroactivement à la
//     période et, en moyenne pondérée, aux consommations sans repère.
//
// Les quantités produites sont marquées method: 'auto' et sont toujours
// distinguées des quantités pesées ou estimées à la main.

import { isNum, round2 } from '../core/format.js';
import { uid } from './models.js';
import { resolveProduct } from './costs.js';

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

export function priorsOf(settings) {
  const p = settings?.autoPriors || {};
  return {
    joint: { ...DEFAULT_PRIORS.joint, ...(p.joint || {}) },
    rolled: { ...DEFAULT_PRIORS.rolled, ...(p.rolled || {}) },
    cbd: { ...DEFAULT_PRIORS.cbd, ...(p.cbd || {}) },
    custom: { ...DEFAULT_PRIORS.custom, ...(p.custom || {}) },
  };
}

/** Valeur de départ d'une consommation pour une substance (null si sans objet). */
export function priorFor(entry, substance, priors) {
  if (entry.kind !== 'consumption' || !entry[substance]) return null;
  if (substance === 'cbd' && (entry.cbd.unit || 'g') !== 'g') return null;
  const key = ['joint', 'rolled', 'cbd'].includes(entry.categoryId) ? entry.categoryId : 'custom';
  const v = priors[key]?.[substance];
  return isNum(v) && v > 0 ? v : null;
}

const qtyOf = (e, s) => (s === 'tobacco' ? e.tobacco?.grams : e.cbd?.amount);
const methodOf = (e, s) => (s === 'tobacco' ? e.tobacco?.method : e.cbd?.method);
const productOf = (e, s, settings) => resolveProduct(settings, s, s === 'tobacco' ? e.tobacco?.productId : e.cbd?.productId);

export function newPack({ productId, kind, size, openedAt, startRemaining = null }) {
  return {
    id: uid('pack'), productId, kind, size,
    openedAt, startRemaining: isNum(startRemaining) ? startRemaining : size,
    checkpoints: [], finishedAt: null, createdAt: new Date().toISOString(),
  };
}

/** Repères d'un paquet : [{at, remaining, quality}] triés. */
function markers(pack) {
  const pts = [{ at: pack.openedAt, remaining: pack.startRemaining, quality: pack.startRemaining === pack.size ? 1 : 0.6 }];
  for (const c of [...(pack.checkpoints || [])].sort((a, b) => (a.at < b.at ? -1 : 1))) {
    if (pack.finishedAt && c.at > pack.finishedAt) continue;
    pts.push({ at: c.at, remaining: c.remaining, quality: 0.6 });
  }
  if (pack.finishedAt) pts.push({ at: pack.finishedAt, remaining: 0, quality: 1 });
  return pts;
}

/**
 * Calcule les facteurs de calibration et les quantités « auto ».
 * @returns {{ factors: {tobacco, cbd}, calibrations: {tobacco: n, cbd: n}, segments: [], quantities: Map<entryId, {tobacco?, cbd?}> }}
 */
export function calibrate(entries, packs, settings) {
  const priors = priorsOf(settings);
  const out = { factors: {}, calibrations: {}, segments: [], quantities: new Map() };
  const segOfEntry = { tobacco: new Map(), cbd: new Map() };

  for (const s of ['tobacco', 'cbd']) {
    const segs = [];
    for (const pack of packs.filter((p) => p.kind === s)) {
      const pts = markers(pack);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]; const b = pts[i];
        const consumed = a.remaining - b.remaining;
        // L'ouverture est incluse (consommation à la minute même), les repères suivants sont exclusifs.
        const inside = entries.filter((e) => e.kind === 'consumption' && e[s] && (i === 1 ? e.at >= a.at : e.at > a.at) && e.at <= b.at && productOf(e, s, settings) === pack.productId
          && (s !== 'cbd' || (e.cbd.unit || 'g') === 'g'));
        let known = 0; let units = 0; const auto = [];
        for (const e of inside) {
          if (methodOf(e, s) === 'auto' || !isNum(qtyOf(e, s))) {
            const p = priorFor(e, s, priors);
            if (p != null && methodOf(e, s) === 'auto') { units += p; auto.push(e); }
          } else known += qtyOf(e, s);
        }
        const rest = consumed - known;
        if (!(units > 0) || !(rest > 0)) continue;
        const k = rest / units;
        if (k < K_MIN || k > K_MAX) continue;
        const seg = { substance: s, packId: pack.id, from: a.at, to: b.at, consumed, k, units, count: auto.length, weight: units * Math.min(a.quality, b.quality), exact: a.quality === 1 && b.quality === 1 };
        segs.push(seg);
        for (const e of auto) segOfEntry[s].set(e.id, seg);
      }
    }
    segs.sort((x, y) => (x.to < y.to ? -1 : 1));
    const recent = segs.slice(-MAX_SEGMENTS);
    const wsum = recent.reduce((t, g) => t + g.weight, 0);
    out.factors[s] = wsum ? recent.reduce((t, g) => t + g.k * g.weight, 0) / wsum : 1;
    out.calibrations[s] = segs.length;
    out.segments.push(...segs);
  }

  for (const e of entries) {
    if (e.kind !== 'consumption') continue;
    const q = {};
    for (const s of ['tobacco', 'cbd']) {
      if (!e[s] || methodOf(e, s) !== 'auto') continue;
      const p = priorFor(e, s, priors);
      if (p == null) continue;
      const seg = segOfEntry[s].get(e.id);
      q[s] = round2(p * (seg ? seg.k : out.factors[s]));
    }
    if (Object.keys(q).length) out.quantities.set(e.id, q);
  }
  return out;
}

/** Quantité « auto » courante pour une nouvelle consommation. */
export function autoEstimate(categoryId, substance, settings, factors) {
  const p = priorFor({ kind: 'consumption', categoryId, [substance]: { unit: 'g' } }, substance, priorsOf(settings));
  return p == null ? null : round2(p * (factors?.[substance] ?? 1));
}

/** Entrées dont la quantité « auto » doit être mise à jour. */
export function autoUpdates(entries, calibration) {
  const changed = [];
  for (const e of entries) {
    const q = calibration.quantities.get(e.id);
    if (!q) continue;
    let next = null;
    if (q.tobacco != null && e.tobacco && Math.abs((e.tobacco.grams ?? -1) - q.tobacco) > 0.004) next = { ...(next || e), tobacco: { ...e.tobacco, grams: q.tobacco } };
    if (q.cbd != null && e.cbd && Math.abs((e.cbd.amount ?? -1) - q.cbd) > 0.004) next = { ...(next || e), cbd: { ...e.cbd, amount: q.cbd } };
    if (next) changed.push(next);
  }
  return changed;
}

/** Restant estimé d'un paquet ouvert. */
export function packRemaining(pack, entries, settings) {
  const pts = markers(pack);
  const last = pts[pts.length - 1];
  if (pack.finishedAt) return { remaining: 0, since: last.at };
  let used = 0; let n = 0;
  for (const e of entries) {
    if (e.kind !== 'consumption' || !e[pack.kind] || (pts.length === 1 ? e.at < last.at : e.at <= last.at)) continue;
    if (productOf(e, pack.kind, settings) !== pack.productId) continue;
    const q = qtyOf(e, pack.kind);
    if (isNum(q)) { used += q; n += 1; }
  }
  return { remaining: Math.max(0, last.remaining - used), used, count: n, since: last.at, base: last.remaining };
}

/** Niveau de précision de l'estimation pour une substance. */
export function precisionLabel(calibrations) {
  if (!calibrations) return { level: 0, label: 'Estimation générique', hint: 'Déclare tes paquets pour que l’app apprenne tes vraies quantités.' };
  if (calibrations < 2) return { level: 1, label: 'Ajustée sur ton premier repère', hint: 'Chaque paquet terminé ou entamé affine l’estimation.' };
  if (calibrations < 4) return { level: 2, label: `Ajustée sur ${calibrations} repères`, hint: 'L’estimation se précise.' };
  return { level: 3, label: `Précise (${calibrations} repères)`, hint: 'Estimation basée sur ta consommation réelle.' };
}
