export const publicPanelBotId = () => String(process.env.DISCORD_CLIENT_ID || '');
export const isPublicPanelBot = botId => Boolean(publicPanelBotId() && String(botId) === publicPanelBotId());

export async function ensurePublicPanelBotRegistry(pool, guildId, ownerId) {
  const botId = publicPanelBotId();
  if (!botId || !process.env.DISCORD_BOT_TOKEN) throw Object.assign(Error('بوت ديسكوكو غير مهيأ على الخادم الآن.'), { status: 503 });
  await pool.query(`INSERT INTO customer_bot_registry(guild_id,bot_user_id,owner_id,bot_name,label,token_encrypted)
    VALUES($1,$2,$3,'diskoko | ديسكوكو','بوت ديسكوكو','__diskoko_public__')
    ON CONFLICT(guild_id,bot_user_id) DO NOTHING`, [guildId, botId, ownerId]);
  return botId;
}
