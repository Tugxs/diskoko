import { randomUUID } from 'node:crypto';
import { PermissionFlagsBits as P } from 'discord.js';
import sharp from 'sharp';
import { validateWelcomeGif } from './welcome-image.js';
import { connectedBot, connectedBotMetadata } from './ai-bot-connections.js';
import { problem } from './workspace-domain.js';
import { READY_TEMPLATES, normalizeReadyDefinition, readyTemplateDiff, readyUsageUnits } from './ready-templates.js';
import { migrateReadyTemplateModules } from './ready-template-modules.js';

export async function migrateReadyTemplates(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS ready_template_runs (
    id UUID PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    guild_id TEXT NOT NULL, template_key TEXT NOT NULL, mode TEXT NOT NULL,
    definition JSONB NOT NULL, review JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
    error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS ready_template_steps (
    run_id UUID NOT NULL REFERENCES ready_template_runs(id) ON DELETE CASCADE,
    step_key TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', resource_id TEXT, error TEXT, ordinal INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(run_id,step_key)
  );
  ALTER TABLE ready_template_steps ADD COLUMN IF NOT EXISTS ordinal INT NOT NULL DEFAULT 0;
  CREATE INDEX IF NOT EXISTS ready_template_runs_guild ON ready_template_runs(user_id,guild_id,created_at DESC);`);
  await pool.query('ALTER TABLE diskoko_welcome_cards ADD COLUMN IF NOT EXISTS publishing_bot_id TEXT');
  await pool.query("ALTER TABLE ready_template_runs ADD COLUMN IF NOT EXISTS usage_units INT NOT NULL DEFAULT 1; ALTER TABLE ready_template_runs ADD COLUMN IF NOT EXISTS executor TEXT NOT NULL DEFAULT 'diskoko'; ALTER TABLE ready_template_runs ADD COLUMN IF NOT EXISTS completed_units INT NOT NULL DEFAULT 0");
  await pool.query(`CREATE TABLE IF NOT EXISTS guild_activity_log_routes (
    guild_id TEXT PRIMARY KEY, publishing_bot_id TEXT NOT NULL,
    config JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await migrateReadyTemplateModules(pool);
}

const route = fn => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
const desired = definition => [
  ...definition.roles.map(role => ({ key: `role:${role.key}`, kind: 'role', name: role.name, role })),
  ...definition.categories.flatMap(category => [
    { key: `category:${category.key}`, kind: 'category', name: category.name, category },
    ...category.channels.map(channel => ({ key: `channel:${channel.key}`, kind: 'channel', name: channel.name, channel, parentKey: category.key })),
  ]),
  ...(['welcome', 'ticket', 'logs'].filter(kind => definition.features[kind]?.enabled).map(kind => ({ key: `feature:${kind}`, kind: `feature-${kind}`, name: { welcome: 'بطاقة الترحيب', ticket: 'لوحة الدعم', logs: 'سجل النشاط والأوامر' }[kind] }))),
  ...(definition.features.guides || []).map(guide => ({ key: `guide:${guide.key}`, kind: 'feature-guide', name: guide.title, guide })),
  ...(definition.features.modules || []).filter(module => module.enabled).map(module => ({ key: `module:${module.key}`, kind: 'feature-module', name: module.title, module })),
];
const stagingName = (runId, item) => `dk-${runId.slice(0, 8)}-${item.key.replace(':', '-')}`.slice(0, 90);
// Discord can renumber channel positions or return overwrites in a different order
// without changing the structure that was reviewed. Compare only meaningful state.
export const readySnapshotFingerprint = snapshot => JSON.stringify({ version: 2, guildName: snapshot.guild?.name,
  channels: snapshot.channels.map(row => [row.id, row.name, row.type, row.parent_id, (row.permission_overwrites || []).map(item => [item.id, item.type, String(item.allow || '0'), String(item.deny || '0')]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))), row.topic || '']).sort((a,b) => a[0].localeCompare(b[0])),
  roles: snapshot.roles.map(row => [row.id, row.name, row.position, String(row.permissions || '0'), row.color, Boolean(row.managed)]).sort((a,b) => a[0].localeCompare(b[0])) });
const reviewChangeSummary = (previous, current) => {
  let before; try { before = JSON.parse(previous); } catch { return 'تعذر مقارنة النسخة القديمة من المراجعة.'; }
  if (before.version !== 2) return 'المراجعة أُنشئت بإصدار قديم من القوالب.';
  const after = JSON.parse(readySnapshotFingerprint(current));
  if (before.guildName !== after.guildName) return `تغير اسم السيرفر من «${before.guildName}» إلى «${after.guildName}».`;
  for (const [kind, label] of [['channels', 'القناة'], ['roles', 'الرتبة']]) {
    const oldItems = new Map(before[kind].map(row => [row[0], row]));
    const newItems = new Map(after[kind].map(row => [row[0], row]));
    for (const [id, row] of newItems) if (!oldItems.has(id)) return `أُضيفت ${label} «${row[1]}» بعد المعاينة.`;
    for (const [id, row] of oldItems) if (!newItems.has(id)) return `حُذفت ${label} «${row[1]}» بعد المعاينة.`;
    for (const [id, row] of newItems) if (JSON.stringify(row) !== JSON.stringify(oldItems.get(id))) return `تغيّرت ${label} «${row[1]}» أو صلاحياتها بعد المعاينة.`;
  }
  return 'تغيّرت إعدادات السيرفر بعد المعاينة.';
};
export const readyCompletedUnits = (definition, steps) => steps.reduce((total, step) => {
  if (step.status !== 'succeeded') return total;
  if (['role', 'category', 'channel', 'feature-welcome', 'feature-ticket', 'feature-guide', 'feature-module'].includes(step.kind)) return total + 1;
  if (step.kind === 'feature-logs') return total + (definition.features.logs.mode === 'routed' ? definition.features.logs.routes.length : 1);
  return total;
}, 0);
const everyoneOverwrite = (guildId, access, roleIds = []) => access === 'public' ? [] : access === 'read_only'
  ? [{ id: guildId, type: 0, allow: '0', deny: String(P.SendMessages) }, ...[...new Set(roleIds)].map(id => ({ id, type: 0, allow: String(P.SendMessages), deny: '0' }))]
  : [{ id: guildId, type: 0, allow: '0', deny: String(P.ViewChannel) }, ...[...new Set(roleIds)].map(id => ({ id, type: 0, allow: String(P.ViewChannel | P.ReadMessageHistory | P.SendMessages | P.Connect), deny: '0' }))];

export function mountReadyTemplates(app, { pool, requireUser, requireWriteAccess, authorizedGuild, discordBotFetch: discord, audit, requirePlanCapacity, botStatus }) {
  async function executorFor(guildId, choice) {
    if (!['diskoko', 'custom'].includes(choice)) throw problem('اختر بوت ديسكوكو أو بوتك الخاص.');
    if (choice === 'custom') {
      const status = await connectedBotMetadata(pool, guildId);
      if (!status?.online) throw problem('بوتك الخاص غير متصل. اربطه من إعدادات السيرفر أولًا.', 409);
      const bot = await connectedBot(pool, guildId);
      return { status, call: (path, options = {}) => discord(path, { ...options, headers: { ...options.headers, Authorization: `Bot ${bot.token}` } }) };
    }
    const status = botStatus();
    if (!status.online) throw problem('بوت ديسكوكو غير متصل الآن. اختر بوتك الخاص أو انتظر عودته.', 409);
    return { status, call: (path, options = {}) => discord(path, { ...options, headers: { ...options.headers, Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } }) };
  }
  async function authorized(req) {
    const guild = await authorizedGuild(req.user, req.params.guildId);
    if (!guild) throw problem('لا تملك صلاحية إدارة هذا السيرفر.', 403);
    return guild;
  }
  async function snapshot(guildId, call = discord) {
    const [channels, roles, guild] = await Promise.all([call(`/guilds/${guildId}/channels`), call(`/guilds/${guildId}/roles`), call(`/guilds/${guildId}`)]);
    if (!channels.ok || !roles.ok || !guild.ok) throw problem('تعذرت قراءة السيرفر من Discord. تحقق من اتصال البوت وصلاحياته.', 502);
    return { guildId, channels: channels.data, roles: roles.data, guild: guild.data };
  }
  const getRun = async (req, guildId) => {
    const run = (await pool.query('SELECT * FROM ready_template_runs WHERE id=$1 AND user_id=$2 AND guild_id=$3', [req.params.id, req.user.id, guildId])).rows[0];
    if (!run) throw problem('مراجعة القالب غير موجودة.', 404);
    // A draft reviewed before roles were billable must show and use the same total at apply time.
    if (['draft', 'running', 'failed', 'cancel_requested'].includes(run.status)) {
      const units = readyUsageUnits(run.definition);
      if (run.usage_units !== units || run.review.usageUnits !== units) {
        run.usage_units = units;
        run.review = { ...run.review, usageUnits: units };
        await pool.query("UPDATE ready_template_runs SET usage_units=$2,review=$3 WHERE id=$1 AND status<>'succeeded'", [run.id, units, run.review]);
      }
    }
    return run;
  };
  async function runState(run) {
    const steps = (await pool.query(`SELECT step_key,kind,name,status,resource_id,error,updated_at FROM ready_template_steps WHERE run_id=$1
      ORDER BY CASE kind WHEN 'role' THEN 0 WHEN 'category' THEN 1 WHEN 'channel' THEN 2 WHEN 'feature-welcome' THEN 3 WHEN 'feature-ticket' THEN 4 WHEN 'feature-logs' THEN 5 WHEN 'feature-guide' THEN 6 WHEN 'feature-module' THEN 7 WHEN 'cleanup' THEN 8 WHEN 'delete-channel' THEN 9 WHEN 'delete-role' THEN 10 ELSE 11 END,ordinal`, [run.id])).rows;
    const { definition: _definition, ...publicRun } = run;
    return { run: publicRun, steps };
  }
  async function finishCancellation(run) {
    const steps = (await pool.query('SELECT kind,status FROM ready_template_steps WHERE run_id=$1', [run.id])).rows;
    const completed = readyCompletedUnits(run.definition, steps);
    await pool.query("UPDATE ready_template_runs SET status='cancelled',completed_units=$2,error=NULL,updated_at=NOW() WHERE id=$1 AND status NOT IN ('succeeded','cancelled')", [run.id, completed]);
    await audit(run.user_id, 'ready_template.cancelled', 'guild', run.guild_id, { run_id: run.id, completed_units: completed });
    return runState({ ...run, status: 'cancelled', completed_units: completed, error: null });
  }
  app.get('/api/ready-templates', requireUser, (_req, res) => res.json({ templates: READY_TEMPLATES }));
  app.get('/api/workspace/:guildId/ready-templates/runs', requireUser, route(async (req, res) => {
    await authorized(req);
    const runs = (await pool.query("SELECT id,template_key,definition->>'name' AS name,mode,status,error,completed_units,created_at,updated_at FROM ready_template_runs WHERE user_id=$1 AND guild_id=$2 ORDER BY created_at DESC LIMIT 20", [req.user.id, req.params.guildId])).rows;
    res.json({ runs });
  }));
  app.post('/api/workspace/:guildId/ready-templates/review', requireUser, requireWriteAccess, route(async (req, res) => {
    const guild = await authorized(req);
    const template = READY_TEMPLATES.find(item => item.key === req.body.templateKey);
    if (!template) throw problem('القالب المختار غير موجود.');
    const definition = normalizeReadyDefinition(req.body.definition || template.definition);
    for (const kind of ['welcome', 'ticket']) if (definition.features[kind].enabled && definition.features[kind].banner) {
      try {
        const metadata = await sharp(Buffer.from(definition.features[kind].banner.base64, 'base64'), { limitInputPixels: 20_000_000 }).metadata();
        if (!metadata.width || !metadata.height || metadata.width < 64 || metadata.height < 64 || metadata.width > 8000 || metadata.height > 8000) throw Error('dimensions');
        if (kind === 'welcome' && definition.features[kind].composite && definition.features[kind].banner.mime !== 'image/gif' && (metadata.width !== 1200 || metadata.height !== 480)) throw Error('composite size');
        if (kind === 'welcome' && definition.features[kind].composite && definition.features[kind].banner.mime === 'image/gif') await validateWelcomeGif(Buffer.from(definition.features[kind].banner.base64, 'base64'));
      } catch { throw problem(`صورة ${kind === 'welcome' ? 'الترحيب' : 'الدعم'} تالفة أو أبعادها غير مناسبة. اختر صورة أخرى قبل المراجعة.`); }
    }
    for (const module of definition.features.modules || []) if (module.enabled && module.banner) {
      try {
        const metadata = await sharp(Buffer.from(module.banner.base64, 'base64'), { limitInputPixels: 20_000_000 }).metadata();
        if (!metadata.width || !metadata.height || metadata.width > 8000 || metadata.height > 8000) throw Error('dimensions');
      } catch { throw problem(`صورة ميزة «${module.title}» غير صالحة. اختر صورة أخرى.`); }
    }
    const mode = req.body.mode === 'replace' ? 'replace' : req.body.mode === 'add' ? 'add' : null;
    if (!mode) throw problem('اختر التنصيب أو الاستبدال.');
    const executor = req.body.executor === 'custom' ? 'custom' : 'diskoko';
    const { call } = await executorFor(guild.id, executor);
    const current = await snapshot(guild.id, call);
    const diff = readyTemplateDiff(definition, current, mode);
    const previousWelcome = (await pool.query('SELECT channel_id,title,description,publishing_bot_id FROM diskoko_welcome_cards WHERE guild_id=$1', [guild.id])).rows[0] || null;
    if (definition.features.logs.enabled && definition.features.logs.mode === 'routed') {
      const existingIds = new Set(current.channels.map(channel => channel.id));
      if (definition.features.logs.routes.some(rule => rule.sourceIds.some(id => !existingIds.has(id)))) throw problem('إحدى قنوات مصدر اللوق لم تعد موجودة في السيرفر. راجع قواعد اللوق.', 409);
      if (mode === 'replace' && definition.features.logs.routes.some(rule => rule.sourceIds.length)) throw problem('الاستبدال سيحذف قنوات اللوق القديمة. اختر قنوات من القالب كمصادر، أو استخدم التنصيب بجانب الموجود.', 409);
      const templateChannels = new Map(definition.categories.flatMap(category => category.channels).map(channel => [channel.key, channel]));
      const privateExisting = new Set(current.channels.filter(channel => (channel.permission_overwrites || []).some(row => row.id === guild.id && (BigInt(row.deny || '0') & P.ViewChannel) !== 0n)).map(channel => channel.id));
      if (definition.features.logs.routes.some(rule => rule.sourceIds.some(id => privateExisting.has(id)) && templateChannels.get(rule.targetKey)?.access !== 'private')) throw problem('إحدى قواعد اللوق تراقب قناة خاصة وتُرسل إلى قناة عامة. اختر قناة سجل خاصة حتى لا ينكشف نشاطها.', 409);
    }
    // Discord limits are checked locally before the first write.
    const newChannelCount = mode === 'replace' ? definition.categories.length + definition.categories.reduce((n, group) => n + group.channels.length, 0) : diff.createOrReuse.filter(item => item.kind !== 'role' && item.action === 'create').length;
    const newRoleCount = mode === 'replace' ? definition.roles.length : diff.createOrReuse.filter(item => item.kind === 'role' && item.action === 'create').length;
    if (current.channels.length + newChannelCount > 500) throw problem('بناء القالب قبل حذف القديم قد يتجاوز حد قنوات Discord. احذف بعض القنوات يدويًا أولًا.', 409);
    if (current.roles.length + newRoleCount > 250) throw problem('بناء القالب قبل حذف القديم قد يتجاوز حد رتب Discord. احذف بعض الرتب يدويًا أولًا.', 409);
    const protectedIds = new Set([current.guild.system_channel_id, current.guild.rules_channel_id, current.guild.public_updates_channel_id, current.guild.afk_channel_id].filter(Boolean));
    const protectedChannels = diff.deletions.channels.filter(row => protectedIds.has(row.id));
    diff.deletions.channels = diff.deletions.channels.filter(row => !protectedIds.has(row.id));
    diff.protectedChannels = protectedChannels;
    const bot = await call('/users/@me');
    const botRole = bot.ok ? current.roles.find(row => row.tags?.bot_id === bot.data.id) : null;
    const unsafeRoles = diff.deletions.roles.filter(row => !botRole || row.position >= botRole.position);
    diff.deletions.roles = diff.deletions.roles.filter(row => botRole && row.position < botRole.position);
    diff.protectedRoles = unsafeRoles;
    if (mode === 'replace' && diff.deletions.channels.length) {
      const ids = diff.deletions.channels.map(row => row.id);
      const [schedules, giveaways, panels] = await Promise.all([
        pool.query("SELECT COUNT(*)::int AS count FROM scheduled_messages WHERE guild_id=$1 AND channel_id=ANY($2::text[]) AND status IN ('scheduled','sending')", [guild.id, ids]),
        pool.query("SELECT COUNT(*)::int AS count FROM diskoko_giveaways WHERE guild_id=$1 AND channel_id=ANY($2::text[]) AND status='active'", [guild.id, ids]),
        pool.query('SELECT COUNT(*)::int AS count FROM diskoko_ticket_panels WHERE guild_id=$1 AND channel_id=ANY($2::text[])', [guild.id, ids]),
      ]);
      diff.affectedTasks = { schedules: schedules.rows[0].count, giveaways: giveaways.rows[0].count, ticketPanels: panels.rows[0].count };
    } else diff.affectedTasks = { schedules: 0, giveaways: 0, ticketPanels: 0 };
    const id = randomUUID();
    const usageUnits = readyUsageUnits(definition);
    const welcomeAction = definition.features.welcome.enabled ? (previousWelcome ? 'replace' : 'create') : previousWelcome && mode === 'replace' && diff.deletions.channels.some(channel => channel.id === previousWelcome.channel_id) ? 'remove' : previousWelcome ? 'keep' : 'none';
    const review = { ...diff, welcomeImpact: { action: welcomeAction, previousTitle: previousWelcome?.title || null }, welcomePrevious: previousWelcome, fingerprint: readySnapshotFingerprint(current), guildName: current.guild.name, usageUnits, guides: definition.features.guides.map(guide => ({ title: guide.title, description: guide.description, channel: definition.categories.flatMap(group => group.channels).find(channel => channel.key === guide.channelKey)?.name })), counts: { channels: current.channels.length, roles: current.roles.length } };
    const structure = desired(definition);
    const steps = [...structure, ...(mode === 'replace' ? [{ key: 'cleanup', kind: 'cleanup', name: 'إيقاف مهام القنوات القديمة' }] : []), ...diff.deletions.channels.filter(row => row.type !== 4).map(row => ({ key: `delete-channel:${row.id}`, kind: 'delete-channel', name: row.name, resourceId: row.id })), ...diff.deletions.channels.filter(row => row.type === 4).map(row => ({ key: `delete-channel:${row.id}`, kind: 'delete-channel', name: row.name, resourceId: row.id })), ...diff.deletions.roles.map(row => ({ key: `delete-role:${row.id}`, kind: 'delete-role', name: row.name, resourceId: row.id })), ...(mode === 'replace' ? [...structure.filter(item => ['role', 'category', 'channel'].includes(item.kind)).map(item => ({ key: `finalize:${item.key}`, kind: 'finalize', name: item.name })), { key: 'order', kind: 'order', name: 'ترتيب القنوات والرتب' }] : [])];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const capacity = await requirePlanCapacity(req.user, 'changeSetsPerMonth', client);
      if (capacity.used + usageUnits > capacity.limit) throw problem(`القالب يحتاج ${usageUnits} تغييرًا تشمل الرتب والقنوات والتصنيفات والميزات، والمتبقي من باقتك ${Math.max(0, capacity.limit - capacity.used)}. عدّل القالب أو الباقة قبل التنفيذ.`, 402);
      await client.query('INSERT INTO ready_template_runs(id,user_id,guild_id,template_key,mode,definition,review,usage_units,executor) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [id, req.user.id, guild.id, template.key, mode, definition, review, usageUnits, executor]);
      for (const [index, step] of steps.entries()) await client.query('INSERT INTO ready_template_steps(run_id,step_key,kind,name,resource_id,ordinal) VALUES($1,$2,$3,$4,$5,$6)', [id, step.key, step.kind, step.name, step.resourceId || null, index]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    await audit(req.user.id, 'ready_template.review', 'guild', guild.id, { run_id: id, mode, template_key: template.key });
    res.status(201).json(await runState({ id, guild_id: guild.id, definition, review, mode, executor, usage_units: usageUnits, status: 'draft' }));
  }));
  app.get('/api/workspace/:guildId/ready-templates/runs/:id', requireUser, route(async (req, res) => {
    const guild = await authorized(req); const run = await getRun(req, guild.id); res.json(await runState(run));
  }));
  app.post('/api/workspace/:guildId/ready-templates/runs/:id/cancel', requireUser, requireWriteAccess, route(async (req, res) => {
    const guild = await authorized(req);
    const run = await getRun(req, guild.id);
    if (run.status === 'succeeded') throw problem('اكتمل تنصيب القالب بالفعل؛ لا يمكن إيقافه. راجع القنوات والرتب لتعديل ما أُنشئ.', 409);
    if (run.status === 'cancelled') return res.json(await runState(run));
    const lock = await pool.connect(); let acquired = false;
    try {
      acquired = (await lock.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [`diskoko:${guild.id}`])).rows[0].locked;
      if (!acquired) {
        const requested = await pool.query("UPDATE ready_template_runs SET status='cancel_requested',updated_at=NOW() WHERE id=$1 AND status IN ('draft','running','failed') RETURNING status", [run.id]);
        if (!requested.rows.length) {
          const latest = await getRun(req, guild.id);
          if (latest.status === 'succeeded') throw problem('اكتمل التنصيب قبل وصول طلب الإيقاف. راجع القنوات والرتب لتعديل ما أُنشئ.', 409);
          return res.json(await runState(latest));
        }
        return res.json(await runState({ ...run, status: 'cancel_requested' }));
      }
      const latest = await getRun(req, guild.id);
      if (latest.status === 'succeeded') throw problem('اكتمل التنصيب قبل وصول طلب الإيقاف. راجع القنوات والرتب لتعديل ما أُنشئ.', 409);
      if (latest.status === 'cancelled') return res.json(await runState(latest));
      res.json(await finishCancellation(latest));
    } finally { if (acquired) await lock.query('SELECT pg_advisory_unlock(hashtext($1))', [`diskoko:${guild.id}`]); lock.release(); }
  }));
  app.post('/api/workspace/:guildId/ready-templates/runs/:id/apply', requireUser, requireWriteAccess, route(async (req, res) => {
    const guild = await authorized(req);
    const lock = await pool.connect(); let acquired = false;
    try {
      acquired = (await lock.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [`diskoko:${guild.id}`])).rows[0].locked;
      if (!acquired) throw problem('هناك عملية أخرى تعمل على هذا السيرفر. حاول بعد اكتمالها.', 409);
      const run = await getRun(req, guild.id);
      if (run.status === 'succeeded') return res.json(await runState(run));
      if (run.status === 'cancelled') throw problem('أُوقف هذا التنصيب. ابدأ مراجعة جديدة إذا أردت تركيب القالب لاحقًا.', 409);
      if (run.status === 'cancel_requested') return res.json(await finishCancellation(run));
      if (req.body.confirmed !== true || req.body.guildName !== run.review.guildName || req.body.mode !== run.mode) throw problem('راجع اسم السيرفر ونوع التنفيذ وأكد التغييرات أولًا.');
      const { status: runtime, call } = await executorFor(guild.id, run.executor);
      const current = await snapshot(guild.id, call);
      if (run.status === 'draft' && readySnapshotFingerprint(current) !== run.review.fingerprint) throw problem(`انتهت صلاحية مراجعة القالب: ${reviewChangeSummary(run.review.fingerprint, current)} حدّث المراجعة لتشاهد الفروق الجديدة وتؤكدها قبل التنصيب. لم ينفذ البوت شيئًا ولم يُخصم رصيدك.`, 409);
      if (run.status === 'draft') {
        const latestWelcome = (await pool.query('SELECT channel_id,title,description,publishing_bot_id FROM diskoko_welcome_cards WHERE guild_id=$1', [guild.id])).rows[0] || null;
        if (JSON.stringify(latestWelcome) !== JSON.stringify(run.review.welcomePrevious || null)) throw problem('تغيّر إعداد الترحيب بعد مراجعة القالب. حدّث المراجعة لتشاهد ما سيُستبدل قبل التنفيذ. لم نغيّر الترحيب الحالي.', 409);
      }
      if (run.definition.features.welcome.enabled && (!runtime.online || !(runtime.memberJoins ?? runtime.member_joins))) throw problem('الترحيب التلقائي يحتاج بوتًا متصلًا مع تفعيل Server Members Intent. راجع الربط قبل التنفيذ.', 409);
      if ((run.definition.features.ticket.enabled || run.definition.features.modules?.some(module => module.enabled)) && !runtime.online) throw problem('الميزات التفاعلية تحتاج بوتًا متصلًا قبل النشر. تحقق من ربط البوت المختار.', 409);
      const all = (await pool.query(`SELECT * FROM ready_template_steps WHERE run_id=$1
        ORDER BY CASE kind WHEN 'role' THEN 0 WHEN 'category' THEN 1 WHEN 'channel' THEN 2 WHEN 'feature-welcome' THEN 3 WHEN 'feature-ticket' THEN 4 WHEN 'feature-logs' THEN 5 WHEN 'feature-guide' THEN 6 WHEN 'feature-module' THEN 7 WHEN 'cleanup' THEN 8 WHEN 'delete-channel' THEN 9 WHEN 'delete-role' THEN 10 ELSE 11 END,ordinal`, [run.id])).rows;
      const pending = all.filter(step => step.status !== 'succeeded');
      if (!pending.length) { await pool.query("UPDATE ready_template_runs SET status='succeeded',error=NULL,updated_at=NOW() WHERE id=$1", [run.id]); return res.json(await runState({ ...run, status: 'succeeded' })); }
      const map = new Map(all.filter(step => step.status === 'succeeded' && step.resource_id).map(step => [step.step_key, step.resource_id]));
      const bot = await call('/users/@me');
      if (!bot.ok || !bot.data?.id) throw problem('تعذر التحقق من هوية البوت المختار.', 502);
      const member = await call(`/guilds/${guild.id}/members/${bot.data.id}`);
      if (!member.ok) throw problem('تعذر التحقق من صلاحيات البوت داخل السيرفر. أعد ربطه ثم حاول.', 409);
      const memberRoles = new Set(member.data.roles || []);
      const effective = current.roles.filter(role => role.id === guild.id || memberRoles.has(role.id)).reduce((bits, role) => bits | BigInt(role.permissions || '0'), 0n);
      const hasModules = run.definition.features.modules?.some(module => module.enabled);
      const required = P.ManageChannels | P.ManageRoles | ((run.definition.features.ticket.enabled || run.definition.features.logs.enabled || hasModules) ? P.ViewChannel | P.SendMessages | P.ReadMessageHistory : 0n) | ((run.definition.features.ticket.enabled || hasModules) ? P.EmbedLinks : 0n);
      if (!(effective & P.Administrator) && (effective & required) !== required) throw problem('البوت يحتاج إدارة القنوات والرتب، ومع لوحة الدعم يحتاج إرسال الرسائل والروابط المضمنة. عدّل صلاحياته قبل التنفيذ.', 409);
      const granted = run.definition.roles.reduce((bits, role) => bits | BigInt(role.permissions), 0n);
      if (!(effective & P.Administrator) && (granted & ~effective) !== 0n) throw problem('بعض صلاحيات الرتب في القالب أعلى من صلاحيات البوت. عدّل نوع الرتب أو صلاحيات البوت أولًا.', 409);
      const botRole = bot.ok ? current.roles.find(role => role.tags?.bot_id === bot.data.id) : null;
      if (run.mode === 'replace' && run.review.deletions.roles.length && !botRole) throw problem('تعذر التحقق من موضع رتبة البوت. لن نحذف أي رتبة.', 409);
      if (run.status === 'draft') {
        await lock.query('BEGIN');
        try {
          const capacity = await requirePlanCapacity(req.user, 'changeSetsPerMonth', lock);
          if (capacity.used + run.usage_units > capacity.limit) throw problem('لم يعد رصيد التغييرات المتبقي يكفي هذا القالب، بما فيه الرتب. راجع الاستخدام أو الباقة.', 402);
          const started = await lock.query("UPDATE ready_template_runs SET status='running',error=NULL,updated_at=NOW() WHERE id=$1 AND status='draft' RETURNING status", [run.id]);
          if (!started.rows.length) { await lock.query('ROLLBACK'); return res.json(await finishCancellation(run)); }
          await lock.query('COMMIT');
        } catch (error) { await lock.query('ROLLBACK'); throw error; }
      } else {
        const resumed = await pool.query("UPDATE ready_template_runs SET status='running',error=NULL,updated_at=NOW() WHERE id=$1 AND status IN ('running','failed') RETURNING status", [run.id]);
        if (!resumed.rows.length) return res.json(await finishCancellation(run));
      }
      const byKey = new Map(desired(run.definition).map(item => [item.key, item]));
      // A bounded batch keeps the HTTP request short and lets the UI show each stage.
      for (const step of pending.slice(0, 4)) {
        if ((await pool.query('SELECT status FROM ready_template_runs WHERE id=$1', [run.id])).rows[0]?.status === 'cancel_requested') return res.json(await finishCancellation(run));
        try {
          let resourceId = step.resource_id;
          const item = byKey.get(step.step_key);
          if (step.kind === 'role') {
            const role = item.role;
            const name = run.mode === 'replace' ? stagingName(run.id, item) : role.name;
            const existing = current.roles.find(row => row.name === name && !row.managed && row.id !== guild.id);
            if (existing) resourceId = existing.id;
            else {
              const result = await call(`/guilds/${guild.id}/roles`, { method: 'POST', body: JSON.stringify({ name, color: role.color, permissions: role.permissions, mentionable: false }) });
              if (!result.ok || !result.data?.id) throw problem(`تعذر إنشاء رتبة «${role.name}» (Discord ${result.status}).`, 409);
              current.roles.push(result.data); resourceId = result.data.id;
            }
          } else if (step.kind === 'category') {
            const name = run.mode === 'replace' ? stagingName(run.id, item) : item.name;
            const existing = current.channels.find(row => row.type === 4 && row.name === name);
            if (existing) resourceId = existing.id;
            else {
              const result = await call(`/guilds/${guild.id}/channels`, { method: 'POST', body: JSON.stringify({ name, type: 4 }) });
              if (!result.ok || !result.data?.id) throw problem(`تعذر إنشاء تصنيف «${item.name}» (Discord ${result.status}).`, 409);
              current.channels.push(result.data); resourceId = result.data.id;
            }
          } else if (step.kind === 'channel') {
            const channel = item.channel, parentId = map.get(`category:${item.parentKey}`);
            if (!parentId) throw problem('تصنيف القناة لم يكتمل بعد. حاول المتابعة.', 409);
            const name = run.mode === 'replace' ? stagingName(run.id, item) : channel.name;
            const existing = current.channels.find(row => row.name === name && row.type === channel.type && row.parent_id === parentId);
            if (existing) resourceId = existing.id;
            else {
              const roleId = channel.roleKey ? map.get(`role:${channel.roleKey}`) : null;
              const postRoleId = channel.postRoleKey ? map.get(`role:${channel.postRoleKey}`) : null;
              if (channel.access === 'private' && !roleId) throw problem('رتبة القناة الخاصة لم تجهز بعد.', 409);
              if (channel.postRoleKey && !postRoleId) throw problem('رتبة النشر في القناة لم تجهز بعد.', 409);
              const privileged = run.definition.roles.filter(role => role.preset === 'moderator').map(role => map.get(`role:${role.key}`)).filter(Boolean);
              const body = { name, type: channel.type, parent_id: parentId, permission_overwrites: everyoneOverwrite(guild.id, channel.access, [channel.access === 'read_only' ? postRoleId : roleId, ...privileged, botRole?.id].filter(Boolean)) };
              if (channel.type === 0 && channel.topic) body.topic = channel.topic;
              const result = await call(`/guilds/${guild.id}/channels`, { method: 'POST', body: JSON.stringify(body) });
              if (!result.ok || !result.data?.id) throw problem(`تعذر إنشاء قناة «${channel.name}» (Discord ${result.status}).`, 409);
              current.channels.push(result.data); resourceId = result.data.id;
            }
          } else if (step.kind === 'feature-welcome') {
            const feature = run.definition.features.welcome;
            resourceId = map.get(`channel:${feature.channelKey}`);
            if (!resourceId) throw problem('قناة الترحيب غير جاهزة.', 409);
            await pool.query(`INSERT INTO diskoko_welcome_cards(guild_id,request_id,channel_id,title,description,color,banner,avatar_position,banner_position,composite,avatar_vertical,avatar_radius,publishing_bot_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
              ON CONFLICT(guild_id) DO UPDATE SET request_id=EXCLUDED.request_id,channel_id=EXCLUDED.channel_id,title=EXCLUDED.title,description=EXCLUDED.description,color=EXCLUDED.color,banner=EXCLUDED.banner,avatar_position=EXCLUDED.avatar_position,banner_position=EXCLUDED.banner_position,composite=EXCLUDED.composite,avatar_vertical=EXCLUDED.avatar_vertical,avatar_radius=EXCLUDED.avatar_radius,publishing_bot_id=EXCLUDED.publishing_bot_id,updated_at=NOW()`, [guild.id, run.id, resourceId, feature.title, feature.description, parseInt(feature.color.slice(1), 16), feature.banner || null, feature.avatarPosition, feature.bannerPosition, feature.composite, feature.avatarVertical, feature.avatarRadius, bot.data.id]);
          } else if (step.kind === 'feature-ticket') {
            const feature = run.definition.features.ticket;
            resourceId = map.get(`channel:${feature.channelKey}`);
            if (!resourceId) throw problem('قناة الدعم غير جاهزة.', 409);
            const panelId = randomUUID();
            await pool.query('INSERT INTO diskoko_ticket_panels(id,request_id,guild_id,channel_id,message_id,title,description,category_id,staff_role_id) VALUES($1,$2,$3,$4,NULL,$5,$6,NULL,$7) ON CONFLICT(request_id) DO NOTHING', [panelId, run.id, guild.id, resourceId, feature.title, feature.description, map.get(`role:${feature.staffRoleKey}`) || null]);
            const panel = (await pool.query('SELECT id,message_id FROM diskoko_ticket_panels WHERE request_id=$1', [run.id])).rows[0];
            if (!panel.message_id) {
              const recent = await call(`/channels/${resourceId}/messages?limit=100`);
              if (!recent.ok || !Array.isArray(recent.data)) throw problem('تعذر فحص رسائل قناة الدعم قبل النشر. تحقق من صلاحية قراءة سجل الرسائل.', 409);
              const prior = recent.data.find(message => message.author?.id === bot.data.id && message.components?.some(row => row.components?.some(component => component.custom_id === `diskoko:ticket:${panel.id}`)));
              if (prior) await pool.query('UPDATE diskoko_ticket_panels SET message_id=$1 WHERE id=$2', [prior.id, panel.id]);
              else {
                const embed = { title: feature.title, description: feature.description, color: parseInt(feature.color.slice(1), 16) };
                let body;
                const payload = { embeds: [embed], components: [{ type: 1, components: [{ type: 2, style: 1, label: feature.buttonLabel, custom_id: `diskoko:ticket:${panel.id}` }] }], allowed_mentions: { parse: [] } };
                if (feature.banner) {
                  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[feature.banner.mime];
                  const filename = `support.${ext}`;
                  if (feature.imageStyle === 'logo') embed.thumbnail = { url: `attachment://${filename}` };
                  else if (feature.bannerPosition === 'above') payload.embeds.unshift({ image: { url: `attachment://${filename}` }, color: embed.color });
                  else embed.image = { url: `attachment://${filename}` };
                  const form = new FormData();
                  form.append('payload_json', JSON.stringify(payload));
                  form.append('files[0]', new Blob([Buffer.from(feature.banner.base64, 'base64')], { type: feature.banner.mime }), filename);
                  body = form;
                }
                const result = await call(`/channels/${resourceId}/messages`, { method: 'POST', body: body || JSON.stringify(payload) });
                if (!result.ok || !result.data?.id) throw problem(`تعذر نشر لوحة الدعم (Discord ${result.status}).`, 409);
                await pool.query('UPDATE diskoko_ticket_panels SET message_id=$1 WHERE id=$2', [result.data.id, panel.id]);
              }
            }
          } else if (step.kind === 'feature-logs') {
            const logs = run.definition.features.logs;
            resourceId = map.get(`channel:${logs.channelKey}`);
            if (!resourceId) throw problem('قناة السجل غير جاهزة.', 409);
            const routes = logs.mode === 'routed' ? logs.routes.map(rule => ({ key: rule.key, events: rule.events, sourceIds: [...rule.sourceIds, ...rule.sourceKeys.map(key => map.get(`channel:${key}`))], targetId: map.get(`channel:${rule.targetKey}`) })) : [];
            if (routes.some(rule => !rule.targetId || rule.sourceIds.some(id => !id))) throw problem('بعض قنوات مصادر اللوق أو وجهاته لم تجهز.', 409);
            await pool.query(`INSERT INTO guild_activity_log_routes(guild_id,publishing_bot_id,config) VALUES($1,$2,$3)
              ON CONFLICT(guild_id) DO UPDATE SET publishing_bot_id=EXCLUDED.publishing_bot_id,config=EXCLUDED.config,updated_at=NOW()`, [guild.id, bot.data.id, { mode: logs.mode, events: logs.events, targetId: resourceId, routes }]);
            await pool.query(`INSERT INTO bot_guild_settings(guild_id,log_channel_id) VALUES($1,$2)
              ON CONFLICT(guild_id) DO UPDATE SET log_channel_id=EXCLUDED.log_channel_id,updated_at=NOW()`, [guild.id, resourceId]);
          } else if (step.kind === 'feature-guide') {
            const guide = item.guide;
            resourceId = map.get(`channel:${guide.channelKey}`);
            if (!resourceId) throw problem(`قناة بطاقة «${guide.title}» لم تجهز بعد. تابع إنشاء القالب أولًا.`, 409);
            const recent = await call(`/channels/${resourceId}/messages?limit=100`);
            if (!recent.ok || !Array.isArray(recent.data)) throw problem(`تعذر التحقق من بطاقات قناة «${guide.title}». امنح البوت صلاحية قراءة سجل الرسائل ثم تابع.`, 409);
            const footer = `Diskoko · ${run.id.slice(0, 8)} · ${guide.key}`;
            const prior = recent.data.find(message => message.author?.id === bot.data.id && message.embeds?.some(embed => embed.footer?.text === footer));
            if (prior) resourceId = prior.id;
            else {
              const result = await call(`/channels/${resourceId}/messages`, { method: 'POST', body: JSON.stringify({ embeds: [{ title: guide.title, description: guide.description, color: 0x8d72e8, footer: { text: footer } }], allowed_mentions: { parse: [] } }) });
              if (!result.ok || !result.data?.id) throw problem(`تعذر نشر بطاقة «${guide.title}». تحقق من صلاحيات إرسال الرسائل والروابط المضمنة في قناتها.`, 409);
              resourceId = result.data.id;
            }
          } else if (step.kind === 'feature-module') {
            const module = item.module;
            const channelId = map.get(`channel:${module.channelKey}`);
            const reviewChannelId = module.reviewChannelKey ? map.get(`channel:${module.reviewChannelKey}`) : null;
            const staffRoleId = module.staffRoleKey ? map.get(`role:${module.staffRoleKey}`) : null;
            const roleId = module.roleKey ? map.get(`role:${module.roleKey}`) : null;
            if (!channelId || (module.reviewChannelKey && !reviewChannelId) || (module.staffRoleKey && !staffRoleId) || (module.roleKey && !roleId)) throw problem(`قنوات أو رتب ميزة «${module.title}» لم تجهز. تابع إنشاء القالب أولًا.`, 409);
            const panelId = randomUUID();
            await pool.query(`INSERT INTO ready_template_module_panels(id,run_id,module_key,guild_id,channel_id,review_channel_id,staff_role_id,role_id,publishing_bot_id,config)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(run_id,module_key) DO NOTHING`, [panelId, run.id, module.key, guild.id, channelId, reviewChannelId, staffRoleId, roleId, bot.data.id, module]);
            const panel = (await pool.query('SELECT id,message_id FROM ready_template_module_panels WHERE run_id=$1 AND module_key=$2', [run.id, module.key])).rows[0];
            if (!panel.message_id) {
              const recent = await call(`/channels/${channelId}/messages?limit=100`);
              if (!recent.ok || !Array.isArray(recent.data)) throw problem(`تعذر فحص قناة ميزة «${module.title}». امنح البوت قراءة سجل الرسائل.`, 409);
              const customId = `diskoko:module:${panel.id}`;
              const prior = recent.data.find(message => message.author?.id === bot.data.id && message.components?.some(row => row.components?.some(component => component.custom_id === customId)));
              if (prior) resourceId = prior.id;
              else {
                const embed = { title: module.title, description: module.description, color: parseInt(module.color.slice(1), 16) };
                const payload = { embeds: [embed], components: [{ type: 1, components: [{ type: 2, style: module.buttonStyle, label: module.buttonLabel, custom_id: customId }] }], allowed_mentions: { parse: [] } };
                let body;
                if (module.banner) {
                  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[module.banner.mime];
                  const filename = `feature.${ext}`;
                  embed.image = { url: `attachment://${filename}` };
                  const form = new FormData();
                  form.append('payload_json', JSON.stringify(payload));
                  form.append('files[0]', new Blob([Buffer.from(module.banner.base64, 'base64')], { type: module.banner.mime }), filename);
                  body = form;
                }
                const result = await call(`/channels/${channelId}/messages`, { method: 'POST', body: body || JSON.stringify(payload) });
                if (!result.ok || !result.data?.id) throw problem(`تعذر نشر ميزة «${module.title}». تحقق من صلاحيات إرسال الرسائل والروابط المضمنة.`, 409);
                resourceId = result.data.id;
              }
              await pool.query('UPDATE ready_template_module_panels SET message_id=$1 WHERE id=$2', [resourceId, panel.id]);
            } else resourceId = panel.message_id;
          } else if (step.kind === 'cleanup') {
            const oldIds = run.review.deletions.channels.map(row => row.id);
            const sending = (await pool.query("SELECT COUNT(*)::int AS count FROM scheduled_messages WHERE guild_id=$1 AND channel_id=ANY($2::text[]) AND status='sending'", [guild.id, oldIds])).rows[0].count;
            if (sending) throw problem('هناك رسالة تُرسل الآن في إحدى القنوات القديمة. انتظر اكتمالها ثم تابع الاستبدال.', 409);
            await pool.query("UPDATE scheduled_messages SET status='cancelled',updated_at=NOW() WHERE guild_id=$1 AND channel_id=ANY($2::text[]) AND status='scheduled'", [guild.id, oldIds]);
            await pool.query("UPDATE diskoko_giveaways SET status='paused',next_retry_at=NULL,last_error='أوقفه استبدال قالب السيرفر' WHERE guild_id=$1 AND channel_id=ANY($2::text[]) AND status='active'", [guild.id, oldIds]);
            await pool.query('DELETE FROM diskoko_ticket_panels WHERE guild_id=$1 AND channel_id=ANY($2::text[])', [guild.id, oldIds]);
            await pool.query('DELETE FROM ready_template_module_panels WHERE guild_id=$1 AND channel_id=ANY($2::text[])', [guild.id, oldIds]);
            if (!run.definition.features.welcome.enabled) await pool.query('DELETE FROM diskoko_welcome_cards WHERE guild_id=$1 AND channel_id=ANY($2::text[])', [guild.id, oldIds]);
            if (!run.definition.features.logs.enabled) {
              await pool.query('DELETE FROM guild_activity_log_routes WHERE guild_id=$1', [guild.id]);
              await pool.query('UPDATE bot_guild_settings SET log_channel_id=NULL,updated_at=NOW() WHERE guild_id=$1 AND log_channel_id=ANY($2::text[])', [guild.id, oldIds]);
            }
          } else if (step.kind === 'delete-channel') {
            const target = current.channels.find(row => row.id === resourceId);
            if (target) {
              const result = await call(`/channels/${resourceId}`, { method: 'DELETE' });
              if (!result.ok && result.status !== 404) throw problem(`تعذر حذف القناة القديمة «${step.name}» (Discord ${result.status}).`, 409);
              current.channels = current.channels.filter(row => row.id !== resourceId);
            }
          } else if (step.kind === 'delete-role') {
            const target = current.roles.find(row => row.id === resourceId);
            if (target) {
              if (!botRole || target.managed || target.id === guild.id || target.position >= botRole.position) throw problem(`لن نحذف رتبة «${step.name}» لأنها محمية أو أعلى من رتبة البوت.`, 409);
              const result = await call(`/guilds/${guild.id}/roles/${resourceId}`, { method: 'DELETE' });
              if (!result.ok && result.status !== 404) throw problem(`تعذر حذف الرتبة القديمة «${step.name}» (Discord ${result.status}).`, 409);
              current.roles = current.roles.filter(row => row.id !== resourceId);
            }
          } else if (step.kind === 'finalize') {
            const originalKey = step.step_key.slice('finalize:'.length);
            const original = byKey.get(originalKey);
            resourceId = map.get(originalKey);
            if (!original || !resourceId) throw problem('تعذر العثور على العنصر الجديد لإنهاء اسمه.', 409);
            const target = original.kind === 'role' ? current.roles.find(row => row.id === resourceId) : current.channels.find(row => row.id === resourceId);
            if (!target) throw problem('العنصر الجديد لم يعد موجودًا. أعد المراجعة.', 409);
            if (target.name !== original.name) {
              const endpoint = original.kind === 'role' ? `/guilds/${guild.id}/roles/${resourceId}` : `/channels/${resourceId}`;
              const result = await call(endpoint, { method: 'PATCH', body: JSON.stringify({ name: original.name }) });
              if (!result.ok) throw problem(`تعذر إنهاء اسم «${original.name}» (Discord ${result.status}).`, 409);
              target.name = original.name;
            }
          } else if (step.kind === 'order') {
            const positions = run.definition.categories.flatMap((category, groupIndex) => [
              { id: map.get(`category:${category.key}`), position: groupIndex },
              ...category.channels.map((channel, channelIndex) => ({ id: map.get(`channel:${channel.key}`), position: channelIndex, parent_id: map.get(`category:${category.key}`) })),
            ]);
            if (positions.some(item => !item.id)) throw problem('بعض القنوات غير مكتملة؛ تعذر ترتيبها.', 409);
            const channelResult = await call(`/guilds/${guild.id}/channels`, { method: 'PATCH', body: JSON.stringify(positions) });
            if (!channelResult.ok) throw problem(`تعذر ترتيب القنوات (Discord ${channelResult.status}).`, 409);
            const rolePositions = run.definition.roles.map((role, index) => ({ id: map.get(`role:${role.key}`), position: run.definition.roles.length - index }));
            if (rolePositions.some(item => !item.id)) throw problem('بعض الرتب غير مكتملة؛ تعذر ترتيبها.', 409);
            if (rolePositions.length) {
              const roleResult = await call(`/guilds/${guild.id}/roles`, { method: 'PATCH', body: JSON.stringify(rolePositions) });
              if (!roleResult.ok) throw problem(`ترتبت القنوات لكن تعذر ترتيب الرتب (Discord ${roleResult.status}).`, 409);
            }
          }
          await pool.query("UPDATE ready_template_steps SET status='succeeded',resource_id=$3,error=NULL,updated_at=NOW() WHERE run_id=$1 AND step_key=$2", [run.id, step.step_key, resourceId]);
          if (resourceId) map.set(step.step_key, resourceId);
        } catch (error) {
          await pool.query("UPDATE ready_template_steps SET status='failed',error=$3,updated_at=NOW() WHERE run_id=$1 AND step_key=$2", [run.id, step.step_key, error.message]);
          if ((await pool.query('SELECT status FROM ready_template_runs WHERE id=$1', [run.id])).rows[0]?.status === 'cancel_requested') return res.json(await finishCancellation(run));
          const failed = await pool.query("UPDATE ready_template_runs SET status='failed',error=$2,updated_at=NOW() WHERE id=$1 AND status='running' RETURNING status", [run.id, error.message]);
          if (!failed.rows.length) return res.json(await finishCancellation(run));
          await audit(req.user.id, 'ready_template.failed', 'guild', guild.id, { run_id: run.id, step: step.step_key, error: error.message });
          return res.status(409).json({ ...(await runState({ ...run, status: 'failed', error: error.message })), error: error.message });
        }
      }
      if ((await pool.query('SELECT status FROM ready_template_runs WHERE id=$1', [run.id])).rows[0]?.status === 'cancel_requested') return res.json(await finishCancellation(run));
      const remaining = (await pool.query("SELECT COUNT(*)::int AS count FROM ready_template_steps WHERE run_id=$1 AND status<>'succeeded'", [run.id])).rows[0].count;
      if (!remaining) {
        const completed = await pool.query("UPDATE ready_template_runs SET status='succeeded',updated_at=NOW() WHERE id=$1 AND status='running' RETURNING status", [run.id]);
        if (!completed.rows.length) return res.json(await finishCancellation(run));
        await audit(req.user.id, 'ready_template.apply', 'guild', guild.id, { run_id: run.id, mode: run.mode });
      }
      res.json(await runState({ ...run, status: remaining ? 'running' : 'succeeded' }));
    } finally { if (acquired) await lock.query('SELECT pg_advisory_unlock(hashtext($1))', [`diskoko:${guild.id}`]); lock.release(); }
  }));
}

