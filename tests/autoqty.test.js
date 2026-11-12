import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calibrate, autoUpdates, autoEstimate, packRemaining, newPack, precisionLabel } from '../js/domain/autoqty.js';
import { defaultSettings } from '../js/domain/models.js';
import { addDays } from '../js/core/dates.js';

const near = (a, b, eps = 0.011) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const settings = defaultSettings();
let n = 0;
const rolled = (at, method = 'auto', grams = null) => ({ id: `r${n++}`, kind: 'consumption', categoryId: 'rolled', at, tobacco: { grams, method, productId: null }, cbd: null, accessories: [] });
const joint = (at) => ({ id: `j${n++}`, kind: 'consumption', categoryId: 'joint', at, tobacco: { grams: null, method: 'auto', productId: null }, cbd: { amount: null, unit: 'g', method: 'auto', productId: null }, accessories: [] });
const day = (i, h = 12) => `${addDays('2026-11-01', i)}T${String(h).padStart(2, '0')}:00`;

test('sans repère : valeurs génériques', () => {
  const c = calibrate([rolled(day(0))], [], settings);
  assert.equal(c.factors.tobacco, 1);
  near(c.quantities.values().next().value.tobacco, 0.3);
  assert.equal(autoEstimate('joint', 'cbd', settings, c.factors), 0.2);
  assert.equal(precisionLabel(0).level, 0);
});

test('paquet terminé : la somme des roulées égale la contenance', () => {
  const entries = [];
  for (let i = 0; i < 60; i++) entries.push(rolled(day(Math.floor(i / 4), 8 + (i % 4) * 3)));
  const pack = { ...newPack({ productId: 'prd_tobacco', kind: 'tobacco', size: 30, openedAt: '2026-10-31T20:00' }), finishedAt: day(15, 0) };
  const c = calibrate(entries, [pack], settings);
  near(c.factors.tobacco, 30 / 18, 1e-9);
  const updated = autoUpdates(entries, c);
  assert.equal(updated.length, 60);
  near(updated.reduce((t, e) => t + e.tobacco.grams, 0), 30, 0.3);
  near(updated[0].tobacco.grams, 0.5);
});

test('joints et roulées partagent le paquet de tabac ; le CBD a son propre paquet', () => {
  const entries = [];
  for (let i = 0; i < 20; i++) entries.push(joint(day(i, 21)), rolled(day(i, 9)));
  const tob = { ...newPack({ productId: 'prd_tobacco', kind: 'tobacco', size: 30, openedAt: '2026-10-31T20:00' }), finishedAt: day(20, 0) };
  const cbd = { ...newPack({ productId: 'prd_cbd_flower', kind: 'cbd', size: 5, openedAt: '2026-10-31T20:00' }), finishedAt: day(20, 0) };
  const c = calibrate(entries, [tob, cbd], settings);
  // tabac : 20 × 0,2 + 20 × 0,3 = 10 unités → k = 3 ; CBD : 20 × 0,2 = 4 → k = 1,25
  near(c.factors.tobacco, 3, 1e-9);
  near(c.factors.cbd, 1.25, 1e-9);
  const up = autoUpdates(entries, c);
  const j = up.find((e) => e.categoryId === 'joint');
  near(j.tobacco.grams, 0.6);
  near(j.cbd.amount, 0.25);
});

test('paquet déjà entamé + repère « la moitié » + saisie manuelle déduite', () => {
  const entries = [];
  for (let i = 0; i < 10; i++) entries.push(joint(day(i, 21)));
  entries.push({ ...joint(day(3, 22)), cbd: { amount: 0.5, unit: 'g', method: 'weighed', productId: null } });
  // 5 g de CBD entamé, il restait ~4 g ; 10 jours plus tard, il en reste ~1,5 g.
  const pack = newPack({ productId: 'prd_cbd_flower', kind: 'cbd', size: 5, openedAt: '2026-10-31T20:00', startRemaining: 4 });
  pack.checkpoints.push({ at: day(10, 0), remaining: 1.5 });
  const c = calibrate(entries, [pack], settings);
  // 2,5 g partis − 0,5 g pesé = 2 g pour 10 joints auto (2 unités) → k = 1
  near(c.factors.cbd, 1, 1e-9);
  assert.equal(c.calibrations.cbd, 1);
  // Restant : 1,5 g − consommations postérieures connues
  const later = [...entries, { ...joint(day(11, 21)), cbd: { amount: 0.2, unit: 'g', method: 'auto', productId: null } }];
  near(packRemaining(pack, later, settings).remaining, 1.3);
});

test('repère incohérent ignoré (pas de facteur absurde)', () => {
  const entries = [rolled(day(0)), rolled(day(1))];
  const pack = { ...newPack({ productId: 'prd_tobacco', kind: 'tobacco', size: 30, openedAt: '2026-10-31T20:00' }), finishedAt: day(2) };
  const c = calibrate(entries, [pack], settings);
  assert.equal(c.calibrations.tobacco, 0); // 30 g pour 2 roulées : k = 50, rejeté
  assert.equal(c.factors.tobacco, 1);
});

test('les consommations hors paquet utilisent le facteur appris', () => {
  const entries = [];
  for (let i = 0; i < 40; i++) entries.push(rolled(day(Math.floor(i / 4))));
  const pack = { ...newPack({ productId: 'prd_tobacco', kind: 'tobacco', size: 20, openedAt: '2026-10-31T20:00' }), finishedAt: day(10, 0) };
  const after = rolled(day(12));
  const c = calibrate([...entries, after], [pack], settings);
  near(c.quantities.get(after.id).tobacco, 0.5); // 20 g / (40 × 0,3) × 0,3
  const custom = { ...settings, autoPriors: { rolled: { tobacco: 0.4 } } };
  near(autoEstimate('rolled', 'tobacco', custom, { tobacco: 1 }), 0.4);
});

test('consommation à la minute même de l\u2019ouverture comptée dans le paquet', () => {
  const at = '2026-11-12T10:00';
  const entries = [joint(at), joint(at), joint('2026-11-12T10:05')];
  const pack = newPack({ productId: 'prd_cbd_flower', kind: 'cbd', size: 5, openedAt: at, startRemaining: 3.75 });
  near(packRemaining(pack, entries.map((e) => ({ ...e, cbd: { ...e.cbd, amount: 0.2 } })), settings).remaining, 3.15);
  pack.checkpoints.push({ at: '2026-11-12T10:05', remaining: 1 });
  const c = calibrate(entries, [pack], settings);
  near(c.factors.cbd, 2.75 / 0.6, 1e-9);
});
