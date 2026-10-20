import pg from 'pg';
import {X509Certificate} from 'node:crypto';

const profiles={web:{max:8,waiting:32},worker:{max:5,waiting:16},ledger:{max:2,waiting:4}};
function setting(env,key,fallback,min,max){
  const value=env[key]===undefined?fallback:Number(env[key]);
  if(!Number.isInteger(value) || value<min || value>max)throw Error(`Invalid ${key}`);
  return value;
}

// URL SSL parameters must not override the verified TLS object in node-postgres.
export function databaseOptions(profile='web',env=process.env){
  if(!profiles[profile])throw Error('Unknown database profile');
  let url;try{url=new URL(env.DATABASE_URL);}catch{throw Error('Invalid DATABASE_URL');}
  if(!['postgres:','postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1))throw Error('Invalid DATABASE_URL');
  for(const [key,value] of url.searchParams){
    if(key!=='sslmode' || !['require','verify-ca','verify-full'].includes(value))throw Error('Unsupported DATABASE_URL parameter; configure database transport explicitly');
  }
  url.search='';
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  const plainLocal=local && env.NODE_ENV!=='production' && !['verify','pinned'].includes(env.DB_TLS_MODE);
  if(env.DB_TLS_MODE && !['verify','local','pinned'].includes(env.DB_TLS_MODE))throw Error('Invalid DB_TLS_MODE');
  if(env.DB_TLS_MODE==='local' && !plainLocal)throw Error('Unencrypted database transport is restricted to local development');
  const ssl=plainLocal?false:{rejectUnauthorized:true,minVersion:'TLSv1.2',...(env.DB_TLS_CA?{ca:env.DB_TLS_CA.replaceAll('\\n','\n')}:{})};
  if(env.DB_TLS_MODE==='pinned'){
    if(!/^dpg-[a-z0-9-]+$/.test(url.hostname) || env.DB_TLS_PIN_HOST!==url.hostname || !ssl.ca)throw Error('Pinned database TLS requires the explicit internal host and trusted certificate');
    let fingerprint;try{fingerprint=new X509Certificate(ssl.ca).fingerprint256;}catch{throw Error('Invalid pinned database certificate');}
    // The managed internal certificate has a random CN, not a DNS SAN. An exact
    // leaf pin obtained through authenticated Render Shell replaces DNS identity.
    // Chain trust and certificate validity are still enforced by Node TLS.
    ssl.checkServerIdentity=(host,peer)=>host===env.DB_TLS_PIN_HOST && peer.fingerprint256===fingerprint?undefined:Object.assign(Error('Database certificate identity changed'),{code:'DATABASE_TLS_IDENTITY'});
  }
  return {
    connectionString:url.toString(),ssl,
    application_name:`diskoko-${profile}`,
    max:setting(env,`DB_${profile.toUpperCase()}_POOL_MAX`,profiles[profile].max,1,profile==='web'?16:profile==='worker'?10:2),
    connectionTimeoutMillis:3000,idleTimeoutMillis:10_000,
    statement_timeout:setting(env,'DB_STATEMENT_TIMEOUT_MS',30_000,1000,120_000),
    lock_timeout:setting(env,'DB_LOCK_TIMEOUT_MS',5000,250,30_000),
    // Existing Discord operations hold transactions while awaiting bounded external work.
    idle_in_transaction_session_timeout:setting(env,'DB_IDLE_TRANSACTION_TIMEOUT_MS',120_000,60_000,300_000),
    keepAlive:true,keepAliveInitialDelayMillis:10_000,
  };
}

const overloaded=()=>Object.assign(Error('قاعدة البيانات مشغولة مؤقتًا. انتظر قليلًا ثم حاول.'),{status:503,code:'DATABASE_BUSY',expose:true,retryAfter:3});
export class BoundedDatabasePool extends pg.Pool {
  constructor(options,{maxWaiting=32}={}){
    super(options);if(!Number.isInteger(maxWaiting) || maxWaiting<0)throw Error('Invalid database wait budget');this.maxWaiting=maxWaiting;
    // Never log connection URLs, SQL, parameters or provider error detail here.
    this.on('error',error=>console.error('Database idle connection failed',{code:/^[A-Z0-9_]{1,40}$/.test(error.code || '')?error.code:'CONNECTION_FAILED'}));
  }
  connect(callback){
    if(!this.ending && !this.ended && this.idleCount===0 && this.totalCount>=this.options.max && this.waitingCount>=this.maxWaiting){
      const error=overloaded();if(callback){queueMicrotask(()=>callback(error));return;}return Promise.reject(error);
    }
    return super.connect(callback);
  }
}
export function createDatabasePool(profile='web',env=process.env){return new BoundedDatabasePool(databaseOptions(profile,env),{maxWaiting:profiles[profile].waiting});}
export const databasePoolStats=pool=>({total:pool.totalCount,idle:pool.idleCount,waiting:pool.waitingCount,max:pool.options.max,maxWaiting:pool.maxWaiting});
