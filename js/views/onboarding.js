// Premier lancement : philosophie, tarifs, période d'observation.

import { h, fill } from '../ui/dom.js';
import { icon, logo } from '../ui/icons.js';
import { decimalInput, field, toast } from '../ui/components.js';
import { save, saveSettings, switchMode } from '../core/store.js';
import { dayKey } from '../core/dates.js';
import { isNum } from '../core/format.js';
import { uid } from '../domain/models.js';

export function renderOnboarding(onDone) {
  let step = 0;
  const prices = {
    prd_tobacco: { label: 'Tabac à rouler', price: null, size: null, unit: 'g', sizeLabel: 'Poids du paquet' },
    prd_cbd_flower: { label: 'CBD (fleurs)', price: null, size: null, unit: 'g', sizeLabel: 'Quantité achetée' },
    prd_slim: { label: 'Feuilles slim', price: null, size: null, unit: 'u.', sizeLabel: 'Feuilles par carnet' },
    prd_classic: { label: 'Feuilles classiques', price: null, size: null, unit: 'u.', sizeLabel: 'Feuilles par carnet' },
    prd_filter: { label: 'Filtres', price: null, size: null, unit: 'u.', sizeLabel: 'Filtres par paquet' },
  };
  let observation = 14;
  const root = h('div', { class: 'onboarding' });

  const finish = async () => {
    const today = dayKey();
    for (const [productId, p] of Object.entries(prices)) {
      if (isNum(p.price) && isNum(p.size) && p.size > 0) {
        await save('purchases', { id: uid('pur'), productId, date: today, packPrice: p.price, packSize: p.size, packCount: 1, supplier: '', note: 'Saisi à l’accueil', addToStock: false });
      }
    }
    await saveSettings({
      onboarded: true,
      trackingStart: today,
      observation: observation ? { enabled: true, startDate: today, days: observation } : { enabled: false, startDate: null, days: 14 },
    });
    onDone();
  };

  const steps = [
    () => h('div', { class: 'ob-step' },
      h('div', { class: 'ob-logo' }, logo(72)),
      h('h1', null, 'TRACK THE SMOKE'),
      h('p', { class: 'ob-tag' }, 'Know your habits. Take back control.'),
      h('ul', { class: 'checklist' },
        h('li', null, icon('check', 16), 'Comprendre ta consommation réelle de tabac et de CBD.'),
        h('li', null, icon('check', 16), 'Réduire à ton rythme, sans jugement : une rechute n’efface jamais tes progrès.'),
        h('li', null, icon('check', 16), 'Tes données restent sur ton appareil. Aucune publicité, aucun traceur.')),
      h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: () => next() }, 'Commencer'),
      h('button', { class: 'btn btn-ghost btn-block', onclick: async () => { await switchMode('demo'); toast('Mode démo : données fictives séparées'); } }, icon('demo', 16), 'Explorer la démo d’abord')),
    () => h('div', { class: 'ob-step' },
      h('h2', null, 'Tes prix réels'),
      h('p', { class: 'muted' }, 'Ils servent à calculer le coût exact de chaque consommation. Tout est facultatif et modifiable plus tard (Réglages › Produits).'),
      ...Object.values(prices).map((p) => h('div', { class: 'ob-price' },
        h('span', { class: 'ob-price-label' }, p.label),
        h('div', { class: 'grid-2' },
          field('Prix', decimalInput({ value: p.price, unit: '€', stepper: false, onchange: (v) => { p.price = v; } })),
          field(p.sizeLabel, decimalInput({ value: p.size, unit: p.unit, stepper: false, onchange: (v) => { p.size = v; } }))))),
      h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: () => next() }, 'Continuer'),
      h('button', { class: 'btn btn-ghost btn-block', onclick: () => next() }, 'Plus tard')),
    () => h('div', { class: 'ob-step' },
      h('h2', null, 'D’abord, observer'),
      h('p', { class: 'muted' }, 'Pendant quelques jours, enregistre simplement tes consommations, envies, dépenses et nuits, sans objectif. L’application établira ensuite ta référence personnelle.'),
      h('div', { class: 'ob-choices' }, [[7, '7 jours'], [14, '14 jours'], [0, 'Pas d’observation']].map(([d, l]) => h('button', {
        class: `ob-choice ${observation === d ? 'on' : ''}`, onclick: (e) => { observation = d; e.currentTarget.parentElement.querySelectorAll('.ob-choice').forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); },
      }, l))),
      h('p', { class: 'hint' }, 'Aucun calendrier de sevrage ne te sera imposé.'),
      h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: finish }, 'C’est parti')),
  ];

  const render = () => {
    fill(root, 
      h('div', { class: 'ob-dots' }, steps.map((_, i) => h('i', { class: i === step ? 'on' : '' }))),
      steps[step]());
    root.scrollTop = 0;
  };
  const next = () => { step = Math.min(steps.length - 1, step + 1); render(); };
  render();
  return root;
}
