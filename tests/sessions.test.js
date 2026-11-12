import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionStats, finishSession, duplicateRunning, runningSessions } from '../js/domain/sessions.js';
import { summarize, sessionMinutes } from '../js/domain/stats.js';

const ctx = { cost: null, trackingStart: '2026-11-01', today: '2026-11-12' };
const s = (id, at, endAt, cat = 'vape', extra = {}) => ({ id, kind: 'consumption', categoryId: cat, at, endAt, status: endAt ? 'done' : 'running', ...extra });

test('TEST 6 — session commencée puis terminée plus tard ; session à travers minuit', () => {
  const started = s('a', '2026-11-10T23:40', null);
  assert.equal(sessionMinutes(started), null);
  const done = finishSession(started, '2026-11-11T00:25');
  assert.equal(done.status, 'done');
  assert.equal(sessionMinutes(done), 45);
  assert.throws(() => finishSession(started, '2026-11-10T23:00'));
  const st = sessionStats([done], { start: '2026-11-10', end: '2026-11-11' }, ctx);
  assert.equal(st.totalMin, 45);
  assert.equal(st.byDay.get('2026-11-10'), 45); // rattachée au jour de début
});

test('durées moyennes par méthode, intervalles et temps sans consommation distincts', () => {
  const list = [
    s('1', '2026-11-12T08:00', '2026-11-12T08:10', 'vape'),
    s('2', '2026-11-12T10:00', '2026-11-12T10:20', 'vape'),
    s('3', '2026-11-12T12:00', null, 'cigarette', { status: 'done' }), // non chronométrée
    s('4', '2026-11-12T15:00', '2026-11-12T15:06', 'cigarette'),
  ];
  const st = sessionStats(list, { start: '2026-11-12', end: '2026-11-12' }, ctx);
  assert.equal(st.count, 4);
  assert.equal(st.timed, 3);
  assert.equal(st.totalMin, 36);
  assert.equal(st.byMethod.find((m) => m.id === 'vape').avg, 15);
  assert.equal(st.avgInterval.value, (120 + 120 + 180) / 3); // début → début
  assert.equal(st.avgGap.value, (110 + 100 + 180) / 3);       // fin → début suivant
  const sum = summarize(list, { start: '2026-11-12', end: '2026-11-12' }, ctx);
  assert.equal(sum.sessions.totalMin, 36);
});

test('pas de double session involontaire, sessions distinctes possibles', () => {
  const r1 = s('r1', '2026-11-12T20:00', null, 'vape', { liquid: { productId: 'liqA' } });
  assert.ok(duplicateRunning([r1], 'vape', 'liqA'));
  assert.equal(duplicateRunning([r1], 'vape', 'liqB'), null);
  assert.equal(duplicateRunning([r1], 'joint'), null);
  assert.equal(runningSessions([r1]).length, 1);
});

test('temps depuis la dernière consommation : compté depuis sa fin', async () => {
  const { sinceLastConsumption, endOf } = await import('../js/domain/sessions.js');
  const all = () => true;
  const C = (id, at, extra = {}) => ({ id, kind: 'consumption', categoryId: 'joint', at, status: 'done', ...extra });
  // Joint commencé à 20:00, fini à 20:15 : à 21:00 → 45 min (et non 60).
  assert.equal(sinceLastConsumption([C('a', '2026-11-12T20:00', { endAt: '2026-11-12T20:15' })], all, '2026-11-12T21:00').sinceMin, 45);
  // Sans heure de fin : compté depuis le début.
  assert.equal(sinceLastConsumption([C('b', '2026-11-12T20:00')], all, '2026-11-12T21:00').sinceMin, 60);
  // La plus récente FIN l'emporte : une longue session commencée plus tôt mais finie plus tard.
  const r = sinceLastConsumption([C('long', '2026-11-12T18:00', { endAt: '2026-11-12T20:40' }), C('court', '2026-11-12T19:00', { endAt: '2026-11-12T19:05' })], all, '2026-11-12T21:00');
  assert.equal(r.last.id, 'long'); assert.equal(r.sinceMin, 20);
  // Fin après minuit.
  assert.equal(sinceLastConsumption([C('n', '2026-11-12T23:30', { endAt: '2026-11-13T00:10' })], all, '2026-11-13T01:00').sinceMin, 50);
  // Session en cours : pas de compteur.
  const run = sinceLastConsumption([C('a', '2026-11-12T20:00', { endAt: '2026-11-12T20:15' }), C('v', '2026-11-12T20:30', { status: 'running', endAt: null })], all, '2026-11-12T21:00');
  assert.equal(run.running, true); assert.equal(run.sinceMin, null);
  // Rien d'enregistré : rien d'inventé.
  assert.deepEqual(sinceLastConsumption([], all, '2026-11-12T21:00'), { last: null, running: false, sinceMin: null });
  assert.equal(endOf(C('x', '2026-11-12T20:00', { endAt: '2026-11-12T19:00' })), '2026-11-12T20:00'); // fin incohérente ignorée
});
