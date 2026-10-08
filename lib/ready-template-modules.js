import { randomUUID } from 'node:crypto';
import { PermissionFlagsBits } from 'discord.js';
import { READY_MODULE_TYPES, READY_MODULE_FIELDS } from './ready-template-module-types.js';
import { moduleFormTools } from './module-form-tools.js';

export async function migrateReadyTemplateModules(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS ready_template_module_panels (
    id UUID PRIMARY KEY, run_id UUID NOT NULL REFERENCES ready_template_runs(id) ON DELETE CASCADE,
    module_key TEXT NOT NULL, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, message_id TEXT,
    review_channel_id TEXT, staff_role_id TEXT, role_id TEXT, publishing_bot_id TEXT NOT NULL,
    config JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(run_id,module_key)
  );
  CREATE TABLE IF NOT EXISTS ready_template_module_entries (
    id UUID PRIMARY KEY, panel_id UUID NOT NULL REFERENCES ready_template_module_panels(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL, subject TEXT NOT NULL, details TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new', review_message_id TEXT,
    public_message_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS ready_template_module_entries_user ON ready_template_module_entries(panel_id,user_id,created_at DESC);
  CREATE TABLE IF NOT EXISTS ready_template_module_votes (
    entry_id UUID NOT NULL REFERENCES ready_template_module_entries(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(entry_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS ready_template_module_signups (
    panel_id UUID NOT NULL REFERENCES ready_template_module_panels(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(panel_id,user_id)
  );
  ALTER TABLE ready_template_module_entries ADD COLUMN IF NOT EXISTS public_message_id TEXT;`);
}

const rows = buttons => [{ type: 1, components: buttons }];
const button = (label, id, style = 1) => ({ type: 2, style, label: label.slice(0, 80), custom_id: id });
const isStaff = (interaction, roleId) => interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || Boolean(roleId && interaction.member?.roles?.cache?.has(roleId));
const safe = value => String(value || '').replace(/@/g, '@\u200b').slice(0, 1000);

export async function handleReadyModuleInteraction(interaction, pool) {
  if (!interaction.customId?.startsWith('diskoko:module')) return false;
  const [prefix, kind, id, action] = interaction.customId.split(':');
  if (prefix !== 'diskoko' || !/^[0-9a-f-]{36}$/i.test(id || '') || !interaction.guildId) {
    await interaction.reply({ content: 'هذه اللوحة غير صالحة.', ephemeral: true }); return true;
  }
  if (kind === 'module-vote' && interaction.isButton()) {
    await interaction.deferReply({ ephemeral: true });
    const entry = (await pool.query(`SELECT e.id,e.status,e.subject,e.details,e.public_message_id,p.guild_id,p.channel_id,p.publishing_bot_id,p.config
      FROM ready_template_module_entries e JOIN ready_template_module_panels p ON p.id=e.panel_id WHERE e.id=$1`, [id])).rows[0];
    if (!entry || entry.status !== 'approved' || entry.config.kind !== 'suggestions' || entry.guild_id !== interaction.guildId || entry.channel_id !== interaction.channelId || entry.public_message_id !== interaction.message?.id || entry.publishing_bot_id !== interaction.client.user.id) { await interaction.editReply('التصويت على هذا الاقتراح غير متاح.'); return true; }
    const added = await pool.query('INSERT INTO ready_template_module_votes(entry_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [id, interaction.user.id]);
    if (!added.rowCount) await pool.query('DELETE FROM ready_template_module_votes WHERE entry_id=$1 AND user_id=$2', [id, interaction.user.id]);
    const votes = (await pool.query('SELECT COUNT(*)::int AS total FROM ready_template_module_votes WHERE entry_id=$1', [id])).rows[0].total;
    await interaction.message.edit({ embeds: [{ title: safe(entry.subject), description: `${safe(entry.details)}\n\n👍 الأصوات: **${votes}**`, color: parseInt(entry.config.color.slice(1), 16) }] }).catch(() => {});
    await interaction.editReply(added.rowCount ? 'وصل صوتك للاقتراح.' : 'أُلغي صوتك من الاقتراح.'); return true;
  }
  if (kind === 'module-review' && interaction.isButton()) {
    await interaction.deferReply({ ephemeral: true });
    if (!['approved', 'rejected', 'completed'].includes(action)) { await interaction.editReply('إجراء المراجعة غير صالح.'); return true; }
    const entry = (await pool.query(`SELECT e.*,p.guild_id,p.review_channel_id,p.staff_role_id,p.publishing_bot_id,p.config
      FROM ready_template_module_entries e JOIN ready_template_module_panels p ON p.id=e.panel_id WHERE e.id=$1`, [id])).rows[0];
    if (!entry || entry.guild_id !== interaction.guildId || entry.review_channel_id !== interaction.channelId || entry.review_message_id !== interaction.message?.id || entry.publishing_bot_id !== interaction.client.user.id) { await interaction.editReply('هذه المراجعة لم تعد متاحة.'); return true; }
    if (!isStaff(interaction, entry.staff_role_id)) { await interaction.editReply('هذه المراجعة مخصصة لفريق الإدارة.'); return true; }
    if (action === 'completed' && !['orders', 'learning', 'tasks'].includes(entry.config.kind)) { await interaction.editReply('إكمال المهمة غير متاح لهذه الميزة.'); return true; }
    const publishes = action === 'approved' && ['suggestions', 'submissions'].includes(entry.config.kind);
    const updated = await pool.query("UPDATE ready_template_module_entries SET status=$1,updated_at=NOW() WHERE id=$2 AND status=$3 RETURNING id", [publishes ? 'publishing' : action, id, action === 'completed' ? 'approved' : 'new']);
    if (!updated.rowCount) { await interaction.editReply('تمت مراجعة هذا الطلب سابقًا.'); return true; }
    if (publishes) {
      const target = await interaction.client.channels.fetch(entry.config.channelId || (await pool.query('SELECT channel_id FROM ready_template_module_panels WHERE id=$1', [entry.panel_id])).rows[0]?.channel_id).catch(() => null);
      if (!target?.isTextBased() || target.guildId !== interaction.guildId) { await pool.query("UPDATE ready_template_module_entries SET status='new' WHERE id=$1 AND status='publishing'", [id]); await interaction.editReply('تعذر الوصول لقناة النشر. راجع صلاحيات البوت ثم حاول مجددًا.'); return true; }
      try {
        const message = await target.send({ embeds: [{ title: safe(entry.subject), description: `${safe(entry.details)}${entry.config.kind === 'suggestions' ? '\n\n👍 الأصوات: **0**' : ''}`, color: parseInt(entry.config.color.slice(1), 16) }], ...(entry.config.kind === 'suggestions' ? { components: rows([button('👍 صوّت للاقتراح', `diskoko:module-vote:${id}`)]) } : {}), allowedMentions: { parse: [] } });
        await pool.query("UPDATE ready_template_module_entries SET status='approved',public_message_id=$1,updated_at=NOW() WHERE id=$2 AND status='publishing'", [message.id, id]);
      } catch (error) { await pool.query("UPDATE ready_template_module_entries SET status='new' WHERE id=$1 AND status='publishing'", [id]); await interaction.editReply('تعذر نشر المشاركة. امنح البوت صلاحية إرسال الرسائل والروابط المضمنة ثم أعد المحاولة.'); return true; }
    }
    const status = action === 'approved' ? 'مقبول' : action === 'completed' ? 'مكتمل' : 'مرفوض';
    await interaction.message.edit({ embeds: [{ title: safe(entry.config.title), description: `**${safe(entry.subject)}**\n${safe(entry.details)}\n\nصاحب الطلب: <@${entry.user_id}>\nالحالة: **${status}**`, color: action === 'rejected' ? 0xc96b70 : 0x3ba978 }], components: action === 'approved' && ['orders', 'learning', 'tasks'].includes(entry.config.kind) ? rows([button('تم الإنجاز', `diskoko:module-review:${id}:completed`, 3)]) : [], allowedMentions: { parse: [] } }).catch(() => {});
    await interaction.editReply(`${entry.config.kind === 'tasks' ? 'المهمة' : entry.config.kind === 'learning' ? 'تقدم المتعلم' : entry.config.kind === 'orders' ? 'طلب المتجر' : 'الطلب'}: ${status}.`); return true;
  }
  if (kind === 'module-submit' && interaction.isModalSubmit()) {
    await interaction.deferReply({ ephemeral: true });
    const panel = (await pool.query('SELECT * FROM ready_template_module_panels WHERE id=$1', [id])).rows[0];
    if (!panel || panel.guild_id !== interaction.guildId || panel.publishing_bot_id !== interaction.client.user.id || !READY_MODULE_TYPES[panel.config.kind]?.form) { await interaction.editReply('هذه اللوحة لم تعد متاحة.'); return true; }
    if (READY_MODULE_TYPES[panel.config.kind].staffOnly && !isStaff(interaction, panel.staff_role_id)) { await interaction.editReply('هذا النموذج مخصص لفريق الإدارة.'); return true; }
    const subject = interaction.fields.getTextInputValue('subject').trim().slice(0, 120);
    const details = interaction.fields.getTextInputValue('details').trim().slice(0, 1000);
    if (!subject || !details) { await interaction.editReply('اكتب الموضوع والتفاصيل قبل الإرسال.'); return true; }
    const form=moduleFormTools(panel.config);
    if(subject.length>form.subjectMaxLength || details.length>form.detailsMaxLength){await interaction.editReply('راجع طول الموضوع والتفاصيل وفق حدود النموذج.');return true;}
    const recent = (await pool.query("SELECT 1 FROM ready_template_module_entries WHERE panel_id=$1 AND user_id=$2 AND created_at>NOW()-INTERVAL '30 seconds' LIMIT 1", [id, interaction.user.id])).rowCount;
    if (recent) { await interaction.editReply('تم استلام طلبك مؤخرًا. انتظر قليلًا قبل إرسال طلب جديد.'); return true; }
    const reviewChannel = await interaction.client.channels.fetch(panel.review_channel_id).catch(() => null);
    if (!reviewChannel?.isTextBased() || reviewChannel.guildId !== interaction.guildId) { await interaction.editReply('قناة مراجعة الطلبات غير متاحة. أبلغ مدير السيرفر لتصحيح إعداد الميزة.'); return true; }
    const entryId = randomUUID();
    await pool.query('INSERT INTO ready_template_module_entries(id,panel_id,user_id,subject,details) VALUES($1,$2,$3,$4,$5)', [entryId, id, interaction.user.id, subject, details]);
    try {
      const message = await reviewChannel.send({ embeds: [{ title: safe(panel.config.title), description: `**${safe(subject)}**\n${safe(details)}\n\nصاحب الطلب: <@${interaction.user.id}>\nالحالة: **جديد**`, color: parseInt(panel.config.color.slice(1), 16) }], components: rows([button('قبول', `diskoko:module-review:${entryId}:approved`, 3), button('رفض', `diskoko:module-review:${entryId}:rejected`, 4)]), allowedMentions: { parse: [] } });
      await pool.query('UPDATE ready_template_module_entries SET review_message_id=$1 WHERE id=$2', [message.id, entryId]);
    } catch (error) {
      await pool.query('DELETE FROM ready_template_module_entries WHERE id=$1', [entryId]);
      throw error;
    }
    const received = { suggestions: 'وصل اقتراحك للفريق؛ سيُنشر للتصويت إذا وافقوا عليه.', reports: 'وصل بلاغك بشكل خاص إلى الفريق.', applications: 'وصل طلب انضمامك للفريق.', submissions: 'وصلت مشاركتك؛ ستُنشر بعد المراجعة إذا قُبلت.', orders: 'وصل طلب المتجر للفريق. تابع طريقة الدفع والتسليم معهم مباشرة.', learning: 'سُجّل تقدمك وسيُراجعه المرشد.', tasks: 'أُضيفت المهمة إلى قائمة الفريق.' }[panel.config.kind] || 'وصل طلبك إلى الفريق.';
    await interaction.editReply(`${received} رقم المتابعة: ${entryId.slice(0, 8)}.`); return true;
  }
  if (kind !== 'module' || !interaction.isButton()) return false;
  const panel = (await pool.query('SELECT * FROM ready_template_module_panels WHERE id=$1', [id])).rows[0];
  if (!panel || panel.guild_id !== interaction.guildId || panel.channel_id !== interaction.channelId || panel.message_id !== interaction.message?.id || panel.publishing_bot_id !== interaction.client.user.id) { await interaction.reply({ content: 'هذه اللوحة لم تعد متاحة.', ephemeral: true }); return true; }
  const config = panel.config, type = READY_MODULE_TYPES[config.kind];
  if (!type) { await interaction.reply({ content: 'نوع هذه الميزة غير معروف.', ephemeral: true }); return true; }
  if (type.staffOnly && !isStaff(interaction, panel.staff_role_id)) { await interaction.reply({ content: 'هذه الميزة مخصصة لفريق الإدارة.', ephemeral: true }); return true; }
  if (type.form) {
    const form=moduleFormTools(config);
    await interaction.showModal({ custom_id: `diskoko:module-submit:${id}`, title: config.title.slice(0, 45), components: [
      { type: 1, components: [{ type: 4, custom_id: 'subject', label: config.subjectLabel || READY_MODULE_FIELDS[config.kind]?.subject || 'الموضوع', style: 1, required: true, max_length: form.subjectMaxLength, ...(form.subjectPlaceholder?{placeholder:form.subjectPlaceholder}:{}) }] },
      { type: 1, components: [{ type: 4, custom_id: 'details', label: config.detailsLabel || READY_MODULE_FIELDS[config.kind]?.details || 'التفاصيل أو الرابط', style: 2, required: true, max_length: form.detailsMaxLength, ...(form.detailsPlaceholder?{placeholder:form.detailsPlaceholder}:{}) }] },
    ] }); return true;
  }
  await interaction.deferReply({ ephemeral: true });
  if (type.answer) { await interaction.editReply(config.answer); return true; }
  if (type.role) {
    const role = await interaction.guild.roles.fetch(panel.role_id).catch(() => null);
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!role || !member || !role.editable) { await interaction.editReply('تعذر تعديل الرتبة. اطلب من الإدارة رفع رتبة البوت فوقها.'); return true; }
    const hasRole = member.roles.cache.has(role.id);
    if (hasRole) await member.roles.remove(role, 'Diskoko interest selection'); else await member.roles.add(role, 'Diskoko interest selection');
    await interaction.editReply(hasRole ? `أُزيلت رتبة «${role.name}».` : `أُضيفت رتبة «${role.name}».`); return true;
  }
  if (type.signup) {
    if (config.startsAt && new Date(config.startsAt) <= new Date()) { await interaction.editReply('انتهى موعد التسجيل لهذه الفعالية.'); return true; }
    const client = await pool.connect(); let joined, total;
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [id]);
      const current = (await client.query('SELECT 1 FROM ready_template_module_signups WHERE panel_id=$1 AND user_id=$2', [id, interaction.user.id])).rowCount;
      total = Number((await client.query('SELECT COUNT(*)::int AS total FROM ready_template_module_signups WHERE panel_id=$1', [id])).rows[0].total);
      if (!current && config.capacity && total >= config.capacity) { await client.query('ROLLBACK'); await interaction.editReply('اكتملت أماكن هذه الفعالية.'); return true; }
      if (current) { await client.query('DELETE FROM ready_template_module_signups WHERE panel_id=$1 AND user_id=$2', [id, interaction.user.id]); joined = false; total--; }
      else { await client.query('INSERT INTO ready_template_module_signups(panel_id,user_id) VALUES($1,$2)', [id, interaction.user.id]); joined = true; total++; }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
    const embed = interaction.message.embeds[0]?.toJSON() || { title: config.title, color: parseInt(config.color.slice(1), 16) };
    await interaction.message.edit({ embeds: [{ ...embed, description: `${config.description}\n\n👥 المسجلون: **${total}**${config.capacity ? ` من ${config.capacity}` : ''}` }] }).catch(() => {});
    await interaction.editReply(joined ? 'تم تسجيل مشاركتك.' : 'أُلغي تسجيلك.'); return true;
  }
  await interaction.editReply('الميزة غير متاحة الآن.'); return true;
}
