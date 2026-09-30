const snowflake = value => /^\d{17,20}$/.test(String(value || ''));
const clean = (value, max) => String(value || '').trim().slice(0, max);
const defaultLabels = { details: 'التفاصيل', search: 'ابحث عن عمل', suggest: 'اقترح عملًا' };

export function safeMovieUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 600 ||
      !host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(':')) return null;
    return url.href;
  } catch { return null; }
}

export function normalizeMovieClub(input = {}) {
  const labels = {};
  for (const [key, fallback] of Object.entries(defaultLabels)) labels[key] = clean(input.labels?.[key] || fallback, 80);
  const image = input.bannerUrl || input.banner_url || '';
  const bannerUrl = image ? safeMovieUrl(image) : '';
  if (image && !bannerUrl) throw Error('رابط الصورة الرئيسية غير آمن. استخدم رابط صورة HTTPS عامًا.');
  const color = /^#[0-9a-f]{6}$/i.test(input.color || '') ? input.color : '#8659e6';
  return { title: clean(input.title || 'نادي الأفلام', 100), description: clean(input.description || 'مساحة لمحبي الأفلام والمسلسلات.', 500), welcome: clean(input.welcome || 'أهلًا بك في نادي الأفلام!', 500), bannerUrl, color, labels };
}

export function normalizeMovieItem(input = {}) {
  const title = clean(input.title, 100);
  if (!title) throw Error('اكتب عنوان الفيلم أو المسلسل.');
  const kind = input.kind === 'series' ? 'series' : 'movie';
  const year = Number(input.year);
  if (!Number.isInteger(year) || year < 1888 || year > new Date().getUTCFullYear() + 3) throw Error('اكتب سنة إصدار صحيحة.');
  const posterUrl = input.posterUrl ? safeMovieUrl(input.posterUrl) : '';
  if (input.posterUrl && !posterUrl) throw Error('رابط الملصق غير آمن. استخدم صورة تملك حق عرضها عبر HTTPS.');
  const links = Array.isArray(input.links) ? input.links.slice(0, 5).map(link => ({ service: clean(link.service, 60), url: safeMovieUrl(link.url) })) : [];
  if (links.some(link => !link.service || !link.url)) throw Error('كل رابط مشاهدة يحتاج اسم خدمة ورابط HTTPS آمنًا.');
  const status = input.status === 'published' ? 'published' : 'draft';
  if (status === 'published' && !links.length) throw Error('أضف رابط مشاهدة واحدًا على الأقل قبل النشر.');
  return { title, kind, year, summary: clean(input.summary, 500), tags: (Array.isArray(input.tags) ? input.tags : String(input.tags || '').split(',')).map(tag => clean(tag, 24)).filter(Boolean).slice(0, 8), posterUrl, links, status };
}

export function movieClubMessage(club, items = []) {
  const config = normalizeMovieClub(club);
  const publicItems = items.filter(item => item.status === 'published');
  const lines = publicItems.slice(0, 5).map((item, index) => `${index + 1}. **${item.title}** · ${item.kind === 'series' ? 'مسلسل' : 'فيلم'} · ${item.year}`);
  const embeds = [{ title: config.title, description: `${config.welcome}\n\n${config.description}\n\n${lines.length ? lines.join('\n') : 'لم تُنشر أعمال بعد. أضف عملًا من لوحة التحكم.'}\n\nروابط المشاهدة تفتح خدمات خارج Discord، وكل عضو يستخدم حسابه الخاص.`, color: Number.parseInt(config.color.slice(1), 16), ...(config.bannerUrl ? { image: { url: config.bannerUrl } } : {}) }];
  return { embeds, components: [{ type: 1, components: [
    { type: 2, style: 1, label: config.labels.details, custom_id: 'diskoko:movie:list' },
    { type: 2, style: 2, label: config.labels.search, custom_id: 'diskoko:movie:search' },
    { type: 2, style: 2, label: config.labels.suggest, custom_id: 'diskoko:movie:suggest' },
  ] }], allowedMentions: { parse: [] } };
}

export async function migrateMovieClubs(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS movie_clubs (
    guild_id TEXT NOT NULL, bot_user_id TEXT NOT NULL, owner_id BIGINT NOT NULL REFERENCES users(id),
    channel_id TEXT, command_name TEXT NOT NULL DEFAULT 'نادي', title TEXT NOT NULL DEFAULT 'نادي الأفلام',
    description TEXT NOT NULL DEFAULT '', welcome TEXT NOT NULL DEFAULT '', banner_url TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#8659e6', labels JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'draft', message_id TEXT, review_channel_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(guild_id,bot_user_id), FOREIGN KEY(guild_id,bot_user_id) REFERENCES customer_bot_registry(guild_id,bot_user_id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS movie_catalog (
    id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL, bot_user_id TEXT NOT NULL,
    title TEXT NOT NULL, kind TEXT NOT NULL, year INT NOT NULL, summary TEXT NOT NULL DEFAULT '',
    tags JSONB NOT NULL DEFAULT '[]'::jsonb, poster_url TEXT NOT NULL DEFAULT '', links JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'draft', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY(guild_id,bot_user_id) REFERENCES movie_clubs(guild_id,bot_user_id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS movie_catalog_list ON movie_catalog(guild_id,bot_user_id,status,id DESC);
  CREATE TABLE IF NOT EXISTS movie_suggestions (
    id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL, bot_user_id TEXT NOT NULL, member_id TEXT NOT NULL,
    title TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY(guild_id,bot_user_id) REFERENCES movie_clubs(guild_id,bot_user_id) ON DELETE CASCADE
  );`);
}

const clubRow = async (pool, guildId, botId) => (await pool.query('SELECT * FROM movie_clubs WHERE guild_id=$1 AND bot_user_id=$2', [guildId, botId])).rows[0];
const publicItems = async (pool, guildId, botId) => (await pool.query("SELECT * FROM movie_catalog WHERE guild_id=$1 AND bot_user_id=$2 AND status='published' ORDER BY id DESC LIMIT 25", [guildId, botId])).rows;
const discord = async (token, path, options = {}) => {
  const response = await fetch(`https://discord.com/api/v10${path}`, { ...options, headers: { Authorization: `Bot ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) }, signal: AbortSignal.timeout(12000) });
  return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) };
};

export function mountMovieClubs(app, { pool, requireUser, requireWriteAccess, authorizedGuild, connectedBot, requirePlanCapacity, audit }) {
  const route = handler => async (req, res, next) => { try { await handler(req, res); } catch (error) { next(error); } };
  async function context(req) {
    const guildId = String(req.params.guildId || '');
    const botId = String(req.params.botId || '');
    const guild = await authorizedGuild(req.user, guildId);
    if (!guild) throw Object.assign(Error('لا تملك صلاحية إدارة هذا السيرفر.'), { status: 403 });
    const bot = await connectedBot(pool, guildId, botId);
    if (!bot) throw Object.assign(Error('اربط البوت بهذا السيرفر أولًا.'), { status: 404 });
    return { guild, bot };
  }
  const base = '/api/movie-clubs/:guildId/:botId';
  app.get(base, requireUser, route(async (req, res) => {
    await context(req);
    const [club, items, suggestions, schedules] = await Promise.all([
      clubRow(pool, req.params.guildId, req.params.botId),
      pool.query('SELECT * FROM movie_catalog WHERE guild_id=$1 AND bot_user_id=$2 ORDER BY id DESC LIMIT 100', [req.params.guildId, req.params.botId]),
      pool.query('SELECT * FROM movie_suggestions WHERE guild_id=$1 AND bot_user_id=$2 ORDER BY id DESC LIMIT 50', [req.params.guildId, req.params.botId]),
      pool.query("SELECT id,channel_id,run_at,repeat,timezone,status,last_error FROM scheduled_messages WHERE guild_id=$1 AND bot_user_id=$2 AND content_kind='movie_club' ORDER BY id DESC LIMIT 5", [req.params.guildId, req.params.botId]),
    ]);
    res.json({ club: club || null, items: items.rows, suggestions: suggestions.rows, schedules: schedules.rows });
  }));
  app.put(base, requireUser, requireWriteAccess, route(async (req, res) => {
    const { guild, bot } = await context(req);
    const config = normalizeMovieClub(req.body);
    const channelId = String(req.body.channelId || '');
    const reviewChannelId = String(req.body.reviewChannelId || '');
    const commandName = clean(req.body.commandName || 'نادي', 32).toLocaleLowerCase();
    if (channelId && !snowflake(channelId) || reviewChannelId && !snowflake(reviewChannelId)) return res.status(400).json({ error: 'اختر قناة صحيحة من السيرفر.' });
    if (!/^[-_\p{L}\p{N}]{1,32}$/u.test(commandName)) return res.status(400).json({ error: 'اسم الأمر غير صالح. استخدم أحرفًا أو أرقامًا أو - و _ فقط.' });
    const previous = await clubRow(pool, guild.id, bot.id);
    if (previous?.status === 'published' && previous.command_name !== commandName) return res.status(409).json({ error: 'ألغِ نشر اللوحة قبل تغيير اسم الأمر، ثم سجّل الاسم الجديد.' });
    const result = await pool.query(`INSERT INTO movie_clubs(guild_id,bot_user_id,owner_id,channel_id,command_name,title,description,welcome,banner_url,color,labels,review_channel_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT(guild_id,bot_user_id) DO UPDATE SET channel_id=EXCLUDED.channel_id,command_name=EXCLUDED.command_name,title=EXCLUDED.title,description=EXCLUDED.description,welcome=EXCLUDED.welcome,banner_url=EXCLUDED.banner_url,color=EXCLUDED.color,labels=EXCLUDED.labels,review_channel_id=EXCLUDED.review_channel_id,updated_at=NOW()
      RETURNING *`, [guild.id, bot.id, req.user.id, channelId || null, commandName, config.title, config.description, config.welcome, config.bannerUrl, config.color, JSON.stringify(config.labels), reviewChannelId || null]);
    await audit(req.user.id, 'movie.club.save', 'guild', guild.id, { botId: bot.id });
    res.json({ club: result.rows[0] });
  }));
  app.post(`${base}/items`, requireUser, requireWriteAccess, route(async (req, res) => {
    const { guild, bot } = await context(req);
    if (!await clubRow(pool, guild.id, bot.id)) return res.status(409).json({ error: 'احفظ إعدادات النادي أولًا.' });
    let item; try { item = normalizeMovieItem(req.body); } catch (error) { return res.status(400).json({ error: error.message }); }
    const count = (await pool.query('SELECT COUNT(*)::int AS total FROM movie_catalog WHERE guild_id=$1 AND bot_user_id=$2', [guild.id, bot.id])).rows[0].total;
    if (count >= 100) return res.status(409).json({ error: 'وصل الكتالوج إلى 100 عمل. احذف أعمالًا قديمة قبل الإضافة.' });
    const result = await pool.query('INSERT INTO movie_catalog(guild_id,bot_user_id,title,kind,year,summary,tags,poster_url,links,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *', [guild.id, bot.id, item.title, item.kind, item.year, item.summary, JSON.stringify(item.tags), item.posterUrl, JSON.stringify(item.links), item.status]);
    await audit(req.user.id, 'movie.item.create', 'guild', guild.id, { botId: bot.id, itemId: result.rows[0].id });
    res.status(201).json({ item: result.rows[0] });
  }));
  app.put(`${base}/items/:itemId`, requireUser, requireWriteAccess, route(async (req, res) => {
    const { guild, bot } = await context(req);
    let item; try { item = normalizeMovieItem(req.body); } catch (error) { return res.status(400).json({ error: error.message }); }
    const result = await pool.query('UPDATE movie_catalog SET title=$4,kind=$5,year=$6,summary=$7,tags=$8,poster_url=$9,links=$10,status=$11,updated_at=NOW() WHERE id=$1 AND guild_id=$2 AND bot_user_id=$3 RETURNING *', [req.params.itemId, guild.id, bot.id, item.title, item.kind, item.year, item.summary, JSON.stringify(item.tags), item.posterUrl, JSON.stringify(item.links), item.status]);
    if (!result.rowCount) return res.status(404).json({ error: 'العمل غير موجود في هذا النادي.' });
    await audit(req.user.id, 'movie.item.update', 'guild', guild.id, { botId: bot.id, itemId: req.params.itemId });
    res.json({ item: result.rows[0] });
  }));
  app.delete(`${base}/items/:itemId`, requireUser, requireWriteAccess, route(async (req, res) => {
    const { guild, bot } = await context(req);
    const result = await pool.query('DELETE FROM movie_catalog WHERE id=$1 AND guild_id=$2 AND bot_user_id=$3 RETURNING id', [req.params.itemId, guild.id, bot.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'العمل غير موجود في هذا النادي.' });
    await audit(req.user.id, 'movie.item.delete', 'guild', guild.id, { botId: bot.id, itemId: req.params.itemId });
    res.json({ ok: true });
  }));
  app.post(`${base}/publish`, requireUser, requireWriteAccess, route(async (req, res) => {
    const { guild, bot } = await context(req);
    const club = await clubRow(pool, guild.id, bot.id);
    if (!club?.channel_id) return res.status(409).json({ error: 'احفظ النادي واختر قناة نصية للنشر أولًا.' });
    const command = (await pool.query("SELECT 1 FROM customer_bot_commands WHERE guild_id=$1 AND bot_user_id=$2 AND name=$3 AND response_kind='movie_club'", [guild.id, bot.id, club.command_name])).rows[0];
    if (!command) return res.status(409).json({ error: `سجّل أمر /${club.command_name} للنادي قبل النشر.` });
    const channel = await discord(bot.token, `/channels/${club.channel_id}`);
    if (!channel.ok || channel.data.guild_id !== guild.id || ![0, 5].includes(channel.data.type)) return res.status(409).json({ error: 'قناة النشر غير متاحة. اختر قناة نصية موجودة في هذا السيرفر.' });
    const message = movieClubMessage(club, await publicItems(pool, guild.id, bot.id));
    let result = await discord(bot.token, `/channels/${club.channel_id}/messages${club.message_id ? `/${club.message_id}` : ''}`, { method: club.message_id ? 'PATCH' : 'POST', body: JSON.stringify(message) });
    if (result.status === 404 && club.message_id) result = await discord(bot.token, `/channels/${club.channel_id}/messages`, { method: 'POST', body: JSON.stringify(message) });
    if (!result.ok) return res.status(result.status === 403 ? 403 : 502).json({ error: result.status === 403 ? 'البوت لا يملك إرسال الرسائل وإرفاق الروابط في هذه القناة. امنحه الصلاحيات ثم أعد النشر.' : 'تعذر نشر اللوحة في Discord. تحقق من اتصال البوت والقناة ثم حاول.' });
    await pool.query("UPDATE movie_clubs SET status='published',message_id=$3,updated_at=NOW() WHERE guild_id=$1 AND bot_user_id=$2", [guild.id, bot.id, result.data.id]);
    await audit(req.user.id, 'movie.club.publish', 'guild', guild.id, { botId: bot.id, messageId: result.data.id });
    res.json({ status: 'published', messageId: result.data.id });
  }));
  app.post(`${base}/unpublish`, requireUser, requireWriteAccess, route(async (req, res) => {
    const { guild, bot } = await context(req);
    const club = await clubRow(pool, guild.id, bot.id);
    if (!club) return res.status(404).json({ error: 'النادي غير موجود.' });
    if (club.message_id && club.channel_id) {
      const removed = await discord(bot.token, `/channels/${club.channel_id}/messages/${club.message_id}`, { method: 'DELETE' });
      if (!removed.ok && removed.status !== 404) return res.status(502).json({ error: 'تعذر إزالة اللوحة من Discord. تحقق من صلاحية إدارة الرسائل ثم حاول.' });
    }
    await pool.query("UPDATE movie_clubs SET status='draft',message_id=NULL,updated_at=NOW() WHERE guild_id=$1 AND bot_user_id=$2", [guild.id, bot.id]);
    await pool.query("UPDATE scheduled_messages SET status='cancelled',updated_at=NOW() WHERE guild_id=$1 AND bot_user_id=$2 AND content_kind='movie_club' AND status IN ('scheduled','failed')", [guild.id, bot.id]);
    await audit(req.user.id, 'movie.club.unpublish', 'guild', guild.id, { botId: bot.id });
    res.json({ status: 'draft' });
  }));
  app.post(`${base}/schedule`, requireUser, requireWriteAccess, route(async (req, res) => {
    const { guild, bot } = await context(req);
    const club = await clubRow(pool, guild.id, bot.id);
    if (club?.status !== 'published') return res.status(409).json({ error: 'انشر لوحة النادي قبل تفعيل اختيارات الأسبوع.' });
    const repeat = String(req.body.repeat || '');
    if (!['daily', 'weekly', 'monthly'].includes(repeat)) return res.status(400).json({ error: 'اختر نشرًا يوميًا أو أسبوعيًا أو شهريًا.' });
    const runAt = new Date(req.body.runAt);
    if (!Number.isFinite(runAt.getTime()) || runAt.getTime() < Date.now() + 60_000 || runAt.getTime() > Date.now() + 366 * 86400000) return res.status(400).json({ error: 'اختر موعدًا مستقبليًا خلال سنة.' });
    const timezone = clean(req.body.timezone || 'Asia/Riyadh', 64);
    try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { return res.status(400).json({ error: 'المنطقة الزمنية غير معروفة.' }); }
    const channelId = String(req.body.channelId || club.channel_id);
    if (!snowflake(channelId)) return res.status(400).json({ error: 'اختر قناة نشر صحيحة.' });
    const channel = await discord(bot.token, `/channels/${channelId}`);
    if (!channel.ok || channel.data.guild_id !== guild.id || ![0, 5].includes(channel.data.type)) return res.status(409).json({ error: 'قناة الجدولة حُذفت أو ليست قناة نصية في هذا السيرفر.' });
    const client = await pool.connect();
    let result;
    try {
      await client.query('BEGIN');
      await client.query("UPDATE scheduled_messages SET status='cancelled',updated_at=NOW() WHERE guild_id=$1 AND bot_user_id=$2 AND content_kind='movie_club' AND status IN ('scheduled','failed')", [guild.id, bot.id]);
      await requirePlanCapacity(req.user, 'scheduledMessages', client);
      result = await client.query("INSERT INTO scheduled_messages(user_id,guild_id,channel_id,content,run_at,repeat,timezone,bot_user_id,command_name,content_kind) VALUES($1,$2,$3,'اختيارات النادي',$4,$5,$6,$7,$8,'movie_club') RETURNING id,run_at,repeat,timezone,status", [req.user.id, guild.id, channelId, runAt, repeat, timezone, bot.id, club.command_name]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    await audit(req.user.id, 'movie.club.schedule', 'guild', guild.id, { botId: bot.id, scheduleId: result.rows[0].id });
    res.status(201).json({ schedule: result.rows[0] });
  }));
  app.post(`${base}/schedule/cancel`, requireUser, requireWriteAccess, route(async (req, res) => {
    const { guild, bot } = await context(req);
    await pool.query("UPDATE scheduled_messages SET status='cancelled',updated_at=NOW() WHERE guild_id=$1 AND bot_user_id=$2 AND content_kind='movie_club' AND status IN ('scheduled','failed')", [guild.id, bot.id]);
    await audit(req.user.id, 'movie.club.schedule.cancel', 'guild', guild.id, { botId: bot.id });
    res.json({ ok: true });
  }));
  app.post(`${base}/suggestions/:id/review`, requireUser, requireWriteAccess, route(async (req, res) => {
    const { guild, bot } = await context(req);
    const status = req.body.status === 'approved' ? 'approved' : req.body.status === 'rejected' ? 'rejected' : null;
    if (!status) return res.status(400).json({ error: 'اختر قبول الاقتراح أو رفضه.' });
    const result = await pool.query('UPDATE movie_suggestions SET status=$4 WHERE id=$1 AND guild_id=$2 AND bot_user_id=$3 AND status=$5 RETURNING id', [req.params.id, guild.id, bot.id, status, 'pending']);
    if (!result.rowCount) return res.status(409).json({ error: 'الاقتراح راجعه مشرف آخر أو لم يعد متاحًا.' });
    res.json({ ok: true });
  }));
}

export async function handleMovieClubCommand(interaction, pool, botId) {
  const club = await clubRow(pool, interaction.guildId, botId);
  if (!club || club.status !== 'published' || club.command_name !== interaction.commandName) return interaction.reply({ content: 'نادي الأفلام لم يُنشر بعد. اطلب من الإدارة إكمال الإعداد.', ephemeral: true });
  await interaction.reply(movieClubMessage(club, await publicItems(pool, interaction.guildId, botId)));
}

export async function handleMovieClubInteraction(interaction, pool, botId) {
  if (!String(interaction.customId || '').startsWith('diskoko:movie:')) return false;
  const club = await clubRow(pool, interaction.guildId, botId);
  if (!club || club.status !== 'published') { await interaction.reply({ content: 'لوحة النادي لم تعد منشورة.', ephemeral: true }); return true; }
  const action = interaction.customId.split(':')[2];
  if (action === 'search' || action === 'suggest') {
    await interaction.showModal({ custom_id: `diskoko:movie:${action}-submit`, title: action === 'search' ? 'ابحث في النادي' : 'اقترح عملًا', components: [{ type: 1, components: [{ type: 4, custom_id: 'title', label: action === 'search' ? 'اسم الفيلم أو المسلسل' : 'عنوان الاقتراح', style: 1, required: true, max_length: 100 }] }, ...(action === 'suggest' ? [{ type: 1, components: [{ type: 4, custom_id: 'details', label: 'لماذا تقترحه؟', style: 2, required: false, max_length: 500 }] }] : [])] });
    return true;
  }
  if (action === 'suggest-submit') {
    const title = clean(interaction.fields.getTextInputValue('title'), 100);
    const details = clean(interaction.fields.getTextInputValue('details'), 500);
    await pool.query('INSERT INTO movie_suggestions(guild_id,bot_user_id,member_id,title,details) VALUES($1,$2,$3,$4,$5)', [interaction.guildId, botId, interaction.user.id, title, details]);
    await interaction.reply({ content: 'وصل اقتراحك إلى قائمة مراجعة المشرفين. لن يظهر للأعضاء حتى يراجعوه.', ephemeral: true });
    if (club.review_channel_id) {
      const channel = await interaction.guild.channels.fetch(club.review_channel_id).catch(() => null);
      await channel?.send({ content: `اقتراح جديد من <@${interaction.user.id}>: **${title}**\n${details}`, allowedMentions: { parse: [] } }).catch(() => {});
    }
    return true;
  }
  const items = await publicItems(pool, interaction.guildId, botId);
  if (action === 'search-submit') {
    const query = clean(interaction.fields.getTextInputValue('title'), 100).toLocaleLowerCase();
    const matches = items.filter(item => item.title.toLocaleLowerCase().includes(query)).slice(0, 5);
    await interaction.reply({ content: matches.length ? matches.map(item => `${item.title} · ${item.year} · /${club.command_name}`).join('\n') : 'لم أجد عملًا منشورًا بهذا الاسم. جرّب كلمة أقصر.', ephemeral: true });
    return true;
  }
  if (action === 'list') {
    await interaction.reply({ content: items.length ? 'اختر عملًا لعرض روابط مشاهدته:' : 'الكتالوج فارغ حاليًا. سيضيف المشرفون أعمالًا قريبًا.', ...(items.length ? { components: [{ type: 1, components: [{ type: 3, custom_id: 'diskoko:movie:item', options: items.slice(0, 25).map(item => ({ label: item.title.slice(0, 100), description: `${item.kind === 'series' ? 'مسلسل' : 'فيلم'} · ${item.year}`, value: String(item.id) })) }] }] } : {}), ephemeral: true });
    return true;
  }
  if (action === 'item') {
    const item = items.find(candidate => String(candidate.id) === interaction.values?.[0]);
    if (!item) { await interaction.reply({ content: 'هذا العمل لم يعد منشورًا. افتح القائمة من جديد.', ephemeral: true }); return true; }
    await interaction.reply({ embeds: [{ title: item.title, description: `${item.kind === 'series' ? 'مسلسل' : 'فيلم'} · ${item.year}\n${item.summary || 'لا يوجد وصف.'}\n${(item.tags || []).join(' · ')}\n\nكل رابط يفتح الخدمة الخارجية، ويشاهد العضو بحسابه الخاص.`, color: Number.parseInt(club.color.slice(1), 16), ...(item.poster_url ? { image: { url: item.poster_url } } : {}) }], components: item.links?.length ? [{ type: 1, components: item.links.slice(0, 5).map(link => ({ type: 2, style: 5, label: `شاهد على ${link.service}`.slice(0, 80), url: link.url })) }] : [], ephemeral: true, allowedMentions: { parse: [] } });
    return true;
  }
  return false;
}
