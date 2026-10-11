import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleFaqTools } from '../lib/module-faq-tools.js';
import { moduleDraft } from '../lib/ai-module-draft.js';
test('FAQ normalizes bounded questions with server-owned option IDs',()=>{
  assert.deepEqual(moduleFaqTools({questions:[{id:'code',question:' Q ',answer:' A '}]}),{questions:[{id:'0',question:'Q',answer:'A'}]});
  for(const questions of [[],Array(26).fill({question:'Q',answer:'A'}),[{question:'x'.repeat(101),answer:'A'}],[{question:'Q',answer:''}]])assert.throws(()=>moduleFaqTools({questions}));
  assert.equal(moduleDraft({kind:'module',moduleKind:'faq',questions:[{question:'Q',answer:'A'}]}).questions[0].answer,'A');
});
