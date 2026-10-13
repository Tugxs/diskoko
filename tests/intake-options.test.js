import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {intakeOptions,intakeChoices} from '../lib/intake-options.js';
import {READY_MODULE_TYPES} from '../lib/ready-template-module-types.js';
import {handleReadyModuleInteraction} from '../lib/ready-template-modules.js';
import {handleInteractiveButton} from '../lib/interactive-systems.js';
import {mountIntakeControls} from '../ai-editor-prototype.js';
const id='11111111-1111-4111-8111-111111111111';
const choices=[{id:'billing',name:'الفواتير'},{id:'technical',name:'مساعدة تقنية'}];
const config={choiceEnabled:true,choices,choicePrompt:'أي قسم تحتاج؟',detailsEnabled:true,formTitle:'أخبرنا بطلبك',formFields:[{id:'need',label:'ما الذي تحتاجه؟',style:2,required:true,maxLength:1000}]};
const input=(kind,extra={})=>({customId:`diskoko:${kind}:${id}`,guildId:'guild',channelId:'channel',message:{id:kind==='module'||kind==='ticket'?'message':'private',author:{id:'bot'}},client:{user:{id:'bot'}},user:{id:'member'},isButton:()=>!kind.includes('product')&&!kind.includes('submit'),isStringSelectMenu:()=>kind.endsWith('product'),isModalSubmit:()=>kind.endsWith('submit'),reply:async()=>{},...extra});
test('independent toggles require owner-authored labels and preserve legacy catalogs',()=>{
 assert.deepEqual(intakeOptions({choiceEnabled:false,detailsEnabled:false,choicePrompt:'',formTitle:''}).detailsEnabled,false);
 assert.throws(()=>intakeOptions({choiceEnabled:true,choices}),/عنوان/);
 assert.throws(()=>intakeOptions({...config,formFields:[{id:'need',label:''}]}),/field/);
 assert.deepEqual(intakeChoices({kind:'orders',products:choices}),choices.map(c=>({...c,description:''})));
 assert.deepEqual(intakeChoices({kind:'orders',products:choices,choiceEnabled:false}),[]);
});
for(const [kind,type]of Object.entries(READY_MODULE_TYPES).filter(([,type])=>type.form))test(`${kind}: optional choices and owner-written modal use the real intake handler`,async()=>{
 const panel={id,guild_id:'guild',channel_id:'channel',message_id:'message',publishing_bot_id:'bot',staff_role_id:'staff',config:{kind,title:'Panel',...config}};
 const pool={query:async()=>({rows:[panel]})};let menu,modal;
 const member={roles:{cache:{has:()=>true}}};
 await handleReadyModuleInteraction(input('module',{member,reply:async value=>menu=value}),pool);
 assert.equal(menu.components[0].components[0].options.length,2);assert.match(menu.content,/أي قسم/);
 await handleReadyModuleInteraction(input('module-product',{member,values:['billing'],showModal:async value=>modal=value}),pool);
 assert.equal(modal.title,config.formTitle);assert.equal(modal.components[0].components[0].label,config.formFields[0].label);
});
test('selection-only request is stored and reviewed without a modal or fabricated answers',async()=>{
 let saved,review;const panel={id,guild_id:'guild',channel_id:'channel',message_id:'message',publishing_bot_id:'bot',review_channel_id:'review',config:{kind:'reports',title:'Reports',color:'#123456',...config,detailsEnabled:false}};
 const query=async(sql,args)=>{if(sql.startsWith('SELECT * FROM ready_template_module_panels'))return{rows:[panel]};if(sql.startsWith('INSERT INTO ready_template_module_entries'))saved=args;return{rows:[],rowCount:0};};
 const interaction=input('module-product',{values:['technical'],deferReply:async()=>{},editReply:async()=>{},showModal:async()=>assert.fail('No modal'),client:{user:{id:'bot'},channels:{fetch:async()=>({guildId:'guild',isTextBased:()=>true,send:async value=>{review=value;return{id:'review-message'};}})}}});
 await handleReadyModuleInteraction(interaction,{query,connect:async()=>({query,release(){}})});
 assert.equal(saved[3],'مساعدة تقنية');assert.equal(JSON.parse(saved[5]).length,1);assert.equal(review.embeds[0].fields[0].value,'مساعدة تقنية');
});
test('support choices open a separately enabled custom form and stale forms are rejected',async()=>{
 const panel={id,guild_id:'guild',channel_id:'channel',message_id:'message',publishing_bot_id:'bot',intake_config:config};const pool={query:async()=>({rows:[panel]})};let menu,modal;
 await handleInteractiveButton(input('ticket',{reply:async value=>menu=value}),pool);assert.match(menu.components[0].components[0].custom_id,/ticket-product/);
 await handleInteractiveButton(input('ticket-product',{values:['technical'],showModal:async value=>modal=value}),pool);assert.equal(modal.title,config.formTitle);
 panel.intake_config={...config,detailsEnabled:false};let refused;
 await handleInteractiveButton(input('ticket-submit',{reply:async value=>refused=value}),pool);assert.match(refused.content,/متوقف/);
});
test('shared editor starts both steps off with empty owner labels and restores configured steps',()=>{
 const dom=new JSDOM('<main></main>');globalThis.document=dom.window.document;const root=document.querySelector('main');
 mountIntakeControls(root,{},false);assert.equal(root.editorIntakeSnapshot().choiceEnabled,false);assert.equal(root.editorIntakeSnapshot().detailsEnabled,false);assert.equal(root.editorIntakeSnapshot().formTitle,'');
 root.editorIntakeRestore(config);assert.equal(root.editorIntakeSnapshot().formFields[0].label,config.formFields[0].label);assert.equal(root.editorIntakeSnapshot().choices.length,2);
 root.querySelector('#intakeDetailsEnabled').checked=false;assert.equal(root.editorIntakeSnapshot().formFields,undefined);dom.window.close();delete globalThis.document;
});
test('support form submission opens one private ticket and delivers only configured answers',async()=>{
 const panel={id,guild_id:'guild',channel_id:'channel',message_id:'message',publishing_bot_id:'bot',staff_role_id:'staff',intake_config:config};let created=0,received=[],stored=false;
 const query=async sql=>{if(sql.startsWith('SELECT * FROM diskoko_ticket_panels'))return{rows:[panel]};if(sql.startsWith('UPDATE diskoko_ticket_panels SET publishing_bot_id'))return{rows:[{id}],rowCount:1};if(sql.startsWith('INSERT INTO diskoko_tickets'))stored=true;return{rows:[],rowCount:0};};
 const interaction=input('ticket-submit',{customId:`diskoko:ticket-submit:${id}:technical`,fields:{getTextInputValue:()=> 'تعطل الاتصال'},deferReply:async()=>{},editReply:async()=>{},guild:{channels:{create:async options=>{created++;assert.ok(options.permissionOverwrites.some(item=>item.id==='guild' && item.deny.length));return{id:'private-ticket',send:async value=>received.push(value)};}}}});
 await handleInteractiveButton(interaction,{query,connect:async()=>({query,release(){}})});
 assert.equal(created,1);assert.equal(stored,true);assert.equal(received[0].embeds[0].fields[0].value,'مساعدة تقنية');assert.equal(received[0].embeds[0].fields[1].name,'ما الذي تحتاجه؟');assert.equal(received[0].embeds[0].fields[1].value,'تعطل الاتصال');
});
test('disabled choice menus cannot create a request through stale selections',async()=>{
 const panel={id,guild_id:'guild',channel_id:'channel',message_id:'message',publishing_bot_id:'bot',config:{kind:'orders',title:'Orders',...config,choiceEnabled:false,detailsEnabled:false}};let reply;
 await handleReadyModuleInteraction(input('module-product',{values:['technical'],reply:async value=>reply=value}),{query:async()=>({rows:[panel]})});assert.match(reply.content,/متوقفة/);
});


