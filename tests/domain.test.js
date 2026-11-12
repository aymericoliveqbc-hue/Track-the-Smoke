import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseDecimal, parseQuantity, round2, fmtMoney, fmtGrams } from '../js/core/format.js';
import { addDays, diffDays, periodRange, previousRange, weekday, minutesFromNoon, daysBetween, endOfMonth } from '../js/core/dates.js';
import { defaultSettings, defaultProducts, normalizeAccessories, CAT } from '../js/domain/models.js';
import { unitPrice, buildPriceIndex, priceAt, entryCost, purchaseTotal, makeCostFn } from '../js/domain/costs.js';
import { summarize, variation, dailySeries, measures, jointAnalysis, coverage } from '../js/domain/stats.js';
import { cravingStats } from '../js/domain/cravings.js';
import { computeNight, nightContext, pearson, describeCorrelation } from '../js/domain/sleep.js';
import { dailyCostProfile, scenarios, projectSavings } from '../js/domain/simulator.js';
import { computeBaseline, targetAt, evaluateGoal, journeyStats, reviseGoal, newGoal } from '../js/domain/goals.js';
import { computeStock } from '../js/domain/stock.js';
import { buildExport, validateImport, mergeData, entriesToCSV } from '../js/domain/backup.js';
import { buildDemoData } from '../js/domain/demo.js';
import { generateInsights, peakWindow } from '../js/domain/insights.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

/* ---------------- Jeu de données de référence ---------------- */

function fixture() {
  const settings = defaultSettings();
  const products = defaultProducts();
  const purchases = [
    { id: 'p1', productId: 'prd_tobacco', date: '2026-11-01', packPrice: 15, packSize: 30, packCount: 1 }, // 0,50 €/g
    { id: 'p2', productId: 'prd_cbd_flower', date: '2026-11-01', packPrice: 50, packSize: 10, packCount: 1 }, // 5 €/g
    { id: 'p3', productId: 'prd_slim', date: '2026-11-01', packPrice: 1.6, packSize: 32, packCount: 1 }, // 0,05 €
    { id: 'p4', productId: 'prd_classic', date: '2026-11-01', packPrice: 1, packSize: 50, packCount: 1 }, // 0,02 €
    { id: 'p5', productId: 'prd_filter', date: '2026-11-01', packPrice: 1.2, packSize: 120, packCount: 1 }, // 0,01 €
  ];
  const index = buildPriceIndex(products, purchases);
  const ctxBase = { index, settings, products };
  const cost = makeCostFn(ctxBase);
  return { settings, products, purchases, index, cost, ctx: { cost, trackingStart: '2026-11-01', today: '2026-11-14' } };
}

const joint = (at, tg, cg, extra = {}) => ({
  id: 'j' + at + tg, kind: 'consumption', categoryId: CAT.JOINT, at,
  tobacco: { grams: tg, method: 'weighed', productId: null },
  cbd: { amount: cg, unit: 'g', method: 'weighed', productId: null },
  accessories: [{ type: 'slim', count: 1 }, { type: 'filter', count: 1 }], ...extra,
});
const rolled = (at, tg, extra = {}) => ({
  id: 'r' + at + tg, kind: 'consumption', categoryId: CAT.ROLLED, at,
  tobacco: { grams: tg, method: 'estimated', productId: null }, cbd: null,
  accessories: [{ type: 'classic', count: 1 }], ...extra,
});

/* ---------------- Format & dates ---------------- */

test('analyse des décimales françaises', () => {
  assert.equal(parseDecimal('0,22'), 0.22);
  assert.equal(parseDecimal(' 1 250,5 '), 1250.5);
  assert.equal(parseDecimal('abc'), null);
  assert.equal(parseDecimal(''), null);
  assert.equal(parseQuantity('0,225'), 0.23);
  assert.equal(parseQuantity('-1'), null);
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.match(fmtMoney(1.5), /1,50\s€/);
  assert.match(fmtGrams(0.22), /0,22\sg/);
});

test('arithmétique des jours indépendante de l’heure d’été', () => {
  assert.equal(addDays('2026-03-28', 2), '2026-03-30');
  assert.equal(addDays('2026-10-24', 3), '2026-10-27');
  assert.equal(diffDays('2026-02-27', '2026-03-01'), 2);
  assert.equal(weekday('2026-11-09'), 0); // lundi
  assert.equal(endOfMonth('2028-02-10'), '2028-02-29');
  assert.equal(daysBetween('2026-12-30', '2027-01-02').length, 4);
  const r = periodRange('7d', '2026-11-14');
  assert.deepEqual([r.start, r.end, r.days], ['2026-11-08', '2026-11-14', 7]);
  const p = previousRange(r);
  assert.deepEqual([p.start, p.end], ['2026-11-01', '2026-11-07']);
  assert.equal(minutesFromNoon('22:30'), 630);
  assert.equal(minutesFromNoon('01:00'), 780);
});

/* ---------------- Coûts ---------------- */

test('prix au gramme et prix unitaire', () => {
  near(unitPrice(15, 30), 0.5);
  assert.equal(unitPrice(15, 0), null);
  assert.equal(unitPrice(null, 30), null);
  assert.equal(purchaseTotal({ packPrice: 14.5, packCount: 2 }), 29);
});

test('SCÉNARIO 1 — joint 0,22 g tabac + 0,16 g CBD + slim + filtre', () => {
  const { cost } = fixture();
  const c = cost(joint('2026-11-12T08:45', 0.22, 0.16));
  near(c.tobacco, 0.11);
  near(c.cbd, 0.8);
  near(c.accessories, 0.06);
  near(c.total, 0.97);
  assert.equal(c.complete, true);
});

test('SCÉNARIO 2 — roulée 0,25 g, aucun CBD comptabilisé', () => {
  const { cost, ctx } = fixture();
  const e = rolled('2026-11-12T14:20', 0.25);
  const c = cost(e);
  assert.equal(c.cbd, null);
  near(c.total, 0.125 + 0.02);
  const s = summarize([e], { start: '2026-11-12', end: '2026-11-12' }, ctx);
  assert.equal(s.cbd.total, 0);
  assert.equal(s.cbd.lines, 0);
  near(s.tobacco.total, 0.25);
  assert.equal(s.counts.rolled, 1);
  assert.equal(s.counts.joint, 0);
});

test('accessoires jamais comptés deux fois', () => {
  const acc = normalizeAccessories([{ type: 'slim', count: 1 }, { type: 'slim', count: 1 }, { type: 'filter', count: 1 }]);
  assert.equal(acc.length, 2);
  const { cost } = fixture();
  const c = cost(joint('2026-11-12T08:45', 0.2, 0.1, { accessories: [{ type: 'slim', count: 1 }, { type: 'slim', count: 1 }] }));
  near(c.accessories, 0.05);
});

test('donnée manquante : coût incomplet, jamais inventé', () => {
  const { cost } = fixture();
  const c = cost(joint('2026-11-12T08:45', null, 0.16));
  assert.equal(c.tobacco, null);
  assert.equal(c.complete, false);
  assert.ok(c.missing.includes('quantité de tabac'));
  near(c.total, 0.8 + 0.06);
});

test('prix inconnu : coût incomplet', () => {
  const settings = defaultSettings();
  const products = defaultProducts();
  const index = buildPriceIndex(products, []);
  const c = entryCost(rolled('2026-11-12T10:00', 0.25), { index, settings });
  assert.equal(c.complete, false);
  assert.equal(c.total, 0);
});

test('historique des prix : le tarif en vigueur à la date est appliqué', () => {
  const products = defaultProducts();
  const purchases = [
    { id: 'a', productId: 'prd_tobacco', date: '2026-10-01', packPrice: 12, packSize: 30 },
    { id: 'b', productId: 'prd_tobacco', date: '2026-11-05', packPrice: 15, packSize: 30 },
  ];
  const index = buildPriceIndex(products, purchases);
  near(priceAt(index, 'prd_tobacco', '2026-10-20').price, 0.4);
  near(priceAt(index, 'prd_tobacco', '2026-11-05').price, 0.5);
  near(priceAt(index, 'prd_tobacco', '2026-09-01').price, 0.4); // avant tout achat : premier prix connu
});

test('unités CBD incompatibles signalées', () => {
  const { index, settings } = fixture();
  const e = { id: 'x', kind: 'consumption', categoryId: CAT.CBD, at: '2026-11-12T22:00', tobacco: null,
    cbd: { amount: 4, unit: 'drop', productId: 'prd_cbd_flower' }, accessories: [] };
  const c = entryCost(e, { index, settings });
  assert.equal(c.complete, false);
  assert.equal(c.cbd, null);
});

/* ---------------- Envies ---------------- */

test('SCÉNARIO 3 — envie 8/10 résistée avant de dormir, sans consommation', () => {
  const { ctx } = fixture();
  const craving = { id: 'c1', kind: 'craving', at: '2026-11-12T23:30', intensity: 8, product: 'both', trigger: 'bedtime', outcome: 'resisted', durationMin: 10 };
  const range = { start: '2026-11-12', end: '2026-11-12' };
  const s = summarize([craving], range, ctx);
  assert.equal(s.counts.total, 0);
  assert.equal(s.cravings.resisted, 1);
  assert.equal(s.cost.total, 0);
  const cs = cravingStats([craving], range, ctx);
  assert.equal(cs.resisted, 1);
  assert.equal(cs.avgIntensity.value, 8);
  assert.equal(cs.topTriggers[0].id, 'bedtime');
});

/* ---------------- Statistiques ---------------- */

test('SCÉNARIO 4 — comparaison de deux périodes de 7 jours', () => {
  const { ctx } = fixture();
  const entries = [
    joint('2026-11-03T20:00', 0.2, 0.2), joint('2026-11-04T20:00', 0.2, 0.2), rolled('2026-11-05T09:00', 0.3),
    joint('2026-11-10T20:00', 0.2, 0.1), rolled('2026-11-12T09:00', 0.2),
  ];
  const cur = summarize(entries, { start: '2026-11-08', end: '2026-11-14' }, ctx);
  const prev = summarize(entries, { start: '2026-11-01', end: '2026-11-07' }, ctx);
  near(cur.tobacco.total, 0.4);
  near(prev.tobacco.total, 0.7);
  near(cur.cbd.total, 0.1);
  near(prev.cbd.total, 0.4);
  const v = variation(cur.tobacco.total, prev.tobacco.total);
  near(v.pct, -3 / 7);
  assert.ok(cur.cost.total < prev.cost.total);
});

test('pesé / estimé distingués et filtrables', () => {
  const { ctx } = fixture();
  const entries = [joint('2026-11-10T20:00', 0.2, 0.1), rolled('2026-11-10T09:00', 0.3)];
  const range = { start: '2026-11-10', end: '2026-11-10' };
  const all = summarize(entries, range, ctx);
  near(all.tobacco.weighed, 0.2);
  near(all.tobacco.estimated, 0.3);
  const w = summarize(entries, range, ctx, { method: 'weighed' });
  near(w.tobacco.total, 0.2);
});

test('aucun zéro fictif avant le début du suivi', () => {
  const { ctx } = fixture();
  const series = dailySeries([], { start: '2026-10-29', end: '2026-11-02' }, ctx, measures.tobaccoGrams);
  assert.deepEqual(series.map((p) => p.value), [null, null, null, 0, 0]);
  assert.equal(coverage({ start: '2026-10-01', end: '2026-10-20' }, '2026-11-01', '2026-11-14'), null);
  const s = summarize([], { start: '2026-10-01', end: '2026-10-20' }, ctx);
  assert.equal(s.coverage, null);
});

test('analyse des joints avec nombre d’observations', () => {
  const { ctx } = fixture();
  const entries = [joint('2026-11-10T20:00', 0.2, 0.1), joint('2026-11-11T21:00', null, 0.3)];
  const a = jointAnalysis(entries, { start: '2026-11-01', end: '2026-11-14' }, ctx);
  assert.equal(a.count, 2);
  assert.equal(a.avgTobacco.n, 1);
  near(a.avgTobacco.value, 0.2);
  assert.equal(a.avgCbd.n, 2);
  near(a.avgCbd.value, 0.2);
  assert.equal(a.avgCost.n, 1); // seul le joint complet est utilisé
});

test('SCÉNARIO 7 — modification : statistiques et coûts recalculés', () => {
  const f = fixture();
  const e = joint('2026-11-12T08:45', 0.22, 0.16);
  const range = { start: '2026-11-12', end: '2026-11-12' };
  const before = summarize([e], range, f.ctx);
  const edited = { ...e, tobacco: { ...e.tobacco, grams: 0.3 }, updatedAt: 'v2' };
  const after = summarize([edited], range, f.ctx);
  near(before.tobacco.total, 0.22);
  near(after.tobacco.total, 0.3);
  near(after.cost.total - before.cost.total, 0.08 * 0.5);
});

/* ---------------- Sommeil ---------------- */

test('SCÉNARIO 5 — nuit difficile : 4 h pour s’endormir', () => {
  const n = { date: '2026-11-11', bedTime: '23:00', tryTime: '23:15', latencyMin: 240, wakeTime: '08:00' };
  const c = computeNight(n);
  assert.equal(c.latencyMin, 240);
  assert.equal(c.asleepTime, '03:15');
  assert.equal(c.totalSleepMin, 285);
  const entries = [
    joint('2026-11-11T21:00', 0.2, 0.15), rolled('2026-11-11T10:00', 0.3),
    { id: 'c', kind: 'craving', at: '2026-11-12T01:30', intensity: 7, outcome: 'resisted' },
  ];
  const ctx = nightContext(n, entries);
  assert.equal(ctx.day.count, 2);
  near(ctx.evening.cbd, 0.15);
  near(ctx.evening.tobacco, 0.2);
  assert.equal(ctx.nightCravings, 1);
});

test('nuit calculée à partir des heures', () => {
  const c = computeNight({ bedTime: '22:30', tryTime: '23:00', asleepTime: '23:40', wakeTime: '07:10' });
  assert.equal(c.latencyMin, 40);
  assert.equal(c.totalSleepMin, 450);
});

test('corrélation : formulation prudente et seuil minimal', () => {
  const r = pearson([1, 2, 3], [2, 4, 6]);
  near(r.r, 1);
  assert.match(describeCorrelation(r, 'a', 'b'), /Pas assez/);
  const r2 = pearson([1, 2, 3, 4, 5, 6, 7, 8], [2, 4, 5, 8, 10, 12, 13, 17]);
  const txt = describeCorrelation(r2, 'le CBD du soir', 'le temps d’endormissement');
  assert.match(txt, /pas d'une relation de cause à effet/);
});

/* ---------------- Simulateur ---------------- */

test('SCÉNARIO 6 — réduction de 25 % basée sur l’historique', () => {
  const f = fixture();
  const entries = [];
  for (let i = 0; i < 10; i++) {
    const d = addDays('2026-11-05', i);
    entries.push(joint(`${d}T20:00`, 0.2, 0.2), rolled(`${d}T09:00`, 0.3));
  }
  const ctx = { ...f.ctx, trackingStart: '2026-11-05' };
  const p = dailyCostProfile(entries, { start: '2026-11-05', end: '2026-11-14' }, ctx);
  // par jour : tabac 0,5 g × 0,5 = 0,25 ; CBD 0,2 × 5 = 1 ; acc. joint 0,06 ; acc. roulée 0,02
  near(p.total, 1.33);
  const sc = scenarios(p);
  const r25 = sc.find((s) => s.id === 'r25');
  near(r25.saving, 1.33 * 0.25);
  const month = projectSavings(r25).find((h) => h.days === 30);
  near(month.amount, 1.33 * 0.25 * 30);
  const noTob = sc.find((s) => s.id === 'noTobacco');
  near(noTob.saving, 0.25 + 0.02);
  near(sc.find((s) => s.id === 'none').saving, 1.33);
});

/* ---------------- Objectifs ---------------- */

test('référence, paliers et parcours sans remise à zéro', () => {
  const f = fixture();
  const entries = [];
  for (let i = 0; i < 7; i++) entries.push(rolled(`${addDays('2026-11-01', i)}T09:00`, 0.4));
  // arrêt le 10, une consommation ponctuelle le 12
  entries.push(rolled('2026-11-12T18:00', 0.3));
  const baseline = computeBaseline(entries, { start: '2026-11-01', end: '2026-11-07' }, f.ctx);
  near(baseline.tobaccoPerDay, 0.4);
  near(baseline.rolledPerDay, 1);
  const js = journeyStats('tobacco', { status: 'stopped', quitDate: '2026-11-10' }, entries, f.ctx, baseline, '2026-11-14T12:00');
  assert.equal(js.quit.days, 5);
  assert.equal(js.quit.daysWithout, 4);
  assert.equal(js.quit.occurrences, 1);
  near(js.quit.avoidedQty, 0.4 * 5 - 0.3);
  assert.ok(js.quit.avoidedCost > 0);

  const g = { ...newGoal('tobacco_g', 0.1, '2026-11-08'), steps: [{ date: '2026-11-08', target: 0.3 }, { date: '2026-11-20', target: 0.2 }] };
  assert.equal(targetAt(g, '2026-11-10'), 0.3);
  assert.equal(targetAt(g, '2026-11-25'), 0.2);
  const ev = evaluateGoal(g, entries, f.ctx, baseline);
  assert.equal(ev.reached, true);
  const revised = reviseGoal(g, { target: 0 });
  assert.equal(revised.revisions.length, 1);
  assert.equal(revised.revisions[0].target, 0.1);
});

/* ---------------- Stock ---------------- */

test('stock recalculé à partir du registre, quantités inconnues jamais déduites', () => {
  const f = fixture();
  const product = f.products.find((p) => p.id === 'prd_tobacco');
  const settings = { ...f.settings, stock: { enabled: true, since: '2026-11-01' } };
  const entries = [rolled('2026-11-02T09:00', 0.3), rolled('2026-11-03T09:00', null), joint('2026-11-03T20:00', 0.2, 0.1)];
  const data = { purchases: f.purchases, inventories: [], entries, settings };
  const s = computeStock(product, data, '2026-11-03');
  near(s.quantity, 30 - 0.5);
  assert.equal(s.unknownUsages, 1);
  const inv = [{ id: 'i', productId: 'prd_tobacco', at: '2026-11-03T12:00', quantity: 25 }];
  const s2 = computeStock(product, { ...data, inventories: inv }, '2026-11-03');
  near(s2.quantity, 25 - 0.2);
  const slim = f.products.find((p) => p.id === 'prd_slim');
  near(computeStock(slim, data, '2026-11-03').quantity, 31);
});

/* ---------------- Sauvegarde ---------------- */

test('SCÉNARIO 8 — export puis restauration à l’identique', () => {
  const demo = buildDemoData('2026-11-14');
  demo.settings.privacy.pinHash = 'secret';
  const exported = JSON.stringify(buildExport(demo));
  assert.ok(!exported.includes('secret'));
  const v = validateImport(exported);
  assert.equal(v.ok, true);
  assert.equal(v.data.entries.length, demo.entries.length);
  assert.equal(v.data.nights.length, demo.nights.length);
  assert.deepEqual(v.data.purchases, demo.purchases);
  const merged = mergeData({ entries: [demo.entries[0]] }, v.data);
  assert.equal(merged.entries.length, demo.entries.length);
});

test('import refusé si le fichier est invalide', () => {
  assert.equal(validateImport('{nope').ok, false);
  assert.equal(validateImport({ app: 'autre' }).ok, false);
  assert.equal(validateImport({ app: 'track-the-smoke', schema: 999 }).ok, false);
  const v = validateImport({ app: 'track-the-smoke', schema: 1, data: { entries: [{ id: 'x', kind: 'consumption', at: 'bad' }] } });
  assert.equal(v.data.entries.length, 0);
  assert.equal(v.warnings.length, 1);
});

test('export CSV', () => {
  const f = fixture();
  const csv = entriesToCSV([joint('2026-11-12T08:45', 0.22, 0.16)], [{ id: 'joint', name: 'Joint tabac + CBD' }], f.cost);
  assert.match(csv, /2026-11-12;08:45;consommation;Joint tabac \+ CBD;0,22;weighed;0,16;g;weighed/);
  assert.match(csv, /0,97;oui/);
});

/* ---------------- Démo & observations ---------------- */

test('données de démo cohérentes et observations prudentes', () => {
  const demo = buildDemoData('2026-11-14');
  assert.ok(demo.entries.length > 100);
  const index = buildPriceIndex(demo.products, demo.purchases);
  const cost = makeCostFn({ index, settings: demo.settings });
  const ctx = { cost, trackingStart: demo.settings.trackingStart, today: '2026-11-14' };
  const ins = generateInsights(demo, ctx);
  assert.ok(Array.isArray(ins));
  for (const i of ins) assert.ok(!/cause/.test(i.text) || /pas d'une relation/.test(i.text));
  const empty = generateInsights({ entries: [], nights: [], settings: defaultSettings() }, { cost, trackingStart: null, today: '2026-11-14' });
  assert.equal(empty.length, 0);
});

test('fenêtre de pointe traversant minuit', () => {
  const list = ['22', '23', '23', '00', '01', '09'].map((h, i) => ({ at: `2026-11-1${i % 3}T${h}:00` }));
  const p = peakWindow(list);
  assert.equal(p.start, 22);
  assert.equal(p.end, 2);
  assert.equal(p.count, 5);
});
