import test from 'node:test';
import assert from 'node:assert/strict';
import { activityLogDestinations, deletedMessageDetail } from '../lib/guild-activity-logs.js';

test('deleted message detail preserves safe content or explains missing content', () => {
  assert.match(deletedMessageDetail('hello\n@everyone'), /hello ⏎ @\u200beveryone/);
  assert.match(deletedMessageDetail(''), /Message Content Intent.*أعد ربطه/);
  assert.ok(deletedMessageDetail('a'.repeat(800)).length < 440);
});

test('unified logs include source channels but never loop into their destination', () => {
  const config = { mode: 'unified', events: ['message_create'], targetId: 'all-logs' };
  assert.deepEqual(activityLogDestinations(config, 'message_create', 'general'), ['all-logs']);
  assert.deepEqual(activityLogDestinations(config, 'message_create', 'all-logs'), []);
  assert.deepEqual(activityLogDestinations(config, 'voice_join', 'general'), []);
});

test('routed logs combine multiple sources, deduplicate destinations and keep other rooms separate', () => {
  const config = { mode: 'routed', events: ['message_delete'], routes: [
    { sourceIds: ['general', 'memes'], targetId: 'chat-logs' },
    { sourceIds: ['general'], targetId: 'chat-logs' },
    { sourceIds: ['voice'], targetId: 'voice-logs' },
  ] };
  assert.deepEqual(activityLogDestinations(config, 'message_delete', 'general'), ['chat-logs']);
  assert.deepEqual(activityLogDestinations(config, 'message_delete', 'memes'), ['chat-logs']);
  assert.deepEqual(activityLogDestinations(config, 'message_delete', 'voice'), ['voice-logs']);
  assert.deepEqual(activityLogDestinations(config, 'message_delete', 'other'), []);
});

test('commands follow their source channel route only when enabled', () => {
  const config = { mode: 'routed', events: ['command'], routes: [{ sourceIds: ['general', 'memes'], targetId: 'chat-logs' }] };
  assert.deepEqual(activityLogDestinations(config, 'command', 'memes'), ['chat-logs']);
  assert.deepEqual(activityLogDestinations(config, 'message_create', 'memes'), []);
});

test('each routed log can choose its own event types and destination', () => {
  const config = { mode: 'routed', events: ['message_delete', 'voice_join'], routes: [
    { events: ['message_delete'], sourceIds: ['private-chat'], targetId: 'private-logs' },
    { events: ['voice_join'], sourceIds: ['voice'], targetId: 'voice-logs' },
  ] };
  assert.deepEqual(activityLogDestinations(config, 'message_delete', 'private-chat'), ['private-logs']);
  assert.deepEqual(activityLogDestinations(config, 'voice_join', 'private-chat'), []);
  assert.deepEqual(activityLogDestinations(config, 'voice_join', 'voice'), ['voice-logs']);
});

