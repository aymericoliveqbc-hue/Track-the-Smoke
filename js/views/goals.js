// OBJECTIFS — observation, référence, objectifs personnalisés, parcours
// d'arrêt du tabac et du CBD.

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { card, cardHead, emptyState, note, badge, segmented, openSheet, toast, field, statTile } from '../ui/components.js';
import { ring, lineChart, COLORS } from '../ui/charts.js';
import { openGoalForm, formatGoalValue } from '../ui/forms.js';
import { state, derived, saveSettings, maybeComputeBaseline } from '../core/store.js';
import { addDays, dayKey, formatDayLong, formatDayShort, formatElapsed } from '../core/dates.js';
import { fmtGrams, fmtMoney, fmtNum, isNum } from '../core/format.js';
import { observationStatus, evaluateGoal, journeyStats, realizedSavings, metricOf, targetAt, measureMetric, computeBaseline } from '../domain/goals.js';

const rerender = () => window.dispatchEvent(new Event('tts:render'));

export function renderGoals() {
  const { ctx, today } = derived();
  const s = state.settings;
  const root = h('div', { class: 'view' });
  root.append(h('header', { class: 'view-head' }, h('h1', null, 'Objectifs'),
    h('button', { class: 'icon-btn icon-btn-solid', 'aria-label': 'Nouvel objectif', onclick: () => openGoalForm() }, icon('plus', 20))));

  root.append(h('p', { class: 'muted intro' }, 'Ton rythme, tes règles. Aucun calendrier n’est imposé, et une consommation n’efface jamais tes progrès.'));

  // Phase d'observation
  const obs = observationStatus(s, today);
  if (obs) {
    root.append(card(cardHead('Phase d’observation', obs.done ? badge('terminée', 'green') : badge(`jour ${obs.elapsed}/${obs.days}`, 'violet')),
      h('div', { class: 'obs' }, ring(obs.elapsed / obs.days, 64, COLORS.primary, `${obs.elapsed}/${obs.days}`),
        h('div', null,
          h('p', null, obs.done ? 'Ta période d’observation est terminée. Ta référence personnelle a été établie à partir de ces jours.' : 'Enregistre simplement tes consommations, envies, dépenses et nuits. Ta référence sera calculée à la fin.'),
          h('p', { class: 'muted small' }, `Du ${formatDayShort(obs.start)} au ${formatDayShort(obs.end)}`))),
      !obs.done ? h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => { await saveSettings({ observation: { ...s.observation, days: Math.max(1, obs.elapsed) } }); await maybeComputeBaseline(true); toast('Observation terminée, référence calculée'); } }, 'Terminer maintenant') : null));
  } else if (!s.baseline) {
    root.append(card(cardHead('Commencer par observer'),
      h('p', null, 'Une période d’observation de 7 à 14 jours, sans objectif, permet d’établir une référence fidèle à ta consommation réelle.'),
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn btn-primary btn-sm', onclick: () => startObservation(7) }, '7 jours'),
        h('button', { class: 'btn btn-primary btn-sm', onclick: () => startObservation(14) }, '14 jours'),
        h('button', { class: 'btn btn-ghost btn-sm', onclick: () => openBaselineSheet() }, 'Référence manuelle'))));
  }

  // Référence
  if (s.baseline) root.append(baselineCard(s.baseline));

  // Parcours
  root.append(h('div', { class: 'section-title' }, h('h2', null, 'Parcours')));
  root.append(journeyCard('tobacco', 'Arrêt du tabac', COLORS.blue));
  root.append(journeyCard('cbd', 'Arrêt du CBD', COLORS.green));

  // Objectifs
  root.append(h('div', { class: 'section-title' }, h('h2', null, 'Mes objectifs'), h('button', { class: 'link', onclick: () => openGoalForm() }, 'Ajouter')));
  const goals = state.goals.slice().sort((a, b) => Number(b.active) - Number(a.active));
  if (!goals.length) {
    root.append(card(emptyState({ icon: 'goals', title: 'Aucun objectif', text: 'Réduire le tabac, le CBD, le nombre de joints, un budget, ou mieux gérer tes envies : choisis ce qui compte pour toi.', action: h('button', { class: 'btn btn-primary', onclick: () => openGoalForm() }, 'Créer un objectif') })));
  } else {
    for (const g of goals) root.append(goalCard(g, ctx));
  }

  const realized = realizedSavings(state.entries, s.baseline, ctx);
  if (realized) {
    root.append(card(cardHead('Économies depuis ta référence', badge('données réelles', 'green')),
      h('b', { class: 'num-xl' }, fmtMoney(realized.saved)),
      h('p', { class: 'hint' }, `Sur ${realized.days} jour(s) : ${fmtMoney(realized.expected)} attendus au rythme de référence, ${fmtMoney(realized.actual)} réellement dépensés. Ce montant est différent des économies théoriques du simulateur.`),
      h('a', { class: 'link', href: '#/stats/simulator' }, 'Ouvrir le simulateur')));
  }
  return root;
}

async function startObservation(days) {
  await saveSettings({ observation: { enabled: true, startDate: dayKey(), days } });
  toast(`Observation de ${days} jours démarrée`);
}

function baselineCard(b) {
  return card(cardHead('Ta référence', badge(b.source === 'observation' ? 'observation' : b.source === 'manuelle' ? 'manuelle' : 'période', 'muted')),
    h('p', { class: 'muted small' }, `${formatDayShort(b.from)} → ${formatDayShort(b.to)} · ${b.days} jour(s)`),
    h('div', { class: 'mini-grid' },
      h('div', null, h('b', null, fmtGrams(b.tobaccoPerDay)), h('span', null, 'tabac / jour')),
      h('div', null, h('b', null, fmtGrams(b.cbdPerDay)), h('span', null, 'CBD / jour')),
      h('div', null, h('b', null, fmtNum(b.jointsPerDay, 1)), h('span', null, 'joints / jour')),
      h('div', null, h('b', null, fmtNum(b.rolledPerDay, 1)), h('span', null, 'roulées / jour')),
      h('div', null, h('b', null, fmtMoney(b.costPerDay)), h('span', null, 'dépense / jour')),
      h('div', null, h('b', null, fmtNum(b.cravingsPerDay, 1)), h('span', null, 'envies / jour'))),
    b.missingQuantities || b.incompleteCosts ? h('p', { class: 'hint warn' }, `Référence basée sur des données incomplètes : ${b.missingQuantities} quantité(s) et ${b.incompleteCosts} coût(s) manquants.`) : null,
    h('button', { class: 'btn btn-ghost btn-sm', onclick: () => openBaselineSheet() }, icon('edit', 14), 'Recalculer sur une autre période'));
}

function openBaselineSheet() {
  const { ctx, today } = derived();
  const r = { start: ctx.trackingStart || addDays(today, -13), end: today };
  openSheet({
    title: 'Référence personnelle',
    build: (close) => h('div', { class: 'stack form' },
      h('p', { class: 'muted' }, 'Choisis la période représentative de ta consommation habituelle. Tes objectifs et données passées restent inchangés.'),
      h('div', { class: 'grid-2' },
        field('Du', h('input', { class: 'input', type: 'date', value: r.start, max: today, onchange: (e) => { r.start = e.target.value; } })),
        field('Au', h('input', { class: 'input', type: 'date', value: r.end, max: today, onchange: (e) => { r.end = e.target.value; } }))),
      h('button', { class: 'btn btn-primary btn-block', onclick: async () => {
        if (!r.start || !r.end || r.start > r.end) { toast('Période invalide', { tone: 'warn' }); return; }
        const b = computeBaseline(state.entries, r, ctx, 'manuelle');
        if (!b) { toast('Aucune donnée sur cette période', { tone: 'warn' }); return; }
        await saveSettings({ baseline: b }); close(); toast('Référence mise à jour');
      } }, 'Calculer la référence')),
  });
}

function journeyCard(kind, title, color) {
  const { ctx, today } = derived();
  const j = state.settings.journeys[kind];
  const js = journeyStats(kind, j, state.entries, ctx, state.settings.baseline);
  const statusCtl = segmented([{ id: 'tracking', label: 'Suivi' }, { id: 'reducing', label: 'Réduction' }, { id: 'stopped', label: 'Arrêt' }], j.status, async (v) => {
    const patch = { status: v };
    if (v === 'stopped' && !j.quitDate) patch.quitDate = today;
    await saveSettings({ journeys: { [kind]: { ...j, ...patch } } });
  }, { small: true });

  // Série hebdomadaire de la substance
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const end = addDays(today, -7 * i); const start = addDays(end, -6);
    const m = measureMetric(kind === 'tobacco' ? 'tobacco_g' : 'cbd_g', state.entries, { start, end }, ctx);
    weeks.push({ label: formatDayShort(start).replace(/\.$/, ''), tip: `Semaine du ${formatDayShort(start)}`, value: m.value });
  }
  const base = state.settings.baseline ? (kind === 'tobacco' ? state.settings.baseline.tobaccoPerDay : state.settings.baseline.cbdPerDay) : null;
  const last7 = summarizeKind(kind, ctx, { start: addDays(today, -6), end: today });

  const children = [
    cardHead(title, statusCtl),
    h('div', { class: 'tiles tiles-2 tiles-flat' },
      statTile({ label: 'Dernière fois', value: js.last ? `il y a ${formatElapsed(js.sinceLastMin)}` : 'jamais notée' }),
      statTile({ label: '7 derniers jours', value: last7.value != null ? `${fmtGrams(last7.value)} / j` : '—', sub: base != null ? `référence ${fmtGrams(base)} / j` : null }),
      statTile({ label: kind === 'tobacco' ? 'Roulées (7 j)' : 'Joints CBD (7 j)', value: fmtNum(last7.count, 0) }),
      kind === 'tobacco' ? statTile({ label: 'Tabac dans les joints (7 j)', value: fmtGrams(last7.inJoints) }) : statTile({ label: 'Dépense CBD (7 j)', value: fmtMoney(last7.cost) })),
  ];
  if (weeks.some((w) => w.value != null)) {
    children.push(lineChart([{ label: kind === 'tobacco' ? 'Tabac' : 'CBD', color, points: weeks }], { format: (v) => fmtNum(v, 2), target: base ?? undefined, aria: `${title} par semaine (g/jour)`, height: 120 }));
    children.push(h('p', { class: 'hint' }, `Grammes par jour, moyenne hebdomadaire${base != null ? ' · pointillés : ta référence' : ''}.`));
  }
  if (j.status === 'stopped') {
    children.push(field('Date d’arrêt', h('input', { class: 'input', type: 'date', value: j.quitDate || today, max: today, onchange: async (e) => { if (e.target.value) await saveSettings({ journeys: { [kind]: { ...j, quitDate: e.target.value } } }); } })));
  }
  if (js.quit) {
    const q = js.quit;
    children.push(h('div', { class: 'quit' },
      h('div', { class: 'quit-hero' }, h('b', { class: 'num-xl' }, `${q.days} j`), h('span', null, `depuis l’arrêt du ${formatDayLong(q.date)}`)),
      h('div', { class: 'mini-grid' },
        h('div', null, h('b', null, `${q.daysWithout} / ${q.days}`), h('span', null, 'jours sans')),
        h('div', null, h('b', null, `${q.bestStreak} j`), h('span', null, 'plus longue série')),
        h('div', null, h('b', null, q.avoidedQty != null ? fmtGrams(q.avoidedQty) : '—'), h('span', null, 'non consommés*')),
        h('div', null, h('b', null, q.avoidedUnits != null ? fmtNum(q.avoidedUnits, 0) : '—'), h('span', null, kind === 'tobacco' ? 'roulées évitées*' : 'joints évités*')),
        h('div', null, h('b', null, q.avoidedCost != null ? fmtMoney(q.avoidedCost) : '—'), h('span', null, 'dépenses évitées*')),
        h('div', null, h('b', null, String(q.occurrences)), h('span', null, 'consommations depuis'))),
      h('p', { class: 'hint' }, state.settings.baseline ? '* Estimations par rapport à ta référence. Une consommation ponctuelle ne remet rien à zéro.' : '* Disponible une fois ta référence établie.'),
      q.occurrences ? note('Une consommation après l’arrêt fait partie du chemin. Tes jours sans restent acquis.', 'positive') : null));
  } else if (j.status === 'reducing') {
    children.push(h('p', { class: 'hint' }, 'Avance à ton rythme. Tu peux créer des objectifs dédiés ci-dessous.'));
  }
  return card(...children);
}

function summarizeKind(kind, ctx, range) {
  const m = measureMetric(kind === 'tobacco' ? 'tobacco_g' : 'cbd_g', state.entries, range, ctx);
  const list = state.entries.filter((e) => e.kind === 'consumption' && e.at.slice(0, 10) >= range.start && e.at.slice(0, 10) <= range.end);
  return {
    value: m.value,
    count: list.filter((e) => e.categoryId === (kind === 'tobacco' ? 'rolled' : 'joint')).length,
    inJoints: list.filter((e) => e.categoryId === 'joint').reduce((t, e) => t + (e.tobacco?.grams || 0), 0),
    cost: list.reduce((t, e) => t + (ctx.cost(e).cbd || 0), 0),
  };
}

function goalCard(g, ctx) {
  const ev = evaluateGoal(g, state.entries, ctx, state.settings.baseline);
  const m = metricOf(g.metric);
  const fmt = (v) => formatGoalValue(g.metric, v);
  const today = ctx.today;
  const nextStep = (g.steps || []).filter((s) => s.date > today).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  const weeks = [];
  for (let i = 5; i >= 0; i--) {
    const end = addDays(today, -7 * i); const start = addDays(end, -6);
    weeks.push({ label: formatDayShort(start).replace(/\.$/, ''), tip: `Semaine du ${formatDayShort(start)}`, value: measureMetric(g.metric, state.entries, { start, end }, ctx).value, target: targetAt(g, end) });
  }
  const status = ev.reached == null ? badge('données insuffisantes', 'muted') : ev.reached ? badge('atteint cette semaine', 'green') : badge('en cours', 'violet');
  return h('section', { class: `card goal ${g.active ? '' : 'inactive'}` },
    h('button', { class: 'goal-head', 'aria-label': `Modifier l'objectif ${m.label}`, onclick: () => openGoalForm({ goal: g }) },
      ring(ev.progress ?? (ev.reached ? 1 : 0), 52, ev.reached ? COLORS.primary : COLORS.blue, ev.progress != null ? `${Math.round(ev.progress * 100)}%` : ''),
      h('div', { class: 'grow' },
        h('h3', null, m.label, !g.active ? ' (en pause)' : ''),
        h('p', { class: 'muted small' }, `${m.dir === 'down' ? 'Au plus' : 'Au moins'} ${fmt(ev.target)}${nextStep ? ` · prochain palier ${fmt(nextStep.target)} le ${formatDayShort(nextStep.date)}` : ''}`), status),
      icon('edit', 16, 'row-chevron')),
    h('div', { class: 'goal-values' },
      h('div', null, h('span', { class: 'muted small' }, '7 derniers jours'), h('b', null, fmt(ev.current.value))),
      h('div', null, h('span', { class: 'muted small' }, 'Référence'), h('b', null, fmt(ev.baseline))),
      h('div', null, h('span', { class: 'muted small' }, 'Cible'), h('b', null, fmt(ev.target)))),
    weeks.some((w) => isNum(w.value)) && !m.time ? lineChart([{ label: m.label, color: COLORS.primary, points: weeks }], { target: ev.target, height: 110, format: (v) => (m.pct ? `${Math.round(v * 100)}%` : fmtNum(v, g.metric === 'spend' ? 0 : 1)), aria: `Évolution de l'objectif ${m.label}` }) : null,
    g.note ? h('p', { class: 'goal-note' }, `« ${g.note} »`) : null,
    g.revisions?.length ? h('p', { class: 'hint' }, `Modifié ${g.revisions.length} fois · historique conservé`) : null);
}

