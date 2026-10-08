import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';
import { handleReadyModuleInteraction } from '../lib/ready-template-modules.js';

const id = '35d2665b-1d15-43cf-a746-24e713df6d86';
const panel = kind => ({ id, guild_id: 'guild', channel_id: 'channel', message_id: 'message', publishing_bot_id: 'bot', config: { kind, title: 'لوحة تجربة', description: 'وصف', buttonLabel: 'ابدأ', color: '#8d72e8', answer: 'إجابة واضحة', subjectLabel: 'موضوع الطلب', detailsLabel: 'تفاصيل الطلب' } });
const interaction = kind => {
  const state = { replies: [], modals: [] };
  return {
    state, customId: `diskoko:module:${id}`, guildId: 'guild', channelId: 'channel', message: { id: 'message' }, client: { user: { id: 'bot' } },
    isButton: () => true, isModalSubmit: () => false, user: { id: 'member' },
    reply: async value => state.replies.push(value), deferReply: async () => {}, editReply: async value => state.replies.push(value), showModal: async value => state.modals.push(value),
  };
};
const pool = row => ({ query: async () => ({ rows: row ? [row] : [] }) });

test('FAQ gives its configured private answer only for the published message and bot', async () => {
  const valid = interaction();
  assert.equal(await handleReadyModuleInteraction(valid, pool(panel('faq'))), true);
  assert.deepEqual(valid.state.replies, ['إجابة واضحة']);
  const stale = interaction(); stale.message.id = 'other';
  assert.equal(await handleReadyModuleInteraction(stale, pool(panel('faq'))), true);
  assert.match(stale.state.replies[0].content, /لم تعد متاحة/);
});

test('form feature opens the configured modal and staff task rejects ordinary members', async () => {
  const suggestion = interaction();
  await handleReadyModuleInteraction(suggestion, pool(panel('suggestions')));
  assert.equal(suggestion.state.modals[0].components[0].components[0].label, 'موضوع الطلب');
  assert.equal(suggestion.state.modals[0].components[1].components[0].label, 'تفاصيل الطلب');
  const task = interaction();
  await handleReadyModuleInteraction(task, pool({ ...panel('tasks'), staff_role_id: 'staff' }));
  assert.equal(task.state.modals.length, 0);
  assert.match(task.state.replies[0].content, /الإدارة/);
});

test('custom form hints and lengths reach the real Discord modal',async()=>{
  const suggestion=interaction();const configured=panel('suggestions');
  Object.assign(configured.config,{subjectPlaceholder:'Short idea',subjectMaxLength:60,detailsPlaceholder:'Explain why',detailsMaxLength:500});
  await handleReadyModuleInteraction(suggestion,pool(configured));
  const inputs=suggestion.state.modals[0].components.map(row=>row.components[0]);
  assert.equal(inputs[0].placeholder,'Short idea');assert.equal(inputs[0].max_length,60);
  assert.equal(inputs[1].placeholder,'Explain why');assert.equal(inputs[1].max_length,500);
});

test('accepted store request can be marked complete by staff without publishing customer details', async () => {
  const updates = [];
  const order = interaction();
  order.customId = `diskoko:module-review:${id}:completed`;
  order.channelId = 'review';
  order.message = { id: 'review-message', edit: async value => updates.push(value) };
  order.memberPermissions = { has: permission => permission === PermissionFlagsBits.ManageGuild };
  const entry = { id, panel_id: id, guild_id: 'guild', review_channel_id: 'review', review_message_id: 'review-message', publishing_bot_id: 'bot', status: 'approved', subject: 'منتج', details: 'التفاصيل', user_id: 'member', config: { kind: 'orders', title: 'الطلبات', color: '#8d72e8' } };
  const db = { query: async sql => sql.includes('UPDATE') ? { rowCount: 1, rows: [{ id }] } : { rows: [entry] } };
  await handleReadyModuleInteraction(order, db);
  assert.match(updates[0].embeds[0].description, /مكتمل/);
  assert.deepEqual(updates[0].components, []);
});
