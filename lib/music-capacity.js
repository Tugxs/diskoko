// Reserve before the first asynchronous Discord call, so concurrent joins cannot
// all observe the same free slot or join the same guild/bot twice.
export function createMusicAdmission(sessions,readLimit=()=>process.env.MUSIC_MAX_SESSIONS){
 const pending=new Set();
 return {
  reserve(key){
   const raw=readLimit(),limit=raw===undefined?3:Number(raw);
   if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('إعداد سعة الموسيقى غير صالح. راجع الإدارة.');
   if(pending.has(key))throw Error('جارٍ بدء جلسة لهذا البوت. انتظر اكتمال الاتصال.');
   if(sessions.size+pending.size>=limit)throw Error('مشغّل الموسيقى مشغول حاليًا. انتظر انتهاء جلسة صوتية أخرى ثم حاول.');
   pending.add(key);let released=false;
   return ()=>{if(!released){released=true;pending.delete(key);}};
  },
  snapshot:()=>({active:sessions.size,starting:pending.size})
 };
}

export function createMusicResolutionBudget(limit=2){
 const active=new Set();
 return async(key,work)=>{
  if(active.size>=limit || active.has(key))throw Object.assign(Error('تجهيز مصادر الموسيقى مشغول حاليًا. انتظر قليلًا ثم حاول.'),{code:'MUSIC_BUSY',status:429,expose:true});
  active.add(key);try{return await work();}finally{active.delete(key);}
 };
}
