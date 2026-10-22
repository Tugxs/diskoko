// Deliberately loopback-only. No production database, Discord or YouTube access.
import fs from 'node:fs/promises';
import os from 'node:os';
import {performance,monitorEventLoopDelay} from 'node:perf_hooks';
import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {spawnSync} from 'node:child_process';
import express from 'express';
import pg from 'pg';
import ffmpeg from 'ffmpeg-static';
import {createAudioResource,StreamType} from '@discordjs/voice';
import {runCode} from '../lib/code-command-sandbox.js';
import {renderMusicCard} from '../lib/music-card.js';
import {createResourceProtection} from '../lib/resource-protection.js';
import {createResourceBudgetStore,migrateResourceBudgets} from '../lib/resource-budget-store.js';
import {mountDashboardTools} from '../lib/dashboard-tools.js';
import {disposeAudioResource} from '../lib/audio-resource-cleanup.js';

const pause=ms=>new Promise(r=>setTimeout(r,ms)),args=process.argv.slice(2),option=(key,fallback)=>args.find(a=>a.startsWith('--'+key+'='))?.split('=').slice(1).join('=') ?? fallback;
const component=option('component','all'),output=option('output','capacity-results.json');
const report={at:new Date().toISOString(),node:process.version,platform:process.platform,cpu:os.cpus()[0]?.model,logicalCpus:os.availableParallelism(),hostRamMiB:Math.round(os.totalmem()/1048576),scope:'Isolated component/synthetic API measurements; not Render production capacity or live Discord acceptance',results:[]};
const percentile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(sorted.length*p)-1)] ?? 0;};
async function measure(name,task){
 console.log(name+': starting');
 const lag=monitorEventLoopDelay({resolution:10});lag.enable();let peak=process.memoryUsage().rss;
 const sample=setInterval(()=>{peak=Math.max(peak,process.memoryUsage().rss);},50);const started=performance.now(),cpu=process.cpuUsage();
 try{const result=await task();const used=process.cpuUsage(cpu);report.results.push({name,...result,wallMs:Math.round(performance.now()-started),parentCpuMs:Math.round((used.user+used.system)/1000),parentPeakRssMiB:Math.round(peak/1048576),eventLoopP95Ms:Number((lag.percentile(95)/1e6).toFixed(2))});console.log(name+': complete');}
 finally{clearInterval(sample);lag.disable();}
}
async function codeBench(){
 const context={user:{id:'u',name:'Fixture'},guild:{id:'g',name:'Fixture'},event:{type:'command'},state:{}};
 for(const concurrency of [1,2,8])await measure('code-'+concurrency,async()=>{
  const times=[],errors={};let ok=0;
  for(let wave=0;wave<6;wave++)await Promise.all(Array.from({length:concurrency},async(_,i)=>{const start=performance.now();try{await runCode('function handle(c){let n=0;for(let i=0;i<10000;i++)n+=i;return {message:{content:"OK "+n}}}',context,'capacity-'+wave+'-'+i);ok++;times.push(performance.now()-start);}catch(e){errors[e.code || 'error']=(errors[e.code || 'error'] || 0)+1;}}));
  return {concurrency,offered:concurrency*6,ok,errors,p50Ms:Math.round(percentile(times,.5)),p95Ms:Math.round(percentile(times,.95)),note:'Fresh real QuickJS processes; parent CPU/RSS exclude child processes.'};
 });
 await measure('code-timeout-recovery',async()=>{let interrupted=false;try{await runCode('function handle(){while(true){}}',context,'capacity-loop');}catch{interrupted=true;}const result=await runCode('function handle(){return {message:{content:"recovered"}}}',context,'capacity-recovery');if(!interrupted||result.message.content!=='recovered')throw Error('Sandbox recovery failed');return {interrupted,recovered:true};});
}
async function mediaBench(){
 await measure('cards-serial',async()=>{const times=[];for(let i=0;i<20;i++){const start=performance.now();await renderMusicCard({title:'Capacity fixture '+i,color:'#8659e6'},null,{volume:.8});times.push(performance.now()-start);}return {cards:20,p50Ms:Math.round(percentile(times,.5)),p95Ms:Math.round(percentile(times,.95)),note:'Real Sharp render without external artwork downloads.'};});
 const sample=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','65','-ac','2','-f','mp3','pipe:1'],{maxBuffer:5*1024*1024,windowsHide:true});if(sample.status!==0)throw Error('Fixture audio generation failed');
 for(const scenario of [{streams:1,mixed:false},{streams:3,mixed:false},{streams:3,mixed:true}]){const {streams,mixed}=scenario;await measure('audio-'+streams+(mixed?'-mixed':''),async()=>{
  const inputs=Array.from({length:streams},()=>Readable.from(sample.stdout)),resources=inputs.map(input=>createAudioResource(input,{inputType:StreamType.Arbitrary,inlineVolume:true}));const packets=resources.map(()=>0),late=[],errors=[];resources.forEach(r=>r.playStream.on('error',e=>errors.push(e.message)));
  const start=performance.now(),background=new Set(),work={code:0,cards:0,errors:0};let ticks=0,codeTimer,cardTimer;
  const backgroundTask=task=>{const p=task.catch(()=>work.errors++);background.add(p);p.finally(()=>background.delete(p));};
  if(mixed){codeTimer=setInterval(()=>backgroundTask(runCode('function handle(){let n=0;for(let i=0;i<10000;i++)n+=i;return {message:{content:String(n)}}}',{},'mixed-'+ticks).then(()=>work.code++)),1000);cardTimer=setInterval(()=>backgroundTask(renderMusicCard({title:'Mixed fixture'},null,{volume:.8}).then(()=>work.cards++)),5000);}
  try{while(performance.now()-start<(mixed?60000:30000)){ticks++;await pause(Math.max(0,start+ticks*20-performance.now()));late.push(Math.max(0,performance.now()-(start+ticks*20)));for(let i=0;i<resources.length;i++)if(resources[i].playStream.read())packets[i]++;}}
  finally{clearInterval(codeTimer);clearInterval(cardTimer);inputs.forEach(input=>input.destroy());resources.forEach(disposeAudioResource);await Promise.all(background);}
  if(errors.length)throw Error('Audio path failed');
  return {streams,mixed,background:work,ticks,packets,packetAvailability:packets.map(n=>Number((n/ticks).toFixed(4))),timerP95LateMs:Number(percentile(late,.95).toFixed(2)),errors,note:'Real FFmpeg/volume/Opus path at 50 packets/s. No Discord UDP, encryption, voice connection or YouTube. Parent CPU/RSS exclude FFmpeg/QuickJS children.'};
 });}
}
async function httpBench(){
 const value=process.env.RESOURCE_TEST_DATABASE_URL;if(!value){report.results.push({name:'http-postgres',skipped:true,reason:'Disposable loopback PostgreSQL required; CI runs this component.'});return;}
 const url=new URL(value);if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||process.env.NODE_ENV==='production')throw Error('Capacity test refuses a non-loopback/production database');
 const schema='capacity_'+randomUUID().replaceAll('-',''),admin=new pg.Pool({connectionString:value}),pool=new pg.Pool({connectionString:value,max:8,options:'-c search_path='+schema});let server,store;
 try{
  await admin.query('CREATE SCHEMA '+schema);await migrateResourceBudgets(pool);
  console.log('Disposable resource schema ready');
  await pool.query(`CREATE TABLE scheduled_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT,guild_id TEXT,channel_id TEXT,content TEXT,content_kind TEXT DEFAULT 'text',run_at TIMESTAMPTZ,repeat TEXT,timezone TEXT,status TEXT,last_error TEXT,recurrence_day INT,updated_at TIMESTAMPTZ DEFAULT NOW(),message_id TEXT,bot_user_id TEXT,command_name TEXT);
   INSERT INTO scheduled_messages(user_id,guild_id,channel_id,content,run_at,repeat,timezone,status) SELECT owner::bigint,'111111111111111111','222222222222222222','Announcement fixture '||n,NOW()+n*INTERVAL '1 minute','once','UTC',CASE WHEN n%4=0 THEN 'sent' ELSE 'scheduled' END FROM generate_series(1,120) owner CROSS JOIN generate_series(1,500) n;
   CREATE INDEX scheduled_messages_overview ON scheduled_messages(user_id,guild_id,run_at) WHERE status='scheduled';ANALYZE scheduled_messages;`);
  console.log('Synthetic schedule data ready');
  store=createResourceBudgetStore(pool);const guard=createResourceProtection({store,loadUser:async()=>({status:'active'})}),app=express();app.set('trust proxy','loopback');app.use(guard.early);
  // Authentication is a fixture; actual admission and schedule handler/SQL are used.
  app.use((req,_res,next)=>{req.user={id:Number(req.get('x-capacity-owner')) || 1};req.session={userId:req.user.id};next();});app.use(guard.admit);
  mountDashboardTools(app,{pool,requireUser:(_q,_s,next)=>next(),requireWriteAccess:(_q,_s,next)=>next(),authorizedGuild:async()=>({id:'111111111111111111'}),audit:async()=>{},entitlementsFor:()=>({}),requirePlanCapacity:async()=>{},discordBotFetch:async()=>{throw Error('No external requests allowed');}});
  app.get('/api/health',(_req,res)=>res.json({ok:true}));app.use((e,_req,res,_next)=>res.status(e.status || 500).json({error:'Capacity fixture error'}));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
  for(const stage of [{rate:5,seconds:10},{rate:10,seconds:10},{rate:20,seconds:10},{rate:40,seconds:10},{rate:80,seconds:10},{rate:10,seconds:60}]){const {rate,seconds}=stage;await measure('http-'+rate+(seconds===60?'-recovery-soak':''),async()=>{
   const start=performance.now(),pending=new Set(),times=[],statuses={};let dropped=0,number=0;
   while(performance.now()-start<seconds*1000){await pause(Math.max(0,start+number*1000/rate-performance.now()));const n=number++;if(pending.size>=64){dropped++;continue;}
    const task=(async()=>{const began=performance.now();try{const response=await fetch(base+'/api/workspace/111111111111111111/tools/schedules?limit=20',{headers:{'x-capacity-owner':String(n%120+1),'x-forwarded-for':'192.0.2.'+(n%120+1)},signal:AbortSignal.timeout(5000)});await response.text();statuses[response.status]=(statuses[response.status] || 0)+1;times.push(performance.now()-began);}catch{statuses.network=(statuses.network || 0)+1;}})();pending.add(task);task.finally(()=>pending.delete(task));
   }
   await Promise.all(pending);const health=await fetch(base+'/api/health');await health.text();if(health.status!==200 || statuses[500] || statuses.network)throw Error('HTTP load caused server/network failure');return {targetRps:rate,seconds,offered:number,statuses,dropped,p50Ms:Math.round(percentile(times,.5)),p95Ms:Math.round(percentile(times,.95)),p99Ms:Math.round(percentile(times,.99)),healthStatus:health.status,protection:guard.stats(),note:'Real schedule list SQL and shared resource leases; 120 synthetic owners/60,000 rows. Fixture authentication, local DB/network, no Discord.'};
  });}
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}store?.close();await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
}
try{if(['all','code'].includes(component))await codeBench();if(['all','media'].includes(component))await mediaBench();if(['all','http'].includes(component))await httpBench();await fs.writeFile(output,JSON.stringify(report,null,2));console.log('Wrote '+output);}
catch(error){console.error(error.message);process.exitCode=1;}
