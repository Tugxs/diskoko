import { checkCurrentDraft, checkDraftVersion } from './ai-draft-version.js';
import { randomUUID } from 'node:crypto';
import { PermissionFlagsBits as P } from 'discord.js';
import { connectedBot, connectedBotMetadata } from './ai-bot-connections.js';
import { problem } from './workspace-domain.js';
import { READY_MODULE_TYPES, READY_MODULE_FIELDS } from './ready-template-module-types.js';
import { readyImage } from './ready-templates.js';
import { normalizeDesignScene } from '../ai-design-scene.js';
import { moduleDraft } from './ai-module-draft.js';
import { moduleFormTools } from './module-form-tools.js';
import { moduleCanPost, moduleChannelPermissions } from './module-channel-permissions.js';
import { panelExtras } from './ai-panel-extras.js';

const route = fn => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
const clean = (value, max) => String(value || '').trim().slice(0, max + 1);
export function panelBody(config,panelId){
  const embed={title:config.title,description:config.description,color:parseInt(config.color.slice(1),16)};
  if(config.footer)embed.footer={text:config.footer};
  const payload={embeds:[embed],components:[{type:1,components:[{type:2,style:config.buttonStyle,label:config.buttonLabel,custom_id:`diskoko:module:${panelId}`}]}],allowed_mentions:{parse:[]}};
  for(const link of config.links || [])payload.components[0].components.push({type:2,style:5,label:link.label,url:link.url});
  if(!config.banner)return JSON.stringify(payload);
  const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'}[config.banner.mime],filename=`feature.${ext}`;
  embed[config.imagePlacement==='thumbnail'?'thumbnail':'image']={url:`attachment://${filename}`};
  const form=new FormData();form.append('payload_json',JSON.stringify(payload));form.append('files[0]',new Blob([Buffer.from(config.banner.base64,'base64')],{type:config.banner.mime}),filename);return form;
}
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
  await pool.query(`ALTER TABLE standalone_module_installs ADD COLUMN IF NOT EXISTS source_request_id UUID;
    ALTER TABLE standalone_module_installs ADD COLUMN IF NOT EXISTS edit_install_id UUID;
    CREATE UNIQUE INDEX IF NOT EXISTS standalone_module_source_request ON standalone_module_installs(source_request_id) WHERE source_request_id IS NOT NULL;`);
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
    const channelId = clean(raw.channelId, 20), channel = channels.find(item => item.id === channelId && item.type === 0);
    if (!channel) throw problem('اختر قناة نصية موجودة لنشر اللوحة.', 400);
    if(!moduleCanPost(effective,guildId,botId,[...memberRoles],channel))throw problem('صلاحيات البوت داخل قناة اللوحة لا تسمح بعرضها وإرسال الرسائل والروابط المضمنة وقراءة السجل. راجع استثناءات صلاحيات القناة.',409);
    if (type.staffOnly && !channelIsPrivate(channel, guildId, channels)) throw problem('مهام الفريق تحتاج قناة خاصة لا يراها الأعضاء.', 400);
    if (!type.staffOnly && channelIsPrivate(channel, guildId, channels)) throw problem('لوحة الأعضاء تحتاج قناة عامة يراها الأعضاء.', 400);
    const title = clean(raw.title, 256), description = clean(raw.description, 2000), buttonLabel = clean(raw.buttonLabel || type.action, 80), color = clean(raw.color || '#8d72e8', 7);
    if (!title || title.length > 256 || !description || description.length > 2000 || !buttonLabel || buttonLabel.length > 80 || !/^#[0-9a-fA-F]{6}$/.test(color)) throw problem('أكمل عنوان ووصف وزر ولون اللوحة ضمن الحدود الموضحة.', 400);
    const config = { key: kind, kind, title, description, buttonLabel, buttonStyle: Number(raw.buttonStyle || 1), color, channelId, banner: readyImage(raw.banner) };
    try{Object.assign(config,panelExtras(raw));}catch(error){throw problem(error.message,400);}
    if(raw.designScene){const scene=normalizeDesignScene(raw.designScene);if(!scene)throw problem('تصميم غير صالح.',400);config.designScene=scene;}
    const channelBits=moduleChannelPermissions(effective,guildId,botId,[...memberRoles],channel);
    if((config.banner || config.designScene) && !(channelBits & P.Administrator) && !(channelBits & P.AttachFiles))throw problem('البوت يحتاج إرفاق الملفات داخل قناة اللوحة لنشر الصورة أو التصميم.',409);
    if (![1, 2, 3, 4].includes(config.buttonStyle)) throw problem('لون الزر غير صالح.', 400);
    let reviewChannelId = null, staffRoleId = null, roleId = null;
    if (type.form) {
      reviewChannelId = clean(raw.reviewChannelId, 20);
      const review = channels.find(item => item.id === reviewChannelId && item.type === 0);
      if (!review || !channelIsPrivate(review, guildId, channels)) throw problem('اختر قناة مراجعة نصية خاصة لا يراها الأعضاء.', 400);
      if(!moduleCanPost(effective,guildId,botId,[...memberRoles],review))throw problem('البوت لا يستطيع إرسال الطلبات داخل قناة المراجعة الخاصة. راجع استثناءات صلاحيات القناة.',409);
      config.subjectLabel = clean(raw.subjectLabel || READY_MODULE_FIELDS[kind]?.subject, 45);
      config.detailsLabel = clean(raw.detailsLabel || READY_MODULE_FIELDS[kind]?.details, 45);
      try{Object.assign(config,moduleFormTools(raw));}catch{throw problem('راجع إرشادات الخانات وحدود الإجابة: الموضوع من 1 إلى 120، والتفاصيل من 1 إلى 1000، والإرشاد حتى 100 حرف.',400);}
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
  app.get('/api/workspace/:guildId/standalone-modules/:id', requireUser, route(async(req,res)=>{
    const guild=await authorized(req);
    const row=(await pool.query("SELECT id,config,executor,status FROM standalone_module_installs WHERE id=$1 AND user_id=$2 AND guild_id=$3",[req.params.id,req.user.id,guild.id])).rows[0];
    if(!row || row.status!=='succeeded')throw problem('إعدادات اللوحة المنشورة غير متاحة.',404);
    res.json(row);
  }));
  app.post('/api/workspace/:guildId/standalone-modules/review', requireUser, requireWriteAccess, route(async (req, res) => {
    const guild = await authorized(req);
    const choice = req.body?.executor || 'diskoko';
    const checked = await validate(guild.id, req.body || {}, choice);
    const sourceRequestId = req.body?.sourceRequestId || null;
    if (sourceRequestId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sourceRequestId)) throw problem('معرّف المسودة غير صالح.',400);
    checked.config.executorBotId = checked.botId;
    const editInstallId=req.body?.editInstallId || null;
    if(editInstallId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(editInstallId))throw problem('معرّف اللوحة غير صالح.',400);
    if(editInstallId){
      if(!sourceRequestId)throw problem('التعديل يحتاج المسودة الأصلية.',400);
      const target=(await pool.query("SELECT s.*,p.publishing_bot_id FROM standalone_module_installs s JOIN ready_template_module_panels p ON p.standalone_install_id=s.id WHERE s.id=$1 AND s.user_id=$2 AND s.guild_id=$3 AND s.status='succeeded'",[editInstallId,req.user.id,guild.id])).rows[0];
      if(!target || target.source_request_id!==sourceRequestId || target.kind!==checked.config.kind || target.publishing_bot_id!==checked.botId || target.config.channelId!==checked.channel.id)throw problem('التعديل لا يخص نفس اللوحة والسيرفر والبوت والقناة.',403);
    }
    if (sourceRequestId) {
      const source = (await pool.query("SELECT proposal,design_bot_id FROM ai_requests WHERE id=$1 AND user_id=$2 AND guild_id=$3 AND status='completed'", [sourceRequestId,req.user.id,guild.id])).rows[0];
      if(source)await checkCurrentDraft(pool,source,sourceRequestId,req.user.id,req.body,{editing:Boolean(editInstallId)});
      checked.config.aiDraftVersion=req.body.draftVersion || null;
      if (source?.proposal?.interactive?.kind !== 'module' || source.proposal.interactive.moduleKind !== checked.config.kind || (source.design_bot_id || 'public') !== (choice === 'custom' ? checked.botId : 'public')) throw problem('المسودة لا تخص هذا العميل والسيرفر والبوت والميزة.',403);
    }
    const client = await pool.connect();
    const id = randomUUID();
    try {
      await client.query('BEGIN');
      if (sourceRequestId) {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[editInstallId || sourceRequestId]);
        const existing = (await client.query(editInstallId ? "SELECT id,status FROM standalone_module_installs WHERE edit_install_id=$1 AND status<>'succeeded' FOR UPDATE" : 'SELECT id,status FROM standalone_module_installs WHERE source_request_id=$1 FOR UPDATE',[editInstallId || sourceRequestId])).rows[0];
        if (existing && existing.status !== 'draft') throw problem('هذه المسودة نُفذت أو تحتاج مراجعة حالتها؛ أُوقفت إعادة النشر.',409);
        if (existing) await client.query('DELETE FROM standalone_module_installs WHERE id=$1 AND status=\'draft\'',[existing.id]);
      }
      const capacity = await requirePlanCapacity(req.user, 'changeSetsPerMonth', client);
      if (capacity.used + 1 > capacity.limit) throw problem('رصيد التغييرات لهذا الشهر لا يكفي لتركيب الميزة. راجع باقتك.', 402);
      if(editInstallId)checked.config.aiSourceRequestId=sourceRequestId;
      await client.query('INSERT INTO standalone_module_installs(id,user_id,guild_id,kind,config,executor,source_request_id,edit_install_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [id, req.user.id, guild.id, checked.config.kind, checked.config, choice,editInstallId?null:sourceRequestId,editInstallId]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    await audit(req.user.id, 'standalone_module.review', 'guild', guild.id, { id, kind: checked.config.kind });
    res.status(201).json({ id, editing:Boolean(editInstallId), config: { ...checked.config, banner: checked.config.banner ? { mime: checked.config.banner.mime } : null }, channelName: checked.channel.name, executor: choice, usageUnits: 1 });
  }));
  app.post('/api/workspace/:guildId/standalone-modules/:id/apply', requireUser, requireWriteAccess, route(async (req, res) => {
    const guild = await authorized(req);
    const row = (await pool.query('SELECT * FROM standalone_module_installs WHERE id=$1 AND guild_id=$2 AND user_id=$3', [req.params.id, guild.id, req.user.id])).rows[0];
    if (!row) throw problem('مراجعة الميزة غير موجودة.', 404);
    if (row.status === 'succeeded') return res.json({ status: 'succeeded', messageId: row.message_id });
    if (row.status !== 'draft') throw problem('حالة التنفيذ تحتاج مراجعة قبل إعادة المحاولة. لا تضغط مرة أخرى.', 409);
    const sourceId=row.source_request_id || row.config.aiSourceRequestId;
    if(sourceId && row.config.aiDraftVersion){const source=(await pool.query('SELECT proposal FROM ai_requests WHERE id=$1 AND user_id=$2 AND guild_id=$3',[sourceId,req.user.id,guild.id])).rows[0];if(!source)throw problem('المسودة غير متاحة.',404);await checkCurrentDraft(pool,source,sourceId,req.user.id,{draftVersion:row.config.aiDraftVersion},{editing:Boolean(row.edit_install_id)});}
    const checked = await validate(guild.id, row.config, row.executor);
    if (row.config.executorBotId && row.config.executorBotId !== checked.botId) throw problem('تغيّر بوت التنفيذ بعد المراجعة. جهز مراجعة جديدة.',409);
    const claim = await pool.query("UPDATE standalone_module_installs SET status='running',error=NULL,updated_at=NOW() WHERE id=$1 AND status='draft' RETURNING id", [row.id]);
    if (!claim.rowCount) throw problem('يجري تركيب الميزة الآن. انتظر النتيجة.', 409);
    try {
      if(sourceId && row.config.aiDraftVersion){const snapshot=(await pool.query("UPDATE ai_requests SET publication_state='publishing' WHERE id=$1 AND user_id=$2 AND guild_id=$3 AND (publication_state IS NULL OR publication_state='completed') RETURNING proposal",[sourceId,req.user.id,guild.id])).rows[0];if(!snapshot)throw problem('حالة المسودة تحتاج مراجعة قبل التنفيذ.',409);checkDraftVersion(snapshot.proposal,row.config.aiDraftVersion);}
      const capacity = await requirePlanCapacity(req.user, 'changeSetsPerMonth');
      if (capacity.used + 1 > capacity.limit) throw problem('رصيد التغييرات لهذا الشهر لا يكفي لتركيب الميزة.', 402);
      if(row.edit_install_id){
        const target=(await pool.query("SELECT s.id,s.source_request_id,p.id AS panel_id,p.message_id,p.channel_id,p.publishing_bot_id FROM standalone_module_installs s JOIN ready_template_module_panels p ON p.standalone_install_id=s.id WHERE s.id=$1 AND s.user_id=$2 AND s.guild_id=$3 AND s.status='succeeded'",[row.edit_install_id,req.user.id,guild.id])).rows[0];
        if(!target || target.publishing_bot_id!==checked.botId || target.channel_id!==checked.channel.id)throw problem('تغيّرت اللوحة أو البوت؛ أعد المراجعة.',409);
        const edited=await checked.call(`/channels/${target.channel_id}/messages/${target.message_id}`,{method:'PATCH',body:panelBody(checked.config,target.panel_id)});
        if(!edited.ok || edited.data?.id!==target.message_id)throw problem('تعذر تأكيد تعديل اللوحة. أُوقفت إعادة التنفيذ حتى تُراجع الحالة.',409);
        await pool.query('UPDATE ready_template_module_panels SET config=$2,role_id=$3,review_channel_id=$4,staff_role_id=$5 WHERE id=$1',[target.panel_id,checked.config,checked.roleId,checked.reviewChannelId,checked.staffRoleId]);
        await pool.query('UPDATE standalone_module_installs SET config=$2,updated_at=NOW() WHERE id=$1',[target.id,{...checked.config,executorBotId:checked.botId}]);
        await pool.query("UPDATE standalone_module_installs SET status='succeeded',panel_id=$2,message_id=$3,error=NULL,updated_at=NOW() WHERE id=$1",[row.id,target.panel_id,target.message_id]);
        if(target.source_request_id)await pool.query("UPDATE ai_requests SET proposal=jsonb_set(proposal,'{interactive}', $2::jsonb) WHERE id=$1 AND user_id=$3 AND guild_id=$4",[target.source_request_id,moduleDraft({...checked.config,kind:'module',moduleKind:checked.config.kind,channel:''}),req.user.id,guild.id]);
        await audit(req.user.id,'standalone_module.edit','guild',guild.id,{id:row.id,original:target.id,kind:row.kind});
        return res.json({status:'succeeded',messageId:target.message_id,channelId:target.channel_id,usageUnits:1,editing:true});
      }
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
          const body = panelBody(checked.config,panel.id);
          const sent = await checked.call(`/channels/${checked.channel.id}/messages`, { method: 'POST', body });
          if (!sent.ok || !sent.data?.id) throw problem('تعذر نشر اللوحة. تحقق من صلاحيات البوت في القناة المحددة.', 409);
          messageId = sent.data.id;
        }
        await pool.query('UPDATE ready_template_module_panels SET message_id=$2 WHERE id=$1', [panel.id, messageId]);
      }
      await pool.query("UPDATE standalone_module_installs SET status='succeeded',panel_id=$2,message_id=$3,error=NULL,updated_at=NOW() WHERE id=$1", [row.id, panel.id, messageId]);
      if (sourceId) await pool.query("UPDATE ai_requests SET publication_state='completed',interactive_kind='module',interactive_message_id=$2,interactive_channel_id=$3,publishing_bot_id=$4,published_at=NOW(),proposal=jsonb_set(proposal,'{interactive}',(proposal->'interactive') || $7::jsonb) WHERE id=$1 AND user_id=$5 AND guild_id=$6",[sourceId,messageId,checked.channel.id,checked.botId,req.user.id,guild.id,Object.fromEntries(['title','description','buttonLabel','buttonStyle','color','designScene','answer','subjectLabel','detailsLabel','capacity','startsAt','subjectPlaceholder','detailsPlaceholder','subjectMaxLength','detailsMaxLength','cooldownSeconds','receiptText','links','imagePlacement','footer'].filter(key=>checked.config[key]!==undefined).map(key=>[key,checked.config[key]]))]);
      await audit(req.user.id, 'standalone_module.apply', 'guild', guild.id, { id: row.id, kind: row.kind });
      res.json({ status: 'succeeded', messageId, channelId: checked.channel.id, usageUnits: 1 });
    } catch (error) {
      if(sourceId && row.config.aiDraftVersion)await pool.query("UPDATE ai_requests SET publication_state='review_required' WHERE id=$1 AND user_id=$2 AND guild_id=$3 AND publication_state='publishing'",[sourceId,req.user.id,guild.id]);
      await pool.query("UPDATE standalone_module_installs SET status='failed',error=$2,updated_at=NOW() WHERE id=$1 AND status='running'", [row.id, error.message]);
      throw error;
    }
  }));
}
