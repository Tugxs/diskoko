import { Events } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';

const EVENT_LABELS = {
  message_create: 'رسالة جديدة', message_update: 'تعديل رسالة', message_delete: 'حذف رسالة',
  voice_join: 'دخول صوتي', voice_leave: 'خروج صوتي', command: 'أمر بوت',
};

export function deletedMessageDetail(content) {
  const text = String(content || '').replace(/\r\n/g, '\n').trim();
  if (!text) return 'نص الرسالة غير متاح. فعّل Message Content Intent للبوت وأعد ربطه، أو تأكد أنه كان متصلًا قبل الحذف. لا يمكن استرجاع النص بعد حذفه.';
  const safe = text.replace(/@/g, '@\u200b').replace(/`/g, 'ˈ').replace(/\n/g, ' ⏎ ');
  return `النص: ${safe.slice(0, 420)}${safe.length > 420 ? '…' : ''}`;
}

export async function migrateGuildActivityLogs(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS guild_activity_log_routes (
    guild_id TEXT PRIMARY KEY, publishing_bot_id TEXT NOT NULL,
    config JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

export function activityLogDestinations(config, event, sourceId) {
  if (!config?.events?.includes(event) || !sourceId) return [];
  if (config.mode !== 'routed') return config.targetId && config.targetId !== sourceId ? [config.targetId] : [];
  return [...new Set((config.routes || []).filter(rule => (!rule.events || rule.events.includes(event)) && rule.sourceIds?.includes(sourceId) && rule.targetId && rule.targetId !== sourceId).map(rule => rule.targetId))];
}

export function registerGuildActivityLogs(client, pool, onlyGuildId = null) {
  const cached = new Map();
  const queues = new Map();
  const paused = new Map();
  const recentMessages = new Map();
  let timer = null;
  function remember(message) {
    if (!message.guildId || !message.id || message.author?.bot || !message.content?.trim()) return;
    recentMessages.delete(message.id);
    recentMessages.set(message.id, { content: message.content, actorId: message.author?.id, guildId: message.guildId, until: Date.now() + 3_600_000 });
    while (recentMessages.size > 2_000) recentMessages.delete(recentMessages.keys().next().value);
  }
  async function configFor(guildId) {
    const hit = cached.get(guildId);
    if (hit?.until > Date.now()) return hit.value;
    const value = pool.query('SELECT publishing_bot_id,config FROM guild_activity_log_routes WHERE guild_id=$1', [guildId])
      .then(result => result.rows[0]?.publishing_bot_id === client.user?.id ? result.rows[0].config : null)
      .catch(error => { cached.delete(guildId); throw error; });
    cached.set(guildId, { value, until: Date.now() + 15_000 });
    return value;
  }
  async function flush() {
    timer = null;
    if (!client.isReady()) { queues.clear(); return; }
    for (const [key, queue] of [...queues].slice(0, 5)) {
      if ((paused.get(key) || 0) > Date.now()) { queues.delete(key); continue; }
      if (!queue.lines.length && !queue.dropped) { queues.delete(key); continue; }
      const lines = [];
      let length = 24;
      while (queue.lines.length && lines.length < 12) {
        const next = queue.lines[0];
        if (lines.length && length + next.length + 1 > 1800) break;
        lines.push(queue.lines.shift());
        length += next.length + 1;
      }
      const dropped = queue.dropped; queue.dropped = 0;
      try {
        const channel = await client.channels.fetch(queue.targetId).catch(() => null);
        if (!channel?.isTextBased() || channel.guildId !== queue.guildId) throw Error('قناة السجل غير متاحة');
        await channel.send({ content: `**سجل النشاط**\n${lines.join('\n')}${dropped ? `\n… و${dropped} أحداث إضافية خلال الازدحام.` : ''}`, allowedMentions: { parse: [] } });
        queue.failures = 0;
      } catch (error) {
        queue.lines.unshift(...lines);
        queue.dropped += dropped;
        queue.failures = (queue.failures || 0) + 1;
        console.warn('Activity log delivery delayed', { guildId: queue.guildId, error: error.message });
        if (queue.failures >= 3) { paused.set(key, Date.now() + 300_000); queues.delete(key); }
      }
      if (!queue.lines.length && !queue.dropped) queues.delete(key);
    }
    if (queues.size) schedule();
  }
  function schedule() { if (!timer) { timer = setTimeout(() => void flush(), 10_000); timer.unref?.(); } }
  async function capture({ guildId, sourceId, event, actorId, messageId, commandName, content }) {
    if (!guildId || (onlyGuildId && guildId !== onlyGuildId)) return;
    try {
      const config = await configFor(guildId);
      for (const targetId of activityLogDestinations(config, event, sourceId)) {
        const key = `${guildId}:${targetId}`;
        if ((paused.get(key) || 0) > Date.now()) continue;
        let queue = queues.get(key);
        if (!queue) { queue = { guildId, targetId, lines: [], dropped: 0 }; queues.set(key, queue); }
        const link = messageId && event !== 'message_delete' ? ` · https://discord.com/channels/${guildId}/${sourceId}/${messageId}` : '';
        const command = event === 'command' ? ` /${String(commandName || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)}` : '';
        const source = client.channels.cache.get(sourceId);
        const target = client.channels.cache.get(targetId);
        const everyone = source?.guild?.roles.everyone;
        const privateSource = everyone && !source.permissionsFor(everyone)?.has(PermissionFlagsBits.ViewChannel);
        const publicTarget = everyone && (!target || target.permissionsFor(everyone)?.has(PermissionFlagsBits.ViewChannel));
        const detail = event === 'message_delete' ? ` — ${privateSource && publicTarget ? 'نص الرسالة محجوب لأن قناة السجل عامة والقناة الأصلية خاصة.' : deletedMessageDetail(content)}` : '';
        const line = `• ${EVENT_LABELS[event]}${command} في <#${sourceId}>${actorId ? ` بواسطة <@${actorId}>` : ''}${link}${detail}`;
        if (queue.lines.length < 120) queue.lines.push(line); else queue.dropped++;
        schedule();
      }
    } catch (error) { console.warn('Activity log event skipped', { guildId, error: error.message }); }
  }
  client.on(Events.MessageCreate, message => { if (!message.author?.bot) { remember(message); void capture({ guildId: message.guildId, sourceId: message.channelId, event: 'message_create', actorId: message.author?.id, messageId: message.id }); } });
  client.on(Events.MessageUpdate, (_old, message) => { if (!message.author?.bot) { remember(message); void capture({ guildId: message.guildId, sourceId: message.channelId, event: 'message_update', actorId: message.author?.id, messageId: message.id }); } });
  client.on(Events.MessageDelete, message => {
    const prior = recentMessages.get(message.id);
    recentMessages.delete(message.id);
    if (message.author?.bot || (prior && prior.guildId !== message.guildId)) return;
    void capture({ guildId: message.guildId, sourceId: message.channelId, event: 'message_delete', actorId: message.author?.id || prior?.actorId, messageId: message.id, content: message.content || (prior?.until > Date.now() ? prior.content : '') });
  });
  client.on(Events.VoiceStateUpdate, (before, after) => {
    if (before.channelId === after.channelId || before.member?.user?.bot || after.member?.user?.bot) return;
    const guildId = after.guild?.id || before.guild?.id;
    if (before.channelId) void capture({ guildId, sourceId: before.channelId, event: 'voice_leave', actorId: after.id || before.id });
    if (after.channelId) void capture({ guildId, sourceId: after.channelId, event: 'voice_join', actorId: after.id || before.id });
  });
  client.once(Events.ClientReady, () => cached.clear());
  client.on(Events.ShardDisconnect, () => { if (timer) clearTimeout(timer); timer = null; queues.clear(); recentMessages.clear(); });
  return { recordCommand: (guildId, sourceId, actorId, commandName) => capture({ guildId, sourceId, event: 'command', actorId, commandName }) };
}

