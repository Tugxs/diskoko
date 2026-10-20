import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeImageWork,readBoundedImage,createImageCache,sampledGifFrames} from '../lib/image-resource-budget.js';
import {runCode} from '../lib/code-command-sandbox.js';

test('image cache is limited by bytes as well as entry count and expires/evicts old data',()=>{
  let now=0;const c=createImageCache({maxBytes:10,maxEntries:3,now:()=>now});
  c.set('a',{data:'123456',expires:10});c.set('b',{data:'123456',expires:10});assert.equal(c.get('a'),undefined);assert.ok(c.stats().bytes<=10);
  c.set('too-big',{data:'x'.repeat(11),expires:10});assert.equal(c.get('too-big'),undefined);
  now=11;assert.equal(c.get('b'),undefined);assert.equal(c.stats().bytes,0);
});
test('missing or false Content-Length does not bypass the streaming image limit',async()=>{
  let cancelled=false;const response=new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(10));},cancel(){cancelled=true;}}));
  await assert.rejects(readBoundedImage(response,12),/limit/);assert.equal(cancelled,true);
  assert.equal((await readBoundedImage(new Response(new Uint8Array([1,2,3])),4)).length,3);
});
test('native image concurrency and waiting queue are bounded and recover after failures',async()=>{
  let release;const one=nativeImageWork(()=>new Promise(r=>release=r));const two=nativeImageWork(async()=>2),three=nativeImageWork(async()=>3);
  await assert.rejects(nativeImageWork(async()=>4),e=>e.code==='IMAGE_BUSY');release(1);assert.deepEqual(await Promise.all([one,two,three]),[1,2,3]);
  await assert.rejects(nativeImageWork(async()=>{throw Error('bad image');}));assert.equal(await nativeImageWork(async()=>5),5);
});
test('large GIFs use a bounded output frame count while preserving summed timing',()=>{
  const delays=Array.from({length:100},(_,i)=>20+i),samples=sampledGifFrames(100,delays);
  assert.ok(samples.length<=24);assert.equal(samples.reduce((sum,s)=>sum+s.delay,0),delays.reduce((a,b)=>a+b,0));
  assert.deepEqual(sampledGifFrames(2,[100,200]),[{page:0,delay:100},{page:1,delay:200}]);
});
test('one account cannot monopolize both code processes through different guilds or bots',async()=>{
  const ctx={user:{id:'u'},guild:{id:'g'},event:{type:'command'},state:{}};
  const running=runCode('function handle(){while(true){}}',ctx,'account:guild-a:bot-a');const failed=assert.rejects(running);
  await assert.rejects(runCode('function handle(){}',ctx,'account:guild-b:bot-b'),e=>e.code==='CODE_BUSY');
  assert.equal((await runCode('function handle(){return {message:{content:"ok"}}}',ctx,'another:g:b')).message.content,'ok');
  await failed;assert.equal((await runCode('function handle(){return {message:{content:"recovered"}}}',ctx,'account:g:b')).message.content,'recovered');
});
