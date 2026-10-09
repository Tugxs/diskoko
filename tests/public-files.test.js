import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicStaticPath } from '../lib/public-files.js';
import fs from 'node:fs';

test('every browser module dependency is publicly served', () => {
  const visited = new Set();
  function check(file) {
    if (visited.has(file)) return;
    visited.add(file);
    assert.equal(isPublicStaticPath('/' + file), true, file);
    const source = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    for (const match of source.matchAll(/(?:from\s*|import\s*)['"]\.\/([^'"]+)['"]/g)) check(match[1]);
  }
  check('workspace.js');
  check('site-preferences.js');
});

test('site serves its pages and assets without exposing source or internal documents', () => {
  for (const path of ['/', '/index.html', '/plans', '/account.html', '/studio', '/workspace.js', '/ready-library.css', '/button-system.css', '/dashboard-theme.css', '/ai-library-catalog.js', '/ai-design-scene.js', '/ai-ui-language.js', '/ai-library-english.js', '/watch.html', '/watch.js', '/assets/diskoko-logo.png', '/assets/diskoko-coming-soon.jpg']) assert.equal(isPublicStaticPath(path), true, path);
  for (const path of ['/server.js', '/discord-bot.js', '/lib/local-ai.js', '/scripts/local-ai-worker.mjs', '/tests/api.test.js', '/docs/api-contracts-ar.md', '/.env', '/admin-console', '/admin-console.html', '/admin-login.html', '/admin-console.20260921.js']) assert.equal(isPublicStaticPath(path), false, path);
});

