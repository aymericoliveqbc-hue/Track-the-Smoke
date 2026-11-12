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
  { id: 'travel', label: 'Voyage', icon: 'flag', items: ['Transport', 'Hébergement', 'Repas & sorties', 'Activités'], buffer: 0.1, placeholder: 'Ex. une semaine au soleil' },
  { id: 'savings', label: 'Épargne', icon: 'wallet', items: ['Montant à mettre de côté'], buffer: 0, placeholder: 'Ex. un coussin de sécurité' },
  { id: 'purchase', label: 'Achat personnel', icon: 'tag', items: ['Prix'], buffer: 0, placeholder: 'Ex. un vélo, un ordinateur' },
  { id: 'realestate', label: 'Projet immobilier', icon: 'home', items: ['Apport', 'Frais', 'Travaux / installation'], buffer: 0.05, placeholder: 'Ex. apport pour un logement' },
  { id: 'leisure', label: 'Loisirs', icon: 'sparkle', items: ['Montant'], buffer: 0, placeholder: 'Ex. un abonnement, un concert, un cours' },
  { id: 'other', label: 'Autre', icon: 'goals', items: ['Montant'], buffer: 0, placeholder: 'Décris ton projet' },
  // Ancien modèle (projets créés avant la V2) : conservé pour l'affichage, non proposé.
  { id: 'move', label: 'Projet de vie', icon: 'home', hidden: true, items: ['Montant'], buffer: 0.1, placeholder: '' },
];
export const templateOf = (id) => PROJECT_TEMPLATES.find((t) => t.id === id) || PROJECT_TEMPLATES[3];

export function newProject(templateId, refPerDay, today) {
  const t = templateOf(templateId);
  return {
    id: uid('prj'), kind: 'project', template: t.id, name: '', description: '',
    items: t.items.map((label) => ({ id: uid('it'), label, amount: null })),
    buffer: t.buffer, targetDate: null, saved: 0, deposits: [],
    startDate: today, refPerDay: isNum(refPerDay) && refPerDay > 0 ? round2(refPerDay) : null,
    ai: null, active: true, allocation: null, createdAt: new Date().toISOString(),
  };
}

/**
 * Part (%) des économies de réduction attribuée à chaque projet, sans jamais
 * dépasser 100 % au total : une même économie n'est jamais comptée deux fois.
 * Projets sans part explicite : le reste disponible est réparti à parts égales.
 */
export function allocations(projects) {
  const active = projects.filter((p) => p.active !== false);
  const fixed = active.filter((p) => isNum(p.allocation));
  const fixedSum = Math.min(100, fixed.reduce((t, p) => t + Math.max(0, p.allocation), 0));
  const free = active.filter((p) => !isNum(p.allocation));
  const share = free.length ? (100 - fixedSum) / free.length : 0;
  const out = new Map();
  let used = 0;
  for (const p of fixed) { const v = Math.max(0, Math.min(p.allocation, 100 - used)); out.set(p.id, v); used += v; }
  for (const p of free) out.set(p.id, share);
  return out;
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
export function projectPlan(p, { entries, ctx, currentPerDay, fallbackRef = null, sharedSavings = null, share = null }) {
  const total = projectTotal(p);
  // V2 : économie commune (« avant l'app » ou référence) × part du projet.
  let red = reductionSavings(p, entries, ctx);
  if (sharedSavings) {
    const g = sharedSavings(p.startDate);
    red = { amount: Math.max(0, g.amount) * ((share ?? 100) / 100), days: g.days };
  }
  const manual = (p.saved || 0) + (p.deposits || []).reduce((t, d) => t + (d.amount || 0), 0);
  const saved = Math.max(0, red.amount) + manual;
  const remaining = Math.max(0, total - saved);
  // Référence figée à la création ; sinon (prix encore inconnus) référence courante.
  const ref = isNum(p.refPerDay) ? p.refPerDay : (isNum(fallbackRef) && fallbackRef > 0 ? fallbackRef : null);
  const sh = (share ?? 100) / 100;
  const pace = isNum(ref) && isNum(currentPerDay) ? Math.max(0, ref - currentPerDay) * 30.44 * (sharedSavings ? sh : 1) : 0;

  const eta = (monthly) => (monthly > 0 ? addDays(ctx.today, Math.ceil((remaining / monthly) * 30.44)) : null);
  const scenarios = isNum(ref) && ref > 0
    ? [0.25, 0.5, 1].map((share) => ({ share, monthly: ref * share * 30.44, date: eta(ref * share * 30.44) }))
    : [];

  let deadline = null;
  // Montant cible direct (sans postes) accepté.
  if (!total && isNum(p.target)) return projectPlan({ ...p, items: [{ label: 'Objectif', amount: p.target }], buffer: 0 }, { entries, ctx, currentPerDay, fallbackRef, sharedSavings, share });
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
    ref, refFrozen: isNum(p.refPerDay), currentPerDay, paceMonthly: pace, share: share ?? 100, etaAtPace: eta(pace), scenarios, deadline, done: total > 0 && remaining <= 0,
  };
}
