import test from 'node:test';
import assert from 'node:assert/strict';
import { connectedBotMetadata, syncAiBots } from '../lib/ai-bot-connections.js';

test('subscription stop clears both scoped heartbeats instead of advertising an offline bot as ready',async()=>{
  const queries=[],guild='123456789012345678',bot='223456789012345678';
  const pool={query:async(sql,p)=>{
    queries.push({sql,p});
    if(sql.startsWith('SELECT guild_id,bot_user_id,retry_at'))return {rows:[{guild_id:guild,bot_user_id:bot}]};
    if(sql.startsWith('SELECT owner_id'))return {rows:[{owner_id:7}]};
    if(sql.includes('FROM users'))return {rows:[{id:7,status:'active'}]};
    if(sql.includes('FROM subscriptions'))return {rows:[{status:'expired'}]};
    return {rows:[]};
  }};
  await syncAiBots(pool);
  const clears=queries.filter(q=>q.sql.includes('SET gateway_seen_at=NULL'));
  assert.equal(clears.length,2);for(const q of clears)assert.deepEqual(q.p,[guild,bot]);
  assert.ok(!queries.some(q=>q.sql.includes('token_encrypted,member_joins')),'must not attempt an expired bot login');
});

test('worker loads the connection version needed to keep a ready customer bot running', async () => {
  const queries = [];
  const pool = { query: async sql => { queries.push(sql); return { rows: [] }; } };
  await syncAiBots(pool);
  assert.match(queries[0], /SELECT .*updated_at FROM customer_bot_registry/);
});

test('website reads a fresh customer bot worker heartbeat', async () => {
  const previous = process.env.BOT_GATEWAY_MODE;
  process.env.BOT_GATEWAY_MODE = 'external';
  const pool = { query: async () => ({ rows: [{ bot_user_id: '123', bot_name: 'Test', updated_at: new Date(), retry_at: null, member_joins: true, gateway_seen_at: new Date() }] }) };
  try {
    const status = await connectedBotMetadata(pool, '12345678901234567');
    assert.equal(status.online, true);
    assert.equal(status.memberJoins, true);
  } finally { if (previous === undefined) delete process.env.BOT_GATEWAY_MODE; else process.env.BOT_GATEWAY_MODE = previous; }
});

test('website marks an expired worker heartbeat offline', async () => {
  const previous = process.env.BOT_GATEWAY_MODE;
  process.env.BOT_GATEWAY_MODE = 'external';
  const pool = { query: async () => ({ rows: [{ bot_user_id: '123', bot_name: 'Test', updated_at: new Date(), retry_at: null, member_joins: true, gateway_seen_at: new Date(Date.now() - 60_000) }] }) };
  try { assert.equal((await connectedBotMetadata(pool, '12345678901234567')).online, false); }
  finally { if (previous === undefined) delete process.env.BOT_GATEWAY_MODE; else process.env.BOT_GATEWAY_MODE = previous; }
});
