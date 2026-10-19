import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {PGlite} from '@electric-sql/pglite';
import {Collection,PermissionsBitField,PermissionFlagsBits as F,IntentsBitField,GatewayIntentBits as I,AuditLogEvent} from 'discord.js';
import {normalizeAdminPanel} from '../admin-panel-template.js';
import {centerCard} from '../control-center-view.js';
import {controlSections} from '../control-center-catalog.js';
import {normalizeCodeOutput} from '../lib/code-command-sandbox.js';
import {migrateControlCenter,CenterStore} from '../lib/control-center-store.js';
import {guardConfig,guardPreflight,handleCenterAudit,guardScreen} from '../lib/control-center-channel-guard.js';

test('generated cards are unbranded by default and accept an optional customer footer',()=>{
 for(const footerText of ['', 'مجتمعنا · فريق الإدارة']){
  const output=normalizeCodeOutput(centerCard(normalizeAdminPanel({footerText}),{},'بطاقة','نص'));
  assert.equal(output.message.embeds[0].footer?.text,footerText || undefined);
 }
 assert.throws(()=>normalizeAdminPanel({footerText:'x'.repeat(201)}));
 const legacy={message:{embeds:[{title:'Old panel',footer:{text:'ديسكوكو · مركز التحكم بالسيرفر'}}]}};
 assert.equal(normalizeCodeOutput(legacy,{panelFooter:''}).message.embeds[0].footer,undefined);
 assert.equal(normalizeCodeOutput(legacy,{panelFooter:'Custom'}).message.embeds[0].footer.text,'Custom');
 assert.equal(normalizeCodeOutput({message:{embeds:[{title:'Custom code',footer:{text:'Own code'}}]}},{panelFooter:''}).message.embeds[0].footer.text,'Own code');
});
test('previously disabled channel guard controls activate only for identified center projects',()=>{
 const raw={message:{content:'Guard',controls:[{type:'button',label:'منع الحذف · قريبًا',action:'op_antidelete',disabled:true}]}};
 assert.equal(normalizeCodeOutput(raw).message.controls[0].disabled,true);
 const control=normalizeCodeOutput(raw,{centerFeatures:true}).message.controls[0];assert.equal(control.disabled,undefined);assert.equal(control.label,'منع الحذف');
});
test('designer exposes footer editing, live preview and blank-to-hide without rewriting project code',async()=>{
 const dom=new JSDOM('<main></main>',{url:'https://diskoko.test',runScripts:'outside-only'}),w=dom.window;
 w.controlSections=controlSections;w.normalizeAdminPanel=normalizeAdminPanel;
 w.eval(fs.readFileSync(new URL('../admin-panel-editor.js',import.meta.url),'utf8').replace(/^import .*\r?\n/gm,'').replace(/^export /gm,''));
 w.openAdminPanelDesigner({bots:[{id:'bot',name:'خاص'}],guild:'guild',api:async()=>({emojis:[]}),esc:String,closeDialog(){},modal:(_title,body,footer)=>w.document.querySelector('main').innerHTML=body+footer});
 const field=w.document.querySelector('#adminPanelFooter');assert.ok(field);field.value='فريق مجتمعنا';field.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(w.document.querySelector('[data-footer-preview]').textContent,'فريق مجتمعنا');
 field.value='';field.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(w.document.querySelector('[data-footer-preview]'),null);await new Promise(r=>setTimeout(r,0));dom.window.close();
});
test('channel guards validate intent, private logs, bounds and safe reaction modes',async()=>{
 assert.throws(()=>guardConfig({count:0}));assert.throws(()=>guardConfig({seconds:500}));assert.throws(()=>guardConfig({mode:'ban-all'}));
 const actor={permissions:new PermissionsBitField(F.Administrator)},me={permissions:new PermissionsBitField(F.Administrator)};
 const guild={id:'g',roles:{fetch:async()=>new Collection()},client:{options:{intents:new IntentsBitField()}},members:{fetchMe:async()=>me}};
 await assert.rejects(guardPreflight(guild,actor,{}),/View Audit Log/);
 guild.client.options.intents.add(I.GuildModeration);await assert.rejects(guardPreflight(guild,actor,{}),/لوقات/);
 guild.channels={fetch:async()=>({guildId:'g',permissionsFor:()=>new PermissionsBitField(F.Administrator)})};await assert.rejects(guardPreflight(guild,actor,{logChannel:'c'}),/خاصة/);
});
test('host guard setup remains previewable within Discord budgets and requires later confirmation',async()=>{
 const store=new CenterStore(null,{id:'preview'},{}),state={},design=normalizeAdminPanel();
 const output=normalizeCodeOutput(await guardScreen({operation:{id:'tools_guard'},state,design,store}));assert.ok(output.message.controls.length<=25);
 const review=normalizeCodeOutput(await guardScreen({operation:{id:'tools_guard_save'},state,design,store}));assert.ok(review.state.centerReview);assert.ok(review.message.controls.some(c=>c.action==='confirm'));
});
test('actual PostgreSQL audit counting, attribution, hierarchy, deduplication and isolation',async t=>{
 const pg=new PGlite(),db={query:(sql,params)=>params?pg.query(sql,params):pg.exec(sql).then(r=>r.at(-1)),connect:async()=>({...db,release(){}})};
 const gid='111111111111111111',bid='222222222222222222',owner='333333333333333333',executor='666666666666666666',cid='444444444444444444',id='11111111-1111-4111-8111-111111111111';
 await pg.exec('CREATE TABLE code_commands(id UUID PRIMARY KEY,owner_id BIGINT,guild_id TEXT,bot_user_id TEXT,enabled BOOLEAN DEFAULT TRUE);');await migrateControlCenter(db);
 await pg.query('INSERT INTO code_commands(id,owner_id,guild_id,bot_user_id) VALUES($1,7,$2,$3)',[id,gid,bid]);
 const command={id,owner_id:7,guild_id:gid,bot_user_id:bid},store=new CenterStore(db,command),settings={operator:owner,logChannel:cid,protection:{enabled:true,create:true,delete:true},channelGuard:{count:3,seconds:30,mode:'quarantine',consentVersion:1}};
 const role={id:'777777777777777777',managed:false,permissions:new PermissionsBitField(F.ManageChannels),comparePositionTo:r=>5-r.position};
 const actor={id:owner,permissions:new PermissionsBitField(F.Administrator)},me={id:bid,permissions:new PermissionsBitField(F.Administrator),roles:{highest:{position:10}}},target={id:executor,roles:{highest:{comparePositionTo:r=>5-r.position},cache:new Collection([[role.id,role]])}};
 const log={id:cid,guildId:gid,permissionsFor:x=>new PermissionsBitField(typeof x==='string'?[]:F.Administrator)},client={user:{id:bid},options:{intents:new IntentsBitField(I.GuildModeration)}};
 const guild={id:gid,ownerId:owner,roles:{fetch:async()=>new Collection()},client,members:{fetch:async({user})=>user===owner?actor:target,fetchMe:async()=>me},channels:{fetch:async()=>log}};
 const writes=[],transport=()=>({delete:async(path)=>writes.push({kind:'delete',path}),post:async(path,args)=>writes.push({kind:'post',path,args})});
 const entry=(n,action=AuditLogEvent.ChannelCreate,who=executor)=>({id:String(100000000000000000n+BigInt(n)),action,executorId:who,targetId:cid,createdTimestamp:Date.now()});
 try{
  await t.test('counts exact audit executor and reacts once only when configured threshold is crossed',async()=>{
   await store.setSettings(settings);for(let n=1;n<=3;n++)await handleCenterAudit(entry(n),guild,db,{transport});assert.equal(writes.filter(w=>w.kind==='delete').length,1);assert.match(writes[0].path,new RegExp(executor));
   await handleCenterAudit(entry(3),guild,db,{transport});await handleCenterAudit(entry(4),guild,db,{transport});assert.equal(writes.filter(w=>w.kind==='delete').length,1);
   assert.equal((await pg.query('SELECT COUNT(*)::int AS n FROM control_center_guard_claims')).rows[0].n,1);
  });
  await t.test('owner, bot, old events, trusted users and another bot never trigger a reaction',async()=>{
   const before=writes.length;for(const who of [owner,bid])await handleCenterAudit(entry(10,AuditLogEvent.ChannelDelete,who),guild,db,{transport});await handleCenterAudit({...entry(11),createdTimestamp:Date.now()-180000},guild,db,{transport});
   await store.setSettings({...settings,trusted:[executor]});await handleCenterAudit(entry(12),guild,db,{transport});await handleCenterAudit(entry(13),{...guild,client:{...client,user:{id:'888888888888888888'}}},db,{transport});assert.equal(writes.length,before);
  });
  await t.test('an operator above the bot hierarchy pauses instead of stripping protected roles',async()=>{
   await pg.query('DELETE FROM control_center_guard_claims');await store.setSettings({...settings,channelGuard:{count:1,seconds:30,mode:'quarantine',consentVersion:1}});target.roles.highest.comparePositionTo=()=>1;
   const before=writes.length;await handleCenterAudit(entry(20,AuditLogEvent.ChannelDelete),guild,db,{transport});assert.equal(writes.length,before);assert.equal((await store.settings()).automationPaused,true);
   const events=(await pg.query("SELECT status FROM control_center_events WHERE kind='guardReaction' ORDER BY created_at DESC LIMIT 1")).rows;assert.equal(events[0].status,'review_required');
  });
  await t.test('alert-only mode records and notifies without changing roles',async()=>{
   await pg.query('DELETE FROM control_center_guard_claims');await store.setSettings({...settings,channelGuard:{count:1,seconds:30,mode:'alert',consentVersion:1}});const before=writes.filter(w=>w.kind==='delete').length;
   await handleCenterAudit(entry(30,AuditLogEvent.ChannelDelete),guild,db,{transport});assert.equal(writes.filter(w=>w.kind==='delete').length,before);assert.match(writes.at(-1).args.body.content,/تنبيه فقط/);
  });
 }finally{await pg.close();}
});
