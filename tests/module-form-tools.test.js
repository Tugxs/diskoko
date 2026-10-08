import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleFormTools,validateModuleSubmission} from '../lib/module-form-tools.js';
import {mergePanelEdits} from '../lib/ai-welcome-design.js';
test('existing forms retain their limits while reviewed hints and lengths are bounded',()=>{
  assert.deepEqual(moduleFormTools(),{subjectMaxLength:120,subjectPlaceholder:'',detailsMaxLength:1000,detailsPlaceholder:''});
  assert.equal(moduleFormTools({subjectMaxLength:60,subjectPlaceholder:'اسم المنتج'}).subjectPlaceholder,'اسم المنتج');
  for(const value of [0,-1,121,1.5,'50'])assert.throws(()=>moduleFormTools({subjectMaxLength:value}));
  assert.throws(()=>moduleFormTools({detailsPlaceholder:'x'.repeat(101)}));
});

test('submission rejects oversized original answers instead of silently truncating them',()=>{
  assert.throws(()=>validateModuleSubmission({}, {subject:'x'.repeat(121),details:'valid'}));
  assert.throws(()=>validateModuleSubmission({}, {subject:'valid',details:'x'.repeat(1001)}));
  assert.throws(()=>validateModuleSubmission({subjectMaxLength:5}, {subject:'123456',details:'valid'}));
  assert.throws(()=>validateModuleSubmission({}, {subject:'  ',details:'valid'}));
  assert.throws(()=>validateModuleSubmission({}, {subject:42,details:'valid'}));
  assert.deepEqual(validateModuleSubmission({}, {subject:' test ',details:' details '}),{subject:'test',details:'details'});
});
test('unrelated edits preserve form requirements while explicit length changes apply',()=>{
  const prior={kind:'module',moduleKind:'suggestions',...moduleFormTools({subjectMaxLength:60})};
  const proposed={...prior,...moduleFormTools()};
  assert.equal(mergePanelEdits(prior,proposed,'Change the title').subjectMaxLength,60);
  assert.equal(mergePanelEdits(prior,proposed,'Change the subject length limit').subjectMaxLength,120);
});
