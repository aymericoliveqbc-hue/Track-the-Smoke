import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, defaultProducts, newProduct } from '../js/domain/models.js';
import { buildPriceIndex, makeCostFn, entryCost, puffActualFactors } from '../js/domain/costs.js';
import { summarize } from '../js/domain/stats.js';
import { computeStock, productFinance } from '../js/domain/stock.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const settings = { ...defaultSettings() };
const liquid = newProduct('liquid', { id: 'liq', name: 'Menthe', nicotineMgPerMl: 6 });
const cigs = newProduct('cigarettes', { id: 'cig', name: 'Blondes', nicotinePerUnit: 0.8 });
const puff = newProduct('puff', { id: 'pf', name: 'Puff 600', puffType: 'disposable' });
const thc = newProduct('cbd', { id: 'thc1', name: 'Fleurs THC', molecule: 'thc' });
const products = [...defaultProducts(), liquid, cigs, puff, thc];
const purchases = [
  { id: 'a', productId: 'liq', date: '2026-11-01', packPrice: 6, packSize: 10, packCount: 1 },       // 0,60 €/ml
  { id: 'b', productId: 'cig', date: '2026-11-01', packPrice: 12, packSize: 20, packCount: 1 },      // 0,60 €/cig
  { id: 'c', productId: 'pf', date: '2026-11-01', packPrice: 9, packSize: 600, packCount: 1 },       // 0,015 €/bouffée annoncée
  { id: 'd', productId: 'prd_tobacco', date: '2026-11-01', packPrice: 15, packSize: 30, packCount: 1 },
  { id: 'e', productId: 'prd_cbd_flower', date: '2026-11-01', packPrice: 50, packSize: 10, packCount: 1 },
  { id: 'f', productId: 'thc1', date: '2026-11-01', packPrice: 100, packSize: 10, packCount: 1 },
];
const index = buildPriceIndex(products, purchases);
const cost = makeCostFn({ index, settings });
const ctx = { cost, trackingStart: '2026-11-01', today: '2026-11-12' };
const E = (id, cat, extra) => ({ id, kind: 'consumption', categoryId: cat, at: '2026-11-10T10:00', status: 'done', accessories: [], ...extra });

test('TEST 2 — vape : 10 ml à 6 mg/ml ; coût et nicotine CONTENUE', () => {
  const e = E('v', 'vape', { liquid: { ml: 2.5, method: 'estimated', productId: 'liq' } });
  const c = cost(e);
  near(c.liquid, 1.5);
  near(c.nicotineMg, 15);
  const s = summarize([e], { start: '2026-11-10', end: '2026-11-10' }, ctx);
  near(s.liquid.total, 2.5);
  near(s.nicotineMg, 15);
  assert.equal(s.tobacco.total, 0);
});

test('cigarette industrielle partielle : 0,5 cigarette comptée, jamais une entière', () => {
  const e = E('c', 'cigarette', { units: { count: 0.5, productId: 'cig', method: 'counted' }, completion: 'partial' });
  near(cost(e).cigarettes, 0.3);
  near(cost(e).nicotineMg, 0.4);
  const s = summarize([e], { start: '2026-11-10', end: '2026-11-10' }, ctx);
  near(s.units.cigarettes, 0.5);
});

test('TEST 3 — puffs : bouffées seules et sessions sans doublon ; coût annoncé puis réel', () => {
  const list = [
    E('p1', 'puff', { puffs: { count: 1, productId: 'pf', mode: 'single' } }),
    E('p2', 'puff', { puffs: { count: 12, productId: 'pf', mode: 'session' } }),
    E('p3', 'puff', { puffs: { count: 5, productId: 'pf', mode: 'multi' } }),
  ];
  const s = summarize(list, { start: '2026-11-10', end: '2026-11-10' }, ctx);
  assert.equal(s.puffs, 18);
  near(cost(list[1]).puffs, 12 * 0.015);
  assert.deepEqual(cost(list[1]).estimatedParts, ['bouffées']);
  // Puff terminée après 450 bouffées réelles : prix réel = 9 € / 450
  const finished = { ...puff, openedAt: '2026-11-01T00:00', finishedAt: '2026-11-11T00:00' };
  const many = Array.from({ length: 45 }, (_, i) => E(`q${i}`, 'puff', { puffs: { count: 10, productId: 'pf', mode: 'session' } }));
  const f = puffActualFactors([finished], purchases, many);
  near(f.get('pf'), 600 / 450);
  const c2 = entryCost(many[0], { index: buildPriceIndex([...defaultProducts(), finished], purchases), settings, puffActual: f });
  near(c2.puffs, 10 * (9 / 450));
  assert.deepEqual(c2.estimatedParts, []);
});

test('TEST 1 — joints tabac+CBD, CBD pur et roulée : tabac, CBD et THC jamais confondus', () => {
  const list = [
    E('j1', 'joint', { composition: 'tobacco_cbd', tobacco: { grams: 0.2, method: 'estimated' }, cbd: { amount: 0.15, unit: 'g', method: 'estimated', molecule: 'cbd' } }),
    E('j2', 'joint', { composition: 'cbd_pure', cbd: { amount: 0.4, unit: 'g', method: 'estimated', molecule: 'cbd' } }),
    E('j3', 'joint', { composition: 'tobacco_thc', tobacco: { grams: 0.2, method: 'estimated' }, cbd: { amount: 0.1, unit: 'g', method: 'estimated', molecule: 'thc', productId: 'thc1' } }),
    E('j4', 'joint', { composition: 'resin_cbd', cbd: { amount: 0.1, unit: 'g', method: 'estimated', molecule: 'unknown', form: 'resin' }, extra: [{ id: 'x', amount: 0.2, unit: 'g', method: 'estimated', molecule: 'cbd', form: 'flower' }] }),
    E('r1', 'rolled', { tobacco: { grams: 0.3, method: 'estimated' } }),
  ];
  const s = summarize(list, { start: '2026-11-10', end: '2026-11-10' }, ctx);
  near(s.tobacco.total, 0.7);
  near(s.cbd.total, 0.75);   // 0,15 + 0,4 + 0,2 (ingrédient supplémentaire)
  near(s.thc.total, 0.1);
  near(s.unknownCannabis.total, 0.1);
  near(cost(list[2]).thc, 1);
  near(cost(list[2]).cbd ?? 0, 0);
  assert.equal(s.counts.byCategory.joint, 4);
});

test('TEST 4 — stock : initial + achats + ajustements − consommations − pertes', () => {
  const tob = products.find((p) => p.id === 'prd_tobacco');
  const inventories = [
    { id: 'i0', productId: 'prd_tobacco', at: '2026-11-01T00:00', quantity: 10, type: 'initial' },
    { id: 'i1', productId: 'prd_tobacco', at: '2026-11-05T12:00', quantity: 2, type: 'adjust' },
    { id: 'i2', productId: 'prd_tobacco', at: '2026-11-06T12:00', quantity: 1.5, type: 'loss' },
  ];
  const entries = [E('r', 'rolled', { tobacco: { grams: 0.5, method: 'estimated' }, at: '2026-11-04T10:00' }), E('r2', 'rolled', { tobacco: { grams: 0.25, method: 'weighed' }, at: '2026-11-07T10:00' })];
  const st = computeStock(tob, { purchases: [purchases[3]], inventories, entries, settings: { ...settings, stock: { enabled: true, since: '2026-11-01' } } }, '2026-11-12');
  // 10 + 30 (achat du 01) + 2 − 0,5 − 1,5 − 0,25
  near(st.quantity, 39.75);
  near(st.losses, 1.5);
  // Correction manuelle (compte réel) : remplace le calcul à partir de ce moment
  const st2 = computeStock(tob, { purchases: [purchases[3]], inventories: [...inventories, { id: 'i3', productId: 'prd_tobacco', at: '2026-11-08T09:00', quantity: 37, type: 'count' }], entries, settings }, '2026-11-12');
  near(st2.quantity, 37);
  const fin = productFinance(tob, [purchases[3], { id: 'z', productId: 'prd_tobacco', date: '2026-11-09', packPrice: 18, packSize: 30, packCount: 1 }], 37);
  near(fin.spent, 33);
  near(fin.avgUnitPrice, 33 / 60);
  near(fin.stockValue, 37 * 33 / 60);
});

import { dailyCostProfile, stopMethodsScenario, reductionScenario, projectSavings } from '../js/domain/simulator.js';
test('TEST 7 — simulateur : arrêt d’une méthode, de plusieurs, réduction (historique réel)', () => {
  const list = [];
  for (let d = 1; d <= 10; d++) {
    const day = `2026-11-${String(d).padStart(2, '0')}`;
    list.push(E(`v${d}`, 'vape', { at: `${day}T10:00`, liquid: { ml: 2, method: 'estimated', productId: 'liq' } }));        // 1,20 €
    list.push(E(`c${d}`, 'cigarette', { at: `${day}T12:00`, units: { count: 2, productId: 'cig', method: 'counted' } }));   // 1,20 €
  }
  const p = dailyCostProfile(list, { start: '2026-11-01', end: '2026-11-10' }, { ...ctx, trackingStart: '2026-11-01', today: '2026-11-10' });
  near(p.total, 2.4);
  near(stopMethodsScenario(p, ['cigarette']).saving, 1.2);
  near(stopMethodsScenario(p, ['cigarette', 'vape']).remaining, 0);
  near(reductionScenario(p, 0.1).saving, 0.24);
  near(projectSavings(reductionScenario(p, 0.25)).find((h) => h.days === 30).amount, 0.6 * 30);
});
