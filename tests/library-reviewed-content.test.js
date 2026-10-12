import test from 'node:test';
import assert from 'node:assert/strict';
import {aiPromptLibrary} from '../ai-library-catalog.js';
import {panelBody} from '../lib/standalone-modules-api.js';
import {mountInteractiveSystems,sendWelcomeCard} from '../lib/interactive-systems.js';
import {nativeEventPayload} from '../lib/native-events.js';
import {applyPanelDesign} from '../lib/ai-welcome-design.js';
import {libraryDraftProposal} from '../lib/ai-library-draft.js';

assert.equal(aiPromptLibrary.length,30);
for(const entry of aiPromptLibrary)test(`reviewed content stays unchanged: ${entry.title}`,async()=>{
  const title='CUSTOM TITLE عنواني',description='CUSTOM TEXT نصي فقط\nاضغط الزر الذي اخترته';
  const channel='123456789012345678',role='123456789012345679';
  if(entry.moduleKind){const payload=JSON.parse(panelBody({kind:entry.moduleKind,title,description,color:'#123456',buttonStyle:1,buttonLabel:'My action',links:[]},'panel'));assert.equal(payload.embeds[0].title,title);assert.equal(payload.embeds[0].description,description);assert.equal(payload.embeds[0].footer,undefined);return;}
  if(entry.kind==='scheduled_event'){const payload=nativeEventPayload({title,description,startTime:new Date(Date.now()+3600000).toISOString(),endTime:new Date(Date.now()+7200000).toISOString(),locationType:'elsewhere',location:'My venue'},[]);assert.equal(payload.name,title);assert.equal(payload.description,description);return;}
  if(entry.kind==='channel_control'){const draft=libraryDraftProposal({mode:'execute',category:entry.category,title:entry.title,prompt:entry.prompt});assert.equal(draft.message,null);assert.equal(draft.interactive.kind,'channel_control');return;}
  if(entry.kind==='message'){const payload=applyPanelDesign({content:description,allowed_mentions:{parse:[]}},{});assert.equal(payload.content,description);return;}
  if(entry.kind==='welcome'){const sends=[];await sendWelcomeCard({id:'member',displayName:'Member',user:{bot:false,username:'Member'},guild:{id:'guild',name:'Guild',channels:{fetch:async()=>({isTextBased:()=>true,send:async payload=>sends.push(payload)})}},displayAvatarURL:()=> 'https://cdn.discordapp.com/avatar.png'},{query:async()=>({rows:[{channel_id:channel,title,description,color:0x123456,avatar_position:'right'}]})});assert.equal(sends[0].embeds[0].title,title);assert.equal(sends[0].embeds[0].description,description);assert.equal(sends[0].embeds[0].footer,undefined);return;}
  let launch;const sends=[];const item={id:'request',guild_id:'guild',proposal:{interactive:{kind:entry.kind,title,description,referenceOnly:true}}};
  const db={query:async sql=>({rows:sql.startsWith('SELECT id,guild_id')?[item]:[]}),release(){}};
  mountInteractiveSystems({post(path,...handlers){if(path.endsWith('/launch-interactive'))launch=handlers.at(-1);}},{pool:{connect:async()=>db},requireUser(){},requireWriteAccess(){},authorizedGuild:async()=>true,requirePlanCapacity:async()=>{},discordBotFetch:async(path,options)=>{if(options){sends.push(JSON.parse(options.body));return{ok:true,data:{id:'message'}};}if(path.endsWith('/roles'))return{ok:true,data:[{id:role}]};const data={id:channel,guild_id:'guild',type:0};return{ok:true,data:path.endsWith('/channels')?[data]:data};}});
  const body={confirmed:true,channelId:channel,staffRoleId:role,title,description,question:title,options:['One','Two'],prize:'Prize',durationMinutes:10,winnerCount:1,style:'single',singleText:'CUSTOM RULE',signupEnabled:false};
  await launch({params:{id:'request'},user:{id:'owner'},body},{status(code){throw Error('Rejected '+code);},json(){}},error=>{throw error;});
  assert.equal(sends[0].embeds[0].title,title);
  const expected=entry.kind==='rules'?description+'\n\nCUSTOM RULE':description;
  if(entry.kind==='giveaway'){assert.ok(sends[0].embeds[0].description.startsWith(description+'\n\nالجائزة:'));}else assert.equal(sends[0].embeds[0].description,expected);
  assert.equal(sends[0].embeds[0].footer,undefined);
});
