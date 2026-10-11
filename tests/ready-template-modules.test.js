import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';
import { handleReadyModuleInteraction } from '../lib/ready-template-modules.js';

const id = '35d2665b-1d15-43cf-a746-24e713df6d86';
const panel = kind => ({ id, guild_id: 'guild', channel_id: 'channel', message_id: 'message', publishing_bot_id: 'bot', config: { kind, title: 'لوحة تجربة', description: 'وصف', buttonLabel: 'ابدأ', color: '#8d72e8', answer: 'إجابة واضحة', subjectLabel: 'موضوع الطلب', detailsLabel: 'تفاصيل الطلب' } });
const interaction = kind => {
  const state = { replies: [], modals: [] };
  return {
    state, customId: `diskoko:module:${id}`, guildId: 'guild', channelId: 'channel', message: { id: 'message' }, client: { user: { id: 'bot' } },
    isButton: () => true, isModalSubmit: () => false, user: { id: 'member' },
    reply: async value => state.replies.push(value), deferReply: async () => {}, editReply: async value => state.replies.push(value), showModal: async value => state.modals.push(value),
  };
};
const pool = row => ({ query: async () => ({ rows: row ? [row] : [] }) });

test('staff management uses bounded native selections and never accepts an unapproved delivery stage',async()=>{
  const action=interaction();action.customId=`diskoko:module-manage:${id}`;action.channelId='review';action.message.id='review-message';action.memberPermissions={has:()=>true};const entry={...panel('orders'),review_channel_id:'review',review_message_id:'review-message',status:'new',metadata:{}};
  await handleReadyModuleInteraction(action,pool(entry));assert.equal(action.state.modals[0].components.length,5);assert.equal(action.state.modals[0].components[1].component.type,3);
  action.customId=`diskoko:module-metadata:${id}`;action.isButton=()=>false;action.isModalSubmit=()=>true;action.fields={getTextInputValue:()=>'',getStringSelectValues:key=>key==='stage'?['delivered']:['normal']};const writes=[];const db={query:async(sql)=>{if(sql.startsWith('UPDATE'))writes.push(sql);return {rows:[entry],rowCount:1};}};await handleReadyModuleInteraction(action,db);assert.equal(writes.length,0);assert.match(action.state.replies.at(-1),/accepted order/);
});
test('resource search and public editing reject another review message or bot',async()=>{
  const action=interaction();action.customId=`diskoko:module-search:${id}`;action.client.user.id='wrong';await handleReadyModuleInteraction(action,pool(panel('resources')));assert.equal(action.state.modals.length,0);
  action.customId=`diskoko:module-public-edit:${id}`;action.client.user.id='bot';action.memberPermissions={has:()=>true};const entry={...panel('resources'),status:'approved',public_message_id:'public',review_channel_id:'review',review_message_id:'review-message'};await handleReadyModuleInteraction(action,pool(entry));assert.equal(action.state.modals.length,0);
});

test('delivery acceptance is owner-only and uses a guarded state transition',async()=>{
  const entry={...panel('orders'),user_id:'owner',status:'approved',metadata:{stage:'delivered'}};const queries=[];const db={query:async(sql,args)=>{queries.push([sql,args]);return sql.startsWith('SELECT')?{rows:[entry]}:{rowCount:1};}};
  const action=interaction();action.customId=`diskoko:module-accept-delivery:${id}`;await handleReadyModuleInteraction(action,db);assert.equal(queries.length,1);
  action.user.id='owner';await handleReadyModuleInteraction(action,db);assert.match(queries.at(-1)[0],/status='approved' AND metadata->>'stage'='delivered'/);
});

test('multi-question FAQ selects approved answers and rejects cross-bot interaction',async()=>{
  const configured=panel('faq');configured.config.questions=[{id:'0',question:'Question',answer:'Private answer'}];
  const opened=interaction();await handleReadyModuleInteraction(opened,pool(configured));
  assert.equal(opened.state.replies[0].components[0].components[0].options[0].label,'Question');
  const selected=interaction();selected.customId=`diskoko:module-faq:${id}`;selected.isButton=()=>false;selected.isStringSelectMenu=()=>true;selected.values=['0'];
  await handleReadyModuleInteraction(selected,pool(configured));assert.equal(selected.state.replies[0].content,'Private answer');
  selected.client.user.id='other';await handleReadyModuleInteraction(selected,pool(configured));assert.match(selected.state.replies[1],/unavailable/);
});

test('FAQ gives its configured private answer only for the published message and bot', async () => {
  const valid = interaction();
  assert.equal(await handleReadyModuleInteraction(valid, pool(panel('faq'))), true);
  assert.deepEqual(valid.state.replies, ['إجابة واضحة']);
  const stale = interaction(); stale.message.id = 'other';
  assert.equal(await handleReadyModuleInteraction(stale, pool(panel('faq'))), true);
  assert.match(stale.state.replies[0].content, /لم تعد متاحة/);
});

test('form feature opens the configured modal and staff task rejects ordinary members', async () => {
  const suggestion = interaction();
  await handleReadyModuleInteraction(suggestion, pool(panel('suggestions')));
  assert.equal(suggestion.state.modals[0].components[0].components[0].label, 'موضوع الطلب');
  assert.equal(suggestion.state.modals[0].components[1].components[0].label, 'تفاصيل الطلب');
  const task = interaction();
  await handleReadyModuleInteraction(task, pool({ ...panel('tasks'), staff_role_id: 'staff' }));
  assert.equal(task.state.modals.length, 0);
  assert.match(task.state.replies[0].content, /الإدارة/);
});

test('custom form hints and lengths reach the real Discord modal',async()=>{
  const suggestion=interaction();const configured=panel('suggestions');
  Object.assign(configured.config,{subjectPlaceholder:'Short idea',subjectMaxLength:60,detailsPlaceholder:'Explain why',detailsMaxLength:500});
  await handleReadyModuleInteraction(suggestion,pool(configured));
  const inputs=suggestion.state.modals[0].components.map(row=>row.components[0]);
  assert.equal(inputs[0].placeholder,'Short idea');assert.equal(inputs[0].max_length,60);
  assert.equal(inputs[1].placeholder,'Explain why');assert.equal(inputs[1].max_length,500);
});

test('accepted store request can be marked complete by staff without publishing customer details', async () => {
  const updates = [];
  const order = interaction();
  order.customId = `diskoko:module-review:${id}:completed`;
  order.channelId = 'review';
  order.message = { id: 'review-message', edit: async value => updates.push(value) };
  order.memberPermissions = { has: permission => permission === PermissionFlagsBits.ManageGuild };
  const entry = { id, panel_id: id, guild_id: 'guild', review_channel_id: 'review', review_message_id: 'review-message', publishing_bot_id: 'bot', status: 'approved', subject: 'منتج', details: 'التفاصيل', user_id: 'member', config: { kind: 'orders', title: 'الطلبات', color: '#8d72e8' } };
  const db = { query: async sql => sql.includes('UPDATE') ? { rowCount: 1, rows: [{ id }] } : { rows: [entry] } };
  await handleReadyModuleInteraction(order, db);
  assert.match(updates[0].embeds[0].description, /مكتمل/);
  assert.match(updates[0].components[0].components[0].custom_id,/module-manage/);
});

test('all seven new intake tools open real configured forms and reject another bot',async()=>{
  for(const kind of ['bug_reports','appeals','partnerships','feedback','commissions','mentoring','resources']){
    const valid=interaction();await handleReadyModuleInteraction(valid,pool(panel(kind)));
    assert.equal(valid.state.modals.length,1,kind);assert.equal(valid.state.modals[0].components.length,2);
    const wrong=interaction();wrong.client.user.id='other';await handleReadyModuleInteraction(wrong,pool(panel(kind)));assert.equal(wrong.state.modals.length,0,kind);
  }
});
test('new private workflows never publish approvals and only fulfillment tools allow completion',async()=>{
  for(const kind of ['bug_reports','appeals','partnerships','feedback','commissions','mentoring']){
    const updates=[],sqls=[];const action=interaction();action.customId=`diskoko:module-decision:${id}:approved`;action.isModalSubmit=()=>true;action.fields={getTextInputValue:()=>''};action.channelId='review';action.message={id:'review-message',edit:async value=>updates.push(value)};action.memberPermissions={has:()=>true};
    action.client.channels={fetch:async()=>{throw Error('Private approval must not publish');}};
    const entry={id,panel_id:id,guild_id:'guild',review_channel_id:'review',review_message_id:'review-message',publishing_bot_id:'bot',status:'new',subject:'Subject',details:'Private details',user_id:'member',config:{kind,title:'Review',color:'#5865f2'}};
    const db={query:async(sql,values)=>{sqls.push([sql,values]);return sql.includes('UPDATE')?{rowCount:1,rows:[{id}]}:{rows:[entry]};}};
    await handleReadyModuleInteraction(action,db);assert.equal(updates.length,1,kind);assert.equal(sqls.find(([sql])=>sql.includes('UPDATE'))[1][0],'approved');assert.equal(updates[0].components[0].components.length,['commissions','mentoring'].includes(kind)?3:2,kind);
  }
});
test('approved resources publish through existing staff review without a vote or automatic approval',async()=>{
  const published=[];const action=interaction();action.customId=`diskoko:module-decision:${id}:approved`;action.isModalSubmit=()=>true;action.fields={getTextInputValue:()=>''};action.channelId='review';action.message={id:'review-message',edit:async()=>{}};action.memberPermissions={has:()=>true};
  action.client.channels={fetch:async()=>({isTextBased:()=>true,guildId:'guild',send:async value=>{published.push(value);return{id:'resource-message'};}})};
  const entry={id,panel_id:id,guild_id:'guild',review_channel_id:'review',review_message_id:'review-message',publishing_bot_id:'bot',status:'new',subject:'Guide',details:'Resource description',user_id:'member',config:{kind:'resources',channelId:'channel',title:'Resources',color:'#5865f2'}};
  const db={query:async(sql)=>sql.includes('UPDATE')?{rowCount:1,rows:[{id}]}:{rows:[entry]}};await handleReadyModuleInteraction(action,db);assert.equal(published.length,1);assert.equal(published[0].components,undefined);assert.deepEqual(published[0].allowedMentions,{parse:[]});
});
test('configured cooldown and private receipt reach the actual intake handler',async()=>{
  const calls=[];const action=interaction();action.customId=`diskoko:module-submit:${id}`;action.isButton=()=>false;action.isModalSubmit=()=>true;action.fields={getTextInputValue:name=>name==='subject'?'Title':'Details'};action.client.channels={fetch:async()=>({isTextBased:()=>true,guildId:'guild',send:async()=>({id:'review-message'})})};const configured=panel('feedback');configured.review_channel_id='review';Object.assign(configured.config,{cooldownSeconds:120,receiptText:'Thank you for the feedback'});
  const db={query:async(sql,values)=>{calls.push([sql,values]);return sql.startsWith('SELECT *')?{rows:[configured]}:sql.startsWith('SELECT 1')?{rows:[],rowCount:0}:{rows:[],rowCount:1};}};await handleReadyModuleInteraction(action,db);assert.equal(calls.find(([sql])=>sql.startsWith('SELECT 1'))[1][2],120);assert.match(action.state.replies.at(-1).content,/Thank you for the feedback/);assert.match(action.state.replies.at(-1).content,/رقم المتابعة/);
});

test('custom forms open ordered optional Discord text inputs',async()=>{const row=panel('reports');row.config.formFields=[{id:'summary',label:'Summary',style:1,required:true,maxLength:80},{id:'extra',label:'Optional detail',style:2,required:false,maxLength:300}];const member=interaction();await handleReadyModuleInteraction(member,pool(row));assert.equal(member.state.modals[0].components[1].components[0].required,false);assert.equal(member.state.modals[0].components[0].components[0].custom_id,'summary');});
test('private request tracking rejects a different member and bot',async()=>{for(const mismatch of ['member','bot']){const member=interaction();member.customId=`diskoko:module-track:${id}`;const row={...panel('reports'),user_id:mismatch==='member'?'other':'member',status:'new',answers:[]};if(mismatch==='bot')row.publishing_bot_id='other';await handleReadyModuleInteraction(member,pool(row));assert.match(member.state.replies[0],/لا يخصك/);}});
test('review reason modal is inaccessible to ordinary members',async()=>{const member=interaction();member.customId=`diskoko:module-review:${id}:approved`;const row={...panel('reports'),review_channel_id:'channel',review_message_id:'message',staff_role_id:'staff'};await handleReadyModuleInteraction(member,pool(row));assert.equal(member.state.modals.length,0);});
