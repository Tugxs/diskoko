import {BoundedDatabasePool} from './database.js';
const ledgers=new WeakMap();
export async function stopProjectLedger(pool){const own=ledgers.get(pool);if(own){ledgers.delete(pool);await own.end();}}
export function projectLedger(pool){
  if(!pool.options?.connectionString)return pool;
  if(!ledgers.has(pool)){
    // Separate bounded connections prevent deadlock when the main pool is fully
    // occupied by transactions waiting for their durable external-effect record.
    const ledger=new BoundedDatabasePool({...pool.options,max:2,application_name:'diskoko-ledger',idleTimeoutMillis:1000,allowExitOnIdle:true},{maxWaiting:4});
    ledgers.set(pool,ledger);
  }
  return ledgers.get(pool);
}
