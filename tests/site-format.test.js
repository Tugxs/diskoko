import test from 'node:test';
import assert from 'node:assert/strict';
import {siteDate,localizeDateText} from '../site-format.js';
test('rendered metadata dates change language without rebuilding the editor',()=>{
 const previous=globalThis.document;globalThis.document={documentElement:{lang:'ar'}};
 try{
  const date=new Date('2026-10-09T12:00:00Z'),ar=siteDate(date,'toLocaleDateString');
  document.documentElement.lang='en';const en=siteDate(date,'toLocaleDateString');
  assert.notEqual(ar,en);assert.equal(localizeDateText('Updated: '+ar,'en'),'Updated: '+en);
  assert.equal(localizeDateText(en,'ar'),ar);assert.equal(localizeDateText('Customer text','en'),'Customer text');
 }finally{globalThis.document=previous;}
});
