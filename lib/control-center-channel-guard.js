import {randomUUID} from 'node:crypto';
import {PermissionFlagsBits as F,GatewayIntentBits as I,AuditLogEvent} from 'discord.js';
import {enforceAdminTeam} from './admin-panel-api.js';
import {projectDiscord} from './code-project-discord.js';
import {centerCard} from '../control-center-view.js';

export function guardConfig(raw={}){
 const count=Number(raw.count ?? 3),seconds=Number(raw.seconds ?? 30),mode=raw.mode || 'quarantine';
 if(!Number.isInteger(count) || count<1 || count>10 || !Number.isInteger(seconds) || seconds<10 || seconds>120 || !['alert','quarantine'].includes(mode))throw Error('حد الحماية 1–10 عمليات خلال 10–120 ثانية؛ الإجراء alert أو quarantine.');
 return {count,seconds,mode};
}
export async function guardPreflight(guild,actor,settings){
 await guild.roles.fetch();
 const me=await guild.members.fetchMe({force:true}),cfg=guardConfig(settings.channelGuard);
 if(!guild.client.options.intents.has(I.GuildModeration) || !me.permissions.has(F.ViewAuditLog))throw Error('الحماية تحتاج View Audit Log للبوت واتصالًا يدعم أحداث التدقيق؛ أعد اتصال البوت بعد تحديثه.');
 if(cfg.mode==='quarantine' && (!me.permissions.has(F.ManageRoles) || !actor.permissions.has(F.ManageRoles)))throw Error('سحب رتب الإدارة يحتاج Manage Roles للمشرف والبوت وترتيب رتبة البوت فوق الرتب المستهدفة.');
 if(!settings.logChannel)throw Error('عيّن قناة لوقات خاصة بالإدارة قبل تشغيل حماية القنوات.');
 const log=await guild.channels.fetch(settings.logChannel);
 if(!log || log.guildId!==guild.id || log.permissionsFor(guild.id)?.has(F.ViewChannel) || !log.permissionsFor(actor)?.has(F.ViewChannel) || !log.permissionsFor(me)?.has(F.ViewChannel|F.SendMessages))throw Error('قناة اللوقات يجب أن تكون خاصة بالإدارة ومتاحة للمشرف والبوت.');
 return {me,cfg,log};
}

export async function guardScreen({operation,state,design,store,interaction}){
 const s=await store.settings(),a=operation.id,v=interaction?.values?.[0] ?? operation.data?.values?.[0],cfg=guardConfig(s.channelGuard);
 state.guardDraft ??=cfg;
 if(a==='tools_guard_count')state.guardDraft.count=Number(v);
 if(a==='tools_guard_seconds')state.guardDraft.seconds=Number(v);
 if(a==='tools_guard_mode')state.guardDraft.mode=v;
 const draft=guardConfig(state.guardDraft),b=(label,action,row=3,style=2)=>({type:'button',label,action,row,style});
 let op;if(a==='tools_guard_save')op={id:'setguard',data:draft};
 if(a==='tools_guard_create')op={id:'anticreate',data:{enabled:!s.protection?.create}};
 if(a==='tools_guard_delete')op={id:'antidelete',data:{enabled:!s.protection?.delete}};
 if(op){state.centerReview=await store.review(op,interaction?.user?.id || '100000000000000001',interaction?.id || randomUUID());return centerCard(design,state,'راجع حماية القنوات',JSON.stringify(op.data)+'\nالإجراء quarantine يسحب رتب إدارة قابلة للإزالة عند تجاوز الحد. لا يحذف قنوات ولا يسترجع الرسائل. أي فشل يوقف الأتمتة للمراجعة.',[b('أؤكد التنفيذ','confirm',0,3),b('إلغاء','cancel',0),b('الرئيسية','home',4)]);}
 const select=(action,placeholder,values,row,current)=>({type:'select',action,placeholder,row,options:values.map(([value,label])=>({value:String(value),label,default:String(current)===String(value)}))});
 return centerCard(design,state,'حماية إنشاء وحذف القنوات','الحماية العامة: '+(s.protection?.enabled?'تعمل':'متوقفة')+'\nالإنشاء: '+(s.protection?.create?'مفعّلة':'متوقفة')+' · الحذف: '+(s.protection?.delete?'مفعّلة':'متوقفة')+'\nالقواعد المحفوظة: '+cfg.count+' عمليات / '+cfg.seconds+' ثانية · '+(cfg.mode==='quarantine'?'سحب رتب الإدارة القابلة للإزالة':'تنبيه فقط')+'\nالسجل: '+(s.logChannel?'<#'+s.logChannel+'>':'عيّن قناة لوق خاصة أولًا')+'\nاستثناء المالك والبوت والموثوقين. الحذف الأول قد يقع قبل رد فعل البوت؛ لا يمكن استرجاع الرسائل المحذوفة.',[
 select('tools_guard_count','عدد العمليات',Array.from({length:10},(_,i)=>[i+1,String(i+1)]),0,draft.count),select('tools_guard_seconds','الفترة بالثواني',[10,15,30,60,120].map(n=>[n,n+' ثانية']),1,draft.seconds),select('tools_guard_mode','الإجراء',[['alert','تنبيه فقط'],['quarantine','سحب رتب الإدارة القابلة للإزالة']],2,draft.mode),b('راجع حفظ القواعد','tools_guard_save'),b('تشغيل/إيقاف الإنشاء','tools_guard_create'),b('تشغيل/إيقاف الحذف','tools_guard_delete'),b('تعيين اللوق','op_setlog',4),b('الموثوقون','op_liprot',4),b('مركز المتابعة','tools_open',4)]);
}

export async function handleCenterAudit(entry,guild,pool,{transport=projectDiscord}={}){
 const kind=entry.action===AuditLogEvent.ChannelCreate?'create':entry.action===AuditLogEvent.ChannelDelete?'delete':null;
 if(!Number.isFinite(entry.createdTimestamp) || !kind || !entry.executorId || !entry.targetId || !entry.id || Date.now()-entry.createdTimestamp>120000 || entry.createdTimestamp>Date.now()+5000 || entry.executorId===guild.ownerId || entry.executorId===guild.client.user.id)return;
 const rows=(await pool.query(`SELECT c.*,s.settings FROM code_commands c JOIN control_center_settings s ON s.command_id=c.id AND s.owner_id=c.owner_id AND s.guild_id=c.guild_id AND s.bot_id=c.bot_user_id WHERE c.guild_id=$1 AND c.bot_user_id=$2 AND c.enabled=TRUE`,[guild.id,guild.client.user.id])).rows;
 for(const c of rows){
  const s=c.settings,scope=[c.id,c.owner_id,c.guild_id,c.bot_user_id];if(!s.operator || s.automationPaused || !s.protection?.enabled || !s.protection[kind] || s.trusted?.includes(entry.executorId))continue;
  let db,locked=false;
  try{
   const actor=await guild.members.fetch({user:s.operator,force:true});if(actor.id!==guild.ownerId && !actor.permissions.has(F.ManageGuild))throw Error('مشرف الحماية لم يعد يملك إدارة السيرفر.');await enforceAdminTeam(pool,{guild,actor},['commands','panels']);
   const {me,cfg,log}=await guardPreflight(guild,actor,s);
   const observed=(await pool.query("INSERT INTO control_center_events(id,command_id,owner_id,guild_id,bot_id,event_key,kind,status,actor_id,target_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,'completed',$8,$9,$10) ON CONFLICT DO NOTHING RETURNING id",[randomUUID(),...scope,'guard:observe:'+entry.id,'guard_'+kind,entry.executorId,entry.targetId,new Date(entry.createdTimestamp)])).rows[0];if(!observed)continue;
   const count=(await pool.query("SELECT COUNT(*)::int AS count FROM control_center_events WHERE command_id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_id=$4 AND actor_id=$5 AND kind=$6 AND created_at>NOW()-($7::int*INTERVAL '1 second')",[...scope,entry.executorId,'guard_'+kind,cfg.seconds])).rows[0]?.count || 0;
   if(count<cfg.count)continue;
   db=await pool.connect();locked=(await db.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',['diskoko:'+guild.id])).rows[0]?.locked;if(!locked)continue;
   const fresh=(await db.query('SELECT c.enabled,s.settings FROM code_commands c JOIN control_center_settings s ON s.command_id=c.id AND s.owner_id=c.owner_id AND s.guild_id=c.guild_id AND s.bot_id=c.bot_user_id WHERE c.id=$1 AND c.owner_id=$2 AND c.guild_id=$3 AND c.bot_user_id=$4',scope)).rows[0];
   if(!fresh?.enabled || fresh.settings.automationPaused || !fresh.settings.protection?.enabled || !fresh.settings.protection[kind] || fresh.settings.operator!==s.operator || fresh.settings.trusted?.includes(entry.executorId))continue;
   // One reaction across all panels for this bot and guild; no guessing who performed an action.
   const recent=(await db.query("SELECT entry_id FROM control_center_guard_claims WHERE guild_id=$1 AND bot_id=$2 AND executor_id=$3 AND created_at>NOW()-INTERVAL '2 minutes'",[guild.id,c.bot_user_id,entry.executorId])).rows;if(recent.length)continue;
   const claim=(await db.query("INSERT INTO control_center_guard_claims(guild_id,bot_id,entry_id,executor_id,command_id,owner_id,status) VALUES($1,$2,$3,$4,$5,$6,'running') ON CONFLICT DO NOTHING RETURNING entry_id",[guild.id,c.bot_user_id,entry.id,entry.executorId,c.id,c.owner_id])).rows[0];if(!claim)continue;
   const event=randomUUID();await db.query("INSERT INTO control_center_events(id,command_id,owner_id,guild_id,bot_id,event_key,kind,status,actor_id,target_id) VALUES($1,$2,$3,$4,$5,$6,'guardReaction','started',$7,$8) ON CONFLICT DO NOTHING",[event,...scope,'guard:reaction:'+entry.id,entry.executorId,entry.targetId]);
   try{
    let result='تنبيه فقط؛ لم تُعدّل رتب العضو.';
    if(cfg.mode==='quarantine'){
     const member=await guild.members.fetch({user:entry.executorId,force:true});
     if(member.id===guild.ownerId || member.id===me.id || member.roles.highest.comparePositionTo(me.roles.highest)>=0 || actor.id!==guild.ownerId && member.roles.highest.comparePositionTo(actor.roles.highest)>=0)throw Error('رتبة منفذ العملية محمية أو أعلى من المشرف أو البوت؛ راجع صلاحياته يدويًا.');
     const dangerous=member.roles.cache.filter(r=>r.id!==guild.id && r.permissions.any(F.Administrator|F.ManageChannels|F.ManageRoles|F.ManageGuild));
     const removable=dangerous.filter(r=>!r.managed && r.comparePositionTo(me.roles.highest)<0 && (actor.id===guild.ownerId || r.comparePositionTo(actor.roles.highest)<0));
     if(removable.size>10)throw Error('أكثر من 10 رتب إدارة؛ تدخل يدوي مطلوب قبل سحبها.');
     for(const role of removable.values())await transport(guild.client).delete('/guilds/'+guild.id+'/members/'+member.id+'/roles/'+role.id,{reason:'Configured channel '+kind+' protection; audit '+entry.id});
     result='سُحبت '+removable.size+' رتبة قابلة للإزالة من رتب الإدارة. الرتب المُدارة وصلاحيات القنوات المباشرة تحتاج مراجعة يدوية.';
    }
    await transport(guild.client).post('/channels/'+log.id+'/messages',{body:{content:'🛡️ حماية '+(kind==='create'?'إنشاء':'حذف')+' القنوات\nالمنفذ: '+entry.executorId+'\nالعمليات: '+count+' خلال '+cfg.seconds+' ثانية\nمرجع التدقيق: '+entry.id+'\n'+result+'\nلا تُحذف قنوات منشأة ولا تُستعاد محادثات محذوفة تلقائيًا.',allowed_mentions:{parse:[]},nonce:entry.id,enforce_nonce:true}});
    await db.query("UPDATE control_center_events SET status='completed' WHERE id=$1 AND command_id=$2 AND owner_id=$3 AND guild_id=$4 AND bot_id=$5",[event,...scope]);
    await db.query("UPDATE control_center_guard_claims SET status='completed' WHERE guild_id=$1 AND bot_id=$2 AND entry_id=$3",[guild.id,c.bot_user_id,entry.id]);
   }catch(error){await db.query("UPDATE control_center_events SET status='review_required',error=$6 WHERE id=$1 AND command_id=$2 AND owner_id=$3 AND guild_id=$4 AND bot_id=$5",[event,...scope,String(error.message).slice(0,400)]);throw error;}
  }catch(error){
   await pool.query("UPDATE control_center_settings SET settings=jsonb_set(jsonb_set(settings,'{automationPaused}','true'::jsonb),'{automationError}',to_jsonb($5::text)),updated_at=NOW() WHERE command_id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_id=$4",[...scope,String(error.message).slice(0,350)]);
  }finally{if(locked)await db.query('SELECT pg_advisory_unlock(hashtext($1))',['diskoko:'+guild.id]).catch(()=>{});db?.release();}
 }
}
