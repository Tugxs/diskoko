import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {collectOperations,operationalConditions,advanceIncidents,alertConfiguration,createAlertSender,alertText,createOperationsMonitor} from '../lib/operations.js';
import {managedLoop,safeOperationError,queueConsumer} from '../lib/service-lifecycle.js';

test('a loop never overlaps, awaits in-flight work on stop and never restarts after stop',async()=>{
  let complete,started=0,finished=0;
  const stop=managedLoop('test-drain',async()=>{started++;await new Promise(r=>complete=r);finished++;},{intervalMs:10,immediate:true});
  await new Promise(r=>setTimeout(r,30));assert.equal(started,1);
  let drained=false;const drain=stop().then(()=>drained=true);await new Promise(r=>setImmediate(r));assert.equal(drained,false);
  complete();await drain;await stop.tick();assert.equal(started,1);assert.equal(finished,1);assert.equal(stop.state().running,false);
});
test('loop failures are observable and never print sensitive error messages',async()=>{
  const logs=[];const stop=managedLoop('test-failure',()=>{throw Object.assign(Error('postgres://secret'),{code:'ECONNRESET'});},{intervalMs:1000,log:(...a)=>logs.push(a)});
  await stop.tick();assert.equal(stop.state().failures,1);assert.equal(JSON.stringify(logs).includes('secret'),false);assert.equal(safeOperationError(Error('token')).code,'OPERATION_FAILED');await stop();
});
test('SIGTERM during a pending database claim drains its execution once without claiming another job',async()=>{
  let releaseClaim,releaseExecution,claims=0,executions=0,drained=false;
  const worker=queueConsumer({intervalMs:10,claim:()=>{claims++;return new Promise(r=>releaseClaim=r);},execute:async()=>{executions++;await new Promise(r=>releaseExecution=r);}});
  await new Promise(r=>setImmediate(r));const stopping=worker.stop().then(()=>drained=true);
  releaseClaim({id:'claimed-before-signal'});await new Promise(r=>setImmediate(r));
  assert.equal(drained,false);assert.equal(executions,1);assert.equal(claims,1);
  releaseExecution();await stopping;assert.equal(worker.size,0);assert.equal(claims,1);
});
test('incidents require consecutive observations, survive restarts, deduplicate and emit recovery after confirmation',()=>{
  let s=advanceIncidents(null,{worker:true},{now:100000});assert.equal(s.outbox.length,0);
  s=advanceIncidents(s,{worker:true},{now:120000});assert.equal(s.outbox.length,1);assert.equal(s.outbox[0].type,'incident');
  s=advanceIncidents(JSON.parse(JSON.stringify(s)),{worker:true},{now:140000});assert.equal(s.outbox.length,1);
  s=advanceIncidents(s,{worker:false},{now:150000});assert.equal(s.outbox.length,1);
  s=advanceIncidents(s,{worker:false},{now:170000});assert.equal(s.outbox[1].type,'recovered');assert.equal(s.incidents.worker.active,false);
  for(let i=0;i<100;i++)s=advanceIncidents(s,{worker:i%2===0},{now:300000+i*2000000});
  assert.ok(s.history.length<=50);assert.ok(s.outbox.length<=50);
});
test('worker, queue, memory and scheduler failures are distinct and use bounded thresholds',()=>{
  const s={at:Date.now(),database:'ready',externalWorker:true,worker:{ageSeconds:5,online:true},uptimeSeconds:500,rssBytes:10000000,queue:{pending:0},loops:{}};
  assert.equal(Object.values(operationalConditions(s)).some(Boolean),false);
  assert.equal(operationalConditions({...s,worker:null}).worker,true);
  assert.equal(operationalConditions({...s,worker:{ageSeconds:5,online:false}}).gateway,true);
  assert.equal(operationalConditions({...s,queue:{oldestPendingSeconds:46}}).queue,true);
  assert.equal(operationalConditions({...s,schedules:{overdueSeconds:181}}).schedules,true);
  assert.equal(operationalConditions({...s,worker:{ageSeconds:5,online:true,loops:{poll:{failures:3}}}}).loops,true);
  assert.equal(operationalConditions({...s,worker:{ageSeconds:5,online:true,uptimeSeconds:30},connections:{total:6,stale:6}}).connections,false);
  assert.equal(operationalConditions({...s,worker:{ageSeconds:5,online:true,uptimeSeconds:500},connections:{total:6,stale:6}}).connections,true);
});
test('real aggregate SQL uses database clock, contains no customer data, and handles an empty queue',async()=>{
  const db=new PGlite();try{
    await db.exec(`CREATE TABLE bot_runtime_state(id TEXT,status JSONB,seen_at TIMESTAMPTZ);
      CREATE TABLE discord_jobs(status TEXT,created_at TIMESTAMPTZ,started_at TIMESTAMPTZ,completed_at TIMESTAMPTZ,response_status INT);
      CREATE TABLE scheduled_messages(status TEXT,run_at TIMESTAMPTZ,updated_at TIMESTAMPTZ);
      CREATE TABLE code_project_jobs(status TEXT,run_at TIMESTAMPTZ,claimed_at TIMESTAMPTZ);
      CREATE TABLE customer_role_sync(attempts INT,requested_at TIMESTAMPTZ);
      CREATE TABLE diskoko_giveaways(status TEXT,ends_at TIMESTAMPTZ,next_retry_at TIMESTAMPTZ,announced_at TIMESTAMPTZ);
      CREATE TABLE control_center_jobs(enabled BOOLEAN,status TEXT,due_at TIMESTAMPTZ);
      CREATE TABLE ready_template_module_event_notices(status TEXT,created_at TIMESTAMPTZ);
      CREATE TABLE customer_bot_registry(token_encrypted TEXT,created_at TIMESTAMPTZ,gateway_seen_at TIMESTAMPTZ);
      INSERT INTO bot_runtime_state VALUES('original','{"online":true}',NOW()-INTERVAL '10 seconds');
      INSERT INTO discord_jobs(status,created_at) VALUES('pending',NOW()-INTERVAL '50 seconds');
      INSERT INTO scheduled_messages VALUES('scheduled',NOW()-INTERVAL '5 minutes',NOW());`);
    const pool={query:q=>db.query(typeof q==='string'?q:q.text)};
    let s=await collectOperations(pool,{now:0});assert.equal(s.worker.online,true);assert.ok(s.worker.ageSeconds>=10);assert.equal(s.queue.pending,1);assert.ok(s.schedules.overdueSeconds>=300);
    assert.equal(operationalConditions(s).queue,true);assert.equal(JSON.stringify(s).includes('authorization'),false);
    await db.exec('DELETE FROM discord_jobs');s=await collectOperations(pool);assert.equal(s.queue.oldestPendingSeconds,null);assert.equal(s.queue.pending,0);
  }finally{await db.close();}
});
test('alert delivery rejects wrong guild, disables mentions, and uses deterministic duplicate suppression',async()=>{
  const env={OPS_ALERT_EMAILS:'ops@example.com',SMTP_HOST:'smtp.example.com',SMTP_USER:'ops',SMTP_PASS:'not-real',OPS_ALERT_CHANNEL_ID:'111111111111111111',OPS_ALERT_GUILD_ID:'222222222222222222',DISCORD_BOT_TOKEN:'not-real'};
  assert.equal(alertConfiguration(env).emailReady,true);assert.throws(()=>alertConfiguration({...env,OPS_ALERT_EMAILS:'bad\r\nBcc:secret'}));
  const requests=[],mails=[];const event={id:'some-event',key:'worker',type:'incident',at:Date.now()};
  const sender=createAlertSender(env,{transport:{sendMail:async m=>mails.push(m)},fetchImpl:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({guild_id:env.OPS_ALERT_GUILD_ID})};}});
  await sender.send('email',event);await sender.send('discord',event);await sender.send('discord',event);
  const a=JSON.parse(requests[1].options.body),b=JSON.parse(requests[3].options.body);assert.deepEqual(a.allowed_mentions,{parse:[]});assert.equal(a.nonce,b.nonce);assert.equal(a.enforce_nonce,true);assert.equal(mails[0].messageId,'<some-event@diskoko.com>');
  const wrong=createAlertSender(env,{fetchImpl:async()=>({ok:true,json:async()=>({guild_id:'wrong'})})});await assert.rejects(wrong.send('discord',event),e=>e.code==='ALERT_CHANNEL_SCOPE');
  assert.equal(alertText(event).includes('not-real'),false);
});

test('durable outbox retries only the failed destination, survives replacement and reports recovery',async()=>{
  const db=new PGlite();let at=100000,bad=true,fail=true;const delivered=[];
  await db.exec('CREATE TABLE bot_runtime_state(id TEXT PRIMARY KEY,status JSONB NOT NULL,seen_at TIMESTAMPTZ)');
  const query=(sql,params)=>sql.includes('pg_try_advisory_xact_lock')?Promise.resolve({rows:[{locked:true}]}):db.query(sql,params);
  const pool={query,connect:async()=>({query,release(){}})};
  const sender={config:{emailReady:true,discordReady:true,emails:['ops@example.com'],channel:'111111111111111111'},send:async(channel,event)=>{if(channel==='discord' && fail)throw Error('do not log token');delivered.push({channel,type:event.type});}};
  const options={env:{BOT_GATEWAY_MODE:'external'},now:()=>at,sender,immediate:false,log(){},collect:async()=>({at,database:'ready',externalWorker:true,worker:bad?null:{online:true,ageSeconds:0}})};
  let monitor=createOperationsMonitor(pool,options);
  try{
    await monitor.tick();at+=20000;await monitor.tick();assert.deepEqual(delivered,[{channel:'email',type:'incident'}]);
    let details=await monitor.details();assert.equal(details.journal.outbox.length,1);assert.equal(details.journal.outbox[0].delivery.email.sentAt,at);
    await monitor.stop();monitor=createOperationsMonitor(pool,options);fail=false;at+=60000;await monitor.tick();
    assert.equal(delivered.filter(d=>d.channel==='email').length,1);assert.equal(delivered.filter(d=>d.channel==='discord').length,1);
    bad=false;at+=20000;await monitor.tick();at+=20000;await monitor.tick();
    assert.equal(delivered.filter(d=>d.type==='recovered').length,2);assert.equal((await monitor.details()).journal.outbox.length,0);
    assert.equal(monitor.publicHealth().ok,true);at+=60001;assert.equal(monitor.publicHealth().ok,false);
  }finally{await monitor.stop();await db.close();}
});
