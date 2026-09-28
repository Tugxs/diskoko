import test from 'node:test';
import assert from 'node:assert/strict';
import { READY_TEMPLATES, normalizeReadyDefinition, readyTemplateDiff, readyUsageUnits } from '../lib/ready-templates.js';
import { readyCompletedUnits, readySnapshotFingerprint } from '../lib/ready-templates-api.js';

test('stopped template counts completed roles and channels but not unfinished steps', () => {
  const definition = normalizeReadyDefinition(READY_TEMPLATES[0].definition);
  const steps = [{ kind: 'role', status: 'succeeded' }, { kind: 'category', status: 'succeeded' }, { kind: 'channel', status: 'failed' }, { kind: 'feature-welcome', status: 'pending' }, { kind: 'order', status: 'succeeded' }];
  assert.equal(readyCompletedUnits(definition, steps), 2);
  steps.push({ kind: 'feature-logs', status: 'succeeded' });
  assert.equal(readyCompletedUnits(definition, steps), 3);
});

test('template review ignores Discord position renumbering and overwrite order, but detects real permission changes', () => {
  const original = { guild: { name: 'Test' }, channels: [{ id: '1', name: 'general', type: 0, parent_id: null, position: 0, topic: '', permission_overwrites: [{ id: 'a', type: 0, allow: '1', deny: '0' }, { id: 'b', type: 0, allow: '0', deny: '2' }] }], roles: [{ id: 'a', name: 'Member', position: 1, permissions: '0', color: 0, managed: false }] };
  const cosmetic = structuredClone(original);
  cosmetic.channels[0].position = 9;
  cosmetic.channels[0].permission_overwrites.reverse();
  assert.equal(readySnapshotFingerprint(original), readySnapshotFingerprint(cosmetic));
  cosmetic.channels[0].permission_overwrites[0].deny = '4';
  assert.notEqual(readySnapshotFingerprint(original), readySnapshotFingerprint(cosmetic));
});

test('ready template usage counts roles, categories, channels and enabled systems', () => {
  const arabic = normalizeReadyDefinition(READY_TEMPLATES[0].definition);
  assert.equal(arabic.categories.length, 7);
  assert.equal(arabic.categories.flatMap(group => group.channels).length, 23);
  assert.equal(readyUsageUnits(arabic), 37);
  const extraRole = structuredClone(arabic); extraRole.roles.push({ key: 'extra-role', name: 'Extra', preset: 'member', color: 0 });
  assert.equal(readyUsageUnits(extraRole), 38);
  const streamer = normalizeReadyDefinition(READY_TEMPLATES[1].definition);
  assert.equal(readyUsageUnits(streamer), 71);
});

test('welcome composite and support artwork are retained only with valid settings', () => {
  const definition = structuredClone(READY_TEMPLATES[0].definition);
  definition.features.welcome.composite = true;
  definition.features.welcome.avatarPosition = 'center';
  assert.throws(() => normalizeReadyDefinition(definition), /ارفع تصميم الترحيب/);
  definition.features.welcome.composite = false;
  definition.features.ticket.color = '#12aabb';
  definition.features.ticket.buttonLabel = 'اطلب المساعدة';
  assert.equal(normalizeReadyDefinition(definition).features.ticket.buttonLabel, 'اطلب المساعدة');
  definition.features.ticket.imageStyle = 'design';
  assert.throws(() => normalizeReadyDefinition(definition), /ادمج شعار الدعم/);
});

test('the two catalog templates have valid editable structure and no administrator grants', () => {
  assert.equal(READY_TEMPLATES.length, 4);
  for (const template of READY_TEMPLATES) {
    const definition = normalizeReadyDefinition(template.definition);
    assert.ok(definition.categories.length > 0);
    assert.ok(definition.categories.flatMap(group => group.channels).length > 0);
    assert.ok(definition.roles.every(role => (BigInt(role.permissions) & 8n) === 0n));
  }
  const streamer = normalizeReadyDefinition(READY_TEMPLATES[1].definition);
  assert.equal(streamer.categories.flatMap(group => group.channels).length, 33);
});

test('Diskoko Gaming Arabic remains compact with working welcome, ticket and activity logs', () => {
  const template = READY_TEMPLATES.find(item => item.key === 'diskoko-gaming-1');
  const definition = normalizeReadyDefinition(template.definition);
  assert.equal(template.name, 'Diskoko Gaming Arabic');
  assert.equal(definition.categories.length, 6);
  assert.equal(definition.categories.flatMap(group => group.channels).length, 20);
  assert.equal(definition.roles.length, 5);
  assert.equal(readyUsageUnits(definition), 34);
  assert.equal(definition.features.welcome.enabled, true);
  assert.equal(definition.features.ticket.enabled, true);
  assert.equal(definition.features.logs.events.includes('command'), true);
  assert.ok(definition.categories.flatMap(group => group.channels).some(channel => channel.key === definition.features.logs.channelKey && channel.access === 'private'));
});

test('Diskoko Streamer gives the creator posting access without exposing subscriber rooms', () => {
  const template = READY_TEMPLATES.find(item => item.key === 'diskoko-streamer');
  const definition = normalizeReadyDefinition(template.definition);
  const channels = definition.categories.flatMap(group => group.channels);
  assert.equal(template.name, 'Diskoko Streamer');
  assert.equal(definition.categories.length, 7);
  assert.equal(channels.length, 21);
  assert.equal(readyUsageUnits(definition), 36);
  assert.equal(channels.find(channel => channel.key === 'live').postRoleKey, 'streamer');
  assert.equal(channels.find(channel => channel.key === 'subscriber-chat').roleKey, 'subscriber');
  assert.equal(definition.features.welcome.enabled && definition.features.ticket.enabled && definition.features.logs.enabled, true);
  const invalid = structuredClone(template.definition);
  invalid.categories.find(group => group.key === 'broadcast').channels.find(channel => channel.key === 'live').postRoleKey = 'missing-role';
  assert.throws(() => normalizeReadyDefinition(invalid), /رتبة النشر/);
});

test('replacement removes every old channel and unmanaged role, while installation keeps them', () => {
  const definition = normalizeReadyDefinition(READY_TEMPLATES[0].definition);
  const snapshot = { guildId: 'guild', channels: [
    { id: 'a', name: 'قديم', type: 4 },
    { id: 'b', name: 'رسائل-قديمة', type: 0, parent_id: 'a' },
  ], roles: [
    { id: 'guild', name: '@everyone', permissions: '0' },
    { id: 'r1', name: 'قديم', managed: false, position: 1, permissions: '0' },
    { id: 'r2', name: 'بوت', managed: true, position: 2, permissions: '0' },
  ] };
  const install = readyTemplateDiff(definition, snapshot, 'add');
  assert.equal(install.deletions.channels.length, 0);
  assert.equal(install.deletions.roles.length, 0);
  assert.deepEqual(install.retained.channels.map(row => row.id), ['a', 'b']);
  assert.deepEqual(install.retained.roles.map(row => row.id), ['r1', 'r2']);
  const replacement = readyTemplateDiff(definition, snapshot, 'replace');
  assert.deepEqual(replacement.deletions.channels.map(row => row.id), ['a', 'b']);
  assert.deepEqual(replacement.deletions.roles.map(row => row.id), ['r1']);
  assert.ok(replacement.createOrReuse.every(row => row.action === 'create'));
});

test('installation rejects a same-name channel that would silently retain different access', () => {
  const definition = normalizeReadyDefinition(READY_TEMPLATES[0].definition);
  const category = definition.categories[0], channel = category.channels[0];
  const snapshot = { guildId: 'guild', channels: [
    { id: 'cat', name: category.name, type: 4 },
    { id: 'channel', name: channel.name, type: 0, parent_id: 'cat', permission_overwrites: [] },
  ], roles: [] };
  assert.throws(() => readyTemplateDiff(definition, snapshot, 'add'), /صلاحياتها مختلفة/);
  assert.doesNotThrow(() => readyTemplateDiff(definition, snapshot, 'replace'));
});

test('private channels cannot refer to removed roles', () => {
  const definition = structuredClone(READY_TEMPLATES[0].definition);
  definition.roles = definition.roles.filter(role => role.key !== 'vip');
  assert.throws(() => normalizeReadyDefinition(definition), /رتبة موجودة/);
});
test('welcome artwork is checked before a review can reach Discord', () => {
  const definition = structuredClone(READY_TEMPLATES[0].definition);
  definition.features.welcome.banner = { mime: 'image/gif', base64: Buffer.from('not a gif').toString('base64') };
  assert.throws(() => normalizeReadyDefinition(definition), /تعذر قراءة الصورة/);
  definition.features.welcome.banner = { mime: 'image/gif', base64: Buffer.from('GIF89a').toString('base64') };
  assert.equal(normalizeReadyDefinition(definition).features.welcome.banner.mime, 'image/gif');
});
test('installation exposes an existing Administrator role instead of claiming to change it', () => {
  const definition = normalizeReadyDefinition(READY_TEMPLATES[0].definition);
  const existing = readyTemplateDiff(definition, { guildId: 'guild', channels: [], roles: [{ id: 'r1', name: definition.roles[0].name, permissions: '8', color: 0, managed: false }] }, 'add');
  const role = existing.createOrReuse.find(item => item.kind === 'role' && item.name === definition.roles[0].name);
  assert.equal(role.action, 'reuse');
  assert.equal(role.hasAdministrator, true);
});
test('multiple log rules accept shared destinations and count one unit per rule', () => {
  const definition = structuredClone(READY_TEMPLATES[0].definition);
  const channels = definition.categories.flatMap(group => group.channels).filter(channel => channel.type === 0);
  definition.features.logs = { enabled: true, mode: 'routed', events: ['message_create', 'message_delete'], routes: [
    { key: 'chat-logs', sourceKeys: [channels[0].key, channels[1].key], targetKey: channels[2].key, events: ['message_delete'] },
    { key: 'other-logs', sourceKeys: [channels[3].key], targetKey: channels[2].key, events: ['message_create'] },
  ] };
  const normalized = normalizeReadyDefinition(definition);
  assert.equal(normalized.features.logs.routes.length, 2);
  assert.deepEqual(normalized.features.logs.routes[0].events, ['message_delete']);
  assert.deepEqual(new Set(normalized.features.logs.events), new Set(['message_delete', 'message_create']));
  assert.equal(readyUsageUnits(normalized), 38);
  definition.features.logs.routes[1].sourceKeys = [channels[2].key];
  assert.throws(() => normalizeReadyDefinition(definition), /مصادر اللوق/);
});

test('a private source cannot route its log into a public template channel', () => {
  const definition = structuredClone(READY_TEMPLATES[2].definition);
  const channels = definition.categories.flatMap(group => group.channels);
  const source = channels.find(channel => channel.access === 'private');
  const publicTarget = channels.find(channel => channel.type === 0 && channel.access !== 'private');
  assert.ok(source && publicTarget);
  definition.features.logs = { enabled: true, mode: 'routed', events: ['message_delete'], routes: [{ key: 'private-log', sourceKeys: [source.key], targetKey: publicTarget.key, events: ['message_delete'] }] };
  assert.throws(() => normalizeReadyDefinition(definition), /قناة استقبال خاصة/);
});

test('log rules can include channels already present in the server', () => {
  const definition = normalizeReadyDefinition(READY_TEMPLATES[2].definition);
  definition.features.logs.mode = 'routed';
  definition.features.logs.routes = [{ key: 'old-chat', targetKey: definition.features.logs.channelKey, sourceKeys: [], sourceIds: ['1553422484324356097'] }];
  const normalized = normalizeReadyDefinition(definition);
  assert.deepEqual(normalized.features.logs.routes[0].sourceIds, ['1553422484324356097']);
  assert.equal(readyUsageUnits(normalized), readyUsageUnits(definition));
});

