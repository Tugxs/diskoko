import test from 'node:test';
import assert from 'node:assert/strict';
import { GuardedLavalinkPlayer } from '../lib/guarded-lavalink-player.js';

const connection = { serverUpdate: { token: 'test-only', endpoint: 'voice.example' }, sessionId: 'voice-session', channelId: 'room' };
const expired = () => Object.assign(new Error('Session expired'), { status: 404 });

test('initial voice update failure reaches the awaited join caller', async () => {
  const player = new GuardedLavalinkPlayer('guild-a', { rest: { updatePlayer: async () => { throw expired(); } } });
  await assert.rejects(player.sendServerUpdate(connection), { status: 404 });
});

test('a late Lavalink 404 is handled locally instead of becoming an unhandled rejection', async () => {
  let fail = false;
  const player = new GuardedLavalinkPlayer('guild-a', { rest: { updatePlayer: async () => { if (fail) throw expired(); } } });
  await player.sendServerUpdate(connection);
  const failures = [];
  player.on('voiceError', error => failures.push(error.status));
  fail = true;
  void player.sendServerUpdate(connection);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(failures, [404]);
});

test('a retired player and another guild do not crash on a late update', async () => {
  let fail = false;
  const affected = new GuardedLavalinkPlayer('guild-a', { rest: { updatePlayer: async () => { if (fail) throw expired(); } } });
  let healthyUpdates = 0;
  const healthy = new GuardedLavalinkPlayer('guild-b', { rest: { updatePlayer: async () => { healthyUpdates++; } } });
  await affected.sendServerUpdate(connection);
  fail = true;
  await affected.sendServerUpdate(connection);
  await healthy.sendServerUpdate(connection);
  assert.equal(healthyUpdates, 1);
});
