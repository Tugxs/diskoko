import { Readable, Transform } from 'node:stream';
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { youtubeVideoId } from './youtube-panel.js';
import { youtubeAudioInfo, youtubeAudioStream } from './youtube-audio.js';
import { lavalinkConfigured, lavalinkFor, resolveLavalinkTrack } from './lavalink-audio.js';
import { renderMusicCard } from './music-card.js';

const sessions = new Map();
const sessionKey = (guildId, botId) => `${guildId}:${botId}`;
const buttonId = (action, name) => `diskoko:music:${action}:${name}`;
const text = (value, fallback, limit) => String(value || fallback).trim().slice(0, limit);
export const musicSlashOptions = [
  { type: 3, name: 'رابط', description: 'رابط YouTube أو ملف صوتي', required: true },
  { type: 7, name: 'روم', description: 'القناة الصوتية التي سيدخلها البوت', required: true, channel_types: [2] },
];

export function normalizeMusicPanel(input = {}) {
  const image = (value, label) => {
    if (!value) return '';
    try {
      const url = new URL(String(value).trim());
      if (url.protocol === 'https:' && !url.username && !url.password && url.href.length <= 500 && ['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)) return url.href;
    } catch { /* invalid */ }
    throw Error(`رابط ${label} يجب أن يكون من مرفقات Discord العامة (cdn.discordapp.com أو media.discordapp.net).`);
  };
  return {
    title: text(input.title, 'استديو الموسيقى', 100),
    description: text(input.description, 'اختر القناة الصوتية وأضف مقطعًا للتحكم بالتشغيل.', 500),
    bannerUrl: image(input.bannerUrl, 'البنر'),
    coverUrl: image(input.coverUrl, 'صورة الغلاف'),
    logoUrl: image(input.logoUrl, 'الشعار'),
    color: /^#[\da-f]{6}$/i.test(input.color || '') ? input.color : '#8659e6',
    layout: input.layout === 'compact' ? 'compact' : 'wide',
    frameStyle: ['neon', 'minimal', 'glass'].includes(input.frameStyle) ? input.frameStyle : 'neon',
    controlStyle: [1, 2, 3].includes(Number(input.controlStyle)) ? Number(input.controlStyle) : 2,
    addLabel: text(input.addLabel === '♫ اختر رومًا وأضف مقطعًا' ? '' : input.addLabel, '♫ إضافة مقطع', 80),
    pauseLabel: text(input.pauseLabel, '⏸ إيقاف مؤقت', 80),
    resumeLabel: text(input.resumeLabel, '▶ متابعة', 80),
    skipLabel: text(input.skipLabel, '⏭ التالي', 80),
    stopLabel: text(input.stopLabel, '⏹ إيقاف وإخراج البوت', 80),
    volumeLabel: text(input.volumeLabel, '🔊 مستوى الصوت', 80),
    queueLabel: text(input.queueLabel, '☷ قائمة التشغيل', 80),
    defaultVolume: Math.max(1, Math.min(100, Number.parseInt(input.defaultVolume, 10) || 80)),
  };
}

export function musicPanelMessage(config, name, session = null) {
  const panel = normalizeMusicPanel(config);
  const current = session?.queue?.[0];
  const artwork = current?.artworkUrl || (current?.id && /^[a-zA-Z0-9_-]{11}$/.test(current.id) ? `https://i.ytimg.com/vi/${current.id}/hqdefault.jpg` : '');
  const embed = {
    title: current ? `♫ ${current.title}` : panel.title,
    description: current ? `${panel.description}\n\nالقناة الصوتية: <#${session.channelId}> · الصوت: ${Math.round(session.volume * 100)}%\n${session.queue.slice(1, 4).map((item, index) => `${index + 1}. ${item.title}`).join('\n') || 'لا توجد مقاطع أخرى في القائمة.'}` : `${panel.description}\n\nاكتب /${name} وضع الرابط والروم في حقول الأمر داخل الشات.`,
    color: Number.parseInt(panel.color.slice(1), 16),
    ...(panel.bannerUrl || artwork ? { image: { url: panel.bannerUrl || artwork } } : {}),
    ...(panel.logoUrl ? { thumbnail: { url: panel.logoUrl } } : {}),
    footer: { text: current ? `/${name} لتغيير المقطع · يتحكم أعضاء الروم والإدارة بالتشغيل` : `/${name} ← رابط + روم في خطوة واحدة` },
  };
  const components = current ? [
    { type: 1, components: [
      { type: 2, style: panel.controlStyle, emoji: { name: session.repeat ? '🔂' : '🔁' }, custom_id: buttonId('repeat', name) },
      { type: 2, style: panel.controlStyle, emoji: { name: '🔉' }, custom_id: buttonId('vol-down', name) },
      { type: 2, style: panel.controlStyle, emoji: { name: session.paused ? '▶️' : '⏸️' }, custom_id: buttonId('pause', name) },
      { type: 2, style: panel.controlStyle, emoji: { name: '🔊' }, custom_id: buttonId('vol-up', name) },
      { type: 2, style: panel.controlStyle, emoji: { name: '⏭️' }, custom_id: buttonId('skip', name) },
    ] },
    { type: 1, components: [
      { type: 2, style: 4, emoji: { name: '⏹️' }, custom_id: buttonId('stop', name) },
    ] },
  ] : [];
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

export async function musicPanelPayload(config, name, session = null) {
  const base = musicPanelMessage(config, name, session);
  try {
    const image = await renderMusicCard(normalizeMusicPanel(config), session?.queue?.[0], session);
    return {
      content: session?.queue?.length ? `🎵 <#${session.channelId}> · لتغيير الأغنية اكتب /${name} برابط جديد` : `🎵 **${normalizeMusicPanel(config).title}** · اكتب /${name} بالرابط والروم`,
      components: base.components,
      files: [{ attachment: image, name: 'diskoko-music.png' }],
      attachments: [],
      allowedMentions: { parse: [] },
    };
  } catch (error) {
    console.error('Music card rendering failed', { error: error.message });
    return base;
  }
}

export function musicEntryModal(name) {
  return { custom_id: buttonId('entry', name), title: 'إضافة مقطع موسيقي', components: [
    { type: 18, label: 'رابط المقطع', description: 'رابط YouTube عام أو ملف صوتي', component: { type: 4, custom_id: 'audio_url', style: 1, required: true, max_length: 500, placeholder: 'https://youtu.be/…' } },
    { type: 18, label: 'الروم الصوتي', description: 'اختر الروم الذي سيدخله البوت', component: { type: 8, custom_id: 'voice_room', channel_types: [2], required: true, min_values: 1, max_values: 1 } },
  ] };
}

export function musicRoomPicker(name) {
  return { content: 'اختر الروم الصوتي الذي سيدخله البوت. يجب أن تكون فيه، أو تملك صلاحية إدارة السيرفر.', components: [{ type: 1, components: [{ type: 8, custom_id: buttonId('room', name), channel_types: [2], placeholder: 'اختر رومًا صوتيًا' }] }], ephemeral: true };
}

export async function handleMusicCommand(interaction, client, botId, name, config) {
  const url = interaction.options.getString('رابط');
  if (!url) return interaction.reply({ content: `حدّث أمر /${name} من قائمة Discord، ثم ضع الرابط والروم في حقول الأمر داخل الشات.`, ephemeral: true });
  const channelId = interaction.options.getChannel('روم')?.id || interaction.member?.voice?.channelId;
  if (!channelId) return interaction.reply({ content: 'اختر الروم الصوتي في خانة «روم»، أو ادخل الروم ثم أعد الأمر.', ephemeral: true });
  if (interaction.member?.voice?.channelId !== channelId && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild))
    return interaction.reply({ content: 'ادخل الروم المختار أولًا، أو اطلب من مدير السيرفر تشغيل البوت فيه.', ephemeral: true });
  await interaction.deferReply({ ephemeral: true });
  try {
    const track = await resolveMusicTrack(url, client, interaction.guildId);
    await startMusic(interaction, client, botId, name, config, channelId, track, true);
    await interaction.editReply(`بدأ تشغيل المقطع في <#${channelId}>. لوحة التحكم ظهرت في هذه المحادثة؛ لتغيير الأغنية أعد /${name} برابط آخر.`);
  } catch (error) { await interaction.editReply(error.message); }
}

export function validateMusicSource(value, allowedHosts = process.env.MUSIC_AUDIO_HOSTS || '') {
  try {
    const url = new URL(String(value || '').trim());
    const hosts = new Set(['cdn.discordapp.com', 'media.discordapp.net', ...allowedHosts.split(',').map(host => host.trim().toLowerCase()).filter(Boolean)]);
    if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 500 || !hosts.has(url.hostname.toLowerCase())) return null;
    return url.href;
  } catch { return null; }
}

export function musicSourceTitle(value) {
  try {
    const name = decodeURIComponent(new URL(value).pathname.split('/').pop() || '')
      .replace(/\.(?:mp3|m4a|aac|ogg|opus|wav|flac)$/i, '')
      .replace(/[_-]+/g, ' ').trim();
    return text(name, 'مقطع صوتي', 100);
  } catch { return 'مقطع صوتي'; }
}

export async function resolveMusicTrack(value, client, guildId = '') {
  const id = youtubeVideoId(value);
  if (id && lavalinkConfigured(guildId)) return resolveLavalinkTrack(client, `https://www.youtube.com/watch?v=${id}`, guildId);
  if (id) return { kind: 'youtube', url: `https://www.youtube.com/watch?v=${id}`, ...await youtubeAudioInfo(id, guildId) };
  const url = validateMusicSource(value);
  if (url && lavalinkConfigured(guildId)) return resolveLavalinkTrack(client, url, guildId);
  if (url) return { kind: 'direct', url, title: musicSourceTitle(url) };
  throw Error('الرابط غير صالح. ضع رابط فيديو YouTube عامًّا أو رابط ملف صوتي من مرفقات Discord.');
}

async function audioStream(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let response;
  try { response = await fetch(url, { redirect: 'error', signal: controller.signal }); }
  finally { clearTimeout(timer); }
  if (!response.ok || !response.body || !/^(audio\/|application\/ogg|application\/octet-stream)/i.test(response.headers.get('content-type') || '')) {
    await response.body?.cancel().catch(() => {});
    throw Error('الرابط لا يقدم ملفًا صوتيًا مباشرًا. ارفع ملف MP3 أو OGG في Discord واستخدم رابط المرفق.');
  }
  const maxBytes = 80 * 1024 * 1024;
  if (Number(response.headers.get('content-length') || 0) > maxBytes) {
    await response.body.cancel().catch(() => {});
    throw Error('الملف الصوتي أكبر من الحد المسموح (80 ميجابايت).');
  }
  let received = 0;
  const limiter = new Transform({ transform(chunk, encoding, callback) {
    received += chunk.length;
    callback(received > maxBytes ? Error('الملف الصوتي أكبر من الحد المسموح (80 ميجابايت).') : null, chunk);
  } });
  return Readable.fromWeb(response.body).pipe(limiter);
}

async function playNext(session) {
  const { AudioPlayerStatus, createAudioResource, StreamType } = await import('@discordjs/voice');
  const next = session.queue[0];
  if (!next) {
    await closeMusicSession(session);
    await session.message?.edit(await musicPanelPayload(session.config, session.name)).catch(() => {});
    return;
  }
  if (session.engine === 'lavalink') {
    await session.player.playTrack({ track: { encoded: next.encoded } });
    await session.player.setGlobalVolume(Math.round(session.volume * 100));
    session.paused = false;
    await session.message?.edit(await musicPanelPayload(session.config, session.name, session)).catch(() => {});
    return;
  }
  const stream = next.kind === 'youtube' ? await youtubeAudioStream(next.id, session.guildId) : await audioStream(next.url);
  session.source?.destroy();
  session.source = stream;
  const resource = createAudioResource(stream, { inputType: StreamType.Arbitrary, inlineVolume: true });
  resource.volume?.setVolume(session.volume);
  session.player.play(resource);
  session.paused = false;
  await session.message?.edit(await musicPanelPayload(session.config, session.name, session)).catch(() => {});
}

async function closeMusicSession(session) {
  session.source?.destroy();
  if (session.renderTimer) clearInterval(session.renderTimer);
  sessions.delete(session.key);
  if (session.engine === 'lavalink') await session.manager.leaveVoiceChannel(session.guildId).catch(error => console.error('Lavalink leave failed', error.message));
  else session.connection.destroy();
}

function startProgressUpdates(session) {
  if (session.renderTimer) return;
  session.renderTimer = setInterval(() => {
    if (!session.message || !session.queue.length || sessions.get(session.key) !== session || session.rendering) return;
    session.rendering = true;
    void musicPanelPayload(session.config, session.name, session)
      .then(payload => session.message.edit(payload))
      .catch(error => console.error('Music card progress update failed', { guildId: session.guildId, error: error.message }))
      .finally(() => { session.rendering = false; });
  }, 20_000);
  session.renderTimer.unref?.();
}

async function startMusic(interaction, client, botId, name, config, channelId, track, replaceCurrent = false) {
  const { AudioPlayerStatus, NoSubscriberBehavior, VoiceConnectionStatus, createAudioPlayer, entersState, joinVoiceChannel } = await import('@discordjs/voice');
  const textPermissions = interaction.channel?.permissionsFor?.(client.user);
  if (textPermissions && !textPermissions.has(PermissionFlagsBits.SendMessages)) throw Error('البوت لا يملك صلاحية Send Messages في قناة الشات هذه. فعّلها ثم أعد الأمر.');
  if (textPermissions && !textPermissions.has(PermissionFlagsBits.AttachFiles)) throw Error('البوت لا يملك صلاحية Attach Files في قناة الشات هذه. البطاقة الجديدة تُرسل كصورة، ففعّل الصلاحية ثم أعد الأمر.');
  const key = sessionKey(interaction.guildId, botId);
  let session = sessions.get(key);
  if (session && session.name !== name) throw Error('هذا البوت يشغّل من لوحة موسيقى أخرى. أوقف الجلسة الحالية أو اختر بوتًا آخر.');
  if (session && session.channelId !== channelId) throw Error('البوت يشغّل الآن في روم آخر. أوقف الجلسة الحالية قبل نقله.');
  if (!session) {
    const limit = Math.max(1, Number.parseInt(process.env.MUSIC_MAX_SESSIONS || '3', 10) || 3);
    if (sessions.size >= limit) throw Error('مشغّل الموسيقى مشغول حاليًا. انتظر انتهاء جلسة صوتية أخرى ثم حاول.');
    const channel = await interaction.guild.channels.fetch(channelId);
    if (!channel?.isVoiceBased() || channel.guildId !== interaction.guildId) throw Error('اختر قناة صوتية في هذا السيرفر.');
    const permissions = channel.permissionsFor(client.user);
    if (!permissions?.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) throw Error('ارفع صلاحية البوت للاتصال والتحدث في الروم المختار.');
    const useLavalink = track.kind === 'lavalink';
    let connection, player, manager;
    if (useLavalink) {
      manager = await lavalinkFor(client, interaction.guildId);
      try { player = await manager.joinVoiceChannel({ guildId: interaction.guildId, channelId, shardId: interaction.guild.shardId || 0, deaf: true }); }
      catch (error) { console.error('Lavalink voice join failed', { guildId: interaction.guildId, error: error.message }); throw Error('لم يستطع خادم الموسيقى إدخال البوت للروم. تحقق من صلاحية الاتصال وحدّ الأعضاء، ثم حاول.'); }
    } else {
      connection = joinVoiceChannel({ channelId, guildId: interaction.guildId, adapterCreator: interaction.guild.voiceAdapterCreator, selfDeaf: true });
      try { await entersState(connection, VoiceConnectionStatus.Ready, 20_000); }
      catch { connection.destroy(); throw Error('لم يستطع البوت دخول الروم. تحقق من صلاحيات الاتصال وحدّ الأعضاء.'); }
      player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
      connection.subscribe(player);
    }
    session = { key, guildId: interaction.guildId, engine: useLavalink ? 'lavalink' : 'direct', manager, connection, player, channelId, queue: [], config, name, volume: normalizeMusicPanel(config).defaultVolume / 100, paused: false, repeat: false, source: null, message: null };
    sessions.set(key, session);
    const onEnded = () => {
      if (sessions.get(key) !== session) return;
      if (!session.repeat || session.skipRequested) session.queue.shift();
      session.skipRequested = false;
      void playNext(session).catch(error => { void session.message?.channel.send(`تعذر تشغيل المقطع التالي: ${error.message}`).catch(() => {}); void closeMusicSession(session); });
    };
    if (useLavalink) player.on('end', event => { if (['finished', 'loadFailed'].includes(event.reason)) { if (event.reason === 'loadFailed') session.skipRequested = true; onEnded(); } });
    else player.on(AudioPlayerStatus.Idle, onEnded);
    player.on(useLavalink ? 'exception' : 'error', error => {
      if (sessions.get(key) !== session) return;
      void session.message?.channel.send('تعذر تشغيل هذا المقطع من المصدر. جرّب رابطًا آخر أو راجع حالة خادم الموسيقى.').catch(() => {});
      console.error('Music playback failed', { guildId: interaction.guildId, error: error.message || error.exception?.message || String(error) });
      session.skipRequested = true;
      if (useLavalink) void session.player.stopTrack(); else session.player.stop(true);
    });
  }
  if ((session.engine === 'lavalink') !== (track.kind === 'lavalink')) throw Error('مصدر هذا المقطع لا يطابق جلسة التشغيل الحالية. أوقف الجلسة وابدأ من جديد.');
  if (replaceCurrent && session.queue.length) {
    session.queue = [{ ...track, requestedBy: interaction.user.id }];
    await playNext(session);
    return 1;
  }
  if (session.queue.length >= 25) throw Error('قائمة التشغيل ممتلئة (25 مقطعًا). انتظر أو تخطَّ مقطعًا.');
  session.queue.push({ ...track, requestedBy: interaction.user.id });
  if (session.queue.length === 1) {
    try { await playNext(session); }
    catch (error) { await closeMusicSession(session); throw error; }
    try {
      const original = interaction.message && !interaction.message.flags?.has(MessageFlags.Ephemeral) ? interaction.message : null;
      session.message = original ? await original.edit(await musicPanelPayload(config, name, session)).catch(() => null) : null;
      session.message ||= await interaction.channel.send(await musicPanelPayload(config, name, session));
      startProgressUpdates(session);
    }
    catch (error) {
      console.error('Music control panel send failed', { guildId: interaction.guildId, channelId: interaction.channelId, botId, code: error.code, status: error.status, message: error.message, rawError: error.rawError });
      await closeMusicSession(session);
      if (error.code === 50013 || error.status === 403) throw Error('رفض Discord إرسال البطاقة. تأكد من صلاحيات Send Messages وAttach Files للبوت في قناة الشات، ثم حاول.');
      throw Error('تعذر إرسال لوحة التحكم بسبب رد Discord. سجّل وقت المحاولة وراجع سجل البوت؛ إذا كانت الصلاحيات سليمة سنصلح سبب الرفض المحدد.');
    }
  } else await session.message?.edit(await musicPanelPayload(config, name, session)).catch(() => {});
  return session.queue.length;
}

export async function handleMusicInteraction(interaction, pool, botId, client) {
  const match = /^diskoko:music:(choose|entry|room|add|pause|skip|stop|repeat|volume|setvolume|vol-down|vol-up|queue):([-_\p{L}\p{N}]{1,32})(?::(\d{17,20}))?$/u.exec(interaction.customId || '');
  if (!match || !interaction.guildId) return false;
  const [, action, name, selectedChannel] = match;
  const command = (await pool.query("SELECT panel_config FROM customer_bot_commands WHERE guild_id=$1 AND bot_user_id=$2 AND name=$3 AND response_kind='music_panel'", [interaction.guildId, botId, name])).rows[0];
  if (!command) { await interaction.reply({ content: 'لوحة الموسيقى غير مرتبطة بهذا البوت. اطلب من الإدارة مراجعتها.', ephemeral: true }); return true; }
  const key = sessionKey(interaction.guildId, botId);
  const session = sessions.get(key);
  if (action === 'choose') {
    await interaction.showModal(musicEntryModal(name));
    return true;
  }
  if (action === 'entry') {
    const channelId = interaction.fields.getSelectedChannels('voice_room')?.first()?.id;
    if (!channelId) { await interaction.reply({ content: 'اختر رومًا صوتيًا داخل النموذج.', ephemeral: true }); return true; }
    const permitted = interaction.member?.voice?.channelId === channelId || interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
    if (!permitted) { await interaction.reply({ content: 'ادخل الروم المختار أولًا، أو اطلب من مدير السيرفر تشغيل البوت فيه.', ephemeral: true }); return true; }
    await interaction.deferReply({ ephemeral: true });
    try {
      const track = await resolveMusicTrack(interaction.fields.getTextInputValue('audio_url'), client, interaction.guildId);
      const count = await startMusic(interaction, client, botId, name, command.panel_config, channelId, track);
      await interaction.editReply(count === 1 ? `دخل البوت <#${channelId}> وبدأ التشغيل. لوحة التحكم ظهرت في هذه المحادثة.` : `أُضيف المقطع إلى القائمة في <#${channelId}>. ترتيبه ${count}.`);
    } catch (error) { await interaction.editReply(error.message); }
    return true;
  }
  if (action === 'room') {
    const channelId = interaction.values?.[0];
    if (!channelId) { await interaction.reply({ content: 'اختر رومًا صوتيًا.', ephemeral: true }); return true; }
    const permitted = interaction.member?.voice?.channelId === channelId || interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
    if (!permitted) { await interaction.reply({ content: 'ادخل الروم المختار أولًا، أو اطلب من مدير السيرفر تشغيل البوت فيه.', ephemeral: true }); return true; }
    await interaction.reply({ content: `شغّل المقطع عبر /${name} وضع الرابط في خانة «رابط»، وحدد <#${channelId}> في خانة «روم».`, ephemeral: true });
    return true;
  }
  if (action === 'add') {
    const permitted = interaction.member?.voice?.channelId === selectedChannel || interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
    if (!permitted) { await interaction.reply({ content: 'ادخل الروم الصوتي المختار قبل إضافة المقطع.', ephemeral: true }); return true; }
    await interaction.deferReply({ ephemeral: true });
    try {
      const track = await resolveMusicTrack(interaction.fields.getTextInputValue('audio_url'), client, interaction.guildId);
      const count = await startMusic(interaction, client, botId, name, command.panel_config, selectedChannel, track);
      await interaction.editReply(count === 1 ? `دخل البوت <#${selectedChannel}> وبدأ التشغيل.` : `أضيف المقطع إلى القائمة في <#${selectedChannel}>. ترتيبه ${count}.`);
    } catch (error) { await interaction.editReply(error.message); }
    return true;
  }
  if (!session?.queue.length) { await interaction.reply({ content: 'لا توجد جلسة تشغيل الآن. اختر رومًا وأضف مقطعًا.', ephemeral: true }); return true; }
  if (session.name !== name) { await interaction.reply({ content: 'هذه الأزرار تتبع لوحة أخرى. افتح لوحة الموسيقى النشطة للتحكم.', ephemeral: true }); return true; }
  if (interaction.member?.voice?.channelId !== session.channelId && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: 'تحكم بالموسيقى من داخل الروم الصوتي الحالي، أو اطلب من الإدارة ذلك.', ephemeral: true }); return true;
  }
  if (action === 'queue') {
    await interaction.reply({ content: session.queue.map((item, index) => `${index === 0 ? '▶ الآن' : `${index}. التالي`}: ${item.title}`).join('\n').slice(0, 1900), ephemeral: true });
    return true;
  }
  if (action === 'repeat') {
    session.repeat = !session.repeat;
    await interaction.deferUpdate();
    await interaction.message.edit(await musicPanelPayload(command.panel_config, name, session));
    return true;
  }
  if (action === 'vol-down' || action === 'vol-up') {
    const value = Math.max(10, Math.min(100, Math.round(session.volume * 100) + (action === 'vol-up' ? 10 : -10)));
    session.volume = value / 100;
    if (session.engine === 'lavalink') await session.player.setGlobalVolume(value);
    else session.player.state.resource?.volume?.setVolume(session.volume);
    await interaction.deferUpdate();
    await interaction.message.edit(await musicPanelPayload(command.panel_config, name, session));
    return true;
  }
  if (action === 'volume') {
    await interaction.reply({ content: 'اضغط أزرار −10 أو +10 في لوحة الموسيقى لتغيير الصوت مباشرة.', ephemeral: true });
    return true;
  }
  if (action === 'setvolume') {
    const value = Number(interaction.fields.getTextInputValue('volume'));
    if (!Number.isInteger(value) || value < 1 || value > 100) { await interaction.reply({ content: 'اكتب رقمًا صحيحًا من 1 إلى 100.', ephemeral: true }); return true; }
    session.volume = value / 100;
    if (session.engine === 'lavalink') await session.player.setGlobalVolume(value);
    else session.player.state.resource?.volume?.setVolume(session.volume);
    await interaction.reply({ content: `صار مستوى الصوت ${value}%.`, ephemeral: true });
    return true;
  }
  if (action === 'pause') {
    session.paused = !session.paused;
    if (session.engine === 'lavalink') await session.player.setPaused(session.paused);
    else if (session.paused) session.player.pause(); else session.player.unpause();
    await interaction.deferUpdate();
    await interaction.message.edit(await musicPanelPayload(command.panel_config, name, session));
  } else if (action === 'skip') {
    await interaction.deferUpdate();
    session.skipRequested = true;
    if (session.engine === 'lavalink') { await session.player.stopTrack(); session.queue.shift(); session.skipRequested = false; await playNext(session); } else session.player.stop(true);
  } else if (action === 'stop') {
    await closeMusicSession(session);
    await interaction.deferUpdate();
    await interaction.message.edit(await musicPanelPayload(command.panel_config, name));
  }
  return true;
}

export function stopMusicForBot(guildId, botId) {
  const key = sessionKey(guildId, botId);
  const session = sessions.get(key);
  if (session) {
    void closeMusicSession(session);
    void musicPanelPayload(session.config, session.name).then(payload => session.message?.edit(payload)).catch(() => {});
  }
}

