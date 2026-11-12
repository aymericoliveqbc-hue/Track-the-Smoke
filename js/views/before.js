// « Mes dépenses avant l'app » — formulaire, carte d'économies en direct.

import { h, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { card, field, decimalInput, toast, openSheet, note } from '../ui/components.js';
import { state, save, saveSettings, derived, productById } from '../core/store.js';
import { dayKey, formatDayShort } from '../core/dates.js';
import { fmtMoney, fmtGrams, fmtNum, isNum, round2 } from '../core/format.js';
import { priceAt } from '../domain/costs.js';
import { emptyBefore, beforeMonthly, beforeSavings, currentMonthly, DAYS_PER_MONTH } from '../domain/before.js';
import { moleculeLabel } from '../domain/models.js';

const fractionOfDay = () => { const d = new Date(); return (d.getHours() * 60 + d.getMinutes()) / 1440; };
const accessoriesPriced = () => {
  const { index } = derived();
  return ['slim', 'classic', 'filter'].some((k) => priceAt(index, state.settings.defaultProducts[k], dayKey()).price != null);
};
const savingsNow = (b) => beforeSavings(b, state.entries, derived().ctx, fractionOfDay(), { includeAccessories: accessoriesPriced() });

/** Pré-remplit les prix à partir des produits connus. */
function prefill(b) {
  const { index } = derived();
  const today = dayKey();
  const tob = productById(state.settings.defaultProducts.tobacco);
  if (!isNum(b.tobaccoPackSize) && tob?.refPackSize) b.tobaccoPackSize = tob.refPackSize;
  const tp = priceAt(index, state.settings.defaultProducts.tobacco, today).price;
  if (!isNum(b.tobaccoPackPrice) && tp && isNum(b.tobaccoPackSize)) b.tobaccoPackPrice = round2(tp * b.tobaccoPackSize);
  const cp = priceAt(index, state.settings.defaultProducts.cbd, today).price;
  if (!isNum(b.cbdPricePerGram) && cp) b.cbdPricePerGram = round2(cp);
  return b;
}

/** Les prix déclarés servent aussi de tarif de référence aux produits sans prix. */
export async function applyBeforePrices(b) {
  const { index } = derived();
  const today = dayKey();
  const tobId = state.settings.defaultProducts.tobacco;
  const cbdId = state.settings.defaultProducts.cbd;
  const tob = productById(tobId);
  if (tob && priceAt(index, tobId, today).price == null && isNum(b.tobaccoPackPrice) && isNum(b.tobaccoPackSize) && b.tobaccoPackSize > 0) {
    await save('products', { ...tob, refPackPrice: b.tobaccoPackPrice, refPackSize: b.tobaccoPackSize });
  }
  const cbd = productById(cbdId);
  if (cbd && priceAt(index, cbdId, today).price == null && isNum(b.cbdPricePerGram) && b.cbdPricePerGram > 0) {
    await save('products', { ...cbd, refPackPrice: b.cbdPricePerGram, refPackSize: 1 });
  }
}

/** Champs du formulaire (réutilisés par l'accueil du premier lancement). */
export function beforeFields(b, onChange) {
  const mol = moleculeLabel({ molecule: state.settings.defaultMolecule || 'cbd' });
  const num = (key, unit, step, opts = {}) => decimalInput({ value: b[key], unit, step, stepper: opts.stepper ?? true, onchange: (v) => { b[key] = v; onChange?.(); } });
  return h('div', { class: 'stack' },
    h('div', { class: 'form-block' },
      h('div', { class: 'block-head' }, h('span', { class: 'dot dot-blue' }), h('h4', null, 'Tabac')),
      field('Paquets achetés par mois', num('tobaccoPacksPerMonth', 'paquets', 0.5)),
      h('div', { class: 'grid-2' },
        field('Prix du paquet', num('tobaccoPackPrice', '€', 0.5, { stepper: false })),
        field('Contenance', num('tobaccoPackSize', 'g', 5, { stepper: false })))),
    h('div', { class: 'form-block' },
      h('div', { class: 'block-head' }, h('span', { class: 'dot dot-green' }), h('h4', null, mol)),
      h('div', { class: 'grid-2' },
        field('Grammes achetés par mois', num('cbdGramsPerMonth', 'g', 1, { stepper: false })),
        field('Prix au gramme', num('cbdPricePerGram', '€', 0.5, { stepper: false })))),
    h('div', { class: 'form-block' },
      h('div', { class: 'block-head' }, h('span', { class: 'dot dot-violet' }), h('h4', null, 'Feuilles & filtres')),
      field('Environ par mois', num('accessoriesPerMonth', '€', 1, { stepper: false }))));
}

export function openBeforeForm() {
  const b = prefill({ ...emptyBefore(), ...(state.settings.before || {}) });
  openSheet({
    title: 'Avant l’app',
    size: 'full',
    build: (close) => {
      const totalEl = h('div', { class: 'before-total' });
      const refresh = () => {
        const m = beforeMonthly(b);
        fill(totalEl, m
          ? [h('span', null, 'Tu dépensais environ'), h('b', null, `${fmtMoney(m.total, { digits: 0 })} / mois`), h('span', { class: 'muted small' }, `soit ${fmtMoney(m.total * 12, { digits: 0 })} par an`)]
          : [h('span', { class: 'muted' }, 'Remplis ce que tu connais, même approximativement.')]);
      };
      const root = h('div', { class: 'stack form' },
        h('p', { class: 'muted' }, 'Avant de commencer le suivi, combien achetais-tu en moyenne chaque mois ? Une estimation suffit : tes vraies dépenses prendront le relais au fil des jours.'),
        beforeFields(b, refresh),
        totalEl,
        h('div', { class: 'form-actions sticky-actions' },
          h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: async () => {
            if (!beforeMonthly(b)) { toast('Indique au moins une dépense', { tone: 'warn' }); return; }
            const { ctx } = derived();
            b.startDate = b.startDate || ctx.trackingStart || dayKey();
            await applyBeforePrices(b);
            await saveSettings({ before: b });
            close(); toast('C’est noté : tes économies sont calculées dès maintenant');
          } }, 'Enregistrer')));
      refresh();
      return root;
    },
  });
}

/* ------------------------------ Affichages ------------------------------ */

/** Carte d'accueil : économies en direct, ou invitation à remplir. */
export function beforeHomeCard() {
  const b = state.settings.before;
  const m = beforeMonthly(b);
  if (!m) {
    return h('button', { class: 'banner banner-soft pack-cta', onclick: openBeforeForm },
      h('span', { class: 'banner-main' }, icon('wallet', 18), h('div', null, h('b', null, 'Combien dépensais-tu avant ?'),
        h('span', null, 'Indique tes achats habituels : tu verras tes économies dès aujourd’hui.'))), icon('chevron', 16));
  }
  const { ctx } = derived();
  const s = savingsNow(b);
  const cur = currentMonthly(state.entries, ctx, 14);
  if (!s) return null;
  const positive = s.saved >= 0;
  // Pourcentage seulement après 3 jours : avant, c'est une tendance trop fragile.
  const pct = cur && cur.days >= 3 && m.total ? Math.round((1 - cur.total / m.total) * 100) : null;
  return h('button', { class: 'savings', onclick: () => { location.hash = '#/progress/money'; } },
    h('div', { class: 'savings-top' },
      h('span', { class: 'savings-label' }, positive ? 'Économisé depuis le début' : 'Par rapport à avant'),
      h('span', { class: 'muted small' }, `depuis le ${formatDayShort(s.start).replace(/\.$/, '')}`)),
    h('b', { class: `savings-num ${positive ? '' : 'neutral'}` }, positive ? fmtMoney(s.saved) : `+${fmtMoney(-s.saved)}`),
    h('div', { class: 'savings-compare' },
      h('div', null, h('span', null, 'Avant'), h('b', null, `${fmtMoney(m.total, { digits: 0 })}/mois`)),
      icon('chevron', 14),
      h('div', null, h('span', null, cur?.days >= 3 ? 'Maintenant' : 'Maintenant (tendance)'), h('b', null, cur ? `${fmtMoney(cur.total, { digits: 0 })}/mois` : '—')),
      pct != null && pct > 0 ? h('span', { class: 'savings-pct' }, `−${pct} %`) : null),
    s.incomplete ? h('span', { class: 'savings-warn' }, 'Certaines consommations n’ont pas de prix : vérifie tes produits.') : null);
}

/** Bloc détaillé pour Progrès › Argent. */
export function beforeMoneyCard() {
  const b = state.settings.before;
  const m = beforeMonthly(b);
  if (!m) {
    return card(h('h3', { class: 'card-title' }, 'Avant l’app'),
      h('p', { class: 'muted' }, 'Indique tes achats habituels d’avant pour mesurer tes économies réelles.'),
      h('button', { class: 'btn btn-primary btn-sm', onclick: openBeforeForm }, 'Renseigner'));
  }
  const { ctx } = derived();
  const s = savingsNow(b);
  const cur = currentMonthly(state.entries, ctx, 14);
  const yearly = cur && cur.days >= 3 ? (m.total - cur.total) * 12 : null;
  return card(
    h('div', { class: 'card-head' }, h('h3', { class: 'card-title' }, 'Avant l’app / maintenant'), h('button', { class: 'link', onclick: openBeforeForm }, 'Modifier')),
    h('div', { class: 'big-row' },
      h('div', { class: 'big' }, h('b', null, fmtMoney(m.total, { digits: 0 })), h('span', null, 'par mois avant')),
      h('div', { class: 'big' }, h('b', null, cur ? fmtMoney(cur.total, { digits: 0 }) : '—'), h('span', null, 'par mois maintenant'))),
    s ? h('div', { class: 'big-row' },
      h('div', { class: 'big' }, h('b', { class: s.saved >= 0 ? 'up-good' : '' }, fmtMoney(s.saved, { digits: 0 })), h('span', null, `économisés en ${fmtNum(s.fullDays, 0)} j`)),
      h('div', { class: 'big' }, h('b', null, yearly != null && yearly > 0 ? fmtMoney(yearly, { digits: 0 }) : '—'), h('span', null, cur && cur.days >= 3 ? 'par an à ce rythme' : 'par an (après 3 jours)'))) : null,
    s && (s.expectedTobaccoGrams || s.expectedCbdGrams) ? h('p', { class: 'hint' }, [
      s.expectedTobaccoGrams ? `Tabac : ${fmtGrams(s.tobaccoGrams, 0)} au lieu d’environ ${fmtGrams(s.expectedTobaccoGrams, 0)}` : null,
      s.expectedCbdGrams ? `${moleculeLabel({ molecule: state.settings.defaultMolecule || 'cbd' })} : ${fmtGrams(s.cbdGrams, 1)} au lieu d’environ ${fmtGrams(s.expectedCbdGrams, 1)}` : null,
    ].filter(Boolean).join(' · ') + '.') : null,
    h('p', { class: 'hint' }, `Calcul : ${fmtMoney(m.total / DAYS_PER_MONTH)} par jour avant, comparé à tes dépenses réellement enregistrées.${s && !s.includeAccessories && m.accessories ? ' Feuilles et filtres ne sont pas comptés tant que leur prix n\u2019est pas renseigné.' : ''}`),
    s?.incomplete ? note('Certaines consommations n’ont pas de prix : l’économie est surestimée tant que leurs produits n’ont pas de tarif.', 'warn') : null);
}

/** Dépense quotidienne « avant », si renseignée. */
export const beforePerDay = () => beforeMonthly(state.settings.before)?.perDay ?? null;
