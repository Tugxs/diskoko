import test from 'node:test';
import assert from 'node:assert/strict';
import {runCode,normalizeCodeOutput} from '../lib/code-command-sandbox.js';
import {exampleCode,codeContext,discordCodePayload} from '../lib/code-commands.js';

const ctx=codeContext({id:'u',name:'Test'},{id:'g',name:'Guild'});
test('sandbox runs actual JavaScript and the example supports button and modal events',async()=>{
  const first=normalizeCodeOutput(await runCode(exampleCode,ctx,'example'));
  assert.equal(first.state.visits,1);assert.equal(first.message.controls[0].action,'feedback');
  const modal=normalizeCodeOutput(await runCode(exampleCode,{...ctx,event:{type:'button',action:'feedback'}},'example'));
  assert.equal(modal.modal.fields[0].id,'opinion');
  const submitted=normalizeCodeOutput(await runCode(exampleCode,{...ctx,event:{type:'modal',fields:{opinion:'Great'}}},'example'));
  assert.match(submitted.message.content,/Great/);
});
test('host globals, files, network and credentials are absent even through constructors',async()=>{
  process.env.CODE_TEST_SECRET='never exposed';
  try{const output=await runCode(`function handle(){return {message:{content:JSON.stringify([typeof process,typeof require,typeof fetch,typeof Buffer,typeof global,typeof WebAssembly,(function(){}).constructor('return typeof process')()])}}}`,ctx,'host');
  assert.deepEqual(JSON.parse(output.message.content),Array(7).fill('undefined'));
  await assert.rejects(runCode(`function handle(){return {message:{content:process.env.CODE_TEST_SECRET}}}`,ctx,'host'),/process/);
  }finally{delete process.env.CODE_TEST_SECRET;}
});
test('infinite code and memory exhaustion stop without breaking the next execution',async()=>{
  await assert.rejects(runCode('function handle(){while(true){}}',ctx,'loop'),/interrupt|وقت|توقف/);
  await assert.rejects(runCode('function handle(){const a=[];while(true)a.push("a".repeat(1000000));}',ctx,'memory'));
  assert.equal((await runCode('function handle(){return {message:{content:"OK"}}}',ctx,'healthy')).message.content,'OK');
});
test('fresh executions do not share global memory and a tenant cannot queue duplicate execution',async()=>{
  const source='globalThis.secret=42;function handle(){return {message:{content:"ok"}}}';await runCode(source,ctx,'a');
  const output=await runCode('function handle(){return {message:{content:typeof secret}}}',ctx,'b');assert.equal(output.message.content,'undefined');
  const running=runCode('function handle(){while(true){}}',ctx,'same');
  await assert.rejects(runCode('function handle(){}',ctx,'same'),/تنفيذ جار/);await assert.rejects(running);
});
test('output boundary removes unknown Discord fields and rejects unsafe or invalid output',()=>{
  const result=normalizeCodeOutput({message:{content:'Hi',allowed_mentions:{parse:['everyone']},controls:[{type:'link',label:'Open',url:'https://example.com'}]}});
  const payload=discordCodePayload(result,'session');assert.deepEqual(payload.allowedMentions,{parse:[]});assert.equal(payload.components[0].components[0].style,5);
  for(const value of [{message:{content:'hi'},effects:[{deleteGuild:true}]},{message:{content:'Hi',controls:[{type:'link',label:'Bad',url:'javascript:alert(1)'}]}},{message:{content:'Hi',controls:Array(6).fill({type:'button',action:'x',label:'X'})}},{message:{embeds:[{description:'x'.repeat(4000)},{description:'y'.repeat(4000)}]}}])assert.throws(()=>normalizeCodeOutput(value));
});
test('syntax and malformed return values fail with readable errors',async()=>{
  await assert.rejects(runCode('function handle( {',ctx,'syntax'),/SyntaxError/);
  await assert.rejects(runCode('function handle(){return undefined}',ctx,'invalid'));
});
