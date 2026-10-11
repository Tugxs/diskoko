import {PermissionFlagsBits as P} from 'discord.js';
import crypto from 'node:crypto';
export const giveawayManagementControls=id=>[{type:1,components:[{type:2,style:2,label:'إدارة السحب / Manage giveaway',custom_id:`diskoko:giveaway-manage:${id}`}]}];
export async function handleGiveawayManagement(interaction,pool){
  if(!interaction.customId?.startsWith('diskoko:giveaway-manage') && !interaction.customId?.startsWith('diskoko:giveaway-action'))return false;
  const [,kind,id]=interaction.customId.split(':');if(!interaction.guildId || !/^[0-9a-f-]{36}$/i.test(id || ''))return false;
  const giveaway=(await pool.query('SELECT * FROM diskoko_giveaways WHERE id=$1',[id])).rows[0];
  if(!giveaway || giveaway.guild_id!==interaction.guildId || giveaway.channel_id!==interaction.channelId || (giveaway.publishing_bot_id && giveaway.publishing_bot_id!==interaction.client.user.id) || interaction.message?.author?.id!==interaction.client.user.id || !interaction.memberPermissions?.has(P.ManageGuild)){await interaction.reply({content:'إدارة السحب لمدير السيرفر وبوت اللوحة فقط / Server manager and panel bot only',ephemeral:true});return true;}
  if(kind==='giveaway-manage'){
    if(giveaway.message_id!==interaction.message.id){await interaction.reply({content:'افتح الإدارة من لوحة السحب / Open from giveaway panel',ephemeral:true});return true;}
    await interaction.reply({content:'اختر إجراءً. إنهاء السحب أو إعادة السحب يغيّر النتائج بعد تأكيدك / Choose an action; ending or rerolling changes results after confirmation',ephemeral:true,components:[{type:1,components:[{type:3,custom_id:`diskoko:giveaway-action:${id}`,options:[{label:'إيقاف مؤقت / Pause',value:'pause'},{label:'استئناف / Resume',value:'resume'},{label:'إنهاء الآن / End now',value:'end'},{label:'إعادة السحب مع استبعاد الفائزين / Reroll excluding winners',value:'reroll'}]}]}]});return true;
  }
  const action=interaction.values?.[0];if(!['pause','resume','end','reroll'].includes(action)){await interaction.reply({content:'إجراء غير صالح / Invalid action',ephemeral:true});return true;}
  await interaction.deferReply({ephemeral:true});const client=await pool.connect();let result;
  try{await client.query('BEGIN');const current=(await client.query('SELECT * FROM diskoko_giveaways WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(action==='pause' && current.status==='active'){result=await client.query("UPDATE diskoko_giveaways SET status='manual_paused',remaining_seconds=GREATEST(1,EXTRACT(EPOCH FROM (ends_at-NOW()))::int) WHERE id=$1 RETURNING id",[id]);}
    else if(action==='resume' && current.status==='manual_paused'){result=await client.query("UPDATE diskoko_giveaways SET status='active',ends_at=NOW()+(remaining_seconds * INTERVAL '1 second'),remaining_seconds=NULL WHERE id=$1 RETURNING id",[id]);}
    else if(action==='end' && current.status==='active'){result=await client.query('UPDATE diskoko_giveaways SET ends_at=NOW() WHERE id=$1 RETURNING id',[id]);}
    else if(action==='reroll' && current.status==='ended' && current.announced_at){const previous=new Set([...(current.winners || []),...(current.previous_winners || [])]);const entrants=(await client.query('SELECT user_id FROM diskoko_giveaway_entries WHERE giveaway_id=$1',[id])).rows.map(row=>row.user_id).filter(user=>!previous.has(user));if(!entrants.length){await client.query('ROLLBACK');await interaction.editReply('لا يوجد مشاركون مؤهلون لم يفوزوا / No remaining eligible entrants');return true;}const winners=[];while(entrants.length && winners.length<current.winner_count)winners.push(entrants.splice(crypto.randomInt(entrants.length),1)[0]);result=await client.query("UPDATE diskoko_giveaways SET winners=$2::jsonb,previous_winners=$3::jsonb,announced_at=NULL,failure_count=0,next_retry_at=NULL,last_error=NULL WHERE id=$1 RETURNING id",[id,JSON.stringify(winners),JSON.stringify([...previous])]);}
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  await interaction.editReply(result?.rowCount?'حُفظ الإجراء؛ تحديث نتيجة السحب يمر بالعامل المجدول / Action saved; results update through the scheduled runner':'الإجراء غير مناسب لحالة السحب الحالية / Action unavailable in current state');return true;
}
