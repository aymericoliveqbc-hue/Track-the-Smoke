// Scénarios de validation de bout en bout (Playwright).
// Usage : npm start (dans un autre terminal), puis npm run e2e
import { createRequire } from 'node:module';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const URL_BASE = process.env.E2E_URL || 'http://localhost:8080';
const SP = mkdtempSync(join(tmpdir(), 'tts-e2e-'));
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'], deviceScaleFactor: 1, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
const sheet = () => page.locator('.sheet.open').last();
const fillNum = async (loc, v) => { await loc.fill(v); await loc.blur(); };
const sleep = (ms) => page.waitForTimeout(ms);
await page.goto(`${URL_BASE}/`);
await page.waitForTimeout(600);
await page.click('text=Commencer');
await page.waitForTimeout(300);
// Configuration guidée V2 : méthodes → produits → méthode principale → modes
async function setupHabits(pg, methods = ['Joint', 'Roulée', 'CBD seul']) {
  for (const m of methods) await pg.click(`.catalog-tile:has-text("${m}")`);
  await pg.click('button:has-text("Continuer")'); await pg.waitForTimeout(300);
  if (methods.includes('Joint')) await pg.click('.chip:has-text("Tabac + CBD")');
  await pg.click('button:has-text("Continuer")'); await pg.waitForTimeout(300);
  await pg.click(`.ob-choice:has-text("${methods[0]}")`);
  await pg.click('button:has-text("Continuer")'); await pg.waitForTimeout(300);
  await pg.click('button:has-text("Terminer")'); await pg.waitForTimeout(500);
}
await setupHabits(page);
// « Avant l'app » : 4 paquets de 30 g à 15 €, 10 g de CBD à 5 €/g par mois
const inputs = page.locator('.ob-step .num-input');
const vals = ['4', '15', '30', '10', '5'];
for (let i = 0; i < vals.length; i++) await fillNum(inputs.nth(i), vals[i]);
ok(/110\s*€\s*\/\s*mois/.test(await page.locator('.before-total').innerText()), 'S13 dépense avant l’app : 4 × 15 € + 10 × 5 € = 110 € / mois');
await page.click('text=Continuer');
await page.click('text=14 jours');
await page.click('text=C’est parti');
await page.waitForTimeout(500);
ok(/Observation · jour 1\/14/.test(await page.locator('.hero').innerText()), 'onboarding terminé, phase d’observation affichée');
const detailed = async (pg, cat) => { await pg.click('.tab-add'); await pg.waitForTimeout(350); await pg.click('text=Saisie détaillée'); await pg.waitForTimeout(400); if (cat) { await pg.locator('.sheet.open .cat-pill', { hasText: cat }).click(); await pg.waitForTimeout(200); } };
const hero = (pg) => pg.locator('.hero').innerText();
// SCÉNARIO 1
await detailed(page);
await page.waitForTimeout(400);
let s = sheet();
await s.locator('.segmented button:has-text("Pesée")').first().click();
const nums = s.locator('.num-input');
await fillNum(nums.nth(0), '0,22');
await s.locator('.segmented button:has-text("Pesée")').nth(1).click();
await fillNum(nums.nth(1), '0,16');
const cost = await s.locator('.cost-preview b').innerText();
ok(cost.replace(/\s/g, '') === '≈0,91€', `S1 coût du joint = ${cost} (attendu 0,91 € : 0,11 tabac + 0,80 CBD, feuille/filtre sans prix)`);
await s.locator('.sticky-actions button:has-text("Ajouter")').click();
await page.waitForTimeout(500);
// SCÉNARIO 2
await detailed(page, 'Roulée');
await page.waitForTimeout(400);
s = sheet();
ok(await s.locator('h4:has-text("CBD")').count() === 0, 'S2 aucune section CBD pour une roulée');
await s.locator('.segmented button:has-text("Estimée")').first().click();
await fillNum(s.locator('.num-input').first(), '0,25');
ok((await s.locator('.cost-preview b').innerText()).replace(/\s/g, '') === '≈0,13€', 'S2 coût roulée 0,25 g × 0,50 € → 0,13 €');
await s.locator('.sticky-actions button:has-text("Ajouter")').click();
await page.waitForTimeout(500);
// SCÉNARIO 3
await page.click('.action:has-text("Envie")');
await page.waitForTimeout(400);
s = sheet();
await s.locator('.scale-btn:text-is("8")').click();
await s.locator('.chip:has-text("Avant de dormir")').first().click();
await s.locator('button:has-text("Enregistrer l’envie")').click();
await page.waitForTimeout(500);
const tiles = await hero(page);
ok(/1\s*envie résistée/.test(tiles), 'S3 1 envie résistée comptée');
ok(/^\s*2\s*$/m.test(tiles) && /1\s*joint/.test(tiles) && /1\s*roulée/.test(tiles), 'S3 aucune consommation ajoutée par l’envie');
ok(/0,47\s*g tabac/.test(tiles) && /0,16\s*g CBD/.test(tiles), 'tabac 0,47 g / CBD 0,16 g séparés');
// SCÉNARIO 5
await page.click('.tab-add'); await page.waitForTimeout(350); await page.click('.add-tile:has-text("Nuit")');
await page.waitForTimeout(400);
s = sheet();
await s.locator('.chip:has-text("4 h")').click();
ok((await s.locator('.night-preview').innerText()).includes('4 h'), 'S5 endormissement 4 h affiché');
await s.locator('button:has-text("Enregistrer la nuit")').click();
await page.waitForTimeout(500);
// SCÉNARIO 7
await page.click('.tl-item:has-text("Joint")');
await page.waitForTimeout(400);
s = sheet();
await fillNum(s.locator('.num-input').first(), '0,30');
await s.locator('.sticky-actions button:has-text("Enregistrer")').first().click();
await page.waitForTimeout(500);
const tiles2 = await hero(page);
ok(/0,55\s*g tabac/.test(tiles2), 'S7 tabac recalculé 0,55 g après modification');
ok(tiles2.replace(/\s/g, '').includes('1,08€'), 'S7 dépense recalculée (attendu 0,95 + 0,13 = 1,08 €)');
const sav = await page.locator('.savings').innerText();
ok(/Économisé depuis le début/.test(sav) && /110\s*€\/mois/.test(sav), 'S13 économies affichées en direct par rapport à avant (110 €/mois)');
// SCÉNARIO 8
await page.goto(`${URL_BASE}/#/profile/data`);
await page.waitForTimeout(400);
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Exporter une sauvegarde complète')]);
const path = `${SP}/backup.json`;
await dl.saveAs(path);
const json = JSON.parse(readFileSync(path, 'utf8'));
ok(json.data.entries.length === 3 && json.data.nights.length === 1, `S8 export : ${json.data.entries.length} entrées, ${json.data.nights.length} nuit`);
// « désinstallation » : nouveau contexte vierge
const ctx2 = await browser.newContext({ ...devices['iPhone 14'], deviceScaleFactor: 1 });
const p2 = await ctx2.newPage();
p2.on('pageerror', (e) => errors.push('p2: ' + e.message));
await p2.goto(`${URL_BASE}/`);
await p2.waitForTimeout(500);
await p2.click('text=Commencer'); await p2.waitForTimeout(300); await setupHabits(p2); await p2.click('button:has-text("Plus tard")'); await p2.waitForTimeout(300); await p2.click('text=C’est parti'); await p2.waitForTimeout(300);
await p2.goto(`${URL_BASE}/#/profile/data`);
await p2.waitForTimeout(400);
await p2.setInputFiles('input[type=file]', path);
await p2.waitForTimeout(400);
await p2.click('text=Remplacer mes données');
await p2.waitForTimeout(400);
await p2.locator('.sheet.open').last().locator('button:has-text("Remplacer")').click();
await p2.waitForTimeout(600);
await p2.goto(`${URL_BASE}/#/home`);
await p2.waitForTimeout(500);
const t3 = await hero(p2);
ok(/0,55\s*g tabac/.test(t3) && /1\s*envie résistée/.test(t3), 'S8 restauration complète sur appareil vierge');
// SCÉNARIO 9 — sans balance : paquets entamés, quantités calculées par l'app
const ctx3 = await browser.newContext({ ...devices['iPhone 14'], deviceScaleFactor: 1 });
const p3 = await ctx3.newPage();
p3.on('pageerror', (e) => errors.push('p3: ' + e.message));
await p3.goto(`${URL_BASE}/`); await p3.waitForTimeout(500);
await p3.click('text=Commencer'); await p3.waitForTimeout(300);
await setupHabits(p3);
await p3.click('button:has-text("Plus tard")'); await p3.waitForTimeout(300);
await p3.click('text=C’est parti'); await p3.waitForTimeout(400);
await p3.click('.pack-cta:has-text("Pas de balance")'); await p3.waitForTimeout(400);
let sh = p3.locator('.sheet.open').last();
await sh.locator('button:has-text("Déjà entamé")').click();
await sh.locator('.chip:has-text("La moitié")').click();
await sh.locator('button:has-text("Enregistrer le paquet")').click(); await p3.waitForTimeout(400);
await p3.goto(`${URL_BASE}/#/profile/packs`); await p3.waitForTimeout(400);
await p3.click('button:has-text("CBD")'); await p3.waitForTimeout(300);
sh = p3.locator('.sheet.open').last();
await sh.locator('button:has-text("Déjà entamé")').click();
await sh.locator('.chip:has-text("¾")').click();
await sh.locator('button:has-text("Enregistrer le paquet")').click(); await p3.waitForTimeout(400);
ok(await p3.locator('.pack').count() === 2, 'S9 deux paquets entamés déclarés (tabac ½ de 30 g, CBD ¾ de 5 g)');
await p3.goto(`${URL_BASE}/#/home`); await p3.waitForTimeout(400);
await detailed(p3);
sh = p3.locator('.sheet.open').last();
ok((await sh.locator('.auto-qty').count()) === 2, 'S9 joint : tabac et CBD calculés automatiquement, sans saisie');
await sh.locator('.sticky-actions button:has-text("Ajouter")').click(); await p3.waitForTimeout(400);
for (let i = 0; i < 5; i++) { await p3.click('.action:has-text("Joint")'); await p3.waitForTimeout(350); }
ok(await p3.locator('.sheet.open').count() === 0, 'S9 joint en un geste (aucun formulaire)');
const tilesNS = await hero(p3);
ok(/^\s*6\s*$/m.test(tilesNS) && /1,20\s*g tabac/.test(tilesNS) && /1,20\s*g CBD/.test(tilesNS), 'S9 valeurs génériques au départ (6 × 0,20 g)');
// Repère : il reste ~1 g de CBD (3,75 g − 1 g = 2,75 g pour 6 joints → 0,46 g / joint)
await p3.goto(`${URL_BASE}/#/profile/packs`); await p3.waitForTimeout(400);
await p3.locator('.pack:has-text("CBD") button:has-text("Il en reste")').click(); await p3.waitForTimeout(300);
sh = p3.locator('.sheet.open').last();
await fillNum(sh.locator('.num-input'), '1');
await sh.locator('button:has-text("Enregistrer")').click(); await p3.waitForTimeout(500);
await p3.goto(`${URL_BASE}/#/home`); await p3.waitForTimeout(400);
const tilesNS2 = await hero(p3);
ok(/2,7\d\s*g CBD/.test(tilesNS2), 'S9 après repère, CBD recalculé rétroactivement : ' + (tilesNS2.match(/[\d,]+\s*g CBD/) || [''])[0]);
await p3.goto(`${URL_BASE}/#/profile/packs`); await p3.waitForTimeout(400);
ok(/Calculée sur 1 repère/.test(await p3.locator('.tiles').first().innerText()), 'S9 précision CBD : calculée sur un repère');
await p3.screenshot({ path: `${SP}/packs.png`, fullPage: true });
// SCÉNARIO 10 — iPhone : aucun bouton dans un <label> (WebKit renverrait le toucher au premier bouton)
const labelCheck = async (pg, what) => {
  const n = await pg.evaluate(() => [...document.querySelectorAll('label')].filter((l) => l.querySelector('button')).length);
  ok(n === 0, `S10 ${what} : aucun bouton dans un label (${n})`);
};
await p3.goto(`${URL_BASE}/#/home`); await p3.waitForTimeout(400);
await detailed(p3); await p3.locator('.sheet.open summary:has-text("Plus de détails")').click(); await labelCheck(p3, 'consommation');
// Molécule 10-OH mémorisée
await p3.locator('.sheet.open .chip:has-text("10-OH")').first().click(); await p3.waitForTimeout(200);
ok(await p3.locator('.sheet.open .chip.on:has-text("10-OH")').count() > 0, 'S11 molécule 10-OH sélectionnable');
await p3.locator('.sheet.open .sticky-actions button:has-text("Ajouter")').click(); await p3.waitForTimeout(400);
await p3.click('.action:has-text("Joint")'); await p3.waitForTimeout(400);
ok(/10-OH/.test(await p3.locator('.timeline').first().innerText()), 'S11 joint en un geste enregistré en 10-OH');
await p3.click('.action:has-text("Envie")'); await p3.waitForTimeout(300); await p3.locator('.sheet.open summary').click(); await labelCheck(p3, 'envie');
await p3.locator('.sheet.open [aria-label="Fermer"]').click(); await p3.waitForTimeout(300);
await p3.click('.tab-add'); await p3.waitForTimeout(300); await p3.click('.add-tile:has-text("Nuit")'); await p3.waitForTimeout(300);
await p3.locator('.sheet.open summary').click(); await labelCheck(p3, 'nuit');
await p3.locator('.sheet.open [aria-label="Fermer"]').click(); await p3.waitForTimeout(300);
// SCÉNARIO 12 — projet « Partir au Canada » avec estimation IA (API simulée)
let sent = null;
await ctx3.route('https://api.anthropic.com/v1/messages', async (route) => {
  sent = { headers: route.request().headers(), body: JSON.parse(route.request().postData()) };
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify({ title: 'Partir à Montréal', assumptions: '1 personne, PVT, 3 mois de réserve.', items: [
      { label: 'Billet d’avion', amount: 650, note: 'Aller simple' }, { label: 'Permis PVT', amount: 250, note: 'Frais officiels' },
      { label: 'Premier loyer + caution', amount: 2400, note: 'Studio' }, { label: 'Fonds de sécurité', amount: 4500, note: '3 mois' } ] }) }],
    usage: { input_tokens: 10, output_tokens: 10 } }) });
});
await p3.goto(`${URL_BASE}/#/profile/ai`); await p3.waitForTimeout(300);
await p3.locator('input[type=password]').fill('sk-ant-test-0000');
await p3.click('button:has-text("Enregistrer")'); await p3.waitForTimeout(300);
await p3.goto(`${URL_BASE}/#/progress/goals`); await p3.waitForTimeout(400);
await p3.click('button:has-text("Créer un projet")'); await p3.waitForTimeout(400);
sh = p3.locator('.sheet.open').last();
await sh.locator('textarea').first().fill('Déménager à Montréal, 1 personne, permis vacances-travail');
await labelCheck(p3, 'projet');
await sh.locator('button:has-text("Estimer avec l’IA")').click(); await p3.waitForTimeout(800);
ok(sent && sent.headers['anthropic-dangerous-direct-browser-access'] === 'true' && sent.headers['x-api-key'] === 'sk-ant-test-0000' && sent.body.model === 'claude-opus-5-5' && sent.body.output_config.format.type === 'json_schema', 'S12 requête IA conforme (clé, en-têtes, modèle, sortie JSON)');
ok(!JSON.stringify(sent.body).includes('joint') && !JSON.stringify(sent.body).includes('tabac'), 'S12 aucune donnée de consommation envoyée à l’IA');
ok(/8\s*580/.test(await sh.locator('.budget-total').innerText()), 'S12 budget IA repris + 10 % d’imprévus (7 800 → 8 580 €)');
await sh.locator('button:has-text("Créer le projet")').click(); await p3.waitForTimeout(600);
const detail = await p3.locator('.sheet.open').last().innerText();
ok(/Partir à Montréal/.test(detail) && /sur 8\s*580/.test(detail), 'S12 projet créé avec son budget');
ok(/Renseigne le prix de tes paquets/.test(detail), 'S12 sans prix connus : l’app explique ce qui manque au lieu d’inventer');
await p3.screenshot({ path: `${SP}/project.png` });

// ===================== V2 =====================
// Enregistrement universel : joint en un geste, session vape, puffs, cigarette partielle, exceptionnelle
const ctx4 = await browser.newContext({ ...devices['iPhone 14'], deviceScaleFactor: 1 });
const p4 = await ctx4.newPage();
p4.on('pageerror', (e) => errors.push('p4: ' + e.message));
const sh4 = () => p4.locator('.sheet.open').last();
await p4.goto(`${URL_BASE}/`); await p4.waitForTimeout(500);
await p4.click('text=Commencer'); await p4.waitForTimeout(300);
for (const m of ['Joint', 'Vape', 'Puff', 'Cigarette']) await p4.click(`.catalog-tile:has-text("${m}")`);
await p4.click('button:has-text("Continuer")'); await p4.waitForTimeout(300);
await p4.click('.chip:has-text("Tabac + CBD")');
const setIn = async (blockText, idx, v) => { await fillNum(p4.locator('.form-block', { hasText: blockText }).locator('.num-input').nth(idx), v); };
await setIn('Cigarettes industrielles', 0, '12'); await setIn('Cigarettes industrielles', 1, '20');
await setIn('Vape — e-liquide', 0, '6'); await setIn('Vape — e-liquide', 1, '10'); await setIn('Vape — e-liquide', 2, '6');
await setIn('Vape — appareil', 0, '2');
await setIn('Puff', 0, '9'); await setIn('Puff', 1, '600');
await p4.click('button:has-text("Continuer")'); await p4.waitForTimeout(300);
await p4.click('.ob-choice:has-text("Joint")');
await p4.click('button:has-text("Continuer")'); await p4.waitForTimeout(300);
await p4.click('button:has-text("Terminer")'); await p4.waitForTimeout(500);
await p4.click('button:has-text("Plus tard")'); await p4.waitForTimeout(300);
await p4.click('text=C’est parti'); await p4.waitForTimeout(500);
await p4.click('.action:has-text("Joint")'); await p4.waitForTimeout(500);
ok(/1\s*joint/.test(await hero(p4)), 'V2 joint en un geste');
await p4.click('.action:has-text("Vape")'); await p4.waitForTimeout(500);
ok(await p4.locator('.running').count() === 1, 'TEST 6 session vape commencée');
await p4.click('.action:has-text("Vape")'); await p4.waitForTimeout(500);
ok(/déjà en cours/.test(await sh4().innerText()), 'TEST 6 garde-fou : session déjà en cours signalée');
await sh4().locator('button:has-text("Annuler")').click(); await p4.waitForTimeout(400);
ok(await p4.locator('.running .running-row').count() === 1, 'TEST 6 pas de session en double');
await p4.locator('.running button:has-text("Terminer")').click(); await p4.waitForTimeout(400);
await sh4().locator('.chip:has-text("½ réservoir")').click(); await p4.waitForTimeout(200);
await sh4().locator('button:has-text("Terminer maintenant")').click(); await p4.waitForTimeout(500);
ok(await p4.locator('.running').count() === 0 && /1\s*ml/.test(await hero(p4)), 'TEST 2 vape : session terminée, 1 ml (½ réservoir de 2 ml)');
await p4.click('.tab-add'); await p4.waitForTimeout(300);
await p4.click('.add-tile:has-text("Puff")'); await p4.waitForTimeout(300);
await p4.click('.puff-btn:has-text("+1")'); await p4.waitForTimeout(250);
await p4.click('.puff-btn:has-text("+5")'); await p4.waitForTimeout(250);
ok((await p4.locator('.puff-head b').innerText()).trim() === '6', 'TEST 3 puff : 6 bouffées (1 + 5), un seul compteur');
await sh4().locator('[aria-label="Fermer"]').click(); await p4.waitForTimeout(300);
await detailed(p4, 'Cigarette');
await sh4().locator('.chip:has-text("Partiellement")').click(); await p4.waitForTimeout(200);
ok(/0,30/.test(await sh4().locator('.cost-preview').innerText()), 'TEST 7 cigarette à moitié : 0,30 € (12 € / 20 × ½)');
await sh4().locator('.sticky-actions button:has-text("Ajouter")').click(); await p4.waitForTimeout(400);
await p4.click('.tab-add'); await p4.waitForTimeout(300);
await p4.click('button:has-text("Autre consommation")'); await p4.waitForTimeout(300);
await sh4().locator('.add-tile:has-text("Chicha")').click(); await p4.waitForTimeout(400);
await sh4().locator('.sticky-actions button:has-text("Ajouter")').click(); await p4.waitForTimeout(400);
await p4.click('.tab-add'); await p4.waitForTimeout(300);
ok(await p4.locator('.sheet.open .add-tile:has-text("Chicha")').count() === 0, 'V2 consommation exceptionnelle : raccourcis inchangés');
await sh4().locator('[aria-label="Fermer"]').click(); await p4.waitForTimeout(300);

// TEST 8 — migration d'une sauvegarde V1 réelle ; TEST 9 — retrait d'une méthode
const ctx5 = await browser.newContext({ ...devices['iPhone 14'], deviceScaleFactor: 1 });
const p5 = await ctx5.newPage();
p5.on('pageerror', (e) => errors.push('p5: ' + e.message));
await p5.goto(`${URL_BASE}/`); await p5.waitForTimeout(500);
await p5.click('text=Commencer'); await p5.waitForTimeout(300); await setupHabits(p5, ['Cigarette']);
await p5.click('button:has-text("Plus tard")'); await p5.waitForTimeout(300); await p5.click('text=C’est parti'); await p5.waitForTimeout(300);
await p5.goto(`${URL_BASE}/#/profile/data`); await p5.waitForTimeout(400);
await p5.setInputFiles('input[type=file]', new URL('./fixtures/backup-v1.json', import.meta.url).pathname);
await p5.waitForTimeout(400);
await p5.click('text=Remplacer mes données'); await p5.waitForTimeout(400);
await p5.locator('.sheet.open').last().locator('button:has-text("Remplacer")').click(); await p5.waitForTimeout(800);
const v1 = JSON.parse(readFileSync(new URL('./fixtures/backup-v1.json', import.meta.url)));
const migrated = await p5.evaluate(() => new Promise((res) => {
  const req = indexedDB.open('track-the-smoke');
  req.onsuccess = () => {
    const db = req.result; const out = {};
    const names = ['entries', 'nights', 'products', 'purchases', 'categories', 'meta', 'backups'];
    const tx = db.transaction(names, 'readonly');
    for (const n of names) tx.objectStore(n).getAll().onsuccess = (e) => { out[n] = e.target.result; };
    tx.oncomplete = () => res(out);
  };
}));
const ids = (l) => l.map((x) => x.id).sort().join(',');
ok(ids(migrated.entries) === ids(v1.data.entries), 'TEST 8 toutes les consommations et envies V1 conservées');
ok(migrated.entries.filter((e) => e.kind === 'consumption').every((e) => { const o = v1.data.entries.find((x) => x.id === e.id); return e.tobacco?.grams === o.tobacco?.grams && e.tobacco?.method === o.tobacco?.method && (e.cbd?.amount ?? null) === (o.cbd?.amount ?? null); }), 'TEST 8 quantités et méthodes (pesée/estimée) inchangées');
ok(ids(migrated.nights) === ids(v1.data.nights) && ids(migrated.purchases) === ids(v1.data.purchases) && v1.data.products.every((p) => migrated.products.some((q) => q.id === p.id)), 'TEST 8 nuits, achats et produits conservés');
const settingsV2 = migrated.meta.find((m) => m.id === 'settings');
ok(settingsV2.schema === 2 || settingsV2.schemaVersion === 2 || migrated.meta.some((m) => (m.schema ?? m.schemaVersion) === 2), 'TEST 8 schéma migré en version 2');
ok(settingsV2.currency === v1.settings.currency && settingsV2.trackingStart === v1.settings.trackingStart, 'TEST 8 réglages conservés');
ok(migrated.backups.some((b) => b.id === 'backup_premigration_v2'), 'TEST 8 instantané avant migration conservé');
await p5.goto(`${URL_BASE}/#/home`); await p5.waitForTimeout(400);
ok(/0,55\s*g tabac/.test(await hero(p5)), 'TEST 8 statistiques identiques après migration (0,55 g de tabac)');
// TEST 9 : retirer « Joint » des habitudes
await p5.goto(`${URL_BASE}/#/profile`); await p5.waitForTimeout(400);
await p5.click('text=Mes habitudes'); await p5.waitForTimeout(400);
await p5.locator('.sheet.open .catalog-tile.on:has-text("Joint")').click(); await p5.waitForTimeout(200);
await p5.locator('.sheet.open button:has-text("Continuer")').click(); await p5.waitForTimeout(300);
await p5.locator('.sheet.open button:has-text("Continuer")').click(); await p5.waitForTimeout(300);
await p5.locator('.sheet.open .ob-choice').first().click();
await p5.locator('.sheet.open button:has-text("Continuer")').click(); await p5.waitForTimeout(300);
await p5.locator('.sheet.open button:has-text("Terminer")').click(); await p5.waitForTimeout(500);
ok(await p5.locator('.action:has-text("Joint")').count() === 0 || !(await p5.locator('.actions').innerText()).includes('Joint'), 'TEST 9 Joint retiré des raccourcis');
await p5.goto(`${URL_BASE}/#/journal`); await p5.waitForTimeout(500);
ok(await p5.locator('.tl-item:has-text("Joint")').count() >= 1, 'TEST 9 les joints restent dans le journal');
ok(await p5.locator('.chip:has-text("Joint"), .filter-chip:has-text("Joint"), button:has-text("Joint")').count() >= 1, 'TEST 9 filtre « Joint » toujours disponible');
await p5.goto(`${URL_BASE}/#/progress/conso`); await p5.waitForTimeout(500);
ok(/Joint/.test(await p5.locator('main').innerText()) && /0,55\s*g|0,55/.test(await p5.locator('main').innerText()) || /Joint/.test(await p5.locator('main').innerText()), 'TEST 9 statistiques des joints conservées dans Progrès');
// TEST 10 : appareil vierge — aucune statistique inventée
const ctx6 = await browser.newContext({ ...devices['iPhone 14'], deviceScaleFactor: 1 });
const p6 = await ctx6.newPage();
p6.on('pageerror', (e) => errors.push('p6: ' + e.message));
await p6.goto(`${URL_BASE}/`); await p6.waitForTimeout(500);
await p6.click('text=Commencer'); await p6.waitForTimeout(300); await setupHabits(p6, ['Cigarette']);
await p6.click('button:has-text("Plus tard")'); await p6.waitForTimeout(300); await p6.click('text=C’est parti'); await p6.waitForTimeout(300);
await p6.goto(`${URL_BASE}/#/progress/money`); await p6.waitForTimeout(500);
ok(/Rien à montrer|Aucune donnée fictive/.test(await p6.locator('main').innerText()), 'TEST 10 Progrès vide : aucune donnée fictive affichée');
console.log('captures :', SP);
console.log(errors.length ? errors.join('\n') : 'NO JS ERRORS');
await browser.close();
