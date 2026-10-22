import test from 'node:test';

import assert from 'node:assert/strict';

import fs from 'node:fs';

import {JSDOM} from 'jsdom';

const source=fs.readFileSync(new URL('../code-command-editor.js',import.meta.url),'utf8').replace(/^export /gm,'');

const settle=()=>new Promise(resolve=>setTimeout(resolve,15));

test('changing bots requires explicit discard and never transfers unsaved source or calls the new bot early',async()=>{
 const {dom,q,requests}=editor();try{await settle();q('new').click();q('source').value='private customer source';q('source').dispatchEvent(new dom.window.Event('input',{bubbles:true}));const before=requests.length;q('bot').value='private';q('bot').dispatchEvent(new dom.window.Event('change'));assert.equal(q('bot').value,'public');assert.equal(q('source').value,'private customer source');assert.equal(requests.length,before);q('keep').click();assert.equal(q('leave-notice'),null);q('bot').value='private';q('bot').dispatchEvent(new dom.window.Event('change'));q('leave').click();await settle();assert.equal(q('bot').value,'private');assert.equal(q('editor').hidden,true);q('new').click();assert.notEqual(q('source').value,'private customer source');assert.ok(!requests.some(r=>r.options.method==='POST' || r.options.method==='PATCH'));}finally{dom.window.close();}
});

test('native multi-select preview preserves defaults and submits all choices only after confirmation',async()=>{
 const {dom,q,requests}=editor({testOutput:{message:{content:'الأذكار',embeds:[],controls:[{type:'select',action:'types',placeholder:'الأنواع',minValues:1,maxValues:2,options:[{label:'تسبيح',value:'a',default:true},{label:'تحميد',value:'b'},{label:'أدعية',value:'c'}]}]}}});
 await settle();q('new').click();q('name').value='dhikr';q('description').value='Dhikr';q('test').click();await settle();
 const box=dom.window.document.querySelector('.code-native-multiselect'),inputs=[...box.querySelectorAll('input')];assert.equal(inputs[0].checked,true);
 inputs.forEach(input=>input.checked=true);const before=requests.length;box.querySelector('button').click();await settle();assert.equal(requests.length,before);assert.match(q('status').textContent,/إلى 2/);
 inputs[0].checked=false;box.querySelector('button').click();await settle();const last=requests.filter(r=>r.url.endsWith('/test')).at(-1);assert.deepEqual(JSON.parse(last.options.body).event.values,['b','c']);dom.window.close();
});

function editor({failTest=false,slowTest=false,testOutput=null}={}){
  const dom=new JSDOM('<main id="workspace"></main>',{url:'https://diskoko.test',runScripts:'outside-only'}),w=dom.window,requests=[];let saved=[];

  w.structuredClone=structuredClone;w.eval(source);

  const api=async(url,options={})=>{requests.push({url,options});if(url.endsWith('/test')){if(failTest)throw new Error('Syntax error');if(slowTest)await new Promise(r=>setTimeout(r,50));return {output:testOutput || {message:{content:'Test OK',embeds:[],controls:[]}}};}if(options.method==='POST'){const body=JSON.parse(options.body);saved=[{...body,id:'draft',revision:1}];return {id:'draft',revision:1};}if(options.method==='PATCH'){const body=JSON.parse(options.body);if(body.action==='save'){saved[0].source=body.source;saved[0].revision++;}if(body.action==='activate')saved[0].enabled=true;return {revision:saved[0].revision};}if(url.includes('/history'))return {versions:[],runs:[]};return {commands:saved,example:'function handle(){return {message:{content:"Hi"}}}'};};
  w.mountCodeEditor({host:w.document.querySelector('main'),bots:[{id:'public',label:'Diskoko'},{id:'private',label:'My bot'}],guild:'guild',api,esc:value=>String(value).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]))});

  const q=s=>w.document.querySelector(`[data-code-${s}]`);return {dom,q,requests};

}

test('one activation click validates, saves and activates in order without a manual draft step',async()=>{
  const {dom,q,requests}=editor({slowTest:true});await settle();q('new').click();q('name').value='hello';q('description').value='Hello';q('confirm').checked=true;q('confirm').dispatchEvent(new dom.window.Event('change'));assert.equal(q('activate').disabled,false);
  q('activate').click();q('activate').click();assert.equal(q('activate').disabled,true);await new Promise(r=>setTimeout(r,100));
  const writes=requests.filter(r=>r.options.method);assert.deepEqual(writes.map(r=>r.options.method),['POST','POST','PATCH']);assert.ok(writes[0].url.endsWith('/test'));assert.equal(JSON.parse(writes[2].options.body).action,'activate');assert.equal(JSON.parse(writes[1].options.body).guildId,'guild');dom.window.close();
});

test('failed preflight never saves or activates and surfaces the error',async()=>{
  const {dom,q,requests}=editor({failTest:true});await settle();q('new').click();q('name').value='hello';q('description').value='Hello';q('confirm').checked=true;q('confirm').dispatchEvent(new dom.window.Event('change'));q('activate').click();await settle();assert.match(q('error').textContent,/Syntax error/);assert.equal(requests.filter(r=>r.options.method).length,1);dom.window.close();
});
test('editing code during preflight aborts activation',async()=>{
  const {dom,q,requests}=editor({slowTest:true});await settle();q('new').click();q('name').value='hello';q('description').value='Hello';q('confirm').checked=true;q('confirm').dispatchEvent(new dom.window.Event('change'));q('activate').click();q('source').value+='// changed';q('source').dispatchEvent(new dom.window.Event('input'));await new Promise(r=>setTimeout(r,80));assert.equal(requests.filter(r=>r.options.method).length,1);assert.equal(q('error').hidden,false);dom.window.close();
});
test('unavailable engines remain disabled while JavaScript is available',async()=>{
  const {dom,q}=editor();await settle();q('new').click();const engines=[...dom.window.document.querySelectorAll('.code-runtime')];assert.equal(engines.length,4);assert.equal(engines[0].disabled,false);assert.ok(engines.slice(1).every(b=>b.disabled));assert.equal(q('ai-mode').options.length,4);dom.window.close();
});

test('switching bot clears unsaved code and preview instead of moving it to another bot',async()=>{

  const {dom,q}=editor();await settle();q('new').click();q('source').value='private draft';q('bot').value='private';q('bot').dispatchEvent(new dom.window.Event('change'));await settle();assert.equal(q('editor').hidden,true);q('new').click();assert.notEqual(q('source').value,'private draft');dom.window.close();

});

test('project editor saves multiple files as one version and shows why activation is disabled',async()=>{

  const {dom,q,requests}=editor();await settle();q('new').click();

  assert.ok(q('activation-hint').textContent.length>0);
  q('project-new').click();assert.equal(q('project-controls').hidden,false);

  q('filename').value='helpers.js';q('file-add').click();q('source').value='export const color=9138415;';q('source').dispatchEvent(new dom.window.Event('input'));

  q('files').value='index.js';q('files').dispatchEvent(new dom.window.Event('change'));assert.match(q('source').value,/handle/);

  q('name').value='project';q('description').value='Developer project';q('test').click();await settle();q('save').click();await settle();

  const save=JSON.parse(requests.find(r=>r.options.method==='POST' && !r.url.endsWith('/test')).options.body);

  const project=JSON.parse(save.source);assert.equal(project.format,'diskoko-project@1');assert.equal(project.files['helpers.js'],'export const color=9138415;');

  q('confirm').checked=true;q('confirm').dispatchEvent(new dom.window.Event('change'));assert.equal(q('activate').disabled,false);

  q('manifest').value='{';q('manifest').dispatchEvent(new dom.window.Event('input'));assert.equal(q('activate').disabled,true);dom.window.close();

});
