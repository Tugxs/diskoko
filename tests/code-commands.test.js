import test from 'node:test';
import assert from 'node:assert/strict';
import {mountCodeCommands,handleCodeInteraction} from '../lib/code-commands.js';

const guild={id:'111111111111111111',name:'Guild'},bot={id:'222222222222222222',token:'not-shared'},id='11111111-1111-4111-8111-111111111111';
function fixture({owner='7',authorized=true,row,remote=[]}={}) {
  const routes=new Map(),queries=[],calls=[];
  const app=Object.fromEntries(['get','post','patch','delete'].map(method=>[method,(path,...handlers)=>routes.set(`${method} ${path}`,handlers.at(-1))]));
  let command=row,source=row?.source || 'function handle(){return {message:{content:"OK"}}}';
  const pool={query:async(sql,p=[])=>{
    queries.push({sql,p});
    if(sql.includes('SELECT owner_id FROM customer_bot_registry'))return {rows:[{owner_id:owner}]};
    if(sql.includes('SELECT c.*,v.source'))return {rows:command && command.owner_id===p[0] && command.guild_id===p[1] && command.bot_user_id===p[2]?[command]:[]};
    if(sql.startsWith('SELECT * FROM code_commands WHERE id='))return {rows:command && command.id===p[0] && command.owner_id===p[1] && command.guild_id===p[2] && command.bot_user_id===p[3]?[command]:[]};
    if(sql.startsWith('SELECT source'))return {rows:[{source}]};
    if(sql.startsWith('SELECT COUNT'))return {rows:[{total:0}]};
    if(sql.startsWith('INSERT INTO code_commands'))command={id:p[0],owner_id:p[1],guild_id:p[2],bot_user_id:p[3],name:p[4],description:p[5],ephemeral:p[6],revision:1,active_revision:null,enabled:false,source};
    if(sql.startsWith('INSERT INTO code_command_versions')){source=p[2];command.source=source;}
    if(sql.includes('SET revision=revision+1'))command.revision++;
    if(sql.includes('SET enabled=TRUE')){command.enabled=true;command.active_revision=p[1];}
    return {rows:[]};
  },connect:async()=>({...pool,release(){}})};
  mountCodeCommands(app,{pool,requireUser(){},requireWriteAccess(){},authorizedGuild:async()=>authorized?guild:null,connectedBot:async()=>bot,discord:async(token,path,options={})=>{calls.push({token,path,options});return {ok:true,data:options.method==='POST'?{id:'remote-id'}:path.includes('/commands')?remote:{id:guild.id}};},ensurePublicPanelBotRegistry:async()=>{},audit:async()=>{}});
  async function request(method,suffix='',body={}){let result,error,status=200;const req={params:{botId:bot.id,id},user:{id:'7',plan:'starter'},query:{guildId:guild.id},body:{guildId:guild.id,...body}};const res={status(value){status=value;return this;},json(value){result=value;}};await routes.get(`${method} /api/ai/bots/:botId/code-commands${suffix}`)(req,res,e=>{error=e;});return {result,error,status};}
  return {request,queries,calls,get command(){return command;}};
}
test('unauthorized guild and another account cannot read or test code',async()=>{
  for(const options of [{authorized:false},{owner:'other'}]){const f=fixture(options);const r=await f.request('get');assert.equal(r.error.status,403);assert.ok(!f.queries.some(q=>q.sql.includes('JOIN code_command_versions')));}
});
test('saving a draft creates scoped private versions without touching Discord commands',async()=>{
  const f=fixture(),r=await f.request('post','',{name:'hello',description:'Hello',source:'function handle(){return {message:{content:"Hi"}}}'});
  assert.equal(r.status,201);assert.equal(f.command.owner_id,'7');assert.equal(f.command.bot_user_id,bot.id);assert.equal(f.command.guild_id,guild.id);assert.equal(f.command.enabled,false);assert.ok(!f.calls.some(c=>c.options.method==='POST'));
});
test('preview is real isolated execution without registration',async()=>{
  const f=fixture();const r=await f.request('post','/test',{source:'function handle(c){return {message:{content:c.guild.name+" "+typeof process}}}'});
  assert.equal(r.result.output.message.content,'Guild undefined');assert.equal(r.result.discordChanged,false);assert.ok(!f.calls.some(c=>c.options.method==='POST'));
});
test('activation requires confirmation and a current owned version, and never overwrites remote names',async()=>{
  const row={id,owner_id:'7',guild_id:guild.id,bot_user_id:bot.id,name:'hello',description:'Hello',revision:2};
  let f=fixture({row:{...row}});assert.equal((await f.request('patch','/:id',{action:'activate',revision:1,confirmed:true})).error.status,409);
  assert.match((await f.request('patch','/:id',{action:'activate',revision:2})).error.message,/أكد/);
  f=fixture({row:{...row},remote:[{name:'hello',id:'someone-else'}]});assert.equal((await f.request('patch','/:id',{action:'activate',revision:2,confirmed:true})).error.status,409);assert.ok(!f.calls.some(c=>c.options.method==='POST'));
  f=fixture({row:{...row}});assert.equal((await f.request('patch','/:id',{action:'activate',revision:2,confirmed:true})).error,undefined);assert.equal(f.command.active_revision,2);assert.equal(f.command.enabled,true);
});
test('an id from another account cannot be edited even with a valid bot',async()=>{
  const f=fixture({row:{id,owner_id:'8',guild_id:guild.id,bot_user_id:bot.id,revision:1}});const r=await f.request('patch','/:id',{action:'save',revision:1,source:'function handle(){}'});assert.equal(r.error.status,404);assert.ok(!f.queries.some(q=>q.sql.startsWith('INSERT INTO code_command_versions')));
});
test('component lookup binds bot guild user and does not execute foreign or expired sessions',async()=>{
  const queries=[],replies=[];const pool={query:async(sql,p)=>{queries.push({sql,p});return {rows:[]};}};
  const i={customId:`diskoko-code:${id}:open`,guildId:guild.id,user:{id:'other-user'},isChatInputCommand:()=>false,isModalSubmit:()=>false,isStringSelectMenu:()=>false,reply:async p=>replies.push(p)};
  assert.equal(await handleCodeInteraction(i,pool,bot.id),true);assert.deepEqual(queries[0].p,[id,guild.id,bot.id,'other-user']);assert.match(replies[0].content,/تخص مستخدمًا آخر/);assert.equal(queries.length,1);
});
test('a saved newer draft does not invalidate controls for the still-active version',async()=>{
  const queries=[],modals=[],row={id,owner_id:'7',guild_id:guild.id,bot_user_id:bot.id,name:'hello',revision:2,active_revision:1,session_revision:1,enabled:true,actions:[{type:'button',action:'open'}]};
  const pool={query:async(sql,p)=>{queries.push({sql,p});if(sql.includes('JOIN code_commands'))return {rows:[row]};if(sql.includes('FOR SHARE'))return {rows:[{enabled:true,active_revision:1}]};if(sql.includes('AS locked'))return {rows:[{locked:true}]};if(sql.startsWith('SELECT source'))return {rows:[{source:'function handle(ctx){return {modal:{title:"Form",action:"submit",fields:[{id:"value",label:"Value"}]}}}'}]};return {rows:[]};},connect:async()=>({...pool,release(){}})};
  const i={customId:`diskoko-code:${id}:open`,guildId:guild.id,guild,user:{id:'u',username:'User'},isChatInputCommand:()=>false,isModalSubmit:()=>false,isStringSelectMenu:()=>false,showModal:async p=>modals.push(p),reply:async()=>assert.fail('Expected a modal')};
  assert.equal(await handleCodeInteraction(i,pool,bot.id),true);assert.equal(modals[0].title,'Form');assert.match(modals[0].custom_id,/^diskoko-code:[0-9a-f-]{36}:submit$/);assert.deepEqual(queries.find(q=>q.sql.startsWith('SELECT source')).p,[id,1]);assert.ok(queries.some(q=>q.sql==='COMMIT'));
});
