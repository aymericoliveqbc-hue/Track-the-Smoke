// Profil › Apple Santé — import du sommeil (Raccourci ou export complet).

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { card, cardHead, note, segmented, toast, openSheet, textArea, badge } from '../ui/components.js';
import { state, save, saveSettings, derived } from '../core/store.js';
import { addDays, formatDayShort, formatDayLong, formatDuration } from '../core/dates.js';
import { parseShortcutText, samplesToNights, mergeHealthNights } from '../domain/health.js';
import { newNight } from '../domain/sleep.js';

const ui = { period: 'tracking' };

const STEPS = [
  ['Ouvre l’app Raccourcis', 'Touche + pour créer un raccourci, nomme-le « Sommeil → Track the Smoke ».'],
  ['Rechercher des échantillons de santé', 'Ajoute cette action. Type : Analyse du sommeil. Filtre : Date de début · au cours des derniers · 3 jours. Trier par Date de début, du plus ancien au plus récent.'],
  ['Répéter avec chaque élément', 'Ajoute cette action juste après.'],
  ['Texte (dans la boucle)', 'Insère Élément répété › Date de début, tape « ; », puis Élément répété › Date de fin, « ; », puis Élément répété › Valeur.'],
  ['Combiner le texte', 'Après la boucle : combine les Résultats de Répéter avec « Nouvelles lignes ».'],
  ['Copier dans le presse-papiers', 'Dernière action du raccourci.'],
  ['Chaque matin', 'Lance le raccourci (ou une automatisation « Heure de la journée »), ouvre TRACK THE SMOKE puis touche « Importer le presse-papiers ».'],
];

export function renderAppleHealth(backHeader) {
  const last = state.settings.health?.lastImportAt;
  const fileInput = h('input', { type: 'file', accept: '.zip,.xml,application/zip,text/xml', hidden: true, onchange: (e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; } });
  return h('div', { class: 'stack' }, backHeader,
    card(h('div', { class: 'ah-hero' }, h('span', { class: 'ah-heart' }, icon('heart', 26)),
      h('div', null, h('h3', null, 'Ton sommeil depuis Apple Santé'),
        h('p', { class: 'muted small' }, 'Les nuits mesurées par ton iPhone ou ton Apple Watch remplissent automatiquement heure de coucher, endormissement, durée et réveils. Tes notes (qualité, ressenti, bien-être) restent les tiennes.'))),
    last ? h('p', { class: 'hint' }, `Dernier import : ${formatDayLong(last.slice(0, 10))} · ${state.settings.health.lastCount ?? 0} nuit(s)`) : null),

    card(cardHead('Synchronisation rapide', badge('Raccourci', 'green')),
      h('p', { class: 'muted' }, 'Un Raccourci iOS copie tes dernières nuits ; un geste ici les importe.'),
      h('button', { class: 'btn btn-primary btn-block', onclick: importClipboard }, icon('download', 16), 'Importer le presse-papiers'),
      h('button', { class: 'btn btn-ghost btn-block', onclick: pasteSheet }, 'Coller le texte manuellement'),
      h('details', { class: 'form-details' }, h('summary', null, 'Créer le Raccourci (une seule fois)'),
        h('ol', { class: 'steps' }, STEPS.map(([t, d]) => h('li', null, h('b', null, t), h('span', null, d)))),
        h('p', { class: 'hint' }, 'Astuce : pour les dates, choisis le format ISO 8601 si Raccourcis le propose ; le format français par défaut fonctionne aussi.'))),

    card(cardHead('Import complet de l’historique'),
      h('p', { class: 'muted' }, 'Dans l’app Santé : ta photo de profil › Exporter toutes les données de santé › Enregistrer dans Fichiers. Choisis ensuite le fichier « export.zip » ici.'),
      segmented([{ id: 'tracking', label: 'Depuis le suivi' }, { id: '90', label: '90 j' }, { id: '365', label: '1 an' }, { id: 'all', label: 'Tout' }], ui.period, (v) => { ui.period = v; }, { small: true }),
      h('button', { class: 'btn btn-ghost btn-block', onclick: () => fileInput.click() }, icon('upload', 16), 'Choisir export.zip'), fileInput,
      h('p', { class: 'hint' }, 'Le fichier est lu sur ton iPhone et n’est envoyé nulle part. Un gros export peut prendre une minute.')),

    note('Une application web ne peut pas se connecter en continu à Apple Santé : seule une app native de l’App Store le peut. Le Raccourci est la façon la plus simple d’automatiser l’import. Rien n’est écrit dans Santé.', 'info'));
}

function periodFrom() {
  const { ctx, today } = derived();
  if (ui.period === 'tracking') return ctx.trackingStart || addDays(today, -30);
  if (ui.period === 'all') return null;
  return addDays(today, -Number(ui.period));
}

async function importClipboard() {
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch { /* refusé */ }
  if (!text.trim()) { toast('Presse-papiers vide ou inaccessible. Utilise « Coller le texte manuellement ».', { tone: 'warn', duration: 4500 }); return; }
  previewText(text);
}

function pasteSheet() {
  openSheet({
    title: 'Coller depuis le Raccourci',
    build: (close) => {
      let text = '';
      return h('div', { class: 'stack' },
        textArea({ value: '', rows: 6, placeholder: '2026-11-10T23:30:00+01:00;2026-11-11T06:45:00+01:00;Au lit', oninput: (v) => { text = v; } }),
        h('button', { class: 'btn btn-primary btn-block', onclick: () => { close(); previewText(text); } }, 'Analyser'));
    },
  });
}

function previewText(text) {
  const { samples, rejected } = parseShortcutText(text);
  if (!samples.length) { toast('Aucune donnée de sommeil reconnue dans ce texte.', { tone: 'warn' }); return; }
  preview(samplesToNights(samples), { rejected, origin: 'Raccourci' });
}

async function importFile(file) {
  let closeProgress;
  const bar = h('i');
  const label = h('span', { class: 'muted small' }, 'Lecture du fichier…');
  closeProgress = openSheet({ title: 'Import Apple Santé', build: () => h('div', { class: 'stack' }, h('div', { class: 'progress' }, bar), label) });
  try {
    const { readHealthExport } = await import('../core/healthfile.js');
    const samples = await readHealthExport(file, (p) => { bar.style.width = `${Math.round(p * 100)}%`; label.textContent = `Lecture… ${Math.round(p * 100)} %`; });
    closeProgress();
    if (!samples.length) { toast('Aucune donnée de sommeil trouvée dans cet export.', { tone: 'warn' }); return; }
    const nights = samplesToNights(samples, { from: periodFrom() });
    if (!nights.length) { toast('Aucune nuit sur la période choisie.', { tone: 'warn' }); return; }
    preview(nights, { origin: 'export Santé', samples: samples.length });
  } catch (err) {
    closeProgress?.();
    toast(err?.message || 'Lecture impossible.', { tone: 'warn', duration: 5000 });
  }
}

function preview(nights, { rejected = 0, origin, samples } = {}) {
  const plan = mergeHealthNights(state.nights, nights, newNight);
  openSheet({
    title: 'Nuits trouvées',
    size: 'full',
    build: (close) => h('div', { class: 'stack' },
      h('div', { class: 'mini-grid' },
        h('div', null, h('b', null, String(nights.length)), h('span', null, 'nuits lues')),
        h('div', null, h('b', null, String(plan.created)), h('span', null, 'nouvelles')),
        h('div', null, h('b', null, String(plan.completed)), h('span', null, 'complétées'))),
      h('p', { class: 'hint' }, `Source : ${origin}${samples ? ` · ${samples} échantillons` : ''}.${plan.unchanged ? ` ${plan.unchanged} nuit(s) déjà complètes ne changent pas.` : ''}${rejected ? ` ${rejected} ligne(s) illisible(s) ignorée(s).` : ''} Tes saisies manuelles ne sont jamais écrasées.`),
      h('div', { class: 'card' }, [...nights].reverse().slice(0, 8).map((n) => h('div', { class: 'row' },
        h('span', { class: 'row-icon tone-blue' }, icon('moon', 16)),
        h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, `Nuit du ${formatDayShort(n.date)}`),
          h('span', { class: 'row-sub' }, [n.bedTime && `coucher ${n.bedTime}`, n.latencyMin != null && `endormissement ${formatDuration(n.latencyMin)}`, n.wakeTime && `réveil ${n.wakeTime}`].filter(Boolean).join(' · '))),
        h('span', { class: 'row-right' }, n.totalSleepMin != null ? formatDuration(n.totalSleepMin) : '—')))),
      h('button', { class: 'btn btn-primary btn-block btn-lg', disabled: !plan.toSave.length, onclick: async () => {
        for (const n of plan.toSave) await save('nights', n);
        await saveSettings({ health: { lastImportAt: new Date().toISOString(), lastCount: plan.toSave.length } });
        close();
        toast(`${plan.toSave.length} nuit(s) importée(s) depuis Apple Santé`);
      } }, plan.toSave.length ? `Importer ${plan.toSave.length} nuit(s)` : 'Rien de nouveau à importer')),
  });
}
