import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PermissionFlagsBits as F,PermissionsBitField} from 'discord.js';
import {adminPanelProject,normalizeAdminPanel} from '../admin-panel-template.js';
import {controlForms} from '../control-center-forms.js';
import {controlSections} from '../control-center-catalog.js';
import {centerPage,centerRoute} from '../control-center-view.js';
import {createProjectApi} from '../lib/code-project-api.js';
import {runCode,normalizeCodeOutput,componentRows} from '../lib/code-command-sandbox.js';
import {discordCodePayload} from '../lib/code-commands.js';
import {CenterStore} from '../lib/control-center-store.js';
import {dhikrConfig,dhikrDelay} from '../lib/control-center-dhikr.js';
import {authorizeCenterOperation,validateCenterInput} from '../lib/control-center-engine.js';
const gid='111111111111111111',bid='222222222222222222',uid='333333333333333333',cid='444444444444444444',command={id:'11111111-1111-4111-8111-111111111111',owner_id:7,guild_id:gid,bot_user_id:bid,active_revision:2};
test('every section page fits Discord rows, field limits and unique native action IDs',()=>{
 const design=normalizeAdminPanel({supportUrl:'https://diskoko.com/usage.html'});
 for(const section of controlSections)for(let i=0;i<section.pages.length;i++){
  const output=normalizeCodeOutput(centerPage(design,{},section.id,i)),payload=discordCodePayload(output,command.id);
  assert.ok(payload.components.length<=5);assert.ok(payload.embeds[0].fields.length<=25);
  for(const row of payload.components){assert.ok(row.components.length<=5);if(row.components.some(c=>c.type===3))assert.equal(row.components.length,1);}
 }
});
test('browser bundle contains exact source modules rather than stale copies',()=>{const project=adminPanelProject({controlCenter:true});for(const name of ['control-center-catalog.js','control-center-forms.js','control-center-view.js','control-center-capabilities.js'])assert.equal(project.files[name],fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'));});
test('complete project executes inside QuickJS and modal opening needs no host RPC',async()=>{
 const project=adminPanelProject({controlCenter:true}),sdk=createProjectApi({project,preview:true}),ctx={user:{id:uid,name:'Admin'},guild:{id:gid,name:'Fixture'},event:{type:'command'},state:{}};
 const home=normalizeCodeOutput(await runCode(JSON.stringify(project),ctx,'center-preview',{bridge:sdk.call}));assert.match(home.message.embeds[0].description,/معاينة التصميم/);
 let calls=0;const form=await runCode(JSON.stringify(project),{...ctx,event:{type:'button',action:'op_ban'}},'center-form',{bridge:()=>{calls++;throw Error('offline');}});assert.equal(form.modal.action,'form_ban');assert.equal(calls,0);
 assert.equal(sdk.effects.length,0);
});
test('component rows reject mixed selects, excess buttons and impossible row indices',()=>{
 assert.throws(()=>componentRows([{type:'select',row:0},{type:'button',row:0}]));assert.throws(()=>componentRows(Array.from({length:6},()=>({type:'button',row:0}))));
 assert.throws(()=>normalizeCodeOutput({message:{content:'x',controls:[{type:'button',label:'x',action:'x',row:5}]}}));
});
test('custom server emoji becomes a native Discord emoji and pending controls are disabled',()=>{
 const output=normalizeCodeOutput(centerPage(normalizeAdminPanel({buttons:{avatar:{emoji:'<a:server:555555555555555555>'}}}),{},'general'));
 const payload=discordCodePayload(output,command.id),button=payload.components.flatMap(r=>r.components).find(c=>c.custom_id?.endsWith(':op_avatar'));assert.deepEqual(button.emoji,{id:'555555555555555555',name:'server',animated:true});
 const owner=discordCodePayload(normalizeCodeOutput(centerPage(normalizeAdminPanel(),{},'owner',1)),command.id);assert.ok(owner.components.flatMap(r=>r.components).find(c=>c.custom_id?.endsWith(':op_setavatar')).disabled);
});
test('review lookups and claims always include account, guild, bot and command',async()=>{
 const calls=[],store=new CenterStore({query:async(sql,p)=>{calls.push({sql,p});return {rows:[{id:command.id}]};}},command);
 await store.findReview(command.id,uid);await store.claimReview(command.id);
 for(const {sql,p} of calls){assert.match(sql,/owner_id=\$3/);assert.match(sql,/guild_id=\$4/);assert.match(sql,/bot_id=\$5/);assert.deepEqual(p.slice(1,5),store.scope);}
});
test('a claimed preview review cannot be executed twice',async()=>{const store=new CenterStore(null,command,{}),id=await store.review({id:'warn'},uid,'source');await store.claimReview(id);await assert.rejects(store.claimReview(id),/بالفعل/);});
test('another guild channel is rejected before a mutation',async()=>{
 const actor={id:uid,permissions:new PermissionsBitField(F.Administrator),roles:{cache:{some:()=>false}}},bot={permissions:new PermissionsBitField(F.Administrator)};
 const guild={id:gid,ownerId:uid,members:{fetchMe:async()=>bot},channels:{fetch:async()=>({guildId:'999999999999999999'})}};
 await assert.rejects(authorizeCenterOperation({current:{actor,guild},command,interaction:{channelId:cid},store:{settings:async()=>({})},operation:{id:'lock',data:{channel:cid}}}),/القناة/);
});
test('dhikr accepts reviewed intervals and rejects mass mentions and unknown content types',()=>{
 const config=dhikrConfig({channel:cid,types:'tasbih,salat',interval:'random3-8'});for(let i=0;i<20;i++){const delay=dhikrDelay(config);assert.ok(delay>=180000 && delay<=480000);}
 for(const data of [{types:'untrusted'},{mention:'@everyone'},{interval:'0'}])assert.throws(()=>dhikrConfig({channel:cid,types:'salat',interval:'5',...data}));
});
test('untrusted inherited operation names and invalid input never become executable operations',()=>{
 for(const action of ['__proto__','constructor','toString'])assert.throws(()=>validateCenterInput(action,{}));
 assert.throws(()=>validateCenterInput('timeout',{user:uid,minutes:'50000'}));
 const output=centerRoute({state:{},event:{text:true,action:'op_ban'}},normalizeAdminPanel());assert.equal(output.output.modal,undefined);assert.equal(output.output.message.controls[0].action,'op_ban');
});

test('every control-center form respects native Discord modal limits',()=>{
 for(const [name,fields] of Object.entries(controlForms)){
  if(!fields.length)continue;
  const result=normalizeCodeOutput({modal:{title:name,action:'form_test',fields}});
  assert.equal(result.modal.fields.length,fields.length);
 }
});
test('already published dhikr and protection forms remain usable without rewriting customer projects',async()=>{
 const project=adminPanelProject({controlCenter:true});
 project.files['control-center-forms.js']=project.files['control-center-forms.js']
  .replace("f('types','أنواع الأذكار (مفصولة بفاصلة)',true,false,'tasbih,tahmid,takbir,istighfar,salat,hawqala,ayat,dua')","f('types','الأنواع: tasbih,tahmid,takbir,istighfar,salat,hawqala,ayat,dua')")
  .replace("f('interval','الفترة بالدقائق أو عشوائية',true,false,'1/5/10/30/60 أو random3-8/random5-15/random10-30')","f('interval','دقائق ثابتة: 1/5/10/30/60 أو random3-8/5-15/10-30')");
 const raw=await runCode(JSON.stringify(project),{event:{type:'button',action:'dhikr_config'},state:{}},'legacy-dhikr');
 const result=normalizeCodeOutput(raw);
 assert.equal(result.modal.action,'dhikr_save');
 assert.deepEqual(result.modal.fields.map(f=>f.id),['channel','types','interval','mention']);
 assert.match(result.modal.fields[1].placeholder,/tasbih/);
 assert.match(result.modal.fields[2].placeholder,/random5-15/);
 for(const action of ['form_aprot','form_dprot'])assert.equal(normalizeCodeOutput({modal:{title:'حماية',action,fields:[{id:'kind',label:'نوع الحماية: spam/link/bots/create/delete/join'}]}}).modal.fields[0].label,'نوع الحماية');
 assert.throws(()=>normalizeCodeOutput({modal:{title:'Custom',action:'custom',fields:[{id:'value',label:'x'.repeat(46)}]}}),/45/);
});
