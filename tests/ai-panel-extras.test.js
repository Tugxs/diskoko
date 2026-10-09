import test from 'node:test';
import assert from 'node:assert/strict';
import { panelExtras } from '../lib/ai-panel-extras.js';
import { panelBody } from '../lib/standalone-modules-api.js';
test('panel extras accept bounded HTTPS link buttons and truthful image slots',()=>{
  assert.deepEqual(panelExtras({imagePlacement:'thumbnail',links:[{label:'Guide',url:'https://example.com/help'}]}),{imagePlacement:'thumbnail',links:[{label:'Guide',url:'https://example.com/help'}]});
  for(const url of ['javascript:alert(1)','http://example.com','https://user:secret@example.com'])assert.throws(()=>panelExtras({links:[{label:'Link',url}]}));
  assert.throws(()=>panelExtras({imagePlacement:'center'}));
  assert.throws(()=>panelExtras({links:Array(5).fill({label:'Link',url:'https://example.com'})}));
  assert.throws(()=>panelExtras({links:[{label:'',url:'https://example.com'}]}));
});
test('Discord payload retains real module action, uses link buttons and thumbnail attachments',()=>{
  const config={title:'Panel',description:'Details',color:'#123456',buttonStyle:1,buttonLabel:'Open',...panelExtras({imagePlacement:'thumbnail',links:[{label:'Guide',url:'https://example.com'}]})};
  const payload=JSON.parse(panelBody(config,'panel1'));
  assert.equal(payload.components[0].components[0].custom_id,'diskoko:module:panel1');
  assert.equal(payload.components[0].components[1].style,5);
  assert.equal(payload.components[0].components[1].custom_id,undefined);
  config.banner={mime:'image/png',base64:Buffer.from('test').toString('base64')};
  const form=panelBody(config,'panel1');
  const attached=JSON.parse(form.get('payload_json'));
  assert.equal(attached.embeds[0].thumbnail.url,'attachment://feature.png');
  assert.equal(attached.embeds[0].image,undefined);
});

test('optional customer footer reaches Discord and is never added by default',()=>{
  assert.equal(panelExtras({}).footer,undefined);
  assert.throws(()=>panelExtras({footer:'x'.repeat(301)}));
  const config={title:'Panel',description:'Details',color:'#123456',buttonStyle:1,buttonLabel:'Open',...panelExtras({footer:'Customer note'})};
  assert.deepEqual(JSON.parse(panelBody(config,'panel1')).embeds[0].footer,{text:'Customer note'});
});
