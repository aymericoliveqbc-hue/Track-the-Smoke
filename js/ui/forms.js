// Formulaires : consommation, envie, nuit, achat, produit, catégorie,
// objectif, inventaire. Saisie rapide : heure auto, dernières valeurs,
// moyennes, duplication.

import { h, haptic, fill } from './dom.js';
import { icon } from './icons.js';
import {
  openSheet, toast, confirmDialog, field, textInput, textArea, decimalInput, segmented, chips, toggle, scale, select, note, badge,
} from './components.js';
import { state, save, remove, saveSettings, derived, catById, productById } from '../core/store.js';
import { nowLocal, dayKey, addDays, formatDuration, hm, timeKey, isTime } from '../core/dates.js';
import { fmtGrams, fmtMoney, fmtQty, isNum, round2, UNITS, fmtNum, parseDecimal, toInput } from '../core/format.js';
import {
  uid, CAT, CBD_FORMS, CBD_MODES, CONTEXTS, MOODS, TRIGGERS, CRAVING_PRODUCTS, WAKE_FEELINGS, METHODS, ACCESSORY_TYPES,
  normalizeAccessories, newProduct, newCustomCategory, labelOf,
} from '../domain/models.js';
import { unitPrice, purchaseTotal } from '../domain/costs.js';
import { mean } from '../domain/stats.js';
import { newNight, computeNight, nightContext } from '../domain/sleep.js';
import { intensityLabel } from '../domain/cravings.js';
import { GOAL_METRICS, metricOf, newGoal, reviseGoal, baselineValue } from '../domain/goals.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const nowTz = () => new Date().getTimezoneOffset();
const productsOf = (kind, extra = () => true) => state.products.filter((p) => p.kind === kind && !p.archived && extra(p));

/* =================================================================== */
/* Choix rapide                                                         */
/* =================================================================== */

export function openQuickAdd() {
  openSheet({
    title: 'Enregistrer',
    build: (close) => {
      const cats = state.categories.filter((c) => !c.archived);
      const tile = (c) => {
        const last = state.settings.quickDefaults?.[c.id];
        const summary = last ? quickSummary(c, last) : 'Première saisie';
        return h('div', { class: `quick-tile tone-${c.color}` },
          h('button', { class: 'quick-main', onclick: () => { close(); openEntryForm({ categoryId: c.id }); } },
            h('span', { class: 'quick-icon' }, icon(c.icon, 22)),
            h('span', { class: 'quick-name' }, c.name),
            h('span', { class: 'quick-sub' }, summary)),
          last ? h('button', { class: 'quick-fast', 'aria-label': `Enregistrer ${c.name} avec les dernières valeurs`, onclick: async () => { close(); await quickSave(c); } }, icon('check', 16), 'Express') : null);
      };
      return h('div', { class: 'stack' },
        h('div', { class: 'quick-grid' }, cats.map(tile)),
        h('div', { class: 'quick-row' },
          h('button', { class: 'quick-pill tone-green', onclick: () => { close(); openCravingForm(); } }, icon('wave', 18), 'Envie'),
          h('button', { class: 'quick-pill tone-blue', onclick: () => { close(); openNightForm(); } }, icon('moon', 18), 'Nuit'),
          h('button', { class: 'quick-pill tone-orange', onclick: () => { close(); openPurchaseForm(); } }, icon('wallet', 18), 'Achat')),
        h('p', { class: 'hint center' }, '« Express » enregistre maintenant avec tes dernières valeurs.'));
    },
  });
}

function quickSummary(cat, last) {
  const parts = [];
  if (cat.tobacco && last.tobacco) parts.push(`${isNum(last.tobacco.grams) ? fmtGrams(last.tobacco.grams) : '?'} tabac`);
  if (cat.cbd && last.cbd) parts.push(`${isNum(last.cbd.amount) ? fmtQty(last.cbd.amount, last.cbd.unit) : '?'} CBD`);
  if (!cat.system && isNum(last.quantity?.amount)) parts.push(`${fmtNum(last.quantity.amount)} ${cat.unitLabel || ''}`);
  return parts.join(' · ') || 'Dernières valeurs';
}

async function quickSave(cat) {
  const last = clone(state.settings.quickDefaults[cat.id]);
  const entry = buildEntry(cat, last);
  await persistEntry(entry, cat);
  haptic(15);
  toast(`Enregistré · ${cat.short || cat.name} à ${entry.at.slice(11)}`, { action: 'Modifier', onAction: () => openEntryForm({ entry }) });
}

/* =================================================================== */
/* Consommation                                                         */
/* =================================================================== */

function buildEntry(cat, base = {}) {
  const t = state.settings.defaultMethod || 'estimated';
  const e = {
    id: uid('ent'), kind: 'consumption', categoryId: cat.id, at: nowLocal(), tzOffset: nowTz(),
    tobacco: cat.tobacco ? { grams: null, method: t, productId: state.settings.defaultProducts.tobacco, ...(base.tobacco || {}) } : null,
    cbd: cat.cbd ? { amount: null, unit: cat.cbdUnit || 'g', method: t, productId: state.settings.defaultProducts.cbd, form: 'flower', ...(base.cbd || {}) } : null,
    quantity: !cat.system && cat.tracksQuantity ? { amount: null, unit: cat.unit || 'unit', ...(base.quantity || {}) } : null,
    accessories: normalizeAccessories(base.accessories || cat.accessories || []),
    context: base.context || null, mood: null, mode: base.mode || null, note: '', custom: {},
    cravingId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  return e;
}

async function persistEntry(entry, cat) {
  entry.updatedAt = new Date().toISOString();
  entry.accessories = normalizeAccessories(entry.accessories);
  await save('entries', entry);
  if (entry.cravingId) await linkCraving(entry);
  const qd = {
    tobacco: entry.tobacco ? { grams: entry.tobacco.grams, method: entry.tobacco.method, productId: entry.tobacco.productId } : undefined,
    cbd: entry.cbd ? { amount: entry.cbd.amount, unit: entry.cbd.unit, method: entry.cbd.method, productId: entry.cbd.productId, form: entry.cbd.form } : undefined,
    quantity: entry.quantity ? { ...entry.quantity } : undefined,
    accessories: entry.accessories, context: entry.context, mode: entry.mode,
  };
  await saveSettings({ quickDefaults: { ...state.settings.quickDefaults, [cat.id]: qd } });
}

/** Moyenne et dernière valeur pour une catégorie et un composant. */
function recentStats(categoryId, pick, excludeId) {
  const list = state.entries
    .filter((e) => e.kind === 'consumption' && e.categoryId === categoryId && e.id !== excludeId)
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  const values = list.map(pick).filter(isNum);
  const m = mean(values.slice(0, 20));
  return { last: values[0] ?? null, avg: m.value != null ? round2(m.value) : null, n: m.n };
}

export function openEntryForm({ categoryId, entry: existing, at, cravingId, duplicate = false } = {}) {
  const editing = !!existing && !duplicate;
  let entry;
  if (existing) {
    entry = clone(existing);
    if (duplicate) { entry.id = uid('ent'); entry.at = nowLocal(); entry.tzOffset = nowTz(); entry.cravingId = null; entry.createdAt = new Date().toISOString(); }
  } else {
    const cat = catById(categoryId) || state.categories[0];
    entry = buildEntry(cat, clone(state.settings.quickDefaults?.[cat.id] || {}));
    if (at) entry.at = at;
    if (cravingId) entry.cravingId = cravingId;
  }

  openSheet({
    title: editing ? 'Modifier la consommation' : duplicate ? 'Dupliquer' : 'Nouvelle consommation',
    size: 'full',
    build: (close) => {
      const root = h('div', { class: 'stack form' });
      const render = () => {
        const cat = catById(entry.categoryId);
        fill(root, 
          categoryPicker(entry, (id) => {
            const c = catById(id);
            const fresh = buildEntry(c, clone(state.settings.quickDefaults?.[id] || {}));
            entry = { ...fresh, id: entry.id, at: entry.at, tzOffset: entry.tzOffset, note: entry.note, cravingId: entry.cravingId, createdAt: entry.createdAt };
            render();
          }),
          entry.cravingId ? note('Consommation liée à une envie enregistrée.', 'info') : null,
          whenField(entry),
          cat.tobacco ? tobaccoSection(entry, cat) : null,
          cat.cbd ? cbdSection(entry, cat) : null,
          !cat.system && entry.quantity ? customQuantity(entry, cat) : null,
          accessoriesSection(entry),
          !cat.system && cat.fields?.length ? customFields(entry, cat) : null,
          detailsSection(entry, cat),
          costPreview(entry),
          h('div', { class: 'form-actions sticky-actions' },
            h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: async () => {
              const c = catById(entry.categoryId);
              await persistEntry(entry, c);
              haptic(15);
              close();
              toast(editing ? 'Consommation modifiée — statistiques recalculées' : `Enregistré · ${c.short || c.name}`);
            } }, editing ? 'Enregistrer les modifications' : 'Enregistrer'),
            editing ? h('div', { class: 'row-actions' },
              h('button', { class: 'btn btn-ghost', onclick: () => { close(); openEntryForm({ entry: existing, duplicate: true }); } }, icon('copy', 16), 'Dupliquer'),
              h('button', { class: 'btn btn-ghost danger', onclick: async () => {
                if (await confirmDialog({ title: 'Supprimer cette consommation ?', message: 'Elle sera retirée du journal, des statistiques et des coûts.', confirm: 'Supprimer', danger: true })) {
                  await deleteEntry(existing); close();
                }
              } }, icon('trash', 16), 'Supprimer')) : null),
        );
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
  toast('Entrée supprimée', {
    action: 'Annuler', onAction: async () => { await save('entries', entry); toast('Entrée restaurée'); },
  });
}

function categoryPicker(entry, onchange) {
  const cats = state.categories.filter((c) => !c.archived || c.id === entry.categoryId);
  return h('div', { class: 'cat-picker' }, cats.map((c) => h('button', {
    type: 'button', class: `cat-pill tone-${c.color} ${c.id === entry.categoryId ? 'on' : ''}`,
    onclick: () => { if (c.id !== entry.categoryId) { haptic(); onchange(c.id); } },
  }, icon(c.icon, 16), c.short || c.name)));
}

function whenField(entry) {
  const input = h('input', { class: 'input', type: 'datetime-local', value: entry.at, max: `${dayKey()}T23:59`, onchange: (e) => { if (e.target.value) entry.at = e.target.value.slice(0, 16); } });
  const shift = (min) => {
    const d = new Date(Date.now() - min * 60000);
    entry.at = `${dayKey(d)}T${timeKey(d)}`; entry.tzOffset = d.getTimezoneOffset();
    input.value = entry.at;
  };
  return field('Date et heure', h('div', { class: 'stack-sm' }, input,
    h('div', { class: 'chips chips-sm' },
      h('button', { type: 'button', class: 'chip', onclick: () => shift(0) }, 'Maintenant'),
      h('button', { type: 'button', class: 'chip', onclick: () => shift(15) }, '−15 min'),
      h('button', { type: 'button', class: 'chip', onclick: () => shift(30) }, '−30 min'),
      h('button', { type: 'button', class: 'chip', onclick: () => shift(60) }, '−1 h'))));
}

function quickFill(stats, inputEl, unit = 'g') {
  const b = [];
  if (isNum(stats.last)) b.push(h('button', { type: 'button', class: 'chip', onclick: () => inputEl.setValue(stats.last) }, `Dernière · ${fmtQty(stats.last, unit)}`));
  if (isNum(stats.avg) && stats.n >= 2) b.push(h('button', { type: 'button', class: 'chip', onclick: () => inputEl.setValue(stats.avg) }, `Moyenne · ${fmtQty(stats.avg, unit)} (${stats.n})`));
  return b.length ? h('div', { class: 'chips chips-sm' }, b) : null;
}

function methodToggle(obj) {
  return segmented(METHODS.map((m) => ({ id: m.id, label: m.label })), obj.method || 'estimated', (v) => { obj.method = v; }, { small: true });
}

function tobaccoSection(entry, cat) {
  const t = entry.tobacco;
  const input = decimalInput({ value: t.grams, unit: 'g', label: 'Tabac en grammes', onchange: (v) => { t.grams = v; refreshCost(); } });
  const prods = productsOf('tobacco');
  return h('div', { class: 'form-block' },
    h('div', { class: 'block-head' }, h('span', { class: 'dot dot-blue' }), h('h4', null, 'Tabac'), methodToggle(t)),
    input,
    quickFill(recentStats(cat.id, (e) => e.tobacco?.grams, entry.id), input),
    prods.length > 1 ? field('Produit', select(prods.map((p) => ({ id: p.id, label: p.name })), t.productId, (v) => { t.productId = v; refreshCost(); })) : null,
    h('p', { class: 'hint' }, 'Laisse vide si tu ne connais pas la quantité : rien ne sera inventé.'));
}

function cbdSection(entry, cat) {
  const c = entry.cbd;
  const isJoint = cat.id === CAT.JOINT;
  const forms = isJoint ? CBD_FORMS.filter((f) => f.id !== 'oil') : CBD_FORMS;
  const block = h('div', { class: 'form-block' });
  const render = () => {
    const prods = productsOf('cbd', (p) => !c.form || p.cbdForm === c.form || (!p.cbdForm));
    const unitOptions = isJoint ? ['g'] : (c.form === 'oil' ? ['drop', 'ml'] : c.form === 'other' ? ['unit', 'g', 'ml'] : ['g']);
    if (!unitOptions.includes(c.unit)) c.unit = unitOptions[0];
    const input = decimalInput({ value: c.amount, unit: UNITS[c.unit].short, step: c.unit === 'drop' || c.unit === 'unit' ? 1 : 0.01, label: 'Quantité de CBD', onchange: (v) => { c.amount = v; refreshCost(); } });
    fill(block, 
      h('div', { class: 'block-head' }, h('span', { class: 'dot dot-green' }), h('h4', null, 'CBD'), methodToggle(c)),
      field(isJoint ? 'Type de CBD' : 'Produit consommé', chips(forms.map((f) => ({ id: f.id, label: f.label })), c.form, (v) => {
        c.form = v || forms[0].id;
        const match = productsOf('cbd', (p) => p.cbdForm === c.form)[0];
        if (match) { c.productId = match.id; c.unit = match.unit; }
        render(); refreshCost();
      }, { allowNone: false })),
      input,
      unitOptions.length > 1 ? field('Unité', segmented(unitOptions.map((u) => ({ id: u, label: UNITS[u].label })), c.unit, (v) => { c.unit = v; render(); refreshCost(); }, { small: true })) : null,
      quickFill(recentStats(cat.id, (e) => (e.cbd?.unit === c.unit ? e.cbd?.amount : null), entry.id), input, c.unit),
      prods.length ? field('Produit', select(prods.map((p) => ({ id: p.id, label: `${p.name}${p.unit !== c.unit ? ` (${UNITS[p.unit].short})` : ''}` })), c.productId, (v) => { c.productId = v; refreshCost(); }, { placeholder: 'Produit par défaut' })) : null,
      !isJoint ? field('Mode de consommation', chips(CBD_MODES, entry.mode, (v) => { entry.mode = v; })) : null,
      h('p', { class: 'hint' }, 'CBD et THC sont distincts : seul le CBD est suivi ici.'),
    );
  };
  render();
  return block;
}

function customQuantity(entry, cat) {
  const q = entry.quantity;
  const input = decimalInput({ value: q.amount, unit: cat.unitLabel || UNITS[cat.unit]?.short || '', step: cat.unit === 'unit' ? 1 : 0.01, onchange: (v) => { q.amount = v; } });
  return h('div', { class: 'form-block' }, h('div', { class: 'block-head' }, h('span', { class: 'dot dot-orange' }), h('h4', null, 'Quantité')), input,
    quickFill(recentStats(cat.id, (e) => e.quantity?.amount, entry.id), input, cat.unit));
}

function accessoriesSection(entry) {
  const block = h('div', { class: 'form-block' });
  const has = (type) => entry.accessories.some((a) => a.type === type);
  const setPaper = (type) => {
    entry.accessories = entry.accessories.filter((a) => a.type !== 'slim' && a.type !== 'classic');
    if (type) entry.accessories.push({ type, productId: null, count: 1 });
    render(); refreshCost();
  };
  const render = () => {
    const paper = has('slim') ? 'slim' : has('classic') ? 'classic' : 'none';
    fill(block, 
      h('div', { class: 'block-head' }, h('span', { class: 'dot dot-violet' }), h('h4', null, 'Accessoires')),
      field('Feuille', segmented([{ id: 'slim', label: 'Slim' }, { id: 'classic', label: 'Classique' }, { id: 'none', label: 'Aucune' }], paper, (v) => setPaper(v === 'none' ? null : v), { small: true })),
      toggle(has('filter'), (on) => {
        entry.accessories = entry.accessories.filter((a) => a.type !== 'filter');
        if (on) entry.accessories.push({ type: 'filter', productId: null, count: 1 });
        refreshCost();
      }, 'Filtre utilisé'),
      productsOf('accessory', (p) => p.accessoryType === 'other').length ? toggle(has('other'), (on) => {
        entry.accessories = entry.accessories.filter((a) => a.type !== 'other');
        if (on) entry.accessories.push({ type: 'other', productId: productsOf('accessory', (p) => p.accessoryType === 'other')[0].id, count: 1 });
        refreshCost();
      }, 'Autre accessoire') : null,
    );
  };
  render();
  return block;
}

function customFields(entry, cat) {
  entry.custom = entry.custom || {};
  return h('div', { class: 'form-block' }, cat.fields.map((f) => field(f.label,
    f.type === 'number'
      ? decimalInput({ value: entry.custom[f.id] ?? null, unit: f.unit || '', stepper: false, onchange: (v) => { entry.custom[f.id] = v; } })
      : textInput({ value: entry.custom[f.id] || '', oninput: (v) => { entry.custom[f.id] = v; } }))));
}

function detailsSection(entry, cat) {
  const open = !!(entry.context || entry.mood || entry.note);
  const details = h('details', { class: 'form-details', open },
    h('summary', null, 'Contexte, humeur, commentaire'),
    h('div', { class: 'stack' },
      field('Contexte', chips(CONTEXTS, entry.context, (v) => { entry.context = v; })),
      cat.id !== CAT.ROLLED ? field('Humeur', chips(MOODS, entry.mood, (v) => { entry.mood = v; })) : null,
      field('Commentaire', textArea({ value: entry.note, placeholder: 'Facultatif', oninput: (v) => { entry.note = v; } }))));
  return details;
}

let refreshCost = () => {};
function costPreview(entry) {
  const el = h('div', { class: 'cost-preview' });
  refreshCost = () => {
    const { ctx } = derived();
    const c = ctx.cost({ ...entry, updatedAt: `preview-${Math.random()}` });
    fill(el, 
      h('div', { class: 'cost-main' }, h('span', { class: 'muted' }, 'Coût estimé'), h('b', null, fmtMoney(c.total))),
      h('div', { class: 'cost-parts' },
        entry.tobacco ? h('span', null, `Tabac ${c.tobacco != null ? fmtMoney(c.tobacco) : '—'}`) : null,
        entry.cbd ? h('span', null, `CBD ${c.cbd != null ? fmtMoney(c.cbd) : '—'}`) : null,
        h('span', null, `Accessoires ${fmtMoney(c.accessories)}`)),
      !c.complete ? h('p', { class: 'hint warn' }, `Coût incomplet : ${c.missing.join(', ')}.`) : null);
  };
  refreshCost();
  return el;
}

/* =================================================================== */
/* Envie                                                                */
/* =================================================================== */

export function openCravingForm({ craving: existing, at } = {}) {
  const editing = !!existing;
  const c = existing ? clone(existing) : {
    id: uid('crv'), kind: 'craving', at: at || nowLocal(), tzOffset: nowTz(), intensity: 5, product: 'both', trigger: null, triggerOther: '',
    durationMin: null, situation: null, emotion: null, note: '', outcome: 'resisted', consumptionId: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  openSheet({
    title: editing ? "Modifier l'envie" : 'Envie de fumer',
    size: 'full',
    build: (close) => {
      const intensityLbl = h('span', { class: 'muted' }, intensityLabel(c.intensity));
      const triggerOther = textInput({ value: c.triggerOther || '', placeholder: 'Précise le déclencheur', oninput: (v) => { c.triggerOther = v; } });
      const otherWrap = h('div', { hidden: c.trigger !== 'other' }, triggerOther);
      const linked = c.consumptionId ? state.entries.find((e) => e.id === c.consumptionId) : null;
      return h('div', { class: 'stack form' },
        note('Noter une envie, c’est déjà mieux la comprendre. Ce n’est jamais un échec.', 'positive'),
        field('Issue', segmented([{ id: 'resisted', label: 'Résistée' }, { id: 'consumed', label: 'Suivie d’une consommation' }], c.outcome, (v) => { c.outcome = v; }, { small: true })),
        field('Date et heure', h('input', { class: 'input', type: 'datetime-local', value: c.at, onchange: (e) => { if (e.target.value) c.at = e.target.value.slice(0, 16); } })),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Intensité (0 à 10) ', intensityLbl),
          scale(0, 10, c.intensity, (v) => { c.intensity = v; intensityLbl.textContent = intensityLabel(v); }, { labels: ['aucune', 'très forte'] })),
        field('Produit concerné', segmented(CRAVING_PRODUCTS, c.product, (v) => { c.product = v; }, { small: true })),
        field('Déclencheur', chips(TRIGGERS, c.trigger, (v) => { c.trigger = v; otherWrap.hidden = v !== 'other'; })),
        otherWrap,
        field('Durée de l’envie', decimalInput({ value: c.durationMin, unit: 'min', step: 1, onchange: (v) => { c.durationMin = v; } })),
        field('Situation', chips(CONTEXTS, c.situation, (v) => { c.situation = v; })),
        field('État émotionnel', chips(MOODS, c.emotion, (v) => { c.emotion = v; })),
        field('Commentaire', textArea({ value: c.note, placeholder: 'Ce qui t’a aidé, ce qui s’est passé…', oninput: (v) => { c.note = v; } })),
        linked ? note(`Liée à : ${catById(linked.categoryId)?.name || 'consommation'} à ${linked.at.slice(11)}`, 'info') : null,
        h('div', { class: 'form-actions sticky-actions' },
          h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: async () => {
            c.updatedAt = new Date().toISOString();
            await save('entries', c);
            haptic(15);
            close();
            if (c.outcome === 'consumed' && !c.consumptionId) {
              toast('Envie enregistrée. Ajoute la consommation associée.');
              const cat = c.product === 'tobacco' ? CAT.ROLLED : c.product === 'cbd' ? CAT.CBD : CAT.JOINT;
              openEntryForm({ categoryId: cat, at: c.at, cravingId: c.id });
            } else {
              toast(c.outcome === 'resisted' ? 'Envie résistée enregistrée' : 'Envie modifiée');
            }
          } }, editing ? 'Enregistrer les modifications' : 'Enregistrer l’envie'),
          editing ? h('button', { class: 'btn btn-ghost danger btn-block', onclick: async () => {
            if (await confirmDialog({ title: 'Supprimer cette envie ?', message: 'Elle sera retirée du journal et des statistiques.', confirm: 'Supprimer', danger: true })) {
              await remove('entries', c.id); close(); toast('Envie supprimée', { action: 'Annuler', onAction: () => save('entries', existing) });
            }
          } }, icon('trash', 16), 'Supprimer') : null));
    },
  });
}

/** Lien envie → consommation après sauvegarde d'une consommation liée. */
export async function linkCraving(entry) {
  if (!entry.cravingId) return;
  const c = state.entries.find((x) => x.id === entry.cravingId);
  if (c && c.consumptionId !== entry.id) await save('entries', { ...c, consumptionId: entry.id, outcome: 'consumed' });
}

/* =================================================================== */
/* Nuit                                                                 */
/* =================================================================== */

export function openNightForm({ date } = {}) {
  const now = new Date();
  const defaultDate = date || (now.getHours() < 16 ? addDays(dayKey(), -1) : dayKey());
  const existing = state.nights.find((n) => n.date === defaultDate);
  let n = existing ? clone(existing) : newNight(defaultDate);
  const last = [...state.nights].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (!existing && last) { n.bedTime = last.bedTime; n.wakeTime = last.wakeTime; }

  openSheet({
    title: 'Ma nuit',
    size: 'full',
    build: (close) => {
      const root = h('div', { class: 'stack form' });
      const preview = h('div', { class: 'night-preview' });
      const refresh = () => {
        const c = computeNight(n);
        fill(preview, 
          h('div', null, h('span', { class: 'muted' }, 'Endormissement'), h('b', null, c.latencyMin != null ? formatDuration(c.latencyMin) : '—')),
          h('div', null, h('span', { class: 'muted' }, 'Endormi·e vers'), h('b', null, c.asleepTime || '—')),
          h('div', null, h('span', { class: 'muted' }, 'Sommeil'), h('b', null, c.totalSleepMin != null ? formatDuration(c.totalSleepMin) : '—')));
      };
      const time = (key, label) => field(label, h('input', { class: 'input', type: 'time', value: n[key] || '', onchange: (e) => { n[key] = isTime(e.target.value) ? e.target.value : null; refresh(); } }));
      const render = () => {
        const ctx = nightContext(n, state.entries);
        const latencyInput = decimalInput({ value: n.latencyMin, unit: 'min', step: 5, onchange: (v) => { n.latencyMin = v; refresh(); } });
        fill(root, 
          field('Nuit du', h('input', { class: 'input', type: 'date', value: n.date, max: dayKey(), onchange: (e) => {
            const d = e.target.value; if (!d) return;
            const ex = state.nights.find((x) => x.date === d);
            n = ex ? clone(ex) : { ...newNight(d), bedTime: n.bedTime, wakeTime: n.wakeTime };
            render();
          } }), 'Date de la soirée où la nuit commence.'),
          n.source === 'apple-health' || n.health ? note('Données complétées depuis Apple Santé. Tes modifications priment toujours.', 'info')
            : h('a', { class: 'chip ah-chip', href: '#/profile/applehealth' }, icon('heart', 14), 'Remplir depuis Apple Santé'),
          h('div', { class: 'grid-2' }, time('bedTime', 'Coucher'), time('tryTime', 'Essai de dormir')),
          field('Temps pour s’endormir', h('div', { class: 'stack-sm' }, latencyInput,
            h('div', { class: 'chips chips-sm' }, [15, 30, 60, 120, 240].map((m) => h('button', { type: 'button', class: 'chip', onclick: () => latencyInput.setValue(m) }, formatDuration(m))))),
          'Ou indique l’heure d’endormissement ci-dessous.'),
          h('div', { class: 'grid-2' }, time('asleepTime', 'Endormissement (heure)'), time('wakeTime', 'Réveil')),
          preview,
          field('Réveils nocturnes', decimalInput({ value: n.awakenings, unit: 'fois', step: 1, onchange: (v) => { n.awakenings = v == null ? null : Math.round(v); } })),
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Qualité du sommeil'), scale(1, 5, n.quality, (v) => { n.quality = v; }, { labels: ['très mauvaise', 'excellente'] })),
          field('Sensation au réveil', chips(WAKE_FEELINGS, n.wakeFeeling, (v) => { n.wakeFeeling = v; })),
          h('details', { class: 'form-details', open: [n.stress, n.agitation, n.fatigue, n.mood, n.relaxDifficulty, n.energy].some((x) => x != null) },
            h('summary', null, 'Bien-être de la journée'),
            h('div', { class: 'stack' },
              ...[['stress', 'Stress'], ['agitation', 'Agitation mentale'], ['fatigue', 'Fatigue'], ['mood', 'Humeur'], ['relaxDifficulty', 'Difficulté à se détendre'], ['energy', 'Énergie']]
                .map(([k, l]) => h('div', { class: 'field' }, h('span', { class: 'field-label' }, l), scale(1, 5, n[k], (v) => { n[k] = v; }, { labels: ['faible', 'élevé'] }))))),
          field('Commentaire', textArea({ value: n.note, placeholder: 'Facultatif', oninput: (v) => { n.note = v; } })),
          h('div', { class: 'card card-inset' },
            h('h4', { class: 'mini-title' }, 'La journée précédente'),
            h('div', { class: 'mini-grid' },
              h('div', null, h('b', null, String(ctx.day.count)), h('span', null, 'consommations')),
              h('div', null, h('b', null, fmtGrams(ctx.day.tobacco)), h('span', null, 'tabac')),
              h('div', null, h('b', null, fmtGrams(ctx.day.cbd)), h('span', null, 'CBD')),
              h('div', null, h('b', null, String(ctx.evening.count)), h('span', null, 'le soir (dès 18 h)')),
              h('div', null, h('b', null, String(ctx.day.cravings)), h('span', null, 'envies')),
              h('div', null, h('b', null, String(ctx.nightCravings)), h('span', null, 'envies la nuit'))),
            h('p', { class: 'hint' }, 'Simple mise en regard des données ; aucune conclusion médicale.')),
          h('div', { class: 'form-actions sticky-actions' },
            h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: async () => {
              n.id = `night_${n.date}`;
              await save('nights', n);
              close();
              const c = computeNight(n);
              toast('Nuit enregistrée');
              if ((c.latencyMin ?? 0) >= 120 || n.quality === 1) {
                toast('Nuit difficile notée. Si cela se répète, un professionnel de santé peut t’aider.', { duration: 5000 });
              }
            } }, 'Enregistrer la nuit'),
            state.nights.find((x) => x.id === `night_${n.date}`) ? h('button', { class: 'btn btn-ghost danger btn-block', onclick: async () => {
              if (await confirmDialog({ title: 'Supprimer cette nuit ?', message: 'Les données de sommeil de cette nuit seront supprimées.', confirm: 'Supprimer', danger: true })) {
                await remove('nights', `night_${n.date}`); close();
              }
            } }, 'Supprimer cette nuit') : null),
        );
        refresh();
      };
      render();
      return root;
    },
  });
}

/* =================================================================== */
/* Achats & produits                                                    */
/* =================================================================== */

const kindLabel = { tobacco: 'Tabac', cbd: 'CBD', accessory: 'Accessoire' };

function productLabel(p) {
  const sub = p.kind === 'cbd' ? labelOf(CBD_FORMS, p.cbdForm) : p.kind === 'accessory' ? labelOf(ACCESSORY_TYPES, p.accessoryType) : 'Tabac';
  return `${p.name || 'Sans nom'} · ${sub}`;
}

export function openPurchaseForm({ purchase: existing, productId } = {}) {
  const editing = !!existing;
  const p = existing ? clone(existing) : {
    id: uid('pur'), productId: productId || state.settings.defaultProducts.tobacco, date: dayKey(),
    packPrice: null, packSize: null, packCount: 1, supplier: '', note: '', addToStock: true,
  };
  const prev = !existing ? [...state.purchases].filter((x) => x.productId === p.productId).sort((a, b) => (a.date < b.date ? 1 : -1))[0] : null;
  if (prev) { p.packPrice = prev.packPrice; p.packSize = prev.packSize; p.supplier = prev.supplier || ''; }

  openSheet({
    title: editing ? "Modifier l'achat" : 'Nouvel achat',
    size: 'full',
    build: (close) => {
      const root = h('div', { class: 'stack form' });
      const calc = h('div', { class: 'cost-preview' });
      const refresh = () => {
        const prod = productById(p.productId);
        const u = unitPrice(p.packPrice, p.packSize);
        const unitShort = prod ? (prod.kind === 'accessory' ? 'unité' : UNITS[prod.unit]?.short) : '';
        fill(calc, 
          h('div', { class: 'cost-main' }, h('span', { class: 'muted' }, `Prix ${prod?.kind === 'accessory' ? 'unitaire' : 'au ' + (prod?.unit === 'g' ? 'gramme' : unitShort)}`), h('b', null, u != null ? fmtMoney(u, { digits: u < 0.1 ? 4 : 2 }) : '—')),
          h('div', { class: 'cost-parts' }, h('span', null, `Total payé ${fmtMoney(purchaseTotal(p))}`)));
      };
      const render = () => {
        const prod = productById(p.productId);
        const sizeUnit = prod?.kind === 'accessory' ? 'unités' : UNITS[prod?.unit || 'g'].short;
        fill(root, 
          field('Produit', h('div', { class: 'stack-sm' },
            select(state.products.filter((x) => !x.archived || x.id === p.productId).map((x) => ({ id: x.id, label: productLabel(x) })), p.productId, (v) => { p.productId = v; render(); }),
            h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => openProductForm({ onSaved: (np) => { p.productId = np.id; render(); } }) }, icon('plus', 14), 'Nouveau produit'))),
          field('Date d’achat', h('input', { class: 'input', type: 'date', value: p.date, max: dayKey(), onchange: (e) => { if (e.target.value) p.date = e.target.value; } })),
          h('div', { class: 'grid-2' },
            field('Prix du paquet', decimalInput({ value: p.packPrice, unit: '€', stepper: false, onchange: (v) => { p.packPrice = v; refresh(); } })),
            field(prod?.kind === 'accessory' ? 'Unités par paquet' : 'Contenance', decimalInput({ value: p.packSize, unit: sizeUnit, stepper: false, onchange: (v) => { p.packSize = v; refresh(); } }))),
          field('Nombre de paquets', decimalInput({ value: p.packCount, unit: '', step: 1, min: 1, onchange: (v) => { p.packCount = v ? Math.max(1, Math.round(v)) : 1; refresh(); } })),
          calc,
          field('Fournisseur', textInput({ value: p.supplier, placeholder: 'Facultatif', oninput: (v) => { p.supplier = v; } })),
          state.settings.stock?.enabled ? toggle(p.addToStock !== false, (on) => { p.addToStock = on; }, 'Ajouter au stock') : null,
          h('div', { class: 'form-actions sticky-actions' },
            h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: async () => {
              if (!isNum(p.packPrice) || !isNum(p.packSize) || p.packSize <= 0) { toast('Indique le prix et la contenance du paquet.', { tone: 'warn' }); return; }
              await save('purchases', p); close(); toast(editing ? 'Achat modifié — coûts recalculés' : 'Achat enregistré');
            } }, 'Enregistrer'),
            editing ? h('button', { class: 'btn btn-ghost danger btn-block', onclick: async () => {
              if (await confirmDialog({ title: 'Supprimer cet achat ?', message: 'Les coûts des consommations seront recalculés avec les autres tarifs connus.', confirm: 'Supprimer', danger: true })) {
                await remove('purchases', p.id); close();
              }
            } }, 'Supprimer l’achat') : null));
        refresh();
      };
      render();
      return root;
    },
  });
}

export function openProductForm({ product: existing, kind = 'tobacco', onSaved } = {}) {
  const editing = !!existing;
  const p = existing ? clone(existing) : newProduct(kind);
  openSheet({
    title: editing ? 'Modifier le produit' : 'Nouveau produit',
    size: 'full',
    build: (close) => {
      const root = h('div', { class: 'stack form' });
      const render = () => {
        const isDefault = (() => {
          const d = state.settings.defaultProducts;
          if (p.kind === 'accessory') return d[p.accessoryType] === p.id;
          return d[p.kind] === p.id;
        })();
        let setDefault = isDefault;
        fill(root, 
          !editing ? field('Type', segmented([{ id: 'tobacco', label: 'Tabac' }, { id: 'cbd', label: 'CBD' }, { id: 'accessory', label: 'Accessoire' }], p.kind, (v) => {
            Object.assign(p, newProduct(v), { id: p.id, name: p.name });
            render();
          }, { small: true })) : h('p', { class: 'muted' }, kindLabel[p.kind]),
          field('Nom', textInput({ value: p.name, placeholder: p.kind === 'tobacco' ? 'Ex. Tabac à rouler' : p.kind === 'cbd' ? 'Ex. Fleurs CBD' : 'Ex. Feuilles slim', oninput: (v) => { p.name = v; } })),
          p.kind === 'tobacco' ? field('Marque', textInput({ value: p.brand, placeholder: 'Facultatif', oninput: (v) => { p.brand = v; } })) : null,
          p.kind === 'cbd' ? field('Forme', chips(CBD_FORMS, p.cbdForm, (v) => { p.cbdForm = v || 'flower'; p.unit = CBD_FORMS.find((f) => f.id === p.cbdForm).unit === 'drop' ? 'drop' : p.cbdForm === 'other' ? p.unit : 'g'; render(); }, { allowNone: false })) : null,
          p.kind === 'cbd' && (p.cbdForm === 'oil' || p.cbdForm === 'other') ? field('Unité de mesure', segmented(['g', 'ml', 'drop', 'unit'].map((u) => ({ id: u, label: UNITS[u].label })), p.unit, (v) => { p.unit = v; }, { small: true })) : null,
          p.kind === 'cbd' ? field('Fournisseur', textInput({ value: p.supplier, placeholder: 'Facultatif', oninput: (v) => { p.supplier = v; } })) : null,
          p.kind === 'accessory' ? field('Catégorie', chips(ACCESSORY_TYPES.map((a) => ({ id: a.id, label: a.label })), p.accessoryType, (v) => { p.accessoryType = v || 'other'; }, { allowNone: false })) : null,
          h('div', { class: 'form-block' },
            h('div', { class: 'block-head' }, h('h4', null, 'Tarif de référence'), badge('facultatif')),
            h('p', { class: 'hint' }, 'Utilisé uniquement si aucun achat n’est enregistré. Les achats datés priment toujours.'),
            h('div', { class: 'grid-2' },
              field('Prix du paquet', decimalInput({ value: p.refPackPrice, unit: '€', stepper: false, onchange: (v) => { p.refPackPrice = v; } })),
              field(p.kind === 'accessory' ? 'Unités' : 'Contenance', decimalInput({ value: p.refPackSize, unit: p.kind === 'accessory' ? 'u.' : UNITS[p.unit].short, stepper: false, onchange: (v) => { p.refPackSize = v; } })))),
          toggle(isDefault, (on) => { setDefault = on; }, 'Produit par défaut pour cette catégorie'),
          h('div', { class: 'form-actions sticky-actions' },
            h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: async () => {
              if (!p.name.trim()) { toast('Donne un nom au produit.', { tone: 'warn' }); return; }
              await save('products', p);
              if (setDefault && !isDefault) {
                const key = p.kind === 'accessory' ? p.accessoryType : p.kind;
                await saveSettings({ defaultProducts: { ...state.settings.defaultProducts, [key]: p.id } });
              }
              close(); toast('Produit enregistré'); onSaved?.(p);
            } }, 'Enregistrer'),
            editing ? h('button', { class: 'btn btn-ghost btn-block', onclick: async () => {
              await save('products', { ...p, archived: !p.archived }); close();
              toast(p.archived ? 'Produit réactivé' : 'Produit archivé (son historique est conservé)');
            } }, p.archived ? 'Réactiver' : 'Archiver') : null));
      };
      render();
      return root;
    },
  });
}

export function openInventoryForm({ productId } = {}) {
  const inv = { id: uid('inv'), productId: productId || state.settings.defaultProducts.tobacco, at: nowLocal(), quantity: null, note: '' };
  openSheet({
    title: 'Corriger le stock',
    build: (close) => {
      const prod = () => productById(inv.productId);
      const unit = () => (prod()?.kind === 'accessory' ? 'u.' : UNITS[prod()?.unit || 'g'].short);
      const qty = decimalInput({ value: null, unit: unit(), stepper: false, onchange: (v) => { inv.quantity = v; } });
      return h('div', { class: 'stack form' },
        field('Produit', select(state.products.filter((p) => !p.archived).map((p) => ({ id: p.id, label: productLabel(p) })), inv.productId, (v) => { inv.productId = v; })),
        field('Quantité réellement restante', qty, 'Les consommations suivantes seront déduites à partir de cette valeur.'),
        h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: async () => {
          if (!isNum(inv.quantity)) { toast('Indique la quantité restante.', { tone: 'warn' }); return; }
          await save('inventories', inv); close(); toast('Stock corrigé');
        } }, 'Enregistrer'));
    },
  });
}

/* =================================================================== */
/* Catégories personnalisées                                            */
/* =================================================================== */

export function openCategoryForm({ category: existing } = {}) {
  const c = existing ? clone(existing) : newCustomCategory();
  const system = !!c.system;
  openSheet({
    title: existing ? 'Modifier la catégorie' : 'Nouvelle catégorie',
    size: 'full',
    build: (close) => {
      const root = h('div', { class: 'stack form' });
      const render = () => {
        fill(root, 
          field('Nom', textInput({ value: c.name, placeholder: 'Ex. Cigarette électronique', oninput: (v) => { c.name = v; } })),
          field('Nom court', textInput({ value: c.short, placeholder: 'Affiché dans les listes', oninput: (v) => { c.short = v; } })),
          field('Couleur', chips(['green', 'blue', 'orange', 'violet'].map((x) => ({ id: x, label: { violet: 'Bruyère', green: 'Feuille', blue: 'Ardoise', orange: 'Terre cuite' }[x] })), c.color, (v) => { c.color = v || 'orange'; }, { allowNone: false })),
          system ? note('Catégorie prédéfinie : seuls le nom et la couleur sont modifiables, pour préserver la fiabilité des statistiques.', 'info') : h('div', { class: 'stack' },
            toggle(!!c.tobacco, (on) => { c.tobacco = on; }, 'Contient du tabac (en grammes)'),
            toggle(!!c.cbd, (on) => { c.cbd = on; render(); }, 'Contient du CBD'),
            c.cbd ? field('Unité du CBD', segmented(['g', 'ml', 'drop', 'unit'].map((u) => ({ id: u, label: UNITS[u].short })), c.cbdUnit || 'g', (v) => { c.cbdUnit = v; }, { small: true })) : null,
            toggle(!!c.tracksQuantity, (on) => { c.tracksQuantity = on; render(); }, 'Suivre une quantité propre'),
            c.tracksQuantity ? h('div', { class: 'grid-2' },
              field('Unité', select(Object.values(UNITS).map((u) => ({ id: u.id, label: u.label })), c.unit, (v) => { c.unit = v || 'unit'; })),
              field('Libellé', textInput({ value: c.unitLabel, placeholder: 'ex. bouffées', oninput: (v) => { c.unitLabel = v; } }))) : null,
            h('div', { class: 'form-block' },
              h('div', { class: 'block-head' }, h('h4', null, 'Champs personnalisés')),
              ...(c.fields || []).map((f, i) => h('div', { class: 'inline-field' },
                textInput({ value: f.label, placeholder: 'Libellé', oninput: (v) => { f.label = v; } }),
                select([{ id: 'text', label: 'Texte' }, { id: 'number', label: 'Nombre' }], f.type, (v) => { f.type = v || 'text'; }),
                h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Retirer', onclick: () => { c.fields.splice(i, 1); render(); } }, icon('close', 16)))),
              h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { c.fields = [...(c.fields || []), { id: uid('fld'), label: '', type: 'text' }]; render(); } }, icon('plus', 14), 'Ajouter un champ'))),
          h('div', { class: 'form-actions sticky-actions' },
            h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: async () => {
              if (!c.name.trim()) { toast('Donne un nom à la catégorie.', { tone: 'warn' }); return; }
              c.fields = (c.fields || []).filter((f) => f.label.trim());
              await save('categories', c); close(); toast('Catégorie enregistrée');
            } }, 'Enregistrer'),
            existing && !system ? h('button', { class: 'btn btn-ghost btn-block', onclick: async () => {
              await save('categories', { ...c, archived: !c.archived }); close();
              toast(c.archived ? 'Catégorie réactivée' : 'Catégorie archivée (historique conservé)');
            } }, c.archived ? 'Réactiver' : 'Archiver') : null));
      };
      render();
      return root;
    },
  });
}

/* =================================================================== */
/* Objectifs                                                            */
/* =================================================================== */

function goalInput(metric, value, onchange) {
  const m = metricOf(metric);
  if (m.time) {
    const v = isNum(value) ? `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.round(value % 60)).padStart(2, '0')}` : '';
    return h('input', { class: 'input', type: 'time', value: v, onchange: (e) => onchange(hm(e.target.value)) });
  }
  if (m.pct) return decimalInput({ value: isNum(value) ? Math.round(value * 100) : null, unit: '%', step: 5, max: 100, onchange: (v) => onchange(v == null ? null : v / 100) });
  const step = metric === 'spend' ? 1 : metric.endsWith('_g') ? 0.05 : 0.5;
  return decimalInput({ value, unit: m.unit, step, onchange });
}

export function formatGoalValue(metric, v) {
  const m = metricOf(metric);
  if (!isNum(v)) return '—';
  if (m.time) return `${Math.floor(v / 60)} h ${String(Math.round(v % 60)).padStart(2, '0')}`;
  if (m.pct) return `${Math.round(v * 100)} %`;
  if (metric === 'spend') return `${fmtMoney(v)} / sem.`;
  if (metric.endsWith('_g')) return `${fmtGrams(v)} / j`;
  return `${fmtNum(v, 1)} / j`;
}

export function openGoalForm({ goal: existing, metric } = {}) {
  const editing = !!existing;
  let g = existing ? clone(existing) : newGoal(metric || 'tobacco_g', null, dayKey());
  openSheet({
    title: editing ? "Modifier l'objectif" : 'Nouvel objectif',
    size: 'full',
    build: (close) => {
      const root = h('div', { class: 'stack form' });
      const render = () => {
        const m = metricOf(g.metric);
        const base = baselineValue(g.metric, state.settings.baseline);
        fill(root, 
          !editing ? field('Ce que tu veux suivre', select(GOAL_METRICS.map((x) => ({ id: x.id, label: `${x.label} (${x.unit})` })), g.metric, (v) => { g = { ...g, metric: v, target: null, steps: [] }; render(); })) : h('h3', null, `${m.label} · ${m.unit}`),
          base != null ? note(`Ta référence : ${formatGoalValue(g.metric, base)}.`, 'info') : note('Pas encore de référence : elle sera calculée à la fin de ta période d’observation (ou depuis Objectifs).', 'info'),
          field(m.dir === 'down' ? 'Cible (au plus)' : 'Cible (au moins)', goalInput(g.metric, g.target, (v) => { g.target = v; })),
          h('div', { class: 'form-block' },
            h('div', { class: 'block-head' }, h('h4', null, 'Paliers progressifs'), badge('facultatif')),
            h('p', { class: 'hint' }, 'Définis ton propre rythme. Aucun calendrier n’est imposé et tu peux tout modifier à tout moment.'),
            ...(g.steps || []).map((s, i) => h('div', { class: 'inline-field' },
              h('input', { class: 'input', type: 'date', value: s.date || '', onchange: (e) => { s.date = e.target.value; } }),
              goalInput(g.metric, s.target, (v) => { s.target = v; }),
              h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Retirer le palier', onclick: () => { g.steps.splice(i, 1); render(); } }, icon('close', 16)))),
            h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => {
              const lastStep = g.steps[g.steps.length - 1];
              g.steps = [...(g.steps || []), { date: lastStep?.date ? addDays(lastStep.date, 7) : dayKey(), target: lastStep?.target ?? g.target ?? null }];
              render();
            } }, icon('plus', 14), 'Ajouter un palier')),
          field('Note', textArea({ value: g.note, placeholder: 'Pourquoi cet objectif compte pour toi (facultatif)', oninput: (v) => { g.note = v; } })),
          editing ? toggle(g.active, (on) => { g.active = on; }, 'Objectif actif') : null,
          h('div', { class: 'form-actions sticky-actions' },
            h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: async () => {
              if (!isNum(g.target)) { toast('Indique une cible.', { tone: 'warn' }); return; }
              g.steps = (g.steps || []).filter((s) => s.date && isNum(s.target));
              const toSave = editing ? reviseGoal(existing, { target: g.target, steps: g.steps, note: g.note, active: g.active }) : g;
              await save('goals', toSave); close(); toast(editing ? 'Objectif mis à jour (historique conservé)' : 'Objectif créé');
            } }, 'Enregistrer'),
            editing ? h('button', { class: 'btn btn-ghost danger btn-block', onclick: async () => {
              if (await confirmDialog({ title: 'Supprimer cet objectif ?', message: 'Tes données de consommation ne sont pas touchées.', confirm: 'Supprimer', danger: true })) { await remove('goals', g.id); close(); }
            } }, 'Supprimer l’objectif') : null));
      };
      render();
      return root;
    },
  });
}

export { parseDecimal, toInput, fmtNum };
