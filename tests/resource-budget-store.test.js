import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {PGlite} from '@electric-sql/pglite';
import {migrateResourceBudgets,createResourceBudgetStore} from '../lib/resource-budget-store.js';

async function database(t){
  if(process.env.RESOURCE_TEST_DATABASE_URL){
    const schema='resources_'+randomUUID().replaceAll('-',''),admin=new pg.Pool({connectionString:process.env.RESOURCE_TEST_DATABASE_URL});
    await admin.query('CREATE SCHEMA '+schema);const pool=new pg.Pool({connectionString:process.env.RESOURCE_TEST_DATABASE_URL,max:10,options:'-c search_path='+schema});
    t.after(async()=>{await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();});return pool;
  }
  const db=new PGlite();
  await db.exec('CREATE FUNCTION pg_advisory_xact_lock(integer) RETURNS void AS $$ SELECT $$ LANGUAGE SQL');
  const query=async(sql,params)=>{if(!params && sql.includes(';')){await db.exec(sql);return {rows:[],rowCount:0};}const r=await db.query(sql,params);return {...r,rowCount:r.affectedRows ?? r.rows.length};};
  // PGlite has one connection: serialize transactions. CI uses a real PostgreSQL service below.
  let tail=Promise.resolve();
  const connect=async()=>{const before=tail;let release;tail=new Promise(r=>release=r);await before;return {query,release};};
  t.after(()=>db.close());return {query,connect};
}
const p={group:'code',rate:30,heavy:true,large:false};
test('shared account quotas survive new store instances, isolates owners and releases leases once',async t=>{
  const pool=await database(t);await migrateResourceBudgets(pool);await migrateResourceBudgets(pool);
  const a=createResourceBudgetStore(pool,{ownerHeavy:1}),b=createResourceBudgetStore(pool,{ownerHeavy:1});t.after(()=>{a.close();b.close();});
  const one=await a.acquire('customer-a',p);assert.equal(one.ok,true);
  const same=await b.acquire('customer-a',p);assert.equal(same.ok,false);assert.equal(same.code,'ACCOUNT_BUSY');
  const other=await b.acquire('customer-b',p);assert.equal(other.ok,true);
  await one.release();await one.release();assert.equal((await a.acquire('customer-a',p)).ok,true);
  const rows=(await pool.query('SELECT owner_hash FROM resource_request_leases')).rows;assert.ok(rows.every(r=>!r.owner_hash.includes('customer')));await other.release();
});
test('shared rate budget rejects excessive work before acquiring a lease and resets with database time',async t=>{
  const pool=await database(t);await migrateResourceBudgets(pool);const store=createResourceBudgetStore(pool);t.after(()=>store.close());
  for(let i=0;i<2;i++){const r=await store.acquire('a',{...p,rate:2});assert.equal(r.ok,true);await r.release();}
  const denied=await store.acquire('a',{...p,rate:2});assert.equal(denied.status,429);assert.equal((await pool.query('SELECT * FROM resource_request_leases')).rows.length,0);
  await pool.query("UPDATE resource_rate_buckets SET started_at=NOW()-INTERVAL '2 minutes'");
  assert.equal((await store.acquire('a',{...p,rate:2})).ok,true);
});
test('parallel replicas respect global heavy/upload ceilings without consuming rejected quotas',async t=>{
  const pool=await database(t);await migrateResourceBudgets(pool);const stores=Array.from({length:3},()=>createResourceBudgetStore(pool,{heavyActive:2,largeActive:1}));t.after(()=>stores.forEach(s=>s.close()));
  const results=await Promise.all(Array.from({length:6},(_,i)=>stores[i%3].acquire('owner-'+i,p)));
  assert.equal(results.filter(r=>r.ok).length,2);assert.equal(results.filter(r=>r.status===503).length,4);
  for(const r of results)if(r.ok)await r.release();
  const uploads=await Promise.all(stores.map((s,i)=>s.acquire('u'+i,{...p,large:true})));
  assert.equal(uploads.filter(r=>r.ok).length,1);
});
test('expired crashed leases recover and maintenance keeps active leases alive and prunes stale rows',async t=>{
  const pool=await database(t);await migrateResourceBudgets(pool);const store=createResourceBudgetStore(pool,{ownerHeavy:1});t.after(()=>store.close());
  const one=await store.acquire('a',p);await pool.query("UPDATE resource_request_leases SET expires_at=NOW()-INTERVAL '1 minute'");
  await store.maintain();assert.equal((await store.acquire('a',p)).code,'ACCOUNT_BUSY');
  await one.release();await pool.query("INSERT INTO resource_request_leases VALUES($1,'crashed',TRUE,FALSE,NOW()-INTERVAL '1 minute')",[randomUUID()]);
  await store.maintain();assert.equal((await pool.query("SELECT * FROM resource_request_leases WHERE owner_hash='crashed'")).rows.length,0);
});
test('database admission backlog is bounded even if connection acquisition stalls',async t=>{
  let resolve;const wait=new Promise(r=>resolve=r);const store=createResourceBudgetStore({connect:()=>wait},{maxPending:1});t.after(()=>store.close());
  const pending=store.acquire('a',p);await assert.rejects(store.acquire('b',p),e=>e.resourceBusy===true);assert.equal(store.stats().pending,1);
  resolve({query:async()=>{throw Error('closed');},release:()=>{}});await assert.rejects(pending);assert.equal(store.stats().pending,0);
});

test('upload bytes are limited independently of request count and storage pressure blocks writes but allows cleanup',async t=>{
  const pool=await database(t);await migrateResourceBudgets(pool);const s=createResourceBudgetStore(pool),full=createResourceBudgetStore(pool,{dbSoftLimitBytes:1});t.after(()=>{s.close();full.close();});
  for(let i=0;i<2;i++){const r=await s.acquire('media',{...p,large:true,bytes:29*1024*1024});assert.ok(r.ok);await r.release();}
  assert.equal((await s.acquire('media',{...p,large:true,bytes:29*1024*1024})).status,429);
  assert.equal((await full.acquire('blocked',{...p,bytes:10})).code,'STORAGE_PRESSURE');
  assert.equal((await full.acquire('blocked',{...p,cleanup:true})).ok,true);
});
