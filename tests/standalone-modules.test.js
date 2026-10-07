import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits as P } from 'discord.js';
import { mountStandaloneModules } from '../lib/standalone-modules-api.js';

const guildId = '123456789012345678';
const channelId = '223456789012345678';
const botId = '323456789012345678';
const routes = new Map();
const inserts = [];
const pool = {
  connect: async () => ({ query: async (sql, values) => { if (sql.includes('INSERT INTO standalone_module_installs')) inserts.push(values); return { rows: [], rowCount: 1 }; }, release() {} }),
  query: async () => ({ rows: [], rowCount: 0 }),
};
const discord = async path => {
  if (path.endsWith('/channels')) return { ok: true, data: [{ id: channelId, type: 0, name: 'general', permission_overwrites: [] }] };
  if (path.endsWith('/roles')) return { ok: true, data: [{ id: guildId, permissions: String(P.Administrator), position: 0 }] };
  if (path === '/users/@me') return { ok: true, data: { id: botId } };
  if (path.endsWith(`/members/${botId}`)) return { ok: true, data: { roles: [] } };
  return { ok: false };
};
mountStandaloneModules({ get() {}, post(path, ...handlers) { routes.set(path, handlers.at(-1)); } }, {
  pool, requireUser: () => {}, requireWriteAccess: () => {}, authorizedGuild: async () => ({ id: guildId }), discordBotFetch: discord,
  requirePlanCapacity: async () => ({ used: 0, limit: 100 }), audit: async () => {}, botStatus: () => ({ online: true }),
});
const request = body => ({ user: { id: 7 }, params: { guildId }, body });
const response = () => ({ status(code) { this.statusCode = code; return this; }, json(value) { this.value = value; return this; } });

test('standalone FAQ is reviewed without charging or publishing, with one usage unit reserved for successful install', async () => {
  const res = response();
  let error;
  await routes.get('/api/workspace/:guildId/standalone-modules/review')(request({ kind: 'faq', title: 'الأسئلة', description: 'اسألنا', buttonLabel: 'الجواب', channelId, answer: 'الإجابة', executor: 'diskoko' }), res, e => { error = e; });
  assert.equal(error, undefined);
  assert.equal(res.statusCode, 201);
  assert.equal(res.value.usageUnits, 1);
  assert.equal(res.value.config.answer, 'الإجابة');
  assert.equal(inserts.length, 1);
});

test('standalone feature rejects private staff tasks in a public channel before saving a draft', async () => {
  const before = inserts.length;
  const res = response();
  let error;
  await routes.get('/api/workspace/:guildId/standalone-modules/review')(request({ kind: 'tasks', title: 'مهام', description: 'فريقنا', channelId, reviewChannelId: channelId, staffRoleId: guildId, executor: 'diskoko' }), res, e => { error = e; });
  assert.match(error?.message || '', /قناة خاصة/);
  assert.equal(inserts.length, before);
});
test('a generated module review rejects a request belonging to another tenant before saving', async () => {
  const before=inserts.length;
  let error;
  await routes.get('/api/workspace/:guildId/standalone-modules/review')(request({kind:'faq',title:'FAQ',description:'Ask',buttonLabel:'Answer',answer:'Hello',channelId,executor:'diskoko',sourceRequestId:'22222222-2222-4222-8222-222222222222'}),response(),e=>{error=e;});
  assert.match(error?.message || '',/المسودة لا تخص/);
  assert.equal(inserts.length,before);
});
test('changing the executor bot after review stops publication before claiming the install',async()=>{
  const handlers=new Map();let claimed=false;
  mountStandaloneModules({get() {},post(path,...items){handlers.set(path,items.at(-1));}},{pool:{query:async sql=>{if(sql.startsWith('SELECT * FROM standalone_module_installs'))return{rows:[{id:'test',status:'draft',executor:'diskoko',config:{kind:'faq',title:'FAQ',description:'Ask',buttonLabel:'Answer',answer:'Hello',channelId,executorBotId:'different-bot'}}]};claimed=true;return{rows:[],rowCount:0};}},requireUser:()=>{},requireWriteAccess:()=>{},authorizedGuild:async()=>({id:guildId}),discordBotFetch:discord,requirePlanCapacity:async()=>({used:0,limit:100}),audit:async()=>{},botStatus:()=>({online:true})});
  let error;
  await handlers.get('/api/workspace/:guildId/standalone-modules/:id/apply')({...request({}),params:{guildId,id:'test'}},response(),e=>{error=e;});
  assert.match(error?.message || '',/تغيّر بوت التنفيذ/);assert.equal(claimed,false);
});
test('reviewed edits patch the existing Discord message and retain its functional component ID',async()=>{
  const handlers=new Map(),writes=[],calls=[];
  const config={kind:'faq',title:'Updated FAQ',description:'Updated copy',buttonLabel:'Read',answer:'New answer',color:'#112233',buttonStyle:3,channelId,executorBotId:botId};
  const db={query:async(sql,values)=>{
    writes.push(sql);
    if(sql.startsWith('SELECT * FROM standalone_module_installs'))return{rows:[{id:'edit',status:'draft',executor:'diskoko',config,edit_install_id:'original'}]};
    if(sql.startsWith('SELECT s.id'))return{rows:[{id:'original',panel_id:'original-panel',message_id:'existing-message',channel_id:channelId,publishing_bot_id:botId}]};
    return{rows:[],rowCount:1};
  }};
  mountStandaloneModules({get(){},post(path,...items){handlers.set(path,items.at(-1));}},{pool:db,requireUser:()=>{},requireWriteAccess:()=>{},authorizedGuild:async()=>({id:guildId}),discordBotFetch:async(path,options)=>{if(options?.method==='PATCH'){calls.push({path,body:JSON.parse(options.body)});return{ok:true,data:{id:'existing-message'}};}return discord(path);},requirePlanCapacity:async()=>({used:0,limit:100}),audit:async()=>{},botStatus:()=>({online:true})});
  const res=response();let error;
  await handlers.get('/api/workspace/:guildId/standalone-modules/:id/apply')({...request({}),params:{guildId,id:'edit'}},res,e=>{error=e;});
  assert.equal(error,undefined);assert.equal(res.value.editing,true);
  assert.equal(calls.length,1);assert.equal(calls[0].body.components[0].components[0].custom_id,'diskoko:module:original-panel');
  assert.equal(calls[0].body.embeds[0].title,'Updated FAQ');
  assert.ok(writes.every(sql=>!sql.startsWith('INSERT INTO ready_template_module_panels')));
});
