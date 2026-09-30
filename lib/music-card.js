import sharp from 'sharp';

const escapeXml = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
const short = (value, length) => Array.from(String(value || '')).slice(0, length).join('');
const cache = new Map();

async function imageData(value) {
  if (!value) return '';
  let url;
  try { url = new URL(value); } catch { return ''; }
  if (url.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net', 'i.ytimg.com'].includes(url.hostname)) return '';
  const cached = cache.get(url.href);
  if (cached && cached.expires > Date.now()) return cached.data;
  try {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(3000) });
    if (!response.ok || !/^image\/(?:png|jpeg|webp)/i.test(response.headers.get('content-type') || '')) return '';
    if (Number(response.headers.get('content-length') || 0) > 4_000_000) return '';
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 4_000_000) return '';
    const data = `data:image/png;base64,${(await sharp(bytes).resize(680, 680, { fit: 'cover', withoutEnlargement: true }).png().toBuffer()).toString('base64')}`;
    cache.set(url.href, { data, expires: Date.now() + 300_000 });
    if (cache.size > 80) cache.delete(cache.keys().next().value);
    return data;
  } catch { return ''; }
}

export async function renderMusicCard(config, track, session) {
  const accent = /^#[0-9a-f]{6}$/i.test(config.color || '') ? config.color : '#8659e6';
  const frameStyle = ['minimal', 'glass'].includes(config.frameStyle) ? config.frameStyle : 'neon';
  const frameColor = frameStyle === 'minimal' ? '#62566e' : accent;
  const frameOpacity = frameStyle === 'minimal' ? '.32' : frameStyle === 'glass' ? '.64' : '.8';
  const compact = config.layout === 'compact';
  const artX = compact ? 67 : 47;
  const artY = compact ? 91 : 67;
  const artSize = compact ? 236 : 284;
  const artworkUrl = track?.artworkUrl || (track?.id && /^[a-zA-Z0-9_-]{11}$/.test(track.id) ? `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg` : config.bannerUrl);
  const [artwork, logo] = await Promise.all([imageData(artworkUrl), imageData(config.logoUrl)]);
  const title = escapeXml(short(track?.title || config.title || 'استديو الموسيقى', 48));
  const artist = escapeXml(short(track?.artist || (track ? 'صوتك الآن داخل الروم' : 'شغّل المقطع الذي تختاره'), 48));
  const volume = Math.round((session?.volume ?? (config.defaultVolume || 80) / 100) * 100);
  const time = track?.duration ? `${Math.floor(track.duration / 60)}:${String(Math.floor(track.duration % 60)).padStart(2, '0')}` : '—:—';
  const position = Math.max(0, Number(session?.player?.position || 0) / 1000);
  const progress = track?.duration ? Math.min(520, Math.round(520 * position / track.duration)) : 0;
  const art = artwork ? `<image href="${artwork}" x="${artX}" y="${artY}" width="${artSize}" height="${artSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#cover)"/>` : `<rect x="${artX}" y="${artY}" width="${artSize}" height="${artSize}" rx="20" fill="#1d1830"/><text x="${artX + artSize / 2}" y="${artY + artSize / 2 + 44}" text-anchor="middle" font-size="120" fill="${accent}" font-family="Arial,sans-serif">♫</text>`;
  const logoSvg = logo ? `<image href="${logo}" x="883" y="18" width="44" height="44" preserveAspectRatio="xMidYMid slice" clip-path="url(#logo)"/>` : `<text x="906" y="51" text-anchor="middle" font-size="27" font-weight="bold" fill="#f5eaff" font-family="Arial,sans-serif">dk</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="400" viewBox="0 0 960 400">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0d0c18"/><stop offset=".6" stop-color="#1d122c"/><stop offset="1" stop-color="#100b20"/></linearGradient><radialGradient id="glow"><stop stop-color="${accent}" stop-opacity=".35"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient><clipPath id="cover"><rect x="${artX}" y="${artY}" width="${artSize}" height="${artSize}" rx="20"/></clipPath><clipPath id="logo"><circle cx="905" cy="40" r="22"/></clipPath></defs>
    <rect width="960" height="400" rx="30" fill="url(#bg)"/><circle cx="828" cy="20" r="360" fill="url(#glow)"/><rect x="20" y="20" width="920" height="360" rx="26" fill="none" stroke="${frameColor}" stroke-opacity="${frameOpacity}" stroke-width="${frameStyle === 'minimal' ? 1 : 2}"/>
    <rect x="${artX - 10}" y="${artY - 10}" width="${artSize + 20}" height="${artSize + 20}" rx="25" fill="${accent}" fill-opacity=".16" stroke="${frameColor}" stroke-opacity="${frameOpacity}" stroke-width="2"/>${art}
    <rect x="367" y="68" width="142" height="31" rx="15" fill="${accent}" fill-opacity=".22"/><text x="438" y="89" text-anchor="middle" font-size="15" font-weight="bold" fill="#d9c3ff" font-family="Arial,sans-serif">${track ? 'NOW PLAYING' : 'MUSIC STUDIO'}</text>
    <text x="905" y="90" text-anchor="middle" font-size="12" letter-spacing="2" fill="#cbb6e8" font-family="Arial,sans-serif">ACTIVITY</text>
    <text x="367" y="154" font-size="31" font-weight="bold" fill="#fff8ff" font-family="Arial,Noto Sans Arabic,DejaVu Sans,sans-serif">${title}</text>
    <text x="367" y="190" font-size="20" fill="#b8a6cf" font-family="Arial,Noto Sans Arabic,DejaVu Sans,sans-serif">${artist}</text>
    <text x="367" y="235" font-size="15" letter-spacing="2" fill="#a889c8" font-family="Arial,sans-serif">DISKOKO  /  ${track ? 'LIVE AUDIO' : 'YOUR SERVER · YOUR SOUND'}</text>
    <rect x="367" y="268" width="520" height="6" rx="3" fill="#53445f"/><rect x="367" y="268" width="${progress}" height="6" rx="3" fill="${accent}"/>
    <text x="367" y="301" font-size="16" fill="#d5c6e8" font-family="Arial,sans-serif">${track ? `${Math.floor(position / 60)}:${String(Math.floor(position % 60)).padStart(2, '0')}  /  ${time}` : 'READY'}</text><text x="887" y="301" text-anchor="end" font-size="16" fill="#d5c6e8" font-family="Arial,sans-serif">VOL ${volume}%</text>
    <text x="367" y="343" font-size="17" fill="#e2d5f2" font-family="Arial,Noto Sans Arabic,DejaVu Sans,sans-serif">${track ? '⏮   🔉   ⏸   🔊   ⏭' : 'اضغط إضافة مقطع، ثم ضع الرابط واختر الروم'}</text>
    <circle cx="905" cy="40" r="23" fill="#2d1a48" stroke="${accent}" stroke-width="2"/>${logoSvg}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

