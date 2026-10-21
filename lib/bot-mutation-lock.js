import {BoundedDatabasePool} from './database.js';
const locks=new WeakMap();
function lockPool(pool){
  if(!pool.options?.connectionString)return pool;
  if(!locks.has(pool))locks.set(pool,new BoundedDatabasePool({...pool.options,max:2,application_name:'diskoko-bot-mutations',idleTimeoutMillis:1000,allowExitOnIdle:true},{maxWaiting:4}));
  return locks.get(pool);
}
export async function stopBotMutationLocks(pool){const own=locks.get(pool);if(own){locks.delete(pool);await own.end();}}
// Serialize command registration and disconnect across web processes. Release
// only after the async handler settles, never merely because the browser closes.
export function botMutationHandler(pool,handler){
  return async(req,res,next)=>{
    if(['GET','HEAD','OPTIONS'].includes(req.method||'GET'))return handler(req,res,next);
    const guild=String(req.body?.guildId || req.query?.guildId || ''),bot=String(req.params?.botId || '');
    if(!/^\d{17,20}$/.test(guild) || !/^\d{17,20}$/.test(bot))return handler(req,res,next);
    let client,locked=false;
    const key=`bot-mutation:${guild}:${bot}`;
    try{
      client=await lockPool(pool).connect();
      locked=(await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',[key])).rows[0]?.locked===true;
      if(!locked)return res.status(409).json({error:'عملية أخرى تعمل على أوامر هذا البوت. انتظر اكتمالها وحدّث الحالة قبل المحاولة.',code:'BOT_MUTATION_BUSY'});
      await handler(req,res,next);
    }catch(error){next(error);}
    finally{
      if(client){
        let discard=false;
        if(locked)try{await client.query('SELECT pg_advisory_unlock(hashtext($1))',[key]);}catch{discard=true;}
        client.release(discard);
      }
    }
  };
}
