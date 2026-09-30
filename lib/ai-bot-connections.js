import crypto from 'node:crypto';
import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import { handleInteractiveButton, sendWelcomeCard } from './interactive-systems.js';
import { handleReadyModuleInteraction } from './ready-template-modules.js';
import { waitForGatewayLoginSlot } from './gateway-login-gate.js';
import { createDiscordRequestGate } from './discord-rate-limit.js';
import { registerGuildActivityLogs } from './guild-activity-logs.js';
import { handleYoutubePanelInteraction, normalizeYoutubePanel, youtubePanelMessage } from './youtube-panel.js';
import { handleMusicCommand, handleMusicInteraction, musicSlashOptions, normalizeMusicPanel, stopMusicForBot } from './music-panel.js';
import { entitlementsFor } from './billing.js';
import { handleMovieClubCommand, handleMovieClubInteraction } from './movie-club.js';
import { stopLavalinkFor } from './lavalink-audio.js';

const api = 'https://discord.com/api/v10';
const clients = new Map();
const reconnectTimers = new Map();
const connecting = new Set();
const runtimeKey = (guildId, botId) => `${guildId}:${botId}`;
const connectionRequestGate = createDiscordRequestGate({ requestsPerSecond: 4, concurrency: 1, maxPending: 200 });
const gatewayRetryMs = error => Math.max(60_000, Math.min(2_147_000_000, Number(error?.retryAfter) || 300_000) + 1_000);
const messageContentEnabled = flags => Boolean(Number(flags || 0) & ((1 << 18) | (1 << 19)));
const key = () => crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY || '').digest();
function seal(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  return [iv, cipher.update(token, 'utf8'), cipher.final(), cipher.getAuthTag()].map(part => part.toString('base64url')).join('.');
}
function open(value) {
  const [iv, first, last, tag] = value.split('.').map(part => Buffer.from(part, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(first), decipher.update(last), decipher.final()]).toString();
}
async function discord(token, pathname, options = {}) {
  const tokenKey = crypto.createHash('sha256').update(token).digest('hex');
  const method = options.method || 'GET';
  const response = await connectionRequestGate(tokenKey, `${method} ${pathname}`, `${api}${pathname}`, { ...options, headers: { Authorization: `Bot ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) }, signal: AbortSignal.timeout(12000) });
  return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) };
}
export async function migrateAiBotConnections(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS ai_bot_connections (
    guild_id TEXT PRIMARY KEY, owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bot_user_id TEXT NOT NULL, bot_name TEXT NOT NULL, token_encrypted TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    retry_at TIMESTAMPTZ, member_joins BOOLEAN
  );
  ALTER TABLE ai_bot_connections ADD COLUMN IF NOT EXISTS retry_at TIMESTAMPTZ;
  ALTER TABLE ai_bot_connections ADD COLUMN IF NOT EXISTS member_joins BOOLEAN;
  ALTER TABLE ai_bot_connections ADD COLUMN IF NOT EXISTS message_content BOOLEAN;
  ALTER TABLE ai_bot_connections ADD COLUMN IF NOT EXISTS gateway_seen_at TIMESTAMPTZ;
  ALTER TABLE ai_bot_connections ADD COLUMN IF NOT EXISTS selected_for_server BOOLEAN NOT NULL DEFAULT TRUE;
  CREATE TABLE IF NOT EXISTS customer_bot_registry (
    guild_id TEXT NOT NULL, bot_user_id TEXT NOT NULL,
    owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bot_name TEXT NOT NULL, label TEXT, token_encrypted TEXT NOT NULL,
    retry_at TIMESTAMPTZ, member_joins BOOLEAN, message_content BOOLEAN,
    gateway_seen_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(guild_id,bot_user_id)
  );
  INSERT INTO customer_bot_registry(guild_id,bot_user_id,owner_id,bot_name,token_encrypted,retry_at,member_joins,message_content,gateway_seen_at,created_at,updated_at)
  SELECT guild_id,bot_user_id,owner_id,bot_name,token_encrypted,retry_at,member_joins,message_content,gateway_seen_at,created_at,updated_at
  FROM ai_bot_connections ON CONFLICT(guild_id,bot_user_id) DO NOTHING;
  CREATE INDEX IF NOT EXISTS idx_customer_bot_registry_owner ON customer_bot_registry(owner_id,guild_id);
  CREATE TABLE IF NOT EXISTS customer_bot_commands (
    guild_id TEXT NOT NULL, bot_user_id TEXT NOT NULL,
    name TEXT NOT NULL, description TEXT NOT NULL, response TEXT NOT NULL,
    discord_command_id TEXT NOT NULL, ephemeral BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(guild_id,bot_user_id,name),
    FOREIGN KEY(guild_id,bot_user_id) REFERENCES customer_bot_registry(guild_id,bot_user_id) ON DELETE CASCADE
  );
  ALTER TABLE customer_bot_commands ADD COLUMN IF NOT EXISTS response_kind TEXT NOT NULL DEFAULT 'text';
  ALTER TABLE customer_bot_commands ADD COLUMN IF NOT EXISTS card_title TEXT;
  ALTER TABLE customer_bot_commands ADD COLUMN IF NOT EXISTS image_url TEXT;
  ALTER TABLE customer_bot_commands ADD COLUMN IF NOT EXISTS button_label TEXT;
  ALTER TABLE customer_bot_commands ADD COLUMN IF NOT EXISTS button_url TEXT;
  ALTER TABLE customer_bot_commands ADD COLUMN IF NOT EXISTS links JSONB NOT NULL DEFAULT '[]'::jsonb;
  ALTER TABLE customer_bot_commands ADD COLUMN IF NOT EXISTS panel_config JSONB NOT NULL DEFAULT '{}'::jsonb;
  CREATE TABLE IF NOT EXISTS bot_gateway_cooldown (id SMALLINT PRIMARY KEY CHECK (id=1), retry_at TIMESTAMPTZ NOT NULL);
  CREATE TABLE IF NOT EXISTS bot_runtime_state (id TEXT PRIMARY KEY, status JSONB NOT NULL, seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  ALTER TABLE ai_requests ADD COLUMN IF NOT EXISTS publishing_bot_id TEXT;
  ALTER TABLE diskoko_giveaways ADD COLUMN IF NOT EXISTS publishing_bot_id TEXT;`);
}
async function sharedGatewayRetryAt(pool) {
  const row = (await pool.query('SELECT retry_at FROM bot_gateway_cooldown WHERE id=1')).rows[0];
  return row?.retry_at ? new Date(row.retry_at).getTime() : 0;
}
async function saveSharedGatewayCooldown(pool, retryAt) {
  await pool.query('INSERT INTO bot_gateway_cooldown(id,retry_at) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET retry_at=GREATEST(bot_gateway_cooldown.retry_at,EXCLUDED.retry_at)', [retryAt]);
}
export async function connectedBot(pool, guildId, botId = null) {
  const row = (await pool.query(botId
    ? 'SELECT bot_user_id,bot_name,token_encrypted FROM customer_bot_registry WHERE guild_id=$1 AND bot_user_id=$2'
    : 'SELECT bot_user_id,bot_name,token_encrypted FROM ai_bot_connections WHERE guild_id=$1', botId ? [guildId, botId] : [guildId])).rows[0];
  return row ? { id: row.bot_user_id, name: row.bot_name, token: open(row.token_encrypted) } : null;
}
export async function connectedBotMetadata(pool, guildId) {
  const row = (await pool.query('SELECT bot_user_id,bot_name,updated_at,retry_at,member_joins,message_content,gateway_seen_at,selected_for_server FROM ai_bot_connections WHERE guild_id=$1', [guildId])).rows[0];
  const client = clients.get(runtimeKey(guildId, row?.bot_user_id));
  const localOnline = Boolean(client?.isReady() && client.guilds.cache.has(guildId));
  const workerOnline = process.env.BOT_GATEWAY_MODE === 'external' && Date.now() - new Date(row?.gateway_seen_at || 0).getTime() < 35_000;
  return row ? { id: row.bot_user_id, name: row.bot_name, updatedAt: row.updated_at, online: localOnline || workerOnline, selected: row.selected_for_server !== false, memberJoins: client?._diskokoMemberJoins ?? row.member_joins ?? false, messageContent: client?._diskokoMessageContent ?? row.message_content ?? false, retryAt: row.retry_at } : null;
}
export async function listCustomerBots(pool, guildId) {
  const [registry, selected] = await Promise.all([
    pool.query('SELECT bot_user_id,bot_name,label,created_at,updated_at,retry_at,member_joins,message_content,gateway_seen_at FROM customer_bot_registry WHERE guild_id=$1 ORDER BY created_at,bot_user_id', [guildId]),
    pool.query('SELECT bot_user_id,selected_for_server FROM ai_bot_connections WHERE guild_id=$1', [guildId]),
  ]);
  const active = selected.rows[0];
  return registry.rows.map(row => {
    const client = clients.get(runtimeKey(guildId, row.bot_user_id));
    const localOnline = Boolean(client?.isReady() && client.guilds.cache.has(guildId));
    const workerOnline = process.env.BOT_GATEWAY_MODE === 'external' && Date.now() - new Date(row.gateway_seen_at || 0).getTime() < 35_000;
    return { id: row.bot_user_id, name: row.bot_name, label: row.label || row.bot_name, createdAt: row.created_at, updatedAt: row.updated_at,
      online: localOnline || workerOnline, selected: active?.bot_user_id === row.bot_user_id && active.selected_for_server !== false,
      memberJoins: client?._diskokoMemberJoins ?? row.member_joins ?? false,
      messageContent: client?._diskokoMessageContent ?? row.message_content ?? false, retryAt: row.retry_at };
  });
}
export function guildBotPermissionSummary(member, roles, guildId) {
  const assigned = new Set([guildId, ...(member.roles || [])]);
  const active = roles.filter(role => assigned.has(role.id));
  const permissions = active.reduce((value, role) => value | BigInt(role.permissions || 0), 0n);
  const has = bit => (permissions & (1n << BigInt(bit))) !== 0n;
  const administrator = has(3);
  return { administrator, manageChannels: administrator || has(4), viewChannel: administrator || has(10),
    sendMessages: administrator || has(11), embedLinks: administrator || has(14),
    manageRoles: administrator || has(28), changeNickname: administrator || has(26),
    highestRolePosition: Math.max(0, ...active.map(role => Number(role.position || 0))) };
}
export async function botTokenForPublication(pool, guildId) {
  const status = await connectedBotMetadata(pool, guildId);
  if (!status?.selected) return null;
  if (!status?.online) throw Object.assign(new Error('بوتك الخاص غير متصل الآن. أعد الربط أو انتظر عودة الاتصال قبل النشر.'), { status: 503 });
  const bot = await connectedBot(pool, guildId);
  return { ...bot, memberJoins: status.memberJoins };
}
async function syncMusicSlashCommands(pool, guildId, botId, token) {
  const commands = (await pool.query("SELECT name,description,discord_command_id FROM customer_bot_commands WHERE guild_id=$1 AND bot_user_id=$2 AND response_kind='music_panel'", [guildId, botId])).rows;
  for (const command of commands) {
    const path = `/applications/${botId}/guilds/${guildId}/commands/${command.discord_command_id}`;
    const result = await discord(token, path, { method: 'PATCH', body: JSON.stringify({ name: command.name, description: command.description, type: 1, options: musicSlashOptions }) });
    if (!result.ok) console.error('Music slash options sync failed', { guildId, botId, name: command.name, status: result.status });
  }
}
export async function startAiBot(pool, guildId, token, botId, memberJoins = false, messageContent = false) {
  const connectionKey = runtimeKey(guildId, botId);
  const old = clients.get(connectionKey);
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates, ...(memberJoins ? [GatewayIntentBits.GuildMembers] : []), ...(messageContent ? [GatewayIntentBits.MessageContent] : [])], partials: [Partials.Message, Partials.Channel], rest: { rejectOnRateLimit: () => true } });
  client._diskokoMemberJoins = memberJoins;
  client._diskokoMessageContent = messageContent;
  const activityLogger = registerGuildActivityLogs(client, pool, guildId);
  client.on(Events.InteractionCreate, async interaction => {
    if (clients.get(connectionKey) === client && interaction.guildId === guildId && interaction.isChatInputCommand()) {
      void activityLogger.recordCommand(guildId, interaction.channelId, interaction.user.id, interaction.commandName);
      try {
        const command = (await pool.query('SELECT response,ephemeral,response_kind,card_title,image_url,button_label,button_url,links,panel_config FROM customer_bot_commands WHERE guild_id=$1 AND bot_user_id=$2 AND name=$3', [guildId, botId, interaction.commandName])).rows[0];
        if (command && !interaction.replied && !interaction.deferred) {
          if (command.response_kind === 'youtube_panel') {
            await interaction.reply(youtubePanelMessage(command.panel_config, interaction.commandName));
            return;
          }
          if (command.response_kind === 'music_panel') {
            await handleMusicCommand(interaction, client, botId, interaction.commandName, command.panel_config);
            return;
          }
          if (command.response_kind === 'movie_club') {
            await handleMovieClubCommand(interaction, pool, botId);
            return;
          }
          const card = command.response_kind === 'card';
          const links = Array.isArray(command.links) && command.links.length ? command.links : command.button_url ? [{ label: command.button_label || 'فتح الرابط', url: command.button_url }] : [];
          await interaction.reply({ ...(card ? { embeds: [{ title: command.card_title, description: command.response, color: 0x8b70ef, ...(command.image_url ? { image: { url: command.image_url } } : {}) }], ...(links.length ? { components: [{ type: 1, components: links.slice(0, 5).map(link => ({ type: 2, style: 5, label: link.label, url: link.url })) }] } : {}) } : { content: command.response }), ephemeral: command.ephemeral, allowedMentions: { parse: [] } });
        }
      } catch (error) { console.error('Connected bot command reply failed', { guildId, botId, error: error.message }); }
      try {
        const [settings, route] = await Promise.all([
          pool.query('SELECT log_channel_id FROM bot_guild_settings WHERE guild_id=$1', [guildId]),
          pool.query('SELECT publishing_bot_id FROM guild_activity_log_routes WHERE guild_id=$1', [guildId]),
        ]);
        if (settings.rows[0]?.log_channel_id && !route.rows[0]) {
          const channel = await client.channels.fetch(settings.rows[0].log_channel_id).catch(() => null);
          if (channel?.guildId === guildId && channel?.isTextBased()) await channel.send({ content: `Command executed: /${interaction.commandName} · <@${interaction.user.id}>`, allowedMentions: { parse: [] } });
        }
      } catch (error) { console.error('Connected bot command log failed', { guildId, error: error.message }); }
    }
    if (clients.get(connectionKey) !== client || interaction.guildId !== guildId || !(interaction.isButton() || interaction.isModalSubmit() || interaction.isChannelSelectMenu() || interaction.isStringSelectMenu()) || !interaction.customId.startsWith('diskoko:')) return;
    try { if (!await handleMusicInteraction(interaction, pool, botId, client) && !await handleYoutubePanelInteraction(interaction, pool, botId) && !await handleMovieClubInteraction(interaction, pool, botId) && !await handleReadyModuleInteraction(interaction, pool)) await handleInteractiveButton(interaction, pool); }
    catch (error) { console.error('Connected AI bot interaction failed', { guildId, error: error.message }); if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: 'تعذر تنفيذ العملية الآن.', ephemeral: true }).catch(() => {}); }
  });
  client.on(Events.GuildMemberAdd, member => { if (clients.get(connectionKey) === client && member.guild.id === guildId) void sendWelcomeCard(member, pool, false).catch(error => console.error('Connected AI bot welcome failed', { guildId, error: error.message })); });
  client.on(Events.Error, error => console.error('Connected AI bot gateway error', { guildId, error: error.message }));
  client.on('shardDisconnect', () => {
    setTimeout(() => {
      if (clients.get(connectionKey) !== client || client.isReady()) return;
      clients.delete(connectionKey);
      stopMusicForBot(guildId, botId);
      void client.destroy().catch(() => {});
      scheduleAiBotRestore(pool, { guild_id: guildId, bot_user_id: botId }, 0);
    }, 90_000).unref();
  });
  let timeout;
  try {
    await waitForGatewayLoginSlot();
    await Promise.race([
      client.login(token),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(Error('Connected bot gateway connection timed out')), 30_000); }),
    ]);
    if (client.user?.id !== botId || !client.guilds.cache.has(guildId)) throw Error('Bot is no longer in the selected guild');
    clients.set(connectionKey, client);
    void syncMusicSlashCommands(pool, guildId, botId, token).catch(error => console.error('Music slash options sync failed', { guildId, botId, error: error.message }));
    if (old) { stopMusicForBot(guildId, botId); stopLavalinkFor(old); await old.destroy(); }
    await pool.query('UPDATE customer_bot_registry SET retry_at=NULL WHERE guild_id=$1 AND bot_user_id=$2', [guildId, botId]);
    await pool.query('UPDATE ai_bot_connections SET retry_at=NULL WHERE guild_id=$1 AND bot_user_id=$2', [guildId, botId]);
    const timer = reconnectTimers.get(connectionKey);
    if (timer) clearTimeout(timer);
    reconnectTimers.delete(connectionKey);
  } catch (error) { await client.destroy(); throw error; }
  finally { clearTimeout(timeout); }
}
export async function stopAiBot(guildId, botId = null) {
  const keys = botId ? [runtimeKey(guildId, botId)] : [...new Set([...clients.keys(), ...reconnectTimers.keys()])].filter(key => key.startsWith(`${guildId}:`));
  for (const key of keys) {
    const timer = reconnectTimers.get(key);
    if (timer) clearTimeout(timer);
    reconnectTimers.delete(key);
    const client = clients.get(key);
    clients.delete(key);
    stopMusicForBot(...key.split(':'));
    if (client) { stopLavalinkFor(client); await client.destroy(); }
  }
}
export async function stopAllAiBots() {
  for (const guildId of new Set([...clients.keys(), ...reconnectTimers.keys()].map(key => key.split(':')[0]))) await stopAiBot(guildId);
}
export async function restoreAiBots(pool) {
  const rows = (await pool.query('SELECT guild_id,bot_user_id,retry_at,updated_at FROM customer_bot_registry')).rows;
  const sharedUntil = await sharedGatewayRetryAt(pool);
  for (const [index, row] of rows.entries()) scheduleAiBotRestore(pool, row, Math.max(index * 4_000, sharedUntil - Date.now(), new Date(row.retry_at || 0).getTime() - Date.now()));
}
export async function syncAiBots(pool) {
  const rows = (await pool.query('SELECT guild_id,bot_user_id,retry_at,updated_at FROM customer_bot_registry')).rows;
  const currentKeys = new Set(rows.map(row => runtimeKey(row.guild_id, row.bot_user_id)));
  for (const key of clients.keys()) if (!currentKeys.has(key)) await stopAiBot(...key.split(':'));
  for (const row of rows) {
    const key = runtimeKey(row.guild_id, row.bot_user_id);
    let client = clients.get(key);
    if (client && client._diskokoConnectionVersion !== new Date(row.updated_at).getTime()) { await stopAiBot(row.guild_id, row.bot_user_id); client = null; }
    if (!client?.isReady() && !reconnectTimers.has(key) && !connecting.has(key)) scheduleAiBotRestore(pool, row, Math.max(0, new Date(row.retry_at || 0).getTime() - Date.now()));
    if (client?.isReady() && client.guilds.cache.has(row.guild_id)) {
      await pool.query('UPDATE customer_bot_registry SET gateway_seen_at=NOW() WHERE guild_id=$1 AND bot_user_id=$2', [row.guild_id, row.bot_user_id]);
      await pool.query('UPDATE ai_bot_connections SET gateway_seen_at=NOW() WHERE guild_id=$1 AND bot_user_id=$2', [row.guild_id, row.bot_user_id]);
    }
  }
}
function scheduleAiBotRestore(pool, row, delayMs) {
  const guildId = row.guild_id, botId = row.bot_user_id, connectionKey = runtimeKey(guildId, botId);
  const prior = reconnectTimers.get(connectionKey);
  if (prior) clearTimeout(prior);
  const timer = setTimeout(() => { reconnectTimers.delete(connectionKey); void (async () => {
    if (connecting.has(connectionKey)) return;
    connecting.add(connectionKey);
    try {
      const current = (await pool.query('SELECT guild_id,bot_user_id,token_encrypted,member_joins,message_content,updated_at FROM customer_bot_registry WHERE guild_id=$1 AND bot_user_id=$2', [guildId, botId])).rows[0];
      if (!current) return;
      const sharedRemaining = await sharedGatewayRetryAt(pool) - Date.now();
      if (sharedRemaining > 0) { scheduleAiBotRestore(pool, row, sharedRemaining); return; }
      const token = open(current.token_encrypted);
      let memberJoins = current.member_joins;
      let messageContent = current.message_content;
      if (memberJoins == null || messageContent == null) {
        const application = await discord(token, '/oauth2/applications/@me');
        if (!application.ok) throw Error(`Discord application lookup failed (${application.status})`);
        const flags = Number(application.data?.flags || 0);
        memberJoins = Boolean(flags & ((1 << 14) | (1 << 15)));
        messageContent = messageContentEnabled(flags);
        await pool.query('UPDATE customer_bot_registry SET member_joins=$3,message_content=$4 WHERE guild_id=$1 AND bot_user_id=$2', [guildId, botId, memberJoins, messageContent]);
        await pool.query('UPDATE ai_bot_connections SET member_joins=$3,message_content=$4 WHERE guild_id=$1 AND bot_user_id=$2', [guildId, botId, memberJoins, messageContent]);
      }
      await startAiBot(pool, guildId, token, current.bot_user_id, memberJoins, messageContent);
      const activeClient = clients.get(connectionKey);
      if (activeClient) activeClient._diskokoConnectionVersion = new Date(current.updated_at).getTime();
      console.info('Connected AI bot ready', { guildId, botId });
    } catch (error) {
      const rateLimited = String(error.name || '').startsWith('RateLimitError');
      const permanent = /TokenInvalid|TOKEN_INVALID|Bot is no longer in the selected guild|\((?:401|403|404)\)/i.test(String(error.name || '') + ' ' + String(error.message || ''));
      const retryMs = rateLimited ? gatewayRetryMs(error) : 300_000;
      console.error('Connected AI bot could not start', { guildId, botId, error: error.message, retryAfterMs: rateLimited ? retryMs : undefined });
      if (permanent) return;
      if (rateLimited) {
        const retryAt = new Date(Date.now() + retryMs);
        await Promise.all([pool.query('UPDATE customer_bot_registry SET retry_at=$3 WHERE guild_id=$1 AND bot_user_id=$2', [guildId, botId, retryAt]), pool.query('UPDATE ai_bot_connections SET retry_at=$3 WHERE guild_id=$1 AND bot_user_id=$2', [guildId, botId, retryAt]), saveSharedGatewayCooldown(pool, retryAt)]).catch(saveError => console.error('Could not save connected bot cooldown', saveError.message));
      }
      scheduleAiBotRestore(pool, row, retryMs);
    } finally { connecting.delete(connectionKey); }
  })(); }, Math.min(2_147_000_000, Math.max(0, delayMs)));
  reconnectTimers.set(connectionKey, timer);
}
export function mountAiBotConnections(app, { pool, requireUser, requireWriteAccess, authorizedGuild, requirePlanCapacity, audit }) {
  app.get('/api/ai/bots', requireUser, async (req, res, next) => { try {
    const guild = await authorizedGuild(req.user, String(req.query.guildId || ''));
    if (!guild) return res.status(403).json({ error: 'لا تملك صلاحية إدارة هذا السيرفر.' });
    const capacity = (await pool.query('SELECT COUNT(*)::int AS total FROM customer_bot_registry WHERE owner_id=$1', [req.user.id])).rows[0];
    const [bots, commands, schedules, welcome, logs, modules] = await Promise.all([
      listCustomerBots(pool, guild.id),
      pool.query('SELECT bot_user_id,name,response_kind FROM customer_bot_commands WHERE guild_id=$1 ORDER BY name', [guild.id]),
      pool.query("SELECT bot_user_id,COUNT(*)::int AS total FROM scheduled_messages WHERE guild_id=$1 AND content_kind='command' AND status IN ('scheduled','sending','failed') GROUP BY bot_user_id", [guild.id]),
      pool.query('SELECT publishing_bot_id FROM diskoko_welcome_cards WHERE guild_id=$1', [guild.id]),
      pool.query('SELECT publishing_bot_id FROM guild_activity_log_routes WHERE guild_id=$1', [guild.id]),
      pool.query('SELECT publishing_bot_id,COUNT(*)::int AS total FROM ready_template_module_panels WHERE guild_id=$1 GROUP BY publishing_bot_id', [guild.id]),
    ]);
    const scheduledByBot = new Map(schedules.rows.map(row => [row.bot_user_id, row.total]));
    const modulesByBot = new Map(modules.rows.map(row => [row.publishing_bot_id, row.total]));
    res.json({ bots: bots.map(bot => ({ ...bot, assignments: {
      commands: commands.rows.filter(row => row.bot_user_id === bot.id).map(row => ({ name: row.name, kind: row.response_kind })),
      scheduled: scheduledByBot.get(bot.id) || 0,
      welcome: welcome.rows[0]?.publishing_bot_id === bot.id,
      logs: logs.rows[0]?.publishing_bot_id === bot.id,
      modules: modulesByBot.get(bot.id) || 0,
    } })), quota: { used: Number(capacity?.total || 0), limit: entitlementsFor(req.user).customBots } });
  } catch (error) { next(error); } });
  app.get('/api/ai/bots/:botId/commands', requireUser, async (req, res, next) => { try {
    const guild = await authorizedGuild(req.user, String(req.query.guildId || ''));
    if (!guild) return res.status(403).json({ error: 'لا تملك صلاحية إدارة هذا السيرفر.' });
    const linked = (await pool.query('SELECT 1 FROM customer_bot_registry WHERE guild_id=$1 AND bot_user_id=$2', [guild.id, req.params.botId])).rowCount;
    if (!linked) return res.status(404).json({ error: 'هذا البوت غير مربوط بالسيرفر.' });
    const commands = (await pool.query('SELECT name,description,response,ephemeral,response_kind,card_title,image_url,button_label,button_url,links,panel_config,created_at FROM customer_bot_commands WHERE guild_id=$1 AND bot_user_id=$2 ORDER BY name', [guild.id, req.params.botId])).rows;
    res.json({ commands, limit: 10 });
  } catch (error) { next(error); } });
  app.post('/api/ai/bots/:botId/commands', requireUser, requireWriteAccess, async (req, res, next) => { try {
    const guild = await authorizedGuild(req.user, String(req.body.guildId || ''));
    if (!guild) return res.status(403).json({ error: 'لا تملك صلاحية إدارة هذا السيرفر.' });
    const bot = await connectedBot(pool, guild.id, req.params.botId);
    if (!bot) return res.status(404).json({ error: 'هذا البوت غير مربوط بالسيرفر.' });
    const name = String(req.body.name || '').trim().toLocaleLowerCase();
    const description = String(req.body.description || '').trim();
    const response = String(req.body.response || '').trim();
    const ephemeral = req.body.ephemeral === true;
    const responseKind = ['youtube_panel', 'music_panel', 'movie_club'].includes(req.body.responseKind) ? req.body.responseKind : req.body.responseKind === 'card' ? 'card' : 'text';
    let panelConfig;
    try { panelConfig = responseKind === 'youtube_panel' ? normalizeYoutubePanel(req.body.panelConfig) : responseKind === 'music_panel' ? normalizeMusicPanel(req.body.panelConfig) : {}; }
    catch (error) { return res.status(400).json({ error: error.message }); }
    const cardTitle = String(req.body.cardTitle || '').trim();
    const imageUrl = String(req.body.imageUrl || '').trim();
    const buttonLabel = String(req.body.buttonLabel || '').trim();
    const buttonUrl = String(req.body.buttonUrl || '').trim();
    const validLink = value => { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && value.length <= 500; } catch { return false; } };
    const links = Array.isArray(req.body.links) ? req.body.links.map(link => ({ label: String(link?.label || '').trim(), url: String(link?.url || '').trim() })).filter(link => link.label || link.url) : [];
    if (!/^[-_\p{L}\p{N}]{1,32}$/u.test(name)) return res.status(400).json({ error: 'اسم الأمر من 1 إلى 32 حرفًا أو رقمًا، ويمكن استخدام - و _ فقط.' });
    if (!description || description.length > 100) return res.status(400).json({ error: 'وصف الأمر مطلوب ويجب ألا يتجاوز 100 حرف.' });
    if ((!['youtube_panel', 'music_panel'].includes(responseKind) && !response) || response.length > 2000) return res.status(400).json({ error: 'اكتب ردًا للأمر لا يتجاوز 2000 حرف.' });
    if (responseKind === 'card' && (!cardTitle || cardTitle.length > 256)) return res.status(400).json({ error: 'اكتب عنوانًا للوحة لا يتجاوز 256 حرفًا.' });
    if (imageUrl && !validLink(imageUrl)) return res.status(400).json({ error: 'رابط الصورة يجب أن يبدأ بـ https وأن يكون صالحًا.' });
    if (buttonUrl && (!validLink(buttonUrl) || !buttonLabel || buttonLabel.length > 80)) return res.status(400).json({ error: 'أدخل رابط زر https وعنوانًا له لا يتجاوز 80 حرفًا.' });
    if (buttonLabel && !buttonUrl) return res.status(400).json({ error: 'أدخل رابط الزر أو احذف عنوانه.' });
    if (links.length > 5 || links.some(link => !link.label || link.label.length > 80 || !validLink(link.url))) return res.status(400).json({ error: 'أضف حتى 5 روابط، لكل واحد عنوان لا يتجاوز 80 حرفًا ورابط https صالح.' });
    const existing = (await pool.query('SELECT COUNT(*)::int AS total,BOOL_OR(name=$3) AS already_created FROM customer_bot_commands WHERE guild_id=$1 AND bot_user_id=$2', [guild.id, bot.id, name])).rows[0];
    if (existing?.already_created) return res.status(409).json({ error: 'هذا الأمر موجود لهذا البوت. احذفه أولًا إذا أردت تغييره.' });
    if (Number(existing?.total || 0) >= 10) return res.status(409).json({ error: 'وصلت إلى 10 أوامر لهذا البوت. احذف أمرًا لا تحتاجه قبل إضافة آخر.' });
    const path = `/applications/${encodeURIComponent(bot.id)}/guilds/${encodeURIComponent(guild.id)}/commands`;
    const remote = await discord(bot.token, path);
    if (!remote.ok || !Array.isArray(remote.data)) return res.status(502).json({ error: 'تعذر فحص أوامر البوت في Discord الآن. حاول مجددًا قبل إنشاء الأمر.' });
    if (remote.data.some(command => command.name === name)) return res.status(409).json({ error: 'هذا الاسم مستخدم في Discord لهذا البوت. اختر اسمًا آخر حتى لا نغيّر أمرًا موجودًا.' });
    const created = await discord(bot.token, path, { method: 'POST', body: JSON.stringify({ name, description, type: 1, ...(responseKind === 'music_panel' ? { options: musicSlashOptions } : {}) }) });
    if (!created.ok || !created.data?.id) return res.status(created.status === 403 ? 403 : 502).json({ error: created.status === 403 ? 'Discord منع تسجيل الأمر. أعد إضافة التطبيق مع صلاحية أوامر التطبيقات ثم حاول.' : 'تعذر تسجيل الأمر في Discord الآن. راجع البوت وحاول مجددًا.' });
    try {
      await pool.query('INSERT INTO customer_bot_commands(guild_id,bot_user_id,name,description,response,discord_command_id,ephemeral,response_kind,card_title,image_url,button_label,button_url,links,panel_config) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)', [guild.id, bot.id, name, description, response || panelConfig.description || 'نادي الأفلام', created.data.id, ephemeral, responseKind, responseKind === 'card' ? cardTitle : null, responseKind === 'card' ? imageUrl || null : null, responseKind === 'card' ? buttonLabel || null : null, responseKind === 'card' ? buttonUrl || null : null, responseKind === 'card' ? JSON.stringify(links) : '[]', JSON.stringify(panelConfig)]);
    } catch (error) {
      await discord(bot.token, `${path}/${encodeURIComponent(created.data.id)}`, { method: 'DELETE' }).catch(() => {});
      throw error;
    }
    await audit(req.user.id, 'ai.bot.command.create', 'guild', guild.id, { botId: bot.id, name });
    res.status(201).json({ command: { name, description, response, ephemeral, responseKind, cardTitle, imageUrl, buttonLabel, buttonUrl } });
  } catch (error) { next(error); } });
  app.patch('/api/ai/bots/:botId/commands/:name', requireUser, requireWriteAccess, async (req, res, next) => { try {
    const guild = await authorizedGuild(req.user, String(req.body.guildId || ''));
    if (!guild) return res.status(403).json({ error: 'لا تملك صلاحية إدارة هذا السيرفر.' });
    const bot = await connectedBot(pool, guild.id, req.params.botId);
    if (!bot) return res.status(404).json({ error: 'هذا البوت غير مربوط بالسيرفر.' });
    const existing = (await pool.query('SELECT name FROM customer_bot_commands WHERE guild_id=$1 AND bot_user_id=$2 AND name=$3', [guild.id, bot.id, req.params.name])).rows[0];
    if (!existing) return res.status(404).json({ error: 'هذا الأمر غير موجود. حدّث القائمة قبل التعديل.' });
    const response = String(req.body.response || '').trim();
    const responseKind = req.body.responseKind === 'card' ? 'card' : 'text';
    const cardTitle = String(req.body.cardTitle || '').trim();
    const imageUrl = String(req.body.imageUrl || '').trim();
    const ephemeral = req.body.ephemeral === true;
    const validLink = value => { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && value.length <= 500; } catch { return false; } };
    const links = Array.isArray(req.body.links) ? req.body.links.map(link => ({ label: String(link?.label || '').trim(), url: String(link?.url || '').trim() })).filter(link => link.label || link.url) : [];
    if (!response || response.length > 2000) return res.status(400).json({ error: 'اكتب ردًا للأمر لا يتجاوز 2000 حرف.' });
    if (responseKind === 'card' && (!cardTitle || cardTitle.length > 256)) return res.status(400).json({ error: 'اكتب عنوانًا للوحة لا يتجاوز 256 حرفًا.' });
    if (imageUrl && !validLink(imageUrl)) return res.status(400).json({ error: 'رابط الصورة يجب أن يبدأ بـ https وأن يكون صالحًا.' });
    if (links.length > 5 || links.some(link => !link.label || link.label.length > 80 || !validLink(link.url))) return res.status(400).json({ error: 'أضف حتى 5 روابط، لكل واحد عنوان لا يتجاوز 80 حرفًا ورابط https صالح.' });
    if (ephemeral) { const pending = (await pool.query("SELECT 1 FROM scheduled_messages WHERE guild_id=$1 AND bot_user_id=$2 AND command_name=$3 AND status IN ('scheduled','sending','failed') LIMIT 1", [guild.id, bot.id, req.params.name])).rowCount; if (pending) return res.status(409).json({ error: 'هذا الأمر له نشر مجدول. ألغِ الجدولة أولًا قبل تحويله إلى رد خاص.' }); }
    await pool.query("UPDATE customer_bot_commands SET response=$4,ephemeral=$5,response_kind=$6,card_title=$7,image_url=$8,button_label=NULL,button_url=NULL,links=$9 WHERE guild_id=$1 AND bot_user_id=$2 AND name=$3", [guild.id, bot.id, req.params.name, response, ephemeral, responseKind, responseKind === 'card' ? cardTitle : null, responseKind === 'card' ? imageUrl || null : null, responseKind === 'card' ? JSON.stringify(links) : '[]']);
    await audit(req.user.id, 'ai.bot.command.update', 'guild', guild.id, { botId: bot.id, name: req.params.name });
    res.json({ ok: true });
  } catch (error) { next(error); } });
  app.delete('/api/ai/bots/:botId/commands/:name', requireUser, requireWriteAccess, async (req, res, next) => { try {
    const guild = await authorizedGuild(req.user, String(req.body.guildId || ''));
    if (!guild) return res.status(403).json({ error: 'لا تملك صلاحية إدارة هذا السيرفر.' });
    const bot = await connectedBot(pool, guild.id, req.params.botId);
    if (!bot) return res.status(404).json({ error: 'هذا البوت غير مربوط بالسيرفر.' });
    const command = (await pool.query('SELECT discord_command_id FROM customer_bot_commands WHERE guild_id=$1 AND bot_user_id=$2 AND name=$3', [guild.id, bot.id, req.params.name])).rows[0];
    if (!command) return res.status(404).json({ error: 'هذا الأمر غير موجود.' });
    const removed = await discord(bot.token, `/applications/${encodeURIComponent(bot.id)}/guilds/${encodeURIComponent(guild.id)}/commands/${encodeURIComponent(command.discord_command_id)}`, { method: 'DELETE' });
    if (!removed.ok && removed.status !== 404) return res.status(502).json({ error: 'تعذر حذف الأمر من Discord الآن. لم نحذفه من لوحة التحكم حتى لا يختفي وهو لا يزال يعمل.' });
    await pool.query('DELETE FROM customer_bot_commands WHERE guild_id=$1 AND bot_user_id=$2 AND name=$3', [guild.id, bot.id, req.params.name]);
    await audit(req.user.id, 'ai.bot.command.delete', 'guild', guild.id, { botId: bot.id, name: req.params.name });
    res.json({ ok: true });
  } catch (error) { next(error); } });
  app.post('/api/ai/bots/select', requireUser, requireWriteAccess, async (req, res, next) => { try {
    const guild = await authorizedGuild(req.user, String(req.body.guildId || ''));
    if (!guild) return res.status(403).json({ error: 'لا تملك صلاحية إدارة هذا السيرفر.' });
    const botId = String(req.body.botId || '');
    const bot = (await listCustomerBots(pool, guild.id)).find(item => item.id === botId);
    if (!bot) return res.status(404).json({ error: 'هذا البوت غير مربوط بالسيرفر.' });
    if (!bot.online) return res.status(409).json({ error: 'البوت غير متصل الآن. راجع رمزه أو انتظر عودة الاتصال ثم حاول اختياره.' });
    await pool.query(`INSERT INTO ai_bot_connections(guild_id,owner_id,bot_user_id,bot_name,token_encrypted,retry_at,member_joins,message_content,gateway_seen_at,selected_for_server)
      SELECT guild_id,owner_id,bot_user_id,bot_name,token_encrypted,retry_at,member_joins,message_content,gateway_seen_at,TRUE FROM customer_bot_registry WHERE guild_id=$1 AND bot_user_id=$2
      ON CONFLICT(guild_id) DO UPDATE SET owner_id=EXCLUDED.owner_id,bot_user_id=EXCLUDED.bot_user_id,bot_name=EXCLUDED.bot_name,token_encrypted=EXCLUDED.token_encrypted,retry_at=EXCLUDED.retry_at,member_joins=EXCLUDED.member_joins,message_content=EXCLUDED.message_content,gateway_seen_at=EXCLUDED.gateway_seen_at,selected_for_server=TRUE,updated_at=NOW()`, [guild.id, botId]);
    await audit(req.user.id, 'ai.bot.select', 'guild', guild.id, { executor: 'custom', botId });
    res.json({ bot: await connectedBotMetadata(pool, guild.id), bots: await listCustomerBots(pool, guild.id) });
  } catch (error) { next(error); } });
  app.patch('/api/ai/bots/:botId', requireUser, requireWriteAccess, async (req, res, next) => { try {
    const guild = await authorizedGuild(req.user, String(req.body.guildId || ''));
    if (!guild) return res.status(403).json({ error: 'لا تملك صلاحية إدارة هذا السيرفر.' });
    const label = String(req.body.label || '').trim().slice(0, 80);
    if (!label) return res.status(400).json({ error: 'اكتب اسمًا واضحًا لتمييز هذا البوت داخل لوحة التحكم.' });
    const result = await pool.query('UPDATE customer_bot_registry SET label=$3 WHERE guild_id=$1 AND bot_user_id=$2 RETURNING bot_user_id', [guild.id, req.params.botId, label]);
    if (!result.rowCount) return res.status(404).json({ error: 'هذا البوت غير مربوط بالسيرفر.' });
    await audit(req.user.id, 'ai.bot.label', 'guild', guild.id, { botId: req.params.botId });
    res.json({ bots: await listCustomerBots(pool, guild.id) });
  } catch (error) { next(error); } });
  app.get('/api/ai/bots/:botId/profile', requireUser, async (req, res, next) => { try {
    const guild = await authorizedGuild(req.user, String(req.query.guildId || ''));
    if (!guild) return res.status(403).json({ error: 'لا تملك صلاحية إدارة هذا السيرفر.' });
    const bot = await connectedBot(pool, guild.id, req.params.botId);
    if (!bot) return res.status(404).json({ error: 'هذا البوت غير مربوط بالسيرفر.' });
    const [member, roles] = await Promise.all([
      discord(bot.token, `/guilds/${encodeURIComponent(guild.id)}/members/${encodeURIComponent(bot.id)}`),
      discord(bot.token, `/guilds/${encodeURIComponent(guild.id)}/roles`),
    ]);
    if (!member.ok) return res.status(member.status === 404 ? 409 : 502).json({ error: member.status === 404 ? 'البوت غير موجود في السيرفر. أضفه مجددًا من Discord ثم حدّث الربط.' : 'تعذر قراءة ملف البوت من Discord الآن.' });
    res.json({ nickname: member.data.nick || '', avatar: member.data.avatar || null,
      permissions: roles.ok && Array.isArray(roles.data) ? guildBotPermissionSummary(member.data, roles.data, guild.id) : null });
  } catch (error) { next(error); } });
  app.patch('/api/ai/bots/:botId/identity', requireUser, requireWriteAccess, async (req, res, next) => { try {
    const guild = await authorizedGuild(req.user, String(req.body.guildId || ''));
    if (!guild) return res.status(403).json({ error: 'لا تملك صلاحية إدارة هذا السيرفر.' });
    const linked = (await pool.query('SELECT owner_id FROM customer_bot_registry WHERE guild_id=$1 AND bot_user_id=$2', [guild.id, req.params.botId])).rows[0];
    if (!linked) return res.status(404).json({ error: 'هذا البوت غير مربوط بالسيرفر.' });
    if (String(linked.owner_id) !== String(req.user.id)) return res.status(403).json({ error: 'مالك الربط فقط يستطيع تغيير اسم البوت وصورته في جميع السيرفرات.' });
    const username = String(req.body.username || '').trim();
    const avatar = String(req.body.avatar || '');
    if (!username && !avatar) return res.status(400).json({ error: 'اختر اسمًا جديدًا أو صورة جديدة للبوت.' });
    if (username && (username.length < 2 || username.length > 32)) return res.status(400).json({ error: 'اسم البوت من حرفين إلى 32 حرفًا، وسيظهر في جميع السيرفرات.' });
    if (avatar && (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar) || avatar.length > 350_000)) return res.status(400).json({ error: 'اختر صورة PNG أو JPG أو WebP لا تتجاوز 250 كيلوبايت.' });
    const bot = await connectedBot(pool, guild.id, req.params.botId);
    const updated = await discord(bot.token, '/users/@me', { method: 'PATCH', body: JSON.stringify({ ...(username ? { username } : {}), ...(avatar ? { avatar } : {}) }) });
    if (!updated.ok) return res.status(updated.status === 429 ? 429 : updated.status === 400 ? 400 : 502).json({ error: updated.status === 429 ? 'Discord يطلب الانتظار قبل تغيير هوية البوت مجددًا. حاول لاحقًا.' : updated.status === 400 ? 'Discord رفض الاسم أو الصورة. اختر اسمًا مختلفًا وصورة أصغر ثم حاول.' : 'تعذر تحديث هوية البوت في Discord الآن. لم نغيّر بياناته هنا.' });
    const newName = String(updated.data.global_name || updated.data.username || username || bot.name).slice(0, 80);
    await pool.query('UPDATE customer_bot_registry SET bot_name=$2 WHERE bot_user_id=$1 AND owner_id=$3', [bot.id, newName, req.user.id]);
    await pool.query('UPDATE ai_bot_connections SET bot_name=$2 WHERE bot_user_id=$1 AND owner_id=$3', [bot.id, newName, req.user.id]);
    await audit(req.user.id, 'ai.bot.identity', 'guild', guild.id, { botId: bot.id, changedName: Boolean(username), changedAvatar: Boolean(avatar) });
    res.json({ name: newName, avatar: updated.data.avatar || null });
  } catch (error) { next(error); } });
  app.patch('/api/ai/bots/:botId/nickname', requireUser, requireWriteAccess, async (req, res, next) => { try {
    const guild = await authorizedGuild(req.user, String(req.body.guildId || ''));
    if (!guild) return res.status(403).json({ error: 'لا تملك صلاحية إدارة هذا السيرفر.' });
    const nickname = String(req.body.nickname || '').trim();
    if (nickname.length > 32) return res.status(400).json({ error: 'اسم البوت داخل السيرفر يجب ألا يتجاوز 32 حرفًا.' });
    const bot = await connectedBot(pool, guild.id, req.params.botId);
    if (!bot) return res.status(404).json({ error: 'هذا البوت غير مربوط بالسيرفر.' });
    const result = await discord(bot.token, `/guilds/${encodeURIComponent(guild.id)}/members/@me`, { method: 'PATCH', body: JSON.stringify({ nick: nickname || null }) });
    if (!result.ok) return res.status(result.status === 403 ? 403 : 502).json({ error: result.status === 403 ? 'Discord منع تغيير لقب البوت. امنحه صلاحية تغيير لقبه في السيرفر أو عدّل رتبته، ثم حاول مجددًا.' : 'تعذر تغيير لقب البوت في Discord الآن. راجع اتصاله وحاول مجددًا.' });
    await audit(req.user.id, 'ai.bot.nickname', 'guild', guild.id, { botId: req.params.botId });
    res.json({ nickname: result.data.nick || '' });
  } catch (error) { next(error); } });
  app.delete('/api/ai/bots/:botId', requireUser, requireWriteAccess, async (req, res, next) => { try {
    const guild = await authorizedGuild(req.user, String(req.body.guildId || ''));
    if (!guild) return res.status(403).json({ error: 'لا تملك صلاحية إدارة هذا السيرفر.' });
    const botId = String(req.params.botId || '');
    const commands = (await pool.query('SELECT COUNT(*)::int AS total FROM customer_bot_commands WHERE guild_id=$1 AND bot_user_id=$2', [guild.id, botId])).rows[0];
    if (Number(commands?.total || 0) > 0) return res.status(409).json({ error: 'احذف أوامر هذا البوت من صفحة إعداداته أولًا، حتى لا تبقى أوامر مسجلة في Discord دون رد.' });
    const result = await pool.query('DELETE FROM customer_bot_registry WHERE guild_id=$1 AND bot_user_id=$2 RETURNING bot_user_id', [guild.id, botId]);
    if (!result.rowCount) return res.status(404).json({ error: 'هذا البوت غير مربوط بالسيرفر.' });
    await pool.query('DELETE FROM ai_bot_connections WHERE guild_id=$1 AND bot_user_id=$2', [guild.id, botId]);
    await stopAiBot(guild.id, botId);
    await audit(req.user.id, 'ai.bot.disconnect', 'guild', guild.id, { botId });
    res.json({ bots: await listCustomerBots(pool, guild.id) });
  } catch (error) { next(error); } });
  app.get('/api/ai/bot-connection', requireUser, async (req, res, next) => { try {
    const guild = await authorizedGuild(req.user, String(req.query.guildId || ''));
    if (!guild) return res.status(403).json({ error: 'لا تملك صلاحية إدارة هذا السيرفر.' });
    res.json({ bot: await connectedBotMetadata(pool, guild.id) });
  } catch (error) { next(error); } });
  app.post('/api/ai/bot-connection/selection', requireUser, requireWriteAccess, async (req, res, next) => { try {
    const guild = await authorizedGuild(req.user, String(req.body.guildId || ''));
    if (!guild) return res.status(403).json({ error: 'لا تملك صلاحية إدارة هذا السيرفر.' });
    const executor = String(req.body.executor || '');
    if (!['diskoko', 'custom'].includes(executor)) return res.status(400).json({ error: 'اختر بوت ديسكوكو أو بوتك الخاص.' });
    const bot = await connectedBotMetadata(pool, guild.id);
    if (executor === 'custom' && !bot) return res.status(409).json({ error: 'اربط بوتك الخاص بهذا السيرفر أولًا.' });
    if (executor === 'custom' && !bot.online) return res.status(409).json({ error: bot.retryAt && new Date(bot.retryAt).getTime() > Date.now() ? `بوتك غير متصل. المحاولة التالية ${new Date(bot.retryAt).toISOString()}.` : 'بوتك غير متصل. راجع الرمز وإضافة البوت للسيرفر، ثم أعد الربط أو انتظر عودة الاتصال.' });
    if (bot) await pool.query('UPDATE ai_bot_connections SET selected_for_server=$2 WHERE guild_id=$1', [guild.id, executor === 'custom']);
    await audit(req.user.id, 'ai.bot.select', 'guild', guild.id, { executor });
    res.json({ executor, bot: await connectedBotMetadata(pool, guild.id) });
  } catch (error) { next(error); } });
  const connectBot = async (req, res, next, selectRequested) => { try {
    const guild = await authorizedGuild(req.user, String(req.body.guildId || ''));
    if (!guild) return res.status(403).json({ error: 'لا تملك صلاحية إدارة هذا السيرفر.' });
    const token = String(req.body.token || '').trim();
    if (!/^[A-Za-z0-9._-]{40,200}$/.test(token)) return res.status(400).json({ error: 'رمز البوت غير صالح. انسخه من Discord Developer Portal.' });
    const existing = (await pool.query('SELECT install_status FROM guild_connections WHERE user_id=$1 AND guild_id=$2', [req.user.id, guild.id])).rows[0];
    if (existing?.install_status !== 'installed') await requirePlanCapacity(req.user, 'servers');
    const identity = await discord(token, '/users/@me');
    if (identity.status === 429 || identity.status === 503) return res.status(503).json({ error: 'Discord مشغول مؤقتًا. انتظر المهلة ثم أعد محاولة الربط.' });
    if (!identity.ok || identity.data.bot !== true) return res.status(400).json({ error: 'تعذر التحقق من رمز البوت في Discord.' });
    const application = await discord(token, '/oauth2/applications/@me');
    if (application.status === 429 || application.status === 503) return res.status(503).json({ error: 'Discord مشغول مؤقتًا. انتظر المهلة ثم أعد محاولة الربط.' });
    if (!application.ok || String(application.data.bot?.id || application.data.id) !== identity.data.id) return res.status(400).json({ error: 'تعذر التحقق من تطبيق البوت.' });
    const membership = await discord(token, `/guilds/${encodeURIComponent(guild.id)}`);
    if (membership.status === 429 || membership.status === 503) return res.status(503).json({ error: 'تعذر التحقق من السيرفر مؤقتًا بسبب حد Discord. أعد المحاولة لاحقًا.' });
    if (!membership.ok) {
      const invite = new URL('https://discord.com/oauth2/authorize');
      invite.search = new URLSearchParams({ client_id: identity.data.id, scope: 'bot', permissions: '17592186162192', guild_id: guild.id, disable_guild_select: 'true' }).toString();
      return res.status(409).json({ error: 'بوتك غير مضاف لهذا السيرفر. أضفه عبر الرابط ثم اضغط تحقق واربط مرة أخرى.', inviteUrl: invite.toString() });
    }
    const name = String(identity.data.global_name || identity.data.username).slice(0, 80);
    const flags = Number(application.data.flags || 0);
    const registryCount = (await pool.query('SELECT COUNT(*)::int AS total,BOOL_OR(bot_user_id=$2) AS already_linked FROM customer_bot_registry WHERE guild_id=$1', [guild.id, identity.data.id])).rows[0];
    if (!registryCount?.already_linked) await requirePlanCapacity(req.user, 'customBots');
    const selectedBefore = (await pool.query('SELECT bot_user_id FROM ai_bot_connections WHERE guild_id=$1', [guild.id])).rows[0];
    const select = selectRequested || !selectedBefore;
    const sharedRemaining = await sharedGatewayRetryAt(pool) - Date.now();
    let retryAt = sharedRemaining > 0 ? new Date(Date.now() + sharedRemaining) : null;
    if (!retryAt && process.env.BOT_GATEWAY_MODE !== 'external') {
      try { await startAiBot(pool, guild.id, token, identity.data.id, Boolean(flags & ((1 << 14) | (1 << 15))), messageContentEnabled(flags)); }
      catch (error) {
        if (!String(error.name || '').startsWith('RateLimitError')) throw error;
        retryAt = new Date(Date.now() + gatewayRetryMs(error));
        await saveSharedGatewayCooldown(pool, retryAt);
      }
    }
    const encryptedToken = seal(token);
    const saved = await pool.query(`INSERT INTO customer_bot_registry(guild_id,bot_user_id,owner_id,bot_name,token_encrypted,retry_at,member_joins,message_content) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(guild_id,bot_user_id) DO UPDATE SET owner_id=EXCLUDED.owner_id,bot_name=EXCLUDED.bot_name,token_encrypted=EXCLUDED.token_encrypted,retry_at=EXCLUDED.retry_at,member_joins=EXCLUDED.member_joins,message_content=EXCLUDED.message_content,gateway_seen_at=NULL,updated_at=NOW()
      RETURNING updated_at`, [guild.id, identity.data.id, req.user.id, name, encryptedToken, retryAt, Boolean(flags & ((1 << 14) | (1 << 15))), messageContentEnabled(flags)]);
    const activeClient = clients.get(runtimeKey(guild.id, identity.data.id));
    if (activeClient) activeClient._diskokoConnectionVersion = new Date(saved.rows[0].updated_at).getTime();
    if (select) await pool.query(`INSERT INTO ai_bot_connections(guild_id,owner_id,bot_user_id,bot_name,token_encrypted,retry_at,member_joins,message_content) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(guild_id) DO UPDATE SET owner_id=EXCLUDED.owner_id,bot_user_id=EXCLUDED.bot_user_id,bot_name=EXCLUDED.bot_name,token_encrypted=EXCLUDED.token_encrypted,retry_at=EXCLUDED.retry_at,member_joins=EXCLUDED.member_joins,message_content=EXCLUDED.message_content,gateway_seen_at=NULL,selected_for_server=TRUE,updated_at=NOW()`, [guild.id, req.user.id, identity.data.id, name, encryptedToken, retryAt, Boolean(flags & ((1 << 14) | (1 << 15))), messageContentEnabled(flags)]);
    await pool.query("INSERT INTO guild_connections(user_id,guild_id,guild_name,install_status,last_verified_at,updated_at) VALUES($1,$2,$3,'installed',NOW(),NOW()) ON CONFLICT(user_id,guild_id) DO UPDATE SET guild_name=EXCLUDED.guild_name,install_status='installed',last_verified_at=NOW(),updated_at=NOW()", [req.user.id, guild.id, guild.name]);
    if (retryAt && process.env.BOT_GATEWAY_MODE !== 'external') { await stopAiBot(guild.id, identity.data.id); scheduleAiBotRestore(pool, { guild_id: guild.id, bot_user_id: identity.data.id }, retryAt.getTime() - Date.now()); }
    await audit(req.user.id, 'ai.bot.connect', 'guild', guild.id, { botId: identity.data.id });
    res.status(retryAt || process.env.BOT_GATEWAY_MODE === 'external' ? 202 : 200).json({ bot: await connectedBotMetadata(pool, guild.id), bots: await listCustomerBots(pool, guild.id), pending: Boolean(retryAt || process.env.BOT_GATEWAY_MODE === 'external') });
  } catch (error) { next(error); } };
  app.post('/api/ai/bot-connection', requireUser, requireWriteAccess, (req, res, next) => connectBot(req, res, next, true));
  app.post('/api/ai/bots', requireUser, requireWriteAccess, (req, res, next) => connectBot(req, res, next, false));
  app.delete('/api/ai/bot-connection', requireUser, requireWriteAccess, async (req, res, next) => { try {
    const guild = await authorizedGuild(req.user, String(req.body.guildId || ''));
    if (!guild) return res.status(403).json({ error: 'لا تملك صلاحية إدارة هذا السيرفر.' });
    const current = (await pool.query('SELECT bot_user_id FROM ai_bot_connections WHERE guild_id=$1', [guild.id])).rows[0];
    if (current) {
      const commands = (await pool.query('SELECT COUNT(*)::int AS total FROM customer_bot_commands WHERE guild_id=$1 AND bot_user_id=$2', [guild.id, current.bot_user_id])).rows[0];
      if (Number(commands?.total || 0) > 0) return res.status(409).json({ error: 'احذف أوامر هذا البوت من إعداداته أولًا، حتى لا تبقى أوامر مسجلة في Discord دون رد.' });
    }
    const selected = (await pool.query('DELETE FROM ai_bot_connections WHERE guild_id=$1 RETURNING bot_user_id', [guild.id])).rows[0];
    if (selected) {
      await pool.query('DELETE FROM customer_bot_registry WHERE guild_id=$1 AND bot_user_id=$2', [guild.id, selected.bot_user_id]);
      await stopAiBot(guild.id, selected.bot_user_id);
    }
    await audit(req.user.id, 'ai.bot.disconnect', 'guild', guild.id, {});
    res.json({ bot: null });
  } catch (error) { next(error); } });
}
