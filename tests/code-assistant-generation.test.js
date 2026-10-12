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
test('a bare project response is validated then receives an explanation without replacing the code',async()=>{
  const old=globalThis.fetch;let calls=0;
  const project={format:'diskoko-project@1',entry:'index.js',files:{'index.js':'export function handle(){return {message:{content:"Hi"}}}'}};
  globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(++calls===1?project:{explanation:'Returns a greeting'})}}]})});
  try{const result=await generateCodeProposal({prompt:'Generate',source:'',contract:'test',validate:async source=>({ok:true,source})});assert.equal(JSON.parse(result.source).format,'diskoko-project@1');assert.equal(result.explanation,'Returns a greeting');assert.equal(calls,2);}finally{globalThis.fetch=old;}
});
