import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beforeMonthly, beforeSavings, currentMonthly, DAYS_PER_MONTH } from '../js/domain/before.js';
import { defaultSettings, defaultProducts, CAT } from '../js/domain/models.js';
import { buildPriceIndex, makeCostFn } from '../js/domain/costs.js';

const near = (a, b, eps = 0.02) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const settings = defaultSettings();
const index = buildPriceIndex(defaultProducts(), [{ id: 'p', productId: 'prd_tobacco', date: '2026-01-01', packPrice: 15, packSize: 30 }]); // 0,50 €/g
const cost = makeCostFn({ index, settings });
const ctx = { cost, trackingStart: '2026-11-01', today: '2026-11-10' };
const rolled = (d, g) => ({ id: `r${d}${g}`, kind: 'consumption', categoryId: CAT.ROLLED, at: `${d}T10:00`, tobacco: { grams: g, method: 'auto' }, cbd: null, accessories: [] });

const before = { tobaccoPacksPerMonth: 4, tobaccoPackPrice: 15, tobaccoPackSize: 30, cbdGramsPerMonth: 10, cbdPricePerGram: 6, accessoriesPerMonth: 5, startDate: '2026-11-01' };

test('budget mensuel « avant » : paquets × prix + grammes × prix + accessoires', () => {
  const m = beforeMonthly(before);
  assert.equal(m.tobacco, 60);
  assert.equal(m.cbd, 60);
  assert.equal(m.total, 125);
  near(m.perDay, 125 / DAYS_PER_MONTH, 1e-9);
  assert.equal(m.tobaccoGramsPerMonth, 120);
  assert.equal(beforeMonthly({}), null);
});

test('économies en direct : attendu − réel, journée en cours au prorata', () => {
  const entries = [];
  for (let i = 1; i <= 9; i++) entries.push(rolled(`2026-11-0${i}`, 2)); // 1 €/jour réel
  const s = beforeSavings(before, entries, ctx, 0.5);
  near(s.days, 9.5);
  near(s.expected, (125 / DAYS_PER_MONTH) * 9.5);
  near(s.actual, 9);
  near(s.saved, (125 / DAYS_PER_MONTH) * 9.5 - 9);
  near(s.expectedTobaccoGrams, (120 / DAYS_PER_MONTH) * 9.5);
  const cur = currentMonthly(entries, ctx, 14);
  near(cur.total, (9 / 10) * DAYS_PER_MONTH);
});

test('pas de comparaison sans déclaration ni début de suivi', () => {
  assert.equal(beforeSavings(null, [], ctx), null);
  assert.equal(beforeSavings(before, [], { ...ctx, trackingStart: null, today: '2026-10-01' }), null);
});
