import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCodeProposal} from '../lib/code-assistant-generation.js';
test('explanation preserves original source including broken code without executing it',async()=>{
  const old=globalThis.fetch;let validated=false;
  globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({source:'function handle(){}',explanation:'Missing closing brace'})}}]})});
  try{const result=await generateCodeProposal({prompt:'Assistant mode: explain. Explain',source:'function handle(){',contract:'test',validate:async()=>{validated=true;}});assert.equal(result.source,'function handle(){');assert.equal(validated,false);assert.equal(result.explanation,'Missing closing brace');}finally{globalThis.fetch=old;}
});
test('generated code is repaired after validation failure and never bypasses validation',async()=>{
  const old=globalThis.fetch;let generated=0,validated=0;
  globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({source:++generated===1?'broken':'valid',explanation:'Fixed'})}}]})});
  try{const result=await generateCodeProposal({prompt:'Assistant mode: fix. Fix',source:'broken',contract:'test',validate:async source=>{validated++;return {ok:source==='valid',source,error:'syntax'};}});assert.equal(result.source,'valid');assert.equal(validated,2);}finally{globalThis.fetch=old;}
});
