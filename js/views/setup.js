// Configuration guidée des habitudes (premier lancement et Réglages).
//  1. Méthodes de consommation (catalogue illustré, choix multiple)
//  2. Produits associés (prix, contenance, nicotine…)
//  3. Méthode principale
//  4. Mode d'utilisation par méthode (libre / réduction / arrêt)

import { h, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { field, textInput, decimalInput, segmented, chips, toggle, toast, note } from '../ui/components.js';
import { state, save, saveSettings, catById, productById } from '../core/store.js';
import { dayKey } from '../core/dates.js';
import { isNum } from '../core/format.js';
import { uid, newProduct, MOLECULES, CBD_FORMS } from '../domain/models.js';
import { METHOD_CATALOG, JOINT_COMPOSITIONS, compositionOf } from '../domain/methods.js';

export const MODES = [
  { id: 'free', label: 'Suivi libre', hint: 'Je veux juste comprendre mes habitudes.' },
  { id: 'reduce', label: 'Réduction', hint: 'Je veux diminuer à mon rythme.' },
  { id: 'quit', label: 'Arrêt', hint: 'Je veux arrêter, avec une date.' },
];

/** Produit par défaut d'un type : existant (modifié sur place) ou nouveau. */
function draftProduct(kind, extra = {}) {
  const id = state.settings.defaultProducts?.[kind];
  const cur = id ? productById(id) : null;
  return cur ? JSON.parse(JSON.stringify(cur)) : newProduct(kind, extra);
}

/** Prix « paquet » courant d'un produit (dernier achat, sinon tarif de référence). */
function lastPack(p) {
  const pur = [...state.purchases].filter((x) => x.productId === p.id).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  return { price: pur?.packPrice ?? p.refPackPrice ?? null, size: pur?.packSize ?? p.refPackSize ?? null, fromPurchase: !!pur };
}

export function renderSetup({ onDone, embedded = false } = {}) {
  const hb = state.settings.habits || {};
  const selected = new Set(hb.enabled?.filter((id) => METHOD_CATALOG.find((m) => m.id === id) || catById(id)) || []);
  let primary = hb.primary || null;
  const modes = JSON.parse(JSON.stringify(hb.modes || {}));
  let jointComposition = hb.jointComposition || null;
  const drafts = {}; // kind → { product, price, size }
  const draft = (kind, extra) => {
    if (!drafts[kind]) { const p = draftProduct(kind, extra); const lp = lastPack(p); drafts[kind] = { product: p, price: lp.price, size: lp.size, priceTouched: false }; }
    return drafts[kind];
  };
  let step = 0;
  const root = h('div', { class: 'setup' });

  const priceSize = (kind, sizeLabel, sizeUnit, step2 = 1) => {
    const d = draft(kind);
    return h('div', { class: 'grid-2' },
      field('Prix', decimalInput({ value: d.price, unit: '€', stepper: false, onchange: (v) => { d.price = v; d.priceTouched = true; } })),
      field(sizeLabel, decimalInput({ value: d.size, unit: sizeUnit, step: step2, stepper: false, onchange: (v) => { d.size = v; d.priceTouched = true; } })));
  };
  const nameField = (kind, label = 'Nom', ph = '') => field(label, textInput({ value: draft(kind).product.name, placeholder: ph, oninput: (v) => { draft(kind).product.name = v; } }));
  const brandField = (kind) => field('Marque', textInput({ value: draft(kind).product.brand, placeholder: 'Facultatif', oninput: (v) => { draft(kind).product.brand = v; } }));
  const num = (kind, key, unit, label, stepv = 0.1) => field(label, decimalInput({ value: draft(kind).product[key], unit, step: stepv, stepper: false, onchange: (v) => { draft(kind).product[key] = v; } }));

  const productCards = () => {
    const cards = [];
    const cardFor = (title, ic, ...body) => h('div', { class: 'form-block' }, h('div', { class: 'block-head' }, h('span', { class: 'setup-ic' }, icon(ic, 18)), h('h4', null, title)), ...body);
    if (selected.has('cigarette')) {
      draft('cigarettes', { name: 'Cigarettes' });
      cards.push(cardFor('Cigarettes industrielles', 'cigarette', brandField('cigarettes'), nameField('cigarettes', 'Produit', 'Ex. Blondes 20'),
        priceSize('cigarettes', 'Cigarettes / paquet', 'cig.'), num('cigarettes', 'nicotinePerUnit', 'mg', 'Nicotine par cigarette (si indiquée)')));
    }
    const needsTobacco = ['rolled', 'pipe', 'hookah'].some((m) => selected.has(m)) || (selected.has('joint') && compositionOf(jointComposition)?.tobacco);
    if (needsTobacco) {
      draft('tobacco', { name: 'Tabac à rouler' });
      cards.push(cardFor('Tabac', 'rolled', brandField('tobacco'), nameField('tobacco', 'Produit', 'Ex. Tabac à rouler'), priceSize('tobacco', 'Poids du paquet', 'g', 5)));
    }
    if (selected.has('rolled')) {
      const hasSlim = (state.settings.quickDefaults?.rolled?.accessories || []).some((a) => a.type === 'slim');
      cards.push(cardFor('Roulées', 'rolled',
        field('Feuille habituelle', segmented([{ id: 'classic', label: 'Classique' }, { id: 'slim', label: 'Slim' }], hasSlim ? 'slim' : 'classic', (v) => { rolledPaper = v; }, { small: true })),
        toggle(rolledFilter, (on) => { rolledFilter = on; }, 'Avec filtre')));
    }
    if (selected.has('joint')) {
      cards.push(cardFor('Joints', 'joint',
        field('Composition habituelle', chips(JOINT_COMPOSITIONS.map((c) => ({ id: c.id, label: c.label })), jointComposition, (v) => { jointComposition = v; render(); }, { allowNone: true })),
        h('p', { class: 'hint' }, 'Modifiable à chaque joint. Rien n’est supposé par défaut.')));
    }
    const needsCannabis = selected.has('cbd') || (selected.has('joint') && jointComposition && jointComposition !== 'tobacco_resin');
    if (needsCannabis || (selected.has('joint') && jointComposition === 'tobacco_resin')) {
      const d = draft('cbd', { name: 'Fleurs CBD' });
      const comp = compositionOf(jointComposition);
      if (comp?.cannabis?.[0] && !d.molTouched) { d.product.molecule = comp.cannabis[0].molecule === 'unknown' ? (d.product.molecule || 'cbd') : comp.cannabis[0].molecule; d.product.cbdForm = comp.cannabis[0].form; }
      cards.push(cardFor('CBD / cannabinoïde', 'leaf', nameField('cbd', 'Produit', 'Ex. Fleurs CBD'),
        field('Molécule', chips(MOLECULES.filter((m) => m.id !== 'unknown').map((m) => ({ id: m.id, label: m.short })), d.product.molecule || 'cbd', (v) => { d.product.molecule = v || 'cbd'; d.molTouched = true; }, { allowNone: false })),
        field('Forme', chips(CBD_FORMS.filter((f) => f.id !== 'oil').map((f) => ({ id: f.id, label: f.label })), d.product.cbdForm || 'flower', (v) => { d.product.cbdForm = v || 'flower'; }, { allowNone: false })),
        priceSize('cbd', 'Quantité achetée', 'g', 1)));
    }
    if (selected.has('vape')) {
      const dev = draft('device', { name: 'Ma vape' });
      draft('liquid', { name: 'E-liquide' });
      cards.push(cardFor('Vape — appareil', 'vape', nameField('device', 'Nom', 'Ex. Ma vape'),
        field('Modèle', textInput({ value: dev.product.model, placeholder: 'Facultatif', oninput: (v) => { dev.product.model = v; } })),
        num('device', 'tankMl', 'ml', 'Capacité du réservoir', 0.5)));
      cards.push(cardFor('Vape — e-liquide', 'vape', brandField('liquid'), nameField('liquid', 'Nom', 'Ex. Menthe fraîche'),
        priceSize('liquid', 'Contenance du flacon', 'ml', 5), num('liquid', 'nicotineMgPerMl', 'mg/ml', 'Nicotine (0 si sans nicotine)', 1)));
    }
    if (selected.has('puff')) {
      const d = draft('puff', { name: 'Puff' });
      cards.push(cardFor('Puff', 'puff', brandField('puff'), nameField('puff', 'Modèle', 'Ex. Puff 600'),
        field('Type', segmented([{ id: 'disposable', label: 'Jetable' }, { id: 'rechargeable', label: 'Rechargeable' }, { id: 'pod', label: 'Pod' }], d.product.puffType || 'disposable', (v) => { d.product.puffType = v; }, { small: true })),
        priceSize('puff', 'Bouffées annoncées', 'bouffées', 100), num('puff', 'nicotineMgPerMl', 'mg/ml', 'Nicotine (si indiquée)', 1)));
    }
    if (selected.has('cigar') || selected.has('cigarillo')) {
      draft('cigars', { name: selected.has('cigar') ? 'Cigares' : 'Cigarillos' });
      cards.push(cardFor('Cigares / cigarillos', 'cigar', brandField('cigars'), nameField('cigars', 'Produit'), priceSize('cigars', 'Pièces par boîte', 'pièces')));
    }
    if (!cards.length) cards.push(note('Aucun produit à configurer pour ces méthodes. Tu pourras en ajouter dans Réglages › Produits.', 'info'));
    return cards;
  };
  let rolledPaper = null;
  let rolledFilter = (state.settings.quickDefaults?.rolled?.accessories || []).some((a) => a.type === 'filter');

  const steps = [
    () => h('div', { class: 'stack' },
      h('h2', null, 'Que consommes-tu ?'),
      h('p', { class: 'muted' }, 'Choisis une ou plusieurs méthodes. Tu pourras en ajouter ou en retirer à tout moment, sans perdre ton historique.'),
      h('div', { class: 'catalog' }, METHOD_CATALOG.map((m) => h('button', {
        class: `catalog-tile ${selected.has(m.id) ? 'on' : ''}`, 'aria-pressed': String(selected.has(m.id)),
        onclick: () => { if (selected.has(m.id)) selected.delete(m.id); else selected.add(m.id); render(); },
      }, h('span', { class: 'catalog-ill' }, icon(m.icon, 30)), h('b', null, m.short), m.blurb ? h('span', { class: 'muted small' }, m.blurb) : null,
      h('span', { class: 'catalog-check' }, icon('check', 14))))),
      state.categories.filter((c) => !c.system && !c.archived).length ? h('div', { class: 'stack-sm' }, h('span', { class: 'field-label' }, 'Mes catégories personnalisées'),
        chips(state.categories.filter((c) => !c.system && !c.archived).map((c) => ({ id: c.id, label: c.name })), [...selected].filter((id) => !METHOD_CATALOG.find((m) => m.id === id)), (v) => {
          for (const c of state.categories.filter((x) => !x.system)) selected.delete(c.id);
          for (const id of v || []) selected.add(id);
        }, { multiple: true })) : null,
      h('p', { class: 'hint' }, 'Une autre méthode ? Crée une catégorie dans Réglages › Catégories.')),
    () => h('div', { class: 'stack' },
      h('h2', null, 'Tes produits'),
      h('p', { class: 'muted' }, 'Prix et contenances servent à calculer le coût exact de chaque consommation. Tout est facultatif ; tu pourras ajouter d’autres marques ensuite.'),
      ...productCards()),
    () => h('div', { class: 'stack' },
      h('h2', null, 'Ta méthode principale'),
      h('p', { class: 'muted' }, 'Elle sera mise en avant sur l’accueil et dans l’ajout rapide. L’app te montrera aussi celle que tu utilises réellement le plus, sans jamais changer ton choix.'),
      h('div', { class: 'ob-choices' }, [...selected].map((id) => {
        const c = catById(id) || METHOD_CATALOG.find((m) => m.id === id);
        return h('button', { class: `ob-choice ${primary === id ? 'on' : ''}`, onclick: () => { primary = id; render(); } }, h('span', { class: 'choice-row' }, icon(c.icon, 20), c.name));
      }))),
    () => h('div', { class: 'stack' },
      h('h2', null, 'Ton objectif'),
      h('p', { class: 'muted' }, 'Aucun objectif n’est obligatoire. Tu peux suivre librement une méthode et en réduire une autre, et changer d’avis à tout moment.'),
      h('div', { class: 'stack-sm' }, h('span', { class: 'field-label' }, 'Pour tout'), segmented(MODES.map((m) => ({ id: m.id, label: m.label })), commonMode(), (v) => { for (const id of selected) modes[id] = { ...(modes[id] || {}), mode: v }; render(); })),
      ...[...selected].map((id) => {
        const c = catById(id) || METHOD_CATALOG.find((m) => m.id === id);
        const md = modes[id] || { mode: 'free' };
        return h('div', { class: 'form-block' },
          h('div', { class: 'block-head' }, h('span', { class: 'setup-ic' }, icon(c.icon, 18)), h('h4', null, c.name)),
          segmented(MODES.map((m) => ({ id: m.id, label: m.label })), md.mode || 'free', (v) => { modes[id] = { ...md, mode: v, quitDate: v === 'quit' ? (md.quitDate || dayKey()) : md.quitDate }; render(); }, { small: true }),
          md.mode === 'quit' ? field('Date d’arrêt', h('input', { class: 'input', type: 'date', value: md.quitDate || dayKey(), onchange: (e) => { modes[id] = { ...modes[id], quitDate: e.target.value || dayKey() }; } })) : null);
      }),
      h('p', { class: 'hint' }, 'Une consommation après un arrêt ne remet jamais tes progrès à zéro.')),
  ];

  function commonMode() {
    const vals = [...selected].map((id) => modes[id]?.mode || 'free');
    return vals.length && vals.every((v) => v === vals[0]) ? vals[0] : null;
  }

  async function finish() {
    const enabled = [...selected];
    if (!enabled.length) { toast('Choisis au moins une méthode', { tone: 'warn' }); step = 0; render(); return; }
    // Produits : enregistrés (modifiés sur place s'ils existaient), prix → achat daté.
    const defaults = { ...state.settings.defaultProducts };
    for (const [kind, d] of Object.entries(drafts)) {
      const used = { cigarettes: selected.has('cigarette'), tobacco: true, cbd: true, liquid: selected.has('vape'), device: selected.has('vape'), puff: selected.has('puff'), cigars: selected.has('cigar') || selected.has('cigarillo') }[kind];
      if (!used) continue;
      const p = d.product;
      if (!p.name?.trim()) p.name = { cigarettes: 'Cigarettes', tobacco: 'Tabac', cbd: 'CBD', liquid: 'E-liquide', device: 'Ma vape', puff: 'Puff', cigars: 'Cigares' }[kind];
      if (kind === 'puff' && !p.openedAt) p.openedAt = `${dayKey()}T00:00`;
      await save('products', p);
      defaults[kind] = p.id;
      const lp = lastPack(p);
      if (d.priceTouched && isNum(d.price) && isNum(d.size) && d.size > 0 && (d.price !== lp.price || d.size !== lp.size)) {
        await save('purchases', { id: uid('pur'), productId: p.id, date: dayKey(), packPrice: d.price, packSize: d.size, packCount: 1, supplier: '', note: 'Configuration', addToStock: false });
      }
    }
    // Raccourcis : feuille et filtre habituels des roulées, composition des joints.
    const qd = { ...state.settings.quickDefaults };
    if (selected.has('rolled') && (rolledPaper || rolledFilter != null)) {
      const paper = rolledPaper || ((qd.rolled?.accessories || []).some((a) => a.type === 'slim') ? 'slim' : 'classic');
      qd.rolled = { ...(qd.rolled || {}), accessories: [{ type: paper, count: 1 }, ...(rolledFilter ? [{ type: 'filter', count: 1 }] : [])] };
    }
    if (selected.has('joint') && jointComposition) qd.joint = { ...(qd.joint || {}), composition: jointComposition };
    if (selected.has('joint') && jointComposition && !compositionOf(jointComposition)?.tobacco) qd.joint.tobacco = undefined;
    if (drafts.cbd?.product?.molecule) await saveSettings({ defaultMolecule: drafts.cbd.product.molecule });
    for (const id of enabled) if (!modes[id]) modes[id] = { mode: 'free', quitDate: null };
    await saveSettings({
      defaultProducts: defaults, quickDefaults: qd,
      habits: { configured: true, enabled, primary: primary && selected.has(primary) ? primary : enabled[0], modes, jointComposition, rememberContext: state.settings.habits?.rememberContext ?? false },
    });
    toast('Habitudes enregistrées');
    onDone?.();
  }

  const render = () => {
    const last = step === steps.length - 1;
    fill(root,
      h('div', { class: 'ob-dots' }, steps.map((_, i) => h('i', { class: i === step ? 'on' : '' }))),
      steps[step](),
      h('div', { class: embedded ? 'form-actions sticky-actions' : 'form-actions' },
        h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: () => {
          if (step === 0 && !selected.size) { toast('Choisis au moins une méthode', { tone: 'warn' }); return; }
          if (step === 2 && !primary) primary = [...selected][0];
          if (last) finish(); else { step += 1; render(); root.scrollIntoView?.({ block: 'start' }); }
        } }, last ? 'Terminer' : 'Continuer'),
        step > 0 ? h('button', { class: 'btn btn-ghost btn-block', onclick: () => { step -= 1; render(); } }, 'Retour') : null));
  };
  render();
  return root;
}
