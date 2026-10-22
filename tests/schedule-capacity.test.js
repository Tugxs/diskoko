import test from 'node:test';
import assert from 'node:assert/strict';
import {startScheduleRunner} from '../lib/workspace-api.js';

test('schedule capacity polls bounded batches faster without overlapping sends or repeating maintenance per batch',async()=>{
 const queries=[];let unblock;
 const runner=startScheduleRunner({pool:{query:async(sql)=>{queries.push(sql);if(sql.includes('RETURNING *') && !unblock)return new Promise(resolve=>{unblock=()=>resolve({rows:[]});});return {rows:[]};}},discordBotFetch:async()=>{throw Error('Must not call Discord for an empty queue');},authorizedGuild:async()=>null});
 try{
  assert.equal(runner.state().intervalMs,5000);const first=runner.tick(),second=runner.tick();assert.equal(first,second);
  for(let i=0;i<5&&!unblock;i++)await new Promise(r=>setImmediate(r));assert.ok(unblock);unblock();await first;await runner.tick();
  assert.equal(queries.filter(q=>q.startsWith('DELETE FROM community_activity')).length,1);assert.equal(queries.filter(q=>q.includes("status='failed'")).length,1);assert.equal(queries.filter(q=>q.includes('RETURNING *')).length,2);assert.ok(queries.filter(q=>q.includes('RETURNING *')).every(q=>q.includes('LIMIT 5 FOR UPDATE SKIP LOCKED')));
 }finally{await runner();}
});
