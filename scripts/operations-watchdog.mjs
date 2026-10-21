import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createAlertSender} from '../lib/operations.js';

export async function probeSite(base,{fetchImpl=fetch}={}) {
  const url=new URL(base);
  if(url.protocol!=='https:' || url.username || url.password)throw Error('Watchdog requires an HTTPS origin');
  const checks=[];
  for(const path of ['/api/health','/api/operations/health']){
    try{const r=await fetchImpl(new URL(path,url),{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});
      const text=await r.text();if(text.length>32000)throw Error('Invalid health response');
      const data=JSON.parse(text);checks.push(r.status===200 && data.ok===true);
    }catch{checks.push(false);}
  }
  return checks.every(Boolean);
}
export async function watchdogTick(previous,healthy,{sender,now=Date.now(),test=false}={}) {
  const old=previous?.version===1 && ['healthy','unhealthy'].includes(previous.phase)?previous:null;
  const phase=healthy?'healthy':'unhealthy';
  const changed=old?.phase!==phase;
  const state={version:1,phase,at:now,event:old?.event||null};
  // A first healthy observation has nothing to announce. Outages/recoveries are durable.
  if(test || (changed && (!healthy || old)) || (!healthy && now-(old?.event?.at||0)>1800000)){
    state.event={id:crypto.randomUUID(),key:'site',type:test?'test':healthy?'recovered':'incident',at:now,delivery:{email:false,discord:false}};
  }
  const event=state.event;
  if(event)for(const channel of ['email','discord'])if(event.delivery?.[channel]!==true){
    try{await sender.send(channel,event);event.delivery[channel]=true;}
    catch{console.error('Watchdog notification failed',{channel});}
  }
  return state;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const sender=createAlertSender(process.env);
  if(!sender.config.emailReady && !sender.config.discordReady)throw Error('At least one operations alert transport must be configured');
  let previous;
  try{const raw=await readFile('.operations-state/state.json','utf8');if(raw.length<10000)previous=JSON.parse(raw);}catch{}
  const first=await probeSite(process.env.OPS_MONITOR_URL||'https://diskoko.com');
  // Confirm a failing probe rather than notifying on a single transient response.
  const healthy=first || await probeSite(process.env.OPS_MONITOR_URL||'https://diskoko.com');
  const state=await watchdogTick(previous,healthy,{sender,test:process.env.OPS_MONITOR_TEST==='true'});
  await mkdir('.operations-state',{recursive:true});await writeFile('.operations-state/state.json',JSON.stringify(state));
  console.log('External observation',{healthy,notifications:state.event?.delivery||null});
  // An outage is an observation, not a failed code check. Marking this check failed
  // could prevent the corrective release from deploying under Render checksPass.
  if(!healthy)console.error('Production needs attention; see operations notifications.');
}
