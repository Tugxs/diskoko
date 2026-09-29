import test from 'node:test';
import assert from 'node:assert/strict';
import { guildBotPermissionSummary, listCustomerBots, mountAiBotConnections, stopAllAiBots, syncAiBots } from '../lib/ai-bot-connections.js';

test('bot permission check combines guild roles and reports rank without promising channel access', () => {
  const guildId = '12345678901234567';
  const result = guildBotPermissionSummary({ roles: ['staff'] }, [
    { id: guildId, permissions: String(1n << 10n), position: 0 },
    { id: 'staff', permissions: String((1n << 11n) | (1n << 28n)), position: 4 },
  ], guildId);
  assert.equal(result.manageRoles, true);
  assert.equal(result.sendMessages, true);
  assert.equal(result.manageChannels, false);
  assert.equal(result.highestRolePosition, 4);
});

test('registry lists multiple bot identities and exactly one selected executor', async () => {
  const pool = { query: async sql => ({ rows: sql.includes('FROM customer_bot_registry')
    ? [
      { bot_user_id: 'bot-a', bot_name: 'Alpha', label: 'الترحيب', gateway_seen_at: new Date() },
      { bot_user_id: 'bot-b', bot_name: 'Beta', label: 'الدعم', gateway_seen_at: new Date() },
    ]
    : [{ bot_user_id: 'bot-b', selected_for_server: true }] }) };
  const previous = process.env.BOT_GATEWAY_MODE;
  process.env.BOT_GATEWAY_MODE = 'external';
  try {
    const bots = await listCustomerBots(pool, '12345678901234567');
    assert.equal(bots.length, 2);
    assert.deepEqual(bots.map(bot => bot.selected), [false, true]);
    assert.deepEqual(bots.map(bot => bot.online), [true, true]);
    assert.ok(bots.every(bot => !('token' in bot)));
  } finally {
    if (previous === undefined) delete process.env.BOT_GATEWAY_MODE;
    else process.env.BOT_GATEWAY_MODE = previous;
  }
});

test('worker synchronizes every registered bot rather than only the selected one', async () => {
  const queries = [];
  const pool = { query: async sql => { queries.push(sql); return { rows: sql.includes('FROM customer_bot_registry')
    ? [{ guild_id: '12345678901234567', bot_user_id: 'bot-a', retry_at: null, updated_at: new Date() },
      { guild_id: '12345678901234567', bot_user_id: 'bot-b', retry_at: null, updated_at: new Date() }]
    : [] }; } };
  try {
    await syncAiBots(pool);
    assert.match(queries[0], /customer_bot_registry/);
  } finally { await stopAllAiBots(); }
});

test('choosing another connected bot changes the executor without deleting the first bot', async () => {
  const routes = new Map();
  const app = { get: (path, ...handlers) => routes.set(`GET ${path}`, handlers.at(-1)),
    post: (path, ...handlers) => routes.set(`POST ${path}`, handlers.at(-1)),
    patch: (path, ...handlers) => routes.set(`PATCH ${path}`, handlers.at(-1)),
    delete: (path, ...handlers) => routes.set(`DELETE ${path}`, handlers.at(-1)) };
  let selected = 'bot-a';
  const rows = [
    { bot_user_id: 'bot-a', bot_name: 'Alpha', label: 'الترحيب', gateway_seen_at: new Date() },
    { bot_user_id: 'bot-b', bot_name: 'Beta', label: 'الدعم', gateway_seen_at: new Date() },
  ];
  const pool = { query: async (sql, params) => {
    if (sql.includes('INSERT INTO ai_bot_connections')) { selected = params[1]; return { rows: [] }; }
    if (sql.includes('FROM customer_bot_registry WHERE guild_id')) return { rows };
    if (sql.includes('SELECT bot_user_id,selected_for_server FROM ai_bot_connections')) return { rows: [{ bot_user_id: selected, selected_for_server: true }] };
    if (sql.includes('SELECT bot_user_id,bot_name,updated_at')) return { rows: [{ ...rows.find(row => row.bot_user_id === selected), selected_for_server: true }] };
    return { rows: [] };
  } };
  mountAiBotConnections(app, { pool, requireUser: (_req, _res, next) => next(), requireWriteAccess: (_req, _res, next) => next(),
    authorizedGuild: async () => ({ id: '12345678901234567' }), requirePlanCapacity: async () => {}, audit: async () => {} });
  const previous = process.env.BOT_GATEWAY_MODE;
  process.env.BOT_GATEWAY_MODE = 'external';
  try {
    let result;
    await routes.get('POST /api/ai/bots/select')({ user: { id: 1 }, body: { guildId: '12345678901234567', botId: 'bot-b' } },
      { json: value => { result = value; } }, error => { throw error; });
    assert.equal(selected, 'bot-b');
    assert.equal(result.bots.length, 2);
    assert.equal(result.bots.find(bot => bot.id === 'bot-a').selected, false);
    assert.equal(result.bots.find(bot => bot.id === 'bot-b').selected, true);
  } finally {
    if (previous === undefined) delete process.env.BOT_GATEWAY_MODE;
    else process.env.BOT_GATEWAY_MODE = previous;
  }
});
