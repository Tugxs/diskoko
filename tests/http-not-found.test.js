import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createNotFoundReporter } from '../lib/http-not-found.js';

function finish(middleware, path, statusCode = 404, referer = '') {
  const req = { path, method: 'GET', get: name => name === 'referer' ? referer : undefined };
  const res = new EventEmitter();
  res.statusCode = statusCode;
  let next = false;
  middleware(req, res, () => { next = true; });
  assert.equal(next, true);
  res.emit('finish');
}

test('reports missing paths with same-site context, excluding query data and member ids', () => {
  const entries = [];
  const middleware = createNotFoundReporter({ allowedOrigins: new Set(['https://diskoko.com']), log: (...args) => entries.push(args) });
  finish(middleware, '/api/projects/123456789?token=secret', 404, 'https://diskoko.com/account.html?auth=secret');
  assert.deepEqual(entries, [['HTTP route not found', { method: 'GET', path: '/api/projects/:id', from: '/account.html' }]]);
  finish(middleware, '/ok', 200);
  assert.equal(entries.length, 1);
});

test('bounds scanner logs and resets its deduplication window', () => {
  const entries = [];
  let time = 0;
  const middleware = createNotFoundReporter({ now: () => time, maxPerMinute: 2, log: (...args) => entries.push(args) });
  finish(middleware, '/one', 404, 'https://external.example/private?secret=1');
  finish(middleware, '/one');
  finish(middleware, '/two');
  finish(middleware, '/three');
  assert.equal(entries.length, 2);
  assert.equal(entries[0][1].from, undefined);
  time = 60_000;
  finish(middleware, '/one');
  assert.equal(entries.length, 3);
});
