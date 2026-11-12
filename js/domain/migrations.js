// Migrations versionnées des données locales.
// Règle : on AJOUTE des champs, on ne réécrit jamais une quantité, une date,
// un prix, une note ni un coût existants. Un instantané est pris avant.

import { SCHEMA_VERSION, SYSTEM_CATEGORIES } from './models.js';
import { inferComposition } from './methods.js';

/**
 * Migre un état complet { settings, entries, categories, … } vers la
 * version courante. Pure : renvoie un nouvel état et la liste des
 * changements, sans effet de bord.
 */
export function migrateState(state) {
  const from = state.settings?.schema || 1;
  const log = [];
  let s = { ...state };
  if (from < 2) s = toV2(s, log);
  s.settings = { ...s.settings, schema: SCHEMA_VERSION };
  return { state: s, from, to: SCHEMA_VERSION, log, changed: from < SCHEMA_VERSION };
}

function toV2(state, log) {
  const entries = state.entries || [];
  // 1. Consommations : statut terminé, composition des joints déduite.
  let joints = 0;
  const migratedEntries = entries.map((e) => {
    if (e.kind !== 'consumption') return e;
    const next = { ...e };
    if (!next.status) next.status = 'done';
    if (e.categoryId === 'joint' && !e.composition) { next.composition = inferComposition(e); joints += 1; }
    return next;
  });
  log.push(`${entries.length} entrée(s) conservée(s), ${joints} joint(s) avec composition déduite`);

  // 2. Catégories : méthodes du catalogue ajoutées, noms personnalisés respectés.
  const cats = [...(state.categories || [])];
  for (const sys of SYSTEM_CATEGORIES) {
    const i = cats.findIndex((c) => c.id === sys.id);
    if (i < 0) { cats.push({ ...sys }); continue; }
    if (sys.id === 'joint' && cats[i].name === 'Joint tabac + CBD') cats[i] = { ...cats[i], name: sys.name, short: sys.short };
  }
  log.push(`${cats.length} catégorie(s) (méthodes du catalogue ajoutées)`);

  // 3. Habitudes déduites de l'historique (méthodes réellement utilisées).
  const settings = { ...state.settings };
  const counts = {};
  for (const e of entries) if (e.kind === 'consumption') counts[e.categoryId] = (counts[e.categoryId] || 0) + 1;
  const used = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  if (!settings.habits || !settings.habits.enabled?.length) {
    const modes = {};
    const j = settings.journeys || {};
    const modeOf = (st) => (st === 'stopped' ? 'quit' : st === 'reducing' ? 'reduce' : 'free');
    for (const id of used) {
      const sub = id === 'rolled' || id === 'cigarette' ? j.tobacco : j.cbd;
      modes[id] = { mode: modeOf(sub?.status), quitDate: sub?.quitDate || null };
    }
    settings.habits = { configured: used.length > 0, enabled: used, primary: used[0] || null, modes };
    log.push(`habitudes : ${used.join(', ') || 'aucune'}${used[0] ? ` (principale : ${used[0]})` : ''}`);
  }
  settings.defaultProducts = { cigarettes: null, cigars: null, liquid: null, puff: null, device: null, ...settings.defaultProducts };
  settings.sessions = settings.sessions || { reminderMin: 30 };
  settings.ai = settings.ai || { dataConsent: false, consentAt: null };

  return { ...state, entries: migratedEntries, categories: cats, settings };
}
