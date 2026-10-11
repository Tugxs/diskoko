import test from 'node:test';import assert from 'node:assert/strict';
import { processModuleReminders } from '../lib/module-event-runner.js';
test('claimed event reminders do not repeat uncertain deliveries',async()=>{
  let claimed=false,sends=0;const statuses=[];const panel={id:'panel',channel_id:'channel',config:{title:'Event',startsAt:new Date(Date.now()+60000).toISOString()}};
  const pool={query:async(sql,args)=>{if(sql.startsWith('SELECT'))return {rows:[panel]};if(sql.startsWith('INSERT')){const rowCount=claimed?0:1;claimed=true;return {rowCount};}statuses.push(sql);return {rowCount:1};}};
  const discordBotFetch=async()=>{sends++;throw Error('Connection lost after request');};
  await processModuleReminders({pool,discordBotFetch});await processModuleReminders({pool,discordBotFetch});assert.equal(sends,1);assert.match(statuses[0],/uncertain/);
});
