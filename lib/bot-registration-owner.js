const denied=()=>Object.assign(Error('مالك ربط البوت فقط يستطيع إعادة ربطه أو فصله؛ لا تتغير ملكية مساحة الأكواد بإعادة الربط.'),{status:403,expose:true});
export async function requireBotRegistrationOwner(pool,guildId,botId,ownerId){
  const row=(await pool.query('SELECT owner_id FROM customer_bot_registry WHERE guild_id=$1 AND bot_user_id=$2',[guildId,botId])).rows[0];
  if(row && String(row.owner_id)!==String(ownerId))throw denied();
  return row;
}
export async function saveOwnedBotRegistration(pool,values){
  const result=await pool.query(`INSERT INTO customer_bot_registry(guild_id,bot_user_id,owner_id,bot_name,token_encrypted,retry_at,member_joins,message_content) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT(guild_id,bot_user_id) DO UPDATE SET bot_name=EXCLUDED.bot_name,token_encrypted=EXCLUDED.token_encrypted,retry_at=EXCLUDED.retry_at,member_joins=EXCLUDED.member_joins,message_content=EXCLUDED.message_content,gateway_seen_at=NULL,updated_at=NOW()
    WHERE customer_bot_registry.owner_id=EXCLUDED.owner_id RETURNING updated_at`,values);
  if(!result.rows.length)throw denied();
  return result;
}
