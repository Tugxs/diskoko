import {randomUUID,createHash} from 'node:crypto';
import {PermissionFlagsBits as F} from 'discord.js';
import {problem} from './workspace-domain.js';
import {dashboardPermissionSnapshot,effectiveChannelPermissions} from './dashboard-permissions.js';
export const deletionFingerprint=(resource)=>createHash('sha256').update(JSON.stringify(resource)).digest('hex');
export function deletionPermission(snapshot,guild,member,userId,kind,resource){
 if(!resource || kind==='role' && (resource.id===guild.id || resource.managed))throw problem('لا يمكن حذف رتبة النظام أو رتبة تطبيق.');
 const userRoles=member.roles || [],flags=(ids)=>snapshot.roles.filter(r=>r.id===guild.id || ids.includes(r.id)).reduce((n,r)=>n|BigInt(r.permissions || '0'),0n);
 const permission=kind==='role'?F.ManageRoles:F.ManageChannels;
 const userBits=flags(userRoles),botBits=flags(snapshot.botRoles),owner=guild.owner_id===userId;
 if(!owner && !(userBits&F.Administrator) && !(userBits&permission))throw problem('لا تملك صلاحية حذف هذا العنصر في Discord.',403);
 if(!(botBits&F.Administrator) && !(botBits&permission))throw problem('البوت يحتاج صلاحية إدارة هذا العنصر.',409);
 if(kind==='role'){
  const highest=Math.max(0,...snapshot.roles.filter(r=>userRoles.includes(r.id)).map(r=>r.position));
  if(!owner && resource.position>=highest || resource.position>=snapshot.botPosition)throw problem('ارفع رتبة البوت، وتأكد أن رتبتك أعلى من الرتبة المستهدفة.',409);
 }else if(!effectiveChannelPermissions(guild.id,snapshot.roles,resource,snapshot.botRoles,snapshot.bot).permissions.ManageChannels)throw problem('البوت لا يملك إدارة هذه القناة.',409);
}
export async function migrateResourceDeletion(pool){await pool.query(`CREATE TABLE IF NOT EXISTS workspace_resource_deletions(id UUID PRIMARY KEY,owner_id BIGINT NOT NULL REFERENCES users(id),guild_id TEXT NOT NULL,bot_id TEXT NOT NULL,kind TEXT NOT NULL,resource_id TEXT NOT NULL,name TEXT NOT NULL,fingerprint TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'review',error TEXT,expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`);}
export async function deletionDependencies(db,guild,id,kind){
 const channel=kind==='channel';
 const sql=channel?`SELECT (
 (SELECT COUNT(*) FROM scheduled_messages WHERE guild_id=$1 AND channel_id=$2 AND status IN ('scheduled','paused','sending'))+
 (SELECT COUNT(*) FROM diskoko_ticket_panels WHERE guild_id=$1 AND (channel_id=$2 OR category_id=$2))+
 (SELECT COUNT(*) FROM diskoko_welcome_cards WHERE guild_id=$1 AND channel_id=$2 AND NOT disabled)+
 (SELECT COUNT(*) FROM ready_template_module_panels WHERE guild_id=$1 AND (channel_id=$2 OR review_channel_id=$2) AND NOT disabled)+
 (SELECT COUNT(*) FROM diskoko_giveaways WHERE guild_id=$1 AND channel_id=$2 AND status IN ('active','manual_paused','paused'))+
 (SELECT COUNT(*) FROM diskoko_polls WHERE guild_id=$1 AND channel_id=$2 AND NOT disabled)+
 (SELECT COUNT(*) FROM diskoko_event_panels WHERE guild_id=$1 AND channel_id=$2 AND NOT disabled))::int AS count`:
 `SELECT ((SELECT COUNT(*) FROM diskoko_ticket_panels WHERE guild_id=$1 AND staff_role_id=$2)+(SELECT COUNT(*) FROM ready_template_module_panels WHERE guild_id=$1 AND (staff_role_id=$2 OR role_id=$2) AND NOT disabled))::int AS count`;
 return (await db.query(sql,[guild,id])).rows[0]?.count || 0;
}
export function mountResourceDeletion(app,{pool,requireUser,requireWriteAccess,authorizedGuild,discordBotFetch:discord,audit}){
 const base='/api/workspace/:guildId/tools/delete';
 const guard=fn=>async(req,res,next)=>{try{const g=await authorizedGuild(req.user,req.params.guildId);if(!g)throw problem('السيرفر غير متاح.',403);await fn(req,res,g);}catch(e){next(e);}};
 const inspect=async(req,g,kind,id)=>{
  const [snapshot,server,member]=await Promise.all([dashboardPermissionSnapshot(discord,g.id),discord(`/guilds/${g.id}`),discord(`/guilds/${g.id}/members/${req.user.discord_id}`)]);
  if(!server.ok || !member.ok)throw problem('تعذر التحقق من صلاحيات حسابك في Discord.',409);
  const resource=(kind==='role'?snapshot.roles:snapshot.channels).find(r=>r.id===id);
  if(!resource)throw problem('العنصر غير موجود. حدّث البنية.',404);
  deletionPermission(snapshot,server.data,member.data,String(req.user.discord_id),kind,resource);return {snapshot,resource};
 };
 app.post(base+'/review',requireUser,requireWriteAccess,guard(async(req,res,g)=>{
  const {kind,id}=req.body;if(!['role','channel'].includes(kind) || !/^\d{17,20}$/.test(String(id)))throw problem('اختر قناة أو رتبة صالحة.');
  const {snapshot,resource}=await inspect(req,g,kind,id);
  // Never orphan children or silently break scheduled messages.
  const children=kind==='channel'?snapshot.channels.filter(c=>c.parent_id===id):[];
  const refs=await deletionDependencies(pool,g.id,id,kind);
  if(children.length || refs)throw problem(`العنصر مرتبط بـ ${children.length} قنوات و${refs} إعدادات مرتبطة. انقل القنوات وأزل ربط الميزات أو المهام أولًا.`,409);
  const total=(await pool.query("SELECT COUNT(*)::int AS count FROM workspace_resource_deletions WHERE owner_id=$1 AND guild_id=$2 AND status='review' AND expires_at>NOW()",[req.user.id,g.id])).rows[0]?.count || 0;if(total>=20)throw problem('لديك مراجعات حذف كثيرة. انتظر انتهاء صلاحيتها أو استخدم المراجعة الحالية.',409);
  const reviewId=randomUUID();await pool.query("INSERT INTO workspace_resource_deletions(id,owner_id,guild_id,bot_id,kind,resource_id,name,fingerprint,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW()+INTERVAL '10 minutes')",[reviewId,req.user.id,g.id,snapshot.bot,kind,id,resource.name,deletionFingerprint(resource)]);
  await pool.query("DELETE FROM workspace_resource_deletions WHERE owner_id=$1 AND guild_id=$2 AND status='review' AND expires_at<NOW()",[req.user.id,g.id]);
  res.json({id:reviewId,name:resource.name,kind,warning:kind==='channel'?'حذف القناة يحذف رسائلها ولا يمكن استرجاعها من نسخة البنية.':'حذف الرتبة يزيلها من الأعضاء وصلاحيات القنوات.',expiresIn:600});
 }));
 app.post(base+'/:id/apply',requireUser,requireWriteAccess,guard(async(req,res,g)=>{
  if(!/^[0-9a-f-]{36}$/i.test(req.params.id))throw problem('معرّف المراجعة غير صالح.');
  const db=await pool.connect();let locked=false,attempted=false,review;
  try{
   locked=(await db.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',[`diskoko:${g.id}`])).rows[0]?.locked;if(!locked)throw problem('انتظر اكتمال العملية الجارية لهذا السيرفر.',409);
   review=(await db.query('SELECT * FROM workspace_resource_deletions WHERE id=$1 AND owner_id=$2 AND guild_id=$3',[req.params.id,req.user.id,g.id])).rows[0];if(!review)throw problem('المراجعة غير متاحة.',404);
   if(review.status==='succeeded')return res.json({ok:true,alreadyApplied:true});
   if(review.status!=='review' || new Date(review.expires_at).getTime()<Date.now())throw problem('انتهت المراجعة أو بدأ تنفيذها. راجع النتيجة ولا تكرر الطلب.',409);
   if(req.body.confirmed!==true || req.body.name!==review.name)throw problem('اكتب اسم العنصر وأكد الحذف.');
   const {snapshot,resource}=await inspect(req,g,review.kind,review.resource_id);
   if(snapshot.bot!==review.bot_id || deletionFingerprint(resource)!==review.fingerprint)throw problem('تغير العنصر أو بوت التنفيذ بعد المراجعة. أنشئ مراجعة جديدة.',409);
   const active=await deletionDependencies(db,g.id,review.resource_id,review.kind);
   if(active || review.kind==='channel' && snapshot.channels.some(c=>c.parent_id===review.resource_id))throw problem('ظهرت عناصر مرتبطة بعد المراجعة. راجعها قبل الحذف.',409);
   // Persist before Discord. A process crash leaves a reviewable state, never an automatic retry.
   await db.query("UPDATE workspace_resource_deletions SET status='running',updated_at=NOW() WHERE id=$1",[review.id]);attempted=true;
   const response=await discord(review.kind==='role'?`/guilds/${g.id}/roles/${review.resource_id}`:`/channels/${review.resource_id}`,{method:'DELETE'});
   if(!response.ok)throw problem('تعذر تأكيد الحذف. حدّث Discord وراجع النتيجة قبل محاولة جديدة.',409);
   await db.query("UPDATE workspace_resource_deletions SET status='succeeded',updated_at=NOW() WHERE id=$1",[review.id]);attempted=false;
   await audit(req.user.id,'structure.delete','guild',g.id,{resource_id:review.resource_id,kind:review.kind,bot_id:review.bot_id,review_id:review.id});res.json({ok:true});
  }catch(e){if(attempted && review)await db.query("UPDATE workspace_resource_deletions SET status='review_required',error=$2,updated_at=NOW() WHERE id=$1",[review.id,String(e.message).slice(0,500)]).catch(()=>{});throw e;}finally{if(locked)await db.query('SELECT pg_advisory_unlock(hashtext($1))',[`diskoko:${g.id}`]).catch(()=>{});db.release();}
 }));
}
