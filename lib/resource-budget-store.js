import {createHash,randomUUID} from 'node:crypto';

export async function migrateResourceBudgets(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS resource_rate_buckets (
    owner_hash TEXT NOT NULL,bucket TEXT NOT NULL,started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),count INT NOT NULL,
    PRIMARY KEY(owner_hash,bucket));
    CREATE INDEX IF NOT EXISTS resource_rate_expiry ON resource_rate_buckets(started_at);
    CREATE TABLE IF NOT EXISTS resource_request_leases (
    id UUID PRIMARY KEY,owner_hash TEXT NOT NULL,heavy BOOLEAN NOT NULL,large BOOLEAN NOT NULL,expires_at TIMESTAMPTZ NOT NULL);
    CREATE INDEX IF NOT EXISTS resource_lease_owner ON resource_request_leases(owner_hash,expires_at);
    CREATE INDEX IF NOT EXISTS resource_lease_expiry ON resource_request_leases(expires_at)`);
}

// Account quotas/leases are shared across web instances. No IPs, URLs, bodies or credentials are stored.
export function createResourceBudgetStore(pool,{maxPending=8,ownerActive=12,ownerHeavy=2,heavyActive=6,largeActive=1,dbSoftLimitBytes=700*1024*1024}={}) {
  if([maxPending,ownerActive,ownerHeavy,heavyActive,largeActive].some(v=>!Number.isInteger(v) || v<1) || !Number.isFinite(dbSoftLimitBytes) || dbSoftLimitBytes<1)throw Error('Invalid resource budget');
  let pending=0,maintenance=false;
  const active=new Set(),releasing=new Set();let releaseTimer,flushing=false,closed=false;
  const bounded=async task=>{if(pending>=maxPending)throw Object.assign(Error('Resource budget store busy'),{resourceBusy:true});pending++;try{return await task();}finally{pending--;}};
  const hash=value=>createHash('sha256').update(String(value)).digest('hex');
  async function flushReleases(){
    if(flushing || !releasing.size || closed)return;flushing=true;
    try{const ids=[...releasing];await bounded(()=>pool.query('DELETE FROM resource_request_leases WHERE id=ANY($1::uuid[])',[ids]));ids.forEach(id=>releasing.delete(id));}
    catch{/* The finite lease is the final safety net if the database remains unavailable. */}
    finally{flushing=false;if(releasing.size && !releaseTimer && !closed){releaseTimer=setTimeout(()=>{releaseTimer=null;void flushReleases();},250);releaseTimer.unref();}}
  }
  async function acquire(owner,policy){
    return bounded(async()=>{
      const client=await pool.connect();let releasedIds=[];
      try{
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout='250ms'");await client.query("SET LOCAL statement_timeout='2000ms'");
        if(policy.heavy)await client.query("SELECT pg_advisory_xact_lock(hashtext('diskoko:resource-heavy:v1'))");
        if(releasing.size){releasedIds=[...releasing];await client.query('DELETE FROM resource_request_leases WHERE id=ANY($1::uuid[])',[releasedIds]);}
        const key=hash(owner);await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['diskoko:resource-owner:'+key]);
        if(policy.heavy && !policy.cleanup && !policy.download){
          const used=Number((await client.query('SELECT pg_database_size(current_database()) AS bytes')).rows[0].bytes);
          if(!Number.isFinite(used))throw Error('Storage measurement unavailable');
          if(used+3*(policy.bytes || 0)>=dbSoftLimitBytes){await client.query('ROLLBACK');return {ok:false,status:503,code:'STORAGE_PRESSURE',retry:60};}
        }
        const charge=Math.max(1,policy.bytes || 0);
        const quotas=[[key,'all',240,1],...(policy.heavy?[[key,policy.group,policy.rate,1]]:[]),...(policy.large?[[key,'upload-bytes',64*1024*1024,charge],[hash('service'),'upload-bytes',128*1024*1024,charge]]:[])];
        for(const [ownerKey,bucket,limit,cost] of quotas){
          const allowed=await client.query(`INSERT INTO resource_rate_buckets(owner_hash,bucket,started_at,count) VALUES($1,$2,date_trunc('minute',NOW()),$4)
            ON CONFLICT(owner_hash,bucket) DO UPDATE SET started_at=date_trunc('minute',NOW()),
            count=CASE WHEN resource_rate_buckets.started_at<date_trunc('minute',NOW()) THEN $4 ELSE resource_rate_buckets.count+$4 END
            WHERE resource_rate_buckets.started_at<date_trunc('minute',NOW()) OR resource_rate_buckets.count<=$3-$4 RETURNING count`,[ownerKey,bucket,limit,cost]);
          if(!allowed.rows.length){await client.query('ROLLBACK');return {ok:false,status:429,code:'ACCOUNT_RATE_LIMIT',retry:60};}
        }
        const counts=(await client.query(`SELECT count(*) FILTER(WHERE owner_hash=$1)::int AS owner,
          count(*) FILTER(WHERE owner_hash=$1 AND heavy)::int AS owner_heavy,
          count(*) FILTER(WHERE heavy)::int AS heavy,count(*) FILTER(WHERE large)::int AS large
          FROM resource_request_leases WHERE expires_at>NOW()`,[key])).rows[0];
        if(counts.owner>=ownerActive || policy.heavy && counts.owner_heavy>=ownerHeavy){await client.query('ROLLBACK');return {ok:false,status:429,code:'ACCOUNT_BUSY',retry:2};}
        if(policy.heavy && counts.heavy>=heavyActive || (policy.large || policy.download) && counts.large>=largeActive){await client.query('ROLLBACK');return {ok:false,status:503,code:'SERVICE_BUSY',retry:3};}
        const id=randomUUID();await client.query("INSERT INTO resource_request_leases(id,owner_hash,heavy,large,expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '2 minutes')",[id,key,policy.heavy,Boolean(policy.large || policy.download)]);
        await client.query('COMMIT');releasedIds.forEach(id=>releasing.delete(id));active.add(id);
        let released=false;
        return {ok:true,release:async()=>{if(released)return;released=true;active.delete(id);if(releasing.size<256)releasing.add(id);await flushReleases();}};
      }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
    });
  }
  async function maintain(){
    if(maintenance)return;maintenance=true;
    try{await bounded(async()=>{
      if(active.size)await pool.query("UPDATE resource_request_leases SET expires_at=NOW()+INTERVAL '2 minutes' WHERE id=ANY($1::uuid[])",[[...active]]);
      await pool.query("DELETE FROM resource_request_leases WHERE id IN (SELECT id FROM resource_request_leases WHERE expires_at<NOW() LIMIT 200)");
      await pool.query("DELETE FROM resource_rate_buckets WHERE (owner_hash,bucket) IN (SELECT owner_hash,bucket FROM resource_rate_buckets WHERE started_at<NOW()-INTERVAL '10 minutes' LIMIT 200)");
    });}catch{/* Admission fails closed while the store is unavailable; live handlers are not replayed. */}finally{maintenance=false;}
  }
  const timer=setInterval(()=>void maintain(),20_000);timer.unref();
  return {acquire,maintain,close:()=>{closed=true;clearInterval(timer);clearTimeout(releaseTimer);},stats:()=>({pending,active:active.size,deferredReleases:releasing.size})};
}
