import test from 'node:test';
import assert from 'node:assert/strict';
import {alertText,alertConfiguration,operationsMailEnvironment,createAlertSender} from '../lib/operations.js';

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

test('operations mail account never mixes credentials with the site account',async()=>{
  const site={SMTP_HOST:'site.example',SMTP_USER:'site@example.com',SMTP_PASS:'site-only',OPS_ALERT_EMAILS:'ops@example.com'};
  assert.equal(operationsMailEnvironment(site).PASS,'site-only');
  const partial={...site,OPS_SMTP_HOST:'smtp.gmail.com',OPS_SMTP_USER:'ops@example.com'};
  assert.equal(alertConfiguration(partial).emailReady,false);
  assert.equal(operationsMailEnvironment(partial).PASS,undefined);
  const configured={...partial,OPS_SMTP_PASS:'operations-only'};
  assert.equal(alertConfiguration(configured).emailReady,true);
  let message;
  await createAlertSender(configured,{transport:{sendMail:async m=>{message=m;}}}).send('email',{id:'test',key:'worker',type:'test',at:0});
  assert.equal(message.from,'ops@example.com');
});
