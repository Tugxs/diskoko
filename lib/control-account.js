import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, FileUploadBuilder, LabelBuilder, ModalBuilder, PermissionFlagsBits, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { customerRoleConfig } from './customer-roles.js';

const PREFIX = 'diskoko-control:';
const PANEL_KEY = 'control-account';
const PANEL_NAME = 'control-account';
const LOGO = fileURLToPath(new URL('../assets/diskoko-logo.png', import.meta.url));
const BACKGROUND = fileURLToPath(new URL('../assets/diskoko-control-background.jpg', import.meta.url));
const BADGES = fileURLToPath(new URL('../assets/discord-badges/', import.meta.url));
const BOOST_MONTHS = [1, 2, 3, 6, 9, 12, 15, 18, 24];
const NITRO_STAGES = [
  ['nitro', 0, 'NITRO', '#b18aff'], ['bronze', 1, '1M', '#d79576'], ['silver', 3, '3M', '#c3c6d8'],
  ['gold', 6, '6M', '#f4ca67'], ['platinum', 12, '12M', '#a7c5e2'], ['diamond', 24, '24M', '#8fdcff'],
  ['emerald', 36, '36M', '#75dbad'], ['ruby', 60, '60M', '#f1789c'], ['opal', 72, '72M', '#aeb7ff'],
];
const EFFECTS = [
  ['original', 'Original', 'بدون تأثير'], ['blur', 'Blur', 'نعومة هادئة'], ['gray', 'Grayscale', 'أبيض وأسود'],
  ['sepia', 'Sepia', 'ألوان دافئة'], ['sharp', 'Sharpen', 'تفاصيل أوضح'], ['negative', 'Negative', 'عكس الألوان'],
  ['purple', 'Diskoko Violet', 'بنفسجي ديسكوكو'], ['cyan', 'Diskoko Cyan', 'لمسة سماوية'],
  ['vintage', 'Vintage', 'طابع كلاسيكي'], ['glitch', 'Glitch', 'إزاحة لونية'],
];

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]).slice(0, 90);
function premiumCard(title, subtitle, progress = 0) {
  const heading = escape(title);
  const caption = escape(subtitle);
  const isHome = title === 'Control Account';
  const isBoost = title.startsWith('Boost');
  const isNitro = title.startsWith('Nitro');
  const stage = Number(title.match(/(\d+)M/)?.[1] || 0);
  const steps = isBoost ? `<path d="M80 382H920" stroke="#a483ed" stroke-opacity=".5" stroke-width="3"/><g font-family="Arial" text-anchor="middle">${BOOST_MONTHS.map((month, index) => {
    const x = 92 + index * 102;
    const active = month <= stage;
    return `<circle cx="${x}" cy="382" r="34" fill="#0d0d1d" fill-opacity=".9" stroke="${active ? '#bd91f9' : '#514667'}" stroke-width="2"/><text x="${x}" y="438" font-size="16" fill="${active ? '#fff' : '#aaa1c2'}">${month}M</text>`;
  }).join('')}</g>` : '';
  const feature = isHome ? `<rect x="621" y="158" width="326" height="211" rx="21" fill="#090a19" fill-opacity=".68" stroke="#b699f4" stroke-opacity=".24"/><g font-family="Arial" fill="#e9e2ff"><text x="650" y="202" font-size="21">01  YOUR PROFILE</text><text x="650" y="273" font-size="21">02  BADGE JOURNEY</text><text x="650" y="344" font-size="21">03  IMAGE STUDIO</text></g><path d="M640 218H925M640 289H925" stroke="#9d84e8" stroke-opacity=".28"/>` : '';
  const nitroKey = title.split('·')[1]?.trim().split(' ')[0].toLowerCase();
  const chosenNitro = NITRO_STAGES.findIndex(([key]) => key === nitroKey);
  const nitro = isNitro ? `<path d="M80 382H920" stroke="#a483ed" stroke-opacity=".5" stroke-width="3"/><g font-family="Arial" text-anchor="middle">${NITRO_STAGES.map(([key,,label,color], index) => {
    const x = 92 + index * 102;
    const active = chosenNitro < 0 || index <= chosenNitro;
    return `<circle cx="${x}" cy="382" r="34" fill="#0d0d1d" fill-opacity=".9" stroke="${active ? color : '#514667'}" stroke-width="2"/><text x="${x}" y="438" font-size="12" fill="${active ? '#fff' : '#aaa1c2'}">${key.toUpperCase()}</text>`;
  }).join('')}</g>` : '';
  const spotlight = isBoost || isNitro ? '<circle cx="833" cy="196" r="87" fill="#090a19" fill-opacity=".82" stroke="#b98cff" stroke-opacity=".44" stroke-width="2"/>' : '';
  const meter = progress ? `<rect x="69" y="${isBoost || isNitro ? 456 : 431}" width="862" height="7" rx="4" fill="#31294f"/><rect x="69" y="${isBoost || isNitro ? 456 : 431}" width="${Math.round(862 * Math.max(0, Math.min(progress, 100)) / 100)}" height="7" rx="4" fill="url(#violet)"/>` : '';
  return `<svg width="1000" height="500" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="night" x2="1" y2="1"><stop stop-color="#080a17" stop-opacity=".78"/><stop offset=".56" stop-color="#15122e" stop-opacity=".25"/><stop offset="1" stop-color="#211944" stop-opacity=".16"/></linearGradient><linearGradient id="violet"><stop stop-color="#9b68ff"/><stop offset="1" stop-color="#65d9ff"/></linearGradient><radialGradient id="light"><stop stop-color="#774ce5" stop-opacity=".24"/><stop offset="1" stop-color="#774ce5" stop-opacity="0"/></radialGradient></defs><rect width="1000" height="500" fill="url(#night)"/><circle cx="715" cy="125" r="330" fill="url(#light)"/><text x="68" y="94" font-family="Arial" font-size="17" fill="#bfa9ed" letter-spacing="5">DISKOKO  /  ACCOUNT STUDIO</text><text x="68" y="292" font-family="Arial" font-size="60" font-weight="700" fill="#fff">${heading}</text><text x="70" y="333" font-family="Arial" font-size="22" fill="#d6cdec">${caption}</text>${spotlight}${feature}${steps}${nitro}${meter}${isBoost || isNitro ? '' : '<text x="70" y="464" font-family="Arial" font-size="13" fill="#c3b6e9" letter-spacing="3">MAKE IT YOURS</text>'}</svg>`;
}
export { premiumCard };

async function brandedCard(title, subtitle, { avatar, banner, progress } = {}) {
  const layers = [{ input: await readFile(BACKGROUND), left: 0, top: 0 }];
  if (banner) {
    const image = await fetchDiscordAsset(banner, 5_000_000).catch(() => null);
    if (image) layers.push({ input: await sharp(image).resize(1000, 500, { fit: 'cover' }).modulate({ brightness: .28 }).png().toBuffer(), left: 0, top: 0 });
  }
  layers.push({ input: Buffer.from(premiumCard(title, subtitle, progress)), left: 0, top: 0 });
  const boost = title.startsWith('Boost');
  const nitro = title.startsWith('Nitro');
  const selectedBoost = Number(title.match(/(\d+)M/)?.[1] || 0);
  const selectedNitro = title.split('·')[1]?.trim().split(' ')[0].toLowerCase();
  const icons = boost ? BOOST_MONTHS.map((month, index) => ({ file: `boost-${index + 1}.svg`, active: month <= selectedBoost, selected: month === selectedBoost })) :
    nitro ? NITRO_STAGES.map(([key], index) => ({ file: key === 'nitro' ? 'nitro.svg' : `nitro-${key}.png`, active: NITRO_STAGES.findIndex(([name]) => name === selectedNitro) >= index, selected: key === selectedNitro })) : [];
  for (const [index, icon] of icons.entries()) {
    const image = sharp(await readFile(join(BADGES, icon.file))).resize(58, 58).png();
    layers.push({ input: await (icon.active ? image : image.grayscale().modulate({ brightness: .45 })).toBuffer(), left: 63 + index * 102, top: 353 });
  }
  const featured = icons.find(icon => icon.selected);
  if (featured) layers.push({ input: await sharp(await readFile(join(BADGES, featured.file))).resize(122, 122).png().toBuffer(), left: 772, top: 135 });
  if (avatar) {
    const image = await fetchDiscordAsset(avatar, 5_000_000).catch(() => null);
    if (image) {
      const size = boost || nitro ? 90 : 170;
      const radius = size / 2 - 3;
      const round = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="white"/></svg>`);
      const circle = await sharp(image).resize(size, size).composite([{ input: round, blend: 'dest-in' }]).png().toBuffer();
      layers.push({ input: circle, left: boost || nitro ? 655 : 770, top: boost || nitro ? 151 : 105 });
    }
  }
  const logo = await sharp(await readFile(LOGO)).resize(105, 105).png().toBuffer();
  layers.push({ input: logo, left: 48, top: 112 });
  return sharp({ create: { width: 1000, height: 500, channels: 4, background: '#0c1024' } }).composite(layers).jpeg({ quality: 85 }).toBuffer();
}
export { brandedCard };

function optionMenu(id, placeholder, options) {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`${PREFIX}${id}`).setPlaceholder(placeholder).addOptions(options));
}

export async function controlPanelPayload() {
  const image = await brandedCard('Control Account', 'Your Discord profile, your way.');
  const embed = new EmbedBuilder().setColor(0x8058eb).setTitle('✦ Control Account | ديسكوكو')
    .setDescription('استوديو حسابك الشخصي: عمر حساب Discord، صورتك وبنرك، معاينة الشارات، وصناعة نسخة جديدة من صورك لتنزيلها. النتائج تظهر **لك فقط**. اختر أداة من القوائم:')
    .setImage('attachment://diskoko-control.jpg').setFooter({ text: 'Diskoko • Make it yours' });
  return { embeds: [embed], files: [new AttachmentBuilder(image, { name: 'diskoko-control.jpg' })], attachments: [], components: [
    optionMenu('profile', '01 · Profile & badges', [
      { label: 'My Discord Account', value: 'about', emoji: '👤' }, { label: 'Boost Badge Journey', value: 'boost', emoji: '🚀' },
      { label: 'Nitro Badge Journey', value: 'nitro', emoji: '💎' }, { label: 'Nitro date calculator', value: 'nitro-date', emoji: '📅' },
      { label: 'User Profile by ID', value: 'user', emoji: '🔎' },
      { label: 'My Avatar', value: 'avatar', emoji: '🖼️' }, { label: 'My Banner', value: 'banner', emoji: '🌌' },
    ]),
    optionMenu('image', '02 · Image Studio', [
      { label: 'Use my avatar', value: 'avatar', emoji: '👤' }, { label: 'Use my banner', value: 'banner', emoji: '🌌' },
      { label: 'Upload image', value: 'upload', emoji: '📤' }, { label: 'Image URL', value: 'url', emoji: '🔗' },
    ]),
    optionMenu('media', '03 · Media Downloads', [
      { label: 'Download Video · MP4', value: 'video', emoji: '🎬' }, { label: 'Download Audio · MP3', value: 'audio', emoji: '🎵' },
    ]),
  ], allowedMentions: { parse: [] } };
}

export async function upsertControlPanel(client, pool) {
  const { guildId } = customerRoleConfig();
  const guild = await client.guilds.fetch(guildId);
  await guild.channels.fetch();
  await pool.query(`CREATE TABLE IF NOT EXISTS community_panels (guild_id TEXT NOT NULL, panel_key TEXT NOT NULL, channel_id TEXT NOT NULL, message_id TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(guild_id,panel_key))`);
  const saved = (await pool.query('SELECT channel_id,message_id FROM community_panels WHERE guild_id=$1 AND panel_key=$2', [guildId, PANEL_KEY])).rows[0];
  let channel = saved?.channel_id ? await guild.channels.fetch(saved.channel_id).catch(() => null) : null;
  if (!channel) channel = guild.channels.cache.find(item => item.type === ChannelType.GuildText && item.name === PANEL_NAME);
  if (!channel) {
    const account = guild.channels.cache.find(item => item.type === ChannelType.GuildText && item.name === 'معلومات-حسابك');
    channel = await guild.channels.create({ name: PANEL_NAME, type: ChannelType.GuildText, parent: account?.parentId || undefined,
      topic: 'ملفك في Discord، تقدم Boost، صورك وتأثيراتها، وتحميل وسائطك — نتائج خاصة بك.',
      permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] }], reason: 'Diskoko Control Account' });
    if (account) await channel.setPosition(account.rawPosition + 1).catch(() => {});
  }
  let message = saved?.channel_id === channel.id ? await channel.messages.fetch(saved.message_id).catch(() => null) : null;
  const payload = await controlPanelPayload();
  if (message?.author.id === client.user.id) await message.edit(payload);
  else message = await channel.send(payload);
  await pool.query(`INSERT INTO community_panels(guild_id,panel_key,channel_id,message_id) VALUES($1,$2,$3,$4) ON CONFLICT(guild_id,panel_key) DO UPDATE SET channel_id=EXCLUDED.channel_id,message_id=EXCLUDED.message_id,updated_at=NOW()`, [guildId, PANEL_KEY, channel.id, message.id]);
  return { channelId: channel.id, messageId: message.id };
}

function effectChoices() { return EFFECTS.map(([value, label, description]) => ({ value, label, description })); }
function effectMenu(source) { return optionMenu(`effect:${source}`, 'اختر التأثير', effectChoices()); }
function modal(id, title, label, input) { return new ModalBuilder().setCustomId(`${PREFIX}${id}`).setTitle(title).addLabelComponents(new LabelBuilder().setLabel(label).setTextInputComponent(input)); }
function urlInput(placeholder) { return new TextInputBuilder().setCustomId('url').setStyle(TextInputStyle.Short).setPlaceholder(placeholder).setRequired(true).setMaxLength(1000); }
function effectInput() { return new StringSelectMenuBuilder().setCustomId('effect').setPlaceholder('التأثير').addOptions(effectChoices()); }

export function safeDiscordCdnUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)) return null;
    return url;
  } catch { return null; }
}

async function fetchDiscordAsset(raw, limit = 8_000_000) {
  const url = safeDiscordCdnUrl(raw);
  if (!url) throw new Error('استخدم رابط ملف مباشر من Discord فقط.');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error('تعذر تنزيل الملف من Discord.');
  if (Number(response.headers.get('content-length') || 0) > limit) throw new Error('حجم الملف أكبر من الحد المسموح.');
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) throw new Error('حجم الملف أكبر من الحد المسموح.'); chunks.push(value); } }
  finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks);
}

async function applyEffect(bytes, effect) {
  if (!EFFECTS.some(item => item[0] === effect)) throw new Error('تأثير غير معروف.');
  const image = sharp(bytes, { limitInputPixels: 16_000_000, animated: false }).rotate().resize(1024, 1024, { fit: 'inside', withoutEnlargement: true });
  const meta = await image.metadata();
  if (!['jpeg', 'png', 'webp', 'gif', 'avif'].includes(meta.format)) throw new Error('ارفع صورة PNG أو JPEG أو WebP أو GIF.');
  if (effect === 'blur') image.blur(3);
  if (effect === 'gray') image.grayscale();
  if (effect === 'sepia') image.recomb([[.393,.769,.189],[.349,.686,.168],[.272,.534,.131]]);
  if (effect === 'sharp') image.sharpen();
  if (effect === 'negative') image.negate();
  if (effect === 'purple') image.modulate({ hue: 55, saturation: 1.3 });
  if (effect === 'cyan') image.modulate({ hue: 160, saturation: 1.2 });
  if (effect === 'vintage') image.tint('#a678c4').modulate({ saturation: .7 });
  if (effect === 'glitch') image.modulate({ saturation: 1.6 }).sharpen({ sigma: 2 });
  return image.png().toBuffer();
}
export { applyEffect };

function dateAtMonths(start, months) {
  const date = new Date(start);
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return first;
}
function boostProgress(start, now = new Date()) {
  if (!start) return null;
  const reached = BOOST_MONTHS.filter(months => dateAtMonths(start, months) <= now);
  const next = BOOST_MONTHS.find(months => dateAtMonths(start, months) > now) || null;
  const lastDate = reached.length ? dateAtMonths(start, reached.at(-1)) : new Date(start);
  const nextDate = next ? dateAtMonths(start, next) : null;
  const progress = nextDate ? Math.round(100 * (now - lastDate) / (nextDate - lastDate)) : 100;
  return { reached, next, nextDate, progress: Math.min(100, Math.max(0, progress)) };
}
export { boostProgress };

function nitroProgress(start, now = new Date()) {
  const reached = NITRO_STAGES.filter(([, months]) => dateAtMonths(start, months) <= now);
  const current = reached.at(-1);
  const next = NITRO_STAGES.find(([, months]) => dateAtMonths(start, months) > now);
  const from = dateAtMonths(start, current?.[1] || 0);
  const to = next ? dateAtMonths(start, next[1]) : null;
  return { current, next, nextDate: to, progress: to ? Math.max(0, Math.min(100, Math.round(100 * (now - from) / (to - from)))) : 100 };
}
export { nitroProgress };

async function replyCard(interaction, title, subtitle, details = '', options = {}) {
  const card = await brandedCard(title, subtitle, options);
  const embed = new EmbedBuilder().setColor(0x8058eb).setTitle(title).setDescription(details || subtitle).setImage('attachment://diskoko-result.jpg');
  await interaction.editReply({ embeds: [embed], files: [new AttachmentBuilder(card, { name: 'diskoko-result.jpg' })], components: options.components || [], allowedMentions: { parse: [] } });
}

async function userProfile(interaction, id) {
  const user = await interaction.client.users.fetch(id, { force: true }).catch(() => null);
  if (!user) return interaction.editReply('لم أجد هذا المستخدم في Discord.');
  const created = Math.floor(user.createdTimestamp / 1000);
  const ageDays = Math.floor((Date.now() - user.createdTimestamp) / 86_400_000);
  const banner = user.bannerURL({ extension: 'png', size: 1024 });
  await replyCard(interaction, user.globalName || user.username, `@${user.username}`,
    `**تاريخ إنشاء حساب Discord:** <t:${created}:D>\n**عمر الحساب:** ${ageDays.toLocaleString('ar')} يوم\n**صورة العرض:** متاحة للتنزيل والتعديل من الأدوات أدناه\n**البنر:** ${banner ? 'متاح للتنزيل والتعديل' : 'لم تضع بنر في ملفك بعد'}`,
    { avatar: user.displayAvatarURL({ extension: 'png', size: 512 }), banner });
}

async function showBoost(interaction, selected = null) {
  const guild = await interaction.client.guilds.fetch(interaction.guildId);
  const member = await guild.members.fetch(interaction.user.id);
  const since = member.premiumSince;
  const row = optionMenu('boost-stage', 'استعرض مراحل شارة Boost', BOOST_MONTHS.map(months => ({ label: `${months} شهر`, value: String(months), description: since && boostProgress(since).reached.includes(months) ? 'وصلت لها' : 'معاينة شكل المرحلة' })));
  if (!since) {
    const user = await interaction.client.users.fetch(interaction.user.id, { force: true });
    return replyCard(interaction, selected ? `Boost · ${selected}M Preview` : 'Boost Journey', 'Explore the badge stages',
      'لا يظهر Boost نشط لهذا السيرفر. يمكنك معاينة أشكال المراحل، لكن لا يستطيع البوت قراءة سجل دعمك لسيرفرات أخرى من حسابك الشخصي.',
      { avatar: user.displayAvatarURL({ extension: 'png', size: 512 }), banner: user.bannerURL({ extension: 'png', size: 1024 }), components: [row] });
  }
  const progress = boostProgress(since);
  const current = selected || progress.reached.at(-1) || 0;
  const preview = current && !progress.reached.includes(current);
  const nextLine = progress.nextDate ? `**المرحلة التالية (${progress.next} شهر):** <t:${Math.floor(progress.nextDate.getTime() / 1000)}:R>` : '**أكملت المراحل المعروضة**';
  const user = await interaction.client.users.fetch(interaction.user.id, { force: true });
  const daysLeft = progress.nextDate ? Math.max(0, Math.ceil((progress.nextDate - new Date()) / 86_400_000)) : 0;
  return replyCard(interaction, preview ? `Boost · ${current}M Preview` : `Boost · ${current}M`, preview ? 'A look ahead' : progress.nextDate ? `Next badge in ${daysLeft} days` : 'All milestones reached', `**بداية دعمك لهذا السيرفر:** <t:${Math.floor(since.getTime() / 1000)}:D>\n**المراحل التي وصلت إليها:** ${progress.reached.length ? progress.reached.map(months => `${months}M`).join(' · ') : 'لم تصل إلى أول مرحلة بعد'}\n${nextLine}\n${preview ? 'معاينة للمرحلة المقبلة؛ لم تصل إليها بعد.' : 'هذا التقدم حسب تاريخ دعمك لهذا السيرفر فقط.'}`, { avatar: user.displayAvatarURL({ extension: 'png', size: 512 }), banner: user.bannerURL({ extension: 'png', size: 1024 }), progress: preview ? 0 : progress.progress, components: [row] });
}

async function showNitro(interaction, selected = 'current', start = null) {
  const progress = start ? nitroProgress(start) : null;
  const chosen = selected === 'current' ? (progress?.current?.[0] || 'nitro') : selected;
  const selectedIndex = NITRO_STAGES.findIndex(([key]) => key === chosen);
  const currentIndex = NITRO_STAGES.findIndex(([key]) => key === progress?.current?.[0]);
  const preview = progress && selectedIndex > currentIndex;
  const row = optionMenu(`nitro-stage:${start || 'none'}`, 'استعرض مراحل شارة Nitro', [
    { label: 'مرحلتي المحسوبة', value: 'current' },
    ...NITRO_STAGES.map(([key, months]) => ({ label: key[0].toUpperCase() + key.slice(1), value: key, description: months ? `بعد ${months} شهر من الاشتراك المتصل` : 'بداية الاشتراك' })),
  ]);
  const user = await interaction.client.users.fetch(interaction.user.id, { force: true });
  const stage = NITRO_STAGES.find(([key]) => key === chosen);
  const nextLine = progress?.nextDate ? `**المتبقي للمرحلة التالية (${progress.next[0]}):** <t:${Math.floor(progress.nextDate.getTime() / 1000)}:R> · ${progress.progress}% من المسافة بين المرحلتين` : progress ? '**وصلت إلى آخر مرحلة معروضة.**' : '';
  const details = start
    ? `**تاريخ بداية Nitro الذي أدخلته:** ${start}\n**مرحلتك المحسوبة:** ${progress.current[0]}\n${nextLine}\n${preview ? 'المرحلة المحددة معاينة؛ لم تصل إليها حسب التاريخ المدخل.\n' : ''}الحساب تقديري لا يؤكد حالة اشتراكك. إذا توقف الاشتراك يبدأ تقدم الشارة من جديد. تحقق من شارتك داخل Discord للتأكيد.`
    : 'اختر مرحلة لمعاينة شكلها، أو استخدم «Nitro date calculator» وأدخل تاريخ بداية اشتراكك المتصل ليظهر تقدير الوقت المتبقي والمرحلة الحالية.';
  const daysLeft = progress?.nextDate ? Math.max(0, Math.ceil((progress.nextDate - new Date()) / 86_400_000)) : 0;
  return replyCard(interaction, `Nitro · ${stage[0].toUpperCase()}`, start && !preview && progress?.nextDate ? `Next badge in ${daysLeft} days` : start && !preview ? 'All milestones reached' : 'Badge collection preview',
    details, { avatar: user.displayAvatarURL({ extension: 'png', size: 512 }), banner: user.bannerURL({ extension: 'png', size: 1024 }), progress: progress && !preview ? progress.progress : 0, components: [row] });
}

async function showImage(interaction, kind) {
  const user = await interaction.client.users.fetch(interaction.user.id, { force: true });
  const url = kind === 'avatar' ? user.displayAvatarURL({ extension: 'png', size: 1024 }) : user.bannerURL({ extension: 'png', size: 1024 });
  if (!url) return interaction.editReply('ليس لديك بنر في ملف Discord حاليًا.');
  const bytes = await fetchDiscordAsset(url, 5_000_000);
  await interaction.editReply({ content: kind === 'avatar' ? 'صورتك الحالية — يمكنك حفظها من المرفق أو اختيار تأثير من Image Studio.' : 'بنرك الحالي — يمكنك حفظه من المرفق أو اختيار تأثير من Image Studio.', files: [new AttachmentBuilder(bytes, { name: kind === 'avatar' ? 'diskoko-avatar.png' : 'diskoko-banner.png' })] });
}

async function showEffect(interaction, source, effect) {
  const user = await interaction.client.users.fetch(interaction.user.id, { force: true });
  const url = source === 'avatar' ? user.displayAvatarURL({ extension: 'png', size: 1024 }) : user.bannerURL({ extension: 'png', size: 1024 });
  if (!url) return interaction.editReply('لا يوجد بنر في ملف Discord لتطبيق التأثير عليه.');
  const bytes = await fetchDiscordAsset(url, 5_000_000);
  const result = await applyEffect(bytes, effect);
  await interaction.editReply({ content: `✨ تأثير **${EFFECTS.find(item => item[0] === effect)[1]}** — افتح المرفق لتنزيل النتيجة.`, files: [new AttachmentBuilder(result, { name: `diskoko-${effect}.png` })], components: [effectMenu(source)] });
}

export async function handleControlInteraction(interaction) {
  if (!(interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) || !interaction.customId.startsWith(PREFIX)) return false;
  const { guildId } = customerRoleConfig();
  if (interaction.guildId !== guildId) { await interaction.reply({ content: 'هذه الأداة مخصصة لمجتمع ديسكوكو.', ephemeral: true }); return true; }
  const [, group, action] = interaction.customId.slice(PREFIX.length).match(/^([^:]+)(?::(.+))?$/) || [];
  if (interaction.isStringSelectMenu() && group === 'profile' && interaction.values[0] === 'user') {
    await interaction.showModal(modal('user-modal', 'User Profile', 'Discord User ID', new TextInputBuilder().setCustomId('id').setStyle(TextInputStyle.Short).setMinLength(17).setMaxLength(20).setRequired(true)));
    return true;
  }
  if (interaction.isStringSelectMenu() && group === 'profile' && interaction.values[0] === 'nitro-date') {
    await interaction.showModal(modal('nitro-date-modal', 'Nitro Badge Journey', 'تاريخ بداية Nitro المتصل YYYY-MM-DD',
      new TextInputBuilder().setCustomId('date').setStyle(TextInputStyle.Short).setPlaceholder('2024-01-15').setMinLength(10).setMaxLength(10).setRequired(true)));
    return true;
  }
  if (interaction.isStringSelectMenu() && group === 'image' && ['upload', 'url'].includes(interaction.values[0])) {
    const upload = interaction.values[0] === 'upload';
    const form = new ModalBuilder().setCustomId(`${PREFIX}${upload ? 'upload-modal' : 'url-modal'}`).setTitle(upload ? 'Diskoko Image Studio' : 'Image URL');
    form.addLabelComponents(upload ? new LabelBuilder().setLabel('ارفع صورتك').setFileUploadComponent(new FileUploadBuilder().setCustomId('image').setRequired(true)) : new LabelBuilder().setLabel('رابط صورة Discord').setTextInputComponent(urlInput('https://cdn.discordapp.com/...')));
    form.addLabelComponents(new LabelBuilder().setLabel('اختر التأثير').setStringSelectMenuComponent(effectInput()));
    await interaction.showModal(form);
    return true;
  }
  if (interaction.isStringSelectMenu() && group === 'media') {
    const mode = interaction.values[0];
    await interaction.showModal(modal(`media-modal:${mode}`, mode === 'video' ? 'Download MP4' : 'Download MP3', 'رابط ملف مباشر من Discord', urlInput('https://cdn.discordapp.com/...')));
    return true;
  }
  await interaction.deferReply({ ephemeral: true });
  if (interaction.isStringSelectMenu() && group === 'profile') {
    const value = interaction.values[0];
    if (value === 'about') await userProfile(interaction, interaction.user.id);
    else if (value === 'boost') await showBoost(interaction);
    else if (value === 'nitro') await showNitro(interaction);
    else if (value === 'avatar' || value === 'banner') await showImage(interaction, value);
  } else if (interaction.isModalSubmit() && group === 'user-modal') {
    const id = interaction.fields.getTextInputValue('id').trim();
    if (!/^\d{17,20}$/.test(id)) await interaction.editReply('معرف Discord غير صحيح.'); else await userProfile(interaction, id);
  } else if (interaction.isModalSubmit() && group === 'nitro-date-modal') {
    const date = interaction.fields.getTextInputValue('date').trim();
    const start = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : new Date(NaN);
    if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== date || start > new Date()) await interaction.editReply('اكتب تاريخًا صحيحًا بصيغة YYYY-MM-DD، لا يكون في المستقبل.');
    else await showNitro(interaction, 'current', date);
  } else if (interaction.isStringSelectMenu() && group === 'boost-stage') await showBoost(interaction, Number(interaction.values[0]));
  else if (interaction.isStringSelectMenu() && group === 'nitro-stage') await showNitro(interaction, interaction.values[0], action === 'none' ? null : action);
  else if (interaction.isStringSelectMenu() && group === 'image') {
    const source = interaction.values[0];
    if (source === 'avatar' || source === 'banner') await interaction.editReply({ content: `اختر التأثير لصورة ${source === 'avatar' ? 'الأفاتار' : 'البنر'}:`, components: [effectMenu(source)] });
  } else if (interaction.isStringSelectMenu() && group === 'effect') await showEffect(interaction, action, interaction.values[0]);
  else if (interaction.isModalSubmit() && (group === 'upload-modal' || group === 'url-modal')) {
    const effect = interaction.fields.getStringSelectValues('effect')[0];
    const uploaded = group === 'upload-modal' ? interaction.fields.getUploadedFiles('image')?.first() : null;
    const source = uploaded?.url || interaction.fields.getTextInputValue('url');
    const bytes = await fetchDiscordAsset(source, 5_000_000);
    const result = await applyEffect(bytes, effect);
    await interaction.editReply({ content: `✨ جاهزة بتأثير **${EFFECTS.find(item => item[0] === effect)[1]}**. افتح المرفق لتنزيل صورتك.`, files: [new AttachmentBuilder(result, { name: `diskoko-${effect}.png` })] });
  } else if (interaction.isModalSubmit() && group === 'media-modal') {
    const url = interaction.fields.getTextInputValue('url');
    const mode = action;
    if (!['video', 'audio'].includes(mode)) return interaction.editReply('صيغة غير مدعومة.');
    const path = safeDiscordCdnUrl(url)?.pathname.toLowerCase() || '';
    if (mode === 'video' && !path.endsWith('.mp4')) return interaction.editReply('استخدم رابط ملف MP4 مباشر من Discord.');
    if (mode === 'audio' && !path.endsWith('.mp3')) return interaction.editReply('استخدم رابط ملف MP3 مباشر من Discord.');
    const bytes = await fetchDiscordAsset(url, 8_000_000);
    const isMp4 = bytes.length > 12 && bytes.toString('ascii', 4, 8) === 'ftyp';
    const isMp3 = bytes.toString('ascii', 0, 3) === 'ID3' || (bytes.length > 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    if (mode === 'video' && !isMp4 || mode === 'audio' && !isMp3) return interaction.editReply('محتوى الرابط لا يطابق صيغة الملف المطلوبة.');
    await interaction.editReply({ content: `ملف ${mode === 'video' ? 'الفيديو' : 'الصوت'} جاهز للتنزيل.`, files: [new AttachmentBuilder(bytes, { name: mode === 'video' ? 'diskoko-video.mp4' : 'diskoko-audio.mp3' })] });
  } else await interaction.editReply('خيار غير معروف.');
  return true;
}





