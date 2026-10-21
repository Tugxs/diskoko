import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

test('admin monitoring shows queue ages, delivery failures and a CSRF-protected test without raw error payloads',async()=>{
  const dom=new JSDOM(readFileSync('admin-console.html','utf8'),{url:'https://diskoko.test/admin',runScripts:'outside-only'});
  const calls=[];const details={health:{ok:false,checkedAt:new Date().toISOString()},snapshot:{database:'ready',worker:{online:true,ageSeconds:2},queue:{pending:8,running:1,oldestPendingSeconds:50}},notifications:{emailConfigured:false,discordConfigured:true,discordChannelId:'111111111111111111'},journal:{history:[{key:'queue',type:'incident',at:Date.now(),delivery:{discord:{sentAt:1},email:{lastError:'EAUTH'}}}]}};
  dom.window.fetch=async(url,options={})=>{calls.push({url,options});const body=url==='/api/me'?{user:{isAdmin:true,username:'owner'}}:url==='/api/csrf-token'?{token:'test-csrf'}:url.includes('/api/admin/operations')?details:url.includes('/users')?{users:[]}:url.includes('/audit')?{logs:[]}:url.includes('/finance')?{invoices:[],upgradeRequests:[]}:{stats:{},reports:[],coupons:[]};return {ok:true,json:async()=>body};};
  try{
    dom.window.eval(readFileSync('admin-console.20260921.js','utf8'));
    await new Promise(r=>setTimeout(r,30));dom.window.document.querySelector('[data-view="operations"]').click();await new Promise(r=>setTimeout(r,30));
    assert.match(dom.window.document.querySelector('#content').textContent,/أقدم طلب ينتظر/);assert.match(dom.window.document.querySelector('#content').textContent,/تعذر الإرسال/);
    dom.window.document.querySelector('#testOperations').click();await new Promise(r=>setTimeout(r,30));
    const call=calls.find(c=>c.url==='/api/admin/operations/test');assert.equal(call.options.method,'POST');assert.equal(call.options.headers['X-CSRF-Token'],'test-csrf');
  }finally{dom.window.close();}
});
