import pg from 'pg';
const ledgers=new WeakMap();
export function projectLedger(pool){
  if(!pool.options?.connectionString)return pool;
  if(!ledgers.has(pool)){
    // Separate bounded connections prevent deadlock when the main pool is fully
    // occupied by transactions waiting for their durable external-effect record.
    const ledger=new pg.Pool({...pool.options,max:2,idleTimeoutMillis:1000,allowExitOnIdle:true});
    ledger.on('error',error=>console.error('Project ledger connection failed',error.message));
    ledgers.set(pool,ledger);
  }
  return ledgers.get(pool);
}
