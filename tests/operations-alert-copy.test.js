import test from 'node:test';
import assert from 'node:assert/strict';
import {alertText} from '../lib/operations.js';

test('each incident explains the observed failure, impact and corrective action without exposing arbitrary event data',()=>{
  for(const key of ['database','worker','gateway','connections','queue','execution','discord_errors','schedules','projects','roles','automations','loops','memory','http_errors','pool','storage','release','site']){
    const text=alertText({key,type:'incident',at:0,id:'test-reference',error:'secret-customer-payload'});
    for(const label of ['ما رُصد:','الأثر المحتمل:','الإجراء المقترح:','الرياض','test-reference'])assert.ok(text.includes(label),key);
    assert.ok(text.length<2000,key);
    assert.ok(!text.includes('secret-customer-payload'));
  }
});
test('recovery and test alerts do not claim an active incident',()=>{
  const event={key:'worker',at:0,id:'test-reference'};
  assert.match(alertText({...event,type:'test'}),/رسالة اختبار فقط/);
  const recovered=alertText({...event,type:'recovered'});
  assert.match(recovered,/لم يعد شرط العطل قائمًا/);
  assert.ok(!recovered.includes('ما رُصد:'));
});
