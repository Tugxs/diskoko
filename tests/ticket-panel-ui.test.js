import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

test('uncertain support Cancel opens confirmation and sends the scoped action only after confirmation',async()=>{
  const source=fs.readFileSync(new URL('../workspace.js',import.meta.url),'utf8');
  const body=source.slice(source.indexOf('  const refreshTicketPanels=async()=>{'),source.indexOf('  const loadMessages = async () =>',source.indexOf('  const refreshTicketPanels=async()=>{')));
  const dom=new JSDOM('<main id="workspace"></main><div id="dialogContent"></div>');const $=selector=>dom.window.document.querySelector(selector);const calls=[];
  const api=async(path,options)=>{calls.push({path,options});return{panels:options?[]:[{id:'request',publication_state:'review_required',proposal:{interactive:{title:'Support'}},open_tickets:0}]};};
  const modal=(title,content,footer)=>{$('#dialogContent').innerHTML=content+footer;};
  const refresh=new Function('$','api','active','guild','esc','fmt','modal','run','closeDialog','loadMessages','toast','modalError','sessionStorage','storageKey','thread',body+';return refreshTicketPanels;')($,api,()=>true,'guild',String,String,modal,fn=>fn,()=>{$('#dialogContent').innerHTML='';},async()=>{},()=>{},error=>{throw error;},{setItem(){}},'key',{});
  await refresh();assert.equal(calls.filter(call=>call.options).length,0);
  $('[data-ticket-action="cancel"]').click();assert.ok($('#ticketActionConfirmed'));assert.equal($('#ticketActionApply').disabled,true);
  $('#ticketActionConfirmed').checked=true;$('#ticketActionConfirmed').dispatchEvent(new dom.window.Event('change'));
  assert.equal($('#ticketActionApply').disabled,false);await $('#ticketActionApply').onclick();
  const sent=calls.find(call=>call.options);assert.equal(sent.path,'/api/ai/requests/request/ticket-panel-action');assert.deepEqual(JSON.parse(sent.options.body),{action:'cancel',confirmed:true});
  dom.window.close();
});
