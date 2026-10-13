import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeTeamMembers,enforceTeamWrite,teamTool} from '../lib/dashboard-team.js';
import {deletionPermission,deletionFingerprint} from '../lib/resource-deletion.js';
import {PermissionFlagsBits as F} from 'discord.js';
const guild='100000000000000001',user='100000000000000002',bot='100000000000000003';
test('team permissions restrict tools without granting Discord or bypassing another guild policy',async()=>{
 const policy={owner_discord_id:'owner',members:[{discordId:user,tools:['schedules']}]};const db={query:async()=>({rows:[policy]})};
 const req={originalUrl:`/api/workspace/${guild}/schedules`,params:{guildId:guild},body:{guildId:'200000000000000001'},query:{},user:{discord_id:user}};
 await enforceTeamWrite(req,db);req.originalUrl=`/api/workspace/${guild}/tools/delete/review`;await assert.rejects(()=>enforceTeamWrite(req,db),e=>e.status===403);
 req.user.discord_id='owner';await enforceTeamWrite(req,db);req.user.discord_id='new-owner';await enforceTeamWrite(req,db,async()=>({owner:true}));
 assert.equal(teamTool('/api/workspace/g/tools/drafts/x'),'templates');assert.throws(()=>normalizeTeamMembers([{discordId:user,tools:['unknown']}],5));assert.throws(()=>normalizeTeamMembers([{discordId:user,tools:[]}],1));
});
test('delete review requires real role hierarchy even for an Administrator bot',()=>{
 const resource={id:'target',position:10,name:'Target'},snapshot={roles:[{id:guild,permissions:'0'},{id:'admin',permissions:String(F.Administrator),position:20}],botRoles:['admin'],botPosition:20};
 deletionPermission(snapshot,{id:guild,owner_id:user},{roles:[]},user,'role',resource);
 assert.throws(()=>deletionPermission({...snapshot,botPosition:10},{id:guild,owner_id:user},{roles:[]},user,'role',resource));
 assert.throws(()=>deletionPermission(snapshot,{id:guild,owner_id:user},{roles:[]},user,'role',{...resource,managed:true}));
 assert.throws(()=>deletionPermission(snapshot,{id:guild,owner_id:'other'},{roles:[]},user,'role',resource));
 assert.notEqual(deletionFingerprint(resource),deletionFingerprint({...resource,name:'Changed'}));
});
import {mountResourceDeletion} from '../lib/resource-deletion.js';
test('duplicate delete requests perform at most one Discord write and uncertain outcomes block replay',async()=>{
 for(const fail of [false,true]){
  const routes=new Map(),calls=[],queries=[];let review;const resource={id:'100000000000000004',name:'Test',type:0,permission_overwrites:[]};
  const db={release(){},query:async(sql,values=[])=>{queries.push(sql);if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};if(sql.startsWith('INSERT INTO workspace_resource_deletions')){review={id:values[0],owner_id:values[1],guild_id:values[2],bot_id:values[3],kind:values[4],resource_id:values[5],name:values[6],fingerprint:values[7],status:'review',expires_at:new Date(Date.now()+600000)};return {rows:[]};}if(sql.startsWith('SELECT * FROM workspace_resource_deletions'))return {rows:review?[review]:[]};if(sql.includes("SET status='running'"))review.status='running';if(sql.includes("SET status='succeeded'"))review.status='succeeded';if(sql.includes("SET status='review_required'"))review.status='review_required';return {rows:[{count:0}]};}};
  const pool={query:db.query,connect:async()=>db};
  const discord=async(path,options={})=>{if(options.method==='DELETE'){calls.push(path);return {ok:!fail,status:fail?503:204};}if(path==='/users/@me')return {ok:true,data:{id:bot}};if(path.endsWith('/roles'))return {ok:true,data:[{id:guild,permissions:'0',name:'@everyone'},{id:'admin',permissions:String(F.Administrator),position:20}]};if(path.endsWith('/channels'))return {ok:true,data:[resource]};if(path.includes('/members/'))return {ok:true,data:{roles:['admin']}};return {ok:true,data:{id:guild,owner_id:user}};};
  mountResourceDeletion({post:(path,...fns)=>routes.set(path,fns.at(-1))},{pool,requireUser(){},requireWriteAccess(){},authorizedGuild:async()=>({id:guild}),discordBotFetch:discord,audit:async()=>{}});
  const request=async(path,body)=>{let result,error;await routes.get('/api/workspace/:guildId/tools/delete'+path)({originalUrl:'',params:{guildId:guild,id:review?.id},user:{id:1,discord_id:user},body},{json:r=>result=r},e=>error=e);return {result,error};};
  assert.ok((await request('/review',{kind:'channel',id:resource.id})).result.id);
  const first=await request('/:id/apply',{confirmed:true,name:'Test'});assert.equal(Boolean(first.error),fail);
  const duplicate=await request('/:id/apply',{confirmed:true,name:'Test'});assert.equal(calls.length,1);if(fail)assert.equal(duplicate.error.status,409);else assert.equal(duplicate.result.alreadyApplied,true);
 }
});
