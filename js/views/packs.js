// Mes paquets — base de l'estimation automatique (sans balance).

import { h, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { card, cardHead, field, segmented, select, decimalInput, toast, openSheet, confirmDialog, note, emptyState } from '../ui/components.js';
import { state, save, remove, saveSettings, currentCalibration, productById } from '../core/store.js';
import { nowLocal, dayKey, formatDayShort, diffDays } from '../core/dates.js';
import { fmtGrams, fmtNum, fmtMoney, isNum } from '../core/format.js';
import { newPack, packRemaining, REMAINING_CHOICES, priorsOf, precisionLabel } from '../domain/autoqty.js';
import { uid } from '../domain/models.js';

const KIND_LABEL = { tobacco: 'Tabac', cbd: 'CBD', liquid: 'E-liquide' };
const UNIT = (kind) => (kind === 'liquid' ? 'ml' : 'g');
const SUB = { tobacco: 'tobacco', cbd: 'cannabis', liquid: 'liquid' };
const fmtU = (v, kind, d = 2) => (isNum(v) ? `${fmtNum(v, d)} ${UNIT(kind)}` : '—');
const openPacks = () => state.packs.filter((p) => !p.finishedAt).sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1));

function perUnitText(kind) {
  const cal = currentCalibration();
  const pr = priorsOf(state.settings);
  if (kind === 'liquid') return cal.factors.liquid ? `≈ ${fmtNum(cal.factors.liquid, 2)} ml par session` : 'Données insuffisantes';
  const k = cal.factors[SUB[kind]] ?? 1;
  return kind === 'tobacco'
    ? `≈ ${fmtGrams(pr.jointMix.tobacco * k)} par joint · ${fmtGrams(pr.rolled.tobacco * k)} par roulée`
    : `≈ ${fmtGrams(pr.jointMix.cannabis * k)} par joint`;
}

function gauge(pack) {
  const r = packRemaining(pack, state.entries, state.settings);
  const frac = Math.max(0, Math.min(1, r.remaining / pack.size));
  const prior = priorsOf(state.settings);
  const cal = currentCalibration();
  const k = cal.factors[SUB[pack.kind]] ?? 1;
  const perJoint = pack.kind === 'liquid' ? cal.factors.liquid : (pack.kind === 'tobacco' ? prior.rolled.tobacco : prior.jointMix.cannabis) * k;
  return { r, frac, left: perJoint ? Math.floor(r.remaining / perJoint) : null };
}

/** Carte d'accueil. */
export function packsHomeCard() {
  const list = openPacks();
  if (!list.length) {
    return h('button', { class: 'banner banner-soft pack-cta', onclick: () => openPackForm({ kind: 'tobacco' }) },
      h('span', { class: 'banner-main' }, icon('box', 18), h('div', null, h('b', null, 'Pas de balance ?'),
        h('span', null, 'Déclare ton paquet en cours : l’app calculera les grammes pour toi.'))), icon('chevron', 16));
  }
  return card(cardHead('Paquets en cours', h('a', { class: 'link', href: '#/profile/packs' }, 'Gérer')),
    ...list.slice(0, 3).map((p) => packRow(p, true)));
}

function packRow(pack, compact = false) {
  const prod = productById(pack.productId);
  const { r, frac, left } = gauge(pack);
  return h('div', { class: 'pack' },
    h('div', { class: 'pack-head' },
      h('span', { class: `row-icon tone-${pack.kind === 'tobacco' ? 'blue' : 'green'}` }, icon(pack.kind === 'tobacco' ? 'rolled' : pack.kind === 'liquid' ? 'vape' : 'leafless', 16)),
      h('div', { class: 'grow' }, h('b', null, prod?.name || KIND_LABEL[pack.kind]), h('span', { class: 'muted small' }, `${fmtU(pack.size, pack.kind, 1)} · ouvert le ${formatDayShort(pack.openedAt.slice(0, 10))}`)),
      h('div', { class: 'pack-left' }, h('b', null, `≈ ${fmtU(r.remaining, pack.kind, 1)}`), h('span', { class: 'muted small' }, left != null ? `~${left} ${pack.kind === 'tobacco' ? 'roulées' : pack.kind === 'liquid' ? 'sessions' : 'joints'}` : ''))),
    h('div', { class: 'pack-bar' }, h('i', { style: { width: `${Math.round(frac * 100)}%` }, class: pack.kind === 'tobacco' ? 'tob' : 'cbd' })),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => openCheckpoint(pack) }, 'Il en reste…'),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => finishPack(pack) }, icon('check', 14), 'Terminé')),
    compact ? null : h('p', { class: 'hint' }, `${r.count || 0} consommation(s) depuis le dernier repère · estimation : ${perUnitText(pack.kind)}`));
}

/* ------------------------------ Page ------------------------------ */

export function renderPacks(backHeader) {
  const cal = currentCalibration();
  const finished = state.packs.filter((p) => p.finishedAt).sort((a, b) => (a.finishedAt < b.finishedAt ? 1 : -1));
  const list = openPacks();
  const prec = (k) => precisionLabel(cal.calibrations[k]);
  return h('div', { class: 'stack' }, backHeader,
    note('Pas besoin de balance. Indique la contenance de tes paquets et, de temps en temps, à l’œil, ce qu’il en reste. L’app répartit les grammes réellement partis sur tes joints et roulées, et l’estimation devient plus précise à chaque paquet.', 'positive'),
    h('div', { class: 'tiles tiles-2' },
      precisionTile('Tabac', 'tobacco', prec('tobacco')),
      precisionTile('CBD', 'cbd', prec('cannabis')),
      state.packs.some((p) => p.kind === 'liquid') ? precisionTile('E-liquide', 'liquid', prec('liquid')) : null),
    h('div', { class: 'section-title' }, h('h2', null, 'En cours'), h('button', { class: 'link', onclick: () => openPackForm({ kind: 'tobacco' }) }, 'Ajouter')),
    list.length ? h('div', { class: 'stack' }, list.map((p) => card(packRow(p)))) : card(emptyState({ icon: 'box', title: 'Aucun paquet déclaré', text: 'Ajoute ton paquet de tabac et ton CBD, même déjà entamés.' })),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn btn-primary', onclick: () => openPackForm({ kind: 'tobacco' }) }, icon('plus', 16), 'Paquet de tabac'),
      h('button', { class: 'btn btn-primary', onclick: () => openPackForm({ kind: 'cbd' }) }, icon('plus', 16), 'CBD')),
    h('a', { class: 'banner banner-soft pack-cta', href: '#/profile/averages' }, h('span', { class: 'banner-main' }, icon('stats', 18), h('div', null, h('b', null, 'Mes moyennes'), h('span', null, 'Valeurs de départ, valeurs calculées, pesées et estimations'))), icon('chevron', 16)),
    finished.length ? h('div', null, h('div', { class: 'section-title' }, h('h2', null, 'Terminés')),
      card(finished.slice(0, 12).map((p) => {
        const segs = currentCalibration().segments.filter((s) => s.packId === p.id);
        const n = segs.reduce((t, s) => t + s.count, 0);
        return h('div', { class: 'row' },
          h('span', { class: `row-icon tone-${p.kind === 'tobacco' ? 'blue' : 'green'}` }, icon(p.kind === 'tobacco' ? 'rolled' : 'leafless', 16)),
          h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, `${productById(p.productId)?.name || KIND_LABEL[p.kind]} · ${fmtU(p.size, p.kind, 1)}`),
            h('span', { class: 'row-sub' }, `${formatDayShort(p.openedAt.slice(0, 10))} → ${formatDayShort(p.finishedAt.slice(0, 10))} · ${diffDays(p.openedAt.slice(0, 10), p.finishedAt.slice(0, 10)) + 1} j${n ? ` · ${n} conso.` : ''}`)),
          h('button', { class: 'icon-btn', 'aria-label': 'Supprimer ce paquet', onclick: async () => {
            if (await confirmDialog({ title: 'Supprimer ce paquet ?', message: 'Les quantités calculées à partir de ce paquet seront recalculées.', confirm: 'Supprimer', danger: true })) { await remove('packs', p.id); toast('Paquet supprimé'); }
          } }, icon('trash', 16)));
      }))) : null);
}

function precisionTile(label, kind, p) {
  return h('div', { class: 'tile' },
    h('span', { class: 'tile-label' }, label),
    h('span', { class: `precision p${p.level}` }, h('i'), h('i'), h('i')),
    h('span', { class: 'tile-sub strong' }, p.label),
    h('span', { class: 'tile-sub' }, perUnitText(kind)));
}

/* ------------------------------ Formulaires ------------------------------ */

export function openPackForm({ kind = 'tobacco', from } = {}) {
  const prods = () => state.products.filter((p) => p.kind === pack.kind && !p.archived);
  const pack = {
    kind, productId: from?.productId || state.settings.defaultProducts[kind], size: from?.size ?? (kind === 'tobacco' ? 30 : 5),
    started: false, remaining: 'half', remainingGrams: null, price: null, openedAt: nowLocal(),
  };
  openSheet({
    title: from ? 'Nouveau paquet' : 'Déclarer un paquet',
    size: 'full',
    build: (close) => {
      const root = h('div', { class: 'stack form' });
      const render = () => {
        fill(root,
          !from ? field('Produit', segmented([{ id: 'tobacco', label: 'Tabac' }, { id: 'cbd', label: 'CBD / THC' }, { id: 'liquid', label: 'E-liquide' }], pack.kind, (v) => { pack.kind = v; pack.productId = state.settings.defaultProducts[v] || state.products.find((p) => p.kind === v && !p.archived)?.id || null; pack.size = v === 'tobacco' ? 30 : v === 'liquid' ? 10 : 5; render(); }, { small: true })) : null,
          prods().length > 1 ? field('Lequel', select(prods().map((p) => ({ id: p.id, label: p.name })), pack.productId, (v) => { pack.productId = v; })) : null,
          field(pack.kind === 'liquid' ? 'Contenance du flacon' : 'Contenance du paquet', decimalInput({ value: pack.size, unit: UNIT(pack.kind), step: pack.kind === 'tobacco' ? 5 : 1, onchange: (v) => { pack.size = v; } }),
            pack.kind === 'tobacco' ? 'Ex. 30 g, 40 g, 50 g… indiquée sur le paquet.' : pack.kind === 'liquid' ? 'Ex. 10 ml, 50 ml…' : 'Ex. 1 g, 2 g, 5 g… la quantité achetée.'),
          field('État', segmented([{ id: 'new', label: 'Neuf' }, { id: 'started', label: 'Déjà entamé' }], pack.started ? 'started' : 'new', (v) => { pack.started = v === 'started'; render(); }, { small: true })),
          pack.started ? h('div', { class: 'stack-sm' },
            h('span', { class: 'field-label' }, 'Il en reste environ'),
            h('div', { class: 'chips' }, REMAINING_CHOICES.filter((c) => c.id !== 'full').map((c) => h('button', { type: 'button', class: `chip ${pack.remaining === c.id && pack.remainingGrams == null ? 'on' : ''}`, onclick: () => { pack.remaining = c.id; pack.remainingGrams = null; render(); } }, c.label))),
            field('ou en grammes', decimalInput({ value: pack.remainingGrams, unit: 'g', stepper: false, onchange: (v) => { pack.remainingGrams = v; } })),
            h('p', { class: 'hint' }, 'À l’œil, c’est très bien : l’app s’ajustera au paquet suivant.')) : null,
          !pack.started ? field('Prix payé (facultatif)', decimalInput({ value: pack.price, unit: '€', stepper: false, onchange: (v) => { pack.price = v; } }), 'Enregistre aussi l’achat pour calculer tes dépenses.') : null,
          from ? note('L’ancien paquet est marqué terminé : ses grammes ont été répartis sur tes consommations.', 'positive') : null,
          h('div', { class: 'form-actions sticky-actions' },
            h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: async () => {
              if (!isNum(pack.size) || pack.size <= 0) { toast('Indique la contenance du paquet', { tone: 'warn' }); return; }
              const startRemaining = pack.started
                ? (isNum(pack.remainingGrams) ? Math.min(pack.size, pack.remainingGrams) : pack.size * REMAINING_CHOICES.find((c) => c.id === pack.remaining).fraction)
                : pack.size;
              await save('packs', newPack({ productId: pack.productId, kind: pack.kind, size: pack.size, openedAt: pack.openedAt, startRemaining }));
              if (!pack.started && isNum(pack.price)) {
                await save('purchases', { id: uid('pur'), productId: pack.productId, date: dayKey(), packPrice: pack.price, packSize: pack.size, packCount: 1, supplier: '', note: '', addToStock: true });
              }
              close();
              toast(`Paquet de ${KIND_LABEL[pack.kind].toLowerCase()} enregistré${isNum(pack.price) && !pack.started ? ` · ${fmtMoney(pack.price)}` : ''}`);
            } }, 'Enregistrer le paquet')));
      };
      render();
      return root;
    },
  });
}

export function openCheckpoint(pack) {
  let remainingGrams = null;
  let choice = null;
  openSheet({
    title: 'Il en reste combien ?',
    build: (close) => {
      const chipsEl = h('div', { class: 'chips' });
      const paint = () => fill(chipsEl, ...REMAINING_CHOICES.filter((c) => c.id !== 'full').map((c) => h('button', { type: 'button', class: `chip ${choice === c.id ? 'on' : ''}`, onclick: () => { choice = c.id; remainingGrams = null; paint(); } }, c.label)));
      paint();
      const { r } = gauge(pack);
      return h('div', { class: 'stack form' },
        h('p', { class: 'muted' }, `D’après l’app, il resterait ≈ ${fmtGrams(r.remaining, 1)} sur ${fmtNum(pack.size, 1)} g. Regarde ton paquet et corrige à l’œil :`),
        chipsEl,
        field('ou en grammes', decimalInput({ value: null, unit: 'g', stepper: false, onchange: (v) => { remainingGrams = v; choice = null; paint(); } })),
        h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: async () => {
          const remaining = isNum(remainingGrams) ? remainingGrams : choice ? pack.size * REMAINING_CHOICES.find((c) => c.id === choice).fraction : null;
          if (remaining == null) { toast('Choisis une proportion ou indique des grammes', { tone: 'warn' }); return; }
          await save('packs', { ...pack, checkpoints: [...(pack.checkpoints || []), { at: nowLocal(), remaining: Math.min(pack.size, remaining) }] });
          close(); toast('Merci ! Estimation ajustée');
        } }, 'Enregistrer'));
    },
  });
}

export async function finishPack(pack) {
  if (!(await confirmDialog({ title: 'Paquet terminé ?', message: 'Les grammes de ce paquet seront répartis sur les consommations depuis son ouverture. C’est le repère le plus précis.', confirm: 'Oui, il est fini' }))) return;
  await save('packs', { ...pack, finishedAt: nowLocal() });
  toast('Paquet terminé — estimation affinée');
  openPackForm({ kind: pack.kind, from: pack });
}

