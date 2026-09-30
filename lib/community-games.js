import crypto from 'node:crypto';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

const GUILD_ID = '1298703504273047552';
const PREFIX = 'diskoko-games:';
const QUIZ = [
  { question: 'أي صلاحية تسمح بإدارة رومات السيرفر؟', options: ['Manage Channels', 'Send Messages', 'Use Activities'], answer: 0 },
  { question: 'أين تفتح نشاطًا جماعيًا داخل Discord؟', options: ['روم صوتي', 'سجل العمليات', 'قائمة الرتب'], answer: 0 },
  { question: 'أي مساحة تناسب مشاركة أعمالك في المجتمع؟', options: ['showcase', 'التذاكر الخاصة', 'سجل العمليات'], answer: 0 },
];
const WORDS = [
  { hint: 'مكان يجمع الأعضاء في Discord', answer: 'سيرفر' },
  { hint: 'صورة تظهر أعلى الملف الشخصي', answer: 'بنر' },
  { hint: 'غرفة لمحادثة الصوت', answer: 'روم صوتي' },
];
const sessions = new Map();
const cooldowns = new Map();

function pruneExpired(now) {
  for (const [key, session] of sessions) if (session.expires < now) sessions.delete(key);
  for (const [key, started] of cooldowns) if (now - started >= 30_000) cooldowns.delete(key);
}

function card() {
  const embed = new EmbedBuilder().setColor(0x7c4dff)
    .setTitle('🎮  DISKOKO / GAME HUB')
    .setDescription('**خذ استراحة والعب مع المجتمع**\nاختر لعبة من الأزرار. الجولة خاصة بك، والنتيجة تظهر لك فورًا. تستطيع أيضًا دخول `game-room` لبدء Discord Activities مع أصدقائك.')
    .addFields(
      { name: '⚡ سؤال سريع', value: 'اختر الإجابة الصحيحة من ثلاثة خيارات.' },
      { name: '🧩 خمن الكلمة', value: 'اقرأ التلميح واكتب الإجابة.' },
      { name: '🏆 ترتيب الأسبوع', value: 'نقاط أفضل اللاعبين في آخر 7 أيام.' },
    )
    .setFooter({ text: 'Diskoko • العب باحترام، وجولة واحدة كل 30 ثانية' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${PREFIX}quiz`).setLabel('سؤال سريع').setEmoji('⚡').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`${PREFIX}word`).setLabel('خمن الكلمة').setEmoji('🧩').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${PREFIX}board`).setLabel('الترتيب').setEmoji('🏆').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row], allowedMentions: { parse: [] } };
}

async function ensureTables(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS diskoko_game_panel (guild_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, message_id TEXT NOT NULL)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS diskoko_game_scores (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, played_on DATE NOT NULL, points INT NOT NULL DEFAULT 0, PRIMARY KEY(guild_id,user_id,played_on))`);
}

export async function upsertCommunityGames(client, pool) {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();
  const category = channels.find(channel => channel?.type === ChannelType.GuildCategory && channel.name.includes('المجتمع'));
  if (!category) throw new Error('Community category unavailable');
  let textChannel = channels.find(channel => channel?.type === ChannelType.GuildText && channel.parentId === category.id && channel.name === 'games');
  if (!textChannel) textChannel = await guild.channels.create({ name: 'games', type: ChannelType.GuildText, parent: category.id, topic: '🎮 ألعاب وتحديات Diskoko للمجتمع • اختر لعبة من البطاقة المثبتة' });
  if (!channels.some(channel => channel?.type === ChannelType.GuildVoice && channel.parentId === category.id && channel.name === '🎮・game-room')) {
    await guild.channels.create({ name: '🎮・game-room', type: ChannelType.GuildVoice, parent: category.id });
  }
  await ensureTables(pool);
  const previous = (await pool.query('SELECT channel_id,message_id FROM diskoko_game_panel WHERE guild_id=$1', [guild.id])).rows[0];
  let message = previous?.channel_id === textChannel.id ? await textChannel.messages.fetch(previous.message_id).catch(() => null) : null;
  if (message?.author.id === client.user.id) await message.edit(card());
  else message = await textChannel.send(card());
  await pool.query(`INSERT INTO diskoko_game_panel(guild_id,channel_id,message_id) VALUES($1,$2,$3) ON CONFLICT(guild_id) DO UPDATE SET channel_id=EXCLUDED.channel_id,message_id=EXCLUDED.message_id`, [guild.id,textChannel.id,message.id]);
  return { channelId: textChannel.id, messageId: message.id };
}

function sessionKey(interaction) { return `${interaction.guildId}:${interaction.user.id}`; }
function normalize(value) { return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ar'); }
async function score(pool, interaction, points) {
  if (!pool || !points) return;
  await pool.query(`INSERT INTO diskoko_game_scores(guild_id,user_id,played_on,points) VALUES($1,$2,(NOW() AT TIME ZONE 'UTC')::date,$3)
    ON CONFLICT(guild_id,user_id,played_on) DO UPDATE SET points=diskoko_game_scores.points+EXCLUDED.points`, [interaction.guildId,interaction.user.id,points]);
}

export async function handleCommunityGame(interaction, pool) {
  if (!interaction.isButton() && !interaction.isModalSubmit()) return false;
  if (!interaction.customId.startsWith(PREFIX)) return false;
  if (interaction.guildId !== GUILD_ID) { await interaction.reply({ content: 'هذه الألعاب خاصة بمجتمع Diskoko.', ephemeral: true }); return true; }
  const key = sessionKey(interaction);
  const action = interaction.customId.slice(PREFIX.length);
  if (action === 'board') {
    const rows = pool ? (await pool.query(`SELECT user_id,SUM(points)::int AS points FROM diskoko_game_scores WHERE guild_id=$1 AND played_on >= (NOW() AT TIME ZONE 'UTC')::date - 6 GROUP BY user_id ORDER BY points DESC,user_id LIMIT 10`, [interaction.guildId])).rows : [];
    const body = rows.length ? rows.map((row, index) => `**${index + 1}.** <@${row.user_id}> — ${row.points} نقطة`).join('\n') : 'لا توجد نتائج لهذا الأسبوع بعد.';
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x7c4dff).setTitle('🏆 ترتيب الأسبوع').setDescription(body)], ephemeral: true, allowedMentions: { parse: [] } });
    return true;
  }
  if (action === 'quiz' || action === 'word') {
    const now = Date.now();
    pruneExpired(now);
    if (now - (cooldowns.get(key) || 0) < 30_000) { await interaction.reply({ content: 'انتظر 30 ثانية قبل بدء جولة جديدة.', ephemeral: true }); return true; }
    cooldowns.set(key, now);
    const items = action === 'quiz' ? QUIZ : WORDS;
    const item = items[crypto.randomInt(items.length)];
    const id = crypto.randomBytes(6).toString('hex');
    sessions.set(key, { id, type: action, item, expires: now + 120_000 });
    if (action === 'quiz') {
      const buttons = new ActionRowBuilder().addComponents(item.options.map((label, index) => new ButtonBuilder().setCustomId(`${PREFIX}answer:${id}:${index}`).setLabel(label).setStyle(ButtonStyle.Secondary)));
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x7c4dff).setTitle('⚡ سؤال سريع').setDescription(item.question)], components: [buttons], ephemeral: true });
    } else {
      const modal = new ModalBuilder().setCustomId(`${PREFIX}guess:${id}`).setTitle('🧩 خمن الكلمة')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('answer').setLabel(item.hint).setStyle(TextInputStyle.Short).setMaxLength(60).setRequired(true)));
      await interaction.showModal(modal);
    }
    return true;
  }
  const match = /^(answer|guess):([a-f0-9]{12})(?::([0-2]))?$/.exec(action);
  if (!match) { await interaction.reply({ content: 'هذه الجولة غير متاحة.', ephemeral: true }); return true; }
  const session = sessions.get(key);
  if (!session || session.id !== match[2] || session.expires < Date.now()) { await interaction.reply({ content: 'انتهت الجولة. ابدأ جولة جديدة من بطاقة الألعاب.', ephemeral: true }); return true; }
  sessions.delete(key);
  const correct = match[1] === 'answer' ? session.type === 'quiz' && Number(match[3]) === session.item.answer : session.type === 'word' && normalize(interaction.fields.getTextInputValue('answer')) === normalize(session.item.answer);
  await score(pool, interaction, correct ? 10 : 0);
  const answer = session.type === 'quiz' ? session.item.options[session.item.answer] : session.item.answer;
  await interaction.reply({ content: correct ? '✅ إجابة صحيحة! حصلت على 10 نقاط.' : `❌ الإجابة الصحيحة: **${answer}**`, ephemeral: true });
  return true;
}

