import assert from 'node:assert/strict';
import test from 'node:test';
import { communityPanelMessage, handleCommunityPanelInteraction, normalizeCommunityPanel, parseCommunityEmoji } from '../lib/community-panel.js';

const guild = '123456789012345678';
const bot = '223456789012345678';
const config = { title: 'مجتمعنا', color: '#a479ff', tileColor: '#63d8a5', buttons: [
  { label: 'القناة', emoji: '📢', kind: 'channel', target: '323456789012345678' },
  { label: 'الموقع', emoji: '', kind: 'link', target: 'https://example.com/' },
  { label: 'الترحيب', emoji: '<:hello:423456789012345678>', kind: 'text', target: 'مرحباً بك', style: 3 },
] };

test('community controls render beneath the card with Discord styles and emoji', async () => {
  const result = await communityPanelMessage(config, 'مجتمع', guild);
  assert.equal(result.files[0].attachment.subarray(1, 4).toString(), 'PNG');
  assert.equal(result.components[0].components.length, 3);
  assert.equal(result.components[0].components[0].url, `https://discord.com/channels/${guild}/323456789012345678`);
  assert.equal(result.components[0].components[1].style, 5);
  assert.equal(result.components[0].components[2].style, 3);
  assert.equal(result.components[0].components[2].emoji.id, '423456789012345678');
});

test('community links and images reject unsafe sources', () => {
  assert.throws(() => normalizeCommunityPanel({ buttons: [{ label: 'x', kind: 'link', target: 'javascript:alert(1)' }] }));
  assert.throws(() => normalizeCommunityPanel({ bannerUrl: 'https://example.com/image.png', buttons: config.buttons }));
  assert.throws(() => parseCommunityEmoji('<:bad:123>'));
});

test('community button reply remains scoped to guild, bot and command', async () => {
  let query;
  let reply;
  const pool = { query: async (sql, params) => { query = params; return { rows: [{ panel_config: config }] }; } };
  const interaction = { isButton: () => true, customId: 'diskoko:community:مجتمع:2', guildId: guild, reply: async value => { reply = value; } };
  assert.equal(await handleCommunityPanelInteraction(interaction, pool, bot), true);
  assert.deepEqual(query, [guild, bot, 'مجتمع']);
  assert.equal(reply.content, 'مرحباً بك');
  assert.equal(reply.ephemeral, true);
});

