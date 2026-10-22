import test from 'node:test';
import assert from 'node:assert/strict';
import {mountWorkspace} from '../lib/workspace-api.js';

test('identical schedule submissions reuse the owned job before consuming capacity',async()=>{
 const routes=new Map(),queries=[];let capacity=0,inserted=0,released=false;
 const app=Object.fromEntries(['get','post','put','delete'].map(method=>[method,(path,...handlers)=>routes.set(method+' '+path,handlers.at(-1))]));
 const saved={id:'8',status:'scheduled',guild_id:'g',user_id:1};
 const client={release(){released=true;},async query(sql,params){queries.push({sql,params});if(sql.startsWith('SELECT * FROM scheduled_messages'))return {rows:[saved]};if(sql.startsWith('INSERT INTO scheduled_messages'))inserted++;return {rows:[]};}};
 mountWorkspace(app,{pool:{connect:async()=>client},requireUser(){},requireWriteAccess(){},authorizedGuild:async()=>({id:'g'}),requirePlanCapacity:async()=>capacity++,audit:async()=>{},discordBotFetch:async url=>({ok:true,data:url.endsWith('/channels')?[{id:'c',type:0}]:[]})});
 let body,error;
 await routes.get('post /api/workspace/:guildId/schedules')({user:{id:1},params:{guildId:'g'},body:{confirmed:true,content:'Hello',channel_id:'c',run_at:'2099-01-01T10:00:00Z',repeat:'once',timezone:'UTC'}},{json:value=>body=value,status(){throw Error('Duplicate should not be created');}},e=>error=e);
 assert.equal(error,undefined);assert.equal(body.reused,true);assert.equal(capacity,0);assert.equal(inserted,0);assert.equal(released,true);
 const lock=queries.findIndex(q=>q.sql.includes('pg_advisory_xact_lock')),lookup=queries.findIndex(q=>q.sql.startsWith('SELECT * FROM scheduled_messages'));
 assert.ok(lock>=0 && lock<lookup);assert.deepEqual(queries[lookup].params.slice(0,3),[1,'g','c']);assert.equal(queries.at(-1).sql,'COMMIT');
});
