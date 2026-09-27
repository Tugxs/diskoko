import test from 'node:test';
import assert from 'node:assert/strict';
import { connectedBotMetadata, botTokenForPublication } from '../lib/ai-bot-connections.js';

test('unselected customer bot does not replace the server executor', async () => {
  const pool = { query: async sql => {
    assert.match(sql, /selected_for_server/);
    return { rows: [{ bot_user_id: '123', bot_name: 'test', selected_for_server: false, gateway_seen_at: null }] };
  } };
  const bot = await connectedBotMetadata(pool, '111111111111111111');
  assert.equal(bot.selected, false);
  assert.equal(await botTokenForPublication(pool, '111111111111111111'), null);
});

test('offline selected customer bot is never silently replaced during publication', async () => {
  const pool = { query: async () => ({ rows: [{ bot_user_id: '123', bot_name: 'test', selected_for_server: true, gateway_seen_at: null }] }) };
  await assert.rejects(botTokenForPublication(pool, '111111111111111111'), /غير متصل/);
});

