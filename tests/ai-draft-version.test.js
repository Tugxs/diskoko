import test from 'node:test';
import assert from 'node:assert/strict';
import { draftVersion,checkDraftVersion,checkCurrentDraft } from '../lib/ai-draft-version.js';
import { mountLocalAi } from '../lib/local-ai.js';

test('one version includes content, function and design, independent of JSONB ordering',()=>{
  const source={draftProtocol:1,interactive:{kind:'tickets',title:'Help',designScene:{background:'#112233'}}};
  const version=draftVersion(source);
  assert.equal(version,draftVersion({interactive:{designScene:{background:'#112233'},title:'Help',kind:'tickets'}}));
  assert.doesNotThrow(()=>checkDraftVersion(source,version));
  for(const update of [{title:'Changed'},{kind:'poll'},{designScene:{background:'#445566'}}])assert.throws(()=>checkDraftVersion({...source,interactive:{...source.interactive,...update}},version),{status:409});
  assert.throws(()=>checkDraftVersion(source,undefined),{status:409});
  assert.doesNotThrow(()=>checkDraftVersion({interactive:{kind:'tickets'}},undefined));
});
test('message publication journals uncertain delivery and never loses its failure guard',async()=>{
  let handler,error;const writes=[];
  const item={id:'request',guild_id:'guild',prompt:'Send an announcement',proposal:{message:{channel:'test',content:'Hello'}}};
  const client={query:async(sql,args)=>{writes.push(sql);return {rows:sql.startsWith('SELECT id,guild_id,prompt')?[item]:[]};},release(){}};
  mountLocalAi({get(){},delete(){},post(path,...handlers){if(path.endsWith('/send-message'))handler=handlers.at(-1);}},{pool:{connect:async()=>client},requireUser(){},requireWriteAccess(){},authorizedGuild:async()=>true,requirePlanCapacity:async()=>{},discordBotFetch:async(url)=>url.endsWith('/channels')?{ok:true,data:[{id:'channel',type:0,name:'test'}]}:{ok:false,status:502}});
  await handler({params:{id:'request'},user:{id:'owner'},body:{confirmed:true,channelId:'channel',content:'Hello'}},{status(){return this;},json(){}},e=>{error=e;});
  assert.equal(error.status,502);
  assert.ok(writes.some(sql=>sql.includes("publication_state='publishing'")));
  assert.ok(writes.some(sql=>sql.includes("publication_state='review_required'")));
});
test('newer conversation requests block old publication before any Discord call',async()=>{
  const item={proposal:{draftProtocol:1,interactive:{kind:'tickets',title:'Help'}}};let calls=0;
  const db={query:async()=>{calls++;return {rows:[{id:'newer'}]};}};
  await assert.rejects(checkCurrentDraft(db,item,'old','owner',{draftVersion:draftVersion(item.proposal)}),{status:409});
  assert.equal(calls,1);
  await assert.doesNotReject(checkCurrentDraft(db,item,'old','owner',{draftVersion:draftVersion(item.proposal)},{editing:true}));
  assert.equal(calls,1);
});
