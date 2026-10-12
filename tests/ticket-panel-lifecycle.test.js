import test from 'node:test';
import assert from 'node:assert/strict';
import {mountTicketPanelLifecycle,ticketPublicationNonce} from '../lib/ticket-panel-lifecycle.js';

const setup=({item,fetch,authorized=true})=>{
  let action;const queries=[];
  const db={query:async(sql,args)=>{queries.push({sql,args});return{rows:sql.startsWith('SELECT * FROM ai_requests')?[item]:[]};},release(){}};
  mountTicketPanelLifecycle({post(path,...handlers){action=handlers.at(-1);}},{pool:{connect:async()=>db},requireUser(){},requireWriteAccess(){},authorizedGuild:async()=>authorized,discordBotFetch:fetch});
  return{action,queries};
};
const request={params:{id:'request'},user:{id:'owner'},body:{action:'cancel',confirmed:true}};
test('uncertain support cancellation verifies nonce and bot, removes only its message, preserves tickets',async()=>{
  const calls=[];const item={id:'request',guild_id:'guild',design_bot_id:'public',created_at:'2026-10-10T00:00:00Z',publication_state:'review_required',publication_review:{kind:'tickets',channelId:'channel'}};
  const {action,queries}=setup({item,fetch:async(path,options)=>{calls.push({path,options});if(path==='/users/@me')return{ok:true,data:{id:'bot'}};if(path==='/channels/channel')return{ok:true,data:{guild_id:'guild'}};if(path.includes('?'))return{ok:true,data:[{id:'message',nonce:ticketPublicationNonce('request'),author:{id:'bot'},timestamp:'2026-10-10T01:00:00Z'},{id:'other',nonce:'other',author:{id:'bot'},timestamp:'2026-10-10T01:00:00Z'}]};return{ok:true};}});
  let result;await action(request,{json(value){result=value;}},error=>{throw error;});
  assert.equal(result.removedMessages,1);assert.equal(result.keptTickets,true);
  assert.equal(calls.filter(call=>call.options?.method==='DELETE').length,1);
  assert.ok(queries.some(query=>query.args?.[1]==='cancelled'));
  assert.ok(!queries.some(query=>/DELETE FROM/i.test(query.sql)));
});
test('cross bot cancellation cannot read or mutate Discord',async()=>{
  let calls=0,error;const {action}=setup({item:{id:'request',guild_id:'guild',design_bot_id:'private',publication_review:{kind:'tickets'}},fetch:async()=>{calls++;}});
  await action(request,{json(){}},value=>{error=value;});assert.equal(error.status,403);assert.equal(calls,0);
});
test('unreadable history leaves uncertain request blocked',async()=>{
  let error;const {action,queries}=setup({item:{id:'request',guild_id:'guild',created_at:'2026-10-10',publication_review:{kind:'tickets',channelId:'channel'}},fetch:async path=>path==='/users/@me'?{ok:true,data:{id:'bot'}}:path==='/channels/channel'?{ok:true,data:{guild_id:'guild'}}:{ok:false,status:403}});
  await action(request,{json(){}},value=>{error=value;});assert.ok(error);assert.ok(!queries.some(query=>query.args?.[1]==='cancelled'));
});
