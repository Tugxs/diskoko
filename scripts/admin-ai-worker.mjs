import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';

const site=(process.env.DISKOKO_URL || 'https://diskoko.com').replace(/\/$/,'');
const inference=(process.env.LOCAL_AI_URL || 'http://127.0.0.1:11434').replace(/\/$/,'');
const provider=process.env.LOCAL_AI_PROVIDER || 'llama';
const model=process.env.AI_MODEL || 'Qwen3-4B-Q4_K_M.gguf';
const token=process.env.AI_WORKER_TOKEN || (process.env.AI_WORKER_TOKEN_FILE?readFileSync(process.env.AI_WORKER_TOKEN_FILE,'utf8').trim():'');
let stopping=false;process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
async function request(url,options={}){const res=await fetch(url,{...options,signal:AbortSignal.timeout(180000)});if(!res.ok)throw Error('HTTP '+res.status);return res.json();}
export async function answerAdminQuestion(job,generate){
 const result=await generate([{role:'system',content:job.contract},{role:'user',content:JSON.stringify({question:job.prompt,facts:job.facts})}]);
 if(typeof result!=='string' || !result.trim())throw Error('Empty model response');return result.trim().slice(0,1800);
}
async function generate(messages){
 if(provider==='ollama'){const result=await request(inference+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,messages,stream:false,options:{num_predict:600,temperature:0.2}})});return result.message?.content;}
 const result=await request(inference+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,messages,max_tokens:600,temperature:0.2,stream:false})});return result.choices?.[0]?.message?.content;
}
if(process.env.ADMIN_WORKER_TEST!=='1'){
 if(!token)throw Error('Configure AI_WORKER_TOKEN or AI_WORKER_TOKEN_FILE.');
 console.log('Diskoko administration assistant worker started.');
 while(!stopping){try{
  await request(inference+(provider==='ollama'?'/api/tags':'/health'));
  const {request:job}=await request(site+'/api/ai/worker/admin-next',{headers:{Authorization:'Bearer '+token}});
  if(!job){await delay(3000);continue;}
  let answer='';try{answer=await answerAdminQuestion(job,generate);}catch(error){console.error('Administration model:',error.message);}
  await request(site+'/api/ai/worker/admin-complete/'+job.id,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({answer,claim_token:job.claim_token})});
  console.log('Administration question completed.');
 }catch(error){console.error('Administration worker connection:',error.message);await delay(5000);}}
}
