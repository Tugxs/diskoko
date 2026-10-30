import test from 'node:test';
import assert from 'node:assert/strict';
import {templateExecutorRoles,assertTemplateRoleDeletionSafe} from '../lib/template-executor-protection.js';
import {mountReadyTemplates} from '../lib/ready-templates-api.js';
import {normalizeReadyDefinition,READY_TEMPLATES} from '../lib/ready-templates.js';

const guildId='111111111111111111', actorId='222222222222222222';
test('replacement reads actual actor membership, not submitted role claims',async()=>{
 let requested;
 const roles=await templateExecutorRoles(async path=>{requested=path;return {ok:true,data:{roles:['admin','member']}};},guildId,actorId);
 assert.equal(requested,`/guilds/${guildId}/members/${actorId}`);
 assert.deepEqual([...roles],['admin','member']);
 assert.throws(()=>assertTemplateRoleDeletionSafe([{kind:'delete-role',name:'Admin',resource_id:'admin',status:'pending'}],roles),e=>e.status===409);
 assert.doesNotThrow(()=>assertTemplateRoleDeletionSafe([{kind:'delete-role',resource_id:'other',status:'pending'}],roles));
});
test('membership failure and invalid identity fail closed without a deletion',async()=>{
 for(const response of [{ok:false,status:403},{ok:false,status:404},{ok:true,data:{}}])await assert.rejects(templateExecutorRoles(async()=>response,guildId,actorId),e=>e.status===409);
 await assert.rejects(templateExecutorRoles(()=>{throw Error('must not call');},guildId,''),e=>e.status===409);
});

function fixture(){
 const routes=new Map(),writes=[],steps=[],roles=[{id:guildId,name:'@everyone',permissions:'0',position:0},{id:'admin',name:'Administrator',permissions:'8',position:2},{id:'old',name:'Old member',permissions:'0',position:1},{id:'bot-role',name:'Bot',managed:true,position:10,permissions:'8',tags:{bot_id:'bot'}}];
 const app=Object.fromEntries(['get','post'].map(method=>[method,(url,...handlers)=>routes.set(method+' '+url,handlers.at(-1))]));
 const db={release(){},async query(sql,args=[]){
  if(sql.startsWith('INSERT INTO ready_template_steps'))steps.push({step_key:args[1],kind:args[2],name:args[3],resource_id:args[4],status:'pending'});
  if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};
  if(sql.includes('SELECT * FROM ready_template_runs'))return {rows:[this.run]};
  if(sql.includes('SELECT * FROM ready_template_steps'))return {rows:steps};
  return {rows:[]};
 }};
 const call=async(path,options={})=>{
  if(options.method && options.method!=='GET')writes.push({path,...options});
  if(path===`/guilds/${guildId}`)return {ok:true,data:{id:guildId,name:'Guild'}};
  if(path.endsWith('/channels'))return {ok:true,data:[]};
  if(path.endsWith('/roles'))return {ok:true,data:roles};
  if(path==='/users/@me')return {ok:true,data:{id:'bot'}};
  if(path===`/guilds/${guildId}/members/${actorId}`)return {ok:true,data:{roles:['admin']}};
  throw Error('Unexpected request '+path);
 };
 mountReadyTemplates(app,{pool:{query:db.query.bind(db),connect:async()=>db},requireUser(){},requireWriteAccess(){},authorizedGuild:async()=>({id:guildId,name:'Guild'}),discordBotFetch:call,audit:async()=>{},requirePlanCapacity:async()=>({used:0,limit:10000}),botStatus:()=>({online:true,memberJoins:true})});
 return {routes,writes,steps,db};
}
test('review preserves the admin executor role but still plans deletion of unrelated old roles',async()=>{
 const f=fixture();let error,result;
 const definition=normalizeReadyDefinition({...READY_TEMPLATES[0].definition,features:{welcome:{enabled:false},ticket:{enabled:false},logs:{enabled:false},modules:[]}});
 await f.routes.get('post /api/workspace/:guildId/ready-templates/review')({user:{id:1,discord_id:actorId},params:{guildId},body:{templateKey:'imported-server-template',definition,mode:'replace',deleteOldRoles:true,executor:'diskoko'}},{status(){return this},json(value){result=value}},e=>error=e);
 assert.equal(error,undefined);assert.ok(result);
 assert.ok(result.run.review.protectedRoles.some(role=>role.id==='admin'));
 assert.equal(f.steps.some(step=>step.kind==='delete-role' && step.resource_id==='admin'),false);
 assert.equal(f.steps.some(step=>step.kind==='delete-role' && step.resource_id==='old'),true);
 assert.equal(f.writes.length,0,'review is read only in Discord');
});
test('role deletion requires a real boolean opt-in; default and string values preserve all old roles',async()=>{
 for(const choice of [undefined,false,'true']){
  const f=fixture();let error,result;
  const definition=normalizeReadyDefinition({...READY_TEMPLATES[0].definition,features:{welcome:{enabled:false},ticket:{enabled:false},logs:{enabled:false},modules:[]}});
  await f.routes.get('post /api/workspace/:guildId/ready-templates/review')({user:{id:1,discord_id:actorId},params:{guildId},body:{templateKey:'imported-server-template',definition,mode:'replace',executor:'diskoko',deleteOldRoles:choice}},{status(){return this},json(v){result=v}},e=>error=e);
  assert.equal(error,undefined);assert.equal(result.run.review.deleteOldRoles,false);
  assert.equal(f.steps.some(step=>step.kind==='delete-role'),false);
  assert.ok(result.run.review.retainedRoles.some(role=>role.id==='old'));
 }
});
test('an old in-progress review cannot delete a newly assigned executor role or write before detecting it',async()=>{
 const f=fixture();f.steps.push({kind:'delete-role',resource_id:'admin',name:'Administrator',status:'pending'});
 f.db.run={id:'old-run',user_id:1,guild_id:guildId,status:'running',mode:'replace',executor:'diskoko',definition:normalizeReadyDefinition(READY_TEMPLATES[0].definition),review:{guildName:'Guild',deleteOldRoles:true}};
 let error;
 await f.routes.get('post /api/workspace/:guildId/ready-templates/runs/:id/apply')({user:{id:1,discord_id:actorId},params:{guildId,id:'old-run'},body:{confirmed:true,guildName:'Guild',mode:'replace'}},{json(){throw Error('Unexpected success');}},e=>error=e);
 assert.equal(error?.status,409);assert.match(error.message,/لن نحذف رتبتك/);assert.equal(f.writes.length,0);
});
test('legacy pending role deletion requires a fresh review with explicit consent',async()=>{
 const f=fixture();f.steps.push({kind:'delete-role',resource_id:'old',name:'Old member',status:'pending'});
 f.db.run={id:'legacy',user_id:1,guild_id:guildId,status:'running',mode:'replace',executor:'diskoko',definition:normalizeReadyDefinition(READY_TEMPLATES[0].definition),review:{guildName:'Guild'}};
 let error;
 await f.routes.get('post /api/workspace/:guildId/ready-templates/runs/:id/apply')({user:{id:1,discord_id:actorId},params:{guildId,id:'legacy'},body:{confirmed:true,guildName:'Guild',mode:'replace',deleteOldRoles:true}},{json(){throw Error('Unexpected success');}},e=>error=e);
 assert.equal(error?.status,409);assert.match(error.message,/موافقة صريحة/);assert.equal(f.writes.length,0,'apply payload cannot expand an old review');
});
