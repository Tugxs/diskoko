import { randomUUID } from 'node:crypto';
import { PermissionFlagsBits as P } from 'discord.js';
import { connectedBot, connectedBotMetadata } from './ai-bot-connections.js';
import { problem } from './workspace-domain.js';
import { READY_MODULE_TYPES, READY_MODULE_FIELDS } from './ready-template-module-types.js';
import { readyImage } from './ready-templates.js';

const route = fn => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
const clean = (value, max) => String(value || '').trim().slice(0, max + 1);
const channelIsPrivate = (channel, guildId, channels) => {
  const own = (channel.permission_overwrites || []).find(item => item.id === guildId);
  if (own) return (BigInt(own.deny || '0') & P.ViewChannel) !== 0n;
  const parent = channels.find(item => item.id === channel.parent_id);
  return Boolean(parent && (parent.permission_overwrites || []).some(item => item.id === guildId && (BigInt(item.deny || '0') & P.ViewChannel) !== 0n));
};

export async function migrateStandaloneModules(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS standalone_module_installs (
    id UUID PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    guild_id TEXT NOT NULL, kind TEXT NOT NULL, config JSONB NOT NULL,
    executor TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
    error TEXT, panel_id UUID, message_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS standalone_module_installs_user ON standalone_module_installs(user_id,guild_id,created_at DESC);
  ALTER TABLE ready_template_module_panels ALTER COLUMN run_id DROP NOT NULL;
  ALTER TABLE ready_template_module_panels ADD COLUMN IF NOT EXISTS standalone_install_id UUID UNIQUE REFERENCES standalone_module_installs(id) ON DELETE CASCADE;`);
}

export function mountStandaloneModules(app, { pool, requireUser, requireWriteAccess, authorizedGuild, discordBotFetch, requirePlanCapacity, audit, botStatus }) {
  async function authorized(req) {
    const guild = await authorizedGuild(req.user, req.params.guildId);
    if (!guild) throw problem('لا تملك صلاحية إدارة هذا السيرفر.', 403);
    return guild;
  }
  async function executor(guildId, choice) {
    if (choice === 'custom') {
      const status = await connectedBotMetadata(pool, guildId);
      if (!status?.online) throw problem('بوتك الخاص غير متصل. راجع الربط من إعدادات السيرفر.', 409);
      const bot = await connectedBot(pool, guildId);
      return { call: (path, options = {}) => discordBotFetch(path, { ...options, headers: { ...options.headers, Authorization: `Bot ${bot.token}` } }), id: status.id };
    }
    if (choice !== 'diskoko') throw problem('اختر بوت التنفيذ.', 400);
    if (!botStatus().online) throw problem('بوت ديسكوكو غير متصل الآن.', 409);
    return { call: (path, options = {}) => discordBotFetch(path, { ...options, headers: { ...options.headers, Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } }) };
  }
  async function validate(guildId, raw, choice) {
    const kind = clean(raw.kind, 30), type = READY_MODULE_TYPES[kind];
    if (!type) throw problem('اختر ميزة معروفة من مكتبة AI.', 400);
    const bot = await executor(guildId, choice);
    const [channelsResponse, rolesResponse, botResponse] = await Promise.all([
      bot.call(`/guilds/${guildId}/channels`), bot.call(`/guilds/${guildId}/roles`), bot.call('/users/@me'),
    ]);
    if (!botResponse.ok || !botResponse.data?.id) throw problem('تعذر التحقق من هوية البوت المختار.', 409);
    const memberResponse = await bot.call(`/guilds/${guildId}/members/${botResponse.data.id}`);
    if (![channelsResponse, rolesResponse, botResponse, memberResponse].every(item => item.ok)) throw problem('تعذر قراءة القنوات والرتب وصلاحيات البوت. راجع اتصاله بالسيرفر.', 409);
    const channels = channelsResponse.data, roles = rolesResponse.data, botId = botResponse.data.id;
    const memberRoles = new Set(memberResponse.data.roles || []);
    const effective = roles.filter(role => role.id === guildId || memberRoles.has(role.id)).reduce((bits, role) => bits | BigInt(role.permissions || '0'), 0n);
    const needed = P.ViewChannel | P.SendMessages | P.EmbedLinks | P.ReadMessageHistory;
    if (!(effective & P.Administrator) && (effective & needed) !== needed) throw problem('البوت يحتاج عرض القنوات وإرسال الرسائل والروابط المضمنة وقراءة سجل الرسائل. ارفع رتبته أو امنحه هذه الصلاحيات.', 409);
    const channelId = clean(raw.channelId, 20), channel = channels.find(item => item.id === channelId && item.type === 0);
    if (!channel) throw problem('اختر قناة نصية موجودة لنشر اللوحة.', 400);
    if (type.staffOnly && !channelIsPrivate(channel, guildId, channels)) throw problem('مهام الفريق تحتاج قناة خاصة لا يراها الأعضاء.', 400);
    if (!type.staffOnly && channelIsPrivate(channel, guildId, channels)) throw problem('لوحة الأعضاء تحتاج قناة عامة يراها الأعضاء.', 400);
    const title = clean(raw.title, 256), description = clean(raw.description, 2000), buttonLabel = clean(raw.buttonLabel || type.action, 80), color = clean(raw.color || '#8d72e8', 7);
    if (!title || title.length > 256 || !description || description.length > 2000 || !buttonLabel || buttonLabel.length > 80 || !/^#[0-9a-fA-F]{6}$/.test(color)) throw problem('أكمل عنوان ووصف وزر ولون اللوحة ضمن الحدود الموضحة.', 400);
    const config = { key: kind, kind, title, description, buttonLabel, buttonStyle: Number(raw.buttonStyle || 1), color, channelId, banner: readyImage(raw.banner) };
    if (![1, 2, 3, 4].includes(config.buttonStyle)) throw problem('لون الزر غير صالح.', 400);
    let reviewChannelId = null, staffRoleId = null, roleId = null;
    if (type.form) {
      reviewChannelId = clean(raw.reviewChannelId, 20);
      const review = channels.find(item => item.id === reviewChannelId && item.type === 0);
      if (!review || !channelIsPrivate(review, guildId, channels)) throw problem('اختر قناة مراجعة نصية خاصة لا يراها الأعضاء.', 400);
      config.subjectLabel = clean(raw.subjectLabel || READY_MODULE_FIELDS[kind]?.subject, 45);
      config.detailsLabel = clean(raw.detailsLabel || READY_MODULE_FIELDS[kind]?.details, 45);
      if (!config.subjectLabel || config.subjectLabel.length > 45 || !config.detailsLabel || config.detailsLabel.length > 45) throw problem('أكمل أسماء خانات النموذج بحد أقصى 45 حرفًا.', 400);
      config.reviewChannelId = reviewChannelId;
    }
    if (type.form || type.staffOnly) {
      staffRoleId = clean(raw.staffRoleId, 20);
      if (!roles.some(role => role.id === staffRoleId && role.id !== guildId)) throw problem('اختر رتبة الفريق التي تراجع هذه الميزة.', 400);
      config.staffRoleId = staffRoleId;
    }
    if (type.role) {
      roleId = clean(raw.roleId, 20);
      const role = roles.find(item => item.id === roleId);
      if (!role || role.managed || BigInt(role.permissions || '0') !== 0n || role.id === guildId) throw problem('اختر رتبة اهتمام عادية بلا صلاحيات إدارية.', 400);
      if (!(effective & P.Administrator) && !(effective & P.ManageRoles)) throw problem('البوت يحتاج إدارة الرتب لتفعيل اختيار الاهتمامات.', 409);
      const botRole = roles.filter(item => memberRoles.has(item.id)).reduce((high, item) => Math.max(high, item.position || 0), 0);
      if (role.position >= botRole) throw problem('ارفع رتبة البوت فوق رتبة الاهتمام، ثم أعد المراجعة.', 409);
      config.roleId = roleId;
    }
    if (type.answer) {
      config.answer = clean(raw.answer, 1800);
      if (!config.answer || config.answer.length > 1800) throw problem('اكتب إجابة واضحة لا تتجاوز 1800 حرف.', 400);
    }
    if (type.signup) {
      config.capacity = Number(raw.capacity || 0);
      config.startsAt = clean(raw.startsAt, 50) || null;
      if (!Number.isInteger(config.capacity) || config.capacity < 0 || config.capacity > 10000 || (config.startsAt && (!Number.isFinite(Date.parse(config.startsAt)) || Date.parse(config.startsAt) <= Date.now()))) throw problem('راجع موعد الفعالية وعدد الأماكن.', 400);
    }
    return { config, channel, reviewChannelId, staffRoleId, roleId, botId, call: bot.call };
  }
  app.post('/api/workspace/:guildId/standalone-modules/review', requireUser, requireWriteAccess, route(async (req, res) => {
    const guild = await authorized(req);
    const choice = req.body?.executor || 'diskoko';
    const checked = await validate(guild.id, req.body || {}, choice);
    const client = await pool.connect();
    const id = randomUUID();
    try {
      await client.query('BEGIN');
      const capacity = await requirePlanCapacity(req.user, 'changeSetsPerMonth', client);
      if (capacity.used + 1 > capacity.limit) throw problem('رصيد التغييرات لهذا الشهر لا يكفي لتركيب الميزة. راجع باقتك.', 402);
      await client.query('INSERT INTO standalone_module_installs(id,user_id,guild_id,kind,config,executor) VALUES($1,$2,$3,$4,$5,$6)', [id, req.user.id, guild.id, checked.config.kind, checked.config, choice]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    await audit(req.user.id, 'standalone_module.review', 'guild', guild.id, { id, kind: checked.config.kind });
    res.status(201).json({ id, config: { ...checked.config, banner: checked.config.banner ? { mime: checked.config.banner.mime } : null }, channelName: checked.channel.name, executor: choice, usageUnits: 1 });
  }));
  app.post('/api/workspace/:guildId/standalone-modules/:id/apply', requireUser, requireWriteAccess, route(async (req, res) => {
    const guild = await authorized(req);
    const row = (await pool.query('SELECT * FROM standalone_module_installs WHERE id=$1 AND guild_id=$2 AND user_id=$3', [req.params.id, guild.id, req.user.id])).rows[0];
    if (!row) throw problem('مراجعة الميزة غير موجودة.', 404);
    if (row.status === 'succeeded') return res.json({ status: 'succeeded', messageId: row.message_id });
    if (row.status !== 'draft' && row.status !== 'failed') throw problem('يجري تركيب الميزة الآن. لا تضغط مرة أخرى.', 409);
    const checked = await validate(guild.id, row.config, row.executor);
    const claim = await pool.query("UPDATE standalone_module_installs SET status='running',error=NULL,updated_at=NOW() WHERE id=$1 AND status IN ('draft','failed') RETURNING id", [row.id]);
    if (!claim.rowCount) throw problem('يجري تركيب الميزة الآن. انتظر النتيجة.', 409);
    try {
      const capacity = await requirePlanCapacity(req.user, 'changeSetsPerMonth');
      if (capacity.used + 1 > capacity.limit) throw problem('رصيد التغييرات لهذا الشهر لا يكفي لتركيب الميزة.', 402);
      const panelId = row.panel_id || randomUUID();
      await pool.query(`INSERT INTO ready_template_module_panels(id,run_id,module_key,guild_id,channel_id,review_channel_id,staff_role_id,role_id,publishing_bot_id,config,standalone_install_id)
        VALUES($1,NULL,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(standalone_install_id) DO NOTHING`, [panelId, row.kind, guild.id, checked.channel.id, checked.reviewChannelId, checked.staffRoleId, checked.roleId, checked.botId, checked.config, row.id]);
      const panel = (await pool.query('SELECT id,message_id FROM ready_template_module_panels WHERE standalone_install_id=$1', [row.id])).rows[0];
      let messageId = panel.message_id;
      if (!messageId) {
        const recent = await checked.call(`/channels/${checked.channel.id}/messages?limit=100`);
        if (!recent.ok || !Array.isArray(recent.data)) throw problem('تعذر قراءة سجل قناة اللوحة. امنح البوت قراءة سجل الرسائل.', 409);
        const customId = `diskoko:module:${panel.id}`;
        const prior = recent.data.find(message => message.author?.id === checked.botId && message.components?.some(group => group.components?.some(button => button.custom_id === customId)));
        if (prior) messageId = prior.id;
        else {
          const embed = { title: checked.config.title, description: checked.config.description, color: parseInt(checked.config.color.slice(1), 16) };
          const payload = { embeds: [embed], components: [{ type: 1, components: [{ type: 2, style: checked.config.buttonStyle, label: checked.config.buttonLabel, custom_id: customId }] }], allowed_mentions: { parse: [] } };
          let body = JSON.stringify(payload);
          if (checked.config.banner) {
            const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[checked.config.banner.mime];
            const filename = `feature.${ext}`;
            embed.image = { url: `attachment://${filename}` };
            const form = new FormData();
            form.append('payload_json', JSON.stringify(payload));
            form.append('files[0]', new Blob([Buffer.from(checked.config.banner.base64, 'base64')], { type: checked.config.banner.mime }), filename);
            body = form;
          }
          const sent = await checked.call(`/channels/${checked.channel.id}/messages`, { method: 'POST', body });
          if (!sent.ok || !sent.data?.id) throw problem('تعذر نشر اللوحة. تحقق من صلاحيات البوت في القناة المحددة.', 409);
          messageId = sent.data.id;
        }
        await pool.query('UPDATE ready_template_module_panels SET message_id=$2 WHERE id=$1', [panel.id, messageId]);
      }
      await pool.query("UPDATE standalone_module_installs SET status='succeeded',panel_id=$2,message_id=$3,error=NULL,updated_at=NOW() WHERE id=$1", [row.id, panel.id, messageId]);
      await audit(req.user.id, 'standalone_module.apply', 'guild', guild.id, { id: row.id, kind: row.kind });
      res.json({ status: 'succeeded', messageId, channelId: checked.channel.id, usageUnits: 1 });
    } catch (error) {
      await pool.query("UPDATE standalone_module_installs SET status='failed',error=$2,updated_at=NOW() WHERE id=$1 AND status='running'", [row.id, error.message]);
      throw error;
    }
  }));
}
