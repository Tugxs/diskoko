import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Events } from 'discord.js';
import { enqueueCustomerRoleSync, registerMemberJoinHandlers } from '../discord-bot.js';

const member = { id: '123', guild: { id: 'guild-1' } };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('customer role queue only runs for its configured guild', async () => {
  const calls = [];
  const pool = { query: async (_sql, values) => { calls.push(values[0]); } };
  assert.equal(await enqueueCustomerRoleSync(member, pool, () => ({ guildId: 'guild-2' })), false);
  assert.equal(await enqueueCustomerRoleSync(member, pool, () => ({ guildId: 'guild-1' })), true);
  assert.deepEqual(calls, ['123']);
});

test('welcome and customer roles use independent member-join listeners', async () => {
  const client = new EventEmitter();
  const calls = [];
  registerMemberJoinHandlers(client, {}, {
    welcome: async () => { calls.push('welcome'); },
    roles: async () => { calls.push('roles'); },
  });
  assert.equal(client.listenerCount(Events.GuildMemberAdd), 2);
  client.emit(Events.GuildMemberAdd, member);
  await tick();
  assert.deepEqual(calls, ['welcome', 'roles']);
});

test('failure in either service does not stop the other member-join listener', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    for (const failing of ['welcome', 'roles']) {
      const client = new EventEmitter();
      const calls = [];
      registerMemberJoinHandlers(client, {}, {
        welcome: async () => { if (failing === 'welcome') throw Error('welcome unavailable'); calls.push('welcome'); },
        roles: async () => { if (failing === 'roles') throw Error('roles unavailable'); calls.push('roles'); },
      });
      client.emit(Events.GuildMemberAdd, member);
      await tick();
      assert.deepEqual(calls, [failing === 'welcome' ? 'roles' : 'welcome']);
    }
  } finally { console.error = originalError; }
});
