import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import session from 'express-session';
import http from 'node:http';
import {createTokenBuckets,clientNetwork,resourcePolicy,createResourceProtection,sessionPaths} from '../lib/resource-protection.js';

const policy=(url,method='POST',headers={})=>resourcePolicy({originalUrl:url,method,get:key=>headers[key]});
test('bounded token buckets resist random-key pressure, refill and reclaim expired entries',()=>{
  let now=0;const b=createTokenBuckets({capacity:2,perSecond:1,maxKeys:512,ttlMs:1000,now:()=>now});
  assert.ok(b.take('one').ok);assert.ok(b.take('one').ok);assert.equal(b.take('one').ok,false);
  for(let i=0;i<100_000;i++)b.take('random-'+i);assert.equal(b.size(),512);
  now=2000;assert.ok(b.take('new').ok);assert.ok(b.size()<=512);
  now=3000;assert.ok(b.take('new').ok);
});
test('IPv6 aliases in one /64 and mapped IPv4 cannot multiply client budgets',()=>{
  assert.equal(clientNetwork('2001:db8::1'),clientNetwork('2001:0db8:0000:0000::2'));
  assert.equal(clientNetwork('::ffff:127.0.0.1'),'127.0.0.1');
  assert.notEqual(clientNetwork('2001:db8:1::1'),clientNetwork('2001:db8:2::1'));
});
test('large bodies are allowed only on existing media routes and never via query/worker/health spoofing',()=>{
  assert.equal(policy('/api/ai/requests').large,true);assert.equal(policy('/api/server-templates/import').limit,29*1024*1024);
  assert.equal(policy('/api/ai/requests/abc/send-message').large,true);
  assert.equal(policy('/api/workspace/100000000000000001/tools/drafts/name','PUT').large,true);
  assert.equal(policy('/api/nope?path=/api/ai/requests').large,false);assert.equal(policy('/api/ai/worker/x/complete').large,false);
  assert.equal(policy('/api/health','GET',{'content-length':'100'}).health,false);
  assert.equal(policy('/api/health','GET').health,true);
  const download=policy('/api/ai/requests/id/attachment','GET');assert.equal(download.heavy,true);assert.equal(download.download,true);assert.equal(download.large,false);
});

async function fixture(t,options={}){
  let parsed=0,mutations=0,acquisitions=0,releases=0,sessionReads=0;const held=[];
  const store={acquire:async()=>{acquisitions++;return {ok:true,release:async()=>{releases++;}};}};
  const guard=createResourceProtection({store:options.store || store,loadUser:async()=>({status:'active'}),...options});
  const app=express();app.use(guard.early);const sessions=new session.MemoryStore(),get=sessions.get.bind(sessions);sessions.get=(...args)=>{sessionReads++;return get(...args);};
  const webSession=session({store:sessions,secret:'test-resource-cookie',resave:false,saveUninitialized:false});
  app.use([...sessionPaths,'/login'],(req,res,next)=>req.resourcePolicy?.health?next():webSession(req,res,next));
  app.post('/denied',(_req,res)=>res.status(403).end('denied'));
  app.get('/login',(req,res)=>{req.session.userId=1;res.json({ok:true});});app.use(guard.admit);
  app.use((req,res,next)=>{parsed++;next();});app.use(express.json({limit:1024,inflate:false}));
  app.post('/api/ai/requests',(_req,res)=>{mutations++;res.json({ok:true});});
  app.get('/api/held',(req,res)=>held.push({req,res}));app.post('/api/heavy',(req,res)=>held.push({req,res}));
  app.get('/api/health',(_req,res)=>res.json({ok:true}));
  app.get('/static-asset',(_req,res)=>res.end('static'));
  app.use((e,_req,res,_next)=>{if(!res.headersSent && !res.destroyed)res.status(e.status || 500).json({error:e.message});});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(async()=>{for(const h of held)h.res.end();server.closeAllConnections();await new Promise(r=>server.close(r));});
  return {url:'http://127.0.0.1:'+server.address().port,guard,held,get sessionReads(){return sessionReads;},get parsed(){return parsed;},get mutations(){return mutations;},get acquisitions(){return acquisitions;},get releases(){return releases;}};
}
test('oversized and compressed requests are rejected before parsing or session/database work',async t=>{
  const s=await fixture(t);const r=await fetch(s.url+'/api/ai/requests',{method:'POST',body:'x'.repeat(1024*1024),headers:{'Content-Type':'application/json','Content-Encoding':'gzip'}});
  assert.equal(r.status,415);assert.equal(s.parsed,0);assert.equal(s.acquisitions,0);
  const huge=await new Promise((resolve,reject)=>{const r=http.request(s.url+'/api/ai/requests',{method:'POST',headers:{'Content-Length':30*1024*1024}},res=>{res.resume();resolve(res.statusCode);});r.on('error',reject);r.end();});
  assert.equal(huge,413);assert.equal(s.parsed,0);assert.equal(s.mutations,0);
});
test('anonymous large uploads are refused before JSON parsing, including chunked bodies',async t=>{
  const s=await fixture(t);const result=await fetch(s.url+'/api/ai/requests',{method:'POST',body:'{"ok":true}',headers:{'Content-Type':'application/json'}});
  assert.equal(result.status,401);assert.equal(s.parsed,0);assert.equal(s.acquisitions,0);
  const chunked=await new Promise((resolve,reject)=>{const req=http.request(s.url+'/api/ai/requests',{method:'POST',headers:{'Content-Type':'application/json','Transfer-Encoding':'chunked'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.write('{');req.end('}');});
  assert.equal(chunked,401);assert.equal(s.mutations,0);
});
test('global concurrency rejects excess work, preserves reserved health checks, and releases after finish',async t=>{
  const s=await fixture(t,{maxActive:1});const first=fetch(s.url+'/api/held');
  for(let i=0;i<50 && !s.held.length;i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(s.held.length,1);const rejected=await fetch(s.url+'/api/held');assert.equal(rejected.status,503);assert.ok(rejected.headers.get('retry-after'));
  assert.equal((await fetch(s.url+'/api/health')).status,200);s.held[0].res.end('done');await first;
  await new Promise(r=>setTimeout(r,5));assert.equal(s.guard.stats().active,0);assert.equal(s.guard.stats().healthActive,0);
});
test('authenticated guard storage failure denies work before parsing, never bypassing protection',async t=>{
  const s=await fixture(t,{store:{acquire:async()=>{throw Error('unavailable');}}});const login=await fetch(s.url+'/login'),cookie=login.headers.get('set-cookie').split(';')[0];const before=s.parsed;
  const r=await fetch(s.url+'/api/ai/requests',{method:'POST',body:'{}',headers:{Cookie:cookie,'Content-Type':'application/json'}});
  assert.equal(r.status,503);assert.equal((await r.json()).code,'RESOURCE_GUARD_UNAVAILABLE');assert.equal(s.parsed,before);assert.equal(s.mutations,0);
});
test('disconnect during an admitted heavy operation retains its lease briefly rather than enabling abort-and-repeat',async t=>{
  const s=await fixture(t,{maxHeavy:1,abortedHoldMs:60});const login=await fetch(s.url+'/login'),cookie=login.headers.get('set-cookie').split(';')[0];
  const req=http.request(s.url+'/api/heavy',{method:'POST',headers:{Cookie:cookie}});req.on('error',()=>{});req.end();
  for(let i=0;i<50 && !s.held.length;i++)await new Promise(r=>setTimeout(r,5));assert.equal(s.held.length,1);req.destroy();
  await new Promise(r=>setTimeout(r,15));assert.equal(s.guard.stats().heavy,1);assert.equal((await fetch(s.url+'/api/heavy',{method:'POST',headers:{Cookie:cookie}})).status,503);
  await new Promise(r=>setTimeout(r,75));assert.equal(s.guard.stats().heavy,0);assert.equal(s.releases,1);
});
test('slow bodies have a bounded deadline and release their local reservation',async t=>{
  const s=await fixture(t,{bodyTimeoutMs:40});const status=await new Promise((resolve,reject)=>{
    const req=http.request(s.url+'/api/held',{method:'GET',headers:{'Content-Length':500,'Content-Type':'application/json'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.write('{');
  });assert.equal(status,408);await new Promise(r=>setTimeout(r,5));assert.equal(s.guard.stats().active,0);
});

test('a downstream rejection closes an unfinished body instead of silently draining an unbounded upload',async t=>{
  const s=await fixture(t);let status;
  await new Promise((resolve,reject)=>{
    const req=http.request(s.url+'/denied',{method:'POST',headers:{'Transfer-Encoding':'chunked'}},res=>{status=res.statusCode;res.resume();});
    const timeout=setTimeout(()=>{req.destroy();reject(Error('connection was not closed'));},1000);
    req.on('error',()=>{});req.on('close',()=>{clearTimeout(timeout);resolve();});req.write('{');
  });assert.equal(status,403);assert.equal(s.parsed,0);
});

test('static assets and health probes do not read a session even with a signed customer cookie',async t=>{
  const s=await fixture(t),r=await fetch(s.url+'/login'),cookie=r.headers.get('set-cookie').split(';')[0];
  await fetch(s.url+'/static-asset',{headers:{Cookie:cookie}});await fetch(s.url+'/api/health',{headers:{Cookie:cookie}});
  assert.equal(s.sessionReads,0);assert.equal(s.acquisitions,0);
});
