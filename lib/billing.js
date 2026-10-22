export const PLAN_CATALOG = Object.freeze({
  free: { name: 'Free', monthlyPrice: 0, annualPrice: 0, servers: 1, teamSeats: 1, changeSetsPerMonth: 10, scheduledMessages: 1, analyticsDays: 7, auditDays: 20, customBots: 1, customTemplates: 2 },
  starter: { name: 'Starter', monthlyPrice: 49, annualPrice: 490, servers: 1, teamSeats: 1, changeSetsPerMonth: 300, scheduledMessages: 20, analyticsDays: 30, auditDays: 90, customBots: 2, customTemplates: 20 },
  growth: { name: 'Growth', monthlyPrice: 129, annualPrice: 1290, servers: 3, teamSeats: 5, changeSetsPerMonth: 3000, scheduledMessages: 200, analyticsDays: 90, auditDays: 365, customBots: 5, customTemplates: 100 },
  business: { name: 'Business', monthlyPrice: 299, annualPrice: 2990, servers: 10, teamSeats: 20, changeSetsPerMonth: 15000, scheduledMessages: 1000, analyticsDays: 365, auditDays: 365, customBots: 10, customTemplates: 500 },
});

const LEGACY_PLANS = Object.freeze({ trial: 'free', complete: 'business', pro: 'growth', studio: 'business' });
export const BILLING_PLANS = new Set([...Object.keys(PLAN_CATALOG), ...Object.keys(LEGACY_PLANS)]);
export const BILLING_STATUSES = new Set(['trial', 'active', 'past_due', 'grace', 'cancelled', 'expired']);

export function canonicalPlan(plan) {
  const value = String(plan || 'free').toLowerCase();
  return LEGACY_PLANS[value] || (PLAN_CATALOG[value] ? value : 'free');
}

export function entitlementsFor(user) {
  const key = canonicalPlan(user?.plan);
  return { plan: key, ...PLAN_CATALOG[key] };
}

export function subscriptionAccess(subscription, now = new Date()) {
  const status = String(subscription?.status || 'trial');
  const end = subscription?.current_period_end == null ? null : new Date(subscription.current_period_end);
  const invalidEnd = end && !Number.isFinite(end.getTime());
  const ended = end && end <= now;
  if ((status === 'active' || status === 'trial') && !invalidEnd && !ended) return { mode: 'full', reason: null };
  if (invalidEnd) return { mode: 'read_only', reason: 'subscription_invalid_period' };
  const graceUntil = subscription?.grace_until ? new Date(subscription.grace_until) : null;
  if ((status === 'past_due' || status === 'grace') && graceUntil && graceUntil > now) {
    return { mode: 'full', reason: 'payment_grace', graceUntil: graceUntil.toISOString() };
  }
  return { mode: 'read_only', reason: status === 'past_due' || status === 'grace' ? 'payment_overdue' : 'subscription_inactive' };
}

// One service description shared by the catalog and the customer workspace.
// Availability of an external engine is checked at execution, never promised by a plan.
export const SERVICE_CATALOG = Object.freeze([
  { key: 'structure', name: 'القنوات والرتب', nameEn: 'Channels and roles', description: 'إنشاء وتعديل البنية والصلاحيات مع مراجعة قبل التنفيذ.', descriptionEn: 'Review and apply server structure and permission changes.' },
  { key: 'templates', name: 'القوالب والاستيراد', nameEn: 'Templates and imports', description: 'قوالب جاهزة ومخصصة واستيراد البنية المتوافقة، دون نقل المحادثات أو الأعضاء.', descriptionEn: 'Ready and custom templates, plus compatible structure imports. Messages and members are not copied.' },
  { key: 'panels', name: 'اللوحات التفاعلية', nameEn: 'Interactive panels', description: 'لوحات المجتمع والدعم والإدارة بهوية السيرفر والبوت المختار.', descriptionEn: 'Community, support and management panels using your server identity and selected bot.' },
  { key: 'commands', name: 'الأوامر البرمجية', nameEn: 'Programmable commands', description: 'أوامر ومشاريع JavaScript في بيئة مقيدة بقدرات وحدود تشغيل؛ المحركات غير المتاحة ليست مشمولة.', descriptionEn: 'JavaScript commands and projects with bounded execution and explicit capabilities. Unavailable engines are not included.' },
  { key: 'schedules', name: 'الجدولة', nameEn: 'Scheduling', description: 'رسائل ولوحات أوامر مجدولة ضمن السعة النشطة للحساب.', descriptionEn: 'Scheduled messages and command panels within the account active schedule allowance.' },
  { key: 'insights', name: 'النشاط وسجل التغييرات', nameEn: 'Activity and audit history', description: 'تحليلات وسجل قابلان للعرض ضمن مدة الباقة والبيانات المتوفرة فعليًا.', descriptionEn: 'Analytics and audit history within your plan window and the data actually collected.' },
  { key: 'music', name: 'استديو الموسيقى', nameEn: 'Music studio', description: 'تشغيل وتحكم بالصوت عند توفر مصدر قابل للتشغيل وصلاحيات الروم؛ لا نضمن كل رابط خارجي.', descriptionEn: 'Audio playback and controls when the source and voice permissions allow it. External links are not guaranteed.' },
  { key: 'ai', name: 'مساعد ديسكوكو AI', nameEn: 'Diskoko AI assistant', description: 'يعمل عند اتصال محرك AI المناسب؛ قراءة الصور تتطلب محرك رؤية متاحًا.', descriptionEn: 'Requires a connected compatible AI engine. Image analysis requires an available vision engine.', availability: 'requires_engine' },
]);

export function serviceCatalog() { return SERVICE_CATALOG.map(service => ({ ...service })); }

export function isSubscriptionCleanup(req) {
  if(req.method!=='DELETE')return false;
  const path=String(req.originalUrl || req.path || '').split('?')[0];
  return path==='/api/ai/bot-connection' || /^\/api\/ai\/bots\/\d{17,20}(?:\/commands\/[^/]+|\/code-commands\/[0-9a-f-]{36})?$/i.test(path);
}

export async function requireSubscriptionExecution(db, userId, now = new Date()) {
  const user = (await db.query('SELECT id,status,plan FROM users WHERE id=$1', [userId])).rows[0];
  const subscription = (await db.query('SELECT status,current_period_end,grace_until FROM subscriptions WHERE user_id=$1 ORDER BY updated_at DESC,id DESC LIMIT 1', [userId])).rows[0];
  const access = subscriptionAccess(subscription || { status: 'active' }, now);
  if (!user || user.status !== 'active' || access.mode !== 'full') {
    throw Object.assign(new Error('توقف التنفيذ: الحساب أو الاشتراك غير نشط. راجع الاشتراك من لوحة الحساب؛ بياناتك محفوظة.'), { code: 'SUBSCRIPTION_READ_ONLY', status: 402 });
  }
  return user;
}

export async function requireBotServiceExecution(db,guildId,botId,now=new Date()) {
  const registration=(await db.query('SELECT owner_id FROM customer_bot_registry WHERE guild_id=$1 AND bot_user_id=$2',[guildId,botId])).rows[0];
  // Built-in public commands have no customer subscription owner.
  if(registration)await requireSubscriptionExecution(db,registration.owner_id,now);
}

export function usageAlert(capacity) {
  if (!capacity || !Number.isFinite(capacity.limit) || capacity.limit <= 0) return null;
  const percent = Math.min(100, Math.round((capacity.used / capacity.limit) * 100));
  if (percent >= 100) return { level: 'blocked', percent, message: 'وصلت إلى الحد المتاح في خطتك.' };
  if (percent >= 80) return { level: 'warning', percent, message: 'استخدمت 80٪ أو أكثر من الحد المتاح.' };
  return null;
}

export function publicPlanCatalog() {
  return Object.entries(PLAN_CATALOG).map(([key, plan]) => ({ key, ...plan, services: SERVICE_CATALOG.map(service => service.key), annualSaving: plan.monthlyPrice * 12 - plan.annualPrice }));
}

export function upgradeQuote(planKey, interval, coupon, now = new Date()) {
  const plan = PLAN_CATALOG[planKey];
  if (!plan || planKey === 'free') throw new Error('اختر باقة مدفوعة صالحة.');
  const period = interval === 'annual' ? 'annual' : 'monthly';
  const subtotal = (period === 'annual' ? plan.annualPrice : plan.monthlyPrice) * 100;
  if (!coupon) return { plan: planKey, billing_interval: period, subtotal, discount: 0, total: subtotal, currency: 'SAR', coupon_code: null };
  if (!coupon.active || (coupon.expires_at && new Date(coupon.expires_at) <= now) || (coupon.max_redemptions != null && Number(coupon.redeemed_count) >= Number(coupon.max_redemptions))) throw new Error('الكوبون غير متاح أو انتهت صلاحيته.');
  const value = Number(coupon.discount_value);
  const discount = coupon.discount_type === 'percent' ? Math.round(subtotal * Math.min(100, Math.max(0, value)) / 100) : Math.min(subtotal, Math.max(0, value));
  return { plan: planKey, billing_interval: period, subtotal, discount, total: subtotal - discount, currency: 'SAR', coupon_code: coupon.code };
}
