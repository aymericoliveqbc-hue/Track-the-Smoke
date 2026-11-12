// Enregistrement universel : ajout rapide selon les habitudes, saisie
// détaillée adaptée à chaque méthode, sessions (début / fin), consommation
// exceptionnelle, consommation partielle.

import { h, haptic, fill } from './dom.js';
import { icon } from './icons.js';
import { openSheet, toast, confirmDialog, field, textInput, textArea, decimalInput, segmented, chips, toggle, select, note, badge } from './components.js';
import { state, save, remove, saveSettings, derived, catById, productById, currentCalibration } from '../core/store.js';
import { nowLocal, dayKey, timeKey, formatDuration, minutesBetween, formatElapsed, minutesSince } from '../core/dates.js';
import { fmtGrams, fmtMoney, fmtQty, isNum, round2, UNITS, fmtNum } from '../core/format.js';
import { uid, CBD_FORMS, CBD_MODES, CONTEXTS, MOODS, METHODS, normalizeAccessories, labelOf, MOLECULES, moleculeOf, moleculeLabel } from '../domain/models.js';
import { METHOD_CATALOG, methodOf, mechanicsOf, JOINT_COMPOSITIONS, compositionOf, components, reliabilityOf, RELIABILITY, COMPLETION, amountKeyOf, withComponent } from '../domain/methods.js';
import { autoEstimateFor, precisionLabel } from '../domain/autoqty.js';
import { mean } from '../domain/stats.js';
import { duplicateRunning, finishSession, runningSessions } from '../domain/sessions.js';
import { openCravingForm, openNightForm, linkCraving } from './forms.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const nowTz = () => new Date().getTimezoneOffset();
const productsOf = (kind, extra = () => true) => state.products.filter((p) => p.kind === kind && !p.archived && extra(p));
const habits = () => state.settings.habits || { enabled: [], primary: null, modes: {} };
const defaultProduct = (kind) => state.settings.defaultProducts?.[kind] || productsOf(kind)[0]?.id || null;

/** Méthodes affichées : principale d'abord, puis habitudes activées, puis le reste. */
export function orderedCategories({ includeAll = false } = {}) {
  const hb = habits();
  const active = state.categories.filter((c) => !c.archived);
  const enabled = hb.enabled?.length ? hb.enabled : active.map((c) => c.id);
  const rank = (c) => (c.id === hb.primary ? 0 : enabled.includes(c.id) ? 1 + enabled.indexOf(c.id) : 100);
  const list = active.filter((c) => includeAll || enabled.includes(c.id) || !c.system);
  return list.sort((a, b) => rank(a) - rank(b));
}

/* =================================================================== */
/* Construction d'une consommation                                      */
/* =================================================================== */

function cannabisProductFor(molecule, form) {
  const exact = productsOf('cbd', (p) => (p.molecule || 'cbd') === molecule && (!form || p.cbdForm === form))[0];
  if (exact) return exact.id;
  const sameMol = productsOf('cbd', (p) => (p.molecule || 'cbd') === molecule)[0];
  if (sameMol) return sameMol.id;
  return molecule === 'cbd' ? defaultProduct('cbd') : null;
}

function ingredient(molecule, form, method, base = {}) {
  return { amount: null, unit: 'g', method, productId: cannabisProductFor(molecule, form), form, molecule, moleculeOther: '', ...base };
}

/** Applique une composition de joint (ne suppose jamais tabac ni CBD). */
export function applyComposition(e, compId, base = {}) {
  const comp = compositionOf(compId);
  const m = state.settings.defaultMethod || 'auto';
  e.composition = compId;
  if (!comp || compId === 'custom') {
    e.tobacco = base.tobacco ? { grams: null, method: m, productId: defaultProduct('tobacco'), ...base.tobacco } : (e.tobacco || null);
    if (!e.cbd && !e.extra?.length && !e.tobacco) e.cbd = ingredient('cbd', 'flower', m, base.cbd);
    return e;
  }
  e.tobacco = comp.tobacco ? { grams: null, method: m, productId: defaultProduct('tobacco'), ...(base.tobacco || {}), grams: null } : null;
  const [first, ...rest] = comp.cannabis;
  const keepFirst = base.cbd && (base.cbd.molecule || 'cbd') === first.molecule ? { productId: base.cbd.productId, method: base.cbd.method } : {};
  e.cbd = ingredient(first.molecule, first.form, m, keepFirst);
  e.extra = rest.map((x) => ({ id: uid('ing'), ...ingredient(x.molecule, x.form, m) }));
  return e;
}

/** Remplit les quantités « auto » (et les retire si indisponibles). */
function fillAuto(e) {
  const cal = currentCalibration();
  for (const c of components(e)) {
    if (c.method !== 'auto') continue;
    const est = autoEstimateFor(e, c.path, state.settings, cal);
    const key = amountKeyOf(c.path);
    if (est) Object.assign(e, withComponent(e, c.path, { [key]: est.amount, basis: est.basis }));
    else Object.assign(e, withComponent(e, c.path, { [key]: null, method: c.substance === 'liquid' ? 'estimated' : 'estimated', basis: null }));
  }
  return e;
}

export function buildEntry(cat, base = {}, { exceptional = false } = {}) {
  const mech = mechanicsOf(cat);
  const m = state.settings.defaultMethod || 'auto';
  let e = {
    id: uid('ent'), kind: 'consumption', categoryId: cat.id, at: nowLocal(), tzOffset: nowTz(), endAt: null, status: 'done',
    tobacco: null, cbd: null, extra: [], liquid: null, units: null, puffs: null,
    quantity: !cat.system && cat.tracksQuantity ? { amount: null, unit: cat.unit || 'unit', ...(base.quantity || {}) } : null,
    accessories: normalizeAccessories(base.accessories || cat.accessories || []),
    completion: 'done', usedFraction: 1, exceptional,
    context: state.settings.habits?.rememberContext ? base.context || null : null, mood: null, mode: base.mode || null, note: '', custom: {},
    cravingId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  if (mech.composition) {
    const compId = base.composition || state.settings.habits?.jointComposition || null;
    if (compId) applyComposition(e, compId, base);
  }
  if (mech.tobacco) e.tobacco = { grams: null, method: m, productId: defaultProduct('tobacco'), ...(base.tobacco || {}), grams: base.tobacco?.method && base.tobacco.method !== 'auto' ? base.tobacco.grams : null };
  if (mech.cannabis || (!cat.system && cat.cbd)) {
    const mol = base.cbd?.molecule || state.settings.defaultMolecule || 'cbd';
    e.cbd = { ...ingredient(mol, base.cbd?.form || 'flower', m), unit: cat.cbdUnit || 'g', ...(base.cbd || {}) };
    if (e.cbd.method === 'auto') e.cbd.amount = null;
  }
  if (!cat.system && cat.tobacco && !e.tobacco) e.tobacco = { grams: null, method: m, productId: defaultProduct('tobacco') };
  if (mech.units) e.units = { count: base.units?.count ?? 1, kind: mech.units, productId: base.units?.productId || defaultProduct(mech.units), method: 'counted' };
  if (mech.liquid) {
    const calibrated = !!currentCalibration().calibrations.liquid;
    e.liquid = { ml: null, method: calibrated ? 'auto' : 'estimated', productId: base.liquid?.productId || defaultProduct('liquid'), deviceId: base.liquid?.deviceId || defaultProduct('device'), fills: null };
  }
  if (mech.puffs) e.puffs = { count: 1, productId: base.puffs?.productId || activePuffId(), mode: 'single' };
  // Les méthodes sans composants ne gardent pas les champs vides.
  if (!e.extra.length) delete e.extra;
  return fillAuto(e);
}

const activePuffId = () => productsOf('puff', (p) => p.openedAt && !p.finishedAt)[0]?.id || defaultProduct('puff');

/** Toutes les quantités nécessaires sont-elles connues ? */
function canInstant(e) {
  const cat = catById(e.categoryId);
  if (mechanicsOf(cat).composition && !e.composition) return false;
  for (const c of components(e)) if (!isNum(c.amount) && c.substance !== 'liquid') return false;
  if (e.quantity && !isNum(e.quantity.amount)) return false;
  return true;
}

async function persistEntry(entry, cat, { remember = true } = {}) {
  entry.updatedAt = new Date().toISOString();
  entry.accessories = normalizeAccessories(entry.accessories);
  await save('entries', entry);
  if (entry.cravingId) await linkCraving(entry);
  if (!remember || entry.exceptional) return; // une consommation exceptionnelle ne change pas les raccourcis
  const pick = (o, keys) => (o ? Object.fromEntries(keys.map((k) => [k, o[k]])) : undefined);
  const qd = {
    composition: entry.composition,
    tobacco: pick(entry.tobacco, ['grams', 'method', 'productId']),
    cbd: pick(entry.cbd, ['amount', 'unit', 'method', 'productId', 'form', 'molecule', 'moleculeOther']),
    units: pick(entry.units, ['count', 'productId']),
    liquid: pick(entry.liquid, ['productId', 'deviceId']),
    puffs: pick(entry.puffs, ['productId', 'mode']),
    quantity: entry.quantity ? { ...entry.quantity } : undefined,
    accessories: entry.accessories, context: entry.context, mode: entry.mode,
  };
  if (qd.units) qd.units.count = Math.max(1, Math.round(qd.units.count || 1));
  await saveSettings({ quickDefaults: { ...state.settings.quickDefaults, [cat.id]: qd } });
}

/* =================================================================== */
/* Ajout rapide                                                         */
/* =================================================================== */

export function openQuickAdd() {
  openSheet({
    title: 'Ajouter',
    build: (close) => {
      const cats = orderedCategories();
      const go = (fn) => () => { close(); fn(); };
      const tile = (label, ic, fn, sub, cls = '') => h('button', { class: `add-tile ${cls}`, onclick: go(fn) },
        h('span', { class: 'add-icon' }, icon(ic, 26)), h('span', { class: 'add-label' }, label), sub ? h('span', { class: 'add-sub' }, sub) : null);
      return h('div', { class: 'stack' },
        h('div', { class: 'add-grid' },
          ...cats.map((c) => tile(c.short || c.name, c.icon, () => quickLog(c.id), instantHint(c), c.id === habits().primary ? 'tile-primary' : '')),
          tile('Envie', 'wave', () => openCravingForm(), 'résistée ou non'),
          tile('Nuit', 'moon', () => openNightForm(), 'mon sommeil')),
        h('div', { class: 'add-row' },
          h('button', { class: 'pill-btn', onclick: go(() => openOtherConsumption()) }, icon('plus', 14), 'Autre consommation'),
          h('button', { class: 'pill-btn', onclick: go(() => openEntryForm({ categoryId: habits().primary || cats[0]?.id })) }, icon('edit', 14), 'Saisie détaillée'),
          h('button', { class: 'pill-btn', onclick: go(async () => { const { openPackForm } = await import('../views/packs.js'); openPackForm({ kind: 'tobacco' }); }) }, icon('box', 14), 'Paquet')));
    },
  });
}

function instantHint(cat) {
  const meth = methodOf(cat.id);
  if (meth?.session === 'session') return cat.id === 'puff' ? 'bouffées ou session' : 'démarrer une session';
  const e = buildEntry(cat, clone(state.settings.quickDefaults?.[cat.id] || {}));
  if (!canInstant(e)) return 'à détailler';
  const parts = [];
  if (e.tobacco) parts.push(`${fmtNum(e.tobacco.grams, 2)} g tabac`);
  if (e.cbd) parts.push(`${fmtNum(e.cbd.amount, 2)} g ${moleculeLabel(e.cbd)}`);
  for (const x of e.extra || []) parts.push(`${fmtNum(x.amount, 2)} g ${moleculeLabel(x)}`);
  if (e.units) parts.push(`${fmtNum(e.units.count, 1)} ${methodOf(cat.id)?.unitLabel || 'unité'}`);
  return parts.join(' · ') || 'en un geste';
}

/** « Autre consommation » : toute méthode du catalogue, sans toucher aux raccourcis. */
export function openOtherConsumption() {
  openSheet({
    title: 'Autre consommation',
    build: (close) => h('div', { class: 'stack' },
      h('p', { class: 'muted' }, 'Pour une consommation inhabituelle : elle apparaît dans le journal et les statistiques, sans modifier tes habitudes ni tes raccourcis.'),
      h('div', { class: 'add-grid' }, [...METHOD_CATALOG.map((m) => catById(m.id)).filter(Boolean), ...state.categories.filter((c) => !c.system && !c.archived)].map((c) => h('button', {
        class: 'add-tile', onclick: () => { close(); openEntryForm({ categoryId: c.id, exceptional: true }); },
      }, h('span', { class: 'add-icon' }, icon(c.icon, 24)), h('span', { class: 'add-label' }, c.short || c.name))))),
  });
}

/**
 * Geste principal :
 *  - méthodes « unité » (joint, roulée, cigarette…) : enregistrées tout de suite ;
 *  - méthodes « session » (vape, chicha, pipe, cigare) : une session démarre ;
 *  - puff : pavé de bouffées (+1, +3…) ou session.
 * Le formulaire ne s'ouvre que si une information indispensable manque.
 */
export async function quickLog(categoryId, { exceptional = false } = {}) {
  const cat = catById(categoryId);
  if (!cat) return;
  if (categoryId === 'puff') { openPuffPad(); return; }
  if (methodOf(categoryId)?.session === 'session') { await startSession(categoryId); return; }
  const entry = buildEntry(cat, clone(state.settings.quickDefaults?.[cat.id] || {}), { exceptional });
  if (!canInstant(entry)) { openEntryForm({ categoryId, exceptional }); return; }
  await persistEntry(entry, cat);
  haptic(15);
  toast(`Ajouté · ${cat.short || cat.name} · ${entry.at.slice(11)}`, {
    action: 'Modifier',
    onAction: () => { const cur = state.entries.find((e) => e.id === entry.id); if (cur) openEntryForm({ entry: cur }); },
  });
}

/* =================================================================== */
/* Sessions                                                             */
/* =================================================================== */

export async function startSession(categoryId, { productId = null, entry: prepared = null } = {}) {
  const cat = catById(categoryId);
  const dup = duplicateRunning(state.entries, categoryId, productId);
  if (dup && !(await confirmDialog({ title: 'Une session est déjà en cours', message: `${cat.short || cat.name} en cours depuis ${dup.at.slice(11)}. Démarrer une deuxième session distincte ?`, confirm: 'Oui, une autre' }))) return null;
  const e = prepared || buildEntry(cat, clone(state.settings.quickDefaults?.[cat.id] || {}));
  e.status = 'running'; e.endAt = null;
  if (!prepared) e.at = nowLocal();
  await persistEntry(e, cat);
  haptic(15);
  toast(`Commencé · ${cat.short || cat.name} · ${e.at.slice(11)}`, { action: 'Terminer', onAction: () => openFinishSheet(e.id) });
  return e;
}

/** Carte « en cours » (accueil). */
export function runningCard() {
  const list = runningSessions(state.entries);
  if (!list.length) return null;
  return h('section', { class: 'running' }, list.map((e) => {
    const cat = catById(e.categoryId);
    const min = minutesSince(e.at);
    return h('div', { class: 'running-row' },
      h('span', { class: 'running-dot' }),
      h('span', { class: 'row-icon' }, icon(cat?.icon || 'custom', 16)),
      h('div', { class: 'grow' }, h('b', null, `${cat?.short || cat?.name || 'Session'} en cours`), h('span', { class: 'muted small' }, `depuis ${e.at.slice(11)} · ${formatElapsed(min)}`)),
      h('button', { class: 'btn btn-primary btn-sm', onclick: () => openFinishSheet(e.id) }, 'Terminer'));
  }));
}

/** Terminer : maintenant ou à une heure passée ; quantités facultatives ; annuler. */
export function openFinishSheet(entryId) {
  const e0 = state.entries.find((x) => x.id === entryId);
  if (!e0) return;
  const e = clone(e0);
  const cat = catById(e.categoryId);
  openSheet({
    title: `Terminer · ${cat?.short || cat?.name}`,
    build: (close) => {
      let endAt = nowLocal();
      const custom = h('input', { class: 'input', type: 'datetime-local', value: endAt, min: e.at, onchange: (ev) => { if (ev.target.value) endAt = ev.target.value.slice(0, 16); } });
      const finish = async (at) => {
        try {
          const done = finishSession(e, at);
          await save('entries', { ...done, updatedAt: new Date().toISOString() });
          close(); haptic(15);
          toast(`Terminé · ${formatDuration(minutesBetween(e.at, at))}`);
        } catch (err) { toast(err.message, { tone: 'warn' }); }
      };
      return h('div', { class: 'stack form' },
        h('p', { class: 'muted' }, `Commencé à ${e.at.slice(11)}${e.at.slice(0, 10) !== dayKey() ? ` le ${e.at.slice(8, 10)}/${e.at.slice(5, 7)}` : ''}.`),
        e.liquid ? field('Liquide consommé (facultatif)', liquidQuick(e)) : null,
        e.puffs ? field('Bouffées pendant la session', decimalInput({ value: e.puffs.count, unit: 'bouffées', step: 1, onchange: (v) => { e.puffs.count = v == null ? null : Math.round(v); e.puffs.mode = 'session'; } })) : null,
        completionField(e),
        h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: () => finish(nowLocal()) }, 'Terminer maintenant'),
        h('details', { class: 'form-details' }, h('summary', null, 'J’ai oublié : renseigner l’heure de fin'),
          h('div', { class: 'stack' }, custom, h('button', { class: 'btn btn-ghost btn-block', onclick: () => finish(endAt) }, 'Terminer à cette heure'))),
        h('div', { class: 'link-row' },
          h('button', { class: 'link', onclick: () => { close(); openEntryForm({ entry: state.entries.find((x) => x.id === entryId) }); } }, 'Modifier'),
          h('button', { class: 'link danger', onclick: async () => {
            if (await confirmDialog({ title: 'Annuler cette session ?', message: 'Elle sera supprimée du journal.', confirm: 'Annuler la session', danger: true })) { await remove('entries', e.id); close(); toast('Session annulée'); }
          } }, 'Annuler la session')));
    },
  });
}

function liquidQuick(e) {
  const dev = productById(e.liquid.deviceId);
  const tank = dev?.tankMl;
  const input = decimalInput({ value: e.liquid.ml, unit: 'ml', step: 0.1, onchange: (v) => { e.liquid.ml = v; e.liquid.method = v == null ? (e.liquid.method === 'auto' ? 'auto' : 'estimated') : 'estimated'; e.liquid.fills = null; } });
  return h('div', { class: 'stack-sm' }, input,
    isNum(tank) ? h('div', { class: 'chips chips-sm' }, [0.25, 0.5, 1].map((f) => h('button', { type: 'button', class: 'chip', onclick: () => { input.setValue(round2(tank * f)); e.liquid.fills = f; } }, `${f === 1 ? '1 réservoir' : `${f === 0.5 ? '½' : '¼'} réservoir`} (${fmtNum(tank * f, 2)} ml)`))) : h('span', { class: 'hint' }, 'Astuce : indique la capacité du réservoir de ton appareil pour estimer en un geste.'));
}

/** Pavé de bouffées : +1 / +3 / +5 / +10, ou session. Sans doublon. */
export function openPuffPad() {
  const pid = activePuffId();
  openSheet({
    title: 'Puff',
    build: (close) => {
      const prod = productById(pid);
      const todayCount = () => state.entries.filter((e) => e.kind === 'consumption' && e.puffs && e.at.slice(0, 10) === dayKey()).reduce((t, e) => t + (e.puffs.count || 0), 0);
      const counter = h('b', { class: 'num-xl' }, String(todayCount()));
      const add = async (n) => {
        const cat = catById('puff');
        const e = buildEntry(cat, clone(state.settings.quickDefaults?.puff || {}));
        e.puffs = { count: n, productId: pid, mode: n === 1 ? 'single' : 'multi' };
        await persistEntry(e, cat);
        haptic(8);
        counter.textContent = String(todayCount());
      };
      return h('div', { class: 'stack' },
        h('div', { class: 'puff-head' }, counter, h('span', { class: 'muted' }, 'bouffées aujourd’hui'), prod ? h('span', { class: 'muted small' }, prod.name) : h('span', { class: 'hint warn' }, 'Aucune puff en cours : ajoute-la dans Réglages › Produits.')),
        h('div', { class: 'puff-grid' }, [1, 3, 5, 10].map((n) => h('button', { class: 'puff-btn', onclick: () => add(n) }, `+${n}`))),
        h('button', { class: 'btn btn-ghost btn-block', onclick: async () => { close(); await startSession('puff', { productId: pid }); } }, icon('clock', 16), 'Démarrer une session'),
        h('p', { class: 'hint' }, 'Chaque appui crée une seule saisie : les bouffées ne sont jamais comptées deux fois.'));
    },
  });
}

/* =================================================================== */
/* Saisie détaillée                                                     */
/* =================================================================== */

export function openEntryForm({ categoryId, entry: existing, at, cravingId, duplicate = false, exceptional = false } = {}) {
  const editing = !!existing && !duplicate;
  let entry;
  if (existing) {
    entry = clone(existing);
    if (duplicate) { entry.id = uid('ent'); entry.at = nowLocal(); entry.tzOffset = nowTz(); entry.endAt = null; entry.status = 'done'; entry.cravingId = null; entry.createdAt = new Date().toISOString(); }
  } else {
    const cat = catById(categoryId) || orderedCategories()[0];
    entry = buildEntry(cat, exceptional ? {} : clone(state.settings.quickDefaults?.[cat.id] || {}), { exceptional });
    if (at) entry.at = at;
    if (cravingId) entry.cravingId = cravingId;
  }

  openSheet({
    title: editing ? 'Modifier' : entry.exceptional ? 'Autre consommation' : 'Nouvelle consommation',
    size: 'full',
    build: (close) => {
      const root = h('div', { class: 'stack form' });
      const render = () => {
        const cat = catById(entry.categoryId);
        const mech = mechanicsOf(cat);
        fill(root,
          categoryPicker(entry, (id) => {
            const c = catById(id);
            const fresh = buildEntry(c, entry.exceptional ? {} : clone(state.settings.quickDefaults?.[id] || {}), { exceptional: entry.exceptional });
            entry = { ...fresh, id: entry.id, at: entry.at, tzOffset: entry.tzOffset, endAt: entry.endAt, status: entry.status, note: entry.note, cravingId: entry.cravingId, createdAt: entry.createdAt };
            render();
          }),
          entry.exceptional ? note('Consommation exceptionnelle : elle ne modifie ni tes habitudes ni tes raccourcis.', 'info') : null,
          entry.status === 'running' ? note(`Session en cours depuis ${entry.at.slice(11)}.`, 'info') : null,
          entry.cravingId ? note('Liée à une envie.', 'info') : null,
          mech.composition ? compositionSection(entry, render) : null,
          entry.tobacco ? tobaccoSection(entry, render) : null,
          entry.cbd ? cannabisSection(entry, 'cbd', render, cat) : null,
          ...(entry.extra || []).map((_, i) => cannabisSection(entry, `extra.${i}`, render, cat)),
          mech.composition && entry.composition === 'custom' ? h('button', { type: 'button', class: 'link', onclick: () => { entry.extra = [...(entry.extra || []), { id: uid('ing'), ...ingredient('unknown', 'flower', state.settings.defaultMethod || 'auto') }]; fillAuto(entry); render(); } }, '+ Ajouter un ingrédient') : null,
          entry.units ? unitsSection(entry, cat) : null,
          entry.liquid ? liquidSection(entry) : null,
          entry.puffs ? puffsSection(entry) : null,
          !cat.system && entry.quantity ? customQuantity(entry, cat) : null,
          costPreview(entry),
          timeSection(entry),
          ['rolled', 'joint', 'cigarette', 'cigarillo', 'cigar'].includes(cat.id) ? completionField(entry, render) : null,
          detailsSection(entry, cat),
          h('div', { class: 'form-actions sticky-actions' },
            h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: async () => {
              const c = catById(entry.categoryId);
              if (mechanicsOf(c).composition && !entry.composition) { toast('Choisis la composition du joint', { tone: 'warn' }); return; }
              if (entry.endAt && minutesBetween(entry.at, entry.endAt) < 0) { toast('L’heure de fin doit être après le début', { tone: 'warn' }); return; }
              await persistEntry(entry, c);
              haptic(15); close();
              toast(editing ? 'Modifié' : `Ajouté · ${c.short || c.name}`);
            } }, editing ? 'Enregistrer' : 'Ajouter'),
            !editing && methodOf(entry.categoryId) ? h('button', { class: 'btn btn-ghost btn-block', onclick: async () => {
              close(); await startSession(entry.categoryId, { entry: { ...entry, at: nowLocal() } });
            } }, icon('clock', 16), 'Commencer maintenant (session chronométrée)') : null,
            editing ? h('div', { class: 'link-row' },
              h('button', { class: 'link', onclick: () => { close(); openEntryForm({ entry: existing, duplicate: true }); } }, 'Dupliquer'),
              h('button', { class: 'link danger', onclick: async () => {
                if (await confirmDialog({ title: 'Supprimer cette consommation ?', message: 'Elle sera retirée du journal, des statistiques et des coûts.', confirm: 'Supprimer', danger: true })) {
                  await deleteEntry(existing); close();
                }
              } }, 'Supprimer')) : null));
      };
      render();
      return root;
    },
  });
}

export async function deleteEntry(entry) {
  await remove('entries', entry.id);
  if (entry.cravingId) {
    const c = state.entries.find((x) => x.id === entry.cravingId);
    if (c) await save('entries', { ...c, consumptionId: null });
  }
  toast('Entrée supprimée', { action: 'Annuler', onAction: async () => { await save('entries', entry); toast('Entrée restaurée'); } });
}

function categoryPicker(entry, onchange) {
  const cats = orderedCategories({ includeAll: entry.exceptional });
  if (!cats.find((c) => c.id === entry.categoryId)) cats.push(catById(entry.categoryId));
  return h('div', { class: 'cat-picker' }, cats.filter(Boolean).map((c) => h('button', {
    type: 'button', class: `cat-pill ${c.id === entry.categoryId ? 'on' : ''}`,
    onclick: () => { if (c.id !== entry.categoryId) { haptic(); onchange(c.id); } },
  }, icon(c.icon, 16), c.short || c.name)));
}

function compositionSection(entry, rerender) {
  return h('div', { class: 'form-block' },
    h('div', { class: 'block-head' }, h('h4', null, 'Composition')),
    chips(JOINT_COMPOSITIONS.map((c) => ({ id: c.id, label: c.label })), entry.composition || null, (v) => {
      if (!v) return;
      applyComposition(entry, v, {});
      if (v === 'custom' && !entry.tobacco && !entry.cbd) entry.cbd = ingredient('cbd', 'flower', state.settings.defaultMethod || 'auto');
      fillAuto(entry); rerender();
    }, { allowNone: false }),
    entry.composition === 'custom' ? toggle(!!entry.tobacco, (on) => { entry.tobacco = on ? { grams: null, method: state.settings.defaultMethod || 'auto', productId: defaultProduct('tobacco') } : null; fillAuto(entry); rerender(); }, 'Contient du tabac') : null,
    !entry.composition ? h('p', { class: 'hint' }, 'Choisis ce que contient ce joint : rien n’est supposé à ta place.') : null);
}

/* ------------------------------ Quantités ------------------------------ */

function methodToggle(comp, onchange, { allowAuto = true } = {}) {
  const opts = [...METHODS.filter((m) => allowAuto || m.id !== 'auto').map((m) => ({ id: m.id, label: m.label })), { id: 'unknown', label: 'Inconnue' }];
  return segmented(opts, comp.method || 'unknown', onchange, { small: true });
}

/** Champ de quantité d'un composant : calculée (auto), estimée, pesée ou inconnue. */
function quantityField(entry, path, { unit = 'g', step = 0.01, label = 'Quantité', rerender } = {}) {
  const wrap = h('div', { class: 'stack-sm' });
  const key = amountKeyOf(path);
  const get = () => components(entry).find((c) => c.path === path);
  const set = (patch) => Object.assign(entry, withComponent(entry, path, patch));
  const autoPossible = () => {
    const probe = withComponent(entry, path, { method: 'auto' });
    return !!autoEstimateFor(probe, path, state.settings, currentCalibration());
  };
  const render = () => {
    const c = get();
    const head = h('div', { class: 'qty-head' }, h('span', { class: 'field-label' }, label), methodToggle(c, (v) => {
      if (v === 'auto') {
        const est = autoEstimateFor(withComponent(entry, path, { method: 'auto' }), path, state.settings, currentCalibration());
        if (!est) { toast('Pas encore assez de données pour calculer : déclare un paquet ou ton stock.', { tone: 'warn' }); render(); return; }
        set({ method: 'auto', [key]: est.amount, basis: est.basis });
      } else if (v === 'unknown') set({ method: null, [key]: null, basis: null });
      else set({ method: v, basis: null });
      render(); refreshCost();
    }, { allowAuto: autoPossible() || c.method === 'auto' }));
    if (c.method === 'auto') {
      const rel = reliabilityOf(c);
      const cal = currentCalibration();
      const p = precisionLabel(cal.calibrations[c.substance]);
      fill(wrap, head, h('div', { class: 'auto-qty' },
        h('span', { class: 'auto-icon' }, icon('sparkle', 16)),
        h('div', { class: 'grow' }, h('b', null, `≈ ${fmtQty(c.amount, unit)}`), h('span', { class: 'muted small' }, rel === 'calculated' ? `Calculée · ${p.label.toLowerCase()}` : 'Estimation provisoire')),
        h('span', { class: `precision p${rel === 'calculated' ? Math.max(1, p.level) : 0}` }, h('i'), h('i'), h('i'))),
      rel !== 'calculated' ? h('p', { class: 'hint' }, 'Valeur de départ : déclare ton paquet ou ton stock (Réglages › Mes paquets) pour qu’elle soit calculée.') : null);
    } else if (c.method == null) {
      fill(wrap, head, h('p', { class: 'hint' }, 'Quantité inconnue : rien ne sera inventé, ni dans les grammes ni dans le coût.'));
    } else {
      const input = decimalInput({ value: c.amount, unit: UNITS[unit]?.short || unit, step, label, onchange: (v) => { set({ [key]: v }); refreshCost(); } });
      fill(wrap, head, input, quickFill(recentStats(entry.categoryId, path, entry.id), input, unit));
    }
  };
  render();
  return wrap;
}

function recentStats(categoryId, path, excludeId) {
  const values = state.entries
    .filter((e) => e.kind === 'consumption' && e.categoryId === categoryId && e.id !== excludeId)
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .map((e) => components(e).find((c) => c.path === path))
    .filter((c) => c && isNum(c.amount) && c.method !== 'auto')
    .map((c) => c.amount);
  const m = mean(values.slice(0, 20));
  return { last: values[0] ?? null, avg: m.value != null ? round2(m.value) : null, n: m.n };
}

function quickFill(stats, inputEl, unit = 'g') {
  const b = [];
  if (isNum(stats.last)) b.push(h('button', { type: 'button', class: 'chip', onclick: () => inputEl.setValue(stats.last) }, `Dernière · ${fmtQty(stats.last, unit)}`));
  if (isNum(stats.avg) && stats.n >= 2) b.push(h('button', { type: 'button', class: 'chip', onclick: () => inputEl.setValue(stats.avg) }, `Moyenne · ${fmtQty(stats.avg, unit)} (${stats.n})`));
  return b.length ? h('div', { class: 'chips chips-sm' }, b) : null;
}

function tobaccoSection(entry, rerender) {
  const prods = productsOf('tobacco');
  return h('div', { class: 'form-block' },
    h('div', { class: 'block-head' }, h('span', { class: 'dot dot-blue' }), h('h4', null, 'Tabac')),
    quantityField(entry, 'tobacco', { label: 'Quantité', rerender }),
    prods.length > 1 ? field('Produit', select(prods.map((p) => ({ id: p.id, label: p.name })), entry.tobacco.productId, (v) => { entry.tobacco.productId = v; fillAuto(entry); rerender(); })) : null);
}

/** Ingrédient cannabinoïde (1er : 'cbd', suivants : 'extra.i'). */
function cannabisSection(entry, path, rerender, cat) {
  const comp = path === 'cbd' ? entry.cbd : entry.extra[Number(path.slice(6))];
  const isJoint = cat.id === 'joint';
  const forms = isJoint ? CBD_FORMS.filter((f) => f.id !== 'oil') : CBD_FORMS;
  const unitOptions = isJoint ? ['g'] : (comp.form === 'oil' ? ['drop', 'ml'] : comp.form === 'other' ? ['unit', 'g', 'ml'] : ['g']);
  if (!unitOptions.includes(comp.unit || 'g')) comp.unit = unitOptions[0];
  const prods = productsOf('cbd', (p) => (p.molecule || 'cbd') === (comp.molecule || 'cbd') || comp.molecule === 'unknown');
  const removable = path !== 'cbd' && entry.composition === 'custom';
  return h('div', { class: 'form-block' },
    h('div', { class: 'block-head' }, h('span', { class: 'dot dot-green' }), h('h4', null, path === 'cbd' ? moleculeLabel(comp) : `+ ${moleculeLabel(comp)}`),
      removable ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Retirer l’ingrédient', onclick: () => { entry.extra.splice(Number(path.slice(6)), 1); rerender(); } }, icon('close', 16)) : null),
    moleculeField(comp, 'molecule', () => { comp.productId = cannabisProductFor(comp.molecule, comp.form); fillAuto(entry); rerender(); }),
    field('Forme', chips(forms.map((f) => ({ id: f.id, label: f.label })), comp.form, (v) => { comp.form = v || forms[0].id; comp.productId = cannabisProductFor(comp.molecule, comp.form); fillAuto(entry); rerender(); }, { allowNone: false })),
    quantityField(entry, path, { unit: comp.unit || 'g', step: comp.unit === 'drop' || comp.unit === 'unit' ? 1 : 0.01, rerender }),
    unitOptions.length > 1 ? field('Unité', segmented(unitOptions.map((u) => ({ id: u, label: UNITS[u].label })), comp.unit, (v) => { comp.unit = v; rerender(); refreshCost(); }, { small: true })) : null,
    prods.length ? field('Produit', select(prods.map((p) => ({ id: p.id, label: p.name })), comp.productId, (v) => { comp.productId = v; fillAuto(entry); rerender(); }, { placeholder: 'Choisir…' })) : null,
    cat.id === 'cbd' ? field('Mode de consommation', chips(CBD_MODES, entry.mode, (v) => { entry.mode = v; })) : null);
}

/** Choix de la molécule (CBD, THC, 10-OH-HHC, HHC…). */
export function moleculeField(obj, key = 'molecule', onChange = null) {
  const wrap = h('div', { class: 'field' });
  const render = () => {
    const cur = obj[key] || 'cbd';
    const m = moleculeOf(cur);
    fill(wrap, h('span', { class: 'field-label' }, 'Molécule'),
      chips(MOLECULES.map((x) => ({ id: x.id, label: x.short })), cur, (v) => {
        obj[key] = v || 'cbd';
        if (key === 'molecule' && obj.amount !== undefined && v !== 'unknown') saveSettings({ defaultMolecule: obj[key] });
        if (onChange) onChange(); else render();
      }, { allowNone: false }),
      cur === 'other' ? textInput({ value: obj.moleculeOther || '', placeholder: 'Nom de la molécule', oninput: (v) => { obj.moleculeOther = v; } }) : null,
      m.thc ? h('p', { class: 'hint' }, 'THC : suivi séparément du CBD, jamais additionné.') : m.synthetic ? h('p', { class: 'hint' }, 'Molécule différente du CBD, suivie à part. Ses effets peuvent être proches du THC et sont encore peu étudiés.') : null);
  };
  render();
  return wrap;
}

function unitsSection(entry, cat) {
  const kind = entry.units.kind || 'cigarettes';
  const prods = productsOf(kind);
  const label = methodOf(cat.id)?.unitLabel || 'unité';
  return h('div', { class: 'form-block' },
    h('div', { class: 'block-head' }, h('span', { class: 'dot dot-blue' }), h('h4', null, cat.name)),
    field('Nombre', decimalInput({ value: entry.units.count, unit: label + (entry.units.count > 1 ? 's' : ''), step: 1, onchange: (v) => { entry.units.count = v; refreshCost(); } }), 'Une cigarette à moitié fumée : 0,5.'),
    prods.length ? field('Produit', select(prods.map((p) => ({ id: p.id, label: `${p.brand ? p.brand + ' · ' : ''}${p.name}` })), entry.units.productId, (v) => { entry.units.productId = v; refreshCost(); }, { placeholder: 'Choisir…' }))
      : h('p', { class: 'hint warn' }, 'Ajoute ton produit (marque, prix du paquet) dans Réglages › Produits pour calculer le coût.'));
}

function liquidSection(entry) {
  const liquids = productsOf('liquid');
  const devices = productsOf('device');
  const qty = quantityField(entry, 'liquid', { unit: 'ml', step: 0.1, label: 'Liquide consommé' });
  return h('div', { class: 'form-block' },
    h('div', { class: 'block-head' }, h('span', { class: 'dot dot-blue' }), h('h4', null, 'E-liquide')),
    liquids.length ? field('Liquide', select(liquids.map((p) => ({ id: p.id, label: `${p.name}${isNum(p.nicotineMgPerMl) ? ` · ${fmtNum(p.nicotineMgPerMl, 1)} mg/ml` : ''}` })), entry.liquid.productId, (v) => { entry.liquid.productId = v; refreshCost(); }, { placeholder: 'Choisir…' }))
      : h('p', { class: 'hint warn' }, 'Ajoute ton e-liquide (prix, contenance, nicotine) dans Réglages › Produits.'),
    devices.length > 1 ? field('Appareil', select(devices.map((p) => ({ id: p.id, label: p.name })), entry.liquid.deviceId, (v) => { entry.liquid.deviceId = v; })) : null,
    qty,
    entry.liquid.method !== 'auto' ? liquidQuick(entry) : null);
}

function puffsSection(entry) {
  const puffs = productsOf('puff');
  return h('div', { class: 'form-block' },
    h('div', { class: 'block-head' }, h('span', { class: 'dot dot-orange' }), h('h4', null, 'Puff')),
    field('Saisie', segmented([{ id: 'single', label: '1 bouffée' }, { id: 'multi', label: 'Plusieurs' }, { id: 'session', label: 'Session' }], entry.puffs.mode || 'single', (v) => { entry.puffs.mode = v; if (v === 'single') entry.puffs.count = 1; }, { small: true })),
    field('Bouffées', decimalInput({ value: entry.puffs.count, unit: 'bouffées', step: 1, onchange: (v) => { entry.puffs.count = v == null ? null : Math.round(v); refreshCost(); } })),
    puffs.length ? field('Puff', select(puffs.map((p) => ({ id: p.id, label: `${p.name}${p.finishedAt ? ' (terminée)' : ''}` })), entry.puffs.productId, (v) => { entry.puffs.productId = v; refreshCost(); }, { placeholder: 'Choisir…' })) : null,
    h('p', { class: 'hint' }, 'Aucune quantité de liquide n’est déduite des bouffées.'));
}

function customQuantity(entry, cat) {
  const q = entry.quantity;
  const input = decimalInput({ value: q.amount, unit: cat.unitLabel || UNITS[cat.unit]?.short || '', step: cat.unit === 'unit' ? 1 : 0.01, onchange: (v) => { q.amount = v; } });
  return h('div', { class: 'form-block' }, h('div', { class: 'block-head' }, h('span', { class: 'dot dot-orange' }), h('h4', null, 'Quantité')), input);
}

/** Consommation terminée / partielle / interrompue / abandonnée. */
function completionField(entry, rerender) {
  const wrap = h('div', { class: 'field' });
  const render = () => {
    const partial = entry.completion && entry.completion !== 'done';
    fill(wrap, h('span', { class: 'field-label' }, 'Consommée'),
      chips(COMPLETION, entry.completion || 'done', (v) => {
        entry.completion = v || 'done';
        if (entry.completion === 'done') setFraction(entry, 1);
        else if (!isNum(entry.usedFraction) || entry.usedFraction === 1) setFraction(entry, 0.5);
        render(); rerender?.(); refreshCost();
      }, { allowNone: false }),
      partial ? h('div', { class: 'chips chips-sm' }, [[0.25, '¼'], [0.5, '½'], [0.75, '¾']].map(([f, l]) => h('button', { type: 'button', class: `chip ${entry.usedFraction === f ? 'on' : ''}`, onclick: () => { setFraction(entry, f); render(); rerender?.(); refreshCost(); } }, `${l} utilisé`))) : null,
      partial ? h('p', { class: 'hint' }, 'Seule la part réellement consommée est comptée ; le reste n’est pas déduit.') : null);
  };
  render();
  return wrap;
}

function setFraction(entry, f) {
  entry.usedFraction = f;
  if (entry.units) entry.units.count = round2(Math.max(0.05, Math.round(entry.units.count || 1) * f));
  fillAuto(entry);
}

function timeSection(entry) {
  const ago = (min) => { const d = new Date(Date.now() - min * 60000); return `${dayKey(d)}T${timeKey(d)}`; };
  const wrap = h('div', { class: 'stack-sm' });
  let custom = false;
  const render = () => {
    const presets = [[0, 'Maintenant'], [15, '−15 min'], [30, '−30 min'], [60, '−1 h']];
    const isPreset = presets.some(([m]) => ago(m) === entry.at);
    fill(wrap,
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, entry.endAt ? 'Début' : 'Quand'),
        h('div', { class: 'chips chips-sm' },
          ...presets.map(([m, l]) => h('button', { type: 'button', class: `chip ${!custom && ago(m) === entry.at ? 'on' : ''}`, onclick: () => { entry.at = ago(m); entry.tzOffset = nowTz(); custom = false; render(); } }, l)),
          h('button', { type: 'button', class: `chip ${custom || !isPreset ? 'on' : ''}`, onclick: () => { custom = true; render(); } }, !isPreset ? `${entry.at.slice(8, 10)}/${entry.at.slice(5, 7)} ${entry.at.slice(11)}` : 'Autre…')),
        custom ? h('input', { class: 'input', type: 'datetime-local', value: entry.at, onchange: (e) => { if (e.target.value) { entry.at = e.target.value.slice(0, 16); render(); } } }) : null),
      entry.status === 'running' ? null : toggle(!!entry.endAt, (on) => { entry.endAt = on ? (entry.endAt || entry.at) : null; render(); }, 'Heure de fin (durée)'),
      entry.endAt && entry.status !== 'running' ? h('div', { class: 'stack-sm' },
        h('input', { class: 'input', type: 'datetime-local', value: entry.endAt, min: entry.at, onchange: (e) => { if (e.target.value) { entry.endAt = e.target.value.slice(0, 16); render(); } } }),
        minutesBetween(entry.at, entry.endAt) >= 0 ? h('span', { class: 'hint' }, `Durée : ${formatDuration(minutesBetween(entry.at, entry.endAt))}`) : h('span', { class: 'hint warn' }, 'La fin doit être après le début.')) : null);
  };
  render();
  return wrap;
}

function accessoriesSection(entry) {
  const block = h('div', { class: 'stack-sm' });
  const has = (type) => (entry.accessories || []).some((a) => a.type === type);
  const render = () => {
    const paper = has('slim') ? 'slim' : has('classic') ? 'classic' : 'none';
    fill(block,
      field('Feuille', segmented([{ id: 'slim', label: 'Slim' }, { id: 'classic', label: 'Classique' }, { id: 'none', label: 'Aucune' }], paper, (v) => {
        entry.accessories = (entry.accessories || []).filter((a) => a.type !== 'slim' && a.type !== 'classic');
        if (v !== 'none') entry.accessories.push({ type: v, productId: null, count: 1 });
        fillAuto(entry); render(); refreshCost();
      }, { small: true })),
      toggle(has('filter'), (on) => {
        entry.accessories = (entry.accessories || []).filter((a) => a.type !== 'filter');
        if (on) entry.accessories.push({ type: 'filter', productId: null, count: 1 });
        refreshCost();
      }, 'Avec filtre'));
  };
  render();
  return block;
}

function detailsSection(entry, cat) {
  const open = !!(entry.context || entry.mood || entry.note);
  const hasPaper = ['rolled', 'joint'].includes(cat.id) || (!cat.system && (cat.tobacco || cat.cbd));
  return h('details', { class: 'form-details', open },
    h('summary', null, 'Plus de détails'),
    h('div', { class: 'stack' },
      hasPaper ? accessoriesSection(entry) : null,
      !cat.system && cat.fields?.length ? customFields(entry, cat) : null,
      field('Contexte', chips(CONTEXTS, entry.context, (v) => { entry.context = v; })),
      field('Humeur', chips(MOODS, entry.mood, (v) => { entry.mood = v; })),
      field('Note', textArea({ value: entry.note, placeholder: 'Facultatif', oninput: (v) => { entry.note = v; } })),
      toggle(!!entry.exceptional, (on) => { entry.exceptional = on; }, 'Consommation exceptionnelle (ne change pas mes raccourcis)')));
}

function customFields(entry, cat) {
  entry.custom = entry.custom || {};
  return h('div', { class: 'stack' }, cat.fields.map((f) => field(f.label,
    f.type === 'number'
      ? decimalInput({ value: entry.custom[f.id] ?? null, unit: f.unit || '', stepper: false, onchange: (v) => { entry.custom[f.id] = v; } })
      : textInput({ value: entry.custom[f.id] || '', oninput: (v) => { entry.custom[f.id] = v; } }))));
}

let refreshCost = () => {};
function costPreview(entry) {
  const el = h('div', { class: 'cost-preview' });
  refreshCost = () => {
    const { ctx } = derived();
    const c = ctx.cost({ ...entry, updatedAt: `preview-${Math.random()}` });
    fill(el, h('span', { class: 'muted' }, 'Coût'), h('b', null, c.total > 0 ? `≈ ${fmtMoney(c.total)}` : '—'),
      isNum(c.nicotineMg) ? h('span', { class: 'muted small' }, `· ${fmtNum(c.nicotineMg, 1)} mg de nicotine contenue`) : null,
      !c.complete ? h('span', { class: 'cost-warn' }, 'prix à compléter') : c.estimatedParts.length ? h('span', { class: 'cost-warn' }, 'prix par bouffée estimé') : null);
  };
  refreshCost();
  return el;
}

