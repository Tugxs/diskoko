import { fileURLToPath } from 'node:url';
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, PermissionFlagsBits, StringSelectMenuBuilder } from 'discord.js';
import { canonicalPlan, entitlementsFor, subscriptionAccess } from './billing.js';
import { customerRoleConfig } from './customer-roles.js';

const KEY = 'account';
const CHANNEL_NAME = 'معلومات-حسابك';
const ART = fileURLToPath(new URL('../assets/diskoko-account-panel.jpg', import.meta.url));
const site = process.env.BASE_URL || 'https://diskoko.com';
const accountUrl = new URL('/account.html', site).toString();
const linkUrl = new URL('/auth/discord?returnTo=%2Faccount.html%23subscription', site).toString();
const names = { free: 'Free', starter: 'Starter', growth: 'Growth', business: 'Business' };

function navigation() {
  return [
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('diskoko-account:view').setPlaceholder('اختر المعلومات التي تريد عرضها').addOptions(
      { label: 'نظرة عامة', value: 'overview', description: 'الربط والباقة والمشاريع', emoji: '👤' },
      { label: 'الاشتراك', value: 'subscription', description: 'حالة باقتك وتجديدها', emoji: '💎' },
      { label: 'الاستخدام والحدود', value: 'usage', description: 'تقدم استخدام مزاياك', emoji: '📊' },
      { label: 'السيرفرات', value: 'servers', description: 'السيرفرات المرتبطة بحسابك', emoji: '🧩' },
    )),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('diskoko-account:overview').setStyle(ButtonStyle.Primary).setLabel('معلوماتي').setEmoji('✨'),
      new ButtonBuilder().setCustomId('diskoko-account:usage').setStyle(ButtonStyle.Secondary).setLabel('تقدمي').setEmoji('📈'),
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('لوحة حسابي').setURL(accountUrl),
    ),
  ];
}

export function accountPanelPayload() {
  const embed = new EmbedBuilder().setColor(0x8058eb).setTitle('✦ معلومات حسابك · Diskoko')
    .setDescription('كل ما يخص حسابك في مكان واحد. اختر من القائمة أو اضغط زرًا لعرض **بياناتك أنت فقط**: باقتك، تقدم الاستخدام، والسيرفرات المرتبطة.\n\nإذا لم تربط حسابك بعد، ستجد رابط الربط الآمن عند الضغط.')
    .setImage('attachment://diskoko-account-panel.jpg')
    .setFooter({ text: 'ديسكوكو • معلومات مباشرة من حسابك' });
  return { embeds: [embed], components: navigation(), files: [new AttachmentBuilder(ART, { name: 'diskoko-account-panel.jpg' })], attachments: [], allowedMentions: { parse: [] } };
}

export async function upsertAccountPanel(client, pool) {
  const { guildId } = customerRoleConfig();
  const guild = await client.guilds.fetch(guildId);
  await guild.channels.fetch();
  await pool.query(`CREATE TABLE IF NOT EXISTS community_panels (
    guild_id TEXT NOT NULL, panel_key TEXT NOT NULL, channel_id TEXT NOT NULL, message_id TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(guild_id,panel_key))`);
  const saved = (await pool.query('SELECT channel_id,message_id FROM community_panels WHERE guild_id=$1 AND panel_key=$2', [guildId, KEY])).rows[0];
  let channel = saved?.channel_id ? await guild.channels.fetch(saved.channel_id).catch(() => null) : null;
  if (!channel) channel = guild.channels.cache.find(item => item.name === CHANNEL_NAME && item.type === ChannelType.GuildText);
  if (!channel) {
    const category = guild.channels.cache.find(item => item.type === ChannelType.GuildCategory && /ابدأ هنا|العملاء/.test(item.name));
    channel = await guild.channels.create({
      name: CHANNEL_NAME, type: ChannelType.GuildText, parent: category?.id,
      topic: 'اعرض تفاصيل حسابك وباقتك وتقدم استخدامك بشكل خاص عبر لوحة ديسكوكو.',
      permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] }],
      reason: 'Diskoko member account panel',
    });
  }
  if (!channel.messages) throw new Error('Account panel channel is unavailable');
  let message = saved?.channel_id === channel.id ? await channel.messages.fetch(saved.message_id).catch(() => null) : null;
  const payload = accountPanelPayload();
  if (message?.author.id === client.user.id) await message.edit(payload);
  else message = await channel.send(payload);
  await pool.query(`INSERT INTO community_panels(guild_id,panel_key,channel_id,message_id) VALUES($1,$2,$3,$4)
    ON CONFLICT(guild_id,panel_key) DO UPDATE SET channel_id=EXCLUDED.channel_id,message_id=EXCLUDED.message_id,updated_at=NOW()`, [guildId, KEY, channel.id, message.id]);
  return { channelId: channel.id, messageId: message.id };
}

function bar(used, limit) {
  const filled = Math.min(10, Math.max(0, Math.round(10 * used / Math.max(1, limit))));
  return `${'▰'.repeat(filled)}${'▱'.repeat(10 - filled)}  **${used}/${limit}**`;
}

function safe(value) { return String(value ?? '').replace(/[@`*_~|<>]/g, '').slice(0, 80); }

export async function handleAccountPanelInteraction(interaction, pool) {
  if (!(interaction.isButton() || interaction.isStringSelectMenu()) || !interaction.customId.startsWith('diskoko-account:')) return false;
  const { guildId } = customerRoleConfig();
  if (interaction.guildId !== guildId) return interaction.reply({ content: 'هذه اللوحة مخصصة لمجتمع ديسكوكو.', ephemeral: true }).then(() => true);
  await interaction.deferReply({ ephemeral: true });
  if (!pool) { await interaction.editReply('بيانات الحساب غير متاحة الآن. حاول لاحقًا.'); return true; }
  const view = interaction.isStringSelectMenu() ? interaction.values[0] : interaction.customId.split(':')[1];
  if (!['overview', 'subscription', 'usage', 'servers'].includes(view)) { await interaction.editReply('خيار غير معروف.'); return true; }
  const user = (await pool.query('SELECT id,discord_id,display_name,username,plan,status,created_at FROM users WHERE discord_id=$1 ORDER BY last_login_at DESC LIMIT 1', [interaction.user.id])).rows[0];
  if (!user) {
    await interaction.editReply({ content: 'حساب Discord هذا غير مربوط بديسكوكو حتى الآن. اربطه لتظهر بياناتك ورُتب باقتك تلقائيًا.', components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('ربط حسابي بديسكوكو').setURL(linkUrl))] });
    return true;
  }
  const subscription = (await pool.query('SELECT plan,status,current_period_end,grace_until FROM subscriptions WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 1', [user.id])).rows[0];
  const plan = canonicalPlan(subscription?.plan || user.plan);
  const access = subscriptionAccess(subscription || { status: plan === 'free' ? 'trial' : 'active' });
  const periodEnd = subscription?.current_period_end ? new Date(subscription.current_period_end) : null;
  const inGrace = subscription?.grace_until && new Date(subscription.grace_until) > new Date();
  const active = user.status === 'active' && access.mode === 'full' && (!periodEnd || periodEnd > new Date() || inGrace);
  const limits = entitlementsFor({ plan });
  const embed = new EmbedBuilder().setColor(active ? 0x8058eb : 0xf0a34a).setFooter({ text: 'خاص بك • بيانات مباشرة من ديسكوكو' }).setThumbnail(interaction.user.displayAvatarURL());
  if (view === 'overview') {
    const counts = (await pool.query(`SELECT
      (SELECT COUNT(*)::int FROM projects WHERE user_id=$1 AND archived_at IS NULL) AS projects,
      (SELECT COUNT(DISTINCT guild_id)::int FROM guild_connections WHERE user_id=$1 AND install_status='installed') AS servers`, [user.id])).rows[0];
    embed.setTitle(`✦ أهلًا، ${safe(user.display_name || user.username || interaction.user.username)}`)
      .setDescription('هذه لمحة سريعة عن مساحة عملك في ديسكوكو.')
      .addFields(
        { name: 'الحساب', value: '✅ مربوط بحساب Discord', inline: true },
        { name: 'الباقة', value: `💎 ${names[plan]}`, inline: true },
        { name: 'الحالة', value: active ? '🟢 فعّال' : '🟠 يحتاج مراجعة', inline: true },
        { name: 'مشاريعك', value: String(counts.projects), inline: true },
        { name: 'السيرفرات المتصلة', value: `${counts.servers} / ${limits.servers}`, inline: true },
      );
  } else if (view === 'subscription') {
    embed.setTitle('💎 اشتراكك في ديسكوكو')
      .addFields({ name: 'الباقة الحالية', value: names[plan], inline: true }, { name: 'الوصول', value: active ? 'فعّال' : 'للقراءة فقط أو الحساب غير نشط', inline: true });
    if (subscription?.current_period_end) embed.addFields({ name: 'نهاية الفترة الحالية', value: `<t:${Math.floor(new Date(subscription.current_period_end).getTime() / 1000)}:D>`, inline: false });
    if (!subscription?.current_period_end) embed.setDescription('تفاصيل التجديد متاحة من لوحة حسابك في الموقع.');
  } else if (view === 'usage') {
    const usage = (await pool.query(`SELECT
      (SELECT COUNT(DISTINCT guild_id)::int FROM guild_connections WHERE user_id=$1 AND install_status='installed') AS servers,
      (SELECT COUNT(*)::int FROM customer_bot_registry WHERE owner_id=$1) AS bots,
      (SELECT COUNT(*)::int FROM custom_templates WHERE user_id=$1) AS templates,
      (SELECT COUNT(*)::int FROM scheduled_messages WHERE user_id=$1 AND status IN ('scheduled','sending')) AS scheduled`, [user.id])).rows[0];
    embed.setTitle('📊 تقدم استخدامك').setDescription(`حدود باقة **${names[plan]}** وبياناتها المباشرة:`)
      .addFields(
        { name: 'السيرفرات المتصلة', value: bar(usage.servers, limits.servers) },
        { name: 'البوتات المخصصة', value: bar(usage.bots, limits.customBots) },
        { name: 'القوالب المخصصة', value: bar(usage.templates, limits.customTemplates) },
        { name: 'الرسائل المجدولة', value: bar(usage.scheduled, limits.scheduledMessages) },
      );
  } else {
    const rows = (await pool.query(`SELECT guild_name,guild_id FROM guild_connections WHERE user_id=$1 AND install_status='installed' ORDER BY updated_at DESC LIMIT 10`, [user.id])).rows;
    embed.setTitle('🧩 سيرفراتك المتصلة').setDescription(rows.length ? rows.map((row, i) => `${i + 1}. ${safe(row.guild_name) || `سيرفر ${row.guild_id}`}`).join('\n') : 'لم تربط سيرفرًا بعد. افتح لوحة حسابك لإضافة أول سيرفر.');
  }
  await interaction.editReply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('فتح حسابي في الموقع').setURL(accountUrl))] });
  return true;
}
