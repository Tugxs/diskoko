import test from 'node:test';
import assert from 'node:assert/strict';
import { READY_TEMPLATES } from '../lib/ready-templates.js';
import { importServerTemplate, exportServerTemplate } from '../lib/server-template-import.js';

test('portable template preserves normalized structure and all supported features', () => {
  for (const template of READY_TEMPLATES) {
    const bundle = exportServerTemplate(template.definition);
    assert.deepEqual(importServerTemplate(JSON.parse(JSON.stringify(bundle))), bundle.definition);
    assert.deepEqual(Object.keys(bundle.definition.features).sort(), ['guides','logs','modules','ticket','welcome']);
  }
});
test('import rejects unknown formats, features and duplicate resource keys', () => {
  assert.throws(() => importServerTemplate({ version: 1, definition: READY_TEMPLATES[0].definition }));
  const bundle = exportServerTemplate(READY_TEMPLATES[0].definition);
  bundle.definition.features.externalBot = { enabled: true };
  assert.throws(() => importServerTemplate(bundle), /غير مدعومة/);
  delete bundle.definition.features.externalBot;
  bundle.definition.roles.push(bundle.definition.roles[0]);
  assert.throws(() => importServerTemplate(bundle), /مكررة/);
});
test('import does not carry cross-server log channel identifiers', () => {
  const bundle = exportServerTemplate(READY_TEMPLATES[0].definition);
  const channels = bundle.definition.categories.flatMap(group => group.channels).filter(channel => channel.type === 0 && channel.access !== 'private');
  bundle.definition.features.logs = { enabled: true, mode: 'routed', channelKey: channels[0].key, events: ['command'], routes: [{ key: 'source-log', targetKey: channels[0].key, sourceKeys: [], sourceIds: ['123456789012345678'], events: ['command'] }] };
  assert.throws(() => importServerTemplate(bundle), /السيرفر الأصلي/);
});

test('unsupported raw permissions are rejected instead of silently changing them', () => {
 const bundle=exportServerTemplate(READY_TEMPLATES[0].definition);
 bundle.definition.roles[0].permissions='8';
 assert.throws(()=>importServerTemplate(bundle),/صلاحيات الرتبة/);
 const other=exportServerTemplate(READY_TEMPLATES[0].definition);
 other.definition.categories[0].channels[0].permission_overwrites=[];
 assert.throws(()=>importServerTemplate(other),/صلاحيات القنوات/);
});
