import {isIP} from 'node:net';
import {createHash} from 'node:crypto';

const MiB=1024*1024;
export const sessionPaths=['/api','/auth','/admin','/admin-login','/admin-console.20260921.js'];
export function clientNetwork(value){
  let ip=String(value || 'unknown').toLowerCase().split('%')[0];
  if(ip.startsWith('::ffff:') && isIP(ip.slice(7))===4)return ip.slice(7);
  if(isIP(ip)!==6)return ip;
  const [left,right='']=ip.split('::'),a=left?left.split(':'):[],b=right?right.split(':'):[];
  return [...a,...Array(Math.max(0,8-a.length-b.length)).fill('0'),...b].slice(0,4).map(s=>parseInt(s || '0',16).toString(16)).join(':')+'::/64';
}

// Fixed upper bound, full-key expiry, no per-path/user-controlled key cardinality.
export function createTokenBuckets({capacity,perSecond,maxKeys=10_000,ttlMs=300_000,now=Date.now}={}){
  if(!Number.isFinite(capacity) || capacity<=0 || !Number.isFinite(perSecond) || perSecond<=0 || !Number.isInteger(maxKeys) || maxKeys<1 || !Number.isFinite(ttlMs) || ttlMs<1)throw Error('Invalid bounded rate policy');
  const entries=new Map();let cursor=entries.keys();
  function take(key,cost=1){
    const at=now();
    for(let n=0;n<24;n++){let item=cursor.next();if(item.done){cursor=entries.keys();break;}const old=entries.get(item.value);if(old && at-old.at>=ttlMs)entries.delete(item.value);}
    let item=entries.get(key);
    if(!item){if(entries.size>=maxKeys)return {ok:false,retry:Math.ceil(ttlMs/1000),full:true};item={tokens:capacity,at};entries.set(key,item);}
    item.tokens=Math.min(capacity,item.tokens+Math.max(0,at-item.at)*perSecond/1000);item.at=at;
    if(item.tokens<cost)return {ok:false,retry:Math.max(1,Math.ceil((cost-item.tokens)/perSecond))};
    item.tokens-=cost;return {ok:true};
  }
  return {take,size:()=>entries.size};
}

export function boundedRateLimit(max=80,windowMs=60_000){
  const bucket=createTokenBuckets({capacity:max,perSecond:max/(windowMs/1000),ttlMs:Math.max(300_000,windowMs*2)});
  return (req,res,next)=>{const result=bucket.take(clientNetwork(req.ip));if(!result.ok)return reject(res,429,'REQUEST_RATE_LIMIT',result.retry);next();};
}

export function resourcePolicy(req){
  const path=String(req.originalUrl || req.url || '').split('?')[0],write=!['GET','HEAD','OPTIONS'].includes(req.method);
  const worker=/^\/api\/ai\/worker\//.test(path);
  const large=write && (req.method==='PUT' && /^\/api\/workspace\/\d{17,20}\/tools\/drafts\/[a-zA-Z0-9_-]+$/.test(path) || req.method==='POST' &&
    (/^\/api\/workspace\/\d{17,20}\/tools\/structure\/review$/.test(path) || /^\/api\/ai\/requests\/[^/]+\/(launch-interactive|send-message|create-scheduled-event)$/.test(path) ||
    ['/api/server-templates/import','/api/ai/requests','/api/change-sets'].includes(path) || /^\/api\/workspace\/\d{17,20}\/(ready-templates|standalone-modules)\/review$/.test(path)));
  const api=path.startsWith('/api/'),download=api && !write && /\/(attachment|export|download|transcript|archive|image)(\/|$)/.test(path);
  const heavy=api && (write || download) && !worker && !['/api/logout','/api/webhooks/billing'].includes(path);
  const group=download?'download':/\/code-commands\//.test(path)?'code':path==='/api/ai/requests'?'ai':large?'media':'write';
  const bodyless=(!req.get('content-length') || req.get('content-length')==='0') && !req.get('transfer-encoding');
  const cleanup=req.method==='DELETE' || /\/(cancel|stop|pause)$/.test(path);
  return {path,api,worker,heavy,large,download,cleanup,group,rate:group==='ai'?12:['code','download'].includes(group)?30:group==='media'?12:60,limit:large?29*MiB:512*1024,bytes:req.get('content-length')==null?(large?29*MiB:0):Number(req.get('content-length')),health:req.method==='GET' && path==='/api/health' && bodyless};
}

function closeUnreadBody(res){
  const req=res.req;if(req && !req.resourceClosingBody && !req.complete && (Number(req.headers['content-length'])>0 || req.headers['transfer-encoding'])){
    req.resourceClosingBody=true;if(!res.headersSent)res.set('Connection','close');const close=()=>{
      // Flush the small rejection before closing an upload still in flight (avoid dropping the response with RST).
      const socket=req.socket;socket.end();const timer=setTimeout(()=>socket.destroy(),250);timer.unref();socket.once('close',()=>clearTimeout(timer));
    };if(res.writableFinished)close();else res.once('finish',close);
  }
}
function reject(res,status,code,retry=2){
  closeUnreadBody(res);
  res.set('Retry-After',String(retry));res.set('Cache-Control','no-store');
  res.status(status).json({error:status===429?'طلباتك كثيرة أو لديك تنفيذ جارٍ. انتظر قليلًا ثم حاول.':'الخدمة مشغولة مؤقتًا. لم يبدأ تنفيذ طلبك؛ حاول بعد قليل.',code,retryAfter:retry,...(res.req?.requestId?{requestId:res.req.requestId}:{})});
}

export function createResourceProtection({store,loadUser,workerAuthorized=()=>false,maxActive=48,maxHeavy=6,maxLarge=1,bodyTimeoutMs=60_000,abortedHoldMs=300_000}={}){
  const ips=createTokenBuckets({capacity:120,perSecond:10}),global=createTokenBuckets({capacity:160,perSecond:40,maxKeys:1});
  const healthBucket=createTokenBuckets({capacity:20,perSecond:5,maxKeys:1});
  let active=0,heavy=0,large=0,healthActive=0;
  const counts={rate:0,busy:0,payload:0,unauthorized:0,store:0,timeout:0};
  function early(req,res,next){
    const policy=resourcePolicy(req);req.resourcePolicy=policy;const memoryHeavy=policy.large || policy.download;
    // Also close bodies rejected by authentication/CSRF or another downstream middleware.
    res.once('finish',()=>closeUnreadBody(res));
    if(policy.health){
      const quota=healthBucket.take('health');if(!quota.ok || healthActive>=4)return reject(res,503,'HEALTH_BUSY',1);
      healthActive++;let done=false;const release=()=>{if(!done){done=true;healthActive--;}};res.once('finish',release);res.once('close',release);return next();
    }
    const network=createHash('sha256').update(clientNetwork(req.ip)).digest('hex');
    for(const [bucket,key] of [[ips,network],[global,'service']]){const result=bucket.take(key);if(!result.ok){counts.rate++;return reject(res,429,'REQUEST_RATE_LIMIT',result.retry);}}
    const length=req.get('content-length');
    if(length && (!/^\d+$/.test(length) || Number(length)>policy.limit)){counts.payload++;closeUnreadBody(res);return res.status(413).json({error:'حجم الطلب أكبر من المسموح لهذه الأداة.',code:'PAYLOAD_TOO_LARGE'});}
    if(req.get('content-encoding') && req.get('content-encoding')!=='identity'){counts.payload++;closeUnreadBody(res);return res.status(415).json({error:'أرسل JSON غير مضغوط.',code:'ENCODING_UNSUPPORTED'});}
    if(active>=maxActive || policy.heavy && heavy>=maxHeavy || memoryHeavy && large>=maxLarge){counts.busy++;return reject(res,503,'SERVICE_BUSY');}
    active++;if(policy.heavy)heavy++;if(memoryHeavy)large++;
    let released=false,lease,timer,hold;
    const release=()=>{if(released)return;released=true;clearTimeout(timer);clearTimeout(hold);active--;if(policy.heavy)heavy--;if(memoryHeavy)large--;if(lease)void lease.release();};
    const end=res.end;res.end=function(...args){try{return end.apply(this,args);}finally{if(policy.heavy && req.complete && res.destroyed)release();}};
    req.setResourceLease=value=>{if(released || res.destroyed){void value.release();return false;}lease=value;return true;};
    res.once('finish',release);res.once('close',()=>{
      if(policy.heavy && !policy.download && lease && req.complete && !res.writableFinished){hold=setTimeout(release,abortedHoldMs);hold.unref();}
      else release();
    });
    if((length && Number(length)>0) || req.get('transfer-encoding')){
      timer=setTimeout(()=>{if(!req.complete && !res.headersSent){counts.timeout++;req.resourceBodyTimedOut=true;closeUnreadBody(res);res.status(408).json({error:'انتهت مهلة رفع الطلب. لم يبدأ التنفيذ.',code:'BODY_TIMEOUT'});}},bodyTimeoutMs);timer.unref();
      req.once('end',()=>clearTimeout(timer));
    }
    next();
  }
  async function admit(req,res,next){
    const p=req.resourcePolicy || resourcePolicy(req);if(p.health || !p.api || p.path==='/api/logout')return next();
    if(p.worker && workerAuthorized(req))return next();
    if(p.large && !req.session?.userId){counts.unauthorized++;closeUnreadBody(res);return res.status(401).json({error:'سجّل الدخول قبل رفع الملف.',code:'LOGIN_REQUIRED'});}
    if(!req.session?.userId)return next();
    try{
      if(p.large){const user=await loadUser(req);if(!user || user.status!=='active'){counts.unauthorized++;closeUnreadBody(res);return res.status(403).json({error:'الحساب غير متاح لرفع الملفات.'});}}
      if(res.destroyed)return;
      const lease=await store.acquire(req.session.userId,p);
      if(!lease.ok){counts[lease.status===429?'rate':'busy']++;return reject(res,lease.status,lease.code,lease.retry);}
      if(req.setResourceLease && !req.setResourceLease(lease))return;
      if(res.destroyed){await lease.release();return;}
      next();
    }catch{counts.store++;if(!res.destroyed)reject(res,503,'RESOURCE_GUARD_UNAVAILABLE',3);}
  }
  return {early,admit,stats:()=>({active,heavy,large,healthActive,ipKeys:ips.size(),rejections:{...counts}})};
}
