import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { customerRoleConfig } from './customer-roles.js';

const CHANNEL_ID = '1550952783631360090';

export function customerLinkPanelPayload(baseUrl = process.env.BASE_URL || 'https://diskoko.com') {
  const url = new URL('/auth/discord?returnTo=%2Faccount.html%23subscription', baseUrl);
  if (url.protocol !== 'https:') throw new Error('Customer link panel requires an HTTPS site URL');
  const embed = new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle('اربط حسابك في ديسكوكو ✨')
    .setDescription('اضغط الزر وسجّل دخولك بحساب الموقع. ستحصل على رتبة العميل تلقائيًا، وإذا كان اشتراكك نشطًا ستصلك رتبة Starter أو Growth أو Business المناسبة له. قد يستغرق التحديث دقيقة.\n\nإذا كنت تستخدم Google في الموقع، سجّل دخولك إلى حسابك أولًا في المتصفح نفسه ثم اضغط الزر.');
  const button = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('ربط الحساب وتحديث الرتبة').setURL(url.toString());
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] };
}

export async function upsertCustomerLinkPanel(client, pool) {
  const { guildId } = customerRoleConfig();
  const channel = await client.channels.fetch(CHANNEL_ID);
  if (!channel || channel.guildId !== guildId || !channel.isTextBased() || !channel.messages) {
    throw new Error('Customer link channel is unavailable to the bot');
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS customer_link_panels (
    guild_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, message_id TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const { rows } = await pool.query('SELECT message_id FROM customer_link_panels WHERE guild_id=$1', [guildId]);
  const payload = customerLinkPanelPayload();
  if (rows[0]?.message_id) {
    try {
      const existing = await channel.messages.fetch(rows[0].message_id);
      await existing.edit(payload);
      return { status: 'updated', messageId: existing.id };
    } catch (error) {
      if (error.code !== 10008) throw error;
    }
  }
  const message = await channel.send(payload);
  await pool.query(`INSERT INTO customer_link_panels(guild_id,channel_id,message_id) VALUES($1,$2,$3)
    ON CONFLICT(guild_id) DO UPDATE SET channel_id=EXCLUDED.channel_id,message_id=EXCLUDED.message_id,updated_at=NOW()`, [guildId, CHANNEL_ID, message.id]);
  return { status: 'created', messageId: message.id };
}

