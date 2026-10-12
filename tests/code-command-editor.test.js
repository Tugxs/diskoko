import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const source=fs.readFileSync(new URL('../code-command-editor.js',import.meta.url),'utf8').replace(/^export /gm,'');
const settle=()=>new Promise(resolve=>setTimeout(resolve,15));
function editor(){
  const dom=new JSDOM('<main id="workspace"></main>',{url:'https://diskoko.test',runScripts:'outside-only'}),w=dom.window,requests=[];let saved=[];
  w.structuredClone=structuredClone;w.eval(source);
  const api=async(url,options={})=>{requests.push({url,options});if(url.endsWith('/test'))return {output:{message:{content:'Test OK',embeds:[],controls:[]}}};if(options.method==='POST'){const body=JSON.parse(options.body);saved=[{...body,id:'draft',revision:1}];return {id:'draft',revision:1};}if(url.includes('/history'))return {versions:[],runs:[]};return {commands:saved,example:'function handle(){return {message:{content:"Hi"}}}'};};
  w.mountCodeEditor({host:w.document.querySelector('main'),bots:[{id:'public',label:'Diskoko'},{id:'private',label:'My bot'}],guild:'guild',api,esc:value=>String(value).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]))});
  const q=s=>w.document.querySelector(`[data-code-${s}]`);return {dom,q,requests};
}
test('editor requires preview, saved source and explicit confirmation before activation',async()=>{
  const {dom,q,requests}=editor();await settle();q('new').click();q('name').value='hello';q('description').value='Hello';assert.equal(q('activate').disabled,true);
  q('test').click();await settle();assert.equal(q('preview').textContent,'Test OK');assert.equal(q('activate').disabled,true);
  q('save').click();await settle();q('confirm').checked=true;q('confirm').dispatchEvent(new dom.window.Event('change'));assert.equal(q('activate').disabled,false);
  q('source').value+='\n// changed';q('source').dispatchEvent(new dom.window.Event('input'));assert.equal(q('activate').disabled,true);assert.equal(q('confirm').checked,false);
  assert.ok(!requests.some(r=>r.options.method==='PATCH'));const save=JSON.parse(requests.find(r=>r.options.method==='POST' && !r.url.endsWith('/test')).options.body);assert.equal(save.guildId,'guild');dom.window.close();
});
test('switching bot clears unsaved code and preview instead of moving it to another bot',async()=>{
  const {dom,q}=editor();await settle();q('new').click();q('source').value='private draft';q('bot').value='private';q('bot').dispatchEvent(new dom.window.Event('change'));await settle();assert.equal(q('editor').hidden,true);q('new').click();assert.notEqual(q('source').value,'private draft');dom.window.close();
});
test('project editor saves multiple files as one version and shows why activation is disabled',async()=>{
  const {dom,q,requests}=editor();await settle();q('new').click();
  assert.match(q('activation-hint').textContent,/احفظ/);
  q('project-new').click();assert.equal(q('project-controls').hidden,false);
  q('filename').value='helpers.js';q('file-add').click();q('source').value='export const color=9138415;';q('source').dispatchEvent(new dom.window.Event('input'));
  q('files').value='index.js';q('files').dispatchEvent(new dom.window.Event('change'));assert.match(q('source').value,/handle/);
  q('name').value='project';q('description').value='Developer project';q('test').click();await settle();q('save').click();await settle();
  const save=JSON.parse(requests.find(r=>r.options.method==='POST' && !r.url.endsWith('/test')).options.body);
  const project=JSON.parse(save.source);assert.equal(project.format,'diskoko-project@1');assert.equal(project.files['helpers.js'],'export const color=9138415;');
  q('confirm').checked=true;q('confirm').dispatchEvent(new dom.window.Event('change'));assert.equal(q('activate').disabled,false);
  q('manifest').value='{';q('manifest').dispatchEvent(new dom.window.Event('input'));assert.equal(q('activate').disabled,true);dom.window.close();
});
