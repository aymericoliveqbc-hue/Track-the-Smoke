import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newProject, projectTotal, projectPlan } from '../js/domain/projects.js';
import { defaultSettings, defaultProducts, CAT } from '../js/domain/models.js';
import { buildPriceIndex, makeCostFn } from '../js/domain/costs.js';
import { addDays } from '../js/core/dates.js';

const near = (a, b, eps = 0.02) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const settings = defaultSettings();
const index = buildPriceIndex(defaultProducts(), [{ id: 'p', productId: 'prd_tobacco', date: '2026-01-01', packPrice: 30, packSize: 30 }]); // 1 €/g
const cost = makeCostFn({ index, settings });
const ctx = { cost, trackingStart: '2026-11-01', today: '2026-11-10' };
const rolled = (d, g) => ({ id: `r${d}${g}`, kind: 'consumption', categoryId: CAT.ROLLED, at: `${d}T10:00`, tobacco: { grams: g, method: 'auto' }, cbd: null, accessories: [] });

test('budget : postes + marge pour imprévus', () => {
  const p = newProject('travel', 5, '2026-11-01');
  p.items[0].amount = 300; p.items[1].amount = 400; p.items[2].amount = 300;
  assert.equal(projectTotal(p), 1100); // 1000 + 10 %
});

test('économies dues à la réduction + épargne déclarée, projections et échéance', () => {
  const p = newProject('move', 5, '2026-11-01'); // référence : 5 €/jour
  p.items = [{ id: 'a', label: 'Tout', amount: 3000 }]; p.buffer = 0;
  p.saved = 200;
  const entries = [];
  for (let i = 0; i < 10; i++) entries.push(rolled(addDays('2026-11-01', i), 2)); // 2 €/jour au lieu de 5
  const plan = projectPlan(p, { entries, ctx, currentPerDay: 2 });
  near(plan.fromReduction, 30); // (5 − 2) × 10 jours
  near(plan.saved, 230);
  near(plan.remaining, 2770);
  near(plan.paceMonthly, 3 * 30.44);
  assert.ok(plan.etaAtPace > '2026-11-10');
  const stop = plan.scenarios.find((s) => s.share === 1);
  near(stop.monthly, 5 * 30.44);
  p.targetDate = addDays('2026-11-10', 365);
  const plan2 = projectPlan(p, { entries, ctx, currentPerDay: 2 });
  assert.ok(plan2.deadline.neededShare > 1); // même en arrêtant, il faut épargner en plus
  assert.ok(plan2.deadline.gapMonthly > 0);
});

test('projet atteint et absence de référence', () => {
  const p = newProject('purchase', null, '2026-11-01');
  p.items[0].amount = 100; p.saved = 150;
  const plan = projectPlan(p, { entries: [], ctx, currentPerDay: null });
  assert.equal(plan.done, true);
  assert.equal(plan.progress, 1);
  assert.equal(plan.scenarios.length, 0);
});

test('référence inconnue (prix manquants) : jamais figée à 0, référence courante utilisée', () => {
  const p = newProject('purchase', 0, '2026-11-01');
  assert.equal(p.refPerDay, null);
  p.items[0].amount = 500;
  const plan = projectPlan(p, { entries: [], ctx, currentPerDay: 1, fallbackRef: 4 });
  assert.equal(plan.ref, 4);
  assert.equal(plan.refFrozen, false);
  near(plan.scenarios[2].monthly, 4 * 30.44);
});
