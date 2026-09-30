import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleCommunityGame } from '../lib/community-games.js';

const guildId = '1298703504273047552';
function button(customId, userId = '100') {
  const replies = [];
  return { customId, guildId, user: { id: userId }, isButton: () => true, isModalSubmit: () => false,
    reply: async value => { replies.push(value); }, replies };
}

test('unrelated buttons remain available to other bot services', async () => {
  assert.equal(await handleCommunityGame(button('other:button'), null), false);
});

test('game card starts a private quiz and prevents duplicate rounds', async () => {
  const first = button('diskoko-games:quiz', 'quiz-user');
  assert.equal(await handleCommunityGame(first, null), true);
  assert.equal(first.replies.length, 1);
  assert.equal(first.replies[0].ephemeral, true);
  assert.equal(first.replies[0].components[0].components.length, 3);
  const second = button('diskoko-games:quiz', 'quiz-user');
  await handleCommunityGame(second, null);
  assert.match(second.replies[0].content, /30 ثانية/);
});

test('scoreboard returns a private empty state', async () => {
  const interaction = button('diskoko-games:board', 'board-user');
  const pool = { query: async () => ({ rows: [] }) };
  await handleCommunityGame(interaction, pool);
  assert.equal(interaction.replies[0].ephemeral, true);
  assert.match(interaction.replies[0].embeds[0].data.description, /لا توجد نتائج/);
});

