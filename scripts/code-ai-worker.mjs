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
    const messages=[{role:'system',content:job.contract},{role:'user',content:JSON.stringify({request:job.prompt,currentSource:job.source})}];
    for(let attempt=0;attempt<3;attempt++){
      const response=await request(`${inference}/v1/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:process.env.AI_MODEL || 'Qwen3-4B-Q4_K_M.gguf',messages,max_tokens:2200,temperature:0.1,response_format:{type:'json_object'},chat_template_kwargs:{enable_thinking:false}})});
      const raw=response.choices[0].message.content;
      try{
        result=JSON.parse(raw.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
        if(result.project?.format==='diskoko-project@1')result.source=JSON.stringify(result.project);
        if(result.source && typeof result.source==='object')result.source=JSON.stringify(result.source);
        if(typeof result.source!=='string')throw new Error('Missing code');
        const validation=await request(`${site}/api/ai/worker/code-validate`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({source:result.source})});
        if(!validation.ok)throw new Error(validation.error);
        result.source=validation.source;
        break;
      }catch(error){if(attempt===2)throw error;messages.push({role:'assistant',content:raw},{role:'user',content:`Repair the code. Validation failed: ${error.message}. Return JSON with valid source and explanation only.`});}
    }
  }catch{result={error:'تعذر توليد مسودة كود. راجع تشغيل النموذج المحلي أو وضّح الطلب.'};}
  await request(`${site}/api/ai/worker/code-complete/${job.id}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(result)});
  console.log('Code draft completed',job.id);
}catch(error){console.error('Code AI worker:',error.message);await delay(5000);}}
