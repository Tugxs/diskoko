import sharp from 'sharp';

const imageHosts = new Set(['cdn.discordapp.com', 'media.discordapp.net']);
const imageCache = new Map();
const xml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
const short = (value, length) => Array.from(String(value ?? '').trim()).slice(0, length).join('');
const snowflake = value => /^\d{17,20}$/.test(String(value ?? ''));

function imageUrl(value, label) {
  if (!value) return '';
  let url;
  try { url = new URL(String(value).trim()); } catch { throw Error(`رابط ${label} غير صالح.`); }
  if (url.protocol !== 'https:' || !imageHosts.has(url.hostname) || url.username || url.password || url.href.length > 500) throw Error(`رابط ${label} يجب أن يكون صورة عامة من مرفقات Discord.`);
  return url.href;
}

function safeLink(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { throw Error('رابط الزر غير صالح.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 512 || ['localhost', '127.0.0.1'].includes(url.hostname)) throw Error('رابط الزر يجب أن يكون HTTPS عامًا وصالحًا.');
  return url.href;
}

export function parseCommunityEmoji(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const custom = /^<(a?):([a-zA-Z0-9_]{2,32}):(\d{17,20})>$/.exec(raw);
  if (custom) return { animated: Boolean(custom[1]), name: custom[2], id: custom[3] };
  if (Array.from(raw).length > 8 || !/\p{Extended_Pictographic}/u.test(raw) || /[<>]/.test(raw)) throw Error('استخدم إيموجي واحدًا أو إيموجي سيرفر بالصيغة <:name:id>.');
  return { name: raw };
}

export function normalizeCommunityPanel(input = {}) {
  const title = short(input.title || 'بوابة المجتمع', 60);
  const description = short(input.description || 'اكتشف أقسام مجتمعنا من مكان واحد.', 180);
  const color = /^#[0-9a-f]{6}$/i.test(input.color || '') ? input.color : '#a479ff';
  const tileColor = /^#[0-9a-f]{6}$/i.test(input.tileColor || '') ? input.tileColor : '#a479ff';
  const buttons = Array.isArray(input.buttons) ? input.buttons : [];
  if (!buttons.length || buttons.length > 10) throw Error('أضف من زر واحد إلى 10 أزرار للوحة المجتمع.');
  const normalized = buttons.map((button, index) => {
    const label = short(button?.label, 80);
    if (!label) throw Error(`اكتب اسم الزر رقم ${index + 1}.`);
    const emoji = String(button?.emoji || '').trim();
    parseCommunityEmoji(emoji);
    const kind = ['link', 'channel', 'text'].includes(button?.kind) ? button.kind : 'text';
    const style = [1, 2, 3, 4].includes(Number(button?.style)) ? Number(button.style) : 2;
    if (kind === 'link') return { label, emoji, kind, style: 5, target: safeLink(button?.target) };
    if (kind === 'channel') {
      if (!snowflake(button?.target)) throw Error(`اختر قناة صالحة للزر «${label}».`);
      return { label, emoji, kind, style: 5, target: String(button.target) };
    }
    const target = short(button?.target, 500);
    if (!target) throw Error(`اكتب الرد الذي سيظهر عند الضغط على «${label}».`);
    return { label, emoji, kind, style, target };
  });
  return { title, description, color, tileColor, bannerUrl: imageUrl(input.bannerUrl, 'البنر'), logoUrl: imageUrl(input.logoUrl, 'الشعار'), buttons: normalized };
}

async function imageData(value, size) {
  if (!value) return '';
  const cached = imageCache.get(value);
  if (cached && cached.expires > Date.now()) return cached.data;
  try {
    const response = await fetch(value, { redirect: 'error', signal: AbortSignal.timeout(4000) });
    if (!response.ok || !/^image\/(?:png|jpeg|webp)/i.test(response.headers.get('content-type') || '') || Number(response.headers.get('content-length') || 0) > 4_000_000) return '';
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 4_000_000) return '';
    const data = `data:image/png;base64,${(await sharp(bytes).resize(size, size, { fit: 'cover', withoutEnlargement: true }).png().toBuffer()).toString('base64')}`;
    imageCache.set(value, { data, expires: Date.now() + 300_000 });
    if (imageCache.size > 80) imageCache.delete(imageCache.keys().next().value);
    return data;
  } catch { return ''; }
}

export async function renderCommunityCard(config) {
  const panel = normalizeCommunityPanel(config);
  const [banner, logo] = await Promise.all([imageData(panel.bannerUrl, 960), imageData(panel.logoUrl, 160)]);
  const description = Array.from(panel.description);
  const lines = [description.slice(0, 58).join(''), description.slice(58, 116).join(''), description.slice(116, 174).join('')].filter(Boolean);
  const tiles = panel.buttons.map((button, index) => {
    const col = index % 5, row = Math.floor(index / 5), x = 40 + col * 177, y = 335 + row * 61;
    return `<rect x="${x}" y="${y}" width="166" height="49" rx="12" fill="${panel.tileColor}" fill-opacity=".16" stroke="${panel.tileColor}" stroke-opacity=".65"/><text x="${x + 83}" y="${y + 32}" text-anchor="middle" font-family="Arial,Noto Sans Arabic,DejaVu Sans,sans-serif" font-size="16" font-weight="bold" fill="#f6efff">${xml(short(button.label, 14))}</text>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="480" viewBox="0 0 960 480"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#100d1c"/><stop offset=".6" stop-color="#211633"/><stop offset="1" stop-color="#0d0a19"/></linearGradient><radialGradient id="glow"><stop stop-color="${panel.color}" stop-opacity=".5"/><stop offset="1" stop-color="${panel.color}" stop-opacity="0"/></radialGradient><clipPath id="corner"><rect width="960" height="480" rx="28"/></clipPath><clipPath id="logo"><circle cx="855" cy="78" r="30"/></clipPath></defs><rect width="960" height="480" rx="28" fill="url(#bg)"/>${banner ? `<image href="${banner}" x="0" y="0" width="960" height="480" preserveAspectRatio="xMidYMid slice" opacity=".22" clip-path="url(#corner)"/>` : ''}<circle cx="755" cy="70" r="300" fill="url(#glow)"/><rect x="19" y="19" width="922" height="442" rx="25" fill="none" stroke="${panel.color}" stroke-width="2" stroke-opacity=".78"/><circle cx="855" cy="78" r="32" fill="#2c2046" stroke="${panel.color}" stroke-width="2"/>${logo ? `<image href="${logo}" x="825" y="48" width="60" height="60" preserveAspectRatio="xMidYMid slice" clip-path="url(#logo)"/>` : `<text x="855" y="89" text-anchor="middle" font-size="32" font-family="Arial,sans-serif" fill="#fff">◆</text>`}<rect x="43" y="56" width="200" height="35" rx="17" fill="${panel.color}" fill-opacity=".25"/><text x="143" y="79" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" letter-spacing="2" fill="#f4e6ff">COMMUNITY / DISKOKO</text><text x="895" y="194" text-anchor="end" font-family="Arial,Noto Sans Arabic,DejaVu Sans,sans-serif" font-size="42" font-weight="bold" fill="#fff8ff">${xml(short(panel.title, 40))}</text>${lines.map((line, index) => `<text x="895" y="${230 + index * 27}" text-anchor="end" font-family="Arial,Noto Sans Arabic,DejaVu Sans,sans-serif" font-size="19" fill="#d9cce9">${xml(line)}</text>`).join('')}<path d="M40 310H920" stroke="${panel.color}" stroke-opacity=".75"/>${tiles}<text x="44" y="454" font-family="Arial,sans-serif" font-size="13" letter-spacing="2" fill="#c7b3dc">YOUR SPACE · YOUR STORY</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function communityPanelMessage(config, commandName, guildId) {
  const panel = normalizeCommunityPanel(config);
  const image = await renderCommunityCard(panel);
  const components = [];
  for (let index = 0; index < panel.buttons.length; index += 5) {
    components.push({ type: 1, components: panel.buttons.slice(index, index + 5).map((button, offset) => {
      const emoji = parseCommunityEmoji(button.emoji);
      const common = { type: 2, label: button.label, ...(emoji ? { emoji } : {}) };
      if (button.kind === 'link') return { ...common, style: 5, url: button.target };
      if (button.kind === 'channel') return { ...common, style: 5, url: `https://discord.com/channels/${guildId}/${button.target}` };
      return { ...common, style: button.style, custom_id: `diskoko:community:${commandName}:${index + offset}` };
    }) });
  }
  return { files: [{ attachment: image, name: 'diskoko-community.png' }], components, allowedMentions: { parse: [] } };
}

export async function handleCommunityPanelInteraction(interaction, pool, botId) {
  if (!interaction.isButton() || !interaction.customId.startsWith('diskoko:community:')) return false;
  const match = /^diskoko:community:([-_\p{L}\p{N}]{1,32}):(\d{1,2})$/u.exec(interaction.customId);
  if (!match) return false;
  const command = (await pool.query("SELECT panel_config FROM customer_bot_commands WHERE guild_id=$1 AND bot_user_id=$2 AND name=$3 AND response_kind='community_panel'", [interaction.guildId, botId, match[1]])).rows[0];
  const button = command?.panel_config?.buttons?.[Number(match[2])];
  if (!button || button.kind !== 'text') await interaction.reply({ content: 'هذه اللوحة تغيرت. استخدم الأمر مجددًا لعرض آخر نسخة.', ephemeral: true });
  else await interaction.reply({ content: button.target, ephemeral: true, allowedMentions: { parse: [] } });
  return true;
}

