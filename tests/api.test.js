import test from 'node:test';
import assert from 'node:assert/strict';
import { mountWorkspace, discordChangeFailure } from '../lib/workspace-api.js';
function setup({ locked = true, confirmed = true, authorized = true, unchangedPosition = false, savedStatus = 'draft', reorderFailure = false } = {}) {
  const handlers = new Map(); const calls = []; const writes = [];
  const app = Object.fromEntries(['get', 'post', 'put', 'delete'].map(method => [method, (path, ...fns) => handlers.set(`${method} ${path}`, fns.at(-1))]));
  const plan = { id: '7', user_id: 1, guild_id: 'g', status: savedStatus, plan: { operations: [{ operation_key: 'cat', resource_type: 'category', name: 'Group' }, { operation_key: 'room', resource_type: 'channel', parent_key: 'cat', name: 'new-room' }] } };
  const operations = [{ id: '1', operation_key: 'cat', resource_type: 'category', status: 'succeeded', resource_id: 'category-id', result: {} }, { id: '2', operation_key: 'room', resource_type: 'channel', status: 'failed', result: { message: 'old Discord error' } }];
  if (unchangedPosition || reorderFailure) {
    plan.plan.operations = [{ operation_key: 'room', action: 'update', resource_type: 'channel', resource_id: 'channel-id', name: 'announcements', position: reorderFailure ? 1 : 0, before: { name: reorderFailure ? 'old-name' : 'announcements', position: 0 } }];
    operations.splice(0, operations.length, { id: '2', operation_key: 'room', resource_type: 'channel', status: 'failed', result: { message: 'old Discord error' } });
  }
  const pool = {
    query: async (sql, params) => { writes.push({ sql, params }); if (sql.startsWith('SELECT * FROM change_sets')) return { rows: [plan] }; if (sql.startsWith('SELECT id,guild_id FROM change_sets')) return { rows: [plan] }; if (sql.startsWith('SELECT * FROM change_operations')) return { rows: operations }; return { rows: [], rowCount: 1 }; },
    connect: async () => ({ query: async sql => { writes.push({ sql }); return { rows: sql.startsWith('SELECT * FROM change_operations') ? operations : [{ locked, status: savedStatus }], rowCount: 1 }; }, release() {} }),
  };
  mountWorkspace(app, { pool, requireUser: () => {}, authorizedGuild: async () => authorized ? { id: 'g' } : null, requirePlanCapacity: async () => ({ used: 0, limit: 100 }), audit: async () => {}, templates: {}, makeTemplatePlan: () => {}, botStatus: () => ({}), discordBotFetch: async (url, options) => {
    calls.push({ url, options });
    if (options && reorderFailure && url === '/guilds/g/channels') return { ok: false, status: 400 };
    if (options) return { ok: true, data: { id: 'new-id', ...JSON.parse(options.body) } };
    return { ok: true, data: url === '/users/@me' ? { id: 'bot' } : url.endsWith('/members/bot') ? { roles: [] } : url.endsWith('/roles') ? [{ id: 'g', name: '@everyone', permissions: '8' }] : url.endsWith('/channels') ? [{ id: 'category-id', type: 4, name: 'Group' }, ...((unchangedPosition || reorderFailure) ? [{ id: 'channel-id', type: 0, name: 'announcements', position: 0 }] : [])] : [] };
  } });
  const req = { params: { id: '7' }, user: { id: 1 }, body: { confirmed, guildId: 'g' } };
  const result = { body: null, error: null }; const res = { json: body => { result.body = body; } };
  return { run: async () => handlers.get('post /api/change-sets/:id/apply')(req, res, error => { result.error = error; }), stop: async () => handlers.get('post /api/change-sets/:id/cancel')(req, res, error => { result.error = error; }), calls, writes, result };
}
test('execution preserves the completed parent and original failed operation payload', async () => {
  const task = setup(); await task.run(); assert.equal(task.result.error, null); const mutations = task.calls.filter(call => call.options);
  assert.equal(mutations.length, 1); assert.deepEqual(JSON.parse(mutations[0].options.body), { name: 'new-room', type: 0, parent_id: 'category-id' }); assert.equal(task.result.body.status, 'succeeded');
});
test('a locked guild cannot run a concurrent plan or mark the other job failed', async () => {
  const task = setup({ locked: false }); await task.run(); assert.equal(task.result.error.status, 409); assert.equal(task.calls.length, 0); assert.equal(task.writes.filter(item => item.sql.startsWith('UPDATE')).length, 0);
});
test('apply requires explicit confirmation and matching guild context', async () => {
  const task = setup({ confirmed: false }); await task.run(); assert.equal(task.result.error.status, 400); assert.equal(task.calls.length, 0);
});
test('revoked management access prevents any Discord write', async () => {
  const task = setup({ authorized: false }); await task.run(); assert.equal(task.result.error.status, 403); assert.equal(task.calls.length, 0);
});
test('stopping a partly completed plan preserves its executed work and never deletes its history', async () => {
  const task = setup(); await task.stop(); assert.equal(task.result.error, null); assert.equal(task.result.body.status, 'cancelled');
  assert.equal(task.calls.length, 0);
  assert.ok(task.writes.some(item => item.sql.includes("status='cancelled'")));
  assert.ok(!task.writes.some(item => item.sql.startsWith('DELETE FROM change_sets') || item.sql.startsWith('UPDATE change_operations')));
});
test('editing a channel without changing its order does not send a reorder request', async () => {
  const task = setup({ unchangedPosition: true }); await task.run();
  assert.equal(task.result.error, null);
  assert.equal(task.calls.filter(call => call.options && call.url === '/guilds/g/channels').length, 0);
});

test('failed plans cannot send the same request again', async () => {
  const task = setup({ savedStatus: 'failed' }); await task.run();
  assert.equal(task.result.error.status, 409);
  assert.equal(task.calls.length, 0);
});
test('Discord failures explain the customer action without raw status codes', () => {
  for (const status of [400,401,403,404,429,500]) {
    const message = discordChangeFailure({ status }, { name: 'الإعلانات', resource_type: 'channel' }, true);
    assert.ok(message.includes('الإعلانات'));
    assert.ok(!message.includes(String(status)));
    assert.ok(message.length > 80);
  }
  assert.match(discordChangeFailure({ status:403 }, { name:'مشرف', resource_type:'role' }), /فوق الرتبة/);
});

test('successful settings are charged and preserved when subsequent ordering fails', async () => {
  const task = setup({ reorderFailure: true }); await task.run();
  assert.equal(task.result.error.status, 409);
  const saved = task.writes.find(item => item.sql.startsWith("UPDATE change_operations SET status='failed'"));
  assert.equal(saved.params[0].usage_units, 1);
  assert.equal(saved.params[0].response.name, 'announcements');
  assert.equal(saved.params[2], 'new-id');
});
test('blocked repeated execution does not overwrite history or add another failure', async () => {
  const task = setup({ savedStatus: 'failed' }); await task.run();
  assert.equal(task.writes.filter(item => item.sql.startsWith('UPDATE')).length, 0);
});
