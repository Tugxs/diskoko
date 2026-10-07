import test from 'node:test';
import assert from 'node:assert/strict';
import { panelDesign, validatePanelDesign, applyPanelDesign, missingReferenceVision, mergePanelEdits, applyReferencePreferences } from '../lib/ai-welcome-design.js';
import { normalizeAiProposal } from '../lib/local-ai.js';
import { mountInteractiveSystems, sendWelcomeCard } from '../lib/interactive-systems.js';
import { publicationOptions, editPublicationOptions } from '../lib/discord-publication.js';
import { alignAiProposalWithIntent, unsupportedAutomationRequest } from '../lib/ai-intent.js';

test('quoted customer title and replacement text override model additions literally',()=>{
  const result=applyReferencePreferences({kind:'welcome',title:'Model title',description:'Model text with old paragraphs',avatarPosition:'right',color:'#666666'},{prompt:'عدّل العنوان إلى «مرحبًا {name} في {server}»، واجعل النص «أهلًا {member}، أنت العضو رقم {memberCount}». احتفظ باللون.',previous_proposal:{kind:'welcome'}});
  assert.equal(result.title,'مرحبًا {name} في {server}');assert.equal(result.description,'أهلًا {member}، أنت العضو رقم {memberCount}');assert.equal(result.color,'#666666');
});

test('model welcome aliases normalize and render actual member, guild and count',async()=>{
  const plan=normalizeAiProposal({interactive:{kind:'welcome',title:'Hello {username}',description:'{servername} / {membercount}'}}).interactive;
  assert.equal(plan.title,'Hello {name}');assert.equal(plan.description,'{server} / {memberCount}');
  let sent;const member={id:'user',displayName:'Real member',user:{bot:false},guild:{id:'guild',name:'Real guild',memberCount:18,channels:{fetch:async()=>({isTextBased:()=>true,send:async payload=>{sent=payload;}})}},displayAvatarURL:()=> 'https://cdn.discordapp.com/avatars/user/avatar.png'};
  await sendWelcomeCard(member,{query:async()=>({rows:[{channel_id:'channel',title:'Hello {username}',description:'{servername} / {membercount}',color:123}]})});
  assert.equal(sent.embeds[0].title,'Hello Real member');assert.equal(sent.embeds[0].description,'Real guild / 18');
});

test('customer image placement overrides model guesses and visual accent is not a background',()=>{
  const draft=applyReferencePreferences({kind:'welcome',avatarPosition:'left',color:'#222222'},{prompt:'الصورة يمين النص',image_analysis:'{"accentColor":"#6666ff"}'});
  assert.equal(draft.avatarPosition,'right');assert.equal(draft.color,'#6666ff');
  assert.equal(applyReferencePreferences(draft,{prompt:'لون #229944',previous_proposal:draft,image_analysis:'{"accentColor":"#6666ff"}'}).color,'#229944');
});

test('supported panel kinds preserve bounded design and discard arbitrary code', () => {
  const examples = [
    { kind: 'tickets', title: 'الدعم', description: 'كيف نساعدك؟', channel: 'support' },
    { kind: 'poll', question: 'موعدنا؟', options: ['اليوم', 'غدًا'], channel: 'polls' },
    { kind: 'event', title: 'فعالية', description: 'غدًا', channel: 'events' },
    { kind: 'rules', title: 'قوانين', rules: ['احترام الآخرين'], channel: 'rules' },
    { kind: 'giveaway', prize: 'كتاب', durationMinutes: 60, winnerCount: 1, channel: 'gifts' },
  ];
  for (const example of examples) {
    const result = normalizeAiProposal({ interactive: { ...example, referenceOnly: true, color: '#2255aa', imagePosition: 'below', buttonLabel: 'افتح طلبك', buttonStyle: 3, code: 'process.exit()', links: [{ label: 'الموقع', url: 'https://example.com/' }] } });
    assert.equal(result.interactive.kind, example.kind);
    assert.equal(result.interactive.referenceOnly, true);
    assert.equal(result.interactive.color, '#2255aa');
    assert.equal(result.interactive.code, undefined);
  }
});
test('approved links reject scripts, credentials, local destinations and incomplete entries', () => {
  for (const url of ['javascript:alert(1)', 'http://example.com', 'https://127.0.0.1', 'https://user:secret@example.com', 'https://192.168.1.1', 'https://[::1]']) {
    assert.equal(panelDesign({ links: [{ label: 'زيارة', url }] }).links.length, 0);
    assert.ok(validatePanelDesign({ links: [{ label: 'زيارة', url }] }));
  }
  assert.ok(validatePanelDesign({ buttonStyle: '#ff00ff' }));
  assert.ok(validatePanelDesign({ links: [{ label: '', url: 'https://example.com/' }] }));
});
test('appearance never changes the ticket function or lets a model choose an arbitrary action', () => {
  const payload = { components: [{ type: 1, components: [{ type: 2, style: 1, custom_id: 'diskoko:ticket:approved-id', label: 'فتح' }] }], allowed_mentions: { parse: [] } };
  const result = applyPanelDesign(payload, { buttonLabel: 'اطلب المساعدة', buttonStyle: 2, custom_id: 'evil', links: [{ label: 'زيارة', url: 'https://example.com/' }] });
  assert.equal(result.components[0].components[0].custom_id, 'diskoko:ticket:approved-id');
  assert.equal(result.components[0].components[0].label, 'اطلب المساعدة');
  assert.equal(result.components[1].components[0].style, 5);
  assert.equal(payload.components[0].components[0].label, 'فتح');
});
test('vision failure is explicit for every attached image regardless of prompt wording', () => {
  assert.equal(missingReferenceVision({ has_attachment: true, prompt: 'وش رأيك؟' }), true);
});
test('switching from a support draft to an explicitly requested poll keeps the new function', () => {
  const source={executeNow:true,interactive:{kind:'poll',question:'موعد اللقاء؟',options:['اليوم','غدًا'],channel:'general'}};
  const result=alignAiProposalWithIntent(source,[{role:'user',content:'أريد لوحة دعم'},{role:'user',content:'بدلها أريد استطلاع رأي'}]);
  assert.equal(result.interactive.kind,'poll');
  assert.equal(unsupportedAutomationRequest([{role:'user',content:'أريد لوحة دعم باستخدام بوت خاص مرتبط بسيرفري'}]),false);
  assert.equal(unsupportedAutomationRequest([{role:'user',content:'أنشئ لي بوت خاص'}]),true);
});
test('a follow-up keeps the exact customer button label and leaves unrelated text intact', () => {
  const previous={kind:'tickets',title:'الدعم',description:'نساعدك هنا',color:'#2255aa',buttonLabel:'فتح',buttonStyle:3};
  const result=mergePanelEdits(previous,{kind:'tickets',title:'احتاج مساعدة',description:'نص غير مطلوب',color:'#ff0000',buttonLabel:'إرسال طلب',buttonStyle:2},'غيّر لون البطاقة إلى #229944 وسمّ زر التذكرة «احتاج مساعدة». احتفظ ببقية التفاصيل.');
  assert.equal(result.title,previous.title);assert.equal(result.description,previous.description);
  assert.equal(result.color,'#229944');assert.equal(result.buttonLabel,'احتاج مساعدة');assert.equal(result.buttonStyle,3);
});
test('uncertain publication blocks another launch before Discord lookup', async () => {
  for (const publication_state of ['review_required', 'publishing']) {
    let launch; let status; let response; let calls = 0;
    const client = { query: async sql => ({ rows: sql.startsWith('SELECT id,guild_id') ? [{ id: 'req', guild_id: 'guild', publication_state, proposal: { interactive: { kind: 'tickets' } } }] : [] }), release() {} };
    mountInteractiveSystems({ post(path, ...handlers) { launch = handlers.at(-1); } }, { pool: { connect: async () => client }, requireUser() {}, requireWriteAccess() {}, discordBotFetch: async () => { calls++; }, authorizedGuild: async () => true });
    await launch({ params: { id: 'req' }, user: { id: 'user' }, body: { confirmed: true } }, { status(code) { status = code; return this; }, json(value) { response = value; } }, error => { throw error; });
    assert.equal(status, 409); assert.match(response.error, /مراجعة/); assert.equal(calls, 0);
  }
});

test('Discord nonce is stable per request, bot and page for JSON and uploaded images', () => {
  const options={method:'POST',body:JSON.stringify({content:'اختبار'})};
  const one=JSON.parse(publicationOptions(options,'request','bot-a').body);
  assert.equal(one.nonce.length,25); assert.equal(one.enforce_nonce,true);
  assert.equal(one.nonce,JSON.parse(publicationOptions(options,'request','bot-a').body).nonce);
  assert.notEqual(one.nonce,JSON.parse(publicationOptions(options,'request','bot-b').body).nonce);
  assert.notEqual(one.nonce,JSON.parse(publicationOptions(options,'request','bot-a',1).body).nonce);
  const form=new FormData();form.set('payload_json',options.body);
  publicationOptions({method:'POST',body:form},'request','bot-a');
  assert.equal(JSON.parse(form.get('payload_json')).nonce,one.nonce);
});

test('editing preserves approved images and uses PATCH without author-nonce or mentions', () => {
  const result=editPublicationOptions({method:'POST',body:JSON.stringify({embeds:[{title:'عنوان جديد'}],nonce:'old',enforce_nonce:true})}, {embeds:[{image:{url:'https://cdn.discordapp.com/attachments/1/2/banner.png'}}],attachments:[{id:'file-id',filename:'banner.png'}]},'tickets','below');
  const body=JSON.parse(result.body);
  assert.equal(result.method,'PATCH');assert.equal(body.nonce,undefined);
  assert.equal(body.embeds[1].image.url,'https://cdn.discordapp.com/attachments/1/2/banner.png');
  assert.deepEqual(body.attachments,[{id:'file-id'}]);assert.deepEqual(body.allowed_mentions,{parse:[]});
});

test('a published support design edits the same message and keeps the real ticket ID', async () => {
  let launch;const mutations=[];const queries=[];let response;
  const channel='123456789012345678',role='123456789012345679',message='123456789012345680';
  const panelId='11111111-1111-4111-8111-111111111111';
  const item={id:'req',guild_id:'guild',interactive_message_id:message,interactive_channel_id:channel,interactive_kind:'tickets',publication_state:'completed',proposal:{interactive:{kind:'tickets',title:'دعم',description:'اطلب المساعدة',referenceOnly:true}}};
  const client={async query(sql,params){queries.push(sql);if(sql.startsWith('SELECT id,guild_id'))return{rows:[item]};if(sql.startsWith('SELECT * FROM diskoko_ticket_panels'))return{rows:[{id:panelId,request_id:'req',guild_id:'guild'}]};return{rows:[]};},release(){}};
  mountInteractiveSystems({post(path,...handlers){launch=handlers.at(-1);}}, {pool:{connect:async()=>client},requireUser(){},requireWriteAccess(){},authorizedGuild:async()=>true,requirePlanCapacity:async()=>{},discordBotFetch:async(path,options)=>{
    if(options){mutations.push({path,options});return{ok:true,data:{id:message}};}
    if(path.endsWith('/roles'))return{ok:true,data:[{id:role}]};
    if(path.endsWith('/messages/'+message))return{ok:true,data:{id:message,author:{id:'bot'},embeds:[],attachments:[]}};
    return{ok:true,data:[{id:channel,guild_id:'guild',type:0}]};
  }});
  await launch({params:{id:'req'},user:{id:'owner'},publishingBotId:'bot',body:{confirmed:true,editExisting:true,channelId:channel,staffRoleId:role,title:'دعم جديد',description:'افتح طلبك',buttonLabel:'احتاج مساعدة',buttonStyle:3,color:'#229944',links:[]}}, {json(value){response=value;return this;},status(){return this;}},error=>{throw error;});
  assert.equal(mutations.length,1);assert.equal(mutations[0].options.method,'PATCH');
  assert.equal(mutations[0].path,'/channels/'+channel+'/messages/'+message);
  const payload=JSON.parse(mutations[0].options.body);
  assert.equal(payload.components[0].components[0].custom_id,'diskoko:ticket:'+panelId);
  assert.equal(payload.components[0].components[0].label,'احتاج مساعدة');
  assert.equal(queries.some(sql=>sql.startsWith('INSERT INTO diskoko_ticket_panels')),false);
  assert.equal(response.messageId,message);
});

test('a successful external send followed by a database failure blocks the next attempt', async () => {
  let launch;let sends=0;let firstError;let response;let code;
  const channel='123456789012345678',role='123456789012345679';
  const item={id:'req',guild_id:'guild',proposal:{interactive:{kind:'tickets',title:'الدعم',description:'اطلب المساعدة',referenceOnly:true}}};
  const client={async query(sql){if(sql.startsWith('SELECT id,guild_id'))return{rows:[item]};if(sql.includes("publication_state='publishing'"))item.publication_state='publishing';if(sql.includes("publication_state='review_required'"))item.publication_state='review_required';if(sql.startsWith('INSERT INTO diskoko_ticket_panels'))throw Error('Database unavailable after send');return{rows:[]};},release(){}};
  mountInteractiveSystems({post(path,...handlers){launch=handlers.at(-1);}}, {pool:{connect:async()=>client},requireUser(){},requireWriteAccess(){},authorizedGuild:async()=>true,requirePlanCapacity:async()=>{},discordBotFetch:async(path,options)=>{if(options){sends++;return{ok:true,data:{id:'sent'}};}return{ok:true,data:path.endsWith('/roles')?[{id:role}]:[{id:channel,guild_id:'guild',type:0}]};}});
  const req={params:{id:'req'},user:{id:'owner'},body:{confirmed:true,channelId:channel,staffRoleId:role}};
  const res={status(value){code=value;return this;},json(value){response=value;return this;}};
  await launch(req,res,error=>{firstError=error;});
  assert.match(firstError.message,/Database/);assert.equal(item.publication_state,'review_required');
  await launch(req,res,error=>{throw error;});
  assert.equal(code,409);assert.equal(sends,1);assert.match(response.error,/مراجعة/);
});
