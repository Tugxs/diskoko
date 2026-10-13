import test from 'node:test';import assert from 'node:assert/strict';
import {mountPanelChecks,panelReferences} from '../lib/panel-checks.js';import {PermissionFlagsBits as F} from 'discord.js';
const guild='100000000000000001',bot='100000000000000002',sourceChannel='100000000000000003',privateChannel='100000000000000004',id='11111111-1111-4111-8111-111111111111',nonce='22222222-2222-4222-8222-222222222222';
function fixture({privateRoom=true,failure=false,otherBot=false}={}){
 const routes=new Map(),writes=[];let preview;
 const query=async(sql,v=[])=>{if(sql.includes('FROM ai_requests'))return {rows:[{guild_id:guild,channel_id:sourceChannel,message_id:'original',bot_id:otherBot?'other':bot,config:{staff_role_id:'100000000000000008'}}]};if(sql.startsWith('SELECT * FROM workspace_panel_previews'))return {rows:preview?[preview]:[]};if(sql.startsWith('INSERT INTO workspace_panel_previews'))preview={owner_id:1,guild_id:guild,channel_id:privateChannel,bot_id:bot,source_id:id,status:'publishing'};if(sql.includes("SET status='sent'")){preview.status='sent';preview.message_id=v[1];}if(sql.includes("SET status='review_required'"))preview.status='review_required';return {rows:[{count:0}]};};
 const pool={query,connect:async()=>({query,release(){}})};
 const discord=async(path,opt={})=>{if(opt.method==='POST'){writes.push(JSON.parse(opt.body));return {ok:!failure,data:{id:'preview'}};}if(path==='/users/@me')return {ok:true,data:{id:bot}};if(path.endsWith('/roles'))return {ok:true,data:[{id:guild,permissions:String(F.ViewChannel)},{id:'admin',permissions:String(F.Administrator),position:10}]};if(path.endsWith('/channels'))return {ok:true,data:[{id:sourceChannel,type:0},{id:privateChannel,type:0,permission_overwrites:privateRoom?[{id:guild,type:0,allow:'0',deny:String(F.ViewChannel)}]:[]}]};if(path.includes('/members/'))return {ok:true,data:{roles:['admin']}};return {ok:true,data:{author:{id:bot},content:'Hello @everyone',embeds:[{title:'Panel',type:'rich'}],components:[{type:1,components:[{type:2,style:1,label:'Join',custom_id:'join'}]}]}};};
 const app=Object.fromEntries(['get','post'].map(method=>[method,(path,...fns)=>routes.set(method+' '+path,fns.at(-1))]));mountPanelChecks(app,{pool,requireUser(){},requireWriteAccess(){},authorizedGuild:async()=>({id:guild}),discordBotFetch:discord,audit:async()=>{}});
 const request=async(method,suffix,body={})=>{let result,error;await routes.get(method+' /api/workspace/:guildId/tools/panels/:id/'+suffix)({params:{guildId:guild,id},user:{id:1},body},{json:r=>result=r},e=>error=e);return {result,error};};return {request,writes};
}
test('appearance preview requires a private channel, disables interaction and prevents duplicate publication',async()=>{
 const f=fixture();const body={channelId:privateChannel,nonce,confirmed:true};assert.ok((await f.request('post','preview',body)).result.ok);assert.ok((await f.request('post','preview',body)).result.alreadySent);assert.equal(f.writes.length,1);assert.equal(f.writes[0].components[0].components[0].disabled,true);assert.deepEqual(f.writes[0].allowed_mentions.parse,[]);assert.ok(f.writes[0].nonce.length<=25);
 const publicRoom=fixture({privateRoom:false});assert.ok((await publicRoom.request('post','preview',body)).error);assert.equal(publicRoom.writes.length,0);
});
test('unknown preview result cannot be resent and another bot cannot inspect the panel',async()=>{
 const f=fixture({failure:true}),body={channelId:privateChannel,nonce,confirmed:true};assert.ok((await f.request('post','preview',body)).error);assert.ok((await f.request('post','preview',body)).error);assert.equal(f.writes.length,1);
 const other=fixture({otherBot:true});assert.ok((await other.request('get','health')).error);assert.equal(other.writes.length,0);
 assert.deepEqual(panelReferences({channelId:sourceChannel,staff_role_id:bot,userId:guild}),{channels:[sourceChannel],roles:[bot]});
});
