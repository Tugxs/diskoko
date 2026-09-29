import test from 'node:test';
import assert from 'node:assert/strict';
import { handleGuildMemberJoin } from '../discord-bot.js';

test('member join queues customer roles and sends welcome', async () => {
  const calls = [];
  const member = { id: '123', guild: { id: 'guild-1' } };
  const pool = { query: async (_sql, values) => { calls.push(`role:${values[0]}`); } };
  await handleGuildMemberJoin(member, pool, {
    roleConfig: () => ({ guildId: 'guild-1' }),
    welcome: async () => { calls.push('welcome'); },
  });
  assert.deepEqual(calls, ['role:123', 'welcome']);
});

test('role sync failure does not prevent welcome', async () => {
  const member = { id: '123', guild: { id: 'guild-1' } };
  let welcomed = false;
  const originalError = console.error;
  console.error = () => {};
  try {
    await handleGuildMemberJoin(member, { query: async () => { throw Error('database unavailable'); } }, {
      roleConfig: () => ({ guildId: 'guild-1' }),
      welcome: async () => { welcomed = true; },
    });
    assert.equal(welcomed, true);
  } finally { console.error = originalError; }
});
