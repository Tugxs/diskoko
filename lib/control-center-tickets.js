import {randomUUID} from 'node:crypto';
import {PermissionFlagsBits as F} from 'discord.js';
import {projectDiscord} from './code-project-discord.js';
export async function openCenterTicket({pool,command:c,settings:s,guild,user,client}){
 if(guild.id!==c.guild_id || client.user.id!==c.bot_user_id)throw Error('مساحة التذكرة لا تطابق البوت والسيرفر.');
 const member=await guild.members.fetch({user,force:true}),source=await guild.channels.fetch(s.ticketChannel),me=await guild.members.fetchMe({force:true}),role=await guild.roles.fetch(s.ticketRole),category=await guild.channels.fetch(s.ticketCategory);
 if(s.blocked?.includes(member.id) || member.roles.cache.some(r=>s.blockedRoles?.includes(r.id)) || !source?.permissionsFor(member)?.has(F.ViewChannel|F.SendMessages))throw Error('لا يمكنك فتح تذكرة في قناة الدعم المحددة.');
 if(!role || role.id===guild.id || !category || category.type!==4 || !category.permissionsFor(me)?.has(F.ViewChannel|F.ManageChannels))throw Error('إعداد التذاكر أو صلاحية إدارة التصنيف غير مكتملة.');
 const scope=[c.id,c.owner_id,c.guild_id,c.bot_user_id],previous=(await pool.query("SELECT channel_id,status FROM control_center_tickets WHERE command_id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_id=$4 AND user_id=$5 AND status IN ('creating','open')",[...scope,user])).rows[0];
 if(previous){if(!previous.channel_id)throw Error('بدأ إنشاء تذكرتك بالفعل؛ راجع الإدارة قبل أي إعادة.');return {channelId:previous.channel_id,reused:true};}
 const count=(await pool.query("SELECT COUNT(*)::int AS count FROM control_center_tickets WHERE command_id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_id=$4 AND status IN ('creating','open')",scope)).rows[0]?.count || 0;if(count>=50)throw Error('وصلت اللوحة إلى 50 تذكرة مفتوحة. أغلق التذاكر المنتهية أولًا.');
 const id=randomUUID(),claimed=(await pool.query("INSERT INTO control_center_tickets(id,command_id,owner_id,guild_id,bot_id,user_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id",[id,...scope,user])).rows[0];if(!claimed)throw Error('بدأ إنشاء تذكرتك بالفعل.');
 const channel=await projectDiscord(client).post('/guilds/'+guild.id+'/channels',{body:{name:'ticket-'+user.slice(-6),type:0,parent_id:category.id,permission_overwrites:[{id:guild.id,type:0,allow:'0',deny:F.ViewChannel.toString()},...[{id:user,type:1},{id:role.id,type:0},{id:me.id,type:1}].map(x=>({...x,allow:(F.ViewChannel|F.SendMessages|F.ReadMessageHistory).toString(),deny:'0'}))]},reason:'Diskoko customer ticket'});
 await pool.query("UPDATE control_center_tickets SET channel_id=$2,status='open' WHERE id=$1 AND command_id=$3 AND owner_id=$4 AND guild_id=$5 AND bot_id=$6",[id,channel.id,...scope]);
 return {channelId:channel.id,reused:false};
}
