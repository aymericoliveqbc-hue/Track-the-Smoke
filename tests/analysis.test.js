// Analyse IA : données envoyées strictement agrégées, sans texte libre,
// sans valeurs inventées ; garde-fou sur les chiffres cités ; rappel de fin de session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, defaultProducts, newProduct, SYSTEM_CATEGORIES } from '../js/domain/models.js';
import { buildPriceIndex, makeCostFn } from '../js/domain/costs.js';
import { buildAnalysisPayload, payloadFreeText, unverifiedNumbers } from '../js/domain/analysis.js';
import { overdueSessions } from '../js/domain/sessions.js';
import { addDays } from '../js/core/dates.js';

const settings = { ...defaultSettings(), habits: { configured: true, enabled: ['cigarette', 'my_custom'], primary: 'cigarette', modes: { cigarette: { mode: 'quit', quitDate: '2026-11-11' } } } };
const cig = newProduct('cigarettes', { id: 'cig', name: 'Marque secrète' });
const products = [...defaultProducts(), cig];
const purchases = [{ id: 'a', productId: 'cig', date: '2026-10-01', packPrice: 12, packSize: 20, packCount: 1 }];
const cost = makeCostFn({ index: buildPriceIndex(products, purchases), settings });
const ctx = { cost, trackingStart: '2026-11-01', today: '2026-11-20' };
const categories = [...SYSTEM_CATEGORIES, { id: 'my_custom', name: 'Chez Julie le samedi', tracksQuantity: true }];
const E = (id, cat, at, extra) => ({ id, kind: 'consumption', categoryId: cat, at, status: 'done', accessories: [], note: 'note très privée', place: 'bureau', ...extra });
const entries = [];
for (let i = 0; i < 20; i++) {
  const d = addDays('2026-11-01', i);
  if (d < '2026-11-11') entries.push(E(`c${i}`, 'cigarette', `${d}T09:00`, { units: { count: 2, productId: 'cig', method: 'counted' } }));
  entries.push(E(`x${i}`, 'my_custom', `${d}T21:00`, {}));
}
entries.push({ id: 'cr1', kind: 'craving', at: '2026-11-15T10:00', outcome: 'resisted', intensity: 6, trigger: 'stress', note: 'secret' });
const nights = [{ id: 'n1', date: '2026-11-14', quality: 4, totalSleepMin: 420, note: 'rêve privé' }];
const data = { entries, nights, categories, settings };

test('payload : agrégats seulement, aucun texte libre ni nom privé', () => {
  const p = buildAnalysisPayload(data, { start: '2026-11-11', end: '2026-11-20' }, ctx, { currency: 'EUR' });
  const strings = payloadFreeText(p).join(' | ');
  for (const secret of ['note très privée', 'bureau', 'secret', 'rêve privé', 'Marque secrète', 'Chez Julie', '2026-']) {
    assert.ok(!strings.includes(secret), `fuite : ${secret}`);
  }
  assert.ok(strings.includes('Méthode personnalisée 1'));
  assert.equal(p.periode.jours, 10);
  assert.equal(p.actuelle.cigarettes, null); // arrêt : aucune cigarette, pas de valeur inventée
  assert.equal(p.precedente.cigarettes, 20);
  assert.equal(p.precedente.depense, 12);
  assert.equal(p.actuelle.tabac_g, null); // jamais saisi → null, pas 0
  assert.equal(p.envies.resistees, 1);
  assert.equal(p.sommeil.dureeMoyenneH, 7);
  assert.deepEqual(p.objectifsParMethode, [{ methode: 'Cigarette', mode: 'arrêt', joursDepuisArret: 9 }]);
  assert.equal(p.variationsParJourEnPourcent.consommations, -50);
});

test('payload : aucune donnée sur la période → null (rien à envoyer)', () => {
  assert.equal(buildAnalysisPayload({ ...data, entries: [], nights: [] }, { start: '2026-11-01', end: '2026-11-20' }, { ...ctx, trackingStart: null }), null);
});

test('garde-fou : chiffres absents des données signalés', () => {
  const p = buildAnalysisPayload(data, { start: '2026-11-11', end: '2026-11-20' }, ctx);
  assert.deepEqual(unverifiedNumbers('Tu as fumé 20 cigarettes et dépensé 12 € la période précédente.', p), []);
  assert.deepEqual(unverifiedNumbers('Ta consommation a baissé de 50 %.', p), []);
  assert.deepEqual(unverifiedNumbers('Tu as économisé 437 €.', p), [437]);
});

test('rappel de fin de session : seulement au-delà du délai, désactivable', () => {
  const list = [
    { id: 's1', kind: 'consumption', status: 'running', categoryId: 'vape', at: '2026-11-20T23:30' },
    { id: 's2', kind: 'consumption', status: 'running', categoryId: 'hookah', at: '2026-11-21T00:10' },
    { id: 's3', kind: 'consumption', status: 'done', categoryId: 'vape', at: '2026-11-20T20:00', endAt: '2026-11-20T20:30' },
  ];
  assert.deepEqual(overdueSessions(list, '2026-11-21T00:20', 30).map((e) => e.id), ['s1']); // traverse minuit
  assert.deepEqual(overdueSessions(list, '2026-11-21T00:20', 0), []);
});
