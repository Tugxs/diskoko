export function createAudioManagerCache({build,dispose,timeoutMs=15000,cooldownMs=30000,now=Date.now}){
 const entries=new WeakMap(),failures=new WeakMap();
 const active=manager=>Boolean(manager.players?.size || manager.connections?.size);
 function remove(client,expected,{force=false}={}){
  const entry=entries.get(client);if(!entry || expected && entry.manager!==expected || !force && active(entry.manager))return false;
  entries.delete(client);entry.cancel?.();dispose(entry.manager);return true;
 }
 async function get(client){
  let entry=entries.get(client);
  if(entry?.settled && !entry.manager.getIdealNode()){
   if(!remove(client,entry.manager))throw Error('خادم الصوت يعيد الاتصال؛ لن نقطع الجلسات الأخرى. حاول بعد قليل.');
   entry=null;
  }
  if(entry)return entry.ready;
  if((failures.get(client)||0)>now())throw Error('خادم الموسيقى غير متاح مؤقتًا. انتظر قليلًا قبل إعادة المحاولة.');
  const {manager,start}=build(client);entry={manager,settled:false};
  entries.set(client,entry);
  entry.ready=new Promise((resolve,reject)=>{
   const cleanup=()=>{clearTimeout(timer);manager.off('ready',check);};
   const check=()=>{if(!manager.getIdealNode())return;cleanup();entry.settled=true;entry.cancel=null;failures.delete(client);resolve(manager);};
   entry.cancel=()=>{cleanup();reject(Error('أُغلق اتصال خادم الموسيقى.'));};
   const timer=setTimeout(()=>{cleanup();if(entries.get(client)===entry){entries.delete(client);failures.set(client,now()+cooldownMs);}dispose(manager);reject(Error('خادم الموسيقى لا يستجيب الآن. حاول بعد قليل.'));},timeoutMs);
   manager.on('ready',check);
   try{start();check();}catch(error){cleanup();entries.delete(client);dispose(manager);failures.set(client,now()+cooldownMs);reject(error);}
  });
  return entry.ready;
 }
 return {get,invalidate:(client,manager)=>remove(client,manager),stop:client=>{failures.delete(client);return remove(client,null,{force:true});}};
}

export async function readAudioWithRecovery(cache,client,read){
 for(let attempt=0;attempt<2;attempt++){
  const manager=await cache.get(client);
  try{return await read(manager);}catch(error){
   const retryable=[404,502,503,504].includes(Number(error?.status)) || ['TimeoutError','AbortError'].includes(error?.name);
   if(attempt || !retryable || !cache.invalidate(client,manager))throw error;
  }
 }
}
