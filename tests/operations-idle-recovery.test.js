import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PGlite} from '@electric-sql/pglite';
import {createOperationsMonitor} from '../lib/operations.js';

test('old HTTP errors expire during idle traffic so a recovered site does not remain in an incident',async()=>{
  const db=new PGlite();let at=100000;const captured=[];
  await db.exec('CREATE TABLE bot_runtime_state(id TEXT PRIMARY KEY,status JSONB,seen_at TIMESTAMPTZ)');
  const query=(sql,p)=>sql.includes('pg_try_advisory_xact_lock')?Promise.resolve({rows:[{locked:true}]}):db.query(sql,p);
  const monitor=createOperationsMonitor({query,connect:async()=>({query,release(){}})},{env:{},immediate:false,now:()=>at,log(){},sender:{config:{},send:async()=>{}},collect:async(pool,{http})=>{captured.push(http);return {at,database:'ready',http};}});
  try{
    for(let n=0;n<10;n++){const res=new EventEmitter();res.statusCode=500;monitor.metrics({path:'/api/example'},res,()=>{});res.emit('finish');}
    await monitor.tick();assert.deepEqual(captured.at(-1),{requests:10,errors:10});assert.equal(monitor.publicHealth().ok,false);
    at+=60001;await monitor.tick();assert.deepEqual(captured.at(-1),{requests:0,errors:0});assert.equal(monitor.publicHealth().ok,true);
  }finally{await monitor.stop();await db.close();}
});
