import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PermissionFlagsBits as F,PermissionsBitField,IntentsBitField,GatewayIntentBits as I} from 'discord.js';
import {normalizeAdminPanel,adminPanelProject} from '../admin-panel-template.js';
import {centerOperations,authorizeOps,executeOps,diagnoseCenter} from '../lib/control-center-operations.js';
import {dhikrConfig,dhikrLibrary,chooseDhikr,formatDhikr,dhikrDelay} from '../lib/control-center-dhikr.js';
import {CenterStore} from '../lib/control-center-store.js';
import {createCenterEngine} from '../lib/control-center-engine.js';
import {tickCenterJobs} from '../lib/control-center-runtime.js';
import {normalizeCodeOutput,runCode} from '../lib/code-command-sandbox.js';
import {discordCodePayload} from '../lib/code-commands.js';
import {createProjectApi} from '../lib/code-project-api.js';
const gid='111111111111111111',bid='222222222222222222',uid='333333333333333333',cid='444444444444444444',rid='555555555555555555',tid='11111111-1111-4111-8111-111111111111';
const command={id:tid,owner_id:7,guild_id:gid,bot_user_id:bid,active_revision:2},design=normalizeAdminPanel();
function fixture(){
 const actor={id:uid,permissions:new PermissionsBitField(F.Administrator),roles:{cache:{some:()=>false}}},bot={id:bid,permissions:new PermissionsBitField(F.Administrator),roles:{highest:{position:10}}};
 const channel={id:cid,guildId:gid,type:0,name:'الأذكار',rawPosition:1,permissionsFor:who=>new PermissionsBitField(typeof who==='string'?[]:F.Administrator),permissionOverwrites:{cache:new Map([[uid,{allow:new PermissionsBitField(F.ReadMessageHistory|F.SendMessages),deny:new PermissionsBitField(F.AttachFiles)}]])},messages:{fetch:async()=>new Map()}};
 const guild={id:gid,ownerId:uid,name:'Fixture',client:{user:{id:bid},options:{intents:new IntentsBitField(I.GuildMembers|I.MessageContent)}},members:{fetchMe:async()=>bot,fetch:async()=>actor},channels:{fetch:async id=>id?channel:new Map([[cid,channel]])},roles:{fetch:async()=>new Map()}};
 const ticket={id:tid,user_id:uid,channel_id:cid,status:'open',state_version:2,assigned_to:null,created_at:new Date().toISOString()};
 const calls=[],db={query:async(sql,p)=>{calls.push({sql,p});if(sql.includes('SELECT * FROM control_center_tickets'))return {rows:[ticket]};if(sql.includes('SELECT * FROM control_center_submissions'))return {rows:[{...ticket,answers:{question:'answer'},status:'pending'}]};if(sql.includes('RETURNING'))return {rows:[{id:tid}]};return {rows:[]};}};
 const store=new CenterStore(db,command);return {actor,bot,channel,guild,ticket,db,store,calls,current:{actor,guild,manager:true},interaction:{user:{id:uid},id:'test',channelId:cid,values:[]}};
}
test('curated content has sources, stable unique IDs, bounded messages and no immediate repeat where alternatives exist',()=>{
 const all=Object.values(dhikrLibrary).flat();assert.equal(all.length,38);assert.equal(new Set(all.map(e=>e.id)).size,38);
 for(const entry of all){assert.ok(entry.reference.length>5);assert.ok(formatDhikr(entry).length<2000);assert.ok(entry.repetitions>=1);}
 const config=dhikrConfig({channel:cid,types:'التسبيح، أدعية قرآنية',interval:'5'});assert.deepEqual(config.types,['tasbih','dua']);
 let last;for(let i=0;i<50;i++){const next=chooseDhikr(config,last);assert.notEqual(next.id,last);last=next.id;}
 assert.throws(()=>dhikrConfig({channel:cid,types:'constructor',interval:'5'}));
 assert.throws(()=>dhikrConfig({channel:cid,types:'morning',interval:'daily'}));
});
test('daily morning/evening schedule follows timezone, skips missed sends and sends a sourced complete pack',()=>{
 const config=dhikrConfig({channel:cid,types:['morning','evening'],interval:'daily',timezone:'Asia/Riyadh'});
 const now=Date.parse('2026-10-19T03:59:40Z');assert.equal(dhikrDelay(config,now),20000);
 const morning=chooseDhikr(config,null,now+20000),evening=chooseDhikr(config,null,Date.parse('2026-10-19T16:00:00Z'));
 assert.equal(morning.id,'morning-pack');assert.equal(evening.id,'evening-pack');assert.ok(formatDhikr(morning).length<2000);assert.ok(formatDhikr(evening).length<2000);
 assert.match(morning.text,/أصبحنا/);assert.match(evening.text,/أمسينا/);
 assert.equal(dhikrDelay(config,now+20000),12*3600000);
 for(const timezone of ['Africa/Cairo','Africa/Casablanca','UTC']){const delay=dhikrDelay({...config,timezone},now);assert.ok(delay>0 && delay<=25*3600000);}
});
test('Arabic setup, content library and all empty operational screens fit native rows and select limits',async()=>{
 const f=fixture(),state={},base={...f,command,design,state,preview:true};
 for(const id of ['tools_open','tools_draft','tools_roles','tools_library','tools_tickets','tools_applications','tools_logs','tools_health']){
  const output=normalizeCodeOutput(await centerOperations({...base,operation:{id}}));const payload=discordCodePayload(output,tid);assert.ok(payload.components.length<=5);
 }
 const output=normalizeCodeOutput(await centerOperations({...base,operation:{id:'tools_draft_types',data:{values:['tasbih','dua']}} ,interaction:{...f.interaction,values:['tasbih','dua']}}));
 const select=discordCodePayload(output,tid).components.flatMap(r=>r.components).find(c=>c.max_values===10);assert.ok(select);assert.equal(select.min_values,1);
 for(const options of [{minValues:2,maxValues:1},{minValues:1,maxValues:26},{minValues:0,maxValues:1}])assert.throws(()=>normalizeCodeOutput({message:{content:'test',controls:[{type:'select',action:'test',options:[{label:'A',value:'a'}],...options}]}}));
});
test('operational screens work through both current and already-published QuickJS routers without rewriting client files',async()=>{
 for(const legacy of [false,true]){
  const project=adminPanelProject({controlCenter:true});if(legacy)project.files['control-center-view.js']=project.files['control-center-view.js'].replace(/ if\(action\?\.startsWith\('tools_'\)\).*?\n/,'');
  const sdk=createProjectApi({project,preview:true});let output=normalizeCodeOutput(await runCode(JSON.stringify(project),{event:{type:'command'},state:{}},'ops-home',{bridge:sdk.call}));
  assert.ok(output.message.controls.some(c=>c.action==='tools_open'));
  output=normalizeCodeOutput(await runCode(JSON.stringify(project),{event:{type:'button',action:'tools_open'},state:{}},'ops-tools',{bridge:sdk.call}));assert.equal(output.message.controls[0].action,'tools_menu');assert.equal(sdk.effects.length,0);
 }
});
test('draft selections remain private until an explicit reviewed save; preview never sends or changes settings',async()=>{
 const f=fixture(),memory={},store=new CenterStore(null,command,memory),state={},base={...f,store,state,design,command,preview:true};
 await centerOperations({...base,operation:{id:'tools_draft'}});
 await centerOperations({...base,interaction:{...f.interaction,values:[cid]},operation:{id:'tools_draft_channel'}});
 const result=await centerOperations({...base,operation:{id:'tools_draft_save'}});assert.equal(memory.centerSettings,undefined);assert.ok(result.state.centerReview);
 assert.equal(memory.centerReviews[state.centerReview].operation.id,'ops.dhikr.configure');
});
test('ticket writes require current version, private channel and fresh operator/bot permissions',async()=>{
 const f=fixture(),operation={id:'ops.ticket.close',data:{id:tid,version:2}};
 await authorizeOps({...f,operation});await assert.rejects(authorizeOps({...f,operation:{...operation,data:{id:tid,version:1}}}),/تغير/);
 f.channel.permissionsFor=()=>new PermissionsBitField(F.Administrator);await assert.rejects(authorizeOps({...f,operation}),/خاصة/);
 f.channel.permissionsFor=()=>new PermissionsBitField();await assert.rejects(authorizeOps({...f,operation}),/خاصة/);
 for(const call of f.calls){assert.deepEqual(call.p.slice(0,4),f.store.scope);}
});
test('ticket close preserves unrelated overwrites and application decisions use scoped version comparison',async()=>{
 const f=fixture(),writes=[],rest=()=>({put:async(path,args)=>writes.push({path,args})});
 await executeOps({...f,operation:{id:'ops.ticket.close',data:{id:tid,version:2}},rest});assert.equal(writes.length,1);
 const body=writes[0].args.body;assert.ok(BigInt(body.allow)&F.ReadMessageHistory);assert.ok(BigInt(body.deny)&F.AttachFiles);assert.ok(BigInt(body.deny)&F.SendMessages);assert.equal(BigInt(body.allow)&F.SendMessages,0n);
 await executeOps({...f,operation:{id:'ops.application.accept',data:{id:tid,version:2}},rest});
 const q=f.calls.find(c=>c.sql.startsWith('UPDATE control_center_submissions'));assert.match(q.sql,/state_version=\$6/);assert.equal(q.p[6],'accepted');assert.equal(q.p[7],uid);assert.deepEqual(q.p.slice(0,4),f.store.scope);
});
test('another open ticket prevents reopening and releasing another moderator assignment is denied',async()=>{
 const f=fixture();f.guild.ownerId='666666666666666666';f.ticket.assigned_to=rid;
 await assert.rejects(authorizeOps({...f,operation:{id:'ops.ticket.release',data:{id:tid,version:2}}}),/المستلم/);
 const query=f.db.query;f.db.query=async(sql,p)=>sql.includes("status IN ('creating','open')")?{rows:[{id:'other'}]}:query(sql,p);
 await assert.rejects(authorizeOps({...f,operation:{id:'ops.ticket.reopen',data:{id:tid,version:2}}}),/تذكرة مفتوحة أخرى/);
});
test('archives are bounded snapshots, retained privately, and re-check current channel access when viewed',async()=>{
 const f=fixture();f.channel.messages.fetch=async()=>new Map([['1',{id:'1',author:{id:uid},createdTimestamp:Date.now(),content:'private fixture',attachments:new Map()}]]);
 await executeOps({...f,operation:{id:'ops.ticket.archive',data:{id:tid,version:2}}});
 const q=f.calls.find(c=>c.sql.includes('SET archive='));const archive=JSON.parse(q.p[6]);assert.equal(archive.messages[0].content,'private fixture');assert.equal(archive.limit,100);assert.match(q.sql,/archived_at=NOW/);
 f.channel.permissionsFor=()=>new PermissionsBitField();await assert.rejects(centerOperations({...f,command,design,state:{opsTicket:tid},operation:{id:'tools_archive'},preview:false}),/خاصة/);
});
test('test-send has a durable per-minute claim and never pings roles or starts a schedule',async()=>{
 const f=fixture(),config=dhikrConfig({channel:cid,types:'tasbih',interval:'5',mention:rid});f.guild.roles.fetch=async()=>({id:rid,mentionable:true});let sends=0;
 const rest=()=>({post:async(path,args)=>{sends++;assert.deepEqual(args.body.allowed_mentions,{parse:[]});assert.ok(!args.body.content.includes('<@'));return {id:'sent'};}});
 await executeOps({...f,operation:{id:'ops.dhikr.test',data:{config}},rest});assert.equal(sends,1);assert.ok(!f.calls.some(c=>c.sql.includes('INSERT INTO control_center_jobs')));
 const query=f.db.query;f.db.query=async(sql,p)=>sql.includes('INSERT INTO control_center_events')?{rows:[]}:query(sql,p);
 await assert.rejects(executeOps({...f,operation:{id:'ops.dhikr.test',data:{config}},rest}),/واحد في الدقيقة/);assert.equal(sends,1);
});
test('read-only diagnosis identifies missing intents and never changes permissions',async()=>{
 const f=fixture();f.bot.permissions=new PermissionsBitField();f.guild.client.options.intents=new IntentsBitField();const text=await diagnoseCenter(f.guild,f.actor,{});assert.match(text,/Server Members Intent/);assert.match(text,/Message Content Intent/);assert.match(text,/امنحها للبوت/);assert.equal(f.calls.length,0);
});
test('a blocked panel operator cannot bypass restrictions through the new operational screens',async()=>{
 const f=fixture();f.guild.ownerId=rid;f.db.query=async(sql,p)=>sql.startsWith('SELECT settings')?{rows:[{settings:{blocked:[uid]}}]}:{rows:[]};
 const engine=createCenterEngine({...f,command,client:f.db,pool:f.db,preview:false,authority:async()=>f.current});
 await assert.rejects(engine({operation:{kind:'home',id:'tools_open'},state:{},design}),/ممنوع/);
});
function schedulerFixture({fail=false,enabled=true}={}){
 const f=fixture(),job={command_id:tid,owner_id:7,guild_id:gid,bot_id:bid,actor_id:uid,channel_id:cid,revision:2,config:dhikrConfig({channel:cid,types:'tasbih',interval:'5'}),last_entry:'tasbih-1',due_at:new Date().toISOString()},calls=[];let claimed=false,sends=0,released=false;
 const db={query:async(sql,p)=>{calls.push({sql,p});if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};if(sql.startsWith('SELECT j.enabled'))return {rows:[{enabled}]};return {rows:[]};},release:()=>released=true};
 const pool={query:async(sql,p)=>{calls.push({sql,p});if(sql.includes('RETURNING j.*') && !claimed){claimed=true;return {rows:[job]};}return {rows:[]};},connect:async()=>db};
 const client={user:{id:bid},guilds:{fetch:async()=>f.guild}};
 const transport=()=>({post:async(path,args)=>{sends++;assert.ok(args.body.enforce_nonce);assert.match(args.body.content,/المصدر/);if(fail)throw Error('uncertain send');return {id:'sent-id'};}});
 return {pool,client,transport,calls,get sends(){return sends;},get released(){return released;}};
}
test('scheduler sends once, saves telemetry and releases durable guild lock; repeat tick does not resend',async()=>{
 const f=schedulerFixture();await tickCenterJobs(f.client,f.pool,gid,{transport:f.transport});await tickCenterJobs(f.client,f.pool,gid,{transport:f.transport});assert.equal(f.sends,1);assert.ok(f.released);
 const q=f.calls.find(c=>c.sql.includes('sent_count=sent_count+1'));assert.equal(q.p[6],'sent-id');assert.notEqual(q.p[5],'tasbih-1');assert.deepEqual(q.p.slice(0,4),[tid,7,gid,bid]);
});
test('uncertain scheduler send stops for review; disable/revision change detected before REST prevents a send',async()=>{
 const fail=schedulerFixture({fail:true});await tickCenterJobs(fail.client,fail.pool,gid,{transport:fail.transport});assert.equal(fail.sends,1);assert.ok(fail.calls.some(c=>c.sql.includes("enabled=FALSE,status='review_required'") && c.p[4]==='uncertain send'));
 const disabled=schedulerFixture({enabled:false});await tickCenterJobs(disabled.client,disabled.pool,gid,{transport:disabled.transport});assert.equal(disabled.sends,0);assert.ok(disabled.released);
});
test('migration and retention preserve existing customer rows and expire only scoped old ticket archives',()=>{
 const store=fs.readFileSync(new URL('../lib/control-center-store.js',import.meta.url),'utf8'),runtime=fs.readFileSync(new URL('../lib/control-center-runtime.js',import.meta.url),'utf8');
 assert.match(store,/ADD COLUMN IF NOT EXISTS state_version/);assert.match(runtime,/archive=NULL,archived_at=NULL WHERE bot_id=\$1/);assert.match(runtime,/30 days/);assert.ok(!store.includes('DROP TABLE'));
});
