// Le service worker doit précacher chaque module JS : sinon l'app hors ligne casse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test('sw.js précache tous les modules JS', () => {
  const sw = readFileSync('sw.js', 'utf8');
  const missing = walk('js').filter((f) => f.endsWith('.js') && !sw.includes(`'./${f.split('\\').join('/')}'`));
  assert.deepEqual(missing, []);
});
