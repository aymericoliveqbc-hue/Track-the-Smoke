// PROFIL / RÉGLAGES — produits, achats, stocks, catégories, notifications,
// confidentialité, données, mode démo, informations santé.

import { h, download, shareOrDownload, fill } from '../ui/dom.js';
import { icon, logo } from '../ui/icons.js';
import {
  card, cardHead, listRow, toggle, segmented, select, field, emptyState, note, badge, toast, confirmDialog, openSheet, textInput, sectionTitle,
} from '../ui/components.js';
import { openProductForm, openPurchaseForm, openInventoryForm, openCategoryForm } from '../ui/forms.js';
import {
  state, derived, saveSettings, isDemo, switchMode, resetDemo, replaceAllData, wipeAll, listBackups,
} from '../core/store.js';
import { dayKey, formatDayShort, formatDayLong, MONTHS, isTime } from '../core/dates.js';
import { fmtMoney, fmtNum, fmtQty, UNITS } from '../core/format.js';
import { priceAt, purchaseTotal } from '../domain/costs.js';
import { computeStock } from '../domain/stock.js';
import { buildExport, validateImport, mergeData, entriesToCSV } from '../domain/backup.js';
import { CBD_FORMS, ACCESSORY_TYPES, labelOf } from '../domain/models.js';
import { hashPin, newSalt, biometricAvailable, registerBiometric } from '../core/lock.js';
import { healthContent } from './health.js';
import { renderAppleHealth } from './applehealth.js';
import { renderPacks } from './packs.js';

const rerender = () => window.dispatchEvent(new Event('tts:render'));
const back = (title) => h('header', { class: 'view-head' },
  h('a', { class: 'icon-btn', href: '#/profile', 'aria-label': 'Retour' }, icon('back', 20)), h('h1', null, title), h('span', { class: 'spacer' }));

export function renderProfile(sub) {
  const pages = { products, purchases, stock, categories, notifications, privacy, data, prefs, health, about, applehealth: () => renderAppleHealth(back('Apple Santé')), packs: () => renderPacks(back('Mes paquets')) };
  if (sub && pages[sub]) return h('div', { class: 'view' }, pages[sub]());
  const s = state.settings;
  return h('div', { class: 'view' },
    h('header', { class: 'view-head' }, h('h1', null, 'Réglages')),
    isDemo() ? h('div', { class: 'banner banner-demo' }, icon('demo', 18), h('div', null, h('b', null, 'Mode démonstration'), h('span', null, 'Données fictives, totalement séparées de tes données personnelles.')),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { await switchMode('main'); toast('Retour à tes données'); } }, 'Quitter')) : null,
    card(
      listRow({ icon: 'box', iconTone: 'green', title: 'Mes paquets', sub: state.packs.some((p) => !p.finishedAt) ? `${state.packs.filter((p) => !p.finishedAt).length} en cours · calcul automatique des grammes` : 'Calcul automatique des grammes, sans balance', onclick: () => go('packs') }),
      listRow({ icon: 'tag', title: 'Produits et prix', sub: `${state.products.filter((p) => !p.archived).length} produits`, onclick: () => go('products') }),
      listRow({ icon: 'wallet', iconTone: 'orange', title: 'Achats', sub: `${state.purchases.length} achat(s) enregistré(s)`, onclick: () => go('purchases') }),
      listRow({ icon: 'box', iconTone: 'green', title: 'Stocks', sub: s.stock?.enabled ? 'Suivi activé' : 'Facultatif · désactivé', onclick: () => go('stock') }),
      listRow({ icon: 'custom', iconTone: 'blue', title: 'Catégories', sub: `${state.categories.filter((c) => !c.archived).length} catégories`, onclick: () => go('categories') })),
    card(listRow({ icon: 'heart', iconTone: 'orange', title: 'Apple Santé', sub: s.health?.lastImportAt ? `Sommeil importé le ${formatDayShort(s.health.lastImportAt.slice(0, 10))}` : 'Importer ton sommeil depuis l\u2019iPhone', onclick: () => go('applehealth') })),
    card(
      listRow({ icon: 'bell', title: 'Rappels et notifications', sub: s.notifications.inApp ? 'Rappels discrets activés' : 'Désactivés', onclick: () => go('notifications') }),
      listRow({ icon: 'lock', iconTone: 'green', title: 'Confidentialité et verrouillage', sub: s.privacy.lock === 'none' ? 'Aucun verrouillage' : s.privacy.lock === 'biometric' ? 'Face ID / Touch ID' : 'Code PIN', onclick: () => go('privacy') }),
      listRow({ icon: 'download', iconTone: 'blue', title: 'Données et sauvegardes', sub: s.lastExportAt ? `Dernier export : ${formatDayShort(s.lastExportAt.slice(0, 10))}` : 'Aucun export pour le moment', onclick: () => go('data') }),
      listRow({ icon: 'settings', iconTone: 'orange', title: 'Préférences', sub: `Devise ${s.currency} · unités métriques`, onclick: () => go('prefs') })),
    card(
      listRow({ icon: 'heart', iconTone: 'green', title: 'Informations santé', sub: 'Sevrage, envies, sommeil, ressources', onclick: () => go('health') }),
      listRow({ icon: 'demo', iconTone: 'orange', title: isDemo() ? 'Quitter le mode démo' : 'Mode démonstration', sub: isDemo() ? 'Revenir à tes données personnelles' : 'Explorer avec des données fictives séparées', onclick: async () => {
        if (isDemo()) { await switchMode('main'); toast('Retour à tes données'); }
        else if (await confirmDialog({ title: 'Ouvrir le mode démo ?', message: 'Des données fictives seront chargées dans un espace totalement séparé. Tes données personnelles ne sont ni modifiées ni mélangées.', confirm: 'Ouvrir la démo' })) { await switchMode('demo'); location.hash = '#/home'; toast('Mode démo'); }
      } }),
      listRow({ icon: 'info', iconTone: 'blue', title: 'À propos', sub: 'TRACK THE SMOKE · version 1.0', onclick: () => go('about') })),
    h('p', { class: 'hint center' }, 'Tes données restent sur cet appareil. Aucune publicité, aucun traceur, aucun envoi.'));
}

const go = (sub) => { location.hash = `#/profile/${sub}`; };

/* ------------------------------ Produits ------------------------------ */

function priceLabel(p) {
  const { index } = derived();
  const { price, source } = priceAt(index, p.id, dayKey());
  if (price == null) return h('span', { class: 'warn-text' }, 'Prix à renseigner');
  const unit = p.kind === 'accessory' ? '/ unité' : `/ ${UNITS[p.unit].short === 'g' ? 'g' : UNITS[p.unit].short}`;
  return h('span', null, `${fmtMoney(price, { digits: price < 0.1 ? 3 : 2 })} ${unit}`, source === 'reference' ? h('span', { class: 'muted' }, ' · réf.') : null);
}

function products() {
  const d = state.settings.defaultProducts;
  const group = (title, kind, filter = () => true) => {
    const list = state.products.filter((p) => p.kind === kind && filter(p)).sort((a, b) => Number(a.archived) - Number(b.archived));
    return h('div', null, sectionTitle(title, h('button', { class: 'link', onclick: () => openProductForm({ kind }) }, 'Ajouter')),
      card(list.length ? list.map((p) => listRow({
        icon: kind === 'tobacco' ? 'rolled' : kind === 'cbd' ? 'leafless' : 'box', iconTone: kind === 'tobacco' ? 'blue' : kind === 'cbd' ? 'green' : 'violet',
        title: h('span', null, p.name || 'Sans nom', Object.values(d).includes(p.id) ? badge('par défaut', 'violet') : null, p.archived ? badge('archivé') : null),
        sub: [p.brand, kind === 'cbd' ? labelOf(CBD_FORMS, p.cbdForm) : kind === 'accessory' ? labelOf(ACCESSORY_TYPES, p.accessoryType) : null].filter(Boolean).join(' · ') || null,
        right: priceLabel(p),
        onclick: () => openProductForm({ product: p }),
      })) : h('p', { class: 'muted pad' }, 'Aucun produit.')));
  };
  return h('div', { class: 'stack' }, back('Produits et prix'),
    note('Le prix appliqué à une consommation est celui de l’achat le plus récent à sa date. Sans achat, le tarif de référence du produit est utilisé. Sans prix connu, le coût est signalé comme incomplet.', 'info'),
    group('Tabac', 'tobacco'), group('CBD', 'cbd'), group('Accessoires', 'accessory'),
    h('button', { class: 'btn btn-primary btn-block', onclick: () => openPurchaseForm() }, icon('plus', 16), 'Enregistrer un achat'));
}

/* ------------------------------ Achats ------------------------------ */

function purchases() {
  const list = [...state.purchases].sort((a, b) => (a.date < b.date ? 1 : -1));
  const months = new Map();
  for (const p of list) { const k = p.date.slice(0, 7); if (!months.has(k)) months.set(k, []); months.get(k).push(p); }
  return h('div', { class: 'stack' }, back('Achats'),
    h('button', { class: 'btn btn-primary btn-block', onclick: () => openPurchaseForm() }, icon('plus', 16), 'Nouvel achat'),
    !list.length ? card(emptyState({ icon: 'wallet', title: 'Aucun achat', text: 'Enregistre tes achats réels (prix, contenance) pour calculer précisément le coût de chaque consommation.' })) : null,
    ...[...months.entries()].map(([k, ps]) => {
      const [y, m] = k.split('-').map(Number);
      const total = ps.reduce((t, p) => t + (purchaseTotal(p) || 0), 0);
      return h('div', null, sectionTitle(`${MONTHS[m - 1]} ${y}`, h('span', { class: 'muted' }, fmtMoney(total))),
        card(ps.map((p) => {
          const prod = state.products.find((x) => x.id === p.productId);
          return listRow({
            icon: prod?.kind === 'tobacco' ? 'rolled' : prod?.kind === 'cbd' ? 'leafless' : 'box', iconTone: prod?.kind === 'tobacco' ? 'blue' : prod?.kind === 'cbd' ? 'green' : 'violet',
            title: prod?.name || 'Produit supprimé',
            sub: `${formatDayShort(p.date)} · ${p.packCount > 1 ? `${p.packCount} × ` : ''}${fmtQty(p.packSize, prod?.kind === 'accessory' ? 'unit' : prod?.unit)}${p.supplier ? ' · ' + p.supplier : ''}`,
            right: fmtMoney(purchaseTotal(p)),
            onclick: () => openPurchaseForm({ purchase: p }),
          });
        })));
    }));
}

/* ------------------------------ Stocks ------------------------------ */

function stock() {
  const s = state.settings.stock;
  const { today } = derived();
  const body = [back('Stocks'),
    card(toggle(!!s.enabled, async (on) => { await saveSettings({ stock: { enabled: on, since: s.since || today } }); }, 'Suivre mes stocks'),
      h('p', { class: 'hint' }, 'Le stock diminue automatiquement à chaque consommation dont la quantité est connue. Les saisies sans quantité ne sont jamais déduites.'))];
  if (!s.enabled) return h('div', { class: 'stack' }, ...body);
  body.push(h('button', { class: 'btn btn-ghost btn-block', onclick: () => openInventoryForm() }, icon('edit', 16), 'Corriger un stock manuellement'));
  const data = { purchases: state.purchases, inventories: state.inventories, entries: state.entries, settings: state.settings };
  for (const p of state.products.filter((x) => !x.archived)) {
    const st = computeStock(p, data, today);
    const unit = p.kind === 'accessory' ? 'unit' : p.unit;
    body.push(h('section', { class: 'card' },
      cardHead(p.name, h('button', { class: 'link', onclick: () => openInventoryForm({ productId: p.id }) }, 'Corriger')),
      st.quantity == null ? h('p', { class: 'muted' }, 'Stock inconnu : enregistre un achat ou corrige le stock pour commencer.') : h('div', { class: 'mini-grid' },
        h('div', null, h('b', { class: st.quantity < 0 ? 'warn-text' : '' }, fmtQty(st.quantity, unit)), h('span', null, 'restant')),
        h('div', null, h('b', null, st.avgDaily != null ? fmtQty(st.avgDaily, unit) : '—'), h('span', null, 'par jour (30 j)')),
        h('div', null, h('b', null, st.daysLeft != null ? `${fmtNum(st.daysLeft, 0)} j` : '—'), h('span', null, 'durée estimée'))),
      st.quantity != null && st.quantity < 0 ? h('p', { class: 'hint warn' }, 'Stock négatif : un achat n’a probablement pas été enregistré. Corrige le stock si besoin.') : null,
      st.unknownUsages ? h('p', { class: 'hint' }, `${st.unknownUsages} consommation(s) sans quantité non déduite(s) : le stock réel peut être inférieur.`) : null,
      st.history.length ? h('details', { class: 'form-details' }, h('summary', null, 'Historique'),
        h('div', { class: 'list' }, st.history.slice(-12).reverse().map((ev) => h('div', { class: 'row' },
          h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, ev.type === 'purchase' ? 'Achat' : ev.type === 'inventory' ? 'Correction' : 'Consommation'), h('span', { class: 'row-sub' }, `${formatDayShort(ev.at.slice(0, 10))} ${ev.at.slice(11)}`)),
          h('span', { class: 'row-right' }, ev.type === 'inventory' ? `= ${fmtQty(ev.qty, unit)}` : `${ev.delta > 0 ? '+' : ''}${fmtNum(ev.delta, 2)} → ${fmtQty(ev.qty, unit)}`))))) : null));
  }
  return h('div', { class: 'stack' }, ...body);
}

/* ------------------------------ Catégories ------------------------------ */

function categories() {
  return h('div', { class: 'stack' }, back('Catégories'),
    card(state.categories.map((c) => listRow({
      icon: c.icon, iconTone: c.color, title: h('span', null, c.name, c.system ? badge('prédéfinie') : null, c.archived ? badge('archivée') : null),
      sub: [c.tobacco ? 'tabac' : null, c.cbd ? 'CBD' : null, !c.system && c.tracksQuantity ? (c.unitLabel || UNITS[c.unit]?.label) : null, c.fields?.length ? `${c.fields.length} champ(s)` : null].filter(Boolean).join(' · '),
      onclick: () => openCategoryForm({ category: c }),
    }))),
    h('button', { class: 'btn btn-primary btn-block', onclick: () => openCategoryForm() }, icon('plus', 16), 'Nouvelle catégorie'),
    h('p', { class: 'hint' }, 'Archiver une catégorie la masque de la saisie sans supprimer son historique.'));
}

/* ------------------------------ Notifications ------------------------------ */

function notifications() {
  const n = state.settings.notifications;
  const set = (patch) => saveSettings({ notifications: patch });
  const timeIn = (key) => h('input', { class: 'input input-time', type: 'time', value: n[key].time, onchange: (e) => { if (isTime(e.target.value)) set({ [key]: { ...n[key], time: e.target.value } }); } });
  const row = (key, label, extra) => h('div', { class: 'notif-row' }, toggle(!!n[key].on, (on) => set({ [key]: { ...n[key], on } }), label), extra || null);
  const supported = typeof Notification !== 'undefined';
  return h('div', { class: 'stack' }, back('Rappels'),
    card(toggle(!!n.inApp, (on) => set({ inApp: on }), 'Rappels discrets dans l’application'),
      h('p', { class: 'hint' }, 'Affichés en haut de l’accueil, faciles à masquer. Jamais de message culpabilisant.')),
    card(
      row('journal', 'Compléter le journal', timeIn('journal')),
      row('sleep', 'Renseigner ma nuit', timeIn('sleep')),
      row('weekly', 'Bilan hebdomadaire', h('div', { class: 'grid-2' }, select(['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map((l, i) => ({ id: String(i), label: l })), String(n.weekly.weekday), (v) => set({ weekly: { ...n.weekly, weekday: Number(v) } })), timeIn('weekly'))),
      row('goals', 'Suivi des objectifs', timeIn('goals')),
      row('monthly', 'Bilan financier mensuel')),
    card(toggle(!!n.enabled, async (on) => {
      if (on && supported && Notification.permission !== 'granted') {
        const p = await Notification.requestPermission();
        if (p !== 'granted') { toast('Notifications refusées par le système', { tone: 'warn' }); rerender(); return; }
      }
      set({ enabled: on });
    }, 'Notifications système'),
    h('p', { class: 'hint' }, supported
      ? 'Sur iPhone, ajoute d’abord l’application à l’écran d’accueil (iOS 16.4 ou plus). Sans serveur (pour préserver ta confidentialité), les notifications sont envoyées quand l’application est ouverte ou revient au premier plan.'
      : 'Les notifications système ne sont pas disponibles dans ce navigateur. Les rappels dans l’application restent actifs.')));
}

/* ------------------------------ Confidentialité ------------------------------ */

function privacy() {
  const p = state.settings.privacy;
  const root = h('div', { class: 'stack' }, back('Confidentialité'));
  root.append(card(
    h('ul', { class: 'checklist' },
      ...['Aucun compte, aucun serveur : tout est stocké sur cet appareil.', 'Aucune publicité ni traceur publicitaire.', 'Aucun envoi de données à des tiers.', 'Export complet et suppression définitive à tout moment.']
        .map((t) => h('li', null, icon('check', 16), t)))));
  const lockCard = card(cardHead('Verrouillage'));
  const render = async () => {
    const bio = await biometricAvailable();
    fill(lockCard, cardHead('Verrouillage'),
      segmented([{ id: 'none', label: 'Aucun' }, { id: 'pin', label: 'Code PIN' }, ...(bio ? [{ id: 'biometric', label: 'Face ID' }] : [])], p.lock, async (v) => {
        if (v === 'none') { await saveSettings({ privacy: { lock: 'none', credentialId: null } }); toast('Verrouillage désactivé'); return; }
        if (v === 'pin' || !p.pinHash) {
          const ok = await setPinSheet();
          if (!ok) { rerender(); return; }
        }
        if (v === 'biometric') {
          try {
            const id = await registerBiometric();
            await saveSettings({ privacy: { lock: 'biometric', credentialId: id } });
            toast('Face ID activé');
          } catch { toast('Activation de Face ID annulée', { tone: 'warn' }); rerender(); }
        } else {
          await saveSettings({ privacy: { lock: 'pin' } });
        }
      }, { small: true }),
      h('p', { class: 'hint' }, bio
        ? 'Face ID / Touch ID utilise l’authentification de ton appareil. Un code PIN de secours est toujours demandé.'
        : 'Face ID n’est pas disponible dans ce contexte (nécessite HTTPS et un appareil compatible). Le code PIN reste disponible.'),
      p.lock !== 'none' ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => setPinSheet() }, 'Changer le code PIN') : null,
      h('p', { class: 'hint' }, 'Le verrouillage protège l’accès à l’interface. Pour une protection maximale, active aussi le code de verrouillage de ton iPhone.'));
  };
  render();
  root.append(lockCard);
  root.append(card(toggle(!!p.autoBackup, (on) => saveSettings({ privacy: { autoBackup: on } }), 'Sauvegarde locale automatique'),
    h('p', { class: 'hint' }, 'Un instantané quotidien est conservé sur l’appareil (7 derniers jours). Pense aussi à exporter régulièrement une sauvegarde : elle seule survit à une désinstallation.')));
  return root;
}

function setPinSheet() {
  return new Promise((resolve) => {
    let ok = false;
    openSheet({
      title: 'Code PIN',
      onClose: () => resolve(ok),
      build: (close) => {
        const a = textInput({ type: 'password', inputmode: 'numeric', autocomplete: 'new-password', placeholder: '4 à 8 chiffres', maxlength: 8 });
        const b = textInput({ type: 'password', inputmode: 'numeric', autocomplete: 'new-password', placeholder: 'Confirmer', maxlength: 8 });
        return h('div', { class: 'stack form' }, field('Nouveau code', a), field('Confirmation', b),
          h('button', { class: 'btn btn-primary btn-block', onclick: async () => {
            if (!/^\d{4,8}$/.test(a.value)) { toast('Le code doit contenir 4 à 8 chiffres', { tone: 'warn' }); return; }
            if (a.value !== b.value) { toast('Les codes ne correspondent pas', { tone: 'warn' }); return; }
            const salt = newSalt();
            await saveSettings({ privacy: { pinSalt: salt, pinHash: await hashPin(a.value, salt), pinLength: a.value.length, lock: state.settings.privacy.lock === 'none' ? 'pin' : state.settings.privacy.lock } });
            ok = true; close(); toast('Code PIN enregistré');
          } }, 'Enregistrer'));
      },
    });
  });
}

/* ------------------------------ Données ------------------------------ */

async function exportJSON() {
  const payload = JSON.stringify(buildExport(state, { demo: isDemo() }), null, 2);
  const name = `track-the-smoke-${isDemo() ? 'demo-' : ''}${dayKey()}.json`;
  const res = await shareOrDownload(name, payload, 'application/json');
  if (res !== 'aborted') { await saveSettings({ lastExportAt: new Date().toISOString() }); toast('Sauvegarde exportée'); }
}

function exportCSV() {
  const { cost } = derived();
  download(`track-the-smoke-journal-${dayKey()}.csv`, entriesToCSV(state.entries, state.categories, cost), 'text/csv;charset=utf-8');
}

function importFlow(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const v = validateImport(String(reader.result));
    if (!v.ok) { toast(v.errors[0], { tone: 'warn', duration: 5000 }); return; }
    openSheet({
      title: 'Restaurer une sauvegarde',
      build: (close) => h('div', { class: 'stack' },
        h('p', null, `Sauvegarde du ${v.exportedAt ? formatDayLong(v.exportedAt.slice(0, 10)) : '—'}${v.demo ? ' (données de démonstration)' : ''}.`),
        h('div', { class: 'mini-grid' },
          h('div', null, h('b', null, String(v.counts.entries)), h('span', null, 'entrées')),
          h('div', null, h('b', null, String(v.counts.nights)), h('span', null, 'nuits')),
          h('div', null, h('b', null, String(v.counts.purchases)), h('span', null, 'achats')),
          h('div', null, h('b', null, String(v.counts.products)), h('span', null, 'produits')),
          h('div', null, h('b', null, String(v.counts.goals)), h('span', null, 'objectifs')),
          h('div', null, h('b', null, String(v.counts.categories)), h('span', null, 'catégories'))),
        v.warnings.length ? note(v.warnings.join(' '), 'warn') : null,
        v.demo && !isDemo() ? note('Attention : cette sauvegarde contient des données de démonstration.', 'warn') : null,
        h('button', { class: 'btn btn-primary btn-block', onclick: async () => {
          if (!(await confirmDialog({ title: 'Remplacer les données ?', message: 'Les données actuelles de cet espace seront remplacées par la sauvegarde.', confirm: 'Remplacer', danger: true }))) return;
          await replaceAllData(v.data, v.settings); close(); toast('Sauvegarde restaurée');
        } }, 'Remplacer mes données'),
        h('button', { class: 'btn btn-ghost btn-block', onclick: async () => {
          await replaceAllData(mergeData(state, v.data), null); close(); toast('Données fusionnées');
        } }, 'Fusionner avec mes données'),
        h('p', { class: 'hint' }, 'Fusionner : les éléments de même identifiant sont remplacés, les autres sont ajoutés.')),
    });
  };
  reader.readAsText(file);
}

function data() {
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: (e) => { const f = e.target.files?.[0]; if (f) importFlow(f); e.target.value = ''; } });
  const backupsEl = h('div', { class: 'list' }, h('p', { class: 'muted pad' }, 'Chargement…'));
  listBackups().then((list) => {
    fill(backupsEl, ...(list.length ? list.map((b) => listRow({
      icon: 'clock', title: formatDayLong(b.id.slice(7)), sub: `${b.payload.counts?.entries ?? 0} entrées · ${b.payload.counts?.nights ?? 0} nuits`,
      right: h('span', { class: 'link' }, 'Restaurer'),
      onclick: async () => {
        if (await confirmDialog({ title: 'Restaurer cet instantané ?', message: 'Les données actuelles seront remplacées par celles de cet instantané local.', confirm: 'Restaurer', danger: true })) {
          const v = validateImport(b.payload); if (v.ok) { await replaceAllData(v.data, v.settings); toast('Instantané restauré'); }
        }
      },
    })) : [h('p', { class: 'muted pad' }, 'Aucun instantané local pour le moment.')]));
  });
  return h('div', { class: 'stack' }, back('Données'),
    card(cardHead('Exporter'),
      h('p', { class: 'muted' }, 'La sauvegarde JSON contient l’intégralité de tes données et permet de les restaurer après une réinstallation ou sur un autre appareil.'),
      h('button', { class: 'btn btn-primary btn-block', onclick: exportJSON }, icon('download', 16), 'Exporter une sauvegarde complète'),
      h('button', { class: 'btn btn-ghost btn-block', onclick: exportCSV }, icon('journal', 16), 'Exporter le journal (CSV, tableur)')),
    card(cardHead('Importer'),
      h('p', { class: 'muted' }, 'Restaure une sauvegarde exportée depuis TRACK THE SMOKE.'),
      h('button', { class: 'btn btn-ghost btn-block', onclick: () => fileInput.click() }, icon('upload', 16), 'Choisir un fichier'), fileInput),
    card(cardHead('Instantanés locaux'), backupsEl),
    card(cardHead('Zone sensible'),
      h('p', { class: 'muted' }, isDemo() ? 'Réinitialise les données de démonstration.' : 'Supprime définitivement toutes tes données de cet appareil. Cette action est irréversible.'),
      isDemo()
        ? h('button', { class: 'btn btn-ghost btn-block', onclick: async () => { await resetDemo(); toast('Démo réinitialisée'); } }, 'Réinitialiser la démo')
        : h('button', { class: 'btn btn-danger btn-block', onclick: async () => {
          if (await confirmDialog({ title: 'Tout supprimer ?', message: 'Journal, nuits, achats, produits, objectifs et réglages seront définitivement effacés. Exporte une sauvegarde avant si besoin.', confirm: 'Supprimer définitivement', danger: true, requireText: 'SUPPRIMER' })) {
            await wipeAll(); location.hash = '#/home'; toast('Toutes les données ont été supprimées');
          }
        } }, icon('trash', 16), 'Supprimer toutes mes données')),
    h('p', { class: 'hint' }, 'Architecture prête pour une synchronisation privée entre appareils (désactivée, jamais obligatoire).'));
}

/* ------------------------------ Préférences ------------------------------ */

function prefs() {
  const s = state.settings;
  return h('div', { class: 'stack' }, back('Préférences'),
    card(
      field('Devise', select([{ id: 'EUR', label: 'Euro (€)' }, { id: 'CHF', label: 'Franc suisse (CHF)' }, { id: 'GBP', label: 'Livre (£)' }, { id: 'USD', label: 'Dollar ($)' }, { id: 'CAD', label: 'Dollar canadien ($ CA)' }], s.currency, (v) => saveSettings({ currency: v || 'EUR' }))),
      field('Méthode de saisie par défaut', segmented([{ id: 'auto', label: 'Auto' }, { id: 'estimated', label: 'Estimée' }, { id: 'weighed', label: 'Pesée' }], s.defaultMethod || 'auto', (v) => saveSettings({ defaultMethod: v }), { small: true }), 'Tu peux toujours changer de méthode pour chaque saisie.'),
      field('Unités', h('p', { class: 'muted' }, 'Système métrique : grammes au centième (0,01 g), millilitres, gouttes, unités.'))),
    card(
      field('Date de début du suivi', h('input', { class: 'input', type: 'date', value: s.trackingStart || '', max: dayKey(), onchange: (e) => saveSettings({ trackingStart: e.target.value || null }) }),
        'Les jours antérieurs ne sont jamais comptés comme « zéro consommation ».')));
}

function health() {
  return h('div', { class: 'stack' }, back('Informations santé'), healthContent());
}

function about() {
  return h('div', { class: 'stack' }, back('À propos'),
    card(h('div', { class: 'about' }, logo(56), h('h2', null, 'TRACK THE SMOKE'), h('p', { class: 'muted' }, 'Know your habits. Take back control.'), h('p', { class: 'muted small' }, 'Version 1.0 · application web installable, fonctionne hors ligne.'))),
    card(h('p', null, 'Outil personnel de suivi de la consommation de tabac et de CBD, des envies, des dépenses et du sommeil, pour réduire à ton rythme et, si tu le souhaites, arrêter.'),
      h('p', { class: 'muted' }, 'Cette application ne fournit aucun diagnostic médical et ne remplace pas un professionnel de santé.')),
    card(h('p', { class: 'muted small' }, 'Pour l’installer sur iPhone : ouvre-la dans Safari, touche le bouton Partager puis « Sur l’écran d’accueil ».')));
}

