import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import pg from 'pg';
import {PGlite} from '@electric-sql/pglite';
import {migrateApplicationSchema} from '../lib/database-schema.js';
import {mountWorkspace} from '../lib/workspace-api.js';
import {mountCodeCommands} from '../lib/code-commands.js';
import {enforceTeamWrite,TEAM_TOOLS} from '../lib/dashboard-team.js';
import {READY_TEMPLATES} from '../lib/ready-templates.js';
import {requireBotRegistrationOwner,saveOwnedBotRegistration} from '../lib/bot-registration-owner.js';
import {startProjectScheduler} from '../lib/code-project-scheduler.js';
import {mountLocalAi} from '../lib/local-ai.js';
import {runProjectJob} from '../lib/code-project-scheduler.js';
import {mountAiBotConnections} from '../lib/ai-bot-connections.js';
import {readFile} from 'node:fs/promises';
import {botMutationHandler,stopBotMutationLocks} from '../lib/bot-mutation-lock.js';
import {stopProjectLedger} from '../lib/code-project-ledger.js';
import {isolationPreflight} from '../scripts/isolation-preflight.mjs';

const ga='100000000000000001',gb='100000000000000002',b1='200000000000000001',b2='200000000000000002';
const users={a:{id:1,discord_id:'300000000000000001'},b:{id:2,discord_id:'300000000000000002'},limited:{id:3,discord_id:'300000000000000003'}};
async function matrix(t,pool,{concurrent=false}={}){
  await migrateApplicationSchema(pool);
  const policy=JSON.parse(await readFile(new URL('../docs/tenant-table-policy.json',import.meta.url),'utf8'));
  const classified=Object.values(policy).flatMap(value=>Array.isArray(value)?value:Object.keys(value));
  const tables=(await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename);
  assert.equal(new Set(classified).size,classified.length,'each table has exactly one isolation policy');
  assert.deepEqual([...classified].sort(),tables,'new tables require an explicit reviewed isolation policy');
  await pool.query("INSERT INTO users(id,username,discord_id) VALUES(1,'a',$1),(2,'b',$2),(3,'limited',$3)",[users.a.discord_id,users.b.discord_id,users.limited.discord_id]);
  for(const [g,b,o] of [[ga,b1,1],[ga,b2,1],[gb,b1,2]])await saveOwnedBotRegistration(pool,[g,b,o,'test','encrypted-fixture',null,false,false]);
  await pool.query('INSERT INTO workspace_team_policies(guild_id,owner_discord_id,members) VALUES($1,$2,$3)',[ga,users.a.discord_id,JSON.stringify([{discordId:users.b.discord_id,tools:TEAM_TOOLS},{discordId:users.limited.discord_id,tools:['schedules']}])]);
  const authorizedGuild=async(user,id)=>id===ga || id===gb && user.id===2?{id,name:id,owner:user.id===(id===ga?1:2)}:null;
  const app=express();app.use(express.json({limit:'1mb'}));
  // Test-only identities. No authentication bypass is added to the application.
  const requireUser=(req,res,next)=>{req.user=users[req.headers['x-test-user']];if(!req.user)return res.status(401).json({error:'unauthenticated'});next();};
  const requireWriteAccess=async(req,res,next)=>{try{await enforceTeamWrite(req,pool,authorizedGuild);next();}catch(e){next(e);}};
  let writes=0;
  const deps={pool,requireUser,requireWriteAccess,authorizedGuild,audit:async()=>{},requirePlanCapacity:async()=>{},entitlementsFor:()=>({auditDays:30,teamSeats:5}),discordBotFetch:async(path,opts={})=>{if(opts.method && opts.method!=='GET')writes++;return {ok:true,data:{guild_id:ga,type:0}};},templates:{},makeTemplatePlan:()=>({operations:[]}),botStatus:()=>({})};
  mountWorkspace(app,deps);
  mountLocalAi(app,{...deps,canonicalPlan:()=> 'starter'});
  mountCodeCommands(app,{...deps,ensurePublicPanelBotRegistry:async()=>{throw Error('No public registration expected');},connectedBot:async(db,g,b)=>{const row=(await db.query('SELECT bot_user_id FROM customer_bot_registry WHERE guild_id=$1 AND bot_user_id=$2',[g,b])).rows[0];return row?{id:b,token:'fixture'}:null;},discord:async(token,path,opts={})=>{if(opts.method && opts.method!=='GET')writes++;return {ok:true,data:{}};}});
  mountAiBotConnections(app,deps);
  app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const request=async(user,method,path,body)=>{const r=await fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{'x-test-user':user,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
  const tools=g=>'/api/workspace/'+g+'/tools';
  const def=READY_TEMPLATES[0].definition;
  const attachment=randomUUID();await pool.query('INSERT INTO ai_requests(id,user_id,guild_id,prompt,attachment) VALUES($1,1,$2,\'fixture\',$3)',[attachment,ga,JSON.stringify({mime:'image/png',base64:Buffer.from('owned-file').toString('base64')})]);
  for(const user of ['a','b']){
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/ai/requests/'+attachment+'/attachment',{headers:{'x-test-user':user}});
    assert.equal(response.status,user==='a'?200:404);
    if(user==='a'){assert.equal(await response.text(),'owned-file');assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');}
  }
  for(const user of ['a','b'])assert.equal((await request(user,'PUT',tools(ga)+'/drafts/same',{revision:0,definition:{...def,name:user}})).status,200);
  assert.equal((await request('a','GET',tools(ga)+'/drafts/same')).body.draft.name,'a');
  assert.equal((await request('b','GET',tools(ga)+'/drafts/same')).body.draft.name,'b');
  for(const path of ['/drafts','/drafts/same','/drafts/same/versions','/drafts/same/versions/1','/settings','/schedules','/history','/structure/versions'])assert.equal((await request('a','GET',tools(gb)+path)).status,403,path);
  assert.equal((await request('b','GET',tools(gb)+'/drafts/same')).status,404);
  assert.equal((await request('limited','PUT',tools(ga)+'/drafts/same',{guildId:gb,revision:0,definition:def})).status,403);
  assert.equal((await request('limited','POST','/api/ai/bots/'+b1+'/code-commands',{guildId:ga,name:'blocked',description:'blocked',source:'function handle(){return {message:{content:"test"}};}'})).status,403);
  assert.equal((await request('a','GET',tools(ga)+'/drafts/..%2Fother')).status,400);
  const exportId=randomUUID();await pool.query('INSERT INTO workspace_structure_versions(id,owner_id,guild_id,name,bundle) VALUES($1,1,$2,\'fixture\',\'{"safe":"a-only"}\')',[exportId,ga]);
  assert.equal((await request('a','GET',tools(ga)+'/structure/versions/'+exportId)).body.bundle.safe,'a-only');
  assert.equal((await request('b','GET',tools(ga)+'/structure/versions/'+exportId)).status,404);
  assert.equal((await request('b','GET',tools(gb)+'/structure/versions/'+exportId)).status,404);
  const schedule=(await pool.query("INSERT INTO scheduled_messages(user_id,guild_id,channel_id,content,run_at) VALUES(1,$1,'channel','a-only',NOW()+INTERVAL '1 day') RETURNING id,updated_at",[ga])).rows[0];
  await pool.query('INSERT INTO workspace_schedule_history(schedule_id,run_at,status) VALUES($1,NOW(),\'sent\')',[schedule.id]);
  assert.equal((await request('b','GET',tools(ga)+'/schedules/'+schedule.id+'/history')).status,404);
  assert.equal((await request('b','PUT',tools(ga)+'/schedules/'+schedule.id,{action:'pause',confirmed:true,updatedAt:new Date(schedule.updated_at).toISOString()})).status,404);
  assert.equal((await request('b','POST','/api/workspace/'+ga+'/schedules/'+schedule.id+'/cancel',{})).status,409);
  assert.equal((await pool.query('SELECT status FROM scheduled_messages WHERE id=$1',[schedule.id])).rows[0].status,'scheduled');
  const base='/api/ai/bots/'+b1+'/code-commands';
  const created=await request('a','POST',base,{guildId:ga,name:'private',description:'test',source:'function handle(){return {message:{content:"a-only"}};}'});assert.equal(created.status,201);
  const id=created.body.id;
  assert.equal((await request('a','DELETE','/api/ai/bots/'+b1,{guildId:ga})).status,409,'disconnect cannot silently cascade-delete a saved code draft');
  for(const [user,guild,bot] of [['b',ga,b1],['b',gb,b1],['a',ga,b2]]){
    const p='/api/ai/bots/'+bot+'/code-commands/'+id;
    assert.ok([403,404].includes((await request(user,'GET',p+'/history?guildId='+guild)).status));
    assert.ok([403,404].includes((await request(user,'POST',p+'/secrets',{guildId:guild,name:'token',origin:'https://example.com',value:'foreign-token'})).status));
    assert.ok([403,404].includes((await request(user,'PATCH',p,{guildId:guild,action:'save',revision:1,source:'function handle(){}'})).status));
    assert.ok([403,404].includes((await request(user,'DELETE',p,{guildId:guild,confirmed:true})).status));
  }
  assert.equal((await pool.query('SELECT revision FROM code_commands WHERE id=$1',[id])).rows[0].revision,1);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM code_project_secrets')).rows[0].n,0);
  await requireBotRegistrationOwner(pool,ga,b1,1);
  assert.equal((await request('b','DELETE','/api/ai/bots/'+b1,{guildId:ga})).status,403);
  await assert.rejects(requireBotRegistrationOwner(pool,ga,b1,2),e=>e.status===403);
  await assert.rejects(saveOwnedBotRegistration(pool,[ga,b1,2,'takeover','replaced',null,false,false]),e=>e.status===403);
  assert.equal(String((await pool.query('SELECT owner_id FROM customer_bot_registry WHERE guild_id=$1 AND bot_user_id=$2',[ga,b1])).rows[0].owner_id),'1');
  // A bot-scoped scheduler may not clean up another bot or another guild.
  const jobs=[];
  for(const [guild,bot,owner] of [[ga,b1,1],[ga,b2,1],[gb,b1,2]]){
    const command=randomUUID(),job=randomUUID();jobs.push(job);
    await pool.query("INSERT INTO code_commands(id,owner_id,guild_id,bot_user_id,name,description,enabled,active_revision) VALUES($1,$2,$3,$4,'scheduler','test',TRUE,1)",[command,owner,guild,bot]);
    await pool.query("INSERT INTO code_project_jobs(id,command_id,revision,user_id,channel_id,event,run_at,status,claimed_at) VALUES($1,$2,1,'actor','channel','{}',NOW(),'running',NOW()-INTERVAL '11 minutes')",[job,command]);
  }
  const bot={user:{id:b1},isReady:()=>true};const stop=startProjectScheduler(bot,pool,ga);await stop.tick();await stop();
  for(let index=0;index<jobs.length;index++)assert.equal((await pool.query('SELECT status FROM code_project_jobs WHERE id=$1',[jobs[index]])).rows[0].status,index===0?'failed':'running');
  // Simulate a provider accepting a message and then losing its response. The
  // durable claim must block a second send after a fresh execution attempt.
  if(concurrent){
    t.after(()=>stopBotMutationLocks(pool));
    let release,entered,executions=0;
    const started=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
    const lockedHandler=botMutationHandler(pool,async(req,res)=>{executions++;if(req.hold){entered();await gate;}res.json({ok:true});});
    const reply=()=>({statusCode:200,status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}});
    const commandReq={method:'POST',params:{botId:b1},body:{guildId:ga},hold:true};
    const first=lockedHandler(commandReq,reply(),error=>{throw error;});await started;
    try{
      const collision=reply();await lockedHandler({...commandReq,hold:false},collision,error=>{throw error;});assert.equal(collision.statusCode,409);assert.equal(executions,1);
      const otherGuild=reply();await lockedHandler({...commandReq,body:{guildId:gb},hold:false},otherGuild,error=>{throw error;});assert.equal(otherGuild.statusCode,200);assert.equal(executions,2);
    }finally{release();await first;}
    const retry=reply();await lockedHandler({...commandReq,hold:false},retry,error=>{throw error;});assert.equal(retry.statusCode,200);
  const replayCommand=randomUUID(),replayJob=randomUUID();
  const source=JSON.stringify({format:'diskoko-project@1',entry:'index.js',permissions:['schedule'],origins:[],files:{'index.js':'export function handle(){return {message:{content:"scheduled fixture"}};}'}});
  await pool.query("INSERT INTO code_commands(id,owner_id,guild_id,bot_user_id,name,description,enabled,active_revision) VALUES($1,1,$2,$3,'replay','test',TRUE,1)",[replayCommand,ga,b1]);
  await pool.query('INSERT INTO code_command_versions(command_id,revision,source) VALUES($1,1,$2)',[replayCommand,source]);
  await pool.query("INSERT INTO code_project_jobs(id,command_id,revision,user_id,channel_id,event,run_at,status,claimed_at) VALUES($1,$2,1,'actor','channel','{}',NOW(),'running',NOW())",[replayJob,replayCommand]);
  const target={id:'channel',guildId:ga,isTextBased:()=>true,send(){},permissionsFor:()=>({has:()=>true})};
  let actorId=users.limited.discord_id;
  const guild={id:ga,name:'fixture',members:{fetch:async()=>({id:actorId,user:{id:actorId,username:'actor'},permissions:{has:()=>true}})},channels:{fetch:async()=>target}};
  let accepted=0;const transport={post:async()=>{accepted++;throw Error('Provider accepted but receipt lost');}};
  const actorBot={user:{id:b1},guilds:{fetch:async()=>guild}};
  const job={id:replayJob,command_id:replayCommand,revision:1,user_id:'actor',channel_id:'channel',event:{type:'schedule'}};
  await runProjectJob(actorBot,pool,job,transport);assert.equal(accepted,0,'revoked team command permission prevents a queued send');
  actorId=users.a.discord_id;
  await runProjectJob(actorBot,pool,job,transport);await runProjectJob(actorBot,pool,job,transport);
  assert.equal(accepted,1);
  assert.equal((await pool.query('SELECT status FROM code_project_effects WHERE command_id=$1 AND event_key=$2',[replayCommand,replayJob+':result'])).rows[0].status,'started');
  }
  if(concurrent){
    const body={revision:1,definition:{...def,name:'raced'}};
    const results=await Promise.all([request('a','PUT',tools(ga)+'/drafts/same',body),request('a','PUT',tools(ga)+'/drafts/same',body)]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    assert.equal((await pool.query('SELECT revision FROM workspace_cloud_drafts WHERE owner_id=1 AND guild_id=$1 AND draft_key=\'same\'',[ga])).rows[0].revision,2);
    const values=[gb,b2,1,'first','fixture',null,false,false];
    const claims=await Promise.allSettled([saveOwnedBotRegistration(pool,values),saveOwnedBotRegistration(pool,[...values.slice(0,2),2,...values.slice(3)])]);
    assert.equal(claims.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(claims.find(r=>r.status==='rejected').reason.status,403);
  }
  assert.equal(writes,0,'foreign operations and local draft CRUD never mutate Discord');
  assert.equal((await isolationPreflight(pool)).ok,true);
}

test('customer isolation matrix executes real SQL through HTTP handlers',{timeout:60000},async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec('CREATE FUNCTION pg_advisory_xact_lock(integer) RETURNS void AS $$ SELECT $$ LANGUAGE SQL');
  await db.exec('CREATE FUNCTION pg_try_advisory_lock(integer) RETURNS boolean AS $$ SELECT true $$ LANGUAGE SQL; CREATE FUNCTION pg_advisory_unlock(integer) RETURNS boolean AS $$ SELECT true $$ LANGUAGE SQL');
  const query=(sql,p)=>!p && typeof sql==='string' && sql.includes(';')?db.exec(sql):db.query(sql,p);
  await matrix(t,{query,connect:async()=>({query,release(){}})});
});
test('PostgreSQL isolation matrix and simultaneous writes preserve ownership and revisions',{timeout:60000},async t=>{
  if(!process.env.RESOURCE_TEST_DATABASE_URL){t.skip('Disposable PostgreSQL required; mandatory in CI');return;}
  const admin=new pg.Pool({connectionString:process.env.RESOURCE_TEST_DATABASE_URL}),name='tenant_'+randomUUID().replaceAll('-','');
  let pool;t.after(async()=>{if(pool){await stopBotMutationLocks(pool);await stopProjectLedger(pool);await pool.end();}await admin.query('DROP DATABASE IF EXISTS "'+name+'"');await admin.end();});
  await admin.query('CREATE DATABASE "'+name+'"');const url=new URL(process.env.RESOURCE_TEST_DATABASE_URL);url.pathname='/'+name;pool=new pg.Pool({connectionString:url.toString()});
  await matrix(t,pool,{concurrent:true});
});
