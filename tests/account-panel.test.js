import test from 'node:test';
import assert from 'node:assert/strict';
import { accountPanelPayload, handleAccountPanelInteraction } from '../lib/account-panel.js';

function interaction(view = 'overview') {
  return {
    customId: `diskoko-account:${view}`, guildId: '1298703504273047552', user: { id: '123456789012345678', username: 'Member', displayAvatarURL: () => 'https://cdn.discordapp.com/avatar.png' },
    isButton: () => true, isStringSelectMenu: () => false,
    deferred: false, async deferReply(options) { this.private = options.ephemeral; this.deferred = true; },
    async editReply(payload) { this.payload = payload; },
  };
}

test('public panel has one attached image and private navigation', () => {
  const payload = accountPanelPayload();
  assert.equal(payload.embeds.length, 1);
  assert.equal(payload.files.length, 1);
  assert.equal(payload.components.length, 2);
  assert.equal(payload.components[0].components[0].options.length, 4);
});

test('unlinked member sees only their link path', async () => {
  const target = interaction();
  const pool = { async query() { return { rows: [] }; } };
  assert.equal(await handleAccountPanelInteraction(target, pool), true);
  assert.equal(target.private, true);
  assert.match(target.payload.content, /غير مربوط/);
});

test('usage is read for the Discord account and shown privately', async () => {
  const target = interaction('usage');
  const calls = [];
  const pool = { async query(sql, params) {
    calls.push(params);
    if (sql.includes('FROM users')) return { rows: [{ id: 8, discord_id: target.user.id, plan: 'business', status: 'active' }] };
    if (sql.includes('FROM subscriptions')) return { rows: [] };
    return { rows: [{ servers: 2, bots: 1, templates: 3, scheduled: 4 }] };
  } };
  assert.equal(await handleAccountPanelInteraction(target, pool), true);
  assert.equal(target.private, true);
  assert.deepEqual(calls, [[target.user.id], [8], [8]]);
  const embed = target.payload.embeds[0].toJSON();
  assert.match(embed.description, /Business/);
  assert.match(embed.fields[0].value, /2\/10/);
});
