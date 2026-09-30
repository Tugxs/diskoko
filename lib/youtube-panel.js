const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);

export function youtubeVideoId(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    const id = host === 'youtu.be' ? url.pathname.slice(1)
      : youtubeHosts.has(host) && url.pathname === '/watch' ? url.searchParams.get('v')
        : youtubeHosts.has(host) && /^\/(?:shorts|live)\//.test(url.pathname) ? url.pathname.split('/')[2] : null;
    return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : null;
  } catch { return null; }
}

export function normalizeYoutubePanel(input = {}) {
  const text = (key, fallback, max) => String(input[key] || fallback).trim().slice(0, max);
  const httpsImage = key => {
    const value = String(input[key] || '').trim();
    if (!value) return '';
    try { const url = new URL(value); if (url.protocol === 'https:' && !url.username && !url.password && value.length <= 500) return value; } catch { /* invalid */ }
    throw Error(`رابط ${key === 'bannerUrl' ? 'البنر' : 'الشعار'} يجب أن يبدأ بـ HTTPS ويكون صالحًا.`);
  };
  const color = /^#[0-9a-fA-F]{6}$/.test(input.color || '') ? input.color : '#8659e6';
  return {
    title: text('title', 'لوحة المشاهدة', 100),
    description: text('description', 'أضف رابط فيديو يوتيوب من الزر أدناه، ثم افتح المشغّل الرسمي.', 500),
    bannerUrl: httpsImage('bannerUrl'),
    logoUrl: httpsImage('logoUrl'),
    color,
    layout: input.layout === 'compact' ? 'compact' : 'wide',
    buttonOrder: input.buttonOrder === 'add-first' ? 'add-first' : 'watch-first',
    addLabel: text('addLabel', '＋ إضافة فيديو', 80),
    watchLabel: text('watchLabel', '▶ مشاهدة الفيديو', 80),
    backLabel: text('backLabel', '↩ القائمة', 80),
  };
}

export function youtubePanelMessage(config, commandName, video = null, origin = 'https://diskoko.com') {
  const panel = normalizeYoutubePanel(config);
  const color = Number.parseInt(panel.color.slice(1), 16);
  const image = video && panel.layout === 'compact' ? `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg` : panel.bannerUrl || (video ? `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg` : '');
  const embed = {
    title: video ? video.title : panel.title,
    description: video ? `${panel.description}\n\nشاهد الفيديو عبر مشغّل YouTube الرسمي. للمشاهدة المشتركة داخل Discord افتح نشاط Watch Together من القناة الصوتية وأضف الرابط هناك.` : panel.description,
    color,
    ...(image ? { image: { url: image } } : {}),
    ...(panel.logoUrl || video && panel.layout === 'wide' ? { thumbnail: { url: panel.logoUrl || `https://i.ytimg.com/vi/${video.id}/default.jpg` } } : {}),
    footer: { text: video ? 'YouTube · تحكم بالتشغيل من المشغّل الرسمي' : 'Diskoko · اختر فيديو من الزر أدناه' },
  };
  const addButton = { type: 2, style: 1, label: panel.addLabel, custom_id: `diskoko:yt:add:${commandName}` };
  const watchButton = video ? { type: 2, style: 5, label: panel.watchLabel, url: `${origin.replace(/\/$/, '')}/watch.html?v=${video.id}` } : null;
  const buttons = video ? [
    ...(panel.buttonOrder === 'add-first' ? [addButton, watchButton] : [watchButton, addButton]),
    { type: 2, style: 2, label: panel.backLabel, custom_id: `diskoko:yt:home:${commandName}` },
  ] : [addButton];
  return { embeds: [embed], components: [{ type: 1, components: buttons }], allowedMentions: { parse: [] } };
}

export async function handleYoutubePanelInteraction(interaction, pool, botId, origin = 'https://diskoko.com') {
  const match = /^diskoko:yt:(add|home|submit):([-_\p{L}\p{N}]{1,32})$/u.exec(interaction.customId || '');
  if (!match || !interaction.guildId) return false;
  const [, action, name] = match;
  const command = (await pool.query("SELECT panel_config FROM customer_bot_commands WHERE guild_id=$1 AND bot_user_id=$2 AND name=$3 AND response_kind='youtube_panel'", [interaction.guildId, botId, name])).rows[0];
  if (!command) { await interaction.reply({ content: 'هذه اللوحة لم تعد مرتبطة بهذا البوت. اطلب من الإدارة مراجعة إعدادها.', ephemeral: true }); return true; }
  if (action === 'add') {
    await interaction.showModal({ custom_id: `diskoko:yt:submit:${name}`, title: 'إضافة فيديو إلى اللوحة', components: [
      { type: 1, components: [{ type: 4, custom_id: 'video_url', label: 'رابط فيديو YouTube', style: 1, required: true, max_length: 300 }] },
      { type: 1, components: [{ type: 4, custom_id: 'video_title', label: 'عنوان يظهر في البطاقة', style: 1, required: true, max_length: 100 }] },
    ] });
    return true;
  }
  if (action === 'home') { await interaction.update(youtubePanelMessage(command.panel_config, name, null, origin)); return true; }
  const url = interaction.fields.getTextInputValue('video_url');
  const id = youtubeVideoId(url);
  if (!id) { await interaction.reply({ content: 'رابط الفيديو غير صالح. استخدم رابط watch أو shorts أو youtu.be يبدأ بـ HTTPS، ثم جرّب زر الإضافة من جديد.', ephemeral: true }); return true; }
  const title = interaction.fields.getTextInputValue('video_title').trim();
  if (!title) { await interaction.reply({ content: 'اكتب عنوانًا للفيديو ثم حاول مجددًا.', ephemeral: true }); return true; }
  await interaction.update(youtubePanelMessage(command.panel_config, name, { id, title }, origin));
  return true;
}

