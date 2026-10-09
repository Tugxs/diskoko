import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {uiTranslations,uiPatterns} from '../site-translations.js';

test('all static page interface text has an English translation',()=>{
 const missing=[];
 for(const file of fs.readdirSync('.').filter(f=>f.endsWith('.html'))){
  const dom=new JSDOM(fs.readFileSync(file,'utf8')),d=dom.window.document;
  const check=value=>{const s=value.trim();if(!/\p{Script=Arabic}/u.test(s))return;if(uiTranslations.has(s))return;const m=s.match(/^([^\p{L}\p{N}]*)(.+?)([^\p{L}\p{N}]*)$/u);if(m&&uiTranslations.has(m[2]))return;missing.push(file+': '+s);};
  const w=d.createTreeWalker(d.body,4);for(let n=w.nextNode();n;n=w.nextNode())if(!n.parentElement.closest('script,style,input,textarea,.avatar,.avatar-stack,.server-image'))check(n.nodeValue);
  for(const e of d.querySelectorAll('[placeholder],[aria-label],[title],[alt]'))for(const key of ['placeholder','aria-label','title','alt'])if(e.hasAttribute(key))check(e.getAttribute(key));
  dom.window.close();
 }
 assert.deepEqual(missing,[]);
});

test('dynamic interface translations preserve all interpolation slots',()=>{
 for(const [ar,en] of uiPatterns){const slots=s=>(s.match(/\{\d+\}/g)||[]).sort();assert.deepEqual(slots(en),slots(ar),ar);assert.ok(en.trim());assert.equal(/\p{Script=Arabic}/u.test(en),false,ar);}
 for(const [ar,en] of uiTranslations){assert.ok(en.trim(),ar);assert.equal(/\p{Script=Arabic}/u.test(en),false,ar);}
});
