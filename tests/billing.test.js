import test from 'node:test';
import assert from 'node:assert/strict';
import {isSubscriptionCleanup} from '../lib/billing.js';

test('expired accounts can revoke integrations but cannot publish or update through cleanup paths',()=>{
  for(const path of ['/api/ai/bot-connection','/api/ai/bots/123456789012345678','/api/ai/bots/123456789012345678/commands/test','/api/ai/bots/123456789012345678/code-commands/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']){
    assert.equal(isSubscriptionCleanup({method:'DELETE',originalUrl:path}),true);
    assert.equal(isSubscriptionCleanup({method:'POST',originalUrl:path}),false);
    assert.equal(isSubscriptionCleanup({method:'PATCH',originalUrl:path}),false);
  }
  assert.equal(isSubscriptionCleanup({method:'DELETE',originalUrl:'/api/custom-templates/1'}),false);
});
import { canonicalPlan, entitlementsFor, publicPlanCatalog, subscriptionAccess, usageAlert, upgradeQuote, serviceCatalog, requireSubscriptionExecution,requireBotServiceExecution } from '../lib/billing.js';

test('bot service access resolves the owner of the exact guild and bot, leaving built-ins independent',async()=>{
  const seen=[];const db={query:async(sql,params)=>{seen.push(params);if(sql.includes('FROM customer_bot_registry'))return {rows:params[0]==='guild-a'?[{owner_id:7}]:[]};if(sql.includes('FROM users'))return {rows:[{id:7,status:'active'}]};return {rows:[{status:'expired'}]};}};
  await assert.rejects(requireBotServiceExecution(db,'guild-a','same-bot'),{code:'SUBSCRIPTION_READ_ONLY'});
  assert.deepEqual(seen[0],['guild-a','same-bot']);assert.deepEqual(seen[1],[7]);
  seen.length=0;await requireBotServiceExecution(db,'guild-b','same-bot');assert.equal(seen.length,1);
});

test('active and trial access ends at the exact period boundary; invalid periods fail closed', () => {
  const now=new Date('2026-10-22T00:00:00Z');
  for(const status of ['active','trial']) {
    assert.equal(subscriptionAccess({status,current_period_end:now.toISOString()},now).mode,'read_only');
    assert.equal(subscriptionAccess({status,current_period_end:'invalid'},now).mode,'read_only');
    assert.equal(subscriptionAccess({status,current_period_end:'2026-10-23T00:00:00Z'},now).mode,'full');
    assert.equal(subscriptionAccess({status},now).mode,'full','preserve existing indefinite grants');
  }
  assert.equal(subscriptionAccess({status:'cancelled',grace_until:'2026-11-01'},now).mode,'read_only');
});

test('all plans expose the same honest service catalog with capacity differences', () => {
  const services=serviceCatalog();
  assert.ok(services.some(s=>s.key==='commands'));
  assert.equal(services.find(s=>s.key==='ai').availability,'requires_engine');
  for(const plan of publicPlanCatalog())assert.deepEqual(plan.services,services.map(s=>s.key));
  services[0].name='modified';assert.notEqual(serviceCatalog()[0].name,'modified');
});

test('runtime checks owner status and current subscription before executing background work', async () => {
  const now=new Date('2026-10-22T00:00:00Z');let user={id:7,status:'active'},subscription;
  const db={query:async(sql,params)=>{assert.deepEqual(params,[7]);return {rows:sql.includes('FROM users')?(user?[user]:[]):subscription?[subscription]:[]};}};
  assert.equal((await requireSubscriptionExecution(db,7,now)).id,7);
  subscription={status:'active',current_period_end:'2026-10-21'};
  await assert.rejects(requireSubscriptionExecution(db,7,now),{code:'SUBSCRIPTION_READ_ONLY'});
  subscription={status:'grace',grace_until:'2026-10-23'};await requireSubscriptionExecution(db,7,now);
  user.status='suspended';await assert.rejects(requireSubscriptionExecution(db,7,now),{code:'SUBSCRIPTION_READ_ONLY'});
  user=null;await assert.rejects(requireSubscriptionExecution(db,7,now),{code:'SUBSCRIPTION_READ_ONLY'});
});

test('legacy plans migrate to the matching new entitlement', () => {
  assert.equal(canonicalPlan('trial'), 'free');
  assert.equal(canonicalPlan('complete'), 'business');
  assert.equal(entitlementsFor({ plan: 'complete' }).servers, 10);
});

test('annual pricing always gives exactly two months free', () => {
  for (const plan of publicPlanCatalog()) assert.equal(plan.annualSaving, plan.monthlyPrice * 2);
});

test('bot design limits match the announced plans', () => {
  assert.deepEqual(publicPlanCatalog().map(plan => plan.customBots), [1, 2, 5, 10]);
});

test('past due subscriptions keep full access only inside grace period', () => {
  const now = new Date('2026-09-21T00:00:00Z');
  assert.equal(subscriptionAccess({ status: 'past_due', grace_until: '2026-09-22T00:00:00Z' }, now).mode, 'full');
  assert.equal(subscriptionAccess({ status: 'past_due', grace_until: '2026-09-20T00:00:00Z' }, now).mode, 'read_only');
  assert.equal(subscriptionAccess({ status: 'expired' }, now).mode, 'read_only');
});

test('usage alerts appear at 80 percent and block at 100 percent', () => {
  assert.equal(usageAlert({ used: 79, limit: 100 }), null);
  assert.equal(usageAlert({ used: 80, limit: 100 }).level, 'warning');
  assert.equal(usageAlert({ used: 100, limit: 100 }).level, 'blocked');
});

test('upgrade quote applies a valid coupon in halalas without going below zero', () => {
  const coupon = { code: 'SAVE20', active: true, discount_type: 'percent', discount_value: 20, redeemed_count: 0, max_redemptions: 10 };
  assert.deepEqual(upgradeQuote('starter', 'monthly', coupon), { plan: 'starter', billing_interval: 'monthly', subtotal: 4900, discount: 980, total: 3920, currency: 'SAR', coupon_code: 'SAVE20' });
  assert.equal(upgradeQuote('starter', 'annual', { ...coupon, discount_type: 'fixed', discount_value: 999999 }).total, 0);
});

test('upgrade quote rejects expired and exhausted coupons', () => {
  const now = new Date('2026-09-21T00:00:00Z');
  assert.throws(() => upgradeQuote('growth', 'monthly', { code: 'OLD', active: true, expires_at: '2026-09-20T00:00:00Z' }, now));
  assert.throws(() => upgradeQuote('growth', 'monthly', { code: 'FULL', active: true, redeemed_count: 2, max_redemptions: 2 }, now));
});
