import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {uiTranslations} from '../ai-ui-language.js';
test('site preferences switch dynamic labels, preserve customer content and persist background color',async()=>{
 const dom=new JSDOM('<html dir="rtl"><body><header class="topbar-end"></header><nav>القنوات والرتب</nav><div class="ai-bubble">القنوات والرتب</div><input placeholder="ابحث بالاسم…"><main></main></body></html>',{url:'https://diskoko.com',runScripts:'outside-only'});
 const w=dom.window;w.uiTranslations=uiTranslations;w.eval(fs.readFileSync('site-preferences.js','utf8').replace("import {uiTranslations} from './ai-ui-language.js';",'const uiTranslations=window.uiTranslations;'));
 const select=w.document.querySelector('#siteLanguage');select.value='en';select.dispatchEvent(new w.Event('change'));
 assert.equal(w.document.documentElement.dir,'ltr');assert.equal(w.document.querySelector('nav').textContent,'Channels and roles');assert.equal(w.document.querySelector('.ai-bubble').textContent,'القنوات والرتب');assert.equal(w.document.querySelector('input[placeholder]').placeholder,'Search by name…');
 w.document.querySelector('main').innerHTML='<button>حفظ</button>';await new Promise(r=>setTimeout(r,70));assert.equal(w.document.querySelector('main button').textContent,'Save');
 select.value='ar';select.dispatchEvent(new w.Event('change'));assert.equal(w.document.querySelector('nav').textContent,'القنوات والرتب');assert.equal(w.document.querySelector('main button').textContent,'حفظ');assert.equal(w.document.querySelector('input[placeholder]').placeholder,'ابحث بالاسم…');
 const color=w.document.querySelector('#siteAccent');color.value='#226688';color.dispatchEvent(new w.Event('input'));assert.equal(w.localStorage.getItem('diskoko:background-accent'),'#226688');assert.equal(w.document.documentElement.style.getPropertyValue('--dk-user-accent'),'#226688');w.close();
});
