import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {account as fixture} from './fixtures.js';

test('subscription UI exposes services, free downgrade, one confirmed cancellation and English service content',async()=>{
  const account=structuredClone(fixture),calls=[];
  const dom=new JSDOM(fs.readFileSync('account.html','utf8'),{url:'https://diskoko.test/account.html#subscription',runScripts:'outside-only'});
  try {
    const w=dom.window;w.confirm=()=>true;w.eval(fs.readFileSync('site-format.js','utf8').replace(/^export /gm,''));
    w.fetch=async(path,options={})=>{calls.push({path,options});if(path==='/api/account/subscription/cancel')account.plan.cancel_at_period_end=true;return {ok:true,json:async()=>path==='/api/account/overview'?account:path==='/api/csrf-token'?{token:'test'}:{ok:true}};};
    w.eval(fs.readFileSync('account.js','utf8').replace("import {siteDate} from './site-format.js';",''));
    const settle=()=>new Promise(resolve=>setTimeout(resolve,15));await settle();
    assert.equal(w.document.querySelectorAll('.service-grid article').length,8);
    assert.ok(w.document.querySelector('.upgrade-plan[data-plan="free"]'),'paid customers can request the free plan');
    w.document.querySelector('#cancelSubscription').click();w.document.querySelector('#cancelSubscription').click();await settle();
    assert.equal(calls.filter(c=>c.path==='/api/account/subscription/cancel').length,1);
    assert.equal(w.document.querySelector('#cancelSubscription'),null);
    w.document.documentElement.lang='en';w.dispatchEvent(new w.CustomEvent('diskoko-language-change'));await settle();
    assert.match(w.document.querySelector('.service-catalog').textContent,/Programmable commands/);
    assert.doesNotMatch(w.document.querySelector('.billing-plan ul').textContent,/\p{Script=Arabic}/u);
    account.access.mode='read_only';w.document.querySelector('#refresh').click();await settle();
    assert.ok(w.document.querySelector('.upgrade-plan[data-plan="business"]'),'expired plan can be requested again');
  }finally{dom.window.close();}
});
