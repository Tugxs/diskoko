import test from 'node:test';
import assert from 'node:assert/strict';
import {mountCodeAssistant} from '../lib/code-command-ai.js';

function fixture(){const routes=new Map(),app=Object.fromEntries(['get','post'].map(method=>[method,(path,...handlers)=>routes.set(`${method} ${path}`,handlers)]));const queries=[];mountCodeAssistant(app,{pool:{query:async(sql,p)=>{queries.push({sql,p});return {rows:[]};}},requireUser(){},requireWriteAccess(){},scope:async()=>({guild:{id:'g'},bot:{id:'b'}}),base:'/code',contract:'contract'});return {routes,queries};}
test('AI validation repairs model shorthand but still executes in isolation and rejects broken code',async()=>{
  const {routes}=fixture();let result;
  const handler=routes.get('post /api/ai/worker/code-validate').at(-1);
  await handler({body:{source:'handle(ctx){return {message:{content:typeof process}}}'}},{json:v=>{result=v;}},e=>{throw e;});
  assert.equal(result.ok,true);assert.match(result.source,/^function handle/);assert.equal(result.output.message.content,'undefined');
  await handler({body:{source:'function handle(){while(true){}}'}},{json:v=>{result=v;}},e=>{throw e;});assert.equal(result.ok,false);
});
test('worker code routes deny requests without the worker credential',()=>{
  const {routes}=fixture();let status,called=false;routes.get('post /api/ai/worker/code-validate')[0]({get:()=>''},{status:v=>{status=v;return {json(){}};}},()=>{called=true;});assert.equal(status,401);assert.equal(called,false);
});
