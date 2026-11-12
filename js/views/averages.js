// Réglages › Mes moyennes — valeurs de départ, valeurs calculées, moyennes
// pesées / estimées séparées, historique des modifications.

import { h } from '../ui/dom.js';
import { card, decimalInput, toast, note } from '../ui/components.js';
import { state, saveSettings, currentCalibration } from '../core/store.js';
import { formatDayShort } from '../core/dates.js';
import { fmtQty, fmtNum, isNum, round2 } from '../core/format.js';
import { averagesTable, priorsOf, PRIOR_LABELS, DEFAULT_PRIORS_V2, precisionLabel } from '../domain/autoqty.js';
import { RELIABILITY } from '../domain/methods.js';

const KEYS_BY_METHOD = {
  rolled: [['rolled', 'tobacco'], ['rolledSlim', 'tobacco']],
  joint: [['jointMix', 'tobacco'], ['jointMix', 'cannabis'], ['jointPure', 'cannabis'], ['jointExtra', 'cannabis']],
  cbd: [['cbd', 'cannabis']],
  pipe: [['pipe', 'tobacco']],
  hookah: [['hookah', 'tobacco']],
  vape: [['vape', 'liquid']],
};
const SUB_LABEL = { tobacco: 'tabac', cannabis: 'CBD / cannabinoïde', liquid: 'e-liquide' };
const UNIT = { tobacco: 'g', cannabis: 'g', liquid: 'ml' };

export function renderAverages(backHeader) {
  const cal = currentCalibration();
  const priors = priorsOf(state.settings);
  const enabled = state.settings.habits?.enabled?.length ? state.settings.habits.enabled : Object.keys(KEYS_BY_METHOD);
  const table = new Map(averagesTable(state.entries, state.settings, cal).map((r) => [`${r.key}|${r.substance}`, r]));
  const wanted = [];
  for (const m of enabled) for (const pair of KEYS_BY_METHOD[m] || []) if (!wanted.find((w) => w[0] === pair[0] && w[1] === pair[1])) wanted.push(pair);
  const draft = {};
  const rows = wanted.map(([key, sub]) => {
    const r = table.get(`${key}|${sub}`) || {};
    const start = priors[key]?.[sub] ?? null;
    const calculated = sub === 'liquid' ? (cal.calibrations.liquid ? cal.factors.liquid : null) : (cal.calibrations[sub] && isNum(start) ? start * cal.factors[sub] : null);
    const p = precisionLabel(cal.calibrations[sub]);
    return card(
      h('div', { class: 'card-head' }, h('h3', { class: 'card-title' }, PRIOR_LABELS[key]), h('span', { class: 'muted small' }, SUB_LABEL[sub])),
      h('div', { class: 'avg-grid' },
        cell('Calculée', calculated != null ? fmtQty(round2(calculated), UNIT[sub]) : 'Données insuffisantes', calculated != null ? p.label : 'Déclare un paquet ou ton stock', 'green'),
        cell('Pesée', r.weighedN ? fmtQty(round2(r.weighedAvg), UNIT[sub]) : '—', r.weighedN ? `${r.weighedN} mesure${r.weighedN > 1 ? 's' : ''}` : 'aucune mesure', 'violet'),
        cell('Estimée', r.estimatedN ? fmtQty(round2(r.estimatedAvg), UNIT[sub]) : '—', r.estimatedN ? `${r.estimatedN} saisie${r.estimatedN > 1 ? 's' : ''}` : 'aucune saisie', 'muted')),
      h('div', { class: 'avg-start' },
        h('span', { class: 'field-label' }, sub === 'liquid' ? 'Pas de valeur de départ pour la vape (calculée depuis tes flacons)' : 'Valeur de départ (avant calcul)'),
        sub === 'liquid' ? null : decimalInput({ value: start, unit: UNIT[sub], step: 0.05, onchange: (v) => { draft[key] = { ...(draft[key] || {}), [sub]: v }; } })),
      r.provisional ? h('p', { class: 'hint' }, `${r.provisional} consommation(s) utilisent encore l’estimation provisoire.`) : null);
  });
  const history = (state.settings.autoPriorsHistory || []).slice(-8).reverse();
  return h('div', { class: 'stack' }, backHeader,
    note('Chaque méthode a ses propres moyennes. Elles sont calculées à partir de tes paquets terminés, de tes comptages de stock et de tes pesées ; sans données suffisantes, l’app l’indique au lieu d’inventer.', 'info'),
    h('div', { class: 'legend reliability' }, ['weighed', 'calculated', 'estimated', 'provisional', 'unknown'].map((k) => h('span', { class: `badge badge-${RELIABILITY[k].tone}` }, RELIABILITY[k].label))),
    ...rows,
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn btn-primary', onclick: async () => {
        if (!Object.keys(draft).length) { toast('Aucune modification'); return; }
        const next = { ...(state.settings.autoPriorsV2 || {}) };
        for (const [k, v] of Object.entries(draft)) next[k] = { ...(next[k] || {}), ...Object.fromEntries(Object.entries(v).filter(([, x]) => isNum(x) && x > 0)) };
        const hist = [...(state.settings.autoPriorsHistory || []), { at: new Date().toISOString(), before: priorsOf(state.settings), changes: draft }];
        await saveSettings({ autoPriorsV2: next, autoPriorsHistory: hist.slice(-30) });
        toast('Valeurs de départ enregistrées — quantités recalculées');
      } }, 'Enregistrer'),
      h('button', { class: 'btn btn-ghost', onclick: async () => {
        const hist = [...(state.settings.autoPriorsHistory || []), { at: new Date().toISOString(), before: priorsOf(state.settings), changes: 'reset' }];
        await saveSettings({ autoPriorsV2: JSON.parse(JSON.stringify(DEFAULT_PRIORS_V2)), autoPriors: {}, autoPriorsHistory: hist.slice(-30) });
        toast('Valeurs par défaut rétablies');
      } }, 'Valeurs par défaut')),
    history.length ? card(h('h3', { class: 'card-title' }, 'Historique des valeurs de départ'),
      h('div', { class: 'list' }, history.map((x) => h('div', { class: 'row' }, h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, x.changes === 'reset' ? 'Retour aux valeurs par défaut' : Object.entries(x.changes).map(([k, v]) => `${PRIOR_LABELS[k] || k} : ${Object.entries(v).map(([s2, n]) => `${fmtNum(n, 2)} ${UNIT[s2]}`).join(', ')}`).join(' · ')),
        h('span', { class: 'row-sub' }, formatDayShort(x.at.slice(0, 10)))))))) : null,
    h('p', { class: 'hint' }, 'Pour gagner en précision : pèse quelques consommations, déclare tes paquets (« il en reste… », « terminé ») ou compte ton stock de temps en temps.'));
}

function cell(label, value, sub, tone) {
  return h('div', { class: `avg-cell tone-${tone}` }, h('span', { class: 'avg-label' }, label), h('b', null, value), h('span', { class: 'muted small' }, sub));
}
