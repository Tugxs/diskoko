import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleFaqTools } from '../lib/module-faq-tools.js';
import { moduleDraft } from '../lib/ai-module-draft.js';
test('FAQ normalizes bounded questions with server-owned option IDs',()=>{
  assert.deepEqual(moduleFaqTools({questions:[{id:'code',question:' Q ',answer:' A '}]}),{questions:[{id:'0',question:'Q',answer:'A'}]});
  for(const questions of [[],Array(26).fill({question:'Q',answer:'A'}),[{question:'x'.repeat(101),answer:'A'}],[{question:'Q',answer:''}]])assert.throws(()=>moduleFaqTools({questions}));
  assert.equal(moduleDraft({kind:'module',moduleKind:'faq',questions:[{question:'Q',answer:'A'}]}).questions[0].answer,'A');
});
test('AI event drafts preserve only bounded executable optional features',()=>{const valid=moduleDraft({kind:'module',moduleKind:'events',waitlist:true,checkIn:true,reminderMinutes:30});assert.equal(valid.waitlist,true);assert.equal(valid.checkIn,true);assert.equal(valid.reminderMinutes,30);const invalid=moduleDraft({kind:'module',moduleKind:'events',waitlist:'yes',reminderMinutes:10081});assert.equal(invalid.waitlist,undefined);assert.equal(invalid.reminderMinutes,undefined);});
