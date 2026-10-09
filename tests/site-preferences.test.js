import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {uiTranslations,uiPatterns} from '../site-translations.js';
test('site preferences switch dynamic labels, preserve customer content and persist background color',async()=>{
 const dom=new JSDOM('<html dir="rtl"><body><header class="topbar-end"></header><nav>القنوات والرتب</nav><div class="ai-bubble">القنوات والرتب</div><input placeholder="ابحث بالاسم…"><main></main></body></html>',{url:'https://diskoko.com',runScripts:'outside-only'});
 const w=dom.window;w.uiTranslations=uiTranslations;w.uiPatterns=uiPatterns;w.eval(fs.readFileSync('site-preferences.js','utf8').replace("import {localizeDateText} from './site-format.js';",'const localizeDateText=s=>s;').replace("import {uiTranslations,uiPatterns} from './site-translations.js';",'const uiTranslations=window.uiTranslations,uiPatterns=window.uiPatterns;'));
 const select=w.document.querySelector('#siteLanguage');select.value='en';select.dispatchEvent(new w.Event('change'));
 assert.equal(w.document.documentElement.dir,'ltr');assert.equal(w.document.querySelector('nav').textContent,'Channels and roles');assert.equal(w.document.querySelector('.ai-bubble').textContent,'القنوات والرتب');assert.equal(w.document.querySelector('input[placeholder]').placeholder,'Search by name…');
 w.document.querySelector('main').innerHTML='<button>حفظ</button>';await new Promise(r=>setTimeout(r,70));assert.equal(w.document.querySelector('main button').textContent,'Save');
 w.document.querySelector('input[placeholder]').value='اسم قناة العميل';select.value='ar';select.dispatchEvent(new w.Event('change'));assert.equal(w.document.querySelector('nav').textContent,'القنوات والرتب');assert.equal(w.document.querySelector('main button').textContent,'حفظ');assert.equal(w.document.querySelector('input[placeholder]').placeholder,'ابحث بالاسم…');assert.equal(w.document.querySelector('input[placeholder]').value,'اسم قناة العميل');
 const color=w.document.querySelector('#siteAccent');color.value='#226688';color.dispatchEvent(new w.Event('input'));assert.equal(w.localStorage.getItem('diskoko:background-accent'),'#226688');assert.equal(w.document.documentElement.style.getPropertyValue('--dk-user-accent'),'#226688');const base=w.document.querySelector('#siteBase');base.value='#335577';base.dispatchEvent(new w.Event('input'));assert.equal(w.localStorage.getItem('diskoko:background-base'),'#335577');w.document.querySelector('#siteColorToggle').click();assert.equal(w.document.querySelector('#siteColorToggle').getAttribute('aria-expanded'),'true');w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));assert.equal(w.document.querySelector('#siteColorPanel').hidden,true);w.document.querySelector('#siteColorReset').click();assert.equal(w.localStorage.getItem('diskoko:background-base'),null);assert.equal(w.localStorage.getItem('diskoko:background-accent'),null);w.close();
});

function loadPreferences(html, saved={}){
 const dom=new JSDOM(html,{url:'https://diskoko.com',runScripts:'outside-only'});const w=dom.window;
 for(const [key,value] of Object.entries(saved))w.localStorage.setItem(key,value);
 w.uiTranslations=uiTranslations;w.uiPatterns=uiPatterns;w.eval(fs.readFileSync('site-preferences.js','utf8').replace("import {localizeDateText} from './site-format.js';",'const localizeDateText=s=>s;').replace("import {uiTranslations,uiPatterns} from './site-translations.js';",'const uiTranslations=window.uiTranslations,uiPatterns=window.uiPatterns;'));
 return dom;
}

test('saved preferences restore, synchronize across tabs and preserve Discord names',()=>{
 const dom=loadPreferences('<html><head><title>لوحة السيرفر — القنوات والرتب</title></head><body><header class="topbar-end"></header><h3 data-i18n-preserve>القنوات والرتب</h3><select id="guildSelect"><option value="111111111111111111">حفظ</option></select><select><option value="222222222222222222">تعديل</option><option value="ui">حفظ</option></select><p>حفظ</p></body></html>',{'diskoko:site-language':'en','diskoko:background-accent':'#336699','diskoko:background-base':'javascript:bad'});
 const w=dom.window,d=w.document;assert.equal(d.documentElement.lang,'en');assert.equal(d.querySelector('h3').textContent,'القنوات والرتب');assert.equal(d.querySelector('#guildSelect option').textContent,'حفظ');assert.equal(d.querySelector('option[value="222222222222222222"]').textContent,'تعديل');assert.equal(d.querySelector('option[value="ui"]').textContent,'Save');assert.equal(d.documentElement.style.getPropertyValue('--dk-user-accent'),'#336699');assert.equal(d.documentElement.style.getPropertyValue('--dk-user-base'),'');
 w.dispatchEvent(new w.StorageEvent('storage',{key:'diskoko:site-language',newValue:'ar'}));assert.equal(d.querySelector('p').textContent,'حفظ');assert.equal(d.documentElement.dir,'rtl');
 w.dispatchEvent(new w.StorageEvent('storage',{key:'diskoko:background-accent',newValue:null}));assert.equal(d.documentElement.style.getPropertyValue('--dk-user-accent'),'');dom.window.close();
});

test('dynamic counts and greeting translate while the interpolated customer name stays unchanged',()=>{
 const dom=loadPreferences('<html><body><header class="topbar-end"></header><p id="greeting">أهلًا، حفظ</p><p id="count">4 سيرفر</p><section dir="rtl"><button>إلغاء</button></section></body></html>',{'diskoko:site-language':'en'}),d=dom.window.document;
 assert.equal(d.querySelector('#greeting').textContent,'Hello, حفظ');assert.equal(d.querySelector('#count').textContent,'4 servers');assert.equal(d.querySelector('section').dir,'ltr');
 d.querySelector('#siteLanguage').value='ar';d.querySelector('#siteLanguage').dispatchEvent(new dom.window.Event('change'));assert.equal(d.querySelector('#greeting').textContent,'أهلًا، حفظ');assert.equal(d.querySelector('section').dir,'rtl');dom.window.close();
});
