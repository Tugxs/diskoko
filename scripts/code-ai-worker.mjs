import {generateCodeProposal} from '../lib/code-assistant-generation.js';
import {setTimeout as delay} from 'node:timers/promises';
const site=(process.env.DISKOKO_URL || 'https://diskoko.com').replace(/\/$/,''),inference=(process.env.LOCAL_AI_URL || 'http://127.0.0.1:11434').replace(/\/$/,''),token=process.env.AI_WORKER_TOKEN;
if(!token)throw new Error('AI_WORKER_TOKEN required');
let stopping=false;process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
async function request(url,options={}){const r=await fetch(url,{signal:AbortSignal.timeout(120000),...options});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();}
while(!stopping){try{
  const {request:job}=await request(`${site}/api/ai/worker/code-next`,{headers:{Authorization:`Bearer ${token}`}});
  if(!job){await delay(5000);continue;}
  let result;
  try{
    result=await generateCodeProposal({prompt:job.prompt,source:job.source,contract:job.contract,inference,model:process.env.AI_MODEL,validate:source=>request(`${site}/api/ai/worker/code-validate`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({source})})});
  }catch{result={error:'تعذر توليد مسودة كود. راجع تشغيل النموذج المحلي أو وضّح الطلب.'};}
  await request(`${site}/api/ai/worker/code-complete/${job.id}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(result)});
  console.log('Code draft completed',job.id);
}catch(error){console.error('Code AI worker:',error.message);await delay(5000);}}
