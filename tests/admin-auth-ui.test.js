import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

test('admin reauthentication provides an explicit link and never replays a sensitive request',async()=>{
  const dom=new JSDOM(fs.readFileSync('admin-console.html','utf8'),{url:'https://diskoko.test/admin',runScripts:'outside-only'});
  const calls=[];dom.window.fetch=async(url,options={})=>{
    calls.push({url,method:options.method || 'GET'});
    const body=url==='/api/me'?{user:{isAdmin:true,username:'owner'}}:url==='/api/csrf-token'?{token:'csrf'}:{error:'أعد تسجيل الدخول؛ لم ينفذ الطلب.',code:'ADMIN_REAUTH_REQUIRED',reauthUrl:'/auth/google?returnTo=%2Fadmin'};
    return {ok:['/api/me','/api/csrf-token'].includes(url),json:async()=>body};
  };
  try{
    dom.window.eval(fs.readFileSync('admin-console.20260921.js','utf8')+'\nwindow.testApi=api;window.testError=error;');
    await new Promise(r=>setTimeout(r,30));
    let link=dom.window.document.querySelector('#adminError a');assert.ok(link);assert.equal(link.getAttribute('href'),'/auth/google?returnTo=%2Fadmin');
    await assert.rejects(dom.window.testApi('/api/admin/sensitive',{method:'PATCH',body:'{}'}),e=>{dom.window.testError(e);return e.reauthUrl==='/auth/google?returnTo=%2Fadmin';});
    await new Promise(r=>setTimeout(r,20));
    assert.equal(calls.filter(c=>c.method==='PATCH').length,1);assert.equal(calls.filter(c=>c.url.startsWith('/auth/')).length,0);
    assert.equal(dom.window.location.pathname,'/admin');
  }finally{dom.window.close();}
});
