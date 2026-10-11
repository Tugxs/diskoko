import crypto from 'node:crypto';
import { workerAuthorized } from './local-ai.js';
import { codeSource,runCode,normalizeCodeOutput } from './code-command-sandbox.js';
import {generatedCommandSource} from './generated-command-source.js';

export function mountCodeAssistant(app,{pool,requireUser,requireWriteAccess,scope,base,contract}) {
  const route=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(error){next(error);}};
  const bad=message=>Object.assign(new Error(message),{status:400,expose:true});
  app.post(`${base}/assist`,requireUser,requireWriteAccess,route(async(req,res)=>{
    const {guild,bot}=await scope(req),prompt=String(req.body.prompt || '').trim(),source=String(req.body.source || '');
    const limit=({starter:20,growth:100,business:300})[req.user.plan] || 0;
    if(!limit)throw bad('مساعد الكود متاح من باقة Starter.');
    if(!prompt || prompt.length>1500 || Buffer.byteLength(source)>24000)throw bad('اكتب طلبًا لا يتجاوز 1500 حرف وكودًا لا يتجاوز 24 KB.');
    const client=await pool.connect();
    try{
      await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`code-ai:${req.user.id}`]);
      const count=(await client.query("SELECT COUNT(*)::int AS total FROM code_command_ai WHERE owner_id=$1 AND created_at>NOW()-INTERVAL '24 hours'",[req.user.id])).rows[0]?.total || 0;
      if(count>=limit)throw bad('وصلت لحد طلبات مساعد الكود اليومية.');
      await client.query("UPDATE code_command_ai SET status='failed',error='انتهت مهلة المساعد. حاول مجددًا.' WHERE owner_id=$1 AND status IN ('pending','processing') AND created_at<NOW()-INTERVAL '10 minutes'",[req.user.id]);
      if((await client.query("SELECT id FROM code_command_ai WHERE owner_id=$1 AND status IN ('pending','processing')",[req.user.id])).rows.length)throw bad('انتظر اكتمال طلب المساعد الحالي.');
      const id=crypto.randomUUID();await client.query('INSERT INTO code_command_ai(id,owner_id,guild_id,bot_user_id,prompt,source) VALUES($1,$2,$3,$4,$5,$6)',[id,req.user.id,guild.id,bot.id,prompt,source]);await client.query('COMMIT');res.status(202).json({id});
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }));
  app.get(`${base}/assist/:id`,requireUser,route(async(req,res)=>{
    const {guild,bot}=await scope(req);
    if(!/^[0-9a-f-]{36}$/.test(req.params.id))throw bad('معرّف غير صالح.');
    const item=(await pool.query('SELECT status,result,error FROM code_command_ai WHERE id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_user_id=$4',[req.params.id,req.user.id,guild.id,bot.id])).rows[0];if(!item)throw bad('الطلب غير موجود.');res.json(item);
  }));
  const worker=(req,res,next)=>workerAuthorized(req)?next():res.status(401).json({error:'غير مصرح'});
  app.post('/api/ai/worker/code-validate',worker,route(async(req,res)=>{
    try{const source=codeSource(generatedCommandSource(req.body.source));const output=normalizeCodeOutput(await runCode(source,{user:{id:'preview',name:'Test'},guild:{id:'preview',name:'Preview'},event:{type:'command'},state:{}},'ai-validation'));res.json({ok:true,source,output});}
    catch(error){res.json({ok:false,error:String(error.message).slice(0,400)+' Use a standalone function handle(ctx) declaration; initial command event has no action.'});}
  }));
  app.get('/api/ai/worker/code-next',worker,route(async(req,res)=>{
    const job=(await pool.query("WITH queued AS (SELECT id FROM code_command_ai WHERE status='pending' OR (status='processing' AND claimed_at<NOW()-INTERVAL '5 minutes') ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE code_command_ai SET status='processing',claimed_at=NOW() WHERE id IN (SELECT id FROM queued) RETURNING id,prompt,source")).rows[0];res.json({request:job?{...job,contract}:null});
  }));
  app.post('/api/ai/worker/code-complete/:id',worker,route(async(req,res)=>{
    if(!/^[0-9a-f-]{36}$/.test(req.params.id))throw bad('معرّف غير صالح.');
    let result=null,error=req.body.error?String(req.body.error).slice(0,500):null;
    if(!error){try{const source=codeSource(generatedCommandSource(req.body.source));normalizeCodeOutput(await runCode(source,{user:{id:'preview',name:'Test'},guild:{id:'preview',name:'Preview'},event:{type:'command'},state:{}},'ai-validation'));result={source,explanation:String(req.body.explanation || '').slice(0,4000)};}catch(e){error=e.message;}}
    await pool.query("UPDATE code_command_ai SET status=$2,result=$3,error=$4 WHERE id=$1 AND status='processing'",[req.params.id,error?'failed':'completed',result,error]);res.json({ok:true});
  }));
}
