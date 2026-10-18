import {normalizeAdminPanel} from '../admin-panel-template.js';
import {randomUUID,createHash} from 'node:crypto';
import {PermissionFlagsBits as F,GatewayIntentBits} from 'discord.js';
import {projectLedger} from './code-project-ledger.js';
import {createCenterEngine} from './control-center-engine.js';
import {migrateControlCenter} from './control-center-store.js';
import {centerHome} from '../control-center-view.js';
import {normalizeCodeOutput} from './code-command-sandbox.js';
const fingerprint=r=>createHash('sha256').update(JSON.stringify([r.id,r.name,r.type ?? null,r.topic ?? null,r.color ?? 0,r.position ?? 0,r.permissions?.bitfield?.toString() || '',r.managed===true])).digest('hex');
const fail=m=>{throw Error(m);};
export async function migrateAdminPanel(pool){await pool.query(`
 CREATE TABLE IF NOT EXISTS admin_panel_reviews(id UUID PRIMARY KEY,command_id UUID NOT NULL REFERENCES code_commands(id) ON DELETE CASCADE,owner_id BIGINT NOT NULL REFERENCES users(id),guild_id TEXT NOT NULL,bot_id TEXT NOT NULL,discord_user_id TEXT NOT NULL,revision INT NOT NULL,operation JSONB NOT NULL,fingerprint TEXT,status TEXT NOT NULL DEFAULT 'pending',resource_id TEXT,error TEXT,expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '10 minutes',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 ALTER TABLE admin_panel_reviews ADD COLUMN IF NOT EXISTS interaction_id TEXT;
 CREATE TABLE IF NOT EXISTS admin_reply_sessions(id UUID PRIMARY KEY,command_id UUID NOT NULL REFERENCES code_commands(id) ON DELETE CASCADE,owner_id BIGINT NOT NULL REFERENCES users(id),guild_id TEXT NOT NULL,bot_id TEXT NOT NULL,discord_user_id TEXT NOT NULL,channel_id TEXT NOT NULL,message_id TEXT NOT NULL,revision INT NOT NULL,expires_at TIMESTAMPTZ NOT NULL,stopped BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE INDEX IF NOT EXISTS admin_reviews_owner ON admin_panel_reviews(owner_id,guild_id,bot_id,created_at);
 CREATE INDEX IF NOT EXISTS admin_reply_lookup ON admin_reply_sessions(guild_id,bot_id,discord_user_id,channel_id,message_id);
 CREATE TABLE IF NOT EXISTS admin_ai_questions(id UUID PRIMARY KEY,session_id UUID NOT NULL REFERENCES admin_reply_sessions(id) ON DELETE CASCADE,owner_id BIGINT NOT NULL,guild_id TEXT NOT NULL,bot_id TEXT NOT NULL,discord_user_id TEXT NOT NULL,channel_id TEXT NOT NULL,source_message_id TEXT UNIQUE NOT NULL,prompt TEXT NOT NULL,facts JSONB NOT NULL,status TEXT NOT NULL DEFAULT 'pending',answer TEXT,error TEXT,reply_message_id TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),claimed_at TIMESTAMPTZ,completed_at TIMESTAMPTZ);
 ALTER TABLE admin_ai_questions ADD COLUMN IF NOT EXISTS claim_token UUID;
 ALTER TABLE admin_reply_sessions ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'reply';
 CREATE TABLE IF NOT EXISTS admin_ai_worker(id INT PRIMARY KEY CHECK(id=1),seen_at TIMESTAMPTZ NOT NULL);
 CREATE TABLE IF NOT EXISTS admin_panel_messages(command_id UUID NOT NULL REFERENCES code_commands(id) ON DELETE CASCADE,owner_id BIGINT NOT NULL,guild_id TEXT NOT NULL,bot_id TEXT NOT NULL,channel_id TEXT NOT NULL,message_id TEXT,status TEXT NOT NULL DEFAULT 'pending',revision INT NOT NULL,PRIMARY KEY(command_id,channel_id));
 CREATE INDEX IF NOT EXISTS admin_questions_queue ON admin_ai_questions(status,created_at);
 `);await migrateControlCenter(pool);}
export async function adminAuthority(interaction,command){
 const guild=interaction?.guild;if(!guild || guild.id!==command.guild_id || guild.client.user?.id!==command.bot_user_id)fail('السيرفر أو البوت لا يطابق مساحة الأمر.');
 await guild.fetch();
 await guild.roles.fetch();
 const actor=await guild.members.fetch({user:interaction.user.id,force:true});
 const manager=actor.id===guild.ownerId || actor.permissions.has(F.ManageGuild);return {manager,actor,guild};
}
export async function adminOverview(guild){
 const fresh=await guild.fetch(),channels=await guild.channels.fetch(),roles=await guild.roles.fetch();
 return {id:guild.id,name:fresh.name,members:fresh.memberCount,channels:channels.size,roles:roles.size,boosts:fresh.premiumSubscriptionCount || 0,boostLevel:fresh.premiumTier || 0,iconUrl:fresh.iconURL?.({extension:fresh.icon?.startsWith('a_')?'gif':'webp'}) || ''};
}
export function createAdminApi({project,client,pool,command,interaction,preview,rest,external,memory}){
 const fixture={name:'سيرفر المعاينة',members:128,channels:12,roles:8,boosts:4,boostLevel:1,id:'100000000000000001'};
 const authority=async()=>{if(preview)return {manager:project.preview?.admin?.manager!==false};const current=await adminAuthority(interaction,command);if(!current.manager)fail('تحتاج صلاحية إدارة السيرفر لاستخدام لوحة الإدارة.');return current;};
 const privateChannel=async(channelId=interaction.channelId)=>{const c=await interaction.guild.channels.fetch(channelId,{force:true});if(!c || c.guildId!==command.guild_id || c.permissionsFor(command.guild_id)?.has(F.ViewChannel))fail('وضع الرد والسجلات يحتاجان قناة خاصة مخفية عن @everyone.');return c;};
 const resource=async(kind,id)=>kind==='role'?interaction.guild.roles.fetch(id,{force:true}):interaction.guild.channels.fetch(id,{force:true});
 const check=async(op,current)=>{const flag=op.kind==='role'?F.ManageRoles:F.ManageChannels;
  if(current.actor.id!==current.guild.ownerId && !current.actor.permissions.has(flag))fail('لا تملك صلاحية تعديل هذا العنصر.');
  const bot=await current.guild.members.fetchMe({force:true});if(!bot.permissions.has(flag))fail('البوت يحتاج صلاحية إدارة القنوات أو الرتب.');
  if(op.action==='update'){const r=await resource(op.kind,op.id);if(!r || (op.kind==='role'?r.guild.id:r.guildId)!==command.guild_id)fail('العنصر غير موجود في هذا السيرفر.');
   if(op.kind==='role' && (r.managed || r.id===command.guild_id || r.position>=bot.roles.highest.position || current.actor.id!==current.guild.ownerId && r.position>=current.actor.roles.highest.position))fail('الرتبة محمية أو أعلى من رتبة البوت أو رتبتك.');
   if(op.kind==='channel' && (!r.permissionsFor(current.actor)?.has(F.ViewChannel|F.ManageChannels) || !r.permissionsFor(bot)?.has(F.ViewChannel|F.ManageChannels)))fail('صلاحيات إدارة هذه القناة غير كافية.');return r;}
  return null;
 };
 const call=async(method,args,signal)=>{
  if(!project.permissions.includes('admin'))fail('صلاحية admin غير معلنة في المشروع.');
  if(method==='admin.center'){
   const ownerId=preview?null:(await client.query('SELECT discord_id FROM users WHERE id=$1',[command.owner_id])).rows[0]?.discord_id;
   return createCenterEngine({client,pool,command,interaction,preview,memory,rest,external,authority,overview:adminOverview,enforceTeam:enforceAdminTeam,adminCall:call,ownerId})({...args,design:normalizeAdminPanel(args.design)},signal);
  }
  if(method==='admin.authority'){if(preview)return {manager:project.preview?.admin?.manager!==false,preview:true};const a=await adminAuthority(interaction,command);return {manager:a.manager};}
  const current=await authority();
  if(method==='admin.overview')return preview?fixture:adminOverview(current.guild);
  if(method==='admin.resources'){
   if(!['channels','roles'].includes(args.kind))fail('اختر قنوات أو رتب.');
   const page=args.page ?? 0;if(!Number.isInteger(page) || page<0 || page>19)fail('رقم الصفحة غير صالح.');
   if(preview)return page?[]:args.kind==='channels'?[{id:'100000000000000002',name:'general',editable:true}]:[{id:'100000000000000003',name:'Member',editable:true}];
   if(!command.ephemeral)await privateChannel();
   const values=args.kind==='channels'?await current.guild.channels.fetch():await current.guild.roles.fetch(),bot=await current.guild.members.fetchMe({force:true});
   return [...values.values()].filter(r=>r && (args.kind!=='channels' || r.permissionsFor(current.actor)?.has(F.ViewChannel))).sort((a,b)=>(a.position || 0)-(b.position || 0)).slice(page*25,(page+1)*25).map(r=>({id:r.id,name:r.name,editable:args.kind==='channels'?[0,2,4,15].includes(r.type) && r.permissionsFor(current.actor)?.has(F.ManageChannels) && r.permissionsFor(bot)?.has(F.ManageChannels):!r.managed && r.id!==command.guild_id && r.position<bot.roles.highest.position && current.actor.permissions.has(F.ManageRoles) && bot.permissions.has(F.ManageRoles) && (current.actor.id===current.guild.ownerId || r.position<current.actor.roles.highest.position)}));
  }
  if(method==='admin.logs'){
   if(preview)return [{at:'Preview',action:'إضافة قناة',status:'محاكاة فقط'}];if(!command.ephemeral)await privateChannel();
   const entries=(await client.query('SELECT operation,status,created_at FROM admin_panel_reviews WHERE owner_id=$1 AND guild_id=$2 AND bot_id=$3 ORDER BY created_at DESC LIMIT 10',[command.owner_id,command.guild_id,command.bot_user_id])).rows.map(r=>({at:new Date(r.created_at).toISOString(),action:'لوحة الإدارة: '+r.operation.action+' '+r.operation.kind+' '+r.operation.name,status:r.status}));
   const bot=await current.guild.members.fetchMe({force:true});
   if(current.actor.permissions.has(F.ViewAuditLog) && bot.permissions.has(F.ViewAuditLog)){const audit=await current.guild.fetchAuditLogs({limit:10});for(const entry of audit.entries.values())entries.push({at:new Date(entry.createdTimestamp).toISOString(),action:'Discord: '+entry.action+' · '+String(entry.target?.name || entry.targetId || '').slice(0,100),status:'المشرف: '+String(entry.executor?.username || entry.executorId || 'غير متاح').slice(0,80)});}
   return entries.sort((a,b)=>b.at.localeCompare(a.at)).slice(0,20);
  }
  if(method==='admin.review'){
   const op=args.operation;if(!op || Object.keys(op).some(k=>!['kind','action','id','name','topic','color','type'].includes(k)) || !['role','channel'].includes(op.kind) || !['create','update'].includes(op.action))fail('التغيير غير مدعوم.');
   if(typeof op.name!=='string' || !op.name.trim() || op.name.length>100 || op.name==='@everyone')fail('اكتب اسمًا صالحًا حتى 100 حرف.');
   const operation={kind:op.kind,action:op.action,name:op.name.trim()};if(op.action==='update'){if(!/^\d{17,20}$/.test(op.id))fail('معرّف العنصر غير صالح.');operation.id=op.id;}
   if(op.kind==='role'){if(!/^#[0-9a-f]{6}$/i.test(op.color || ''))fail('لون الرتبة يجب أن يكون HEX مثل #9d7bea.');operation.color=parseInt(op.color.slice(1),16);}
   else{operation.topic=String(op.topic || '').slice(0,1024);operation.type=op.type ?? 0;if(![0,2,4].includes(operation.type))fail('نوع القناة غير مدعوم.');}
   if(!preview)await enforceAdminTeam(client,current);const old=preview?null:await check(operation,current);if(old && op.kind==='channel' && ![0,2,4,15].includes(old.type))fail('نوع هذه القناة غير مدعوم في لوحة الإدارة.');if(old && op.kind==='channel' && ![0,15].includes(old.type) && operation.topic)fail('الوصف النصي غير متاح لهذا النوع من القنوات.');const id=randomUUID();
   if(preview){memory['$adminReviews'] ??={};memory['$adminReviews'][id]=operation;}
   else {const total=(await client.query("SELECT COUNT(*)::int AS total FROM admin_panel_reviews WHERE owner_id=$1 AND created_at>NOW()-INTERVAL '1 day'",[command.owner_id])).rows[0]?.total || 0;if(total>=100)fail('وصل الحساب إلى 100 مراجعة إدارية خلال يوم.');await client.query('INSERT INTO admin_panel_reviews(id,command_id,owner_id,guild_id,bot_id,discord_user_id,revision,operation,fingerprint,interaction_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,command.id,command.owner_id,command.guild_id,command.bot_user_id,interaction.user.id,command.active_revision,operation,old?fingerprint(old):null,interaction.id]);}
   return {id,summary:(operation.action==='create'?'إضافة':'تعديل')+' '+(op.kind==='role'?'رتبة':'قناة')+' «'+operation.name+'». '+(op.kind==='role'?'لا يمنح صلاحيات إدارية.':'القناة الجديدة تتبع صلاحيات السيرفر الافتراضية.')+' أكد التنفيذ أو ألغِ المراجعة.'};
  }
  if(method==='admin.apply'){
   if(preview){const op=memory['$adminReviews']?.[args.reviewId];if(!op)fail('المراجعة غير موجودة.');delete memory['$adminReviews'][args.reviewId];return {message:'محاكاة فقط: '+op.name};}
   if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(String(args.reviewId)))fail('معرّف المراجعة غير صالح.');const review=(await client.query('SELECT * FROM admin_panel_reviews WHERE id=$1 AND command_id=$2 AND owner_id=$3 AND guild_id=$4 AND bot_id=$5 AND discord_user_id=$6 AND revision=$7',[args.reviewId,command.id,command.owner_id,command.guild_id,command.bot_user_id,interaction.user.id,command.active_revision])).rows[0];
   if(!review || review.status!=='pending' || new Date(review.expires_at)<new Date())fail('انتهت المراجعة أو بدأ تنفيذها؛ لا تكرر الطلب.');
   if(!interaction.isButton?.() || !interaction.customId?.endsWith(':confirm') || review.interaction_id===interaction.id)fail('أكد التغيير من زر أؤكد التنفيذ بعد عرض المراجعة.');
   const old=await check(review.operation,current);if(old && fingerprint(old)!==review.fingerprint)fail('تغير العنصر بعد المراجعة. جهّز مراجعة جديدة.');
   return external(method,async()=>{const db=await projectLedger(pool).connect();let locked=false,attempted=false;
    try{locked=(await db.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',[`diskoko:${command.guild_id}`])).rows[0]?.locked;if(!locked)fail('انتظر اكتمال العملية الجارية في السيرفر.');
     const freshAuthority=await authority();await enforceAdminTeam(db,freshAuthority);const latest=await check(review.operation,freshAuthority);if(latest && fingerprint(latest)!==review.fingerprint)fail('تغير العنصر بعد المراجعة.');
     const claimed=(await db.query("UPDATE admin_panel_reviews SET status='running',updated_at=NOW() WHERE id=$1 AND status='pending' RETURNING id",[review.id])).rows;if(!claimed.length)fail('المراجعة نُفذت أو بدأت بالفعل.');attempted=true;
     const op=review.operation,base=op.kind==='role'?'/guilds/'+command.guild_id+'/roles':'/channels',path=op.action==='create'?(op.kind==='role'?base:'/guilds/'+command.guild_id+'/channels'):base+'/'+op.id;
     const body={name:op.name,...(op.kind==='role'?{color:op.color,...(op.action==='create'?{permissions:'0'}:{})}:op.action==='create'?{type:op.type,...(op.type===0?{topic:op.topic}:{})}:([0,15].includes(latest?.type)?{topic:op.topic}:{}))};
     let result;
     if(op.action==='create'){const list=op.kind==='role'?await current.guild.roles.fetch():await current.guild.channels.fetch();if([...list.values()].some(r=>r && r.name===op.name && (op.kind==='role'?!r.managed:r.type===op.type)))fail('يوجد عنصر بهذا الاسم. عدّله بدل تكراره.');result=await rest().post(path,{signal,body,reason:'Diskoko reviewed administration'});}else result=await rest().patch(path,{signal,body,reason:'Diskoko reviewed administration'});
     await db.query("UPDATE admin_panel_reviews SET status='succeeded',resource_id=$2,updated_at=NOW() WHERE id=$1",[review.id,result.id]);attempted=false;return {message:'تم تطبيق التغيير: '+result.name};
    }catch(e){if(attempted)await db.query("UPDATE admin_panel_reviews SET status='review_required',error=$2,updated_at=NOW() WHERE id=$1",[review.id,String(e.message).slice(0,500)]).catch(()=>{});throw e;}finally{if(locked)await db.query('SELECT pg_advisory_unlock(hashtext($1))',[`diskoko:${command.guild_id}`]).catch(()=>{});db.release();}
   },signal);
  }
  if(method==='admin.publish'){
   if(!/^\d{17,20}$/.test(String(args.channelId)))fail('اختر قناة صالحة.');const design=normalizeAdminPanel(args.design || {});
   if(preview)return {preview:true,messageId:'preview-panel'};
   const channel=await current.guild.channels.fetch(args.channelId,{force:true}),bot=await current.guild.members.fetchMe({force:true});const flags=F.ViewChannel|F.SendMessages|F.EmbedLinks;
   if(!channel || channel.guildId!==command.guild_id || !channel.isTextBased() || channel.isThread?.() || channel.permissionsFor(command.guild_id)?.has(F.ViewChannel) || !channel.permissionsFor(current.actor)?.has(flags) || !channel.permissionsFor(bot)?.has(flags))fail('اختر قناة خاصة بالمشرفين يملك فيها حسابك والبوت العرض والإرسال وتضمين الروابط.');
   await enforceAdminTeam(client,current,['panels','commands']);
   let payload={embeds:[{title:design.title,description:design.description+'\nافتح لوحة الإدارة للاطلاع على معلومات السيرفر وتعديل القنوات والرتب.',color:parseInt(design.color.slice(1),16),...(design.logoUrl?{author:{name:design.title,icon_url:design.logoUrl}}:{}),...(design.bannerUrl?{image:{url:design.bannerUrl}}:{})}],components:[{type:1,components:[{type:2,style:design.buttonStyle,label:'فتح لوحة الإدارة',custom_id:'diskoko-admin:'+command.id}]}],allowed_mentions:{parse:[]}};
   if(project.files?.['control-center-view.js']){const home=normalizeCodeOutput(centerHome(design,{},await adminOverview(current.guild))).message,groups=new Map();for(const c of home.controls){if(!groups.has(c.row))groups.set(c.row,[]);groups.get(c.row).push(c.type==='select'?{type:3,custom_id:'diskoko-admin:'+command.id+':'+c.action,placeholder:c.placeholder,options:c.options}:{type:2,style:c.type==='link'?5:c.style,label:c.label,...(c.type==='link'?{url:c.url}:{custom_id:'diskoko-admin:'+command.id+':'+c.action})});}payload={embeds:home.embeds,components:[...groups.values()].map(components=>({type:1,components})),allowed_mentions:{parse:[]}};}
   return external(method,async()=>{const ledger=projectLedger(pool);const claimed=(await ledger.query("INSERT INTO admin_panel_messages(command_id,owner_id,guild_id,bot_id,channel_id,revision,status) VALUES($1,$2,$3,$4,$5,$6,'sending') ON CONFLICT(command_id,channel_id) DO NOTHING RETURNING command_id",[command.id,command.owner_id,command.guild_id,command.bot_user_id,channel.id,command.active_revision])).rows;
    if(!claimed.length){const existing=(await ledger.query('SELECT * FROM admin_panel_messages WHERE command_id=$1 AND channel_id=$2',[command.id,channel.id])).rows[0];if(existing?.status==='published'){if(existing.revision!==command.active_revision){await rest().patch('/channels/'+channel.id+'/messages/'+existing.message_id,{signal,body:payload});await ledger.query('UPDATE admin_panel_messages SET revision=$3 WHERE command_id=$1 AND channel_id=$2',[command.id,channel.id,command.active_revision]);}return {messageId:existing.message_id};}fail('النشر بدأ أو يحتاج مراجعة. لا تكرر إرسال اللوحة.');}
    try{const sent=await rest().post('/channels/'+channel.id+'/messages',{signal,body:payload});await ledger.query("UPDATE admin_panel_messages SET status='published',message_id=$3 WHERE command_id=$1 AND channel_id=$2",[command.id,channel.id,sent.id]);return {messageId:sent.id};}catch(error){await ledger.query("UPDATE admin_panel_messages SET status='review_required' WHERE command_id=$1 AND channel_id=$2",[command.id,channel.id]);throw error;}
   },signal);
  }
  if(method==='admin.reply.stop'){if(!preview)await client.query('UPDATE admin_reply_sessions SET stopped=TRUE WHERE command_id=$1 AND guild_id=$2 AND bot_id=$3 AND discord_user_id=$4',[command.id,command.guild_id,command.bot_user_id,interaction.user.id]);return true;}
  if(method==='admin.reply.start'){
   if(args.mode && !['reply','oracle'].includes(args.mode))fail('وضع مساعد غير صالح.');
   if(![5,15,30,60,'permanent'].includes(args.minutes))fail('مدة وضع الرد من 5 إلى 60 دقيقة.');if(preview)return {minutes:args.minutes,permanent:args.minutes==='permanent',preview:true};if(!interaction.client.options.intents.has(GatewayIntentBits.MessageContent))fail('وضع الرد يحتاج Message Content Intent. فعّله للبوت من إعدادات التطبيق وأعد الاتصال.');if(!(await client.query("SELECT seen_at>NOW()-INTERVAL '10 minutes' AS ready FROM admin_ai_worker WHERE id=1")).rows[0]?.ready)fail('عامل مساعد الإدارة غير متصل حاليًا. بقية وظائف اللوحة تعمل.');if(args.channelId && !/^\d{17,20}$/.test(args.channelId))fail('اختر قناة صالحة.');const channel=await privateChannel(args.channelId || interaction.channelId);if(!channel.permissionsFor(current.actor)?.has(F.ViewChannel|F.SendMessages|F.ReadMessageHistory))fail('تحتاج عرض القناة وإرسال الرسائل وقراءة سجلها.');const bot=await current.guild.members.fetchMe({force:true});if(!channel.permissionsFor(bot)?.has(F.ViewChannel|F.SendMessages|F.ReadMessageHistory))fail('البوت يحتاج عرض القناة وإرسال الرسائل وقراءة السجل.');
   const active=(await client.query('SELECT id,message_id FROM admin_reply_sessions WHERE command_id=$1 AND guild_id=$2 AND bot_id=$3 AND discord_user_id=$4 AND channel_id=$5 AND revision=$6 AND NOT stopped AND expires_at>NOW() ORDER BY created_at DESC LIMIT 1',[command.id,command.guild_id,command.bot_user_id,interaction.user.id,channel.id,command.active_revision])).rows[0];
   if(active){let existing;try{existing=await channel.messages.fetch(active.message_id);}catch(error){if(Number(error.code)!==10008)fail('تعذر فحص رسالة المساعد الحالية. لن نرسل رسالة مكررة؛ تحقق من الاتصال أولًا.');}if(existing && existing.author.id!==command.bot_user_id)fail('رسالة المساعد لا تطابق البوت. راجع السجل.');if(existing?.author.id===command.bot_user_id){await client.query("UPDATE admin_reply_sessions SET expires_at=NOW()+($2::int*INTERVAL '1 minute') WHERE id=$1",[active.id,args.minutes==='permanent'?52560000:args.minutes]);return {minutes:args.minutes,permanent:args.minutes==='permanent',messageId:active.message_id};}await client.query('UPDATE admin_reply_sessions SET stopped=TRUE WHERE id=$1',[active.id]);}
   return external(method,async()=>{const sent=await rest().post('/channels/'+channel.id+'/messages',{signal,body:{content:'مساعد الإدارة مفعّل لهذا المشرف '+(args.minutes==='permanent'?'باستمرار حتى إيقافه':'لمدة '+args.minutes+' دقيقة')+'. رد على هذه الرسالة لطلب معلومات السيرفر. اكتب «إيقاف المساعد» لإنهاء الوضع. طلبات التغيير تُراجع من لوحة الإدارة.',allowed_mentions:{parse:[]}}});await projectLedger(pool).query('UPDATE admin_reply_sessions SET stopped=TRUE WHERE command_id=$1 AND discord_user_id=$2',[command.id,interaction.user.id]);await projectLedger(pool).query("INSERT INTO admin_reply_sessions(id,command_id,owner_id,guild_id,bot_id,discord_user_id,channel_id,message_id,revision,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()+($10::int*INTERVAL '1 minute'))",[randomUUID(),command.id,command.owner_id,command.guild_id,command.bot_user_id,interaction.user.id,channel.id,sent.id,command.active_revision,args.minutes==='permanent'?52560000:args.minutes]);return {minutes:args.minutes,permanent:args.minutes==='permanent',messageId:sent.id};},signal);
  }
  fail('طلب إدارة غير مدعوم.');
 };
 return call;
}

export async function enforceAdminTeam(db,current,tools=['builder']){if(current.actor.id===current.guild.ownerId)return;const policy=(await db.query('SELECT owner_discord_id,members FROM workspace_team_policies WHERE guild_id=$1',[current.guild.id])).rows[0];if(!policy || policy.owner_discord_id===current.actor.id)return;const member=(policy.members || []).find(m=>m.discordId===current.actor.id);if(!member?.tools.some(tool=>tools.includes(tool)))fail('مالك السيرفر لم يمنحك تنفيذ تغييرات القنوات والرتب في إعدادات الفريق.');}
