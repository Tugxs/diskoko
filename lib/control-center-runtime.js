import {randomUUID,createHash,randomInt} from 'node:crypto';
import {PermissionFlagsBits as F,Events,GatewayIntentBits} from 'discord.js';
import {enforceAdminTeam} from './admin-panel-api.js';
import {projectDiscord} from './code-project-discord.js';
import {controlForms} from '../control-center-forms.js';
import {controlActions} from '../control-center-catalog.js';
import {checkDhikr,dhikrDelay,dhikrConfig,chooseDhikr,formatDhikr} from './control-center-dhikr.js';
import {handleCenterAudit} from './control-center-channel-guard.js';
import {logCenterTicket} from './control-center-operations.js';
import {openCenterTicket} from './control-center-tickets.js';

async function activeSettings(pool,guild,bot){return (await pool.query(`SELECT c.*,s.settings FROM code_commands c JOIN control_center_settings s ON s.command_id=c.id AND s.owner_id=c.owner_id AND s.guild_id=c.guild_id AND s.bot_id=c.bot_user_id WHERE c.guild_id=$1 AND c.bot_user_id=$2 AND c.enabled=TRUE`,[guild,bot])).rows;}
async function operator(guild,settings,pool){const actor=await guild.members.fetch({user:settings.operator,force:true});if(actor.id!==guild.ownerId && !actor.permissions.has(F.ManageGuild))throw Error('توقفت الأتمتة: المشرف الذي أعدها لم يعد يملك إدارة السيرفر.');if(pool)await enforceAdminTeam(pool,{guild,actor},['commands','panels']);return actor;}
async function pause(pool,c,error){await pool.query("UPDATE control_center_settings SET settings=jsonb_set(jsonb_set(settings,'{automationPaused}','true'::jsonb),'{automationError}',to_jsonb($5::text)),updated_at=NOW() WHERE command_id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_id=$4",[c.id,c.owner_id,c.guild_id,c.bot_user_id,String(error.message).slice(0,300)]);}
async function once(pool,c,event,kind,fn){
 const row=(await pool.query("INSERT INTO control_center_events(id,command_id,owner_id,guild_id,bot_id,event_key,kind) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id",[randomUUID(),c.id,c.owner_id,c.guild_id,c.bot_user_id,event,kind])).rows[0];if(!row)return;
 try{await fn();await pool.query("UPDATE control_center_events SET status='completed' WHERE id=$1",[row.id]);}
 catch(error){await pool.query("UPDATE control_center_events SET status='review_required',error=$2 WHERE id=$1",[row.id,String(error.message).slice(0,400)]);throw error;}
}
const nonce=key=>createHash('sha256').update(key).digest('hex').slice(0,24);
async function send(client,channel,body,key){return projectDiscord(client).post('/channels/'+channel+'/messages',{body:{...body,allowed_mentions:{parse:[]},nonce:nonce(key),enforce_nonce:true}});}

export async function handleCenterText(message,pool){
 if(!pool || !message.guild || message.author.bot || !message.content || !message.client.options.intents.has(GatewayIntentBits.MessageContent))return false;
 const rows=(await pool.query(`SELECT c.*,v.source,COALESCE(s.settings,'{}'::jsonb) AS settings FROM code_commands c JOIN code_command_versions v ON v.command_id=c.id AND v.revision=c.active_revision LEFT JOIN control_center_settings s ON s.command_id=c.id AND s.owner_id=c.owner_id AND s.guild_id=c.guild_id AND s.bot_id=c.bot_user_id WHERE c.guild_id=$1 AND c.bot_user_id=$2 AND c.enabled=TRUE`,[message.guildId,message.client.user.id])).rows;
 for(const c of rows){let project,design;try{project=JSON.parse(c.source);if(!project.files?.['control-center-view.js'])continue;design=JSON.parse(project.files['panel.json']);}catch{continue;}
  if(!['prefix','both'].includes(design.commandMode))continue;
  const prefix=c.settings.prefix || design.prefix || '!';if(!message.content.startsWith(prefix))continue;
  const parts=message.content.slice(prefix.length).trim().split(/\s+/),name=parts.shift();let action;
  if(name!==c.name){action=c.settings.aliases?.[name] || (Object.hasOwn(controlActions,name)?name:null);if(!action)continue;}
  let sent;
  const interaction={id:message.id,isCenterText:true,guild:message.guild,guildId:message.guildId,channel:message.channel,channelId:message.channelId,user:message.author,member:message.member,client:message.client,commandName:c.name,centerTextAction:action,centerTextValues:parts,options:{data:[]},isChatInputCommand:()=>true,isButton:()=>false,isStringSelectMenu:()=>false,isModalSubmit:()=>false,deferred:false,replied:false,
   async deferReply(){this.deferred=true;await message.channel.sendTyping();},async reply(payload){this.replied=true;const {ephemeral,...safe}=payload;sent=await message.reply({...safe,allowedMentions:{parse:[],repliedUser:false}});return sent;},async editReply(payload){return sent?sent.edit(payload):this.reply(payload);}};
  const {handleCodeInteraction}=await import('./code-commands.js');await handleCodeInteraction(interaction,pool,message.client.user.id);return true;
 }
 return false;
}

export async function handleCenterMessage(message,pool,spam=new Map()){
 if(!pool || !message.guild || message.author.bot)return;
 for(const c of await activeSettings(pool,message.guildId,message.client.user.id)){
  const s=c.settings;if(!s.operator || s.automationPaused)continue;
  try{
   await operator(message.guild,s,pool);const me=await message.guild.members.fetchMe({force:true});
   const member=await message.guild.members.fetch({user:message.author.id,force:true}),p=s.protection || {},exempt=member.permissions.has(F.ManageGuild) || s.trusted?.includes(member.id);
   const cfg=s.channels?.[message.channelId] || {},content=message.content || '';
   const key=c.id+':'+member.id,now=Date.now(),times=(spam.get(key) || []).filter(t=>now-t<(p.seconds || 10)*1000);times.push(now);spam.set(key,times.slice(-31));if(spam.size>5000)spam.clear();
   const bad=!exempt && (p.enabled && ((p.link && /(?:https?:\/\/|discord\.gg\/|discord\.com\/invite\/)/i.test(content)) || (p.words && (s.words || []).some(w=>content.toLowerCase().includes(w.toLowerCase()))) || p.spam && times.length>=(p.count || 6)) || cfg.media==='images' && !message.attachments.some(a=>a.contentType?.startsWith('image/')) || cfg.media==='text' && message.attachments.size>0);
   if(bad){if(!message.channel.permissionsFor(me)?.has(F.ManageMessages))throw Error('البوت يحتاج إدارة الرسائل لتطبيق الحماية.');await once(pool,c,message.id+':protect','protection',async()=>{await message.delete();if(p.enabled && p.mode==='timeout' && me.permissions.has(F.ModerateMembers) && member.moderatable)await member.timeout((p.minutes || 5)*60000,'Diskoko configured protection');});continue;}
   if(cfg.reaction)await once(pool,c,message.id+':react','reaction',()=>message.react(cfg.reaction));
   const reply=cfg.replies?.[content] || cfg.reply;if(reply || cfg.line || cfg.image){if(!message.channel.permissionsFor(me)?.has(F.SendMessages))throw Error('البوت لا يستطيع إرسال الرد المعدّ في القناة.');await once(pool,c,message.id+':reply','reply',()=>send(message.client,message.channelId,{content:[reply,cfg.line].filter(Boolean).join('\n').slice(0,2000),...(cfg.image?{embeds:[{image:{url:cfg.image}}]}:{})},message.id+':'+c.id));}
   await pool.query(`INSERT INTO control_center_people(command_id,owner_id,guild_id,bot_id,user_id,points,messages) VALUES($1,$2,$3,$4,$5,1,1) ON CONFLICT(command_id,user_id) DO UPDATE SET messages=control_center_people.messages+1,points=control_center_people.points+CASE WHEN control_center_people.messages%10=0 THEN 1 ELSE 0 END WHERE control_center_people.owner_id=$2 AND control_center_people.guild_id=$3 AND control_center_people.bot_id=$4`,[c.id,c.owner_id,c.guild_id,c.bot_user_id,member.id]);
  }catch(error){await pause(pool,c,error);console.error('Control center event',c.id,String(error.message).slice(0,200));}
 }
}

export async function handleCenterJoin(member,pool){
 for(const c of await activeSettings(pool,member.guild.id,member.client.user.id)){
  const s=c.settings;if(!s.operator || s.automationPaused)continue;
  try{const actor=await operator(member.guild,s,pool),me=await member.guild.members.fetchMe({force:true});
   if(s.protection?.enabled && (s.protection.bots && member.user.bot || s.protection.join && Date.now()-member.user.createdTimestamp<86400000)){
    if(!me.permissions.has(F.KickMembers) || !actor.permissions.has(F.KickMembers) || !member.kickable)throw Error('راجع صلاحية الطرد وترتيب رتب الحماية.');
    await once(pool,c,member.id+':'+member.joinedTimestamp+':guard','joinProtection',()=>member.kick('Diskoko configured join protection'));continue;
   }
   if(s.joinRoleEnabled && s.joinRole){const r=await member.guild.roles.fetch(s.joinRole);if(!r || r.managed || r.permissions.has(F.Administrator) || r.comparePositionTo(me.roles.highest)>=0 || actor.id!==member.guild.ownerId && r.comparePositionTo(actor.roles.highest)>=0 || !me.permissions.has(F.ManageRoles) || !actor.permissions.has(F.ManageRoles))throw Error('راجع رتبة الدخول وصلاحية إدارة الرتب.');await once(pool,c,member.id+':'+member.joinedTimestamp+':role','joinRole',()=>member.roles.add(r));}
   if(s.welcome?.enabled){const ch=await member.guild.channels.fetch(s.welcome.channel);if(!ch?.permissionsFor(me)?.has(F.ViewChannel|F.SendMessages|F.EmbedLinks))throw Error('راجع قناة الترحيب وصلاحياتها.');const replace=t=>String(t || '').replaceAll('{user}',member.displayName).replaceAll('{server}',member.guild.name).replaceAll('{count}',String(member.guild.memberCount));await once(pool,c,member.id+':'+member.joinedTimestamp+':welcome','welcome',()=>send(member.client,ch.id,{embeds:[{title:replace(s.welcome.title).slice(0,256),description:replace(s.welcome.text).slice(0,4096),color:0x9d7bea,...(s.welcome.avatar?{thumbnail:{url:member.user.displayAvatarURL()}}:{}),...(s.welcome.image?{image:{url:s.welcome.image}}:{})}]},c.id+':'+member.id+':'+member.joinedTimestamp));}
  }catch(error){await pause(pool,c,error);console.error('Control center join',c.id,String(error.message).slice(0,200));}
 }
}

export async function tickCenterJobs(client,pool,guildId,{transport=projectDiscord}={}){
 await pool.query("UPDATE control_center_jobs SET enabled=FALSE,status='review_required',error='نتيجة الإرسال السابق غير مؤكدة؛ راجع القناة قبل إعادة التشغيل.' WHERE bot_id=$1 AND ($2::text IS NULL OR guild_id=$2) AND status='sending' AND updated_at<NOW()-INTERVAL '2 minutes'",[client.user.id,guildId || null]);
 const jobs=(await pool.query(`UPDATE control_center_jobs j SET status='sending',updated_at=NOW() FROM code_commands c WHERE j.command_id=c.id AND j.owner_id=c.owner_id AND j.guild_id=c.guild_id AND j.bot_id=c.bot_user_id AND j.enabled=TRUE AND j.status='idle' AND j.due_at<=NOW() AND c.enabled=TRUE AND c.active_revision=j.revision AND j.bot_id=$1 AND ($2::text IS NULL OR j.guild_id=$2) AND j.command_id IN (SELECT command_id FROM control_center_jobs WHERE bot_id=$1 AND enabled=TRUE AND status='idle' AND due_at<=NOW() ORDER BY due_at LIMIT 10) RETURNING j.*`,[client.user.id,guildId || null])).rows;
 for(const job of jobs){
  const scope=[job.command_id,job.owner_id,job.guild_id,job.bot_id],db=await pool.connect();let locked=false;
  try{
   locked=(await db.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',['diskoko:'+job.guild_id])).rows[0]?.locked;
   if(!locked){await db.query("UPDATE control_center_jobs SET status='idle',updated_at=NOW() WHERE command_id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_id=$4 AND status='sending'",scope);continue;}
   const fresh=(await db.query('SELECT j.enabled FROM control_center_jobs j JOIN code_commands c ON c.id=j.command_id AND c.owner_id=j.owner_id AND c.guild_id=j.guild_id AND c.bot_user_id=j.bot_id WHERE j.command_id=$1 AND j.owner_id=$2 AND j.guild_id=$3 AND j.bot_id=$4 AND j.revision=$5 AND c.active_revision=j.revision AND c.enabled=TRUE',[...scope,job.revision])).rows[0];
   if(!fresh?.enabled){await db.query("UPDATE control_center_jobs SET status='idle',enabled=FALSE,updated_at=NOW() WHERE command_id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_id=$4 AND status='sending'",scope);continue;}
   const config=dhikrConfig(job.config),guild=await client.guilds.fetch(job.guild_id),actor=await guild.members.fetch({user:job.actor_id,force:true});
   if(actor.id!==guild.ownerId && !actor.permissions.has(F.ManageGuild))throw Error('المشرف لم يعد يملك إدارة السيرفر.');
   await enforceAdminTeam(db,{guild,actor},['commands','panels']);await checkDhikr(guild,actor,config);
   if(config.interval==='daily' && Date.now()-new Date(job.due_at).getTime()>30*60000){await db.query("UPDATE control_center_jobs SET status='idle',due_at=NOW()+($5::int*INTERVAL '1 millisecond'),updated_at=NOW() WHERE command_id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_id=$4 AND status='sending'",[...scope,dhikrDelay(config)]);continue;}
   const entry=chooseDhikr(config,job.last_entry,new Date(job.due_at).getTime());
   const message=await transport(client).post('/channels/'+job.channel_id+'/messages',{body:{content:(config.mention?'<@&'+config.mention+'>\n':'')+formatDhikr(entry),allowed_mentions:{parse:[],roles:config.mention?[config.mention]:[]},nonce:nonce(job.command_id+':'+new Date(job.due_at).toISOString()),enforce_nonce:true}});
   await db.query("UPDATE control_center_jobs SET status='idle',due_at=NOW()+($5::int*INTERVAL '1 millisecond'),error=NULL,last_entry=$6,last_sent_at=NOW(),last_message_id=$7,sent_count=sent_count+1,updated_at=NOW() WHERE command_id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_id=$4 AND status='sending'",[...scope,dhikrDelay(config),entry.id,message.id]);
  }catch(error){await db.query("UPDATE control_center_jobs SET enabled=FALSE,status='review_required',error=$5,updated_at=NOW() WHERE command_id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_id=$4",[...scope,String(error.message).slice(0,400)]);}
  finally{if(locked)await db.query('SELECT pg_advisory_unlock(hashtext($1))',['diskoko:'+job.guild_id]).catch(()=>{});db.release();}
 }
}

export async function restoreCenterVoice(client,pool,guildId,isStopped=()=>false){
 const rows=(await pool.query(`SELECT c.*,s.settings FROM code_commands c JOIN control_center_settings s ON s.command_id=c.id AND s.owner_id=c.owner_id AND s.guild_id=c.guild_id AND s.bot_id=c.bot_user_id WHERE c.enabled=TRUE AND c.bot_user_id=$1 AND ($2::text IS NULL OR c.guild_id=$2) AND s.settings->>'voice24' IS NOT NULL ORDER BY c.created_at`,[client.user.id,guildId || null])).rows;
 if(!rows.length)return;const {getVoiceConnection,joinVoiceChannel,entersState,VoiceConnectionStatus}=await import('@discordjs/voice'),seen=new Set();
 for(const c of rows){if(isStopped())return;if(seen.has(c.guild_id) || c.settings.automationPaused)continue;seen.add(c.guild_id);try{const guild=await client.guilds.fetch(c.guild_id),actor=await operator(guild,c.settings,pool),me=await guild.members.fetchMe(),channel=await guild.channels.fetch(c.settings.voice24);if(getVoiceConnection(guild.id,client.user.id))continue;if(channel?.type!==2 || !channel.permissionsFor(actor)?.has(F.ViewChannel|F.Connect) || !channel.permissionsFor(me)?.has(F.ViewChannel|F.Connect))throw Error('توقف الاتصال الدائم: القناة أو صلاحيات الاتصال تغيرت.');if(isStopped())return;const connection=joinVoiceChannel({channelId:channel.id,guildId:guild.id,adapterCreator:guild.voiceAdapterCreator,group:client.user.id,selfDeaf:true});try{await entersState(connection,VoiceConnectionStatus.Ready,10000);}catch{connection.destroy();throw Error('تعذر استعادة الاتصال الصوتي؛ راجع القناة قبل إعادة تشغيله.');}}catch(error){await pause(pool,c,error);}}
}

export function mountControlCenter(client,pool,guildId){
 client.diskokoCenterStop?.();const spam=new Map(),voiceTimers=new Map();let busy=false,stopped=false,messageBusy=0,lastCleanup=0;
 const accepts=m=>!guildId || (m.guildId || m.guild?.id)===guildId;
 const message=async m=>{if(!accepts(m) || m.author?.bot || !m.guild || messageBusy>=6)return;messageBusy++;try{if(await handleCenterText(m,pool))return;await handleCenterMessage(m,pool,spam);}catch(e){console.error('Control center message',e.message);}finally{messageBusy--;}};
 const audit=(entry,guild)=>{if(!guildId || guild.id===guildId)void handleCenterAudit(entry,guild,pool).catch(e=>console.error('Channel protection',e.message));};
 const join=m=>{if(accepts(m))void handleCenterJoin(m,pool).catch(e=>console.error('Control center join',e.message));};
 const log=async(kind,m)=>{if(!accepts(m) || !m.guild || m.author?.bot)return;for(const c of await activeSettings(pool,m.guild.id,client.user.id)){const s=c.settings;if(!s.messageLogChannel || !s.operator || s.automationPaused)continue;try{const actor=await operator(m.guild,s,pool),source=await m.guild.channels.fetch(m.channelId),target=await m.guild.channels.fetch(s.messageLogChannel),me=await m.guild.members.fetchMe();if(!source?.permissionsFor(actor)?.has(F.ViewChannel) || !target?.permissionsFor(actor)?.has(F.ViewChannel) || target.permissionsFor(m.guild.id)?.has(F.ViewChannel) || !target.permissionsFor(me)?.has(F.ViewChannel|F.SendMessages))throw Error('سجل الرسائل يحتاج قناة إدارة خاصة وصلاحيات عرض وإرسال.');await once(pool,c,m.id+':'+kind,'messageLog',()=>send(client,target.id,{content:'السجل: '+kind+'\nالقناة: '+m.channelId+'\nالرسالة: '+m.id+'\nالعضو: '+(m.author?.id || 'غير متاح')+'\nلا يُحفظ محتوى الرسالة.'},c.id+':'+m.id+':'+kind));}catch(e){await pause(pool,c,e);}}};
 const deleted=m=>void log('حذف رسالة',m).catch(e=>console.error('Control center log',e.message)),edited=(_old,m)=>void log('تعديل رسالة',m).catch(e=>console.error('Control center log',e.message));
 const voice=async(_old,v)=>{if(!accepts(v))return;for(const c of await activeSettings(pool,v.guild.id,client.user.id)){if(!c.settings.voiceCounter || c.settings.automationPaused || voiceTimers.has(c.id))continue;const delay=Math.max(1000,600000-(Date.now()-(c.settings.voiceCounter.updated || 0)));const timer=setTimeout(async()=>{voiceTimers.delete(c.id);if(stopped)return;try{const fresh=(await activeSettings(pool,v.guild.id,client.user.id)).find(row=>row.id===c.id);if(!fresh?.settings.voiceCounter || fresh.settings.automationPaused)return;const actor=await operator(v.guild,fresh.settings,pool),me=await v.guild.members.fetchMe(),channel=await v.guild.channels.fetch(fresh.settings.voiceCounter.channel);if(!channel?.permissionsFor(actor)?.has(F.ManageChannels) || !channel.permissionsFor(me)?.has(F.ManageChannels))throw Error('توقّف العداد: صلاحية إدارة القناة غير متاحة.');const count=v.guild.voiceStates.cache.filter(state=>state.channelId && !state.member?.user.bot).size,name=fresh.settings.voiceCounter.name.replaceAll('{count}',String(count)).slice(0,100);if(channel.name!==name)await projectDiscord(client).patch('/channels/'+channel.id,{body:{name}});await pool.query("UPDATE control_center_settings SET settings=jsonb_set(settings,'{voiceCounter,updated}',to_jsonb($5::bigint)) WHERE command_id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_id=$4",[c.id,c.owner_id,c.guild_id,c.bot_user_id,Date.now()]);}catch(e){await pause(pool,c,e).catch(()=>{});}},delay);timer.unref();voiceTimers.set(c.id,timer);}};
 const timer=setInterval(async()=>{if(busy || stopped)return;busy=true;try{await tickCenterJobs(client,pool,guildId);if(Date.now()-lastCleanup>3600000){lastCleanup=Date.now();await pool.query("UPDATE control_center_tickets SET archive=NULL,archived_at=NULL WHERE bot_id=$1 AND ($2::text IS NULL OR guild_id=$2) AND archived_at<NOW()-INTERVAL '30 days'",[client.user.id,guildId || null]);}}catch(e){console.error('Control center scheduler',e.message);}finally{busy=false;}},15000);timer.unref();
 client.on(Events.GuildAuditLogEntryCreate,audit);client.on(Events.MessageCreate,message);client.on(Events.GuildMemberAdd,join);client.on(Events.MessageDelete,deleted);client.on(Events.MessageUpdate,edited);client.on(Events.VoiceStateUpdate,voice);
 client.diskokoCenterStop=()=>{stopped=true;clearInterval(timer);client.off(Events.GuildAuditLogEntryCreate,audit);client.off(Events.MessageCreate,message);client.off(Events.GuildMemberAdd,join);client.off(Events.MessageDelete,deleted);client.off(Events.MessageUpdate,edited);client.off(Events.VoiceStateUpdate,voice);for(const timer of voiceTimers.values())clearTimeout(timer);voiceTimers.clear();spam.clear();};
 void restoreCenterVoice(client,pool,guildId,()=>stopped).catch(e=>console.error('Control center voice restore',e.message));
 return client.diskokoCenterStop;
}

export async function handleCenterPublic(interaction,pool,botId){
 const match=interaction.customId?.match(/^diskoko-center-(ticket|apply|submit):([0-9a-f-]{36})(?::([0-9a-f-]{36}))?$/);if(!match)return false;
 const [,kind,id,session]=match;
 const c=(await pool.query(`SELECT c.*,s.settings FROM code_commands c JOIN control_center_settings s ON s.command_id=c.id AND s.owner_id=c.owner_id AND s.guild_id=c.guild_id AND s.bot_id=c.bot_user_id WHERE c.id=$1 AND c.guild_id=$2 AND c.bot_user_id=$3 AND c.enabled=TRUE`,[id,interaction.guildId,botId])).rows[0];
 try{
  if(!c)throw Error('هذه اللوحة متوقفة أو لا تخص هذا السيرفر والبوت.');
  const s=c.settings,admin=await operator(interaction.guild,s,pool);const member=await interaction.guild.members.fetch({user:interaction.user.id,force:true});if(s.blocked?.includes(member.id) || member.roles.cache.some(role=>s.blockedRoles?.includes(role.id)))throw Error('لا يمكنك استخدام هذه اللوحة.');
  const channel=await interaction.guild.channels.fetch(interaction.channelId);if(!channel?.permissionsFor(member)?.has(F.ViewChannel|F.SendMessages))throw Error('لا تملك صلاحية استخدام القناة.');
  if(kind==='submit'){
   const row=(await pool.query("DELETE FROM code_command_sessions WHERE id=$1 AND command_id=$2 AND revision=$3 AND discord_user_id=$4 AND expires_at>NOW() AND actions=$5::jsonb RETURNING id",[session,c.id,c.active_revision,member.id,JSON.stringify([{action:'center_application',type:'modal',channel:interaction.channelId,questions:s.application.questions}])])).rows[0];if(!row || !s.application?.enabled)throw Error('انتهى نموذج التقديم أو سبق إرساله.');
   if(interaction.fields.fields.size!==s.application.questions.length)throw Error('تغير نموذج التقديم؛ افتحه مجددًا.');
   const answers=Object.fromEntries(s.application.questions.map((question,i)=>{const value=interaction.fields.fields.get('q'+i)?.value;if(typeof value!=='string' || !value.trim() || value.length>1800)throw Error('راجع إجابات النموذج وأعد فتحه.');return [(i+1)+'. '+question,value];}));
   await pool.query('INSERT INTO control_center_submissions(id,command_id,owner_id,guild_id,bot_id,user_id,answers) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(command_id,user_id) DO UPDATE SET answers=$7,created_at=NOW(),status=\'pending\',reviewer_id=NULL,reviewed_at=NULL,state_version=control_center_submissions.state_version+1 WHERE control_center_submissions.owner_id=$3 AND control_center_submissions.guild_id=$4 AND control_center_submissions.bot_id=$5',[session,c.id,c.owner_id,c.guild_id,c.bot_user_id,member.id,JSON.stringify(answers)]);await interaction.reply({content:'تم حفظ طلبك لمراجعة الإدارة.',ephemeral:true});return true;
  }
  if(kind==='apply'){
   if(!s.application?.enabled || s.application.channel!==interaction.channelId || s.application.message!==interaction.message.id)throw Error('هذه ليست لوحة التقديم الحالية.');
   const pending=(await pool.query("SELECT COUNT(*)::int AS count FROM code_command_sessions WHERE command_id=$1 AND discord_user_id=$2 AND expires_at>NOW() AND actions @> '[{\"action\":\"center_application\"}]'::jsonb",[c.id,member.id])).rows[0]?.count || 0;if(pending>=3)throw Error('لديك نماذج مفتوحة بالفعل؛ أكمل أحدها أو انتظر انتهاء مدته.');
   const session=randomUUID();await pool.query("INSERT INTO code_command_sessions(id,command_id,revision,discord_user_id,actions,expires_at) VALUES($1,$2,$3,$4,$5,NOW()+INTERVAL '15 minutes')",[session,c.id,c.active_revision,member.id,JSON.stringify([{action:'center_application',type:'modal',channel:interaction.channelId,questions:s.application.questions}])]);
   await interaction.showModal({title:s.application.title.slice(0,45),custom_id:'diskoko-center-submit:'+c.id+':'+session,components:s.application.questions.map((q,i)=>({type:1,components:[{type:4,custom_id:'q'+i,label:q,style:2,required:true,max_length:1800}]}))});return true;
  }
  if(s.ticketChannel!==interaction.channelId || s.ticketMessage!==interaction.message.id)throw Error('هذه ليست لوحة التذاكر الحالية.');
  await interaction.deferReply({ephemeral:true});
  const ticket=await openCenterTicket({pool,command:c,settings:s,guild:interaction.guild,user:member.id,client:interaction.client});const warning=ticket.reused?'':await logCenterTicket({settings:s,guild:interaction.guild,actor:admin,ticket:{channel_id:ticket.channelId,user_id:member.id},action:'فتح تذكرة',rest:()=>projectDiscord(interaction.client),key:c.id+':'+ticket.channelId+':open'});await interaction.editReply({content:(ticket.reused?'لديك تذكرة مفتوحة: ':'تم فتح تذكرتك الخاصة: ')+'<#'+ticket.channelId+'>'+warning});
 }catch(error){const body={content:String(error.message).slice(0,1800),ephemeral:true};if(interaction.deferred)await interaction.editReply(body);else if(!interaction.replied)await interaction.reply(body);}
 return true;
}
