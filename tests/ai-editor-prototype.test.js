import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountEditorPrototype, mountPanelStudio } from '../ai-editor-prototype.js';

test('experimental editor retains authoritative inputs, separates settings and does not submit',()=>{
  const dom=new JSDOM(`<dialog open><div id="root"><div class="dialog-body"><fieldset class="ai-module-section"><label>Title<input id="moduleTitle" value="Support"></label><label>Description<textarea id="moduleDescription">Help here</textarea></label><label>Button<input id="moduleButton" value="Open ticket"></label></fieldset><fieldset class="ai-module-section"><label>Channel<select id="moduleChannel"><option value="123">support</option></select></label></fieldset><fieldset class="ai-module-section"><label>Color<input id="moduleColor" type="color" value="#123456"></label><label>Style<select id="moduleButtonStyle"><option value="1">Primary</option></select></label></fieldset><label>Image<input id="moduleBanner" type="file"></label><div id="moduleBannerPreview"></div></div></div></dialog>`,{url:'https://example.test/studio?editorPreview=1'});
  const previous={document:globalThis.document,location:globalThis.location,MutationObserver:globalThis.MutationObserver};
  Object.assign(globalThis,{document:dom.window.document,location:dom.window.location,MutationObserver:dom.window.MutationObserver});
  try{
    const root=document.querySelector('#root'), title=document.querySelector('#moduleTitle');
    title.scrollIntoView=()=>{};
    assert.equal(mountEditorPrototype(root,{english:true,markdown:value=>value}),true);
    assert.equal(document.querySelector('#moduleTitle'),title);
    title.value='Updated';title.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    assert.equal(root.querySelector('.editor-title').textContent,'Updated');
    root.querySelector('[data-editor-tab="2"]').click();
    assert.equal(title.closest('fieldset').hidden,true);
    root.querySelector('[data-editor-target="moduleTitle"]').click();
    assert.equal(title.closest('fieldset').hidden,false);
    assert.equal(document.activeElement,title);
    root.querySelector('[data-editor-undo]').click();
    assert.equal(title.value,'Support');
    root.querySelector('[data-editor-redo]').click();
    assert.equal(title.value,'Updated');
    root.querySelector('[data-editor-add-link]').click();
    assert.equal(root.querySelector('[data-editor-link-row]').hidden,false);
    assert.equal(root.querySelectorAll('.editor-card button[type="submit"]').length,0);
    document.querySelector('dialog').dispatchEvent(new dom.window.Event('close'));
    assert.equal(document.querySelector('dialog').classList.contains('ai-editor-prototype'),false);
  }finally{Object.assign(globalThis,previous);dom.window.close();}
});
test('shared panel inspector preserves original fields and confirmation binding',()=>{
  const dom=new JSDOM('<dialog open><div id="root"><div class="dialog-body"><label>Title<input id="aiInteractiveTitle" value="Support"></label><label>Channel<select id="aiInteractiveChannel"><option>test</option></select></label><label>Confirm<input id="aiInteractiveConfirmed" type="checkbox"></label><section class="ai-discord-preview"><b id="aiPreviewTitle">Support</b></section></div></div></dialog>',{url:'https://example.test/studio'});
  const previous={document:globalThis.document,location:globalThis.location};Object.assign(globalThis,{document:dom.window.document,location:dom.window.location});
  try{
    const root=document.querySelector('#root'),field=document.querySelector('#aiInteractiveTitle');field.scrollIntoView=()=>{};
    assert.equal(mountPanelStudio(root),true);assert.equal(document.querySelector('#aiInteractiveTitle'),field);
    root.querySelector('[data-studio-tab="2"]').click();assert.equal(field.closest('[data-studio-fields]').hidden,true);
    root.querySelector('#aiPreviewTitle').click();assert.equal(document.activeElement,field);
    assert.equal(root.querySelector('#aiInteractiveConfirmed').closest('[data-studio-fields]').dataset.studioFields,'2');
  }finally{Object.assign(globalThis,previous);dom.window.close();}
});
