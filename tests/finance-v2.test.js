import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, defaultProducts, newProduct } from '../js/domain/models.js';
import { buildPriceIndex, makeCostFn } from '../js/domain/costs.js';
import { financeOverview, budgetSplit, costByProduct, realizedWindows, avoidedSinceQuit, weekSplit, mostUsedMethod } from '../js/domain/finance.js';
import { summarize, measures } from '../js/domain/stats.js';
import { allocations, projectPlan, newProject } from '../js/domain/projects.js';
import { methodJourney, measureMetric } from '../js/domain/goals.js';
import { sleepPairs } from '../js/domain/sleep.js';
import { addDays } from '../js/core/dates.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const settings = defaultSettings();
const cig = newProduct('cigarettes', { id: 'cig' });
const liq = newProduct('liquid', { id: 'liq', nicotineMgPerMl: 6 });
const products = [...defaultProducts(), cig, liq];
const purchases = [
  { id: 'a', productId: 'cig', date: '2026-10-01', packPrice: 12, packSize: 20, packCount: 1 },
  { id: 'b', productId: 'liq', date: '2026-10-01', packPrice: 6, packSize: 10, packCount: 1 },
];
const index = buildPriceIndex(products, purchases);
const cost = makeCostFn({ index, settings });
const ctx = { cost, trackingStart: '2026-11-01', today: '2026-11-20' };
const E = (id, cat, at, extra) => ({ id, kind: 'consumption', categoryId: cat, at, status: 'done', accessories: [], ...extra });
const entries = [];
for (let i = 0; i < 20; i++) {
  const d = addDays('2026-11-01', i);
  // 2 cigarettes/jour avant le 11, puis arrêt ; vape 1 ml/jour
  if (d < '2026-11-11') entries.push(E(`c${i}a`, 'cigarette', `${d}T09:00`, { units: { count: 1, productId: 'cig', method: 'counted' } }), E(`c${i}b`, 'cigarette', `${d}T15:00`, { units: { count: 1, productId: 'cig', method: 'counted' } }));
  entries.push(E(`v${i}`, 'vape', `${d}T20:00`, { liquid: { ml: 1, method: 'estimated', productId: 'liq' } }));
}

test('TEST 7 — finance : dépenses, coût par méthode et par produit, ventilation', () => {
  const f = financeOverview(entries, ctx);
  near(f.today, 0.6);
  near(f.week, 7 * 0.6);
  near(f.avgDaily, (10 * 1.2 + 20 * 0.6) / 20);
  const s = summarize(entries, { start: '2026-11-01', end: '2026-11-20' }, ctx);
  near(s.cost.byCategory.cigarette, 12);
  near(s.cost.byCategory.vape, 12);
  assert.deepEqual(budgetSplit(s).map((x) => x.id).sort(), ['cigarettes', 'liquid']);
  const byP = costByProduct(entries, { start: '2026-11-01', end: '2026-11-20' }, ctx, { index, settings });
  near(byP.find((x) => x.productId === 'cig').qty, 20);
  near(byP.find((x) => x.productId === 'liq').cost, 12);
});

test('économies réalisées (fenêtres) vs dépenses évitées après arrêt : distinctes', () => {
  const before = { tobaccoPacksPerMonth: 3, tobaccoPackPrice: 12.176, startDate: '2026-11-01' }; // ≈ 36,53 €/mois ≈ 1,20 €/jour
  const w = realizedWindows(before, entries, ctx, 1);
  const w7 = w.find((x) => x.days === 7);
  assert.equal(w7.partial, false);
  near(w7.saved, (3 * 12.176 / 30.44) * 7 - 7 * 0.6, 1e-6);
  assert.equal(w.find((x) => x.days === 30).partial, true, 'fenêtre plus longue que le suivi : signalée');
  const av = avoidedSinceQuit('cigarette', '2026-11-11', entries, ctx);
  near(av.refPerDay, 1.2); near(av.refCountPerDay, 2);
  assert.equal(av.days, 10);
  near(av.avoidedCost, 12); near(av.avoidedCount, 20);
  assert.equal(avoidedSinceQuit('vape', '2026-11-01', entries, ctx).insufficient, true, 'pas de données avant l’arrêt : rien d’inventé');
});

test('méthode la plus utilisée, semaine vs week-end, parcours par méthode sans remise à zéro', () => {
  const mu = mostUsedMethod(entries, { start: '2026-11-01', end: '2026-11-20' }, ctx);
  assert.equal(mu.top, 'cigarette');
  const ws = weekSplit(entries, { start: '2026-11-01', end: '2026-11-20' }, ctx, measures.count);
  assert.ok(ws.weekday != null && ws.weekend != null);
  const withSlip = [...entries, E('slip', 'cigarette', '2026-11-15T22:00', { units: { count: 1, productId: 'cig', method: 'counted' } })];
  const j = methodJourney('cigarette', { mode: 'quit', quitDate: '2026-11-11' }, withSlip, ctx, '2026-11-20T21:00');
  assert.equal(j.quit.days, 10); assert.equal(j.quit.daysWithout, 9); assert.equal(j.quit.occurrences, 1); assert.equal(j.quit.bestStreak, 5);
  near(measureMetric('method:vape', entries, { start: '2026-11-14', end: '2026-11-20' }, ctx).value, 1);
});

test('projets : allocations ≤ 100 %, jamais de double comptage', () => {
  const a = newProject('travel', 2, '2026-11-01'); a.allocation = 70; a.items = [{ amount: 500 }]; a.buffer = 0;
  const b = newProject('purchase', 2, '2026-11-01'); b.allocation = 60; b.items = [{ amount: 300 }];
  const c = newProject('savings', 2, '2026-11-01'); c.items = [{ amount: 1000 }];
  const al = allocations([a, b, c]);
  assert.equal(al.get(a.id), 70); assert.equal(al.get(b.id), 30); assert.equal(al.get(c.id), 0);
  const shared = () => ({ amount: 100, days: 20 });
  const total = [a, b, c].reduce((t, p) => t + projectPlan(p, { entries, ctx, currentPerDay: 1, sharedSavings: shared, share: al.get(p.id) }).fromReduction, 0);
  near(total, 100);
  const d = newProject('other', null, '2026-11-01'); d.items = []; d.target = 250; d.saved = 50;
  near(projectPlan(d, { entries, ctx, currentPerDay: 1 }).total, 250);
});

test('sommeil comparé à n’importe quelle méthode (soir)', () => {
  const nights = [{ date: '2026-11-05', latencyMin: 30, quality: 3 }];
  const pts = sleepPairs(nights, entries, { start: '2026-11-01', end: '2026-11-20' }, 'eveningCat:vape', 'latency');
  assert.equal(pts[0].x, 1); assert.equal(pts[0].y, 30);
});
