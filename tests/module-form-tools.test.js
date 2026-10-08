import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleFormTools} from '../lib/module-form-tools.js';
test('existing forms retain their limits while reviewed hints and lengths are bounded',()=>{
  assert.deepEqual(moduleFormTools(),{subjectMaxLength:120,subjectPlaceholder:'',detailsMaxLength:1000,detailsPlaceholder:''});
  assert.equal(moduleFormTools({subjectMaxLength:60,subjectPlaceholder:'اسم المنتج'}).subjectPlaceholder,'اسم المنتج');
  for(const value of [0,-1,121,1.5,'50'])assert.throws(()=>moduleFormTools({subjectMaxLength:value}));
  assert.throws(()=>moduleFormTools({detailsPlaceholder:'x'.repeat(101)}));
});
