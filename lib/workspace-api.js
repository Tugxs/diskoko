import { problem, normalizeOperations, operationBody, operationUnits, planUsageUnits, channelReorderEntries, resolveExisting, checkExistingAccess, checkConflict, connectionState, normalizeSchedule } from './workspace-domain.js';
import { PermissionFlagsBits } from 'discord.js';
import sharp from 'sharp';

export async function migrateWorkspace(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspace_preferences (
      guild_id TEXT PRIMARY KEY, analytics_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      analytics_started_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS community_activity (
      guild_id TEXT NOT NULL, day DATE NOT NULL DEFAULT CURRENT_DATE,
      user_id TEXT NOT NULL, channel_id TEXT NOT NULL, display_name TEXT NOT NULL,
      messages INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(guild_id,day,user_id,channel_id)
    );
    CREATE TABLE IF NOT EXISTS scheduled_messages (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id),
      guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, content TEXT NOT NULL,
      run_at TIMESTAMPTZ NOT NULL, repeat TEXT NOT NULL DEFAULT 'once', timezone TEXT NOT NULL DEFAULT 'UTC',
      status TEXT NOT NULL DEFAULT 'scheduled', last_error TEXT, message_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS scheduled_messages_due ON scheduled_messages(status,run_at);
    CREATE INDEX IF NOT EXISTS scheduled_messages_overview ON scheduled_messages(user_id,guild_id,run_at) WHERE status='scheduled';
    CREATE INDEX IF NOT EXISTS change_sets_overview ON change_sets(user_id,guild_id,status);
    CREATE INDEX IF NOT EXISTS community_activity_guild_day ON community_activity(guild_id,day);
    CREATE TABLE IF NOT EXISTS workspace_alert_dismissals (
      user_id BIGINT NOT NULL REFERENCES users(id), guild_id TEXT NOT NULL,
      kind TEXT NOT NULL, resource_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(user_id,guild_id,kind,resource_id)
    );
    CREATE INDEX IF NOT EXISTS workspace_alert_dismissals_lookup ON workspace_alert_dismissals(user_id,guild_id);
    ALTER TABLE change_sets ADD COLUMN IF NOT EXISTS usage_units INT NOT NULL DEFAULT 1;
  `);
}

export function mountWorkspace(app, deps) {
  const { pool, requireUser, requireWriteAccess, authorizedGuild, discordBotFetch: discord, audit, requirePlanCapacity, entitlementsFor, templates, makeTemplatePlan, botStatus } = deps;
  const route = fn => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
  async function guildFor(req) {
    const guild = await authorizedGuild(req.user, req.params.guildId || req.body.guildId);
    if (!guild) throw problem('لا تملك صلاحية إدارة هذا السيرفر. اختر سيرفرًا آخر أو أعد ربط حساب Discord.', 403);
    return guild;
  }
  async function snapshot(guildId) {
    const [channels, roles] = await Promise.all([discord(`/guilds/${guildId}/channels`), discord(`/guilds/${guildId}/roles`)]);
    if (!channels.ok || !roles.ok) throw problem('تعذر قراءة القنوات والرتب. تحقق من اتصال البوت وصلاحياته ثم أعد المحاولة.', 502);
    return { guildId, channels: channels.data, roles: roles.data };
  }
  app.get('/api/workspace/:guildId/members/search', requireUser, route(async (req, res) => {
    const guild = await guildFor(req);
    const query = String(req.query.q || '').trim();
    if (query.length < 2 || query.length > 32) throw problem('اكتب حرفين على الأقل من اسم العضو.', 400);
    const endpoint = /^\d{15,22}$/.test(query)
      ? `/guilds/${guild.id}/members/${query}`
      : `/guilds/${guild.id}/members/search?query=${encodeURIComponent(query)}&limit=10`;
    const result = await discord(endpoint);
    if (!result.ok) throw problem('تعذر البحث عن الأعضاء الآن. تحقق من اتصال البوت ثم حاول باسم أدق.', 503);
    const members = (Array.isArray(result.data) ? result.data : [result.data]).filter(Boolean).map(member => ({
      id: String(member.user?.id || ''),
      name: String(member.nick || member.user?.global_name || member.user?.username || 'عضو'),
      username: String(member.user?.username || ''),
      roles: Array.isArray(member.roles) ? member.roles.map(String) : [],
    })).filter(member => /^\d{15,22}$/.test(member.id));
    res.json({ members });
  }));
  app.get('/api/workspace/:guildId', requireUser, route(async (req, res) => {
    const guild = await guildFor(req);
    const [remote, channels, roles, changes, events, preferences, draft, publications, failedSchedules, pausedGiveaways, changeTotals, scheduleTotals, readyRuns, failedAi, upcomingSchedules, sentSchedules, dismissals] = await Promise.all([
      discord(`/guilds/${guild.id}?with_counts=true`), discord(`/guilds/${guild.id}/channels`), discord(`/guilds/${guild.id}/roles`),
      pool.query("SELECT c.id,c.template_key,c.status,c.plan,c.usage_units,c.created_at,c.updated_at,COALESCE((SELECT SUM((o.result->>'usage_units')::int) FROM change_operations o WHERE o.change_set_id=c.id AND o.status='succeeded' AND o.result ? 'usage_units'),0)::int AS completed_units FROM change_sets c WHERE c.user_id=$1 AND c.guild_id=$2 ORDER BY c.updated_at DESC LIMIT 50", [req.user.id, guild.id]),
      pool.query("SELECT id,action,details,created_at FROM audit_logs WHERE actor_user_id=$1 AND ((target_type='guild' AND target_id=$2) OR details->>'guild_id'=$2 OR details->>'guildId'=$2) ORDER BY created_at DESC LIMIT 50", [req.user.id, guild.id]),
      pool.query('SELECT * FROM workspace_preferences WHERE guild_id=$1', [guild.id]),
      pool.query('SELECT id,name,design,updated_at FROM projects WHERE user_id=$1 AND guild_id=$2 ORDER BY updated_at DESC LIMIT 1', [req.user.id, guild.id]),
      pool.query("SELECT id,proposal,interactive_kind,interactive_channel_id,interactive_message_id,sent_channel_id,sent_message_id,COALESCE(published_at,completed_at,created_at) AS published_at FROM ai_requests WHERE user_id=$1 AND guild_id=$2 AND (interactive_message_id IS NOT NULL OR sent_message_id IS NOT NULL OR interactive_kind='welcome') ORDER BY COALESCE(published_at,completed_at,created_at) DESC LIMIT 50", [req.user.id, guild.id]),
      pool.query("SELECT s.id,s.channel_id,s.last_error,s.updated_at FROM scheduled_messages s WHERE s.user_id=$1 AND s.guild_id=$2 AND s.status='failed' AND NOT EXISTS (SELECT 1 FROM workspace_alert_dismissals d WHERE d.user_id=$1 AND d.guild_id=$2 AND d.kind='schedule' AND d.resource_id=s.id::text) ORDER BY s.updated_at DESC LIMIT 20", [req.user.id, guild.id]),
      pool.query("SELECT g.id,g.channel_id,g.prize,g.status,g.last_error,g.failure_count,g.next_retry_at,g.ends_at FROM diskoko_giveaways g WHERE g.guild_id=$1 AND (g.status='paused' OR (g.status='ended' AND g.announced_at IS NULL AND g.next_retry_at IS NOT NULL)) AND NOT EXISTS (SELECT 1 FROM workspace_alert_dismissals d WHERE d.user_id=$2 AND d.guild_id=$1 AND d.kind='giveaway' AND d.resource_id=g.id::text) ORDER BY g.ends_at DESC LIMIT 20", [guild.id, req.user.id]),
      pool.query("SELECT count(*) FILTER (WHERE status='draft')::int AS drafts,count(*) FILTER (WHERE status='running')::int AS running,count(*) FILTER (WHERE status='failed')::int AS failed FROM change_sets WHERE user_id=$1 AND guild_id=$2", [req.user.id, guild.id]),
      pool.query("SELECT count(*)::int AS upcoming,min(run_at) AS next_at FROM scheduled_messages WHERE user_id=$1 AND guild_id=$2 AND status='scheduled' AND run_at>=NOW()", [req.user.id, guild.id]),
      pool.query("SELECT id,definition->>'name' AS name,status,error,updated_at FROM ready_template_runs WHERE user_id=$1 AND guild_id=$2 AND status IN ('draft','running','failed') ORDER BY updated_at DESC LIMIT 20", [req.user.id, guild.id]),
      pool.query("SELECT id,status,error,created_at,completed_at FROM ai_requests WHERE user_id=$1 AND guild_id=$2 AND status='failed' ORDER BY created_at DESC LIMIT 20", [req.user.id, guild.id]),
      pool.query("SELECT id,run_at,repeat,channel_id FROM scheduled_messages WHERE user_id=$1 AND guild_id=$2 AND status='scheduled' AND run_at>=NOW() ORDER BY run_at LIMIT 10", [req.user.id, guild.id]),
      pool.query("SELECT id,channel_id,message_id,updated_at FROM scheduled_messages WHERE user_id=$1 AND guild_id=$2 AND status='sent' AND message_id IS NOT NULL ORDER BY updated_at DESC LIMIT 20", [req.user.id, guild.id]),
      pool.query('SELECT kind,resource_id,created_at FROM workspace_alert_dismissals WHERE user_id=$1 AND guild_id=$2', [req.user.id, guild.id]),
    ]);
    const status = connectionState(remote);
    // A transient upstream error must never be stored as an uninstalled bot.
    if (status !== 'unavailable') await pool.query("INSERT INTO guild_connections(user_id,guild_id,guild_name,install_status,last_verified_at,updated_at) VALUES($1,$2,$3,$4,NOW(),NOW()) ON CONFLICT(user_id,guild_id) DO UPDATE SET guild_name=EXCLUDED.guild_name,install_status=EXCLUDED.install_status,last_verified_at=NOW(),last_error=NULL,updated_at=NOW()", [req.user.id, guild.id, remote.data?.name || guild.name, status]);
    const readable = channels.ok && roles.ok;
    const hidden = new Set(dismissals.rows.filter(row => !['bot','connection'].includes(row.kind) || Date.now() - new Date(row.created_at).getTime() < 24 * 60 * 60 * 1000).map(row => `${row.kind}:${row.resource_id}`));
    const bot = botStatus();
    const alerts = [
      ...(!bot.online ? [{ id: 'offline', kind: 'bot', title: 'البوت غير متصل', detail: 'تحقق من تشغيل البوت وربطه قبل تنفيذ التغييرات.', target: 'settings', severity: 'critical', source: 'bot' }] : []),
      ...(status !== 'installed' || !readable ? [{ id: status, kind: 'connection', title: 'اتصال السيرفر يحتاج مراجعة', detail: status === 'unavailable' ? 'تعذر التحقق من Discord مؤقتًا؛ لم نغيّر حالة الربط.' : 'راجع ربط البوت وصلاحيات قراءة السيرفر.', target: 'settings', severity: 'critical', source: 'connection' }] : []),
      ...changes.rows.filter(row => row.status === 'failed' || row.status === 'draft').map(row => ({ id: String(row.id), kind: 'change', title: row.status === 'failed' ? `تعثر تعديل: ${row.plan?.name || 'بنية السيرفر'}` : `تغيير ينتظر المراجعة: ${row.plan?.name || 'بنية السيرفر'}`, detail: row.status === 'failed' ? 'افتح خطة التغيير لمعرفة ما نُفّذ وما تعثر قبل إعادة المحاولة.' : 'هذه خطة محفوظة ولم تُنفذ على Discord بعد.', target: 'activity', severity: row.status === 'failed' ? 'critical' : 'action', source: 'channels', createdAt: row.updated_at })),
      ...readyRuns.rows.map(row => ({ id: row.id, kind: 'template', title: row.status === 'failed' ? `تعثر تنصيب قالب: ${row.name || 'قالب جاهز'}` : row.status === 'running' ? `قالب قيد التنفيذ: ${row.name || 'قالب جاهز'}` : `قالب ينتظر التنفيذ: ${row.name || 'قالب جاهز'}`, detail: row.error || (row.status === 'running' ? 'تابع تقدم الخطوات من صفحة القوالب.' : 'راجع الخطوات والصلاحيات قبل التنفيذ.'), target: 'ready-templates', severity: row.status === 'failed' ? 'critical' : 'action', source: 'templates', createdAt: row.updated_at })),
      ...failedAi.rows.map(row => ({ id: row.id, kind: 'ai', title: 'تعثر طلب ديسكوكو AI', detail: row.error || 'افتح المحادثة وراجع الطلب قبل المحاولة مرة أخرى.', target: 'assistant', severity: 'critical', source: 'ai', createdAt: row.completed_at || row.created_at })),
      ...pausedGiveaways.rows.map(row => ({ id: row.id, kind: 'giveaway', title: `${row.status === 'paused' ? 'توقف' : 'تأخر'} إعلان الجيف أوي: ${row.prize}`, detail: row.status !== 'paused' ? 'تنتظر المهمة إعادة محاولة بعد إخفاق سابق. يمكنك إيقاف المحاولات الآن.' : row.last_error === 'Discord 404' ? 'رسالة الجيف أوي الأصلية غير متاحة. أوقفنا المحاولات تلقائيًا؛ أنشئ جيف أوي جديدًا إذا رغبت.' : `أوقفنا المحاولات بعد ${row.failure_count} إخفاقات. يمكنك طلب محاولة واحدة بعد مراجعة القناة.`, channelId: row.channel_id, retryable: row.status === 'paused' && row.last_error !== 'Discord 404', stoppable: row.status !== 'paused', severity: 'critical', source: 'giveaways', createdAt: row.ends_at })),
      ...failedSchedules.rows.map(row => ({ id: row.id, kind: 'schedule', title: 'توقفت رسالة مجدولة', detail: row.last_error || 'راجع القناة والصلاحيات ثم أنشئ المهمة من جديد.', target: 'automation', severity: 'critical', source: 'schedules', createdAt: row.updated_at })),
    ].filter(item => !hidden.has(`${item.kind}:${item.id}`)).sort((a, b) => Number(b.severity === 'critical') - Number(a.severity === 'critical') || new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const upcoming = upcomingSchedules.rows.map(row => ({ id: String(row.id), kind: 'upcoming', title: 'رسالة مجدولة قادمة', detail: `موعد الإرسال ${new Date(row.run_at).toLocaleString('ar-SA')}`, target: 'automation', source: 'schedules', createdAt: row.run_at })).filter(item => !hidden.has(`upcoming:${item.id}`));
    const recent = [
      ...events.rows.filter(row => !['login','login.google'].includes(row.action)).map(row => ({ id: String(row.id), kind: 'event', title: ({ 'change_set.apply': 'طُبقت خطة تغيير', 'change_set.failed': 'تعثر تطبيق خطة تغيير', 'ready_template.apply': 'نُصّب قالب جاهز', 'ready_template.failed': 'تعثر تنصيب قالب', 'schedule.create': 'جُدولت رسالة', 'schedule.cancel': 'أُلغيت رسالة مجدولة', 'bot.settings.update': 'تغيّرت إعدادات البوت والأوامر', 'ai.bot.connect': 'رُبط بوت العميل', 'ai.bot.disconnect': 'أُلغي ربط بوت العميل', 'guild.verify': 'تم التحقق من ربط السيرفر', 'custom_bot.update': 'تحدّث تصميم بوت', 'custom_template.update': 'تحدّث قالب مخصص' })[row.action] || 'تغيّر إعداد في السيرفر', detail: row.details?.error || '', target: 'activity', source: 'history', createdAt: row.created_at })),
      ...publications.rows.map(row => ({ id: String(row.id), kind: 'publication', title: row.interactive_kind === 'welcome' ? 'فُعّل ترحيب جديد' : row.interactive_kind === 'rules' ? 'نُشرت قوانين السيرفر' : row.interactive_kind === 'giveaway' ? 'نُشر جيف أوي' : row.interactive_kind === 'tickets' ? 'نُشرت لوحة الدعم' : row.interactive_kind === 'scheduled_event' ? 'أُنشئ حدث Discord' : 'نُشر محتوى من ديسكوكو AI', detail: '', target: 'activity', source: 'ai', channelId: row.interactive_channel_id || row.sent_channel_id, messageId: row.interactive_message_id || row.sent_message_id, createdAt: row.published_at })),
      ...sentSchedules.rows.map(row => ({ id: String(row.id), kind: 'sent_schedule', title: 'أرسل البوت رسالة مجدولة', detail: '', target: 'automation', source: 'schedules', channelId: row.channel_id, messageId: row.message_id, createdAt: row.updated_at })),
    ].filter(item => !hidden.has(`${item.kind}:${item.id}`)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 30);
    res.json({ guild: { ...guild, name: remote.ok ? remote.data.name : guild.name, owner_id: remote.ok ? remote.data.owner_id : null, features: remote.ok ? remote.data.features || [] : [] }, connection: { status, checked_at: new Date().toISOString(), readable },
      bot, channels: channels.ok ? channels.data : null, roles: roles.ok ? roles.data : null,
      emojis: remote.ok && Array.isArray(remote.data?.emojis) ? remote.data.emojis.filter(emoji => /^\d{15,22}$/.test(String(emoji.id || '')) && /^[A-Za-z0-9_]{2,32}$/.test(String(emoji.name || '')) && emoji.available !== false).map(emoji => ({ id: emoji.id, name: emoji.name, animated: emoji.animated === true })) : [],
      members: remote.ok ? (remote.data.approximate_member_count ?? null) : null,
      onlineMembers: remote.ok ? (remote.data.approximate_presence_count ?? null) : null,
      changeSets: changes.rows, publications: publications.rows, activity: events.rows, alerts, upcoming, recent, draft: draft.rows[0] || null,
      overview: { changes: changeTotals.rows[0], schedules: scheduleTotals.rows[0] },
      preferences: preferences.rows[0] || { analytics_enabled: false, analytics_started_at: null },
    });
  }));
  app.post('/api/workspace/:guildId/alerts/:kind/:id/dismiss', requireUser, requireWriteAccess, route(async (req, res) => {
    const guild = await guildFor(req);
    const kind = req.params.kind;
    if (!['giveaway','schedule','bot','connection','change','template','ai','upcoming','event','publication','sent_schedule'].includes(kind) || String(req.params.id).length > 120) throw problem('نوع التنبيه غير صالح.', 400);
    if (['giveaway','schedule','change','upcoming','event','sent_schedule'].includes(kind) && !/^\d+$/.test(req.params.id) || ['template','ai','publication'].includes(kind) && !/^[0-9a-f-]{36}$/i.test(req.params.id)) throw problem('معرّف التنبيه غير صالح.', 400);
    const checks = {
      giveaway: ["SELECT id FROM diskoko_giveaways WHERE id=$1 AND guild_id=$2 AND status IN ('paused','ended')", [req.params.id, guild.id]],
      schedule: ["SELECT id FROM scheduled_messages WHERE id=$1 AND guild_id=$2 AND user_id=$3 AND status='failed'", [req.params.id, guild.id, req.user.id]],
      change: ["SELECT id FROM change_sets WHERE id=$1 AND guild_id=$2 AND user_id=$3 AND status IN ('draft','failed')", [req.params.id, guild.id, req.user.id]],
      template: ["SELECT id FROM ready_template_runs WHERE id=$1 AND guild_id=$2 AND user_id=$3 AND status IN ('draft','running','failed')", [req.params.id, guild.id, req.user.id]],
      ai: ["SELECT id FROM ai_requests WHERE id=$1 AND guild_id=$2 AND user_id=$3 AND status='failed'", [req.params.id, guild.id, req.user.id]],
      upcoming: ["SELECT id FROM scheduled_messages WHERE id=$1 AND guild_id=$2 AND user_id=$3 AND status='scheduled'", [req.params.id, guild.id, req.user.id]],
      event: ["SELECT id FROM audit_logs WHERE id=$1 AND actor_user_id=$3 AND ((target_type='guild' AND target_id=$2) OR details->>'guild_id'=$2 OR details->>'guildId'=$2)", [req.params.id, guild.id, req.user.id]],
      publication: ["SELECT id FROM ai_requests WHERE id=$1 AND user_id=$3 AND guild_id=$2 AND (sent_message_id IS NOT NULL OR interactive_message_id IS NOT NULL OR interactive_kind='welcome')", [req.params.id, guild.id, req.user.id]],
      sent_schedule: ["SELECT id FROM scheduled_messages WHERE id=$1 AND guild_id=$2 AND user_id=$3 AND status='sent'", [req.params.id, guild.id, req.user.id]],
    };
    if (checks[kind]) { const [sql, params] = checks[kind]; if (!(await pool.query(sql, params)).rowCount) throw problem('هذا التنبيه لم يعد متاحًا.', 404); }
    if (kind === 'bot' && req.params.id !== 'offline' || kind === 'connection' && !['install_required','permissions_insufficient','unavailable'].includes(req.params.id)) throw problem('التنبيه غير صالح.', 400);
    await pool.query('INSERT INTO workspace_alert_dismissals(user_id,guild_id,kind,resource_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [req.user.id, guild.id, kind, String(req.params.id)]);
    res.json({ ok: true });
  }));
  app.post('/api/workspace/:guildId/alerts/giveaway/:id/retry', requireUser, requireWriteAccess, route(async (req, res) => {
    const guild = await guildFor(req);
    const result = await pool.query("UPDATE diskoko_giveaways SET status='ended',failure_count=4,next_retry_at=NOW(),last_error=NULL WHERE id=$1 AND guild_id=$2 AND status='paused' AND last_error IS DISTINCT FROM 'Discord 404' RETURNING id", [req.params.id, guild.id]);
    if (!result.rowCount) throw problem('لا يمكن إعادة المحاولة لهذه المهمة. تحقق من الرسالة الأصلية أو أنشئ جيف أوي جديدًا.', 409);
    await pool.query("DELETE FROM workspace_alert_dismissals WHERE guild_id=$1 AND kind='giveaway' AND resource_id=$2", [guild.id, String(req.params.id)]);
    res.json({ ok: true, message: 'ستجرى محاولة واحدة، ثم تتوقف المهمة تلقائيًا إذا فشلت.' });
  }));
  app.post('/api/workspace/:guildId/alerts/giveaway/:id/pause', requireUser, requireWriteAccess, route(async (req, res) => {
    const guild = await guildFor(req);
    const result = await pool.query("UPDATE diskoko_giveaways SET status='paused',next_retry_at=NULL,last_error='أوقف المدير المحاولات' WHERE id=$1 AND guild_id=$2 AND status='ended' AND announced_at IS NULL RETURNING id", [req.params.id, guild.id]);
    if (!result.rowCount) throw problem('هذه المهمة لم تعد تنتظر إعادة المحاولة.', 409);
    res.json({ ok: true });
  }));
  app.get('/api/workspace-templates', requireUser, (_req, res) => res.json({ templates: Object.entries(templates).map(([key, template]) => ({ key, ...template, operations: makeTemplatePlan(key).operations })) }));

  app.post('/api/change-sets', requireUser, requireWriteAccess, route(async (req, res) => {
    const guild = await guildFor(req);
    const current = await snapshot(guild.id);
    let client;
    try {
      let plan;
      const aiRequestId = String(req.body.aiRequestId || '');
      if (aiRequestId) throw problem('قوالب إنشاء القنوات والرتب من AI أزيلت مؤقتًا. استخدم أدوات الاستوديو اليدوية أو اختر قالبًا جاهزًا من المكتبة.', 409);
      else if (Array.isArray(req.body.operations)) plan = { template_key: 'custom', name: 'تعديلات القنوات والرتب', operations: normalizeOperations(req.body.operations, current) };
      else {
        if (!Object.hasOwn(templates, req.body.templateKey)) throw problem('القالب غير موجود.');
        plan = makeTemplatePlan(req.body.templateKey);
      }
      const memberTargets = [...new Set(plan.operations.flatMap(op => (op.permission_overwrites || []).filter(row => {
        if (Number(row.type) !== 1) return false;
        const before = op.before?.permission_overwrites?.find(entry => String(entry.id) === String(row.id) && Number(entry.type) === 1);
        return !before || String(before.allow || '0') !== String(row.allow || '0') || String(before.deny || '0') !== String(row.deny || '0');
      }).map(row => row.id)))];
      if (memberTargets.length > 10) throw problem('يمكن تخصيص صلاحيات عشرة أعضاء في الخطة الواحدة. قسّم التغيير إلى خطتين.');
      for (const memberId of memberTargets) {
        const member = await discord(`/guilds/${guild.id}/members/${memberId}`);
        if (!member.ok || String(member.data?.user?.id) !== memberId) throw problem(`العضو ${memberId} غير موجود في السيرفر أو تعذر التحقق منه. لم تُرسل أي تغييرات.`, 409);
      }
      for (const op of plan.operations.filter(item => item.icon)) {
        const bytes = Buffer.from(op.icon.slice(op.icon.indexOf(',') + 1), 'base64');
        if (bytes.length > 256 * 1024) throw problem('رمز الرتبة يتجاوز 256 كيلوبايت. صغّر الصورة قبل حفظ الخطة.');
        let metadata;
        try { metadata = await sharp(bytes, { limitInputPixels: 4096 }).metadata(); } catch { throw problem('تعذر قراءة صورة رمز الرتبة. ارفع صورة PNG أو JPEG أو WebP ثابتة.'); }
        if (!['png','jpeg','webp'].includes(metadata.format) || metadata.pages > 1 || metadata.width !== 64 || metadata.height !== 64) throw problem('رمز الرتبة يجب أن يكون صورة ثابتة بمقاس 64×64 بكسل.');
      }
      if (plan.operations.some(op => Object.hasOwn(op, 'bitrate') || Object.hasOwn(op, 'colors') || Object.hasOwn(op, 'unicode_emoji') || Object.hasOwn(op, 'icon'))) {
        const server = await discord(`/guilds/${guild.id}`);
        if (!server.ok) throw problem('تعذر التحقق من ميزات السيرفر وحدود جودة الصوت. حاول لاحقًا.', 503);
        const maxBitrate = [96000,128000,256000,384000][Math.min(3, Math.max(0, Number(server.data?.premium_tier || 0)))];
        if (plan.operations.some(op => Number(op.bitrate || 0) > maxBitrate)) throw problem(`الحد الأقصى لجودة الصوت في سيرفرك ${maxBitrate / 1000} كيلوبت/ثانية. خفّض القيمة قبل المراجعة.`, 400);
        const features = server.data?.features || [];
        if (plan.operations.some(op => op.unicode_emoji || op.icon) && !features.includes('ROLE_ICONS')) throw problem('رفع رمز الرتبة يتطلب مستوى تعزيز السيرفر الثاني أو تفعيل ميزة ROLE_ICONS. لم تُرسل أي تغييرات.', 400);
        if (plan.operations.some(op => op.colors?.secondary_color !== null && op.colors?.secondary_color !== undefined) && !features.includes('ENHANCED_ROLE_COLORS')) throw problem('ألوان الرتب المتدرجة تتطلب ميزة ENHANCED_ROLE_COLORS في السيرفر. لم تُرسل أي تغييرات.', 400);
      }
      const regions = plan.operations.filter(op => op.rtc_region).map(op => op.rtc_region);
      if (regions.length) {
        const available = await discord('/voice/regions');
        if (!available.ok || regions.some(region => !available.data?.some(entry => entry.id === region))) throw problem('منطقة الصوت المختارة غير متاحة. اختر تلقائي أو منطقة مدعومة.', 400);
      }
      client = await pool.connect();
      await client.query('BEGIN');
      const usageUnits = planUsageUnits(plan.operations);
      if (!usageUnits) throw problem('لم تتغير أي إعدادات. عدّل خيارًا واحدًا على الأقل قبل حفظ الخطة.');
      const capacity = await requirePlanCapacity(req.user, 'changeSetsPerMonth', client);
      if (capacity.used + usageUnits > capacity.limit) throw problem(`هذه الخطة تحتاج ${usageUnits} تغييرًا، والمتبقي من باقتك ${Math.max(0, capacity.limit - capacity.used)}.`, 402);
      const { rows } = await client.query("INSERT INTO change_sets(user_id,guild_id,template_key,status,plan,usage_units) VALUES($1,$2,$3,'draft',$4,$5) RETURNING *", [req.user.id, guild.id, plan.template_key, plan, usageUnits]);
      const changeSet = rows[0];
      await client.query("INSERT INTO change_operations(change_set_id,operation_key,resource_type,result) SELECT $1,item->>'operation_key',item->>'resource_type',item FROM jsonb_array_elements($2::jsonb->'operations') item", [changeSet.id, JSON.stringify(plan)]);
      if (aiRequestId) await client.query('UPDATE ai_requests SET change_set_id=$1 WHERE id=$2 AND user_id=$3', [changeSet.id, aiRequestId, req.user.id]);
      await client.query('COMMIT');
      await audit(req.user.id, 'change_set.create', 'change_set', changeSet.id, { guild_id: guild.id });
      res.status(201).json({ changeSet, plan });
    } catch (error) { if (client) await client.query('ROLLBACK'); throw error; } finally { client?.release(); }
  }));
  app.post('/api/change-sets/:id/apply', requireUser, requireWriteAccess, route(async (req, res) => {
    const changeSet = (await pool.query('SELECT * FROM change_sets WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])).rows[0];
    if (!changeSet) throw problem('خطة التغيير غير موجودة.', 404);
    if (req.body.confirmed !== true || String(req.body.guildId) !== changeSet.guild_id) throw problem('راجع التغييرات وأكد السيرفر المستهدف قبل التطبيق.');
    if (!await authorizedGuild(req.user, changeSet.guild_id)) throw problem('لم تعد تملك صلاحية إدارة هذا السيرفر.', 403);
    const lock = await pool.connect(); let acquired = false;
    try {
      // Serialize all plans for this guild, including across service instances.
      acquired = (await lock.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [`diskoko:${changeSet.guild_id}`])).rows[0].locked;
      if (!acquired) throw problem('هناك عملية أخرى قيد التنفيذ لهذا السيرفر. انتظر اكتمالها.', 409);
      const latestStatus = (await lock.query('SELECT status FROM change_sets WHERE id=$1', [changeSet.id])).rows[0]?.status;
      if (latestStatus === 'succeeded') return res.json({ ok: true, status: 'succeeded', changeSetId: changeSet.id, alreadyApplied: true });
      if (latestStatus === 'failed' || latestStatus === 'cancelled') throw problem('توقفت هذه الخطة بعد تعثرها. راجع السبب، عدّل الإعداد أو صلاحية البوت، ثم أنشئ مراجعة جديدة. لن يُرسل الطلب نفسه مرة ثانية.', 409);
      if (latestStatus === 'running') throw problem('هذه الخطة قيد التنفيذ الآن. انتظر النتيجة ولا تعِد الضغط.', 409);
      await lock.query('BEGIN');
      const operations = (await lock.query('SELECT * FROM change_operations WHERE change_set_id=$1 ORDER BY id', [changeSet.id])).rows;
      const pending = new Set(operations.filter(op => op.status !== 'succeeded').map(op => op.operation_key));
      const pendingUnits = planUsageUnits(changeSet.plan.operations.filter(op => pending.has(op.operation_key)));
      const capacity = await requirePlanCapacity(req.user, 'changeSetsPerMonth', lock);
      if (capacity.used + pendingUnits > capacity.limit) throw problem('رصيد التغييرات المتبقي لا يكفي للتعديلات غير المنفذة. راجع باقتك أو أنشئ خطة أصغر.', 402);
      const current = await snapshot(changeSet.guild_id);
      const botIdentity = await discord('/users/@me');
      if (!botIdentity.ok || !botIdentity.data?.id) throw problem('تعذر التحقق من هوية البوت الآن. حاول لاحقًا قبل تنفيذ التغييرات.', 503);
      const botMember = await discord(`/guilds/${changeSet.guild_id}/members/${botIdentity.data.id}`);
      if (!botMember.ok) throw problem('لا يمكن التحقق من رتب البوت داخل السيرفر. راجع الربط والصلاحيات ثم حاول مجددًا.', 409);
      const botRole = current.roles.filter(role => botMember.data.roles?.includes(role.id)).sort((a,b) => b.position - a.position)[0];
      const granted = current.roles.filter(role => role.id === changeSet.guild_id || botMember.data.roles?.includes(role.id)).reduce((bits, role) => bits | BigInt(role.permissions || '0'), 0n);
      const canAll = (granted & PermissionFlagsBits.Administrator) !== 0n;
      const planned = new Map(changeSet.plan.operations.map(op => [op.operation_key, op]));
      const parents = new Map(operations.filter(op => op.resource_type === 'category' && op.status === 'succeeded').map(op => [op.operation_key, op.resource_id]));
      for (const row of operations.filter(op => op.status !== 'succeeded')) {
        const op = planned.get(row.operation_key);
        if (!op) throw problem('الخطة غير مكتملة. أنشئ مراجعة جديدة.', 409);
        if (!canAll && (granted & PermissionFlagsBits.ManageChannels) === 0n && op.resource_type !== 'role') throw problem('يحتاج البوت صلاحية إدارة القنوات قبل تنفيذ هذه الخطة.', 409);
        if (!canAll && (granted & PermissionFlagsBits.ManageRoles) === 0n && (op.resource_type === 'role' || Object.hasOwn(op, 'permission_overwrites'))) throw problem('يحتاج البوت صلاحية إدارة الرتب لتعديل الرتب أو وصول القنوات.', 409);
        if (op.resource_type === 'role' && Object.hasOwn(op, 'position') && botRole && op.position >= botRole.position) throw problem(`ترتيب الرتبة المطلوبة أعلى من رتبة البوت أو يساويها. ارفع رتبة البوت فوق الموضع ${op.position} أولًا.`, 409);
        if (op.resource_type === 'role' && op.action === 'update') {
          const target = resolveExisting(op, current);
          if (botRole && target && target.position >= botRole.position) throw problem(`لا يستطيع البوت تعديل رتبة «${target.name}» لأنها أعلى من رتبته أو مساوية لها. ارفع رتبة Diskoko في Discord أولًا.`, 409);
        }
        if (op.action === 'update') checkConflict(op, resolveExisting(op, current));
      }
      await pool.query("UPDATE change_sets SET status='running',updated_at=NOW() WHERE id=$1", [changeSet.id]);
      for (const row of operations) {
        if (row.status === 'succeeded') continue;
        const op = planned.get(row.operation_key);
        try {
          const parentId = op.parent_key ? parents.get(op.parent_key) : op.parent_id;
          if (op.parent_key && !parentId) throw problem('تعذر تحديد التصنيف المرتبط بالقناة.', 409);
          let resource = resolveExisting(op, current, parentId);
          const reused = Boolean(resource) && op.action !== 'update';
          checkExistingAccess(op, resource);
          if (!resource || op.action === 'update') {
            const endpoint = op.action === 'update'
              ? (op.resource_type === 'role' ? `/guilds/${changeSet.guild_id}/roles/${op.resource_id}` : `/channels/${op.resource_id}`)
              : `/guilds/${changeSet.guild_id}/${op.resource_type === 'role' ? 'roles' : 'channels'}`;
            const result = await discord(endpoint, { method: op.action === 'update' ? 'PATCH' : 'POST', body: JSON.stringify(operationBody(op, parentId)) });
            if (!result.ok) throw problem(`تعذر تنفيذ «${op.name}» (Discord ${result.status}). راجع صلاحيات البوت وترتيب رتبته.`, 409);
            resource = result.data;
            const rows = op.resource_type === 'role' ? current.roles : current.channels;
            const index = rows.findIndex(item => item.id === resource.id);
            if (index === -1) rows.push(resource); else rows[index] = resource;
          }
          if (Object.hasOwn(op, 'position') && (op.action !== 'update' || op.position_changed || Number(op.before?.position) !== Number(op.position))) {
            const reorderEndpoint = op.resource_type === 'role' ? `/guilds/${changeSet.guild_id}/roles` : `/guilds/${changeSet.guild_id}/channels`;
            const entries = op.resource_type === 'role' ? [{ id: resource.id, position: op.position }] : channelReorderEntries(current.channels, resource, op.position);
            const reordered = await discord(reorderEndpoint, { method: 'PATCH', body: JSON.stringify(entries) });
            if (!reordered.ok) {
              const reason = String(reordered.data?.message || '').trim();
              throw problem(reason
                ? `تعذر ترتيب «${op.name}»: ${reason}. راجع الموضع والتصنيف ثم أعد المحاولة.`
                : `تعذر ترتيب «${op.name}» الآن. حدّث بيانات السيرفر، راجع الموضع والتصنيف وصلاحية إدارة القنوات، ثم أعد المحاولة.`, 409);
            }
            if (op.resource_type !== 'role') for (const entry of entries) {
              const channel = current.channels.find(item => item.id === entry.id);
              if (channel) channel.position = entry.position;
            }
            resource = Array.isArray(reordered.data) ? reordered.data.find(item => item.id === resource.id) || resource : resource;
          }
          if (op.resource_type === 'category') parents.set(op.operation_key, resource.id);
          await pool.query("UPDATE change_operations SET status='succeeded',resource_id=$1,result=$2,updated_at=NOW() WHERE id=$3", [resource.id, { ...op, response: resource, usage_units: reused ? 0 : operationUnits(op) }, row.id]);
        } catch (error) {
          await pool.query("UPDATE change_operations SET status='failed',result=$1,updated_at=NOW() WHERE id=$2", [{ ...op, error: error.message }, row.id]);
          throw error;
        }
      }
      await pool.query("UPDATE change_sets SET status='succeeded',usage_units=(SELECT COALESCE(SUM((result->>'usage_units')::int),0) FROM change_operations WHERE change_set_id=$1),updated_at=NOW() WHERE id=$1", [changeSet.id]);
      await audit(req.user.id, 'change_set.apply', 'change_set', changeSet.id, { guild_id: changeSet.guild_id });
      await lock.query('COMMIT');
      res.json({ ok: true, status: 'succeeded', changeSetId: changeSet.id });
    } catch (error) {
      await lock.query('ROLLBACK').catch(() => {});
      if (acquired) {
        await pool.query("UPDATE change_sets SET status='failed',updated_at=NOW() WHERE id=$1 AND user_id=$2 AND status IN ('draft','running','failed')", [changeSet.id, req.user.id]);
        await audit(req.user.id, 'change_set.failed', 'change_set', changeSet.id, { guild_id: changeSet.guild_id, error: error.message });
      }
      throw error;
    } finally { if (acquired) await lock.query('SELECT pg_advisory_unlock(hashtext($1))', [`diskoko:${changeSet.guild_id}`]); lock.release(); }
  }));
  app.post('/api/change-sets/:id/cancel', requireUser, requireWriteAccess, route(async (req, res) => {
    const changeSet = (await pool.query('SELECT id,guild_id FROM change_sets WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])).rows[0];
    if (!changeSet) throw problem('خطة التغيير غير موجودة.', 404);
    if (!await authorizedGuild(req.user, changeSet.guild_id)) throw problem('لم تعد تملك صلاحية إدارة هذا السيرفر.', 403);
    const client = await pool.connect(); let acquired = false;
    try {
      acquired = (await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [`diskoko:${changeSet.guild_id}`])).rows[0].locked;
      if (!acquired) throw problem('هناك تنفيذ جارٍ لهذا السيرفر. انتظر اكتماله ثم ألغِ الخطة.', 409);
      const result = await client.query("UPDATE change_sets SET status='cancelled',updated_at=NOW() WHERE id=$1 AND user_id=$2 AND status IN ('draft','failed') RETURNING id", [changeSet.id, req.user.id]);
      if (!result.rowCount) throw problem('لا يمكن إلغاء خطة اكتمل تنفيذها أو قيد التنفيذ.', 409);
      await audit(req.user.id, 'change_set.cancel', 'change_set', changeSet.id, { guild_id: changeSet.guild_id });
      res.json({ ok: true, status: 'cancelled' });
    } finally { if (acquired) await client.query('SELECT pg_advisory_unlock(hashtext($1))', [`diskoko:${changeSet.guild_id}`]); client.release(); }
  }));

  app.put('/api/workspace/:guildId/preferences', requireUser, requireWriteAccess, route(async (req, res) => {
    const guild = await guildFor(req);
    if (typeof req.body.analytics_enabled !== 'boolean') throw problem('اختر حالة جمع النشاط.');
    const result = await pool.query('INSERT INTO workspace_preferences(guild_id,analytics_enabled,analytics_started_at) VALUES($1,$2,CASE WHEN $2 THEN NOW() ELSE NULL END) ON CONFLICT(guild_id) DO UPDATE SET analytics_enabled=$2,analytics_started_at=CASE WHEN $2 THEN COALESCE(workspace_preferences.analytics_started_at,NOW()) ELSE workspace_preferences.analytics_started_at END,updated_at=NOW() RETURNING *', [guild.id, req.body.analytics_enabled]);
    await audit(req.user.id, 'analytics.settings', 'guild', guild.id, { enabled: req.body.analytics_enabled });
    res.json({ preferences: result.rows[0] });
  }));
  app.get('/api/workspace/:guildId/analytics', requireUser, route(async (req, res) => {
    const guild = await guildFor(req); const maxDays = entitlementsFor(req.user).analyticsDays; const requested = Number(req.query.days) || 7; const days = Math.min(maxDays, [7, 14, 30, 90, 365].find(value => value >= requested) || maxDays);
    const base = "FROM community_activity WHERE guild_id=$1 AND day >= CURRENT_DATE - ($2::int - 1)";
    const [members, channels, daily, totals] = await Promise.all([
      pool.query(`SELECT user_id,(array_agg(display_name ORDER BY day DESC))[1] AS display_name,SUM(messages)::int AS messages,COUNT(DISTINCT day)::int AS active_days ${base} GROUP BY user_id ORDER BY messages DESC LIMIT 30`, [guild.id, days]),
      pool.query(`SELECT channel_id,SUM(messages)::int AS messages ${base} GROUP BY channel_id ORDER BY messages DESC LIMIT 20`, [guild.id, days]),
      pool.query(`SELECT day,SUM(messages)::int AS messages ${base} GROUP BY day ORDER BY day`, [guild.id, days]),
      pool.query(`SELECT COALESCE(SUM(messages),0)::int AS messages,COUNT(DISTINCT user_id)::int AS active_members ${base}`, [guild.id, days]),
    ]);
    res.json({ days, members: members.rows, channels: channels.rows, daily: daily.rows, totals: totals.rows[0] });
  }));
  app.get('/api/workspace/:guildId/schedules', requireUser, route(async (req, res) => {
    const guild = await guildFor(req);
    const { rows } = await pool.query('SELECT id,channel_id,content,run_at,repeat,timezone,status,last_error,message_id,created_at FROM scheduled_messages WHERE user_id=$1 AND guild_id=$2 ORDER BY created_at DESC LIMIT 50', [req.user.id, guild.id]);
    res.json({ schedules: rows });
  }));
  app.post('/api/workspace/:guildId/schedules', requireUser, requireWriteAccess, route(async (req, res) => {
    const guild = await guildFor(req); const schedule = normalizeSchedule(req.body);
    if (req.body.confirmed !== true) throw problem('راجع الرسالة وموعدها ثم أكد الجدولة.');
    const current = await snapshot(guild.id);
    if (!current.channels.some(channel => channel.id === schedule.channel_id && [0, 5].includes(channel.type))) throw problem('اختر قناة نصية موجودة في هذا السيرفر.');
    const client = await pool.connect(); let result;
    try { await client.query('BEGIN'); await requirePlanCapacity(req.user, 'scheduledMessages', client); result = await client.query('INSERT INTO scheduled_messages(user_id,guild_id,channel_id,content,run_at,repeat,timezone) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *', [req.user.id, guild.id, schedule.channel_id, schedule.content, schedule.run_at, schedule.repeat, schedule.timezone]); await client.query('COMMIT'); }
    catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    await audit(req.user.id, 'schedule.create', 'guild', guild.id, { schedule_id: result.rows[0].id });
    res.status(201).json({ schedule: result.rows[0] });
  }));
  app.post('/api/workspace/:guildId/schedules/:id/cancel', requireUser, requireWriteAccess, route(async (req, res) => {
    const guild = await guildFor(req);
    const result = await pool.query("UPDATE scheduled_messages SET status='cancelled',updated_at=NOW() WHERE id=$1 AND guild_id=$2 AND user_id=$3 AND status IN ('scheduled','failed') RETURNING id", [req.params.id, guild.id, req.user.id]);
    if (!result.rowCount) throw problem('هذه المهمة نُفذت أو بدأ إرسالها بالفعل.', 409);
    await audit(req.user.id, 'schedule.cancel', 'guild', guild.id, { schedule_id: req.params.id });
    res.json({ ok: true });
  }));
}

export function startScheduleRunner({ pool, discordBotFetch, authorizedGuild }) {
  let running = false;
  const tick = async () => {
    if (running) return; running = true;
    try {
      // Ambiguous interrupted sends are not retried automatically (avoid duplicates).
      await pool.query("UPDATE scheduled_messages SET status='failed',last_error='توقف التنفيذ قبل تأكيد النتيجة. تحقق من القناة قبل إنشاء مهمة بديلة.',updated_at=NOW() WHERE status='sending' AND updated_at < NOW() - INTERVAL '10 minutes'");
      await pool.query("DELETE FROM community_activity WHERE day < CURRENT_DATE - 364");
      const { rows } = await pool.query("UPDATE scheduled_messages SET status='sending',updated_at=NOW() WHERE id IN (SELECT id FROM scheduled_messages WHERE status='scheduled' AND run_at<=NOW() ORDER BY run_at LIMIT 5 FOR UPDATE SKIP LOCKED) RETURNING *");
      for (const job of rows) {
        try {
          const user = (await pool.query('SELECT * FROM users WHERE id=$1', [job.user_id])).rows[0];
          if (!user || user.status !== 'active' || !await authorizedGuild(user, job.guild_id)) throw new Error('توقفت المهمة لأن صاحبها لم يعد يملك صلاحية إدارة السيرفر.');
          const channel = await discordBotFetch(`/channels/${job.channel_id}`, {}, job);
          if (!channel.ok || channel.data.guild_id !== job.guild_id) throw new Error('القناة غير متاحة داخل السيرفر.');
          const nonce = `dk${job.id}-${new Date(job.run_at).getTime()}`.slice(0, 25);
          const sent = await discordBotFetch(`/channels/${job.channel_id}/messages`, { method: 'POST', body: JSON.stringify({ content: job.content, allowed_mentions: { parse: [] }, nonce, enforce_nonce: true }) }, job);
          if (!sent.ok) throw new Error(`تعذر الإرسال (Discord ${sent.status}). راجع صلاحيات القناة.`);
          const next = new Date(Date.now() + (job.repeat === 'weekly' ? 7 : 1) * 86400000);
          await pool.query("UPDATE scheduled_messages SET status=$1,message_id=$2,run_at=$3,last_error=NULL,updated_at=NOW() WHERE id=$4", [job.repeat === 'once' ? 'sent' : 'scheduled', sent.data.id, job.repeat === 'once' ? job.run_at : next, job.id]);
        } catch (error) { await pool.query("UPDATE scheduled_messages SET status='failed',last_error=$1,updated_at=NOW() WHERE id=$2", [error.message, job.id]); }
      }
    } catch (error) { console.error('Schedule runner failed', error.message); } finally { running = false; }
  };
  const timer = setInterval(tick, 30_000); timer.unref();
  return () => clearInterval(timer);
}
