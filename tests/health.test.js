import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toWall, sleepKind, HealthXmlScanner, parseShortcutText, samplesToNights, mergeHealthNights } from '../js/domain/health.js';
import { newNight, computeNight } from '../js/domain/sleep.js';
import { trackingStartOf } from '../js/domain/stats.js';

const rec = (start, end, value, src = 'Apple Watch') =>
  `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="${src}" sourceVersion="10" creationDate="${end}" startDate="${start}" endDate="${end}" value="${value}">\n  <MetadataEntry key="HKTimeZone" value="Europe/Paris"/>\n </Record>\n`;

test('dates Santé et Raccourcis converties en heure murale', () => {
  assert.equal(toWall('2026-11-10 23:14:05 +0100'), '2026-11-10T23:14');
  assert.equal(toWall('2026-11-10T23:14:05+01:00'), '2026-11-10T23:14');
  assert.equal(toWall('10/11/2026 23:14'), '2026-11-10T23:14');
  assert.equal(toWall('10 nov. 2026 à 23:14'), '2026-11-10T23:14');
  assert.equal(toWall('3 juil. 2026 à 07:05'), '2026-07-03T07:05');
  assert.equal(toWall('3 juin 2026 à 7:05'), '2026-06-03T07:05');
  assert.equal(toWall('12 févr. 2026 à 22:40'), '2026-02-12T22:40');
  assert.equal(toWall('n importe quoi'), null);
});

test('valeurs de sommeil HealthKit, françaises et anglaises', () => {
  assert.equal(sleepKind('HKCategoryValueSleepAnalysisInBed'), 'inbed');
  assert.equal(sleepKind('HKCategoryValueSleepAnalysisAsleepDeep'), 'asleep');
  assert.equal(sleepKind('HKCategoryValueSleepAnalysisAwake'), 'awake');
  assert.equal(sleepKind('Au lit'), 'inbed');
  assert.equal(sleepKind('Paradoxal'), 'asleep');
  assert.equal(sleepKind('Éveillé'), 'awake');
  assert.equal(sleepKind('Core'), 'asleep');
  assert.equal(sleepKind(''), null);
});

test('lecture incrémentale de export.xml, balises coupées entre morceaux', () => {
  const xml = '<?xml version="1.0"?>\n<HealthData locale="fr_FR">\n'
    + '<Record type="HKQuantityTypeIdentifierStepCount" startDate="2026-11-10 10:00:00 +0100" endDate="2026-11-10 10:05:00 +0100" value="120"/>\n'
    + rec('2026-11-10 23:00:00 +0100', '2026-11-11 07:10:00 +0100', 'HKCategoryValueSleepAnalysisInBed', 'iPhone')
    + rec('2026-11-10 23:40:00 +0100', '2026-11-11 02:00:00 +0100', 'HKCategoryValueSleepAnalysisAsleepCore')
    + rec('2026-11-11 02:00:00 +0100', '2026-11-11 02:20:00 +0100', 'HKCategoryValueSleepAnalysisAwake')
    + rec('2026-11-11 02:20:00 +0100', '2026-11-11 07:00:00 +0100', 'HKCategoryValueSleepAnalysisAsleepDeep')
    + '</HealthData>';
  for (const size of [7, 50, 333, xml.length]) {
    const sc = new HealthXmlScanner();
    const all = [];
    for (let i = 0; i < xml.length; i += size) all.push(...sc.feed(xml.slice(i, i + size)));
    assert.equal(all.length, 4, `taille ${size}`);
  }
});

test('échantillons → nuit : coucher, latence, sommeil réel, réveils', () => {
  const sc = new HealthXmlScanner();
  const samples = sc.feed(
    rec('2026-11-10 23:00:00 +0100', '2026-11-11 07:10:00 +0100', 'HKCategoryValueSleepAnalysisInBed', 'iPhone')
    + rec('2026-11-10 23:40:00 +0100', '2026-11-11 02:00:00 +0100', 'HKCategoryValueSleepAnalysisAsleepCore')
    + rec('2026-11-11 01:00:00 +0100', '2026-11-11 01:30:00 +0100', 'HKCategoryValueSleepAnalysisAsleepUnspecified', 'iPhone') // doublon chevauchant
    + rec('2026-11-11 02:00:00 +0100', '2026-11-11 02:20:00 +0100', 'HKCategoryValueSleepAnalysisAwake')
    + rec('2026-11-11 02:20:00 +0100', '2026-11-11 07:00:00 +0100', 'HKCategoryValueSleepAnalysisAsleepDeep')
    + rec('2026-11-11 15:00:00 +0100', '2026-11-11 15:30:00 +0100', 'HKCategoryValueSleepAnalysisAsleepCore'), // sieste → autre jour
  );
  const nights = samplesToNights(samples);
  const n = nights.find((x) => x.date === '2026-11-10');
  assert.equal(n.bedTime, '23:00');
  assert.equal(n.asleepTime, '23:40');
  assert.equal(n.latencyMin, 40);
  assert.equal(n.wakeTime, '07:00');
  assert.equal(n.totalSleepMin, 140 + 280); // chevauchements fusionnés, éveil exclu
  assert.equal(n.awakenings, 1);
});

test('sieste éloignée ignorée au profit du sommeil principal', () => {
  const { samples } = parseShortcutText([
    '2026-11-11T14:00:00+01:00;2026-11-11T14:30:00+01:00;Endormi',
    '2026-11-11T23:30:00+01:00;2026-11-12T06:30:00+01:00;Principal',
  ].join('\n'));
  const nights = samplesToNights(samples);
  assert.equal(nights.length, 1);
  assert.equal(nights[0].date, '2026-11-11');
  assert.equal(nights[0].totalSleepMin, 420);
});

test('texte de Raccourci : lignes invalides comptées, pas inventées', () => {
  const r = parseShortcutText('10/11/2026 23:30 ; 11/11/2026 06:45 ; Au lit\nligne cassée\n10/11/2026 23:50;11/11/2026 06:40;Endormi');
  assert.equal(r.samples.length, 2);
  assert.equal(r.rejected, 1);
  const [n] = samplesToNights(r.samples);
  assert.equal(n.latencyMin, 20);
  assert.equal(n.awakenings, 0);
});

test('fusion : les saisies manuelles ne sont jamais écrasées', () => {
  const existing = [{ ...newNight('2026-11-10'), quality: 2, asleepTime: '00:30', note: 'agité' }];
  const imported = [
    { date: '2026-11-10', bedTime: '23:00', asleepTime: '23:40', wakeTime: '07:00', latencyMin: 40, totalSleepMin: 420, awakenings: 1 },
    { date: '2026-11-11', bedTime: '22:50', asleepTime: '23:10', wakeTime: '06:50', latencyMin: 20, totalSleepMin: 440, awakenings: 0 },
  ];
  const r = mergeHealthNights(existing, imported, newNight);
  assert.equal(r.created, 1);
  assert.equal(r.completed, 1);
  const merged = r.toSave.find((n) => n.date === '2026-11-10');
  assert.equal(merged.asleepTime, '00:30');
  assert.equal(merged.quality, 2);
  assert.equal(merged.bedTime, '23:00');
  assert.equal(merged.latencyMin, null); // incohérent avec l'heure saisie → non repris
  const created = r.toSave.find((n) => n.date === '2026-11-11');
  assert.equal(created.source, 'apple-health');
  assert.equal(computeNight(created).totalSleepMin, 440);
});

test('une nuit seulement importée ne fait pas démarrer le suivi de consommation', () => {
  const state = { settings: { trackingStart: '2026-11-05' }, entries: [], nights: [{ date: '2026-10-01', source: 'apple-health', quality: null }] };
  assert.equal(trackingStartOf(state), '2026-11-05');
});
