import test from 'node:test';
import assert from 'node:assert/strict';
import {aiPromptLibrary} from '../ai-library-catalog.js';
import {mountLibraryPanelLifecycle} from '../lib/library-panel-lifecycle.js';
import {mountTicketPanelLifecycle} from '../lib/ticket-panel-lifecycle.js';
const row=entry=>({id:entry.title,guild_id:'guild',user_id:'owner',created_at:'2026-01-01',publication_state:'completed',publishing_bot_id:'bot',interactive_kind:entry.moduleKind?'module':entry.kind,interactive_channel_id:'channel',interactive_message_id:'message',sent_message_id:entry.kind==='message'?'message':null,sent_channel_id:'channel',proposal:{interactive:{kind:entry.moduleKind?'module':entry.kind,moduleKind:entry.moduleKind,title:entry.title}},publication_review:{channelControl:{before:{permission_overwrites:[]},after:{permission_overwrites:[]}}},...(entry.moduleKind?{module_install_id:'install',module_bot_id:'bot',module_config:{kind:entry.moduleKind,title:entry.title},module_message_id:'message',module_channel_id:'channel',install_status:'succeeded'}:{})});
test('all 30 library card kinds are returned by the scoped published list; other bots are excluded',async()=>{
  let list,result;const rows=aiPromptLibrary.map(row);assert.equal(rows.length,30);
  mountLibraryPanelLifecycle({get(path,...handlers){list=handlers.at(-1);},post(){}},{pool:{query:async(sql,args)=>{assert.deepEqual(args,['owner','guild']);return{rows:sql.includes('FROM ai_requests')?[...rows,{...rows[0],module_bot_id:'other'}]:[]};}},requireUser(){},requireWriteAccess(){},authorizedGuild:async()=>true,discordBotFetch:async()=>({ok:true,data:{id:'bot'}})});
  await list({user:{id:'owner'},query:{guildId:'guild'}},{json(value){result=value;}},error=>{throw error;});assert.equal(result.panels.length,30);assert.ok(result.panels.every(item=>item.id && item.interactive_kind));
});
for(const entry of aiPromptLibrary)for(const actionName of ['disable','cancel'])test(`${entry.title}: ${actionName} preserves entries and uses verified messages`,async()=>{
  const item=row(entry),queries=[],writes=[];let action,result;
  const panel={id:'panel',request_id:item.id,guild_id:'guild',channel_id:'channel',message_id:'message',publishing_bot_id:'bot',standalone_install_id:'install',status:'active'};
  const db={query:async(sql,args)=>{queries.push({sql,args});return{rows:sql.startsWith('SELECT * FROM ai_requests')?[item]:sql.startsWith('SELECT * FROM diskoko_') || sql.startsWith('SELECT p.*')?[panel]:[]};},release(){}};
  const fetch=async(path,options)=>{if(options){writes.push({path,options});return{ok:true};}if(path==='/users/@me')return{ok:true,data:{id:'bot'}};if(path.includes('/scheduled-events/'))return{ok:true,data:{creator_id:'bot',status:1}};if(path.includes('/messages/'))return{ok:true,data:{author:{id:'bot'}}};return{ok:true,data:{guild_id:'guild',permission_overwrites:[]}};};
  const app={get(){},post(path,...handlers){action=handlers.at(-1);}};
  const options={pool:{connect:async()=>db,query:async(sql,args)=>db.query(sql,args)},requireUser(){},requireWriteAccess(){},authorizedGuild:async()=>true,discordBotFetch:fetch};
  if(entry.kind==='tickets')mountTicketPanelLifecycle(app,options);else mountLibraryPanelLifecycle(app,options);
  await action({params:{id:item.id},user:{id:'owner'},publishingBotId:'bot',body:{confirmed:true,action:actionName}},{json(value){result=value;}},error=>{throw error;});
  assert.equal(result.ok,true);assert.ok(!queries.some(query=>/DELETE FROM/i.test(query.sql)));assert.ok(queries.some(query=>query.sql.startsWith('UPDATE ai_requests')));
  if(!['welcome','channel_control'].includes(entry.kind))assert.ok(writes.length);
});
test('cross-bot action cannot mutate Discord or update a lifecycle state',async()=>{
  let action,error;const item={...row(aiPromptLibrary[0]),publishing_bot_id:'other'};const db={query:async(sql)=>({rows:sql.startsWith('SELECT * FROM ai_requests')?[item]:[]}),release(){}};
  mountLibraryPanelLifecycle({get(){},post(path,...handlers){action=handlers.at(-1);}},{pool:{connect:async()=>db},requireUser(){},requireWriteAccess(){},authorizedGuild:async()=>true,discordBotFetch:async(path,options)=>{assert.equal(options,undefined);return{ok:true,data:{id:'bot'}};}});
  await action({params:{id:'request'},user:{id:'owner'},body:{action:'cancel',confirmed:true}},{json(){}},value=>{error=value;});assert.equal(error.status,403);
});
