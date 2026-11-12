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
const inputs = page.locator('.ob-price input');
const vals = ['15', '30', '50', '10', '1,6', '32', '1', '50', '1,2', '120'];
for (let i = 0; i < vals.length; i++) await fillNum(inputs.nth(i), vals[i]);
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
ok(cost.replace(/\s/g, '') === '≈0,97€', `S1 coût du joint = ${cost} (attendu 0,97 €)`);
await s.locator('.sticky-actions button:has-text("Ajouter")').click();
await page.waitForTimeout(500);
// SCÉNARIO 2
await detailed(page, 'Roulée');
await page.waitForTimeout(400);
s = sheet();
ok(await s.locator('h4:has-text("CBD")').count() === 0, 'S2 aucune section CBD pour une roulée');
await s.locator('.segmented button:has-text("Estimée")').first().click();
await fillNum(s.locator('.num-input').first(), '0,25');
ok((await s.locator('.cost-preview b').innerText()).replace(/\s/g, '') === '≈0,15€', 'S2 coût roulée 0,125+0,02 → 0,15 €');
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
await page.click('.tl-item:has-text("Joint tabac")');
await page.waitForTimeout(400);
s = sheet();
await fillNum(s.locator('.num-input').first(), '0,30');
await s.locator('.sticky-actions button:has-text("Enregistrer")').first().click();
await page.waitForTimeout(500);
const tiles2 = await hero(page);
ok(/0,55\s*g tabac/.test(tiles2), 'S7 tabac recalculé 0,55 g après modification');
ok(tiles2.replace(/\s/g, '').includes('1,16€'), 'S7 dépense recalculée (attendu 1,16 €)');
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
await p2.click('text=Commencer'); await p2.waitForTimeout(300); await p2.click('button:has-text("Plus tard")'); await p2.waitForTimeout(300); await p2.click('text=C’est parti'); await p2.waitForTimeout(300);
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
await p3.click('button:has-text("Plus tard")'); await p3.waitForTimeout(300);
await p3.click('text=C’est parti'); await p3.waitForTimeout(400);
await p3.click('.pack-cta'); await p3.waitForTimeout(400);
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
ok(/Ajustée/.test(await p3.locator('.tiles').first().innerText()), 'S9 précision CBD : ajustée sur un repère');
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
ok(/10-OH/.test(await p3.locator('.sheet.open .form-block').nth(1).innerText()), 'S11 molécule 10-OH sélectionnable');
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
console.log('captures :', SP);
console.log(errors.length ? errors.join('\n') : 'NO JS ERRORS');
await browser.close();
