import test from 'node:test';
import assert from 'node:assert/strict';
import {orderProducts,productPicker} from '../lib/order-products.js';
import {moduleDraft} from '../lib/ai-module-draft.js';
import {handleReadyModuleInteraction} from '../lib/ready-template-modules.js';
const id='11111111-1111-4111-8111-111111111111';
const product=(n)=>({id:'p'+n,name:'Product '+n,description:'Choice '+n});
const interaction=(kind='module',extra={})=>({customId:`diskoko:${kind}:${id}`,guildId:'guild',channelId:'channel',message:{id:kind==='module'?'message':'private',author:{id:'bot'}},client:{user:{id:'bot'}},user:{id:'member'},isButton:()=>kind!=='module-product',isStringSelectMenu:()=>kind==='module-product',isModalSubmit:()=>false,...extra});
const panel=products=>({id,guild_id:'guild',channel_id:'channel',message_id:'message',publishing_bot_id:'bot',config:{kind:'orders',title:'Orders',description:'Order here',products}});
test('catalog bounds and stable IDs survive the editable module draft',()=>{
  assert.throws(()=>orderProducts(Array.from({length:101},(_,i)=>product(i))),/100/);
  assert.throws(()=>orderProducts([product(1),product(1)]),/منتج/);
  assert.throws(()=>orderProducts([{id:'bad:id',name:'Bad'}]),/منتج/);
  const catalog=orderProducts([product(1),product(2)]);assert.deepEqual(moduleDraft({kind:'module',moduleKind:'orders',products:catalog}).products,catalog);
});
test('one product opens its modal directly; multiple products open a private choice list',async()=>{
  for(const count of [1,2]){let modal,reply;const products=Array.from({length:count},(_,i)=>product(i));await handleReadyModuleInteraction(interaction('module',{showModal:async value=>{modal=value;},reply:async value=>{reply=value;}}),{query:async()=>({rows:[panel(products)]})});if(count===1){assert.ok(modal.custom_id.endsWith(':p0'));assert.equal(modal.title,'Product 0');assert.equal(reply,undefined);}else{assert.equal(modal,undefined);assert.equal(reply.ephemeral,true);assert.equal(reply.components[0].components[0].options.length,2);}}
});
test('100 products paginate within the official 25-option limit and preserve selections',async()=>{
  const products=Array.from({length:100},(_,i)=>product(i));for(let page=0;page<4;page++)assert.equal(productPicker(id,products,page).components[0].components[0].options.length,25);
  let modal;await handleReadyModuleInteraction(interaction('module-product',{values:['p99'],showModal:async value=>{modal=value;}}),{query:async()=>({rows:[panel(products)]})});assert.equal(modal.title,'Product 99');assert.ok(modal.custom_id.endsWith(':p99'));
  let updated;await handleReadyModuleInteraction(interaction('module-products-page',{customId:`diskoko:module-products-page:${id}:3`,update:async value=>{updated=value;}}),{query:async()=>({rows:[panel(products)]})});assert.equal(updated.components[0].components[0].options[0].value,'p75');
});
test('unknown product and cross-bot selections cannot open a form',async()=>{
  for(const wrongBot of [false,true]){let replied=false;await handleReadyModuleInteraction(interaction('module-product',{values:['missing'],client:{user:{id:wrongBot?'other':'bot'}},reply:async()=>{replied=true;},showModal:async()=>{throw Error('Must not open');}}),{query:async()=>({rows:[panel([product(1)])]})});assert.ok(replied);}
});
test('a disabled panel rejects product intake even from an old selector',async()=>{
  let reply;await handleReadyModuleInteraction(interaction('module-product',{values:['p1'],reply:async value=>{reply=value;}}),{query:async()=>({rows:[{...panel([product(1)]),disabled:true}]})});assert.match(reply.content,/متوقفة/);
});
test('submitted order stores the selected catalog product and includes it in the staff review',async()=>{
  let stored,review;const selectedPanel={...panel([product(1),product(2)]),review_channel_id:'review'};selectedPanel.config.color='#123456';
  const query=async(sql,args)=>{if(sql.startsWith('SELECT * FROM ready_template_module_panels'))return{rows:[selectedPanel]};if(sql.startsWith('INSERT INTO ready_template_module_entries'))stored=JSON.parse(args[5]);return{rows:[],rowCount:0};};
  const db={query,release(){}};
  const input=interaction('module-submit',{customId:`diskoko:module-submit:${id}:p2`,isButton:()=>false,isModalSubmit:()=>true,deferReply:async()=>{},editReply:async()=>{},fields:{getTextInputValue:name=>name==='subject'?'Quantity 2':'Deliver tomorrow'},client:{user:{id:'bot'},channels:{fetch:async()=>({guildId:'guild',isTextBased:()=>true,send:async value=>{review=value;return{id:'review-message'};}})}}});
  await handleReadyModuleInteraction(input,{query,connect:async()=>db});assert.equal(stored[0].value,'Product 2');assert.equal(review.embeds[0].fields[0].value,'Product 2');assert.ok(stored.some(answer=>answer.value==='Deliver tomorrow'));
});
