import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {Collection,PermissionsBitField,PermissionFlagsBits as F,IntentsBitField,GatewayIntentBits as I} from 'discord.js';
import {migrateControlCenter,CenterStore} from '../lib/control-center-store.js';
import {centerOperations,authorizeOps,executeOps} from '../lib/control-center-operations.js';
import {executeCenter} from '../lib/control-center-engine.js';
import {tickCenterJobs,handleCenterPublic} from '../lib/control-center-runtime.js';
import {normalizeAdminPanel} from '../admin-panel-template.js';
import {normalizeCodeOutput} from '../lib/code-command-sandbox.js';

test('isolated PostgreSQL verifies migrations, operational state transitions, tenant isolation and scheduled sends',async t=>{
 const pg=new PGlite(),db={query:(sql,params)=>params?pg.query(sql,params):pg.exec(sql).then(results=>results.at(-1) || {rows:[]}),connect:async()=>({...db,release(){}})};
 await pg.exec(`CREATE TABLE code_commands(id UUID PRIMARY KEY,owner_id BIGINT,guild_id TEXT,bot_user_id TEXT,active_revision INT,enabled BOOLEAN DEFAULT TRUE,created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE code_command_runs(id BIGSERIAL PRIMARY KEY,command_id UUID,success BOOLEAN,error TEXT,created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE code_command_sessions(id UUID PRIMARY KEY,command_id UUID,revision INT,discord_user_id TEXT,actions JSONB,state JSONB,expires_at TIMESTAMPTZ);`);
 const gid='111111111111111111',bid='222222222222222222',uid='333333333333333333',cid='444444444444444444',tid='11111111-1111-4111-8111-111111111111',appId='22222222-2222-4222-8222-222222222222',otherId='33333333-3333-4333-8333-333333333333';
 const command={id:tid,owner_id:7,guild_id:gid,bot_user_id:bid,active_revision:2};
 await pg.query('INSERT INTO code_commands(id,owner_id,guild_id,bot_user_id,active_revision) VALUES($1,7,$2,$3,2),($4,8,$2,$3,2)',[tid,gid,bid,otherId]);
 await migrateControlCenter(db);const store=new CenterStore(db,command);
 const actor={id:uid,permissions:new PermissionsBitField(F.Administrator),roles:{cache:new Collection()}},bot={id:bid,permissions:new PermissionsBitField(F.Administrator)};
 const channel={id:cid,type:0,name:'private-ticket',guildId:gid,rawPosition:0,permissionsFor:x=>new PermissionsBitField(typeof x==='string'?[]:F.Administrator),permissionOverwrites:{cache:new Collection()},messages:{fetch:async()=>new Collection([['message',{id:'message',author:{id:uid},createdTimestamp:Date.now(),content:'private QA message',attachments:new Collection()}]])}};
 const guild={id:gid,ownerId:uid,name:'QA',client:{user:{id:bid},options:{intents:new IntentsBitField(I.GuildMembers|I.MessageContent)}},members:{fetch:async()=>actor,fetchMe:async()=>bot},channels:{fetch:async id=>id?channel:new Collection([[cid,channel]])},roles:{fetch:async()=>new Collection()}};
 const current={guild,actor},interaction={id:'qa-action',user:{id:uid},channelId:cid,values:[]},base={store,current,interaction,command,design:normalizeAdminPanel(),state:{},preview:false},effects=[],rest=()=>({put:async(...args)=>effects.push(args),post:async(...args)=>{effects.push(args);return {id:'sent-id'};}});
 try{
  await t.test('idempotent migration preserves existing settings and adds safe defaults',async()=>{
   await store.setSettings({operator:uid,custom:'preserved'});await migrateControlCenter(db);assert.equal((await store.settings()).custom,'preserved');
   await pg.query("INSERT INTO control_center_tickets(id,command_id,owner_id,guild_id,bot_id,user_id,channel_id,status) VALUES($1,$1,7,$2,$3,$4,$5,'open')",[tid,gid,bid,uid,cid]);
   const row=(await pg.query('SELECT * FROM control_center_tickets WHERE id=$1',[tid])).rows[0];assert.equal(row.state_version,0);assert.equal(row.archive,null);
  });
  await t.test('ticket assignments, close/reopen, archive and stale-review rejection use real SQL',async()=>{
   const execute=async(action)=>{const row=(await pg.query('SELECT state_version FROM control_center_tickets WHERE id=$1',[tid])).rows[0];return executeOps({...base,rest,operation:{id:action,data:{id:tid,version:row.state_version}}});};
   await execute('ops.ticket.take');await execute('ops.ticket.close');await execute('ops.ticket.reopen');await execute('ops.ticket.archive');
   const row=(await pg.query('SELECT * FROM control_center_tickets WHERE id=$1',[tid])).rows[0];assert.equal(row.status,'open');assert.equal(row.assigned_to,uid);assert.ok(row.first_assigned_at);assert.equal(row.archive.messages[0].content,'private QA message');assert.ok(row.archived_at);
   await assert.rejects(authorizeOps({...base,operation:{id:'ops.ticket.close',data:{id:tid,version:0}}}),/تغير/);
   const foreign=new CenterStore(db,{...command,id:otherId,owner_id:8});await assert.rejects(authorizeOps({...base,store:foreign,operation:{id:'ops.ticket.close',data:{id:tid,version:row.state_version}}}),/لا يخص/);
  });
  await t.test('application decisions, re-submission reset and scoped list/report queries execute on PostgreSQL',async()=>{
   await pg.query('INSERT INTO control_center_submissions(id,command_id,owner_id,guild_id,bot_id,user_id,answers) VALUES($1,$2,7,$3,$4,$5,$6)',[appId,tid,gid,bid,uid,JSON.stringify({'1. سؤال':'إجابة'})]);
   await executeOps({...base,operation:{id:'ops.application.accept',data:{id:appId,version:0}}});
   let row=(await pg.query('SELECT * FROM control_center_submissions WHERE id=$1',[appId])).rows[0];assert.equal(row.status,'accepted');assert.equal(row.state_version,1);assert.equal(row.reviewer_id,uid);
   const session='44444444-4444-4444-8444-444444444444',settings=await store.settings();settings.application={enabled:true,channel:cid,questions:['سؤال'],title:'تقديم',message:'published'};await store.setSettings(settings);
   await pg.query("INSERT INTO code_command_sessions(id,command_id,revision,discord_user_id,actions,expires_at) VALUES($1,$2,2,$3,$4,NOW()+INTERVAL '15 minutes')",[session,tid,uid,JSON.stringify([{action:'center_application',type:'modal',channel:cid,questions:['سؤال']}])]);
   let reply;const handled=await handleCenterPublic({...interaction,customId:'diskoko-center-submit:'+tid+':'+session,guildId:gid,guild,fields:{fields:new Collection([['q0',{value:'إجابة جديدة'}]])},reply:async p=>reply=p},db,bid);
   assert.equal(handled,true);assert.match(reply.content,/تم حفظ/);
   row=(await pg.query('SELECT * FROM control_center_submissions WHERE id=$1',[appId])).rows[0];assert.equal(row.status,'pending');assert.equal(row.state_version,2);assert.equal(row.reviewer_id,null);assert.equal(row.answers['1. سؤال'],'إجابة جديدة');
   for(const id of ['tools_tickets','tools_applications','tools_logs'])normalizeCodeOutput(await centerOperations({...base,state:{},operation:{id}}));
   normalizeCodeOutput(await centerOperations({...base,interaction:{...interaction,values:[appId]},state:{opsApplication:appId},operation:{id:'tools_application'}}));
  });
  await t.test('durable review claim cannot execute twice and logs filter scoped operations',async()=>{
   const id=await store.review({id:'ops.application.accept'},uid,'test');await store.claimReview(id);await assert.rejects(store.claimReview(id),/بدأ/);await store.finishReview(id,'succeeded');
   const output=await centerOperations({...base,state:{logStatus:'succeeded',logActor:'me',logDays:7},operation:{id:'tools_logs'}});assert.match(output.message.embeds[0].description,/قبول التقديم/);
   const other=await centerOperations({...base,store:new CenterStore(db,{...command,id:otherId,owner_id:8}),state:{},operation:{id:'tools_logs'}});assert.match(other.message.embeds[0].description,/لا توجد عمليات/);
  });
  await t.test('actual job claim SQL sends once, persists telemetry, and stops an old schedule when configuration changes',async()=>{
   const config={channel:cid,types:['tasbih'],interval:'5'};
   await executeCenter({...base,rest,operation:{id:'dhikr.start',data:config}});
   await pg.query("UPDATE control_center_jobs SET due_at=NOW()-INTERVAL '1 minute' WHERE command_id=$1",[tid]);let sends=0;
   const client={user:{id:bid},guilds:{fetch:async()=>guild}};
   await tickCenterJobs(client,db,gid,{transport:()=>({post:async()=>{sends++;return {id:'schedule-message'};}})});
   let row=(await pg.query('SELECT * FROM control_center_jobs WHERE command_id=$1',[tid])).rows[0];assert.equal(sends,1);assert.equal(row.status,'idle');assert.equal(Number(row.sent_count),1);assert.equal(row.last_message_id,'schedule-message');assert.ok(row.last_entry);assert.ok(row.last_sent_at);
   await tickCenterJobs(client,db,gid,{transport:()=>({post:async()=>{sends++;}})});assert.equal(sends,1);
   await executeOps({...base,operation:{id:'ops.dhikr.configure',data:{config:{...config,interval:'10'}}}});row=(await pg.query('SELECT * FROM control_center_jobs WHERE command_id=$1',[tid])).rows[0];assert.equal(row.enabled,false);assert.equal((await store.settings()).dhikr.interval,'10');
  });
  await t.test('a stale in-flight send pauses rather than silently retrying',async()=>{
   await pg.query("UPDATE control_center_jobs SET enabled=TRUE,status='sending',updated_at=NOW()-INTERVAL '3 minutes' WHERE command_id=$1",[tid]);
   await tickCenterJobs({user:{id:bid},guilds:{fetch:async()=>guild}},db,gid,{transport:()=>({post:async()=>assert.fail('must not resend')})});
   const row=(await pg.query('SELECT * FROM control_center_jobs WHERE command_id=$1',[tid])).rows[0];assert.equal(row.enabled,false);assert.equal(row.status,'review_required');
  });
  await t.test('a missed daily reminder advances to the next slot instead of delivering yesterday’s content',async()=>{
   await pg.query("UPDATE control_center_jobs SET enabled=TRUE,status='idle',config=$2,due_at=NOW()-INTERVAL '1 day',updated_at=NOW() WHERE command_id=$1",[tid,JSON.stringify({channel:cid,types:['morning','evening'],interval:'daily',timezone:'Asia/Riyadh'})]);
   await tickCenterJobs({user:{id:bid},guilds:{fetch:async()=>guild}},db,gid,{transport:()=>({post:async()=>assert.fail('missed daily slot must not send')})});
   const row=(await pg.query('SELECT * FROM control_center_jobs WHERE command_id=$1',[tid])).rows[0];assert.equal(row.status,'idle');assert.ok(new Date(row.due_at).getTime()>Date.now());
  });
 }finally{await pg.close();}
});
