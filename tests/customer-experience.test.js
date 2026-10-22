import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
function setup(){const dom=new JSDOM('<html lang="ar"><body><aside id="sidebar"><a href="#page">Tool</a></aside><main class="main-shell"><button id="menu">Menu</button></main></body></html>',{url:'https://diskoko.test',runScripts:'outside-only'});dom.window.eval(fs.readFileSync('site-format.js','utf8').replace(/^export /gm,'')+'\nwindow.format=siteDate;');return dom;}
test('customer dates use Gregorian years in both languages and invalid/missing dates are not invented',()=>{
 const dom=setup();try{const f=dom.window.format;assert.match(f('2026-10-22T10:00:00Z','toLocaleDateString'),/٢٠٢٦/);for(const value of [null,'','invalid'])assert.equal(f(value),'—');dom.window.document.documentElement.lang='en';assert.match(f('2026-10-22T10:00:00Z','toLocaleDateString'),/2026/);assert.equal(f.statusLabel('pending'),'Pending');assert.equal(f.statusLabel('internal_unrecognized'),'Unknown status');}finally{dom.window.close();}
});
test('mobile drawer isolates background, closes on Escape and restores keyboard focus',()=>{
 const dom=setup();try{const w=dom.window;w.innerWidth=375;const panel=w.document.querySelector('#sidebar'),button=w.document.querySelector('#menu'),main=w.document.querySelector('main');w.format.bindNavigation({toggle:button,panel});assert.equal(panel.inert,true);button.click();assert.equal(main.inert,true);assert.equal(button.getAttribute('aria-expanded'),'true');assert.equal(w.document.querySelector('.navigation-backdrop').hidden,false);w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(main.inert,false);assert.equal(panel.inert,true);assert.equal(w.document.activeElement,button);assert.equal(w.document.querySelector('.navigation-backdrop').hidden,true);w.innerWidth=1000;w.dispatchEvent(new w.Event('resize'));assert.equal(panel.inert,false);}finally{dom.window.close();}
});
test('connection failures give an action and do not describe a failed write as safe to repeat blindly',()=>{
 const dom=setup();try{const f=dom.window.format;assert.match(f.errorMessage({name:'TimeoutError'}),/تحقق من نتيجة/);assert.match(f.errorMessage({message:'Failed to fetch'}),/تحقق من الإنترنت/);assert.match(f.errorMessage({status:429}),/انتظر/);}finally{dom.window.close();}
});
