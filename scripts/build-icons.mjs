// Génère les icônes PNG à partir de assets/icons/icon.svg (Playwright requis).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'icons');
const svg = await readFile(join(dir, 'icon.svg'), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
const targets = [
  ['icon-192.png', 192, false], ['icon-512.png', 512, false], ['apple-touch-icon.png', 180, true], ['icon-maskable-512.png', 512, true],
];
for (const [name, size, full] of targets) {
  // Apple et « maskable » : fond plein (iOS applique ses propres arrondis), symbole réduit pour la zone sûre.
  const inner = full ? svg.replace('rx="112"', 'rx="0"').replace('translate(256 256)', 'translate(256 256) scale(.8)') : svg;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:${full ? '#101116' : 'transparent'}">${inner.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: join(dir, name), omitBackground: !full });
  console.log('✓', name);
}
await browser.close();
