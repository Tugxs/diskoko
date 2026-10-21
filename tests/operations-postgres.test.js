import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import pg from 'pg';
import {createOperationsMonitor} from '../lib/operations.js';

test('real web process readiness, protected monitoring, SIGTERM drain and deployment-generation fencing',{timeout:60000},async t=>{
  if(!process.env.RESOURCE_TEST_DATABASE_URL || process.platform==='win32'){t.skip('Linux disposable PostgreSQL required; mandatory in CI');return;}
  const admin=new pg.Pool({connectionString:process.env.RESOURCE_TEST_DATABASE_URL});
  const name='operations_'+randomUUID().replaceAll('-','');let child,pool;
  await admin.query('CREATE DATABASE "'+name+'"');const url=new URL(process.env.RESOURCE_TEST_DATABASE_URL);url.pathname='/'+name;
  t.after(async()=>{if(child && child.exitCode===null){child.kill('SIGKILL');await once(child,'exit');}if(pool)await pool.end();await admin.query('DROP DATABASE IF EXISTS "'+name+'" WITH (FORCE)');await admin.end();});
  const env={...process.env,NODE_ENV:'test',DATABASE_URL:url.toString(),DB_SCHEMA_MODE:'startup',DB_TLS_MODE:'local',
    PORT:'0',BASE_URL:'http://localhost',FRONTEND_URL:'http://localhost',BOT_GATEWAY_MODE:'external',DISCORD_REST_MODE:'worker',
    SESSION_SECRET:randomUUID(),ENCRYPTION_KEY:randomUUID(),DISCORD_CLIENT_ID:randomUUID(),DISCORD_CLIENT_SECRET:randomUUID(),DISCORD_BOT_TOKEN:randomUUID(),
    SMTP_HOST:'',SMTP_USER:'',SMTP_PASS:'',OPS_ALERT_EMAILS:'',OPS_ALERT_CHANNEL_ID:'',OPS_DISCORD_WEBHOOK_URL:''};
  child=spawn(process.execPath,['server.js'],{env,stdio:['ignore','pipe','pipe']});
  let output='';const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Web startup deadline')),30000);child.stdout.on('data',b=>{output+=b;const m=/diskoko running on (\d+)/.exec(output);if(m){clearTimeout(timer);resolve(Number(m[1]));}});child.once('exit',code=>{clearTimeout(timer);reject(Error('Web exited before readiness: '+code));});child.stderr.resume();});
  const base='http://127.0.0.1:'+port;
  const health=await fetch(base+'/api/health');assert.equal(health.status,200);const body=await health.json();assert.equal(body.database,'ready');assert.equal(body.bot.online,false);
  const operations=await fetch(base+'/api/operations/health');assert.equal(operations.status,503);assert.deepEqual(Object.keys(await operations.json()).sort(),['checkedAt','ok']);
  assert.equal((await fetch(base+'/api/admin/operations')).status,401);
  assert.equal((await fetch(base+'/api/admin/operations/test',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
  const exited=once(child,'close');child.kill('SIGTERM');const [code,signal]=await exited;assert.equal(signal,null);assert.equal(code,0);assert.match(output,/Web service drained/);
  pool=new pg.Pool({connectionString:url.toString()});
  await pool.query("INSERT INTO bot_runtime_state(id,status) VALUES('original',$1) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status",[{runtimeId:'replacement',online:true}]);
  const removed=await pool.query("DELETE FROM bot_runtime_state WHERE id='original' AND status->>'runtimeId'=$1",['retired']);assert.equal(removed.rowCount,0);
  await pool.query("DELETE FROM bot_runtime_state WHERE id='ops:journal:v1'");
  let at=100000,bad=true;const deliveries=[];const opts={env:{BOT_GATEWAY_MODE:'external'},now:()=>at,immediate:false,log(){},sender:{config:{emails:[],emailReady:true,discordReady:true},send:async(channel,event)=>deliveries.push([channel,event.id])},collect:async()=>({at,database:'ready',externalWorker:true,worker:bad?null:{online:true,ageSeconds:0}})};
  const a=createOperationsMonitor(pool,opts),b=createOperationsMonitor(pool,opts);
  try{await a.tick();at+=20000;await Promise.all([a.tick(),b.tick()]);assert.equal(deliveries.length,2);assert.equal(new Set(deliveries.map(([,id])=>id)).size,1);
    bad=false;at+=20000;await a.tick();at+=20000;await b.tick();assert.equal(deliveries.length,4);
  }finally{await a.stop();await b.stop();}
});
