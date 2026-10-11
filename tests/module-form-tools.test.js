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

test('reviewed receipt and submission cooldown are bounded and preserved on unrelated edits',()=>{
  assert.equal(moduleFormTools({cooldownSeconds:120,receiptText:'Received'}).cooldownSeconds,120);
  for(const value of [0,29,3601,30.5,'60'])assert.throws(()=>moduleFormTools({cooldownSeconds:value}));
  assert.throws(()=>moduleFormTools({receiptText:'x'.repeat(301)}));
  const prior={kind:'module',moduleKind:'feedback',cooldownSeconds:120,receiptText:'Received'};
  const proposed={...prior,cooldownSeconds:60,receiptText:'Updated'};
  assert.equal(mergePanelEdits(prior,proposed,'Change the title').receiptText,'Received');
  assert.equal(mergePanelEdits(prior,proposed,'Change the cooldown').cooldownSeconds,60);
  assert.equal(mergePanelEdits(prior,proposed,'غيّر رسالة الاستلام').receiptText,'Updated');
});

test('custom fields preserve order and optional answers while enforcing bounds',()=>{const config={formFields:[{id:'topic',label:'Topic',required:true,maxLength:50},{id:'notes',label:'Notes',style:2,required:false,maxLength:100}]};assert.equal(moduleFormTools(config).formFields[1].required,false);const result=validateModuleSubmission(config,{topic:'Issue',notes:''});assert.equal(result.subject,'Issue');assert.equal(result.answers.length,2);assert.throws(()=>validateModuleSubmission(config,{topic:'',notes:''}));assert.throws(()=>moduleFormTools({formFields:Array.from({length:6},(_,i)=>({id:'f'+i,label:'Field'}))}));assert.throws(()=>moduleFormTools({formFields:[{id:'same',label:'One'},{id:'same',label:'Two'}]}));});
