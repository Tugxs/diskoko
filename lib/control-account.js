import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, FileUploadBuilder, LabelBuilder, ModalBuilder, PermissionFlagsBits, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { customerRoleConfig } from './customer-roles.js';

const PREFIX = 'diskoko-control:';
const PANEL_KEY = 'control-account';
const PANEL_NAME = 'control-account';
const LOGO = fileURLToPath(new URL('../assets/diskoko-logo.png', import.meta.url));
const BOOST_MONTHS = [1, 2, 3, 6, 9, 12, 15, 18, 24];
const EFFECTS = [
  ['original', 'Original', 'بدون تأثير'], ['blur', 'Blur', 'نعومة هادئة'], ['gray', 'Grayscale', 'أبيض وأسود'],
  ['sepia', 'Sepia', 'ألوان دافئة'], ['sharp', 'Sharpen', 'تفاصيل أوضح'], ['negative', 'Negative', 'عكس الألوان'],
  ['purple', 'Diskoko Violet', 'بنفسجي ديسكوكو'], ['cyan', 'Diskoko Cyan', 'لمسة سماوية'],
  ['vintage', 'Vintage', 'طابع كلاسيكي'], ['glitch', 'Glitch', 'إزاحة لونية'],
];

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]).slice(0, 90);
const cardBase = (title, subtitle, progress = 0) => `<svg width="1000" height="500" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#0c1024"/><stop offset=".5" stop-color="#201943"/><stop offset="1" stop-color="#44316c"/></linearGradient><linearGradient id="accent"><stop stop-color="#8658ef"/><stop offset="1" stop-color="#48d4ef"/></linearGradient><radialGradient id="halo"><stop stop-color="#8259e6" stop-opacity=".55"/><stop offset="1" stop-color="#8259e6" stop-opacity="0"/></radialGradient></defs><rect width="1000" height="500" fill="url(#bg)" fill-opacity=".75"/><circle cx="190" cy="250" r="310" fill="url(#halo)"/><g stroke="#c3afff" stroke-opacity=".12"><path d="M0 400H1000M0 440H1000M0 480H1000M50 0V500M150 0V500M250 0V500M350 0V500M450 0V500M550 0V500M650 0V500M750 0V500M850 0V500M950 0V500"/></g><rect x="28" y="28" width="944" height="444" rx="25" fill="#0b0c1b" fill-opacity=".36" stroke="#9e89d8" stroke-opacity=".45"/><rect x="28" y="28" width="944" height="5" fill="url(#accent)"/><text x="50" y="86" fill="#c9bde9" font-family="Arial" font-size="19" letter-spacing="5">DISKOKO  /  CONTROL ACCOUNT</text><text x="50" y="305" fill="#ffffff" font-family="Arial" font-size="56" font-weight="700">${escape(title)}</text><text x="52" y="351" fill="#d2c8eb" font-family="Arial" font-size="23">${escape(subtitle)}</text>${title === 'Control Account' ? `<g font-family="Arial" font-size="20" fill="#ede6ff"><rect x="612" y="146" width="310" height="68" rx="15" fill="#5a468d" fill-opacity=".38" stroke="#9b85da" stroke-opacity=".5"/><text x="642" y="190">01   PROFILE &amp; BADGES</text><rect x="612" y="229" width="310" height="68" rx="15" fill="#5a468d" fill-opacity=".28" stroke="#9b85da" stroke-opacity=".4"/><text x="642" y="273">02   IMAGE STUDIO</text><rect x="612" y="312" width="310" height="68" rx="15" fill="#5a468d" fill-opacity=".22" stroke="#9b85da" stroke-opacity=".35"/><text x="642" y="356">03   MEDIA TOOLS</text></g>` : ''}${title.startsWith('Boost') ? `<g font-family="Arial" font-size="16" text-anchor="middle">${[1,2,3,6,9,12,15,18,24].map((m,i)=>`<circle cx="${85+i*102}" cy="384" r="28" fill="${m <= Number(title.match(/(\\d+)M/)?.[1] || 0) ? '#8661e7' : '#302846'}" stroke="#a68ce9"/><text x="${85+i*102}" y="390" fill="white">${m}</text>`).join('')}</g>` : ''}${title.startsWith('Nitro') ? `<g font-family="Arial" font-size="20" text-anchor="middle" fill="#e8dfff"><circle cx="730" cy="220" r="55" fill="#5b4e9d"/><text x="730" y="228">N</text><circle cx="850" cy="220" r="55" fill="#44accd"/><text x="850" y="228">✦</text></g>` : ''}${progress ? `<rect x="52" y="402" width="896" height="14" rx="7" fill="#443661"/><rect x="52" y="402" width="${Math.round(896 * Math.min(100, Math.max(0, progress)) / 100)}" height="14" rx="7" fill="url(#accent)"/>` : ''}</svg>`;

async function brandedCard(title, subtitle, { avatar, banner, progress } = {}) {
  const layers = [];
  if (banner) {
    const image = await fetchDiscordAsset(banner, 5_000_000).catch(() => null);
    if (image) layers.push({ input: await sharp(image).resize(1000, 500, { fit: 'cover' }).modulate({ brightness: .28 }).png().toBuffer(), left: 0, top: 0 });
  }
  layers.push({ input: Buffer.from(cardBase(title, subtitle, progress)), left: 0, top: 0 });
  if (avatar) {
    const image = await fetchDiscordAsset(avatar, 5_000_000).catch(() => null);
    if (image) {
      const round = Buffer.from('<svg width="170" height="170"><circle cx="85" cy="85" r="82" fill="white"/></svg>');
      const circle = await sharp(image).resize(170, 170).composite([{ input: round, blend: 'dest-in' }]).png().toBuffer();
      layers.push({ input: circle, left: 770, top: 105 });
    }
  }
  const logo = await sharp(await readFile(LOGO)).resize(105, 105).png().toBuffer();
  layers.push({ input: logo, left: 48, top: 112 });
  return sharp({ create: { width: 1000, height: 500, channels: 4, background: '#0c1024' } }).composite(layers).jpeg({ quality: 85 }).toBuffer();
}

function optionMenu(id, placeholder, options) {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`${PREFIX}${id}`).setPlaceholder(placeholder).addOptions(options));
}

export async function controlPanelPayload() {
  const image = await brandedCard('Control Account', 'Your Discord profile, your way.');
  const embed = new EmbedBuilder().setColor(0x8058eb).setTitle('✦ Control Account | ديسكوكو')
    .setDescription('مساحتك لتستعرض ملف Discord، تقدم دعم السيرفر، صورة العرض والبنر، وتجرّب تأثيرات الصور وتحفظ ملفاتك. النتائج تظهر **لك فقط**. اختر أداة من القوائم:')
    .setImage('attachment://diskoko-control.jpg').setFooter({ text: 'Diskoko • Make it yours' });
  return { embeds: [embed], files: [new AttachmentBuilder(image, { name: 'diskoko-control.jpg' })], attachments: [], components: [
    optionMenu('profile', '01 · Profile & badges', [
      { label: 'About Me', value: 'about', emoji: '👤' }, { label: 'Boost Progress', value: 'boost', emoji: '🚀' },
      { label: 'Nitro Looks · Preview', value: 'nitro', emoji: '💎' }, { label: 'User Profile by ID', value: 'user', emoji: '🔎' },
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

async function replyCard(interaction, title, subtitle, details = '', options = {}) {
  const card = await brandedCard(title, subtitle, options);
  const embed = new EmbedBuilder().setColor(0x8058eb).setTitle(title).setDescription(details || subtitle).setImage('attachment://diskoko-result.jpg');
  await interaction.editReply({ embeds: [embed], files: [new AttachmentBuilder(card, { name: 'diskoko-result.jpg' })], components: options.components || [], allowedMentions: { parse: [] } });
}

async function userProfile(interaction, id) {
  const user = await interaction.client.users.fetch(id, { force: true }).catch(() => null);
  if (!user) return interaction.editReply('لم أجد هذا المستخدم في Discord.');
  const guild = await interaction.client.guilds.fetch(interaction.guildId);
  const member = await guild.members.fetch(id).catch(() => null);
  const created = Math.floor(user.createdTimestamp / 1000);
  const joined = member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>` : 'ليس عضوًا في هذا السيرفر';
  await replyCard(interaction, user.globalName || user.username, `@${user.username}`, `**إنشاء الحساب:** <t:${created}:D>\n**دخول السيرفر:** ${joined}\n**الرتب هنا:** ${member?.roles?.cache?.filter(role => role.id !== guild.id).size || 0}`, { avatar: user.displayAvatarURL({ extension: 'png', size: 512 }), banner: user.bannerURL({ extension: 'png', size: 1024 }) });
}

async function showBoost(interaction, selected = null) {
  const guild = await interaction.client.guilds.fetch(interaction.guildId);
  const member = await guild.members.fetch(interaction.user.id);
  const since = member.premiumSince;
  if (!since) return replyCard(interaction, 'Boost Progress', 'No active boost in this server', 'لا يظهر أنك تدعم سيرفر ديسكوكو بـBoost حاليًا.');
  const progress = boostProgress(since);
  const current = selected || progress.reached.at(-1) || 0;
  const preview = current && !progress.reached.includes(current);
  const nextLine = progress.nextDate ? `**المرحلة التالية (${progress.next} شهر):** <t:${Math.floor(progress.nextDate.getTime() / 1000)}:R>` : '**أكملت المراحل المعروضة**';
  const row = optionMenu('boost-stage', 'استعرض مراحل دعمك', BOOST_MONTHS.map(months => ({ label: `${months} شهر`, value: String(months), description: progress.reached.includes(months) ? 'وصلت لها' : 'معاينة المرحلة القادمة' })));
  return replyCard(interaction, preview ? `Boost · ${current}M Preview` : `Boost · ${current}M`, preview ? 'Upcoming look' : 'Your support, your mark', `**تدعم ديسكوكو منذ:** <t:${Math.floor(since.getTime() / 1000)}:D>\n${nextLine}\n${preview ? 'هذه معاينة تصميم للمرحلة؛ لم تصل إليها بعد.' : 'هذه المرحلة حسب تاريخ دعمك لهذا السيرفر.'}`, { avatar: interaction.user.displayAvatarURL({ extension: 'png', size: 512 }), progress: preview ? 0 : progress.progress, components: [row] });
}

async function showNitro(interaction, selected = 'current') {
  const preview = selected !== 'current';
  const row = optionMenu('nitro-stage', 'معاينة تصاميم Nitro', [
    { label: 'التصميم الأساسي', value: 'current' }, { label: 'Nitro Basic', value: 'basic' },
    { label: 'Nitro', value: 'nitro' }, { label: 'Opal Look', value: 'opal' }, { label: 'Ruby Look', value: 'ruby' },
  ]);
  return replyCard(interaction, preview ? `Nitro · ${selected.toUpperCase()}` : 'Nitro Looks', 'Design preview',
    `هذه تصاميم لمراحل Nitro بأسلوب ديسكوكو. **هي معاينات فقط** وليست شارات مفتوحة على حسابك.\nلا يتيح Discord للتطبيق الحالي قراءة حالة Nitro أو تاريخ بدايتها؛ لذا لا نعرض حالة أو عدادًا غير موثوق.`, { avatar: interaction.user.displayAvatarURL({ extension: 'png', size: 512 }), components: [row] });
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
  } else if (interaction.isStringSelectMenu() && group === 'boost-stage') await showBoost(interaction, Number(interaction.values[0]));
  else if (interaction.isStringSelectMenu() && group === 'nitro-stage') await showNitro(interaction, interaction.values[0]);
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


