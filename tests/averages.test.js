import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calibrate, autoUpdates, autoEstimateFor, averagesTable, newPack, priorsOf } from '../js/domain/autoqty.js';
import { defaultSettings, defaultProducts, newProduct } from '../js/domain/models.js';
import { components, reliabilityOf } from '../js/domain/methods.js';
import { addDays } from '../js/core/dates.js';

const near = (a, b, eps = 0.011) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const settings = defaultSettings();
let n = 0;
const day = (i, h = 12) => `${addDays('2026-11-01', i)}T${String(h).padStart(2, '0')}:00`;
const joint = (at, extra = {}) => ({ id: `j${n++}`, kind: 'consumption', categoryId: 'joint', at, status: 'done', tobacco: { grams: null, method: 'auto' }, cbd: { amount: null, unit: 'g', method: 'auto', molecule: 'cbd' }, accessories: [{ type: 'slim', count: 1 }], ...extra });
const rolled = (at, paper = 'classic', extra = {}) => ({ id: `r${n++}`, kind: 'consumption', categoryId: 'rolled', at, status: 'done', tobacco: { grams: null, method: 'auto' }, cbd: null, accessories: [{ type: paper, count: 1 }], ...extra });

test('valeurs de départ distinctes : roulée classique ≠ roulée slim ≠ joint mélangé ≠ joint pur', () => {
  const p = priorsOf(settings);
  assert.notEqual(p.rolled.tobacco, p.rolledSlim.tobacco);
  assert.notEqual(p.rolled.tobacco, p.jointMix.tobacco);
  const c = calibrate([rolled(day(0)), rolled(day(0), 'slim'), joint(day(0)), joint(day(0), { tobacco: null, composition: 'cbd_pure' })], [], settings);
  const vals = [...c.quantities.values()];
  near(vals[0].tobacco, 0.3); near(vals[1].tobacco, 0.25); near(vals[2].tobacco, 0.2); near(vals[3].cbd, 0.35);
  assert.equal([...c.bases.values()][0].tobacco, 'default');
});

test('stock : 30 g achetés, stock initial et final connus, joints + roulées partagent le tabac', () => {
  const entries = [];
  for (let i = 0; i < 50; i++) entries.push(joint(day(Math.floor(i / 5), 9 + (i % 5) * 2)));
  for (let i = 0; i < 20; i++) entries.push(rolled(day(Math.floor(i / 2), 8)));
  const purchases = [
    { id: 'p1', productId: 'prd_tobacco', date: addDays('2026-11-01', 2), packPrice: 15, packSize: 30, packCount: 1 },
    { id: 'p2', productId: 'prd_cbd_flower', date: addDays('2026-11-01', 2), packPrice: 40, packSize: 5, packCount: 1 },
  ];
  const inventories = [
    { id: 'a', productId: 'prd_tobacco', at: '2026-10-31T20:00', quantity: 5, type: 'initial' },
    { id: 'b', productId: 'prd_tobacco', at: day(11, 0), quantity: 18, type: 'count' },
    { id: 'c', productId: 'prd_cbd_flower', at: '2026-10-31T20:00', quantity: 1, type: 'initial' },
    { id: 'd', productId: 'prd_cbd_flower', at: day(11, 0), quantity: 0.5, type: 'count' },
  ];
  const cal = calibrate(entries, [], settings, { products: defaultProducts(), purchases, inventories });
  // Tabac consommé : 5 + 30 − 18 = 17 g ; poids : 50 × 0,2 + 20 × 0,3 = 16 → k = 17/16
  const up = autoUpdates(entries, cal);
  const tob = up.reduce((t, e) => t + (e.tobacco?.grams || 0), 0);
  near(tob, 17, 0.3);
  const j = up.find((e) => e.categoryId === 'joint'); const r = up.find((e) => e.categoryId === 'rolled');
  near(j.tobacco.grams, 0.2 * 17 / 16); near(r.tobacco.grams, 0.3 * 17 / 16);
  assert.ok(j.tobacco.grams < r.tobacco.grams, 'le tabac n’est pas attribué en totalité aux joints');
  // CBD : 1 + 5 − 0,5 = 5,5 g pour 50 joints → 0,11 g
  near(j.cbd.amount, 0.11);
  assert.equal(j.tobacco.basis, 'segment');
  assert.equal(reliabilityOf(components(j)[0]), 'calculated');
});

test('consommation partielle : une demi-roulée pèse la moitié', () => {
  const entries = [rolled(day(0)), rolled(day(0), 'classic', { usedFraction: 0.5, completion: 'partial' })];
  const pack = { ...newPack({ productId: 'prd_tobacco', kind: 'tobacco', size: 0.9, openedAt: '2026-10-31T20:00' }), finishedAt: day(1) };
  const up = autoUpdates(entries, calibrate(entries, [pack], settings));
  near(up[0].tobacco.grams, 0.6); near(up[1].tobacco.grams, 0.3);
});

test('vape : aucune quantité générique ; ml par session calculés depuis un flacon terminé', () => {
  const liq = newProduct('liquid', { id: 'liq', nicotineMgPerMl: 6 });
  const s = { ...settings, defaultProducts: { ...settings.defaultProducts, liquid: 'liq' } };
  const vape = (at) => ({ id: `v${n++}`, kind: 'consumption', categoryId: 'vape', at, status: 'done', liquid: { ml: null, method: 'auto', productId: 'liq' }, accessories: [] });
  const one = vape(day(0));
  assert.equal(autoEstimateFor(one, 'liquid', s, calibrate([one], [], s)), null, 'données insuffisantes : pas de valeur inventée');
  const list = Array.from({ length: 20 }, (_, i) => vape(day(Math.floor(i / 4), 10 + (i % 4))));
  const bottle = { ...newPack({ productId: 'liq', kind: 'liquid', size: 10, openedAt: '2026-10-31T20:00' }), finishedAt: day(6) };
  const cal = calibrate(list, [bottle], s, { products: [liq] });
  near(cal.factors.liquid, 0.5);
  const up = autoUpdates(list, cal);
  near(up[0].liquid.ml, 0.5);
  assert.equal(autoEstimateFor(vape(day(8)), 'liquid', s, cal).basis, 'product');
});

test('TEST 5 — moyennes pesées et estimées calculées séparément, fiabilité indiquée', () => {
  const entries = [
    rolled(day(0), 'classic', { tobacco: { grams: 0.4, method: 'weighed' } }),
    rolled(day(0), 'classic', { tobacco: { grams: 0.5, method: 'weighed' } }),
    rolled(day(1), 'classic', { tobacco: { grams: 0.3, method: 'estimated' } }),
    rolled(day(1)),
  ];
  const cal = calibrate(entries, [], settings);
  const done = entries.map((e) => autoUpdates([e], cal)[0] || e);
  const row = averagesTable(done, settings, cal).find((r) => r.key === 'rolled');
  near(row.weighedAvg, 0.45); assert.equal(row.weighedN, 2);
  near(row.estimatedAvg, 0.3); assert.equal(row.estimatedN, 1);
  assert.equal(row.provisional, 1);
  assert.equal(row.current, null, 'pas de valeur calculée sans repère');
  assert.equal(reliabilityOf(components(done[3])[0]), 'provisional');
  assert.equal(reliabilityOf({ amount: null, method: null }), 'unknown');
});
