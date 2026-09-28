import { canonicalPlan, subscriptionAccess } from './billing.js';

const API = 'https://discord.com/api/v10';
const ROLE_KEYS = ['customers', 'starter', 'growth', 'business'];
const ID = /^\d{17,20}$/;
const DEFAULT_GUILD_ID = '1298703504273047552';
const ROLE_NAMES = {
  customers: ['✅ Customer', 'Customers'],
  starter: ['✨ Starter', 'Starter'],
  growth: ['🚀 Growth', 'Growth', 'Grow'],
  business: ['💼 Business', 'Business'],
};

export function customerRoleConfig(env = process.env) {
  const guildId = env.CUSTOMER_GUILD_ID || DEFAULT_GUILD_ID;
  const roles = {
    customers: env.CUSTOMER_ROLE_ID,
    starter: env.STARTER_ROLE_ID,
    growth: env.GROWTH_ROLE_ID,
    business: env.BUSINESS_ROLE_ID,
  };
  const supplied = ROLE_KEYS.filter(key => roles[key]);
  if (!ID.test(guildId || '') || (supplied.length !== 0 && supplied.length !== ROLE_KEYS.length) || (supplied.length === ROLE_KEYS.length && (ROLE_KEYS.some(key => !ID.test(roles[key])) || new Set(Object.values(roles)).size !== ROLE_KEYS.length))) {
    throw new Error('Customer role configuration requires a guild ID and either zero or four distinct role IDs');
  }
  return { guildId, roles: supplied.length ? roles : null };
}

async function resolveCustomerRoles(config, request) {
  if (config.roles) return config;
  const response = await request(`/guilds/${config.guildId}/roles`);
  if (!response.ok) throw new Error(`Discord role lookup failed: ${response.status}`);
  const available = await response.json();
  const roles = {};
  for (const key of ROLE_KEYS) {
    const aliases = ROLE_NAMES[key].map(name => name.toLowerCase());
    const matches = available.filter(role => aliases.includes(String(role.name).toLowerCase()));
    if (matches.length !== 1 || matches[0].managed) {
      const relevant = available.filter(role => /customer|client|عميل|starter|growth|grow|business/i.test(String(role.name)));
      const names = (relevant.length ? relevant : available).slice(0, 30).map(role => role.name);
      throw new Error(`Expected one assignable Discord role for ${key}; found ${matches.length}. Available role names: ${JSON.stringify(names)}`);
    }
    roles[key] = matches[0].id;
  }
  if (new Set(Object.values(roles)).size !== ROLE_KEYS.length) throw new Error('Customer roles are not distinct');
  return { ...config, roles };
}

export function desiredCustomerRoles(user, subscription, config, now = new Date()) {
  if (!config || !user?.discord_id || user.status !== 'active') return [];
  const result = [config.roles.customers];
  const plan = canonicalPlan(subscription?.plan || user.plan);
  const periodEnd = subscription?.current_period_end ? new Date(subscription.current_period_end) : null;
  const paid = plan !== 'free' && (!subscription || (subscriptionAccess(subscription, now).mode === 'full' && (!periodEnd || periodEnd > now || (subscription.grace_until && new Date(subscription.grace_until) > now))));
  if (paid) result.push(config.roles[plan]);
  return result;
}

export async function syncCustomerRoles(pool, userId, { env = process.env, fetchImpl = fetch, now = new Date() } = {}) {
  const config = customerRoleConfig(env);
  if (!config) return { status: 'disabled' };
  const { rows } = await pool.query(`SELECT u.id,u.discord_id,u.plan,u.status,s.plan AS subscription_plan,s.status AS subscription_status,s.current_period_end,s.grace_until
    FROM users u LEFT JOIN LATERAL (SELECT plan,status,current_period_end,grace_until FROM subscriptions WHERE user_id=u.id ORDER BY updated_at DESC LIMIT 1) s ON TRUE WHERE u.id=$1`, [userId]);
  const row = rows[0];
  if (!row?.discord_id) return { status: 'unlinked' };
  const subscription = row.subscription_plan ? { plan: row.subscription_plan, status: row.subscription_status, current_period_end: row.current_period_end, grace_until: row.grace_until } : null;
  const memberPath = `/guilds/${config.guildId}/members/${row.discord_id}`;
  const request = async (path, method = 'GET') => fetchImpl(`${API}${path}`, { method, headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }, signal: AbortSignal.timeout(15_000) });
  const resolved = await resolveCustomerRoles(config, request);
  const desired = new Set(desiredCustomerRoles(row, subscription, resolved, now));
  const memberResponse = await request(memberPath);
  if (memberResponse.status === 404) return { status: 'not_member' };
  if (!memberResponse.ok) throw new Error(`Discord member lookup failed: ${memberResponse.status}`);
  const member = await memberResponse.json();
  const current = new Set(member.roles || []);
  let changed = 0;
  for (const roleId of Object.values(resolved.roles)) {
    if (desired.has(roleId) === current.has(roleId)) continue;
    const response = await request(`${memberPath}/roles/${roleId}`, desired.has(roleId) ? 'PUT' : 'DELETE');
    if (!response.ok) throw new Error(`Discord role update failed: ${response.status}`);
    changed++;
  }
  return { status: 'synced', changed };
}

