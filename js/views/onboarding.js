// Premier lancement : philosophie, dépenses d'avant, période d'observation.

import { h, fill } from '../ui/dom.js';
import { icon, logo } from '../ui/icons.js';
import { toast } from '../ui/components.js';
import { beforeFields, applyBeforePrices } from './before.js';
import { renderSetup } from './setup.js';
import { emptyBefore, beforeMonthly } from '../domain/before.js';
import { saveSettings, switchMode } from '../core/store.js';
import { dayKey } from '../core/dates.js';
import { fmtMoney } from '../core/format.js';

export function renderOnboarding(onDone) {
  let step = 0;
  const before = emptyBefore();
  let observation = 14;
  const root = h('div', { class: 'onboarding' });

  const finish = async () => {
    const today = dayKey();
    await saveSettings({
      onboarded: true,
      trackingStart: today,
      observation: observation ? { enabled: true, startDate: today, days: observation } : { enabled: false, startDate: null, days: 14 },
    });
    if (beforeMonthly(before)) {
      before.startDate = today;
      await applyBeforePrices(before);
      await saveSettings({ before });
    }
    onDone();
  };

  const steps = [
    () => h('div', { class: 'ob-step' },
      h('div', { class: 'ob-logo' }, logo(72)),
      h('h1', null, 'TRACK THE SMOKE'),
      h('p', { class: 'ob-tag' }, 'Understand your habits. Track your consumption. Take control.'),
      h('ul', { class: 'checklist' },
        h('li', null, icon('check', 16), 'Cigarettes, roulées, joints, vape, puff, chicha… : suis toutes tes habitudes.'),
        h('li', null, icon('check', 16), 'Comprendre, réduire ou arrêter : à ton rythme, sans jugement. Une rechute n’efface jamais tes progrès.'),
        h('li', null, icon('check', 16), 'Tes données restent sur ton appareil. Aucune publicité, aucun traceur.')),
      h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: () => next() }, 'Commencer'),
      h('button', { class: 'btn btn-ghost btn-block', onclick: async () => { await switchMode('demo'); toast('Mode démo : données fictives séparées'); } }, icon('demo', 16), 'Explorer la démo d’abord')),
    // Configuration guidée des habitudes (méthodes, produits, principale, mode).
    () => h('div', { class: 'ob-step' }, renderSetup({ onDone: () => next() })),
    () => {
      const totalEl = h('p', { class: 'before-total' });
      const refresh = () => {
        const m = beforeMonthly(before);
        fill(totalEl, m ? [h('span', null, 'Tu dépensais environ'), h('b', null, `${fmtMoney(m.total, { digits: 0 })} / mois`)] : [h('span', { class: 'muted' }, 'Une estimation suffit.')]);
      };
      refresh();
      return h('div', { class: 'ob-step' },
        h('h2', null, 'Avant l’app'),
        h('p', { class: 'muted' }, 'Combien achetais-tu chaque mois, à peu près ? Tu verras tes économies dès le premier jour, et ces prix servent à calculer le coût de chaque consommation.'),
        beforeFields(before, refresh),
        totalEl,
        h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: () => next() }, 'Continuer'),
        h('button', { class: 'btn btn-ghost btn-block', onclick: () => next() }, 'Plus tard'));
    },
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
      step === 1 ? null : h('div', { class: 'ob-dots' }, steps.map((_, i) => h('i', { class: i === step ? 'on' : '' }))),
      steps[step]());
    root.scrollTop = 0;
  };
  const next = () => { step = Math.min(steps.length - 1, step + 1); render(); };
  render();
  return root;
}
