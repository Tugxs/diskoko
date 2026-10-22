import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {mountSubscriptionLifecycle} from '../lib/subscription-lifecycle.js';

test('cancellation is account scoped, idempotent, preserves access until the boundary and never deletes content',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY);
      CREATE TABLE subscriptions(id BIGINT PRIMARY KEY,user_id BIGINT,plan TEXT,status TEXT,current_period_end TIMESTAMPTZ,cancel_at_period_end BOOLEAN DEFAULT FALSE,updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE billing_upgrade_requests(id BIGINT,user_id BIGINT,status TEXT,updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE audit_logs(actor_user_id BIGINT,action TEXT,target_type TEXT,target_id TEXT,details JSONB);
      CREATE TABLE preserved_content(user_id BIGINT,source TEXT);
      INSERT INTO users VALUES(1),(2);
      INSERT INTO subscriptions(id,user_id,plan,status,current_period_end) VALUES(11,1,'growth','active',NOW()+INTERVAL '1 day'),(22,2,'business','active',NULL);
      INSERT INTO billing_upgrade_requests(id,user_id,status) VALUES(1,1,'pending'),(2,2,'pending');
      INSERT INTO preserved_content VALUES(1,'keep'),(2,'other');`);
    const routes=new Map(),pool={query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
    mountSubscriptionLifecycle({post:(path,...handlers)=>routes.set(path,handlers.at(-1)),delete:(path,...handlers)=>routes.set(path,handlers.at(-1))},{pool,requireUser(){},audit:async()=>{}});
    async function call(path,user,body={}){let output,status=200,error;await routes.get(path)({user:{id:user},body},{status(n){status=n;return this;},json(data){output=data;}},e=>error=e);if(error)throw error;return {output,status};}
    assert.equal((await call('/api/account/subscription/cancel',1)).status,400);
    const result=await call('/api/account/subscription/cancel',1,{confirmed:true});
    assert.equal(result.output.atPeriodEnd,true);assert.equal(result.output.access.mode,'full');
    assert.equal((await call('/api/account/subscription/cancel',1,{confirmed:true})).output.unchanged,true);
    assert.equal((await db.query('SELECT COUNT(*)::int AS total FROM audit_logs')).rows[0].total,1);
    assert.equal((await db.query('SELECT cancel_at_period_end FROM subscriptions WHERE user_id=2')).rows[0].cancel_at_period_end,false);
    assert.equal((await db.query("SELECT status FROM billing_upgrade_requests WHERE user_id=2")).rows[0].status,'pending');
    assert.equal((await db.query('SELECT COUNT(*)::int AS total FROM preserved_content')).rows[0].total,2);
    const immediate=await call('/api/account/subscription/cancel',2,{confirmed:true});
    assert.equal(immediate.output.atPeriodEnd,false);assert.equal(immediate.output.access.mode,'read_only');
    assert.equal((await call('/api/billing/upgrade-requests/current',2)).output.cancelled,false);
  }finally{await db.close();}
});
