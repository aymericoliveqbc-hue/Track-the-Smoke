// Projets d'épargne : transformer la réduction en un objectif concret
// (déménager, voyager, acheter quelque chose…).
//
// Calcul entièrement local :
//  - dépense de référence = dépense quotidienne au moment de créer le projet
//    (référence personnelle si elle existe, sinon moyenne des 30 derniers jours) ;
//  - économisé grâce à la réduction = référence × jours − dépenses réelles
//    depuis la création (jamais négatif dans l'affichage) ;
//  - + ce que l'utilisateur déclare avoir mis de côté ;
//  - projections : au rythme actuel, et si je réduis de 25 / 50 / 100 %.

import { addDays, diffDays } from '../core/dates.js';
import { isNum, round2 } from '../core/format.js';
import { summarize } from './stats.js';
import { uid } from './models.js';

export const PROJECT_TEMPLATES = [
  {
    id: 'travel', label: 'Voyage', icon: 'flag',
    items: ['Transport aller-retour', 'Logement', 'Repas & sorties', 'Activités', 'Assurance voyage'], buffer: 0.1,
    placeholder: 'Ex. 1 semaine à Lisbonne en juin, 2 personnes',
  },
  {
    id: 'move', label: 'S’installer ailleurs', icon: 'home',
    items: ['Billets d’avion', 'Visa / permis', 'Premier loyer + caution', 'Installation (meubles, équipement)', 'Assurance santé', 'Fonds de sécurité (premiers mois)'], buffer: 0.1,
    placeholder: 'Ex. Déménager à Montréal, 1 personne, permis vacances-travail',
  },
  {
    id: 'purchase', label: 'Un achat', icon: 'tag',
    items: ['Prix'], buffer: 0,
    placeholder: 'Ex. Un vélo électrique',
  },
  {
    id: 'other', label: 'Autre', icon: 'sparkle',
    items: ['Montant'], buffer: 0,
    placeholder: 'Décris ton projet',
  },
];
export const templateOf = (id) => PROJECT_TEMPLATES.find((t) => t.id === id) || PROJECT_TEMPLATES[3];

export function newProject(templateId, refPerDay, today) {
  const t = templateOf(templateId);
  return {
    id: uid('prj'), kind: 'project', template: t.id, name: '', description: '',
    items: t.items.map((label) => ({ id: uid('it'), label, amount: null })),
    buffer: t.buffer, targetDate: null, saved: 0, deposits: [],
    startDate: today, refPerDay: isNum(refPerDay) && refPerDay > 0 ? round2(refPerDay) : null,
    ai: null, active: true, createdAt: new Date().toISOString(),
  };
}

export function projectTotal(p) {
  const base = (p.items || []).reduce((t, it) => t + (isNum(it.amount) ? it.amount : 0), 0);
  return round2(base * (1 + (isNum(p.buffer) ? p.buffer : 0)));
}

/** Économies dues à la réduction depuis le début du projet (peut être négatif). */
export function reductionSavings(p, entries, ctx) {
  if (!isNum(p.refPerDay) || !p.startDate || p.startDate > ctx.today) return { amount: 0, days: 0 };
  const s = summarize(entries, { start: p.startDate, end: ctx.today }, ctx);
  if (!s.coverage) return { amount: 0, days: 0 };
  return { amount: p.refPerDay * s.coverage.days - s.cost.total, days: s.coverage.days, spent: s.cost.total };
}

const monthsBetween = (a, b) => diffDays(a, b) / 30.44;

/**
 * Plan d'un projet.
 * @param currentPerDay dépense quotidienne actuelle (ex. moyenne 14–30 j)
 */
export function projectPlan(p, { entries, ctx, currentPerDay, fallbackRef = null }) {
  const total = projectTotal(p);
  const red = reductionSavings(p, entries, ctx);
  const manual = (p.saved || 0) + (p.deposits || []).reduce((t, d) => t + (d.amount || 0), 0);
  const saved = Math.max(0, red.amount) + manual;
  const remaining = Math.max(0, total - saved);
  // Référence figée à la création ; sinon (prix encore inconnus) référence courante.
  const ref = isNum(p.refPerDay) ? p.refPerDay : (isNum(fallbackRef) && fallbackRef > 0 ? fallbackRef : null);
  const pace = isNum(ref) && isNum(currentPerDay) ? Math.max(0, ref - currentPerDay) * 30.44 : 0;

  const eta = (monthly) => (monthly > 0 ? addDays(ctx.today, Math.ceil((remaining / monthly) * 30.44)) : null);
  const scenarios = isNum(ref) && ref > 0
    ? [0.25, 0.5, 1].map((share) => ({ share, monthly: ref * share * 30.44, date: eta(ref * share * 30.44) }))
    : [];

  let deadline = null;
  if (p.targetDate && p.targetDate > ctx.today && remaining > 0) {
    const months = monthsBetween(ctx.today, p.targetDate);
    const neededMonthly = remaining / months;
    const maxMonthly = isNum(ref) ? ref * 30.44 : 0;
    deadline = {
      months, neededMonthly,
      neededShare: maxMonthly > 0 ? neededMonthly / maxMonthly : null,
      gapMonthly: Math.max(0, neededMonthly - maxMonthly),
      onTrack: pace >= neededMonthly,
    };
  }
  return {
    total, saved, manual, fromReduction: red.amount, days: red.days, remaining,
    progress: total > 0 ? Math.min(1, saved / total) : 0,
    ref, refFrozen: isNum(p.refPerDay), currentPerDay, paceMonthly: pace, etaAtPace: eta(pace), scenarios, deadline, done: total > 0 && remaining <= 0,
  };
}
