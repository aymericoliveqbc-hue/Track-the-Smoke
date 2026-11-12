// Export / import des données (sauvegarde complète, format JSON versionné)
// et export CSV du journal.

import { SCHEMA_VERSION, CAT, labelOf, CONTEXTS, TRIGGERS, MOODS } from './models.js';
import { isDayKey, isLocalDateTime } from '../core/dates.js';

export const STORES = ['entries', 'nights', 'products', 'purchases', 'inventories', 'categories', 'goals'];
export const APP_ID = 'track-the-smoke';

export function buildExport(state, { demo = false } = {}) {
  const data = {};
  for (const s of STORES) data[s] = state[s] || [];
  const settings = { ...state.settings };
  // Les secrets de verrouillage ne quittent pas l'appareil.
  settings.privacy = { ...settings.privacy, pinHash: null, pinSalt: null, pinLength: null, credentialId: null, lock: 'none' };
  return {
    app: APP_ID,
    schema: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    demo,
    counts: Object.fromEntries(STORES.map((s) => [s, data[s].length])),
    settings,
    data,
  };
}

/** Valide et normalise une sauvegarde. Ne modifie rien. */
export function validateImport(json) {
  const errors = [];
  let obj = json;
  if (typeof json === 'string') {
    try { obj = JSON.parse(json); } catch { return { ok: false, errors: ['Le fichier n’est pas un JSON valide.'] }; }
  }
  if (!obj || obj.app !== APP_ID) return { ok: false, errors: ['Ce fichier ne provient pas de TRACK THE SMOKE.'] };
  if (typeof obj.schema !== 'number' || obj.schema > SCHEMA_VERSION) {
    return { ok: false, errors: ['Cette sauvegarde provient d’une version plus récente de l’application.'] };
  }
  const data = {};
  for (const s of STORES) {
    const arr = obj.data?.[s];
    if (arr == null) { data[s] = []; continue; }
    if (!Array.isArray(arr)) { errors.push(`Section « ${s} » invalide.`); continue; }
    data[s] = arr.filter((x) => x && typeof x.id === 'string');
    if (data[s].length !== arr.length) errors.push(`${arr.length - data[s].length} élément(s) sans identifiant ignoré(s) dans « ${s} ».`);
  }
  const badEntries = data.entries.filter((e) => !isLocalDateTime(e.at) || !['consumption', 'craving'].includes(e.kind));
  if (badEntries.length) {
    errors.push(`${badEntries.length} entrée(s) du journal mal formée(s) ignorée(s).`);
    data.entries = data.entries.filter((e) => !badEntries.includes(e));
  }
  const badNights = data.nights.filter((n) => !isDayKey(n.date));
  if (badNights.length) {
    errors.push(`${badNights.length} nuit(s) mal formée(s) ignorée(s).`);
    data.nights = data.nights.filter((n) => !badNights.includes(n));
  }
  return { ok: true, warnings: errors, data, settings: obj.settings || null, demo: !!obj.demo, exportedAt: obj.exportedAt, counts: Object.fromEntries(STORES.map((s) => [s, data[s].length])) };
}

/** Fusion : les éléments importés remplacent ceux de même identifiant. */
export function mergeData(current, incoming) {
  const out = {};
  for (const s of STORES) {
    const map = new Map((current[s] || []).map((x) => [x.id, x]));
    for (const x of incoming[s] || []) map.set(x.id, x);
    out[s] = [...map.values()];
  }
  return out;
}

const csvCell = (v) => {
  if (v == null) return '';
  const s = String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const dec = (n) => (typeof n === 'number' && Number.isFinite(n) ? String(Math.round(n * 10000) / 10000).replace('.', ',') : '');

/** CSV (séparateur « ; », décimales à virgule) lisible dans un tableur français. */
export function entriesToCSV(entries, categories, costFn) {
  const catName = (id) => categories.find((c) => c.id === id)?.name || id;
  const head = ['date', 'heure', 'type', 'categorie', 'tabac_g', 'tabac_methode', 'cbd_quantite', 'cbd_unite', 'cbd_methode', 'accessoires',
    'cout_total', 'cout_complet', 'contexte', 'humeur', 'envie_intensite', 'envie_issue', 'declencheur', 'duree_min', 'commentaire'];
  const rows = [head.join(';')];
  const sorted = [...entries].sort((a, b) => (a.at < b.at ? -1 : 1));
  for (const e of sorted) {
    const c = e.kind === 'consumption' && costFn ? costFn(e) : null;
    rows.push([
      e.at.slice(0, 10), e.at.slice(11, 16), e.kind === 'craving' ? 'envie' : 'consommation',
      e.kind === 'consumption' ? catName(e.categoryId) : '',
      dec(e.tobacco?.grams), e.tobacco?.method || '',
      dec(e.cbd?.amount), e.cbd?.unit || '', e.cbd?.method || '',
      (e.accessories || []).map((a) => `${a.type}x${a.count}`).join(' '),
      c ? dec(c.total) : '', c ? (c.complete ? 'oui' : 'non') : '',
      labelOf(CONTEXTS, e.context) || e.situation || '', labelOf(MOODS, e.mood) || e.emotion || '',
      e.kind === 'craving' ? e.intensity : '', e.kind === 'craving' ? (e.outcome === 'consumed' ? 'consommée' : 'résistée') : '',
      e.kind === 'craving' ? (labelOf(TRIGGERS, e.trigger) || '') : '', e.durationMin ?? '', e.note || '',
    ].map(csvCell).join(';'));
  }
  return '﻿' + rows.join('\r\n');
}

export { CAT };
