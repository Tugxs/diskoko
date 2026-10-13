import test from 'node:test';
import assert from 'node:assert/strict';
import {PermissionFlagsBits as F} from 'discord.js';
import {effectiveChannelPermissions,readinessChecks} from '../lib/dashboard-permissions.js';
import {structureTemplatePlan,discordTemplateCode} from '../lib/structure-template.js';
import {resolveRoleReferences,operationBody,normalizeOperations,resolveExisting} from '../lib/workspace-domain.js';
import {runQuality,normalizeCases,verifySavedCases} from '../lib/command-quality.js';
const g='100000000000000001',r='100000000000000002';
test('effective permissions combine role overwrites then member overrides and visibility',()=>{
 const roles=[{id:g,permissions:String(F.ViewChannel|F.SendMessages)},{id:r,permissions:'0'}];
 const channel={permission_overwrites:[{id:g,type:0,deny:String(F.SendMessages),allow:'0'},{id:r,type:0,allow:String(F.SendMessages),deny:'0'},{id:'member',type:1,deny:String(F.ViewChannel),allow:'0'}]};
 assert.equal(effectiveChannelPermissions(g,roles,channel,[r]).permissions.SendMessages,true);
 assert.equal(effectiveChannelPermissions(g,roles,channel,[]).permissions.SendMessages,false);
 assert.equal(effectiveChannelPermissions(g,roles,channel,[r],'member').permissions.SendMessages,false);
 assert.equal(effectiveChannelPermissions(g,[{id:g,permissions:String(F.Administrator)}],channel).permissions.ViewChannel,true);
 assert.ok(readinessChecks(g,{roles,botRoles:[],channels:[]}).find(c=>c.key==='music').missing.length);
});
test('official template URLs cannot turn into arbitrary fetches or invite copying',()=>{
 assert.equal(discordTemplateCode('https://discord.new/abc-123'),'abc-123');
 for(const url of ['http://discord.new/abc','https://evil.test/template/abc','https://discord.com/invite/abc','https://discord.new/abc?url=evil','https://discord.new:444/abc'])assert.throws(()=>discordTemplateCode(url));
});
const source={roles:[{id:'0',name:'@everyone',permissions:'0'},{id:'1',name:'Staff',permissions:'0'}],channels:[{id:'2',type:4,name:'Support',position:0,permission_overwrites:[{id:'1',type:0,allow:String(F.ViewChannel),deny:'0'}]},{id:'3',name:'tickets',type:0,parent_id:'2',permission_overwrites:[{id:'1',type:0,allow:String(F.ViewChannel),deny:'0'}]}]};
const target={guildId:g,roles:[{id:g,name:'@everyone',permissions:'0'}],channels:[]};
test('import keeps category hierarchy and binds ACL to newly created target roles',()=>{
 const plan=structureTemplatePlan({serialized_source_guild:source},target);assert.deepEqual(plan.issues,[]);
 const map=new Map([[plan.operations[0].operation_key,r]]);
 for(const op of plan.operations.slice(1)){const resolved=resolveRoleReferences(op,map);assert.equal(resolved.permission_overwrites[0].id,r);assert.equal(operationBody(resolved).permission_overwrites[0].role_key,undefined);}
 assert.equal(plan.operations[2].parent_key,plan.operations[1].operation_key);
 assert.throws(()=>resolveRoleReferences(plan.operations[2],new Map()));
});
test('import blocks unsupported member copies and admin escalation instead of silently dropping them',()=>{
 const copy=structuredClone(source);copy.channels[1].permission_overwrites[0].type=1;
 assert.ok(structureTemplatePlan({serialized_source_guild:copy},target).issues.length);
 copy.roles[1].permissions='8';assert.ok(structureTemplatePlan({serialized_source_guild:copy},target).issues.some(i=>i.path.includes('permissions')));
 assert.throws(()=>structureTemplatePlan({format:'diskoko-structure-template',version:1,structure:{...source,guildId:'other'}},target,{restore:true}));
 assert.throws(()=>normalizeOperations([{resource_type:'category',name:'x',permission_overwrites:null}],target));
});
test('saved quality cases preserve flow state, reset explicitly and block failing activation',async()=>{
 const source='function handle(ctx){const n=(ctx.state.n || 0)+1; return {state:{n},message:{content:String(n)}};}';
 const cases=[{name:'first',event:{type:'command'},contains:'1'},{name:'next',event:{type:'button',action:'join'},contains:'2'},{name:'reset',event:{type:'command'},reset:true,contains:'1'}];
 const result=await runQuality(source,cases,{owner_id:1,guild_id:g,bot_user_id:r});assert.equal(result.ok,true);
 await assert.rejects(()=>verifySavedCases({query:async()=>({rows:[{cases:[{event:{type:'command'},contains:'missing'}]}]})},{id:'x',owner_id:1,guild_id:g,bot_user_id:r},source),e=>e.status===409);
 assert.throws(()=>normalizeCases(Array.from({length:13},()=>cases[0])));
 const unsafe=await runQuality('function handle(){return {message:{content:process.env.SECRET}};}',[cases[0]],{owner_id:1,guild_id:g,bot_user_id:r});assert.equal(unsafe.ok,false);
});

test('imported role names never reuse managed application roles',()=>{assert.equal(resolveExisting({resource_type:'role',name:'Bot',action:'create'},{guildId:g,roles:[{id:r,name:'Bot',managed:true}],channels:[]}),undefined);});
