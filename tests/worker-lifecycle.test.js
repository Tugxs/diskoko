import test from 'node:test';
import assert from 'node:assert/strict';
import {startAiBot,stopAllAiBots} from '../lib/ai-bot-connections.js';

test('service shutdown refuses a new private-bot connection before any database or Discord request',async()=>{
  await stopAllAiBots();
  await assert.rejects(startAiBot({},'111111111111111111','unused','222222222222222222'),error=>error.code==='SERVICE_DRAINING');
  // Repeated shutdown remains harmless and does not restart reconnect timers.
  await stopAllAiBots();
});
