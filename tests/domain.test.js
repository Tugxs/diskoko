import test from 'node:test';
import assert from 'node:assert/strict';
import { manageable, normalizeOperations, resolveExisting, checkExistingAccess, checkConflict, operationBody, operationUnits, planUsageUnits, channelReorderEntries, connectionState, normalizeSchedule } from '../lib/workspace-domain.js';

test('channel reorder converts a visible category position into a consistent sibling order', () => {
  const channels = [
    { id: 'one', type: 0, parent_id: 'cat', position: 11 },
    { id: 'two', type: 0, parent_id: 'cat', position: 12 },
    { id: 'three', type: 0, parent_id: 'cat', position: 13 },
    { id: 'four', type: 0, parent_id: 'cat', position: 14 },
    { id: 'five', type: 0, parent_id: 'cat', position: 15 },
    { id: 'other', type: 0, parent_id: 'elsewhere', position: 1 },
  ];
  assert.deepEqual(channelReorderEntries(channels, channels[4], 3), [
    { id: 'one', position: 0 }, { id: 'two', position: 1 },
    { id: 'three', position: 2 }, { id: 'five', position: 3 },
    { id: 'four', position: 4 },
  ]);
});
const snapshot = { guildId: 'guild', channels: [{ id: 'category', name: 'Welcome', type: 4 }, { id: 'one', name: 'chat', type: 0, parent_id: 'category' }, { id: 'two', name: 'chat', type: 0, parent_id: null }], roles: [{ id: 'guild', name: '@everyone' }, { id: 'managed', name: 'Bot', managed: true }, { id: 'role', name: 'Member', color: 123 }] };
test('deep channel and role edits validate and preserve Discord settings', () => {
  const role = normalizeOperations([{ resource_type: 'role', action: 'update', resource_id: 'role', name: 'Member', color: 0x9944ee, hoist: true, mentionable: false, permissions: '3072' }], snapshot)[0];
  assert.deepEqual(Object.keys(operationBody(role)).sort(), ['color','hoist','mentionable','name','permissions'].sort());
  assert.equal(operationBody(role).permissions, '3072');
  const channel = normalizeOperations([{ resource_type: 'channel', action: 'update', resource_id: 'one', name: 'chat', rate_limit_per_user: 15, nsfw: false, permission_overwrites: [{ id: 'guild', type: 0, allow: '0', deny: '2048' }] }], snapshot)[0];
  assert.equal(operationBody(channel).rate_limit_per_user, 15);
  assert.equal(operationBody(channel).permission_overwrites[0].deny, '2048');
  assert.throws(() => normalizeOperations([{ resource_type: 'channel', action: 'update', resource_id: 'one', name: 'chat', permission_overwrites: [{ id: 'unknown', type: 0, allow: '1024', deny: '0' }] }], snapshot));
  assert.throws(() => normalizeOperations([{ resource_type: 'channel', action: 'update', resource_id: 'one', name: 'chat', rate_limit_per_user: 21601 }], snapshot));
});
test('an existing same-name resource with different settings cannot be silently reused', () => {
  assert.throws(() => checkExistingAccess({ resource_type: 'role', name: 'Member', color: 0xff00ff }, snapshot.roles.find(role => role.id === 'role')));
  assert.throws(() => checkExistingAccess({ resource_type: 'channel', name: 'chat', rate_limit_per_user: 10 }, snapshot.channels.find(channel => channel.id === 'one')));
});
test('reviewed channel update may intentionally change existing permission overwrites', () => {
  const channel = { id: 'one', name: 'الإعلانات', type: 0, permission_overwrites: [] };
  const op = { action: 'update', resource_type: 'channel', name: 'الإعلانات', permission_overwrites: [{ id: 'guild', type: 0, allow: '0', deny: '2048' }] };
  assert.doesNotThrow(() => checkExistingAccess(op, channel));
});
test('member overrides and channel-specific settings are reviewed before Discord', () => {
  const server = { ...snapshot, channels: [
    { id: 'voice', name: 'صوت', type: 2, bitrate: 64000, user_limit: 0 },
    { id: 'forum', name: 'منتدى', type: 15, available_tags: [{ id: '123456789012345678', name: 'نقاش', moderated: false }] },
  ] };
  const member = '123456789012345679';
  const [voice] = normalizeOperations([{ action: 'update', resource_type: 'channel', resource_id: 'voice', name: 'صوت', bitrate: 96000, rtc_region: null, permission_overwrites: [{ id: member, type: 1, allow: '1024', deny: '2048' }] }], server);
  assert.equal(operationBody(voice).permission_overwrites[0].type, 1);
  assert.equal(operationBody(voice).bitrate, 96000);
  assert.equal(operationUnits(voice), 3);
  const [forum] = normalizeOperations([{ action: 'update', resource_type: 'channel', resource_id: 'forum', name: 'منتدى', default_forum_layout: 2, available_tags: [{ id: '123456789012345678', name: 'إعلانات' }] }], server);
  assert.equal(operationBody(forum).default_forum_layout, 2);
  assert.throws(() => checkConflict(forum, { ...server.channels[1], available_tags: [{ id: '123456789012345678', name: 'تغيّر خارجي' }] }));
  assert.throws(() => normalizeOperations([{ action: 'update', resource_type: 'channel', resource_id: 'voice', name: 'صوت', topic: 'غير مدعوم' }], server));
  assert.throws(() => normalizeOperations([{ action: 'update', resource_type: 'channel', resource_id: 'forum', name: 'منتدى', available_tags: [{ id: 'غير موجود', name: 'خطأ' }] }], server));
});
test('role appearance validates emoji and enhanced colors before Discord', () => {
  const server = { ...snapshot, roles: [...snapshot.roles.filter(role => role.id !== 'role'), { id: 'role', name: 'Member', color: 0, colors: { primary_color: 0, secondary_color: null, tertiary_color: null }, unicode_emoji: null }] };
  const [op] = normalizeOperations([{ action: 'update', resource_type: 'role', resource_id: 'role', name: 'Member', colors: { primary_color: 0x7766aa, secondary_color: 0x334455, tertiary_color: null }, unicode_emoji: '⭐' }], server);
  assert.equal(operationBody(op).unicode_emoji, '⭐');
  assert.equal(operationBody(op).icon, null);
  assert.equal(operationUnits(op), 2);
  assert.throws(() => normalizeOperations([{ action: 'update', resource_type: 'role', resource_id: 'role', name: 'Member', unicode_emoji: 'hello' }], server));
  assert.throws(() => normalizeOperations([{ action: 'update', resource_type: 'role', resource_id: 'role', name: 'Member', colors: { primary_color: 2, secondary_color: 3, tertiary_color: 4 } }], server));
});
test('usage counts changed settings, including each role permission choice once', () => {
  const sample = { guildId: 'guild', channels: [{ id: 'news', name: 'الإعلانات', type: 0, position: 0, rate_limit_per_user: 0, nsfw: false, permission_overwrites: [{ id: 'guild', type: 0, allow: '0', deny: '2048' }] }], roles: [{ id: 'guild', name: '@everyone' }, { id: 'staff', name: 'إدارة', permissions: '0', color: 0, hoist: false, mentionable: false }] };
  const channel = normalizeOperations([{ resource_type: 'channel', action: 'update', resource_id: 'news', name: 'الإعلانات', rate_limit_per_user: 10, nsfw: false, permission_overwrites: [{ id: 'guild', type: 0, allow: '2048', deny: '0' }] }], sample)[0];
  const role = normalizeOperations([{ resource_type: 'role', action: 'update', resource_id: 'staff', name: 'إدارة', permissions: '3072', hoist: true }], sample)[0];
  assert.equal(operationUnits(channel), 2, 'slowmode and deny-to-allow are two settings');
  assert.equal(operationUnits(role), 3, 'two permission bits and hoist');
  assert.equal(planUsageUnits([channel,role]), 5);
});
test('channel credit uses final differences across category and each permission flag', () => {
  const server = { guildId: 'guild', channels: [
    { id: 'cat', name: 'جديد', type: 4 },
    { id: 'news', name: 'إعلانات', type: 0, parent_id: null, permission_overwrites: [] },
  ], roles: [{ id: 'guild', name: '@everyone' }, { id: 'member', name: 'عضو جديد' }] };
  const base = { resource_type: 'channel', action: 'update', resource_id: 'news', name: 'إعلانات', parent_id: 'cat' };
  const [three] = normalizeOperations([{ ...base, permission_overwrites: [{ id: 'guild', type: 0, allow: '1024', deny: '2048' }] }], server);
  assert.equal(operationUnits(three), 3, 'category, allow view and deny send');
  const [four] = normalizeOperations([{ ...base, permission_overwrites: [
    { id: 'guild', type: 0, allow: '1024', deny: '2048' },
    { id: 'member', type: 0, allow: '1024', deny: '0' },
  ] }], server);
  assert.equal(operationUnits(four), 4);
  const [reverted] = normalizeOperations([{ ...base, parent_id: null, permission_overwrites: [] }], server);
  assert.equal(operationUnits(reverted), 0, 'reverted settings cannot use credits');
});
test('role icon image is one setting and invalid image is rejected locally', () => {
  const server = { ...snapshot, roles: [...snapshot.roles.filter(role => role.id !== 'role'), { id: 'role', name: 'Member', icon: 'oldhash', unicode_emoji: null }] };
  const icon = 'data:image/png;base64,' + Buffer.from('not a real image').toString('base64');
  const [replacement] = normalizeOperations([{ action: 'update', resource_type: 'role', resource_id: 'role', name: 'Member', icon, unicode_emoji: null }], server);
  assert.equal(operationBody(replacement).icon, icon);
  assert.equal(operationUnits(replacement), 1);
  const [remove] = normalizeOperations([{ action: 'update', resource_type: 'role', resource_id: 'role', name: 'Member', icon: null, unicode_emoji: null }], server);
  assert.equal(operationUnits(remove), 1);
  assert.throws(() => normalizeOperations([{ action: 'update', resource_type: 'role', resource_id: 'role', name: 'Member', icon: 'http://example.com/icon.png' }], server));
});
test('owner, manager and administrator can manage; ordinary members cannot', () => {
  assert.equal(manageable({ owner: true }), true); assert.equal(manageable({ permissions: '8' }), true); assert.equal(manageable({ permissions: '32' }), true); assert.equal(manageable({ permissions: '1024' }), false);
});
test('upstream errors are not interpreted as uninstalled bot', () => {
  assert.equal(connectionState({ ok: false, status: 429 }), 'unavailable'); assert.equal(connectionState({ ok: false, status: 500 }), 'unavailable'); assert.equal(connectionState({ ok: false, status: 403 }), 'permissions_insufficient'); assert.equal(connectionState({ ok: false, status: 404 }), 'install_required');
});
test('reject cross-guild resources and unknown parent category', () => {
  assert.throws(() => normalizeOperations([{ action: 'update', resource_type: 'channel', name: 'new', resource_id: 'other' }], snapshot));
  assert.throws(() => normalizeOperations([{ resource_type: 'channel', name: 'new', parent_id: 'other' }], snapshot));
});
test('protected roles cannot be edited', () => {
  for (const resource_id of ['guild', 'managed']) assert.throws(() => normalizeOperations([{ action: 'update', resource_type: 'role', resource_id, name: 'new' }], snapshot));
});
test('only safe supported changes reach Discord', () => {
  assert.throws(() => normalizeOperations([{ resource_type: 'role', name: 'Member', permissions: '8' }], snapshot));
  const [op] = normalizeOperations([{ resource_type: 'role', name: 'Member', color: 0, permissions: '8', mentionable: true, confirm_admin: true }], snapshot);
  assert.deepEqual(operationBody(op), { name: 'Member', mentionable: true, color: 0, permissions: '8' });
  assert.throws(() => normalizeOperations([{ resource_type: 'channel', action: 'delete', name: 'chat' }], snapshot));
});
test('duplicate edits must be consolidated', () => {
  assert.throws(() => normalizeOperations(Array(2).fill({ resource_type: 'channel', action: 'update', resource_id: 'one', name: 'updated' }), snapshot));
});
test('matching channels uses exact category, including uncategorized channels', () => {
  const op = { resource_type: 'channel', name: 'chat' };
  assert.equal(resolveExisting(op, snapshot, 'category').id, 'one'); assert.equal(resolveExisting(op, snapshot).id, 'two');
});
test('voice templates create voice channels', () => {
  assert.equal(operationBody({ resource_type: 'channel', name: 'Lounge', type: 2 }).type, 2);
});
test('AI can build categories and place channels inside them in one reviewed plan', () => {
  const [category, channel] = normalizeOperations([{ resource_type: 'category', name: 'الدعم' }, { resource_type: 'channel', name: 'فتح-تذكرة', parent_name: 'الدعم' }], snapshot);
  assert.equal(channel.parent_key, category.operation_key);
  assert.equal(operationBody(channel, 'new-category').parent_id, 'new-category');
  const [existing] = normalizeOperations([{ resource_type: 'channel', name: 'hello', parent_name: 'Welcome' }], snapshot);
  assert.equal(existing.parent_id, 'category');
  assert.throws(() => normalizeOperations([{ resource_type: 'channel', name: 'bad', parent_name: 'غير موجود' }], snapshot));
});
test('new channel access uses narrow reviewed presets and never grants administrator', () => {
  const [readOnly] = normalizeOperations([{ resource_type: 'channel', name: 'announcements', access: 'read_only' }], snapshot);
  const body = operationBody(readOnly);
  assert.equal(body.permission_overwrites[0].id, 'guild');
  assert.equal(body.permission_overwrites[0].deny, '2048');
  assert.throws(() => checkExistingAccess(readOnly, { name: 'announcements', permission_overwrites: [] }));
  assert.doesNotThrow(() => checkExistingAccess(readOnly, { permission_overwrites: [{ id: 'guild', deny: '2048' }] }));
  const [staff] = normalizeOperations([{ resource_type: 'channel', name: 'staff', access: 'staff_only', staff_role_id: 'role' }], snapshot);
  assert.equal(operationBody(staff).permission_overwrites[1].id, 'role');
  assert.throws(() => normalizeOperations([{ resource_type: 'channel', name: 'staff', access: 'staff_only', staff_role_id: 'other' }], snapshot));
  assert.throws(() => normalizeOperations([{ resource_type: 'channel', name: 'staff', access: 'administrator' }], snapshot));
});
test('channel topics, forums and ordering are normalized for reviewed execution', () => {
  const [created] = normalizeOperations([{ resource_type: 'channel', name: 'المنتدى', type: 15, topic: 'ناقش أفكار المجتمع', position: 3 }], snapshot);
  assert.deepEqual(operationBody(created), { name: 'المنتدى', type: 15, topic: 'ناقش أفكار المجتمع' });
  const [updated] = normalizeOperations([{ action: 'update', resource_type: 'channel', resource_id: 'one', name: 'chat', topic: 'وصف جديد', position: 2 }], snapshot);
  assert.equal(updated.position, 2); assert.equal(updated.before.position, undefined); assert.equal(operationBody(updated).topic, 'وصف جديد');
  assert.throws(() => normalizeOperations([{ resource_type: 'channel', name: 'bad', type: 15, position: 999 }], snapshot));
});
test('stale changes are rejected but an already applied edit can be resumed', () => {
  const op = { action: 'update', resource_type: 'channel', name: 'after', before: { name: 'before' } };
  assert.throws(() => checkConflict(op, { name: 'someone-else' })); assert.doesNotThrow(() => checkConflict(op, { name: 'after' }));
});
test('invalid schedule time, size and timezone are rejected', () => {
  const valid = { content: 'Hello', run_at: '2030-01-01T12:00:00Z', repeat: 'once', timezone: 'Asia/Riyadh', channel_id: 'one' };
  assert.equal(normalizeSchedule(valid, 0).channel_id, 'one');
  assert.equal(normalizeSchedule({ ...valid, repeat: 'monthly' }, 0).repeat, 'monthly');
  assert.throws(() => normalizeSchedule({ ...valid, content: 'x'.repeat(2001) }, 0));
  assert.throws(() => normalizeSchedule({ ...valid, timezone: 'bad-zone' }, 0));
  assert.throws(() => normalizeSchedule({ ...valid, run_at: 'invalid' }, 0));
});

test('saved reorder history retains its original visible position after live data changes', () => {
  const current = structuredClone(snapshot);
  current.channels.push({ id:'third', name:'third', type:0, parent_id:'category', position:20 });
  current.channels.find(row => row.id === 'one').position = 11;
  const op = normalizeOperations([{ action:'update', resource_type:'channel', resource_id:'third', name:'third', position:0, position_changed:true }], current)[0];
  assert.equal(op.position_before_display, 2);
  current.channels.find(row => row.id === 'third').position = 0;
  assert.equal(op.position_before_display, 2);
  assert.equal(Object.hasOwn(operationBody(op),'position_before_display'), false);
});

test('saved reorder keeps the position shown to the customer when Discord snapshot ordering changes', () => {
  const current = structuredClone(snapshot);
  current.channels.push({ id:'third', name:'third', type:0, parent_id:'category', position:20 });
  const op = normalizeOperations([{ action:'update', resource_type:'channel', resource_id:'third', name:'third', position:0, position_changed:true, position_before_display:1 }], current)[0];
  assert.equal(op.position_before_display, 1);
  assert.equal(Object.hasOwn(operationBody(op),'position_before_display'), false);
});
