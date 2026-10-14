import test from 'node:test';
import assert from 'node:assert/strict';
import {PermissionFlagsBits as F,PermissionsBitField} from 'discord.js';
import {adminPanelProject,normalizeAdminPanel} from '../admin-panel-template.js';
import {parseCodeProject} from '../lib/code-project.js';
import {runCode,normalizeCodeOutput} from '../lib/code-command-sandbox.js';
import {createProjectApi} from '../lib/code-project-api.js';
import {adminAuthority,createAdminApi,enforceAdminTeam} from '../lib/admin-panel-api.js';
import {validateReplySession,handleAdminReply,mountAdminAiWorker} from '../lib/admin-reply.js';

const guildId='111111111111111111',botId='222222222222222222',userId='333333333333333333',channelId='444444444444444444';
const context={user:{id:userId,name:'Admin'},guild:{id:guildId,name:'Guild'},event:{type:'command'},state:{}};
test('full editable admin project previews navigation, native forms and reviewed mutation without external effects',async()=>{
 const source=JSON.stringify(adminPanelProject({replyMinutes:'permanent',logoUrl:'https://example.com/logo.gif',channelId}));
 const project=parseCodeProject(source);let snapshot={},state={};
 const execute=async event=>{const sdk=createProjectApi({project,preview:true,snapshot});const output=normalizeCodeOutput(await runCode(source,{...context,event,state},'admin-test',{bridge:sdk.call}));state=output.state || state;snapshot=sdk.memory;assert.equal(sdk.effects.length,0);return output;};
 let output=await execute({type:'command'});assert.equal(output.message.embeds[0].fields[0].value,'128');assert.equal(output.message.embeds[0].author.icon_url,'https://example.com/logo.gif');
 output=await execute({type:'select',action:'page',values:['channels']});assert.equal(output.message.embeds[0].title,'قنوات السيرفر');
 output=await execute({type:'button',action:'add_channel'});assert.equal(output.modal.action,'review_channel');
 output=await execute({type:'modal',action:'review_channel',fields:{name:'welcome',topic:'hello'}});assert.ok(state.reviewId);assert.match(output.message.embeds[0].title,/راجع/);
 output=await execute({type:'button',action:'confirm'});assert.match(output.message.embeds[0].description,/محاكاة فقط: welcome/);assert.equal(state.reviewId,undefined);
 output=await execute({type:'button',action:'reply_on'});assert.match(output.message.embeds[0].description,/باستمرار/);
 output=await execute({type:'button',action:'reply_off'});assert.match(output.message.embeds[0].title,/أوقفت/);
});
test('native admin forms do not wait for RPC before opening, but their submission still checks authority',async()=>{
 const source=JSON.stringify(adminPanelProject());let calls=0;
 const modal=await runCode(source,{...context,event:{type:'button',action:'add_role'}},'admin-modal',{bridge:async()=>{calls++;throw Error('unavailable');}});
 assert.equal(modal.modal.action,'review_role');assert.equal(calls,0);
 const output=await runCode(source,{...context,event:{type:'modal',action:'review_role',fields:{name:'Admin',color:'#ffffff'}}},'admin-denied',{bridge:async()=>({manager:false})});
 assert.match(output.message.content,/صلاحية إدارة/);
});
test('admin appearance accepts a permanent mode and rejects invalid channels, colors and insecure assets',()=>{
 assert.equal(normalizeAdminPanel({replyMinutes:'permanent'}).replyMinutes,'permanent');
 for(const config of [{color:'red'},{channelId:'other'},{replyMinutes:90},{logoUrl:'http://example.com/a'},{bannerUrl:'https://user:secret@example.com/a'}])assert.throws(()=>normalizeAdminPanel(config));
});
function fixture(){
 const actor={id:userId,permissions:new PermissionsBitField([F.ManageGuild,F.ManageChannels,F.ManageRoles]),roles:{highest:{position:9}}};
 const bot={id:botId,permissions:new PermissionsBitField([F.ManageChannels,F.ManageRoles]),roles:{highest:{position:8}}};
 const channel={id:channelId,guildId,isTextBased:()=>true,send:async()=>({id:'sent'}),permissionsFor:who=>new PermissionsBitField(typeof who==='string'?[]:[F.ViewChannel,F.SendMessages,F.ReadMessageHistory,F.EmbedLinks,F.ManageChannels])};
 const guild={id:guildId,ownerId:'555555555555555555',client:{user:{id:botId}},members:{fetch:async()=>actor,fetchMe:async()=>bot},channels:{fetch:async()=>channel},roles:{fetch:async()=>null}};
 guild.fetch=async()=>guild;
 const command={id:'11111111-1111-4111-8111-111111111111',owner_id:1,guild_id:guildId,bot_user_id:botId,enabled:true,active_revision:2,ephemeral:true};
 const interaction={id:'interaction',guild,channelId,user:{id:userId}};
 const pool={query:async()=>({rows:[command]})};const client={user:{id:botId},guilds:{fetch:async()=>guild}};
 return {actor,bot,channel,guild,command,interaction,pool,client};
}
test('authority is fetched freshly and never comes from command text or caller-supplied manager flags',async()=>{
 const f=fixture();assert.equal((await adminAuthority(f.interaction,f.command)).manager,true);f.actor.permissions=new PermissionsBitField();assert.equal((await adminAuthority(f.interaction,f.command)).manager,false);
 await assert.rejects(adminAuthority(f.interaction,{...f.command,bot_user_id:userId}),/البوت/);
});
test('admin SDK blocks missing grants, revoked authority and protected roles before REST mutations',async()=>{
 const f=fixture();let writes=0;const options={...f,project:{permissions:[]},client:{query:async()=>({rows:[]})},memory:{},rest:()=>({post:()=>writes++}),external:(_,fn)=>fn()};
 await assert.rejects(createAdminApi(options)('admin.overview',{}),/غير معلنة/);
 options.project={permissions:['admin']};f.actor.permissions=new PermissionsBitField();await assert.rejects(createAdminApi(options)('admin.review',{operation:{kind:'role',action:'create',name:'New',color:'#abcdef'}}),/إدارة السيرفر/);
 f.actor.permissions=new PermissionsBitField([F.ManageGuild,F.ManageRoles]);f.guild.roles.fetch=async()=>({id:channelId,guild:f.guild,position:10,managed:false});
 await assert.rejects(createAdminApi(options)('admin.review',{operation:{kind:'role',action:'update',id:channelId,name:'New',color:'#abcdef'}}),/الرتبة محمية/);assert.equal(writes,0);
});
test('reviewed admin changes obey the owner team policy independently of native Manage Server',async()=>{
 const f=fixture();const current=await adminAuthority(f.interaction,f.command);
 await assert.rejects(enforceAdminTeam({query:async()=>({rows:[{owner_discord_id:'owner',members:[{discordId:userId,tools:['commands']}]}]})},current),/لم يمنحك/);
 await enforceAdminTeam({query:async()=>({rows:[{owner_discord_id:'owner',members:[{discordId:userId,tools:['builder']}]}]})},current);
});
test('reply session rejects another bot, revision changes, expiration, permission revocation and public channels',async()=>{
 const f=fixture(),session={command_id:f.command.id,owner_id:1,guild_id:guildId,bot_id:botId,discord_user_id:userId,channel_id:channelId,revision:2,expires_at:new Date(Date.now()+60000)};
 assert.equal((await validateReplySession(f.client,f.pool,session)).channel.id,channelId);
 await assert.rejects(validateReplySession(f.client,f.pool,{...session,bot_id:userId}),/انتهى/);
 await assert.rejects(validateReplySession(f.client,f.pool,{...session,revision:1}),/تغير/);
 await assert.rejects(validateReplySession(f.client,f.pool,{...session,expires_at:new Date(0)}),/انتهى/);
 f.actor.permissions=new PermissionsBitField();await assert.rejects(validateReplySession(f.client,f.pool,session),/صلاحية/);
 f.actor.permissions=new PermissionsBitField([F.ManageGuild]);f.channel.permissionsFor=()=>new PermissionsBitField([F.ViewChannel,F.SendMessages,F.ReadMessageHistory]);await assert.rejects(validateReplySession(f.client,f.pool,session),/قناة خاصة/);
});
test('ambient messages and other users replies never enter the admin assistant queue',async()=>{
 let queries=0;const pool={query:async()=>{queries++;return {rows:[]};}};
 assert.equal(await handleAdminReply({guildId,author:{id:userId,bot:false}},pool),false);assert.equal(queries,0);
 assert.equal(await handleAdminReply({guildId,author:{id:userId,bot:false},client:{user:{id:botId}},channelId,reference:{messageId:'different'}},pool),false);assert.equal(queries,1);
});
test('worker completions require the current lease and strip all Discord mentions',async()=>{
 const routes={};const app={get:(path,...handlers)=>routes[path]=handlers.at(-1),post:(path,...handlers)=>routes[path]=handlers.at(-1)};let values;
 mountAdminAiWorker(app,{worker:()=>{},pool:{query:async(_,args)=>{values=args;return {rows:[{id:'ok'}]};}}});
 let status;const res={status:n=>{status=n;return res;},json:()=>{}};
 await routes['/api/ai/worker/admin-complete/:id']({params:{id:'invalid'},body:{}},res,error=>{throw error;});assert.equal(status,400);
 await routes['/api/ai/worker/admin-complete/:id']({params:{id:'11111111-1111-4111-8111-111111111111'},body:{claim_token:'lease',answer:'@everyone <@333333333333333333> done'}},res,error=>{throw error;});assert.equal(status,200);assert.equal(values[3],'[mention] [mention] done');
});

test('persistent panel publishes once, and a public channel is refused before any send',async()=>{
 const f=fixture();let record=null,writes=0;
 const pool={query:async(sql,args)=>{
  if(sql.includes('workspace_team'))return {rows:[]};
  if(sql.startsWith('INSERT INTO admin_panel_messages')){if(record)return {rows:[]};record={status:'sending'};return {rows:[{command_id:f.command.id}]};}
  if(sql.startsWith('UPDATE admin_panel_messages')){record={status:'published',message_id:args[2],revision:f.command.active_revision};return {rows:[]};}
  if(sql.startsWith('SELECT * FROM admin_panel_messages'))return {rows:[record]};throw Error('Unexpected SQL');
 }};
 const api=createAdminApi({project:{permissions:['admin']},client:pool,pool,command:f.command,interaction:f.interaction,memory:{},rest:()=>({post:async()=>{writes++;return {id:'persistent-message'};}}),external:(_,fn)=>fn()});
 assert.equal((await api('admin.publish',{channelId,design:{title:'Admin'}})).messageId,'persistent-message');
 assert.equal((await api('admin.publish',{channelId,design:{title:'Admin'}})).messageId,'persistent-message');assert.equal(writes,1);
 f.channel.permissionsFor=()=>new PermissionsBitField([F.ViewChannel,F.SendMessages,F.EmbedLinks]);await assert.rejects(api('admin.publish',{channelId,design:{}}),/قناة خاصة/);assert.equal(writes,1);
});

test('an uncertain Discord mutation is recorded and cannot execute the same review twice',async()=>{
 const f=fixture();let writes=0;const review={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',status:'pending',expires_at:new Date(Date.now()+60000),interaction_id:'prior',operation:{kind:'role',action:'create',name:'New',color:123},fingerprint:null};
 f.interaction.isButton=()=>true;f.interaction.customId='diskoko-code:session:confirm';f.guild.roles.fetch=async()=>new Map();
 const db={query:async(sql)=>{
  if(sql.includes('workspace_team'))return {rows:[]};
  if(sql.startsWith('SELECT * FROM admin_panel_reviews'))return {rows:[review]};
  if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};
  if(sql.includes("status='running'")){review.status='running';return {rows:[{id:review.id}]};}
  if(sql.includes("status='review_required'")){review.status='review_required';return {rows:[]};}
  if(sql.includes('pg_advisory_unlock'))return {rows:[]};throw Error('Unexpected SQL: '+sql);
 },release:()=>{}};
 const pool={query:db.query,connect:async()=>db};
 const api=createAdminApi({project:{permissions:['admin']},client:pool,pool,command:f.command,interaction:f.interaction,memory:{},rest:()=>({post:async()=>{writes++;throw Error('unknown network outcome');}}),external:(_,fn)=>fn()});
 await assert.rejects(api('admin.apply',{reviewId:review.id}),/unknown network/);assert.equal(review.status,'review_required');
 await assert.rejects(api('admin.apply',{reviewId:review.id}),/لا تكرر/);assert.equal(writes,1);
});

test('review and apply cannot be chained in a single interaction without a later confirmation',async()=>{
 const f=fixture(),review={status:'pending',expires_at:new Date(Date.now()+60000),interaction_id:f.interaction.id,operation:{kind:'role',action:'create',name:'New',color:123}};
 f.interaction.isButton=()=>true;f.interaction.customId='diskoko-code:session:confirm';let writes=0;
 const api=createAdminApi({project:{permissions:['admin']},client:{query:async()=>({rows:[review]})},pool:f.pool,command:f.command,interaction:f.interaction,memory:{},rest:()=>({post:()=>writes++}),external:(_,fn)=>fn()});
 await assert.rejects(api('admin.apply',{reviewId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}),/أكد التغيير/);assert.equal(writes,0);
});
