// Projets d'épargne (voyage, épargne, achat, logement, loisirs…) + assistant IA facultatif.

import { h, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { card, field, textInput, textArea, decimalInput, toast, openSheet, confirmDialog, note, emptyState } from '../ui/components.js';
import { ring, COLORS } from '../ui/charts.js';
import { state, save, remove, derived } from '../core/store.js';
import { addDays, formatDayLong, formatDayShort, dayKey, MONTHS } from '../core/dates.js';
import { fmtMoney, fmtNum, isNum, round2 } from '../core/format.js';
import { summarize } from '../domain/stats.js';
import { PROJECT_TEMPLATES, templateOf, newProject, projectTotal, projectPlan, allocations } from '../domain/projects.js';
import { beforeMonthly, beforeSavings } from '../domain/before.js';
import { uid } from '../domain/models.js';
import { estimateProject, hasAiKey, getAiKey, setAiKey } from '../core/ai.js';
import { beforePerDay } from './before.js';

const projects = () => state.goals.filter((g) => g.kind === 'project').sort((a, b) => Number(b.active) - Number(a.active) || (a.createdAt < b.createdAt ? 1 : -1));

function costPerDay(days) {
  const { ctx, today } = derived();
  const s = summarize(state.entries, { start: addDays(today, -(days - 1)), end: today }, ctx);
  return s.coverage ? s.cost.total / s.coverage.days : null;
}
const refNow = () => beforePerDay() || state.settings.baseline?.costPerDay || costPerDay(30);
/**
 * Économie commune depuis une date : « avant l'app » si renseigné (réel),
 * sinon null (chaque projet utilise alors sa propre référence figée).
 */
function sharedSavingsFn() {
  const b = state.settings.before;
  if (!beforeMonthly(b)) return null;
  const { ctx } = derived();
  return (start) => {
    const from = b.startDate && b.startDate > start ? b.startDate : start;
    const r = beforeSavings({ ...b, startDate: from }, state.entries, ctx, 1);
    return r ? { amount: r.saved, days: r.fullDays } : { amount: 0, days: 0 };
  };
}
const planOf = (p) => {
  const shares = allocations(projects());
  return projectPlan(p, { entries: state.entries, ctx: derived().ctx, currentPerDay: costPerDay(14), fallbackRef: refNow(), sharedSavings: sharedSavingsFn(), share: shares.get(p.id) ?? 100 });
};

/** Fige la dépense de référence dès qu'elle est connue (prix renseignés). */
async function freezeRef(p) {
  const r = refNow();
  if (p.refPerDay == null && r > 0) { p.refPerDay = round2(r); p.startDate = dayKey(); await save('goals', p); }
}
const monthYear = (d) => (d ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : '—');

/* ------------------------------ Affichages ------------------------------ */

export function projectsSection() {
  const list = projects();
  return h('div', { class: 'stack' },
    h('div', { class: 'section-title' }, h('h2', null, 'Mes projets'), h('button', { class: 'link', onclick: () => openProjectForm() }, 'Nouveau')),
    list.length ? list.map(projectCard) : card(emptyState({
      icon: 'flag', title: 'Un projet, un vrai but',
      text: 'Déménager, voyager, s’offrir quelque chose : l’app calcule ce que ta réduction te rapporte et quand tu y seras.',
      action: h('button', { class: 'btn btn-primary', onclick: () => openProjectForm() }, 'Créer un projet'),
    })));
}

/** Projet mis en avant sur l'accueil (le premier actif). */
export function homeProjectCard() {
  const p = projects().find((x) => x.active);
  return p ? projectCard(p, true) : null;
}

function projectCard(p, compact = false) {
  const plan = planOf(p);
  const t = templateOf(p.template);
  const line = plan.done ? 'Objectif atteint, bravo !'
    : plan.etaAtPace ? `Au rythme actuel : ${monthYear(plan.etaAtPace)}`
      : plan.scenarios[1] ? `En réduisant de moitié : ${monthYear(plan.scenarios[1].date)}`
        : 'Ajoute ton budget pour voir la date';
  return h('button', { class: 'project', onclick: () => openProjectDetail(p) },
    ring(plan.progress, compact ? 56 : 64, COLORS.primary, `${Math.round(plan.progress * 100)}%`),
    h('div', { class: 'grow' },
      h('span', { class: 'project-kind' }, icon(t.icon, 13), t.label),
      h('b', { class: 'project-name' }, p.name || 'Mon projet'),
      h('span', { class: 'project-sub' }, `${fmtMoney(plan.saved, { digits: 0 })} sur ${fmtMoney(plan.total, { digits: 0 })}`),
      h('span', { class: 'project-eta' }, line)),
    icon('chevron', 16, 'row-chevron'));
}

export function openProjectDetail(p) {
  freezeRef(p);
  openSheet({
    title: p.name || 'Mon projet',
    size: 'full',
    build: (close) => {
      const plan = planOf(p);
      const remainingTxt = fmtMoney(plan.remaining, { digits: 0 });
      return h('div', { class: 'stack' },
        h('div', { class: 'project-hero' },
          ring(plan.progress, 96, COLORS.primary, `${Math.round(plan.progress * 100)}%`),
          h('div', null,
            h('b', { class: 'num-xl' }, fmtMoney(plan.saved, { digits: 0 })),
            h('span', { class: 'muted' }, `sur ${fmtMoney(plan.total, { digits: 0 })}`),
            plan.done ? h('span', { class: 'up-good' }, 'Objectif atteint 🎉') : h('span', { class: 'muted small' }, `Il manque ${remainingTxt}`))),
        card(
          h('h3', { class: 'card-title' }, 'D’où vient l’argent'),
          h('div', { class: 'big-row' },
            h('div', { class: 'big' }, h('b', null, fmtMoney(Math.max(0, plan.fromReduction), { digits: 0 })), h('span', null, `grâce à ta réduction (${plan.days} j)`)),
            h('div', { class: 'big' }, h('b', null, fmtMoney(plan.manual, { digits: 0 })), h('span', null, 'mis de côté'))),
          isNum(plan.ref) ? h('p', { class: 'hint' }, `Calcul : ${fmtMoney(plan.ref)} / jour (ta dépense au départ) moins ce que tu dépenses vraiment depuis le ${formatDayShort(p.startDate).replace(/\.$/, '')}.`) : null,
          h('button', { class: 'btn btn-ghost btn-sm', onclick: () => addDeposit(p, close) }, icon('plus', 14), 'J’ai mis de l’argent de côté')),
        plan.done ? null : card(
          h('h3', { class: 'card-title' }, 'Quand j’y serai'),
          !plan.ref ? note('Renseigne le prix de tes paquets (Réglages › Mes paquets ou Produits) : l\u2019app pourra calculer ce que ta réduction te rapporte et quand tu atteindras ton objectif.', 'info') : null,
          !plan.ref ? null : plan.paceMonthly > 0
            ? h('p', null, `Au rythme actuel, tu économises ${fmtMoney(plan.paceMonthly, { digits: 0 })} par mois : objectif vers `, h('b', null, monthYear(plan.etaAtPace)), '.')
            : h('p', { class: 'muted' }, 'Pas encore d’économie mesurée par rapport à ton point de départ.'),
          plan.scenarios.length ? h('div', { class: 'scen-list' }, plan.scenarios.map((s) => h('div', { class: 'scen' },
            h('span', null, s.share === 1 ? 'Si j’arrête' : `Si je réduis de ${Math.round(s.share * 100)} %`),
            h('b', null, monthYear(s.date)),
            h('span', { class: 'muted small' }, `${fmtMoney(s.monthly, { digits: 0 })} / mois`)))) : null,
          plan.deadline ? deadlineNote(plan, p) : null),
        p.ai?.assumptions ? note(`Estimation IA : ${p.ai.assumptions}`, 'info') : null,
        card(h('h3', { class: 'card-title' }, 'Budget'),
          h('div', { class: 'list' }, p.items.filter((it) => isNum(it.amount)).map((it) => h('div', { class: 'row' },
            h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, it.label), it.note ? h('span', { class: 'row-sub' }, it.note) : null),
            h('span', { class: 'row-right' }, fmtMoney(it.amount, { digits: 0 })))),
          p.buffer ? h('div', { class: 'row' }, h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, `Imprévus (${Math.round(p.buffer * 100)} %)`)), h('span', { class: 'row-right' }, fmtMoney(projectTotal(p) - p.items.reduce((t, it) => t + (it.amount || 0), 0), { digits: 0 }))) : null)),
        h('div', { class: 'link-row' },
          h('button', { class: 'link', onclick: () => { close(); openProjectForm({ project: p }); } }, 'Modifier'),
          h('button', { class: 'link danger', onclick: async () => {
            if (await confirmDialog({ title: 'Supprimer ce projet ?', message: 'Tes données de consommation ne sont pas touchées.', confirm: 'Supprimer', danger: true })) { await remove('goals', p.id); close(); }
          } }, 'Supprimer')));
    },
  });
}

function deadlineNote(plan, p) {
  const d = plan.deadline;
  const when = formatDayLong(p.targetDate);
  if (d.onTrack) return note(`Pour le ${when}, tu es dans les temps 👍`, 'positive');
  if (d.neededShare != null && d.neededShare <= 1) {
    return note(`Pour y être le ${when}, il faudrait économiser ${fmtMoney(d.neededMonthly, { digits: 0 })} par mois, soit réduire ta consommation d’environ ${Math.ceil(d.neededShare * 100)} %.`, 'info');
  }
  return note(`Pour le ${when}, il faut ${fmtMoney(d.neededMonthly, { digits: 0 })} par mois. Même en arrêtant complètement, il manquerait environ ${fmtMoney(d.gapMonthly, { digits: 0 })} par mois à mettre de côté autrement.`, 'warn');
}

function addDeposit(p, closeDetail) {
  openSheet({
    title: 'Mis de côté',
    build: (close) => {
      let amount = null;
      return h('div', { class: 'stack form' },
        field('Montant', decimalInput({ value: null, unit: '€', stepper: false, onchange: (v) => { amount = v; } })),
        h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: async () => {
          if (!isNum(amount) || amount <= 0) { toast('Indique un montant', { tone: 'warn' }); return; }
          const next = { ...p, deposits: [...(p.deposits || []), { id: uid('dep'), date: dayKey(), amount: round2(amount) }] };
          await save('goals', next); close(); closeDetail(); toast(`${fmtMoney(amount)} ajoutés à ton projet`); openProjectDetail(next);
        } }, 'Ajouter'));
    },
  });
}

/* ------------------------------ Formulaire ------------------------------ */

export function openProjectForm({ project: existing } = {}) {
  const editing = !!existing;
  const ref = refNow();
  let p = existing ? JSON.parse(JSON.stringify(existing)) : newProject('travel', ref, dayKey());
  openSheet({
    title: editing ? 'Modifier le projet' : 'Nouveau projet',
    size: 'full',
    build: (close) => {
      const root = h('div', { class: 'stack form' });
      const totalEl = h('b', null);
      const refreshTotal = () => { totalEl.textContent = fmtMoney(projectTotal(p), { digits: 0 }); };
      const render = () => {
        const t = templateOf(p.template);
        fill(root,
          !editing ? h('div', { class: 'add-grid' }, PROJECT_TEMPLATES.filter((x) => !x.hidden).map((x) => h('button', {
            class: `add-tile ${x.id === p.template ? 'tile-on' : ''}`,
            onclick: () => { const keep = { name: p.name, description: p.description, targetDate: p.targetDate, saved: p.saved }; p = { ...newProject(x.id, ref, dayKey()), ...keep }; render(); },
          }, h('span', { class: 'add-icon' }, icon(x.icon, 22)), h('span', { class: 'add-label' }, x.label)))) : null,
          field('Nom', textInput({ value: p.name, placeholder: { travel: 'Ex. Une semaine au soleil', savings: 'Ex. Épargne de précaution', purchase: 'Ex. Un vélo', realestate: 'Ex. Apport logement', leisure: 'Ex. Un festival' }[t.id] || 'Nom du projet', oninput: (v) => { p.name = v; } })),
          field('En quelques mots', textArea({ value: p.description, rows: 2, placeholder: t.placeholder, oninput: (v) => { p.description = v; } })),
          aiBlock(p, render),
          h('div', { class: 'form-block' },
            h('div', { class: 'block-head' }, h('h4', null, 'Budget'), h('span', { class: 'budget-total' }, 'Total ', totalEl)),
            ...p.items.map((it, i) => h('div', { class: 'budget-row' },
              textInput({ value: it.label, oninput: (v) => { it.label = v; } }),
              decimalInput({ value: it.amount, unit: '€', stepper: false, onchange: (v) => { it.amount = v; refreshTotal(); } }),
              h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Retirer', onclick: () => { p.items.splice(i, 1); render(); } }, icon('close', 16)))),
            h('button', { type: 'button', class: 'link', onclick: () => { p.items.push({ id: uid('it'), label: '', amount: null }); render(); } }, '+ Ajouter un poste'),
            p.buffer ? h('p', { class: 'hint' }, `Inclut ${Math.round(p.buffer * 100)} % d’imprévus.`) : null),
          h('details', { class: 'form-details', open: !!(p.targetDate || p.saved || isNum(p.allocation)) }, h('summary', null, 'Date visée, épargne existante, part des économies'),
            h('div', { class: 'stack' },
              field('Part de tes économies attribuée à ce projet', decimalInput({ value: isNum(p.allocation) ? p.allocation : null, unit: '%', step: 5, max: 100, onchange: (v) => { p.allocation = v; } }),
                `Le total de tous tes projets ne dépasse jamais 100 % : une économie n’est jamais comptée deux fois. Vide = répartition automatique du reste${otherShares(p) ? ` (déjà attribué ailleurs : ${otherShares(p)} %)` : ''}.`),
              field('J’aimerais y être le', h('input', { class: 'input', type: 'date', value: p.targetDate || '', min: dayKey(), onchange: (e) => { p.targetDate = e.target.value || null; } })),
              field('Déjà mis de côté', decimalInput({ value: p.saved || null, unit: '€', stepper: false, onchange: (v) => { p.saved = v || 0; } })))),
          h('div', { class: 'form-actions sticky-actions' },
            h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: async () => {
              p.items = p.items.filter((it) => it.label.trim() || isNum(it.amount));
              if (!projectTotal(p)) { toast('Indique au moins un montant (ou utilise l’IA)', { tone: 'warn' }); return; }
              if (isNum(p.allocation) && p.allocation + otherShares(p) > 100) { toast(`Parts trop élevées : il reste ${Math.max(0, 100 - otherShares(p))} % disponibles`, { tone: 'warn' }); return; }
              if (!p.name.trim()) p.name = templateOf(p.template).label;
              await save('goals', p); close(); toast(editing ? 'Projet mis à jour' : 'Projet créé'); openProjectDetail(p);
            } }, editing ? 'Enregistrer' : 'Créer le projet')));
        refreshTotal();
      };
      render();
      return root;
    },
  });
}

function aiBlock(p, rerender) {
  if (!hasAiKey()) {
    return h('div', { class: 'ai-box' }, icon('sparkle', 18),
      h('div', { class: 'grow' }, h('b', null, 'Estimer avec l’IA'), h('span', { class: 'muted small' }, 'Ajoute ta clé dans Réglages › Assistant IA pour qu’une IA propose un budget.')));
  }
  const btn = h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: async () => {
    if (!p.description.trim() && !p.name.trim()) { toast('Décris ton projet en quelques mots', { tone: 'warn' }); return; }
    btn.disabled = true; btn.textContent = 'Estimation en cours…';
    try {
      const r = await estimateProject({ name: p.name, description: p.description, template: templateOf(p.template).label, currency: state.settings.currency });
      if (!r.items.length) throw new Error('Aucun poste proposé, précise la description.');
      p.items = r.items.map((it) => ({ id: uid('it'), label: it.label, amount: Math.round(it.amount), note: it.note }));
      p.ai = { at: new Date().toISOString(), assumptions: r.assumptions };
      if (!p.name.trim() && r.title) p.name = r.title;
      toast('Budget proposé : ajuste les montants si besoin');
      rerender();
    } catch (err) {
      toast(err.message || 'Estimation impossible', { tone: 'warn', duration: 5000 });
      btn.disabled = false; btn.textContent = 'Estimer avec l’IA';
    }
  } }, 'Estimer avec l’IA');
  return h('div', { class: 'ai-box' }, icon('sparkle', 18),
    h('div', { class: 'grow' }, h('b', null, 'Assistant IA'), h('span', { class: 'muted small' }, 'Propose un budget détaillé à partir de ta description. Seule la description est envoyée.')),
    btn);
}

/* ------------------------------ Réglages › Assistant IA ------------------------------ */

export function renderAiSettings(backHeader) {
  let value = '';
  const status = h('p', { class: 'muted' }, hasAiKey() ? `Clé enregistrée (…${getAiKey().slice(-4)}).` : 'Aucune clé enregistrée.');
  return h('div', { class: 'stack' }, backHeader,
    card(h('div', { class: 'ai-box flat' }, icon('sparkle', 20), h('div', null, h('b', null, 'Estimer tes projets avec Claude'),
      h('span', { class: 'muted small' }, 'L’assistant propose un budget détaillé pour un voyage, un déménagement, un achat… Tu gardes la main sur chaque montant.')))),
    card(
      field('Clé API Anthropic', textInput({ type: 'password', placeholder: 'sk-ant-…', autocomplete: 'off', oninput: (v) => { value = v; } })),
      status,
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn btn-primary', onclick: () => { if (!value.trim().startsWith('sk-')) { toast('Clé invalide', { tone: 'warn' }); return; } setAiKey(value); toast('Clé enregistrée sur cet appareil'); window.dispatchEvent(new Event('tts:render')); } }, 'Enregistrer'),
        hasAiKey() ? h('button', { class: 'btn btn-ghost', onclick: () => { setAiKey(''); toast('Clé supprimée'); window.dispatchEvent(new Event('tts:render')); } }, 'Supprimer la clé') : null)),
    note('Ta clé reste uniquement sur ce téléphone et n’est jamais incluse dans les sauvegardes. Seuls le nom et la description du projet sont envoyés à Anthropic, jamais tes données de consommation ou de sommeil. Chaque estimation coûte quelques centimes sur ton compte API.', 'info'),
    h('p', { class: 'hint' }, 'Crée une clé sur console.anthropic.com (compte API, distinct d’un abonnement Claude). Sans clé, les projets fonctionnent quand même : tu saisis toi-même les montants.'));
}

/** Somme des parts fixées sur les autres projets actifs. */
function otherShares(p) {
  return projects().filter((x) => x.id !== p.id && x.active !== false && isNum(x.allocation)).reduce((t, x) => t + x.allocation, 0);
}
