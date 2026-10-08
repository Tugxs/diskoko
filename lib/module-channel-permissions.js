import { PermissionFlagsBits as P } from 'discord.js';

// Discord order: everyone overwrite, aggregate role overwrites, member overwrite.
export function moduleChannelPermissions(base, guildId, memberId, roleIds, channel) {
  let bits=BigInt(base);
  if(bits & P.Administrator)return bits;
  const rows=channel.permission_overwrites || [];
  const apply=row=>{if(row)bits=(bits & ~BigInt(row.deny || 0)) | BigInt(row.allow || 0);};
  apply(rows.find(row=>String(row.id)===String(guildId) && Number(row.type)===0));
  const roles=new Set(roleIds.map(String));
  let deny=0n,allow=0n;
  for(const row of rows)if(Number(row.type)===0 && String(row.id)!==String(guildId) && roles.has(String(row.id))){deny|=BigInt(row.deny || 0);allow|=BigInt(row.allow || 0);}
  bits=(bits & ~deny) | allow;
  apply(rows.find(row=>String(row.id)===String(memberId) && Number(row.type)===1));
  return bits;
}

export function moduleCanPost(base,guildId,memberId,roleIds,channel) {
  const bits=moduleChannelPermissions(base,guildId,memberId,roleIds,channel);
  const needed=P.ViewChannel | P.SendMessages | P.EmbedLinks | P.ReadMessageHistory;
  return !!(bits & P.Administrator) || (bits & needed)===needed;
}
