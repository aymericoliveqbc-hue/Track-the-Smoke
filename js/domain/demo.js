// Données de démonstration.
// Elles ne sont JAMAIS écrites dans la base personnelle : le mode démo utilise
// une base IndexedDB distincte et l'interface l'indique en permanence.

import { addDays, dayKey, pad } from '../core/dates.js';
import { round2 } from '../core/format.js';
import { defaultSettings, defaultProducts, SYSTEM_CATEGORIES, CAT } from './models.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function buildDemoData(today = dayKey(), days = 42, now = `${today}T23:59`) {
  const r = rng(42);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const between = (a, b) => a + r() * (b - a);
  const start = addDays(today, -(days - 1));

  const settings = {
    ...defaultSettings(),
    onboarded: true,
    trackingStart: start,
    observation: { enabled: true, startDate: start, days: 14 },
    stock: { enabled: true, since: start },
  };
  const products = defaultProducts().map((p) => ({ ...p, brand: p.kind === 'tobacco' ? 'Démo' : '' }));
  const prod = Object.fromEntries(products.map((p) => [p.id, p]));
  prod.prd_tobacco.name = 'Tabac à rouler (démo)';
  prod.prd_cbd_flower.name = 'Fleurs CBD (démo)';
  products.push({ ...defaultProducts()[1], id: 'prd_cbd_resin', name: 'Résine CBD (démo)', cbdForm: 'resin' });
  products.push({ ...defaultProducts()[1], id: 'prd_cbd_oil', name: 'Huile CBD 10 % (démo)', cbdForm: 'oil', unit: 'drop' });

  const purchases = [
    { id: 'pur_d1', productId: 'prd_tobacco', date: start, packPrice: 14.5, packSize: 30, packCount: 2, supplier: 'Buraliste', addToStock: true },
    { id: 'pur_d2', productId: 'prd_cbd_flower', date: start, packPrice: 45, packSize: 10, packCount: 1, supplier: 'Boutique CBD', addToStock: true },
    { id: 'pur_d3', productId: 'prd_slim', date: start, packPrice: 1.2, packSize: 32, packCount: 3, addToStock: true },
    { id: 'pur_d4', productId: 'prd_classic', date: start, packPrice: 0.9, packSize: 50, packCount: 1, addToStock: true },
    { id: 'pur_d5', productId: 'prd_filter', date: start, packPrice: 1.5, packSize: 120, packCount: 1, addToStock: true },
    { id: 'pur_d6', productId: 'prd_cbd_flower', date: addDays(start, 16), packPrice: 42, packSize: 10, packCount: 1, supplier: 'Boutique CBD', addToStock: true },
    { id: 'pur_d7', productId: 'prd_tobacco', date: addDays(start, 24), packPrice: 14.9, packSize: 30, packCount: 1, supplier: 'Buraliste', addToStock: true },
    { id: 'pur_d8', productId: 'prd_cbd_oil', date: addDays(start, 10), packPrice: 39, packSize: 300, packCount: 1, supplier: 'Boutique CBD', addToStock: false },
    { id: 'pur_d9', productId: 'prd_cbd_flower', date: addDays(start, 30), packPrice: 42, packSize: 10, packCount: 1, supplier: 'Boutique CBD', addToStock: true },
  ];
  const inventories = [
    { id: 'inv_d1', productId: 'prd_tobacco', at: `${start}T00:00`, quantity: 0, note: 'Début du suivi' },
  ];

  const entries = [];
  const nights = [];
  let n = 0;
  const id = (p) => `${p}_demo${(n++).toString(36)}`;
  const at = (d, h, m) => `${d}T${pad(h)}:${pad(m)}`;

  for (let i = 0; i < days; i++) {
    const d = addDays(start, i);
    const progress = i / days; // réduction progressive simulée
    const jointsToday = Math.max(1, Math.round(between(3.2, 5.2) * (1 - progress * 0.45)));
    const rolledToday = Math.max(0, Math.round(between(1, 3.4) * (1 - progress * 0.6)));
    const hoursJ = [10, 13, 17, 20, 22, 23].sort(() => r() - 0.5).slice(0, jointsToday).sort((a, b) => a - b);
    for (const h of hoursJ) {
      const weighed = r() < 0.55;
      const tg = round2(between(0.16, 0.28) * (1 - progress * 0.25));
      const cg = round2(between(0.12, 0.22));
      entries.push({
        id: id('e'), kind: 'consumption', categoryId: CAT.JOINT, at: at(d, h, Math.floor(r() * 60)), tzOffset: -60,
        tobacco: { grams: tg, method: weighed ? 'weighed' : 'estimated', productId: 'prd_tobacco' },
        cbd: { amount: cg, unit: 'g', method: weighed ? 'weighed' : 'estimated', productId: i > 20 && r() < 0.3 ? 'prd_cbd_resin' : 'prd_cbd_flower', form: 'flower' },
        accessories: [{ type: 'slim', productId: null, count: 1 }, { type: 'filter', productId: null, count: 1 }],
        context: pick(['home', 'home', 'social', 'bedtime', 'after_meal']), mood: pick(['calm', 'tired', 'stressed', 'good']),
        note: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
    }
    const hoursR = [8, 9, 12, 15, 18].sort(() => r() - 0.5).slice(0, rolledToday);
    for (const h of hoursR) {
      entries.push({
        id: id('e'), kind: 'consumption', categoryId: CAT.ROLLED, at: at(d, h, Math.floor(r() * 60)), tzOffset: -60,
        tobacco: { grams: round2(between(0.22, 0.32)), method: r() < 0.4 ? 'weighed' : 'estimated', productId: 'prd_tobacco' },
        cbd: null,
        accessories: [{ type: 'classic', productId: null, count: 1 }, ...(r() < 0.5 ? [{ type: 'filter', productId: null, count: 1 }] : [])],
        context: pick(['work', 'coffee', 'after_meal', 'transport']), mood: pick(['calm', 'stressed', 'bored']),
        note: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
    }
    if (i > 10 && r() < 0.35) {
      entries.push({
        id: id('e'), kind: 'consumption', categoryId: CAT.CBD, at: at(d, 22, 30), tzOffset: -60,
        tobacco: null, cbd: { amount: 4, unit: 'drop', method: 'estimated', productId: 'prd_cbd_oil', form: 'oil' },
        accessories: [], mode: 'sublingual', note: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
    }
    const cravingsToday = Math.round(between(1, 4) * (0.6 + progress));
    for (let k = 0; k < cravingsToday; k++) {
      const resisted = r() < 0.35 + progress * 0.5;
      entries.push({
        id: id('c'), kind: 'craving', at: at(d, pick([9, 11, 14, 16, 19, 21, 23]), Math.floor(r() * 60)), tzOffset: -60,
        intensity: Math.round(between(3, 9)), product: pick(['tobacco', 'cbd', 'both', 'both']),
        trigger: pick(['stress', 'habit', 'after_meal', 'bedtime', 'mental', 'boredom', 'relax']),
        durationMin: Math.round(between(3, 20)), situation: '', emotion: '', note: '',
        outcome: resisted ? 'resisted' : 'consumed', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
    }
    if (i < days - 1 && r() < 0.85) {
      const latency = Math.round(between(15, 110) * (1 - progress * 0.4));
      const bedH = pick([22, 23, 23, 0]);
      const wakeH = pick([7, 7, 8]);
      nights.push({
        id: `night_${d}`, date: d,
        bedTime: `${pad(bedH)}:${pad(Math.floor(r() * 4) * 15)}`, tryTime: null, asleepTime: null, latencyMin: latency,
        wakeTime: `${pad(wakeH)}:${pad(Math.floor(r() * 4) * 15)}`, totalSleepMin: null,
        awakenings: Math.round(between(0, 3)), quality: Math.max(1, Math.min(5, Math.round(between(2, 4.4) + progress))),
        wakeFeeling: pick(['rested', 'ok', 'groggy', 'tired']), note: '',
        stress: Math.round(between(1, 5)), agitation: Math.round(between(1, 5)), fatigue: Math.round(between(1, 5)),
        mood: Math.round(between(2, 5)), relaxDifficulty: Math.round(between(1, 5)), energy: Math.round(between(2, 5)),
      });
    }
  }
  // Jamais d'événement dans le futur.
  for (let i = entries.length - 1; i >= 0; i--) if (entries[i].at > now) entries.splice(i, 1);
  // Scénario 5 : une nuit difficile (4 h pour s'endormir).
  const hard = nights[nights.length - 3];
  if (hard) Object.assign(hard, { latencyMin: 240, quality: 1, note: 'Nuit très agitée', wakeFeeling: 'exhausted' });

  const goals = [
    { id: 'goal_d1', metric: 'tobacco_g', target: 0.5, startDate: addDays(start, 14), active: true, note: 'Réduire d’abord les roulées', steps: [{ date: addDays(start, 14), target: 1.2 }, { date: addDays(start, 28), target: 0.9 }, { date: addDays(start, 42), target: 0.5 }], revisions: [], createdAt: new Date().toISOString() },
    { id: 'goal_d2', metric: 'joints', target: 2, startDate: addDays(start, 14), active: true, note: '', steps: [], revisions: [], createdAt: new Date().toISOString() },
    { id: 'goal_d3', metric: 'resisted_share', target: 0.5, startDate: addDays(start, 14), active: true, note: '', steps: [], revisions: [], createdAt: new Date().toISOString() },
  ];
  goals.push({
    id: 'prj_demo', kind: 'project', template: 'move', name: 'Partir au Canada', description: 'Montréal, 1 personne, permis vacances-travail',
    items: [
      { id: 'i1', label: 'Billet d\u2019avion', amount: 650, note: 'Aller simple' },
      { id: 'i2', label: 'Permis vacances-travail', amount: 250, note: 'Frais officiels' },
      { id: 'i3', label: 'Premier loyer + caution', amount: 2400, note: 'Studio meublé' },
      { id: 'i4', label: 'Fonds de sécurité', amount: 4500, note: '3 mois' },
    ],
    buffer: 0.1, targetDate: addDays(today, 365), saved: 300, deposits: [], startDate: addDays(start, 14), refPerDay: 4.2,
    ai: null, active: true, createdAt: new Date().toISOString(),
  });
  settings.quickDefaults = {
    joint: { tobacco: { grams: 0.2, method: 'estimated', productId: 'prd_tobacco' }, cbd: { amount: 0.16, unit: 'g', method: 'estimated', productId: 'prd_cbd_flower', form: 'flower' }, accessories: [{ type: 'slim', productId: null, count: 1 }, { type: 'filter', productId: null, count: 1 }] },
    rolled: { tobacco: { grams: 0.27, method: 'estimated', productId: 'prd_tobacco' }, accessories: [{ type: 'classic', productId: null, count: 1 }] },
  };
  settings.journeys = { tobacco: { status: 'reducing', quitDate: null }, cbd: { status: 'reducing', quitDate: null } };

  return {
    settings, products, purchases, inventories, entries, nights, goals,
    categories: SYSTEM_CATEGORIES.map((c) => ({ ...c })),
  };
}
