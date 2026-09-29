import { fileURLToPath } from 'node:url';
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { customerRoleConfig } from './customer-roles.js';

const RULES_MESSAGE_ID = '1553298846078078976';
const RULES_TEXT_CHANNEL_ID = '1298703701665517601';
const ANNOUNCEMENTS_CHANNEL_ID = '1298703701665517604';

const siteUrl = process.env.BASE_URL || 'https://diskoko.com';
const bannerPath = fileURLToPath(new URL('../assets/diskoko-coming-soon.jpg', import.meta.url));

function rulesPayload() {
  const embed = new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle('📜 قوانين مجتمع ديسكوكو')
    .setDescription('أهلًا بك! هنا نتعلم ونبني مجتمعات Discord أفضل. اقرأ هذه القواعد قبل المشاركة؛ هدفها أن يكون المكان مريحًا ومفيدًا للجميع.')
    .setThumbnail(`${siteUrl}/assets/diskoko-logo.png`)
    .addFields(
      { name: '01  الاحترام', value: 'ناقش الأفكار باحترام. يمنع السب والتنمر والتمييز والاستفزاز والهجوم الشخصي.' },
      { name: '02  القناة المناسبة', value: 'انشر كل موضوع في قناته، وتجنب تكرار الرسالة أو إغراق المحادثات.' },
      { name: '03  لا للسبام', value: 'تجنب الرسائل المتكررة، المنشن الجماعي أو المتكرر، والروابط العشوائية.' },
      { name: '04  الترويج بإذن', value: 'لا تعلن عن سيرفر أو متجر أو خدمة أو حساب، ولا تراسل الأعضاء ترويجيًا في الخاص، إلا في مساحة مخصصة أو بموافقة الإدارة.' },
      { name: '05  الخصوصية والأمان', value: 'لا تنشر بيانات الآخرين أو محادثاتهم دون موافقة. لا تشارك كلمات المرور أو رموز البوت. فريق ديسكوكو لن يطلبها منك.' },
      { name: '06  محتوى آمن', value: 'يمنع المحتوى المخالف لسياسات Discord، الاحتيال، انتحال الهوية، والملفات أو الروابط الضارة.' },
      { name: '07  محتوى المجتمع', value: 'شارك أعمالك وأفكارك في القنوات المخصصة. يمنع المحتوى الجنسي أو العنيف أو التحريضي، والمحتوى المسروق المنسوب لنفسك.' },
      { name: '08  البوتات والأدوات', value: 'لا تضف بوتًا أو تشغّل أداة أو رابطًا آليًا في السيرفر دون إذن. يمنع استغلال البوتات أو التحايل على أنظمة الرتب والاشتراكات.' },
      { name: '09  الدعم والاقتراحات', value: 'اطرح السؤال في قناته، واستخدم التذاكر لمشكلات الحساب والفوترة. لا تنشر بيانات حسابك أو تفاصيل طلبك في المحادثات العامة.' },
      { name: '10  البلاغات والثغرات', value: 'بلّغ الدعم عن المخالفات والأخطاء مع وصف واضح. أرسل تفاصيل الثغرات الأمنية للفريق خاصة، ولا تنشر طريقة استغلالها علنًا.' },
      { name: '11  الحسابات والهوية', value: 'يمنع انتحال الإدارة أو الأعضاء أو صفة الشريك الرسمي. رتبة الاشتراك مرتبطة بحسابك الحقيقي في ديسكوكو؛ لا تشارك حسابك لتجاوز صلاحيات الباقات.' },
      { name: '12  قرارات الإشراف', value: 'قد ينقل الفريق أو يحذف المحتوى المخالف، أو يقيّد الحساب بحسب المخالفة وتكرارها. إذا رغبت بمراجعة قرار، تواصل مع الدعم بهدوء.' },
    )
    .setFooter({ text: 'ديسكوكو • ابنِ مجتمعك بطريقتك' });
  return { embeds: [embed], allowedMentions: { parse: [] } };
}

function announcementPayload() {
  const embed = new EmbedBuilder()
    .setColor(0x7256ef)
    .setTitle('✦ ديسكوكو | قريبًا')
    .setDescription('**مجتمعك يبدأ من فكرة. وديسكوكو يساعدك تبنيها.**\n\nتصميم سيرفرات Discord بقوالب مرنة، وإدارة مجتمعك وأدواته من مساحة واحدة. اربط حسابك لتحصل على رتبة العميل ورتبة باقتك تلقائيًا.\n\n**رحلتنا بدأت هنا — خلك قريب 💜**')
    .setImage('attachment://diskoko-coming-soon.jpg')
    .setFooter({ text: 'Diskoko • Build your community. Your way.' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('استكشف ديسكوكو').setEmoji('✨').setURL(siteUrl),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('اربط حسابك').setEmoji('🔗').setURL(new URL('/auth/discord?returnTo=%2Faccount.html%23subscription', siteUrl).toString()),
  );
  return { embeds: [embed], components: [row], files: [new AttachmentBuilder(bannerPath, { name: 'diskoko-coming-soon.jpg' })], attachments: [], allowedMentions: { parse: [] } };
}

export async function upsertCommunityPanels(client, pool) {
  const { guildId } = customerRoleConfig();
  await pool.query(`CREATE TABLE IF NOT EXISTS community_panels (
    guild_id TEXT NOT NULL, panel_key TEXT NOT NULL, channel_id TEXT NOT NULL, message_id TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(guild_id,panel_key))`);
  const rules = await client.channels.fetch(RULES_TEXT_CHANNEL_ID);
  const announcements = await client.channels.fetch(ANNOUNCEMENTS_CHANNEL_ID);
  if (rules?.guildId !== guildId || announcements?.guildId !== guildId || !rules.messages || !announcements.messages) throw new Error('Community channels unavailable');
  const targets = [
    { key: 'rules', channel: rules, legacyId: RULES_MESSAGE_ID, payload: rulesPayload() },
    { key: 'coming-soon', channel: announcements, payload: announcementPayload() },
  ];
  for (const target of targets) {
    const { rows } = await pool.query('SELECT channel_id,message_id FROM community_panels WHERE guild_id=$1 AND panel_key=$2', [guildId, target.key]);
    let message;
    const messageId = rows[0]?.channel_id === target.channel.id ? rows[0].message_id : target.legacyId;
    if (messageId) {
      try { message = await target.channel.messages.fetch(messageId); }
      catch (error) { if (error.code !== 10008) throw error; }
    }
    if (message?.author.id === client.user.id) await message.edit(target.payload);
    else message = await target.channel.send(target.payload);
    await pool.query(`INSERT INTO community_panels(guild_id,panel_key,channel_id,message_id) VALUES($1,$2,$3,$4)
      ON CONFLICT(guild_id,panel_key) DO UPDATE SET channel_id=EXCLUDED.channel_id,message_id=EXCLUDED.message_id,updated_at=NOW()`, [guildId,target.key,target.channel.id,message.id]);
    console.log('Community panel ready', { key: target.key, messageId: message.id });
  }
}


