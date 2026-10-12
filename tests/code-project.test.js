import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCodeProject,exampleProject} from '../lib/code-project.js';
import {runCode,normalizeCodeOutput} from '../lib/code-command-sandbox.js';
import {createProjectApi,publicIpv4,projectHttp} from '../lib/code-project-api.js';
import {sealProjectSecret,openProjectSecret} from '../lib/code-project-secrets.js';
import {runProjectJob} from '../lib/code-project-scheduler.js';

const context={user:{id:'111111111111111111',name:'User'},guild:{id:'222222222222222222',name:'Guild'},event:{type:'command'},state:{}};
const project=files=>JSON.stringify({format:'diskoko-project@1',entry:'index.js',files,permissions:[],origins:[]});
test('multi-file ES modules, JSON imports and async handlers execute in fresh Wasm contexts',async()=>{
  const source=project({'index.js':'import data from "./data.json";import {value} from "./lib/helper.js";export async function handle(){return {message:{content:data.title+await value()}}}', 'data.json':'{"title":"Test "}', 'lib/helper.js':'export async function value(){return 42}'});
  const output=await runCode(source,context,'modules');assert.equal(output.message.content,'Test 42');
  assert.equal((await runCode('async function handle(){return {message:{content:String(await Promise.resolve(7))}}}',context,'async')).message.content,'7');
});
test('shared preview storage spans users but stays inside the project snapshot',async()=>{
  const parsed=parseCodeProject(exampleProject),a=createProjectApi({project:parsed,preview:true});
  await runCode(exampleProject,{...context,event:{type:'button',action:'join'}},'a',{bridge:a.call});
  const b=createProjectApi({project:parsed,preview:true,snapshot:a.memory});
  const result=await runCode(exampleProject,{...context,user:{id:'333333333333333333'},event:{type:'button',action:'join'}},'b',{bridge:b.call});
  assert.equal(b.memory.participants.length,2);assert.equal(result.message.embeds[0].description,'Participants: 2');
  const c=createProjectApi({project:parsed,preview:true});assert.equal(await c.call('storage.get',{key:'participants'}),null);
});
test('projects cannot import host modules, traverse files or call ungranted capabilities',async()=>{
  assert.throws(()=>parseCodeProject(project({'../escape.js':'','index.js':''})),/relative/);
  await assert.rejects(runCode(project({'index.js':'import fs from "node:fs";export function handle(){return {message:{content:"bad"}}}'}),context,'import'),/External modules/);
  const sdk=createProjectApi({project:parseCodeProject(project({'index.js':''})),preview:true});
  await assert.rejects(sdk.call('storage.get',{key:'hello'}),/not declared/);
  const own=createProjectApi({project:parseCodeProject(exampleProject),preview:true});
  await assert.rejects(own.call('storage.set',{key:'__proto__',value:{}}),/safe characters/);
});
test('infinite asynchronous project jobs stop promptly and do not poison the next runtime',async()=>{
  const start=Date.now();
  await assert.rejects(runCode(project({'index.js':'export async function handle(){while(true)await Promise.resolve();}'}),context,'loop',{bridge:async()=>null}));
  assert.ok(Date.now()-start<4000);
  assert.equal((await runCode('function handle(){return {message:{content:"healthy"}}}',context,'healthy')).message.content,'healthy');
});
test('private and reserved addresses and undeclared HTTP origins are blocked',async()=>{
  for(const ip of ['127.0.0.1','10.0.0.1','172.31.0.1','192.168.0.1','169.254.169.254','100.64.0.1','0.0.0.0','224.0.0.1','203.0.113.1'])assert.equal(publicIpv4(ip),false);
  assert.equal(publicIpv4('8.8.8.8'),true);
  await assert.rejects(projectHttp('https://example.com',{},[]),/not explicitly approved/);
  await assert.rejects(projectHttp('https://127.0.0.1',{},['https://127.0.0.1']),/Private/);
});
test('Discord mutations require the invoking member and reject foreign channels before sending',async()=>{
  const p={permissions:['discord.send'],origins:[]},command={id:'own',guild_id:context.guild.id};
  const denied=createProjectApi({project:p,command,interaction:{memberPermissions:{has:()=>false}}});
  await assert.rejects(denied.call('discord.send',{channelId:'444444444444444444',message:{content:'Hi'}}),/lacks permission/);
  const foreign=createProjectApi({project:p,command,interaction:{memberPermissions:{has:()=>true},guild:{channels:{fetch:async()=>({guildId:'other'})}}}});
  await assert.rejects(foreign.call('discord.send',{channelId:'444444444444444444',message:{content:'Hi'}}),/outside/);
});
test('external effect ledger stops retries and suppresses arbitrary mention payloads',async()=>{
  let sent=0,claimed=false,payload;const calls=[];
  const pool={query:async(sql,p)=>{calls.push(p);if(sql.startsWith('INSERT')){if(claimed)return {rows:[]};claimed=true;return {rows:[{}]};}return {rows:[]};}};
  const target={id:'444444444444444444',guildId:context.guild.id,isTextBased:()=>true,permissionsFor:()=>({has:()=>true}),send:async()=>{}};
  const interaction={id:'event',user:context.user,memberPermissions:{has:()=>true},guild:{members:{fetch:async()=>({})},channels:{fetch:async()=>target}}};
  const args={channelId:'444444444444444444',message:{content:'@everyone',allowedMentions:{parse:['everyone']}}};
  await createProjectApi({project:{permissions:['discord.send']},command:{id:'own',guild_id:context.guild.id},pool,interaction,transport:{post:async(path,{body})=>{payload=body;sent++;return {id:'message'};}}}).call('discord.send',args);
  await assert.rejects(createProjectApi({project:{permissions:['discord.send']},command:{id:'own',guild_id:context.guild.id},pool,interaction,transport:{post:async(path,{body})=>{payload=body;sent++;return {id:'message'};}}}).call('discord.send',args),/already attempted/);
  assert.equal(sent,1);assert.deepEqual(payload.allowed_mentions,{parse:[]});assert.equal(payload.enforce_nonce,true);assert.equal(calls[0][0],'own');
});
test('project credentials are authenticated ciphertext and a different key cannot open them',()=>{
  const old=process.env.ENCRYPTION_KEY;try{process.env.ENCRYPTION_KEY='test-only';const sealed=sealProjectSecret('private-token');assert.ok(!sealed.includes('private-token'));assert.equal(openProjectSecret(sealed),'private-token');process.env.ENCRYPTION_KEY='another';assert.throws(()=>openProjectSecret(sealed));}finally{old===undefined?delete process.env.ENCRYPTION_KEY:process.env.ENCRYPTION_KEY=old;}
});
test('disabled scheduled projects never invoke Discord and finish with an explicit failure',async()=>{
  const queries=[],db={query:async(sql,p)=>{queries.push({sql,p});return {rows:sql.startsWith('SELECT *')?[{enabled:false}]:[]};},release(){}},pool={connect:async()=>db,query:db.query};
  await runProjectJob({user:{id:'bot'}},pool,{id:'job',command_id:'own',revision:1});assert.ok(queries.some(q=>q.sql.includes("status='failed'")));assert.ok(!queries.some(q=>q.sql.includes('code_project_effects')));
});
test('shared database storage keys always include the current project identity',async()=>{
  const values=new Map(),client={query:async(sql,p)=>{if(sql.startsWith('INSERT'))values.set(p[0]+':'+p[1],JSON.parse(p[2]));if(sql.startsWith('SELECT value'))return {rows:values.has(p[0]+':'+p[1])?[{value:values.get(p[0]+':'+p[1])}]:[]};return {rows:[]};}};
  const a=createProjectApi({project:{permissions:['storage']},client,command:{id:'a'}});
  const b=createProjectApi({project:{permissions:['storage']},client,command:{id:'b'}});
  await a.call('storage.set',{key:'shared',value:{count:1}});assert.deepEqual(await a.call('storage.get',{key:'shared'}),{count:1});assert.equal(await b.call('storage.get',{key:'shared'}),null);
});
test('scheduled results execute only the active project and send once with mentions suppressed',async()=>{
  let sent=0;const queries=[],source=project({'index.js':'export async function handle(ctx){return {message:{content:ctx.event.action}}}'});
  const p=JSON.parse(source);p.permissions=['schedule'];
  const db={query:async(sql,params)=>{queries.push({sql,params});if(sql.startsWith('SELECT *'))return {rows:[{id:'own',enabled:true,active_revision:1,bot_user_id:'bot',guild_id:context.guild.id,owner_id:'owner'}]};if(sql.includes('pg_try_advisory'))return {rows:[{locked:true}]};if(sql.startsWith('SELECT source'))return {rows:[{source:JSON.stringify(p)}]};if(sql.includes('INSERT INTO code_project_effects'))return {rows:[{}]};return {rows:[]};},release(){}};
  const target={id:'444444444444444444',guildId:context.guild.id,isTextBased:()=>true,permissionsFor:()=>({has:()=>true}),send:async value=>{sent++;assert.equal(value.content,'finish');assert.deepEqual(value.allowedMentions,{parse:[]});return {id:'message'};}};
  const guild={id:context.guild.id,name:'Guild',members:{fetch:async()=>({id:context.user.id,user:context.user,permissions:{has:()=>true}})},channels:{fetch:async()=>target}};
  const bot={user:{id:'bot'},guilds:{fetch:async()=>guild}};
  await runProjectJob(bot,{connect:async()=>db,query:db.query},{id:'job',command_id:'own',revision:1,user_id:context.user.id,channel_id:'444444444444444444',event:{type:'schedule',action:'finish'}},{post:async(path,{body})=>target.send({...body,allowedMentions:body.allowed_mentions})});
  assert.equal(sent,1);assert.ok(queries.some(q=>q.sql.includes("status='completed'")));
});
test('preview fixtures and slash options are typed and do not permit arbitrary Discord payload fields',()=>{
  const p=JSON.parse(project({'index.js':''}));p.options=[{name:'optional',description:'Optional',type:3},{name:'required',description:'Required',type:4,required:true,default_member_permissions:'8'}];
  const parsed=parseCodeProject(JSON.stringify(p));assert.equal(parsed.options[0].name,'required');assert.equal(parsed.options[0].default_member_permissions,undefined);
  p.options[0].type=99;assert.throws(()=>parseCodeProject(JSON.stringify(p)),/Invalid slash/);
});
test('racing projects cannot create the same guild channel twice',async()=>{
  let claimed=false,created=0;
  const pool={query:async sql=>{if(sql.includes('INSERT INTO code_project_channel_claims')){if(claimed)return {rows:[]};claimed=true;}return {rows:sql.startsWith('INSERT')?[{}]:[]};}};
  const guild={channels:{fetch:async()=>({find:()=>null}),create:async clean=>{created++;await new Promise(r=>setTimeout(r,15));return {id:'444444444444444444',name:clean.name};}}};
  const make=(id,event)=>createProjectApi({project:{permissions:['discord.channels']},command:{id,guild_id:context.guild.id},pool,interaction:{id:event,user:context.user,guild,memberPermissions:{has:()=>true}},transport:{post:async(path,{body})=>guild.channels.create(body)}});
  const results=await Promise.allSettled([make('one','event-one').call('discord.channels.create',{options:{name:'rules',type:0}}),make('two','event-two').call('discord.channels.create',{options:{name:'rules',type:0}})]);
  assert.equal(created,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
});
test('role assignment cannot elevate permissions beyond the actor even below their highest role',async()=>{
  const guild={id:context.guild.id,ownerId:'another',roles:{fetch:async()=>({id:'444444444444444444',guild:{id:context.guild.id},position:1,managed:false,permissions:{has:()=>false,bitfield:32n}})},members:{fetch:async()=>({roles:{highest:{position:10},add:async()=>assert.fail('must not grant')},permissions:{bitfield:0n}})}};
  const sdk=createProjectApi({project:{permissions:['discord.roles']},command:{id:'own',guild_id:context.guild.id},interaction:{guild,user:context.user,memberPermissions:{has:()=>true}}});
  await assert.rejects(sdk.call('discord.roles.add',{userId:context.user.id,roleId:'444444444444444444'}),/privileged/);
});
test('HTTP credentials cannot be reused on another approved origin',async()=>{
  const client={query:async(sql,p)=>{assert.equal(p[0],'own');return {rows:[{origin:'https://first.example.com',encrypted:'not-exposed'}]};}};
  const sdk=createProjectApi({project:{permissions:['http'],origins:['https://first.example.com','https://second.example.com']},command:{id:'own'},client});
  await assert.rejects(sdk.call('http',{url:'https://second.example.com/data',options:{credential:'service'}}),/another origin/);
});
test('rich embeds preserve supported code-defined fields while bounding text and image URLs',()=>{
  const output=normalizeCodeOutput({message:{embeds:[{fields:[{name:'Prize',value:'Nitro',inline:true}],author:{name:'Host'},footer:{text:'Good luck'},timestamp:'2026-10-12T00:00:00Z',image:{url:'https://example.com/image.png'}}]}});
  assert.equal(output.message.embeds[0].fields[0].value,'Nitro');assert.equal(output.message.embeds[0].image.url,'https://example.com/image.png');
  assert.throws(()=>normalizeCodeOutput({message:{embeds:[{description:'x'.repeat(4000),fields:[{name:'Prize',value:'x'.repeat(1024)},{name:'More',value:'x'.repeat(1024)}]}]}}),/6000/);
});
