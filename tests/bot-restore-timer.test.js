import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreAiBots, stopAllAiBots } from '../lib/ai-bot-connections.js';

test('scheduled private-bot restore completes when a connection was removed before its timer fires', async () => {
  let timerQueries = 0;
  const pool = { async query(sql) {
    if (sql.includes("WHERE token_encrypted <>")) return { rows: [{ guild_id: '111111111111111111', bot_user_id: '222222222222222222' }] };
    if (sql.includes('bot_gateway_cooldown')) return { rows: [] };
    if (sql.includes('WHERE guild_id=$1 AND bot_user_id=$2')) { timerQueries++; return { rows: [] }; }
    throw new Error('Unexpected database request');
  } };
  try {
    await restoreAiBots(pool);
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(timerQueries, 1);
  } finally {
    await stopAllAiBots();
  }
});
