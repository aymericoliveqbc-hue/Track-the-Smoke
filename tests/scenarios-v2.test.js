// Scénarios V2 n° 9 (personnalisation) et n° 10 (données insuffisantes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, defaultProducts, newProduct } from '../js/domain/models.js';
import { buildPriceIndex, makeCostFn } from '../js/domain/costs.js';
import { summarize, coverage, trackingStartOf } from '../js/domain/stats.js';
import { realizedWindows, avoidedSinceQuit, financeOverview } from '../js/domain/finance.js';
import { autoEstimateFor } from '../js/domain/autoqty.js';
import { components, reliabilityOf } from '../js/domain/methods.js';
import { sessionStats } from '../js/domain/sessions.js';
import { cravingStats } from '../js/domain/cravings.js';
import { migrateState } from '../js/domain/migrations.js';

const E = (id, cat, at, extra) => ({ id, kind: 'consumption', categoryId: cat, at, status: 'done', accessories: [], ...extra });

test('TEST 9 — retirer une méthode des habitudes : historique et statistiques conservés', () => {
  const settings = { ...defaultSettings(), habits: { configured: true, enabled: ['cigarette', 'vape'], primary: 'cigarette', modes: {} } };
  const cig = newProduct('cigarettes', { id: 'cig' });
  const products = [...defaultProducts(), cig];
  const cost = makeCostFn({ index: buildPriceIndex(products, [{ id: 'p', productId: 'cig', date: '2026-10-01', packPrice: 12, packSize: 20, packCount: 1 }]), settings });
  const ctx = { cost, trackingStart: '2026-11-01', today: '2026-11-10' };
  const entries = [1, 2, 3].map((i) => E(`c${i}`, 'cigarette', `2026-11-0${i}T10:00`, { units: { count: 1, productId: 'cig', method: 'counted' } }));
  const before = summarize(entries, { start: '2026-11-01', end: '2026-11-10' }, ctx);

  // L'utilisateur retire « Cigarette » de ses habitudes actives.
  const after = { ...settings, habits: { ...settings.habits, enabled: ['vape'], primary: 'vape' } };
  const state = { schemaVersion: 2, settings: after, entries, packs: [], products, purchases: [], inventories: [], categories: [], goals: [], nights: [] };
  const mig = migrateState(state); // une relecture ne touche pas aux entrées
  assert.equal(mig.state.entries.length, 3);
  const s = summarize(mig.state.entries, { start: '2026-11-01', end: '2026-11-10' }, ctx);
  assert.deepEqual(s.counts.byCategory, before.counts.byCategory);
  assert.equal(s.units.cigarettes, 3);
  assert.equal(Math.round(s.cost.total * 100), 180);
});

test('TEST 10 — données insuffisantes : rien n’est inventé', () => {
  const settings = defaultSettings();
  const cost = makeCostFn({ index: buildPriceIndex(defaultProducts(), []), settings });
  // Aucune donnée : aucune période couverte, aucune statistique.
  assert.equal(trackingStartOf({ settings: {}, entries: [], nights: [] }), null);
  assert.equal(coverage({ start: '2026-11-01', end: '2026-11-10' }, null, '2026-11-10'), null);
  assert.equal(sessionStats([], { start: '2026-11-01', end: '2026-11-10' }, { trackingStart: null, today: '2026-11-10' }), null);

  const ctx = { cost, trackingStart: '2026-11-01', today: '2026-11-10' };
  // Quantité inconnue : comptée comme « manquante », jamais comme 0 g ni comme une moyenne.
  const unknown = E('u', 'rolled', '2026-11-02T10:00', { tobacco: { grams: null, method: null } });
  const s = summarize([unknown], { start: '2026-11-01', end: '2026-11-10' }, ctx);
  assert.equal(s.counts.total, 1);
  assert.equal(s.tobacco.total, 0);
  assert.equal(s.tobacco.missing, 1);
  assert.equal(reliabilityOf(components(unknown)[0]), 'unknown');

  // Sans prix connu : le coût est signalé incomplet, pas estimé en silence.
  assert.equal(s.cost.incomplete, 1);

  // Sans calibration : la valeur auto est marquée « provisoire », jamais « calculée ».
  const auto = E('a', 'rolled', '2026-11-02T11:00', { tobacco: { grams: null, method: 'auto' } });
  const est = autoEstimateFor(auto, 'tobacco', settings, null);
  assert.equal(est.basis, 'default');
  assert.equal(reliabilityOf({ amount: est.amount, method: 'auto', basis: est.basis }), 'provisional');
  // E-liquide : aucune valeur par défaut inventée.
  assert.equal(autoEstimateFor(E('v', 'vape', '2026-11-02T12:00', { liquid: { ml: null, method: 'auto' } }), 'liquid', settings, null), null);

  // Économies : sans dépenses « avant l'app », aucune économie réelle affichée.
  assert.deepEqual(realizedWindows(null, [unknown], ctx), []);
  // Arrêt sans historique avant la date : « insuffisant », pas d'économie évitée.
  assert.deepEqual(avoidedSinceQuit('rolled', '2026-11-01', [unknown], ctx), { insufficient: true });

  // Moyenne mensuelle : pas d'extrapolation sur moins d'une semaine de suivi.
  assert.equal(financeOverview([unknown], { ...ctx, trackingStart: '2026-11-08' }).avgMonthly, null);
  assert.notEqual(financeOverview([unknown], ctx).avgMonthly, null);

  // Envies : aucune moyenne d'intensité sans valeur saisie.
  const cs = cravingStats([{ id: 'k', kind: 'craving', at: '2026-11-03T10:00', outcome: 'resisted' }], { start: '2026-11-01', end: '2026-11-10' }, ctx);
  assert.equal(cs.avgIntensity.value, null);
});
