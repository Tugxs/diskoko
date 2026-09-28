import test from 'node:test';
import assert from 'node:assert/strict';
import { customerRoleConfig, desiredCustomerRoles, syncCustomerRoles } from '../lib/customer-roles.js';

const env = {
  CUSTOMER_GUILD_ID: '123456789012345678', CUSTOMER_ROLE_ID: '123456789012345679',
  STARTER_ROLE_ID: '123456789012345680', GROWTH_ROLE_ID: '123456789012345681',
  BUSINESS_ROLE_ID: '123456789012345682', DISCORD_BOT_TOKEN: 'test-token',
};
const config = customerRoleConfig(env);
const user = { discord_id: '123456789012345683', status: 'active', plan: 'growth' };

test('free account receives only Customers', () => {
  assert.deepEqual(desiredCustomerRoles({ ...user, plan: 'free' }, null, config), [env.CUSTOMER_ROLE_ID]);
});

test('active paid subscription receives its role, pending or expired subscription does not', () => {
  assert.deepEqual(desiredCustomerRoles(user, { plan: 'growth', status: 'active' }, config), [env.CUSTOMER_ROLE_ID, env.GROWTH_ROLE_ID]);
  assert.deepEqual(desiredCustomerRoles(user, { plan: 'growth', status: 'expired' }, config), [env.CUSTOMER_ROLE_ID]);
  assert.deepEqual(desiredCustomerRoles(user, { plan: 'growth', status: 'active', current_period_end: '2020-01-01' }, config), [env.CUSTOMER_ROLE_ID]);
});

test('role sync removes an old package role and leaves unrelated roles intact', async () => {
  const calls = [];
  const pool = { query: async () => ({ rows: [{ id: 1, ...user, subscription_plan: 'growth', subscription_status: 'active' }] }) };
  const fetchImpl = async (_url, options) => {
    calls.push(options.method);
    return options.method === 'GET'
      ? { ok: true, json: async () => ({ roles: [env.CUSTOMER_ROLE_ID, env.STARTER_ROLE_ID, '123456789012345684'] }) }
      : { ok: true };
  };
  const result = await syncCustomerRoles(pool, 1, { env, fetchImpl });
  assert.deepEqual(calls, ['GET', 'DELETE', 'PUT']);
  assert.equal(result.changed, 2);
});

test('existing role names resolve uniquely before any role change', async () => {
  const pool = { query: async () => ({ rows: [{ id: 1, ...user, subscription_plan: 'growth', subscription_status: 'active' }] }) };
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push([url, options.method]);
    if (url.endsWith('/roles')) return { ok: true, json: async () => ([
      { id: env.CUSTOMER_ROLE_ID, name: '✅ Customer' }, { id: env.STARTER_ROLE_ID, name: '✨ Starter' },
      { id: env.GROWTH_ROLE_ID, name: '🚀 Growth' }, { id: env.BUSINESS_ROLE_ID, name: '💼 Business' },
    ]) };
    if (options.method === 'GET') return { ok: true, json: async () => ({ roles: [] }) };
    return { ok: true };
  };
  await syncCustomerRoles(pool, 1, { env: { DISCORD_BOT_TOKEN: 'test-token' }, fetchImpl });
  assert.equal(calls.filter(([, method]) => method === 'PUT').length, 2);
  assert.equal(calls.filter(([, method]) => method === 'DELETE').length, 0);
});

