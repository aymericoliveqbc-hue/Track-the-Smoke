// État applicatif en mémoire + persistance IndexedDB.
// Toute écriture passe par ce module ; toute vue lit `state` et `derived()`.

import { DB, DB_MAIN, DB_DEMO } from './db.js';
import { dayKey, nowLocal } from './dates.js';
import { setCurrency } from './format.js';
import { defaultSettings, defaultProducts, SYSTEM_CATEGORIES, SCHEMA_VERSION } from '../domain/models.js';
import { buildPriceIndex, makeCostFn } from '../domain/costs.js';
import { trackingStartOf } from '../domain/stats.js';
import { computeBaseline, observationStatus } from '../domain/goals.js';
import { buildDemoData } from '../domain/demo.js';
import { STORES } from '../domain/backup.js';
import { calibrate, autoUpdates } from '../domain/autoqty.js';

export const state = {
  mode: 'main',
  settings: defaultSettings(),
  entries: [], nights: [], products: [], purchases: [], inventories: [], categories: [], goals: [], packs: [],
};

let db = null;
let version = 0;
let cache = null;
const listeners = new Set();

export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
function emit(reason) { version += 1; cache = null; calibration = null; for (const fn of listeners) fn(reason); }

const MODE_KEY = 'tts-mode';
export const isDemo = () => state.mode === 'demo';

export async function init(mode = localStorage.getItem(MODE_KEY) || 'main') {
  state.mode = mode === 'demo' ? 'demo' : 'main';
  db?.close();
  db = await new DB(state.mode === 'demo' ? DB_DEMO : DB_MAIN).open();
  await load();
  if (state.mode === 'demo' && !state.entries.length) await seedDemo();
  ensureDefaults();
  setCurrency(state.settings.currency);
  await maybeComputeBaseline();
  try { await navigator.storage?.persist?.(); } catch { /* facultatif */ }
  emit('init');
}

async function load() {
  const settings = await db.get('meta', 'settings');
  state.settings = { ...defaultSettings(), ...(settings || {}) };
  for (const s of STORES) state[s] = await db.all(s);
  if (!settings) {
    state.products = defaultProducts();
    state.categories = SYSTEM_CATEGORIES.map((c) => ({ ...c }));
    await db.replaceAll({ products: state.products, categories: state.categories });
    await db.put('meta', state.settings);
  }
}

function ensureDefaults() {
  for (const c of SYSTEM_CATEGORIES) {
    if (!state.categories.find((x) => x.id === c.id)) state.categories.push({ ...c });
  }
  state.settings.schema = SCHEMA_VERSION;
  // Nouvelle charte naturelle : passage unique au thème clair « Sable ».
  // Sans balance par défaut : estimation automatique (passage unique).
  if (!state.settings.autoV1) { state.settings.defaultMethod = 'auto'; state.settings.autoV1 = true; }
  if (!state.settings.themeV2) { state.settings.theme = 'light'; state.settings.themeV2 = true; }
}

async function seedDemo() {
  const demo = buildDemoData(dayKey(), 42, nowLocal());
  const { settings, ...data } = demo;
  state.settings = settings;
  Object.assign(state, data);
  await db.replaceAll(data);
  await db.put('meta', settings);
}

export async function switchMode(mode) {
  localStorage.setItem(MODE_KEY, mode);
  await init(mode);
}

export async function resetDemo() {
  await db.clearAll();
  await seedDemo();
  ensureDefaults();
  await maybeComputeBaseline();
  emit('demo-reset');
}

/* --------------------------- Écritures --------------------------- */

export async function save(store, obj) {
  const list = state[store];
  const i = list.findIndex((x) => x.id === obj.id);
  if (i >= 0) list[i] = obj; else list.push(obj);
  await db.put(store, obj);
  if (store === 'entries' || store === 'packs') await recalibrate();
  emit(store);
  return obj;
}

/**
 * Recalcule les quantités « auto » de tout l'historique à partir des
 * paquets déclarés. Écrit directement les entrées modifiées.
 */
export async function recalibrate() {
  const cal = calibrate(state.entries, state.packs, state.settings);
  calibration = cal;
  const changed = autoUpdates(state.entries, cal);
  if (!changed.length) return 0;
  const byId = new Map(changed.map((e) => [e.id, e]));
  state.entries = state.entries.map((e) => byId.get(e.id) || e);
  for (const e of changed) await db.put('entries', e);
  return changed.length;
}
let calibration = null;
export const currentCalibration = () => calibration || (calibration = calibrate(state.entries, state.packs, state.settings));

export async function remove(store, id) {
  state[store] = state[store].filter((x) => x.id !== id);
  await db.delete(store, id);
  if (store === 'entries' || store === 'packs') await recalibrate();
  emit(store);
}

export async function saveSettings(patch) {
  state.settings = deepMerge(state.settings, patch);
  setCurrency(state.settings.currency);
  await db.put('meta', state.settings);
  if (patch.autoPriors || patch.defaultProducts) await recalibrate();
  emit('settings');
}

function deepMerge(a, b) {
  if (Array.isArray(b) || b === null || typeof b !== 'object') return b;
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && a?.[k] && typeof a[k] === 'object' ? deepMerge(a[k], v) : v;
  }
  return out;
}

/** Remplace toutes les données (import en mode « remplacer »). */
export async function replaceAllData(data, settings) {
  const map = {};
  for (const s of STORES) map[s] = data[s] || [];
  await db.replaceAll(map);
  Object.assign(state, map);
  if (settings) {
    const keepPrivacy = state.settings.privacy;
    state.settings = { ...defaultSettings(), ...settings, privacy: { ...keepPrivacy, autoBackup: settings.privacy?.autoBackup ?? true } };
    await db.put('meta', state.settings);
  }
  ensureDefaults();
  if (!state.products.length) { state.products = defaultProducts(); await db.replaceAll({ products: state.products }); }
  setCurrency(state.settings.currency);
  emit('import');
}

/** Supprime définitivement toutes les données de la base active. */
export async function wipeAll() {
  await db.clearAll();
  const mode = state.mode;
  db.close(); db = null;
  await DB.destroy(mode === 'demo' ? DB_DEMO : DB_MAIN);
  await init(mode);
}

/* ----------------------- Sauvegarde locale ----------------------- */

/** Instantané quotidien local (7 derniers conservés), dans la base active. */
export async function autoBackup(buildExport) {
  if (!state.settings.privacy?.autoBackup) return;
  const id = `backup_${dayKey()}`;
  const existing = await db.all('backups');
  if (existing.find((b) => b.id === id)) return;
  await db.put('backups', { id, at: new Date().toISOString(), payload: buildExport(state, { demo: isDemo() }) });
  const sorted = existing.sort((a, b) => (a.id < b.id ? 1 : -1));
  for (const old of sorted.slice(6)) await db.delete('backups', old.id);
}

export async function listBackups() {
  const list = await db.all('backups');
  return list.sort((a, b) => (a.id < b.id ? 1 : -1));
}

/* ----------------------------- Dérivés ----------------------------- */

export function derived() {
  const today = dayKey();
  if (cache && cache.today === today && cache.version === version) return cache;
  const index = buildPriceIndex(state.products, state.purchases);
  const cost = makeCostFn({ index, settings: state.settings });
  const trackingStart = trackingStartOf(state);
  cache = { version, today, index, cost, trackingStart, ctx: { cost, trackingStart, today } };
  return cache;
}

export async function maybeComputeBaseline(force = false) {
  const today = dayKey();
  const obs = observationStatus(state.settings, today);
  if (!force && (state.settings.baseline || !obs?.done)) return;
  const { ctx } = derived();
  const range = obs ? { start: obs.start, end: obs.end } : { start: ctx.trackingStart, end: today };
  if (!range.start) return;
  const baseline = computeBaseline(state.entries, range, ctx, obs ? 'observation' : 'période');
  if (baseline) await saveSettings({ baseline });
}

export const catById = (id) => state.categories.find((c) => c.id === id);
export const productById = (id) => state.products.find((p) => p.id === id);
