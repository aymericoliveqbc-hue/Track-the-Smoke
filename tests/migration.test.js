import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateState } from '../js/domain/migrations.js';
import { buildDemoData } from '../js/domain/demo.js';
import { buildExport, validateImport } from '../js/domain/backup.js';

test('TEST 8 — migration v1 → v2 : aucune donnée perdue ni réécrite', () => {
  const v1 = buildDemoData('2026-11-14');
  v1.settings.schema = 1;
  delete v1.settings.habits;
  v1.categories = v1.categories.filter((c) => ['joint', 'rolled', 'cbd'].includes(c.id)).map((c) => (c.id === 'joint' ? { ...c, name: 'Joint tabac + CBD' } : c));
  v1.entries = v1.entries.map((e) => { const { status, composition, ...rest } = e; return rest; });
  const before = JSON.stringify({ e: v1.entries.map((e) => [e.id, e.at, e.tobacco?.grams, e.cbd?.amount, e.note]), p: v1.purchases, n: v1.nights, g: v1.goals, pk: v1.packs, inv: v1.inventories });
  const { state, changed, log } = migrateState(v1);
  assert.equal(changed, true);
  assert.equal(state.settings.schema, 2);
  assert.equal(state.entries.length, v1.entries.length);
  const after = JSON.stringify({ e: state.entries.map((e) => [e.id, e.at, e.tobacco?.grams, e.cbd?.amount, e.note]), p: state.purchases, n: state.nights, g: state.goals, pk: state.packs, inv: state.inventories });
  assert.equal(after, before, 'quantités, dates, notes, achats, nuits, objectifs, paquets et stocks identiques');
  assert.ok(state.entries.filter((e) => e.kind === 'consumption').every((e) => e.status === 'done'));
  assert.ok(state.entries.filter((e) => e.categoryId === 'joint').every((e) => e.composition === 'tobacco_cbd'));
  assert.ok(state.categories.find((c) => c.id === 'vape'));
  assert.equal(state.categories.find((c) => c.id === 'joint').name, 'Joint');
  assert.deepEqual(state.settings.habits.enabled.slice(0, 2), ['joint', 'rolled']);
  assert.equal(state.settings.habits.primary, 'joint');
  assert.ok(log.length >= 3);
  // Idempotente
  assert.equal(migrateState(state).changed, false);
});

test('nom de catégorie personnalisé respecté ; sauvegarde V1 importable puis migrée', () => {
  const v1 = buildDemoData('2026-11-14');
  v1.settings.schema = 1; delete v1.settings.habits;
  v1.categories = v1.categories.map((c) => (c.id === 'joint' ? { ...c, name: 'Mon spliff' } : c));
  const { state } = migrateState(v1);
  assert.equal(state.categories.find((c) => c.id === 'joint').name, 'Mon spliff');
  const exp = buildExport(v1);
  exp.schema = 1;
  const v = validateImport(JSON.stringify(exp));
  assert.equal(v.ok, true);
  const m = migrateState({ ...v.data, settings: v.settings });
  assert.equal(m.state.entries.length, v1.entries.length);
});
