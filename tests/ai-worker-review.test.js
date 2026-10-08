import test from 'node:test';
import assert from 'node:assert/strict';
process.env.AI_WORKER_TEST='1';
delete process.env.AI_EMBEDDING_URL;
const {respond}=await import('../scripts/local-ai-worker.mjs');

test('do not publish does not suppress a supported editable draft',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(++calls===1?{executeNow:false}: {executeNow:false,interactive:{kind:'module',moduleKind:'faq',title:'FAQ',description:'Read',buttonLabel:'Answer',answer:'Hello'}})}}]})});
  try{
    const result=await respond({prompt:'Build an editable FAQ panel. Do not publish.',context:[],guild_context:{}});
    assert.equal(calls,2);
    assert.equal(result.proposal.interactive.moduleKind,'faq');
    assert.match(result.answer,/Nothing has been published/);
  }finally{globalThis.fetch=original;}
});

test('advice remains advice without forcing a functional draft',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:++calls===2?'A FAQ answers common questions.':'{"executeNow":false}'}}]})});
  try{
    const result=await respond({prompt:'What is a FAQ?',context:[],guild_context:{}});
    assert.equal(result.proposal,null);
    assert.equal(calls,3);
  }finally{globalThis.fetch=original;}
});
