import {problem} from './workspace-domain.js';
import {dashboardPermissionSnapshot,effectiveChannelPermissions} from './dashboard-permissions.js';
export async function migratePanelChecks(pool){await pool.query(`CREATE TABLE IF NOT EXISTS workspace_panel_previews(id UUID PRIMARY KEY,owner_id BIGINT NOT NULL REFERENCES users(id),guild_id TEXT NOT NULL,bot_id TEXT NOT NULL,channel_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'publishing',message_id TEXT,error TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`);}
export function mountPanelChecks(app,{pool,requireUser,requireWriteAccess,authorizedGuild,discordBotFetch:discord,audit}){
 const base='/api/workspace/:guildId/tools/panels';
 const guard=fn=>async(req,res,next)=>{try{const guild=await authorizedGuild(req.user,req.params.guildId);if(!guild)throw problem('السيرفر غير متاح.',403);await fn(req,res,guild);}catch(e){next(e);}};
 const source=async(req,guild)=>{
  const id=String(req.params.id);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw problem('معرّف اللوحة غير صالح.');
  const row=(await pool.query(`SELECT r.guild_id,COALESCE(p.publishing_bot_id,r.publishing_bot_id,r.publication_review->>'botId') AS bot_id,COALESCE(p.channel_id,r.interactive_channel_id,r.sent_channel_id) AS channel_id,COALESCE(p.message_id,r.interactive_message_id,r.sent_message_id) AS message_id FROM ai_requests r LEFT JOIN standalone_module_installs s ON s.source_request_id=r.id AND s.edit_install_id IS NULL LEFT JOIN ready_template_module_panels p ON p.standalone_install_id=s.id WHERE r.id=$1 AND r.user_id=$2 AND r.guild_id=$3
   UNION ALL SELECT p.guild_id,p.publishing_bot_id,p.channel_id,p.message_id FROM standalone_module_installs s JOIN ready_template_module_panels p ON p.standalone_install_id=s.id WHERE s.id=$1 AND s.user_id=$2 AND s.guild_id=$3`,[id,req.user.id,guild.id])).rows[0];
  if(!row?.channel_id || !row.message_id)throw problem('هذه اللوحة لا تملك رسالة منشورة قابلة للفحص.',409);
  const snapshot=await dashboardPermissionSnapshot(discord,guild.id);if(row.bot_id && row.bot_id!==snapshot.bot && row.bot_id!=='public')throw problem('اختر البوت الذي نشر هذه اللوحة.',409);
  const channel=snapshot.channels.find(c=>c.id===row.channel_id);if(!channel)throw problem('قناة اللوحة حُذفت. اختر قناة جديدة من محرر اللوحة.',409);
  const message=await discord(`/channels/${row.channel_id}/messages/${row.message_id}`);if(!message.ok || message.data.author?.id!==snapshot.bot)throw problem('رسالة اللوحة غير موجودة أو لا يمكن للبوت قراءتها. راجع القناة وصلاحية قراءة سجل الرسائل.',409);
  return {row,snapshot,message:message.data};
 };
 app.get(base+'/:id/health',requireUser,guard(async(req,res,g)=>{const {row,snapshot,message}=await source(req,g);const ids=[...new Set(JSON.stringify({content:message.content,embeds:message.embeds}).match(/(?<=<#)\d{17,20}(?=>)/g) || [])],missing=ids.filter(id=>!snapshot.channels.some(c=>c.id===id));res.json({checkedAt:new Date().toISOString(),messageExists:true,botId:snapshot.bot,channelId:row.channel_id,missingChannels:missing,images:(message.embeds || []).flatMap(e=>[e.image?.url,e.thumbnail?.url,e.author?.icon_url,e.footer?.icon_url].filter(Boolean)),limited:true});}));
 app.post(base+'/:id/preview',requireUser,requireWriteAccess,guard(async(req,res,g)=>{
  if(req.body.confirmed!==true)throw problem('اختر قناة تجربة خاصة وأكد إرسال معاينة الشكل.');
  const nonce=String(req.body.nonce || '');if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nonce))throw problem('معرّف التجربة غير صالح.');
  const {snapshot,message}=await source(req,g),channel=snapshot.channels.find(c=>c.id===String(req.body.channelId));
  if(!channel || ![0,5].includes(channel.type) || effectiveChannelPermissions(g.id,snapshot.roles,channel).permissions.ViewChannel)throw problem('اختر قناة نصية مخفية عن رتبة @everyone للتجربة.');
  const access=effectiveChannelPermissions(g.id,snapshot.roles,channel,snapshot.botRoles,snapshot.bot).permissions;if(!access.ViewChannel || !access.SendMessages || !access.EmbedLinks)throw problem('البوت يحتاج عرض قناة التجربة وإرسال الرسائل والروابط المضمنة.');
  const db=await pool.connect();let started=false;
  try{await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`preview:${req.user.id}:${g.id}`]);const old=(await db.query('SELECT * FROM workspace_panel_previews WHERE id=$1',[nonce])).rows[0];if(old){if(old.owner_id!=req.user.id || old.guild_id!==g.id)throw problem('معرّف التجربة مستخدم.',409);if(old.status!=='sent')throw problem('نتيجة هذه التجربة تحتاج مراجعة؛ لن يُكرر الإرسال.',409);await db.query('COMMIT');return res.json({ok:true,messageId:old.message_id,alreadySent:true});}
   const count=(await db.query("SELECT COUNT(*)::int AS count FROM workspace_panel_previews WHERE owner_id=$1 AND created_at>=NOW()-INTERVAL '1 day'",[req.user.id])).rows[0]?.count || 0;if(count>=30)throw problem('وصلت إلى 30 معاينة شكل خلال يوم.');
   await db.query('INSERT INTO workspace_panel_previews(id,owner_id,guild_id,bot_id,channel_id) VALUES($1,$2,$3,$4,$5)',[nonce,req.user.id,g.id,snapshot.bot,channel.id]);await db.query('COMMIT');started=true;
   if((message.flags || 0)&32768)throw problem('هذا النوع من لوحات Discord لا يدعم معاينة الشكل الحالية. استخدم المعاينة في المحرر.');
   const embeds=(message.embeds || []).map(e=>{const {type,provider,video,...embed}=e;return embed;});
   const components=(message.components || []).map(row=>({type:1,components:(row.components || []).map(c=>({...c,disabled:true}))}));
   const result=await discord(`/channels/${channel.id}/messages`,{method:'POST',body:JSON.stringify({content:message.content || '',embeds,components,allowed_mentions:{parse:[]},nonce:nonce.replaceAll('-','').slice(0,25),enforce_nonce:true})});
   if(!result.ok)throw problem('تعذر تأكيد إرسال المعاينة. راجع قناة التجربة قبل إنشاء تجربة أخرى.',409);
   await db.query("UPDATE workspace_panel_previews SET status='sent',message_id=$2 WHERE id=$1",[nonce,result.data.id]);started=false;await audit(req.user.id,'panel.preview','guild',g.id,{channel_id:channel.id,message_id:result.data.id,bot_id:snapshot.bot,preview_id:nonce});res.json({ok:true,messageId:result.data.id});
  }catch(e){await db.query('ROLLBACK').catch(()=>{});if(started)await db.query("UPDATE workspace_panel_previews SET status='review_required',error=$2 WHERE id=$1",[nonce,String(e.message).slice(0,500)]).catch(()=>{});throw e;}finally{db.release();}
 }));
}
