import test from 'node:test';
import assert from 'node:assert/strict';
import {mountInteractiveSystems} from '../lib/interactive-systems.js';
for(const scenario of ['missing','fresh','duplicate'])test(`ticket channel preflight: ${scenario}`,async()=>{
  const channel='123456789012345678',role='123456789012345679';let launch,response,code;const sql=[],writes=[];
  const item={id:'request',guild_id:'guild',proposal:{interactive:{kind:'tickets',title:'Support',description:'Open a ticket',referenceOnly:true}}};
  const db={query:async(query)=>{sql.push(query);return{rows:query.startsWith('SELECT id,guild_id')?[item]:query.startsWith('SELECT p.id') && scenario==='duplicate'?[{id:'existing'}]:[]};},release(){}};
  mountInteractiveSystems({post(path,...handlers){if(path.endsWith('/launch-interactive'))launch=handlers.at(-1);}},{pool:{connect:async()=>db},requireUser(){},requireWriteAccess(){},authorizedGuild:async()=>true,requirePlanCapacity:async()=>{},discordBotFetch:async(path,options)=>{
    if(options){writes.push(path);return{ok:true,data:{id:'sent'}};}
    if(path==='/channels/'+channel)return scenario==='missing'?{ok:false,status:404}:{ok:true,data:{id:channel,guild_id:'guild',type:0}};
    if(path.endsWith('/roles'))return{ok:true,data:[{id:role}]};return{ok:true,data:[]};
  }});
  await launch({params:{id:'request'},user:{id:'owner'},body:{confirmed:true,channelId:channel,staffRoleId:role}},{status(value){code=value;return this;},json(value){response=value;}},error=>{throw error;});
  if(scenario==='fresh'){assert.equal(response.ok,true);assert.equal(writes.length,1);}else{assert.equal(writes.length,0);assert.ok(!sql.some(query=>query.includes("publication_state='publishing'")));assert.equal(code,scenario==='missing'?400:409);if(scenario==='duplicate')assert.match(response.error,/توجد لوحة دعم/);}
});
