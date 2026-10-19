import {PermissionFlagsBits as F,GatewayIntentBits as I} from 'discord.js';
import {controlActions} from '../control-center-catalog.js';
import {centerCard} from '../control-center-view.js';
import {dhikrConfig,dhikrLibrary,dhikrCategories,dhikrIntervals,dhikrZones,checkDhikr,chooseDhikr,formatDhikr} from './control-center-dhikr.js';
import {randomUUID,createHash} from 'node:crypto';

const uuid=value=>typeof value==='string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
const button=(label,action,row=3,style=2)=>({type:'button',label,action,row,style});
const menu=(action,placeholder,options,row=0,extra={})=>({type:'select',action,placeholder,options,row,...extra});
const home=()=>button('◀ مركز المتابعة','tools_open',4,1);
const stamp=value=>value?'<t:'+Math.floor(new Date(value).getTime()/1000)+':f>':'لا يوجد';
const clipped=(v,n=500)=>String(v ?? '').slice(0,n);
const valueOf=(interaction,operation)=>interaction?.values?.[0] ?? operation.data?.values?.[0];
const statuses={open:'مفتوحة',closed:'مغلقة',creating:'جارٍ الإنشاء',pending:'بانتظار المراجعة',accepted:'مقبول',rejected:'مرفوض',succeeded:'نجحت',completed:'اكتملت',review_required:'تحتاج مراجعة',running:'جارٍ التنفيذ',started:'بدأت',failed:'تعذر التشغيل'};
export const opsLabels={'ops.dhikr.configure':'حفظ إعداد الأذكار','ops.dhikr.test':'إرسال ذكر تجريبي','ops.ticket.take':'استلام التذكرة','ops.ticket.release':'إلغاء استلام التذكرة','ops.ticket.close':'إغلاق التذكرة','ops.ticket.reopen':'إعادة فتح التذكرة','ops.ticket.archive':'أرشفة التذكرة','ops.application.accept':'قبول التقديم','ops.application.reject':'رفض التقديم','ops.application.reset':'إعادة التقديم للمراجعة'};

export async function logCenterTicket({settings,guild,actor,ticket,action,rest,signal,key}){
 if(!settings.ticketLog)return '';
 try{
  const target=await guild.channels.fetch(settings.ticketLog),me=await guild.members.fetchMe({force:true});
  if(!target || target.guildId!==guild.id || target.permissionsFor(guild.id)?.has(F.ViewChannel) || !target.permissionsFor(actor)?.has(F.ViewChannel) || !target.permissionsFor(me)?.has(F.ViewChannel|F.SendMessages))throw Error('قناة سجل التذاكر يجب أن تكون خاصة بالإدارة ومتاحة للمشرف والبوت.');
  await rest().post('/channels/'+target.id+'/messages',{signal,body:{content:'🎫 '+action+'\nالتذكرة: <#'+ticket.channel_id+'>\nالعضو: '+ticket.user_id+'\nالمشرف: '+actor.id,allowed_mentions:{parse:[]},nonce:createHash('sha256').update(key).digest('hex').slice(0,24),enforce_nonce:true}});
  return '';
 }catch{return '\n⚠️ تعذر إرسال سجل التذكرة. راجع خصوصية قناة السجل وصلاحياتها؛ العملية نفسها لن تتكرر.';}
}

export async function authorizeOps({operation,store,current}){
 const {id:a,data:d}=operation;if(!Object.hasOwn(opsLabels,a))throw Error('عملية متابعة غير مدعومة.');
 if(a.startsWith('ops.dhikr.')){const config=dhikrConfig(d.config);await checkDhikr(current.guild,current.actor,config);return;}
 if(!uuid(d.id) || !Number.isInteger(d.version) || d.version<0)throw Error('حدد عنصرًا صالحًا من قائمة اللوحة.');
 const table=a.startsWith('ops.ticket.')?'control_center_tickets':'control_center_submissions';
 const row=(await store.db.query(`SELECT * FROM ${table} WHERE command_id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_id=$4 AND id=$5`,[...store.scope,d.id])).rows[0];
 if(!row || row.state_version!==d.version)throw Error('تغير العنصر أو لا يخص هذه اللوحة؛ حدّث القائمة أولًا.');
 if(table==='control_center_tickets'){
  const ch=await current.guild.channels.fetch(row.channel_id),me=await current.guild.members.fetchMe({force:true});
  if(!ch || ch.guildId!==current.guild.id || ch.permissionsFor(current.guild.id)?.has(F.ViewChannel) || !ch.permissionsFor(current.actor)?.has(F.ViewChannel|F.ManageChannels) || !ch.permissionsFor(me)?.has(F.ViewChannel|F.ManageChannels))throw Error('إدارة التذكرة تتطلب قناة خاصة وصلاحية عرض وإدارة القنوات للمشرف والبوت.');
  if(a==='ops.ticket.archive' && (!ch.permissionsFor(current.actor)?.has(F.ReadMessageHistory) || !ch.permissionsFor(me)?.has(F.ReadMessageHistory)))throw Error('أرشفة التذكرة تحتاج قراءة سجل الرسائل للمشرف والبوت.');
  if(['ops.ticket.take','ops.ticket.release'].includes(a) && row.status!=='open')throw Error('استلام التذكرة متاح وهي مفتوحة فقط.');
  if(a==='ops.ticket.take' && row.assigned_to && row.assigned_to!==current.actor.id)throw Error('التذكرة مستلمة من مشرف آخر.');
  if(a==='ops.ticket.release' && row.assigned_to!==current.actor.id && current.actor.id!==current.guild.ownerId)throw Error('إلغاء الاستلام للمشرف المستلم أو مالك السيرفر.');
  if(a==='ops.ticket.reopen'){
   const existing=(await store.db.query("SELECT id FROM control_center_tickets WHERE command_id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_id=$4 AND user_id=$5 AND status IN ('creating','open') AND id<>$6",[...store.scope,row.user_id,row.id])).rows;
   if(existing.length)throw Error('للعضو تذكرة مفتوحة أخرى؛ لن نفتح تذكرتين.');
  }
 }
 return row;
}

export async function executeOps({operation,store,current,interaction,rest,signal}){
 const {id:a,data:d}=operation;
 if(a==='ops.dhikr.configure'){
  const config=dhikrConfig(d.config);await checkDhikr(current.guild,current.actor,config);
  // The durable scope lock is also held by the scheduler. A save stops the old schedule explicitly.
  await store.db.query('UPDATE control_center_jobs SET enabled=FALSE,updated_at=NOW() WHERE command_id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_id=$4',store.scope);
  const s=await store.settings();s.dhikr=config;s.operator=interaction.user.id;await store.setSettings(s);
  return 'حُفظ إعداد الأذكار وأوقف الجدول السابق. افتح الأذكار واضغط تشغيل لتفعيل هذا الإعداد.';
 }
 if(a==='ops.dhikr.test'){
  const config=dhikrConfig(d.config);await checkDhikr(current.guild,current.actor,config);
  const key='dhikr-test:'+Math.floor(Date.now()/60000),event=randomUUID();
  const claim=(await store.db.query("INSERT INTO control_center_events(id,command_id,owner_id,guild_id,bot_id,event_key,kind) VALUES($1,$2,$3,$4,$5,$6,'dhikrTest') ON CONFLICT DO NOTHING RETURNING id",[event,...store.scope,key])).rows[0];
  if(!claim)throw Error('إرسال تجريبي واحد في الدقيقة لكل لوحة؛ راجع القناة قبل التكرار.');
  try{
   await rest().post('/channels/'+config.channel+'/messages',{signal,body:{content:'🧪 إرسال تجريبي للأذكار\n\n'+formatDhikr(chooseDhikr(config)),allowed_mentions:{parse:[]},nonce:createHash('sha256').update(store.command.id+':'+key).digest('hex').slice(0,24),enforce_nonce:true}});
   await store.db.query("UPDATE control_center_events SET status='completed' WHERE id=$1 AND command_id=$2 AND owner_id=$3 AND guild_id=$4 AND bot_id=$5",[event,...store.scope]);
  }catch(error){await store.db.query("UPDATE control_center_events SET status='review_required',error=$6 WHERE id=$1 AND command_id=$2 AND owner_id=$3 AND guild_id=$4 AND bot_id=$5",[event,...store.scope,clipped(error.message,400)]);throw error;}
  return 'وصل الإرسال التجريبي دون منشن؛ لم يُفعّل أو يُغيّر الجدول.';
 }
 const row=await authorizeOps({operation,store,current}),params=[...store.scope,d.id,d.version];
 if(a.startsWith('ops.application.')){
  const status=a.endsWith('.accept')?'accepted':a.endsWith('.reject')?'rejected':'pending';
  const changed=await store.db.query('UPDATE control_center_submissions SET status=$7,reviewer_id=$8,reviewed_at=NOW(),state_version=state_version+1 WHERE command_id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_id=$4 AND id=$5 AND state_version=$6 RETURNING id',[...params,status,interaction.user.id]);
  if(!changed.rows.length)throw Error('تغير الطلب؛ حدّث القائمة.');return 'حالة الطلب: '+statuses[status]+'. لم تُرسل رسالة خاصة ولم تُمنح رتبة تلقائيًا.';
 }
 if(a==='ops.ticket.archive'){
  const ch=await current.guild.channels.fetch(row.channel_id),messages=await ch.messages.fetch({limit:100});
  const snapshot={capturedAt:new Date().toISOString(),limit:100,channelId:ch.id,messages:[...messages.values()].sort((x,y)=>x.createdTimestamp-y.createdTimestamp).map(m=>({id:m.id,authorId:m.author?.id,createdAt:new Date(m.createdTimestamp).toISOString(),content:clipped(m.content,4000),attachments:[...m.attachments.values()].slice(0,10).map(f=>({name:clipped(f.name,150),url:clipped(f.url,500)}))}))};
  if(Buffer.byteLength(JSON.stringify(snapshot))>700000)throw Error('الأرشيف أكبر من الحد المسموح؛ لم يحفظ.');
  await store.db.query('UPDATE control_center_tickets SET archive=$7,archived_at=NOW(),state_version=state_version+1,updated_at=NOW() WHERE command_id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_id=$4 AND id=$5 AND state_version=$6',[...params,JSON.stringify(snapshot)]);
  return 'حُفظت لقطة خاصة حتى آخر 100 رسالة، دون حذف القناة. اعرضها من تفاصيل التذكرة؛ روابط المرفقات قد تنتهي صلاحيتها.';
 }
 let status=row.status,assigned=row.assigned_to;
 if(a==='ops.ticket.take')assigned=interaction.user.id;
 if(a==='ops.ticket.release')assigned=null;
 if(a==='ops.ticket.close' || a==='ops.ticket.reopen'){
  status=a.endsWith('.close')?'closed':'open';
  if(row.status===status)throw Error('التذكرة بهذه الحالة بالفعل.');
  const ch=await current.guild.channels.fetch(row.channel_id),old=ch.permissionOverwrites.cache.get(row.user_id);
  let allow=old?.allow.bitfield || 0n,deny=old?.deny.bitfield || 0n;
  if(status==='closed'){allow&=~F.SendMessages;deny|=F.SendMessages;}else{deny&=~F.SendMessages;allow|=F.SendMessages;}
  await rest().put('/channels/'+ch.id+'/permissions/'+row.user_id,{signal,body:{id:row.user_id,type:1,allow:allow.toString(),deny:deny.toString()},reason:'Diskoko reviewed ticket state'});
 }
 const changed=await store.db.query("UPDATE control_center_tickets SET status=$7,assigned_to=$8,state_version=state_version+1,updated_at=NOW(),first_assigned_at=CASE WHEN $8::text IS NOT NULL THEN COALESCE(first_assigned_at,NOW()) ELSE first_assigned_at END,closed_at=CASE WHEN $7='closed' THEN COALESCE(closed_at,NOW()) ELSE NULL END WHERE command_id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_id=$4 AND id=$5 AND state_version=$6 RETURNING id",[...params,status,assigned]);
 if(!changed.rows.length)throw Error('تغيرت التذكرة؛ راجع القناة والسجل قبل المحاولة.');
 const warning=await logCenterTicket({settings:await store.settings(),guild:current.guild,actor:current.actor,ticket:row,action:opsLabels[a],rest,signal,key:interaction.id+':'+a});
 return 'حالة التذكرة: '+statuses[status]+' · المسؤول: '+(assigned || 'غير معيّن')+warning;
}

export async function diagnoseCenter(guild,actor,settings){
 const me=await guild.members.fetchMe({force:true}),lines=[];
 const flags=[[F.ViewChannel,'عرض القنوات'],[F.SendMessages,'إرسال الرسائل'],[F.EmbedLinks,'تضمين الروابط'],[F.ManageChannels,'إدارة القنوات'],[F.ManageRoles,'إدارة الرتب'],[F.ManageMessages,'إدارة الرسائل'],[F.ModerateMembers,'مهل الأعضاء'],[F.KickMembers,'الطرد'],[F.BanMembers,'الحظر']];
 for(const [flag,label] of flags)lines.push((me.permissions.has(flag)?'✅':'⚠️')+' '+label+(me.permissions.has(flag)?'':' — امنحها للبوت للوظائف التي تحتاجها فقط.'));
 lines.push(guild.client.options.intents.has(I.GuildMembers)?'✅ استقبال دخول الأعضاء':'⚠️ الرتب والترحيب: فعّل Server Members Intent وأعد اتصال البوت.');
 lines.push(guild.client.options.intents.has(I.MessageContent)?'✅ قراءة المحتوى للوظائف المعدّة':'⚠️ الردود وفلترة الكلمات: فعّل Message Content Intent وأعد الاتصال.');
 for(const [name,cid] of [['الأذكار',settings.dhikr?.channel],['الترحيب',settings.welcome?.channel],['مدخل التذاكر',settings.ticketChannel],['التقديمات',settings.application?.channel],['سجل الإدارة',settings.logChannel],['سجل الرسائل',settings.messageLogChannel]]){
  if(!cid){lines.push('▫️ '+name+': غير معدّ');continue;}
  try{const ch=await guild.channels.fetch(cid);if(!ch || !ch.permissionsFor(actor)?.has(F.ViewChannel)){lines.push('⚠️ '+name+': القناة محذوفة أو لا يمكنك عرضها.');continue;}
   const ok=ch.permissionsFor(me)?.has(F.ViewChannel|F.SendMessages),privateLog=!name.startsWith('سجل') || !ch.permissionsFor(guild.id)?.has(F.ViewChannel);
   lines.push(ok && privateLog?'✅ '+name+': القناة جاهزة':'⚠️ '+name+': راجع العرض والإرسال، واجعل قنوات السجل خاصة.');
  }catch{lines.push('⚠️ '+name+': تعذر فحص القناة؛ راجع ربط البوت.');}
 }
 if(settings.joinRole){const role=await guild.roles.fetch(settings.joinRole);lines.push(role && !role.managed && role.id!==guild.id && !role.permissions.has(F.Administrator) && role.comparePositionTo(me.roles.highest)<0?'✅ رتبة الدخول أدنى من البوت':'⚠️ رتبة الدخول: اختر رتبة غير إدارية أدنى من أعلى رتبة للبوت.');}
 return lines.join('\n');
}

// Host-backed screens also work with already-published project routers: unknown actions carry their ID to admin.center.
export async function centerOperations({operation,state,design,store,current,command,interaction,preview}){
 const a=operation.id,v=valueOf(interaction,operation),values=interaction?.values || operation.data?.values || [];
 const card=(title,text,controls=[])=>centerCard(design,state,title,clipped(text,3900),[...controls,home()]);
 const review=async(op,summary)=>{state.centerReview=await store.review(op,interaction?.user?.id || '100000000000000001',interaction?.id || randomUUID());return card('راجع '+opsLabels[op.id],summary+'\n\nتخص هذه اللوحة والسيرفر والبوت فقط.',[button('أؤكد التنفيذ','confirm',0,3),button('إلغاء','cancel',0)]);};
 const s=await store.settings();
 if(a==='tools_open')return card('مركز المتابعة','اختر الأداة. الفحص والعرض لا يغيران Discord؛ الإرسال وتغيير الحالات يحتاجان تأكيدًا.',[menu('tools_menu','اختر الأداة',[['dhikr','الأذكار والمحتوى'],['tickets','التذاكر'],['applications','التقديمات'],['logs','سجل الإدارة'],['health','الصلاحيات والتشخيص']].map(([value,label])=>({value,label})))]);
 if(a==='tools_menu'){
  if(!['dhikr','tickets','applications','logs','health'].includes(v))throw Error('أداة غير معروفة.');state.opsArea=v;state.opsPage=0;delete state.opsTicket;delete state.opsApplication;
 }
 if(a==='tools_health' || state.opsArea==='health' && a==='tools_menu')return card('الصلاحيات والتشخيص',preview?'معاينة: يظهر هنا تشخيص الصلاحيات الفعلية دون تعديلها.':await diagnoseCenter(current.guild,current.actor,s),[button('إعادة الفحص','tools_health',0)]);
 if(a==='tools_draft' || a==='tools_draft_channel' || a==='tools_draft_types' || a==='tools_draft_interval' || a==='tools_draft_zone' || a==='tools_draft_role' || a==='tools_channels_next' || a==='tools_channels_prev'){
  if(a==='tools_draft'){state.dhikrDraft={...(s.dhikr || {types:['tasbih','dua'],interval:'30',timezone:'Asia/Riyadh',mention:''})};state.opsChannelPage=0;}
  const draft=state.dhikrDraft;if(!draft)throw Error('افتح إعداد الأذكار من جديد.');
  if(a==='tools_draft_channel')draft.channel=v;
  if(a==='tools_draft_types'){if(!values.length || values.some(k=>!Object.hasOwn(dhikrCategories,k)))throw Error('اختر نوعًا صالحًا.');draft.types=values;}
  if(a==='tools_draft_interval'){if(!Object.hasOwn(dhikrIntervals,v))throw Error('فترة غير صالحة.');draft.interval=v;if(v==='daily')draft.types=['morning','evening'];}
  if(a==='tools_draft_zone'){if(!Object.hasOwn(dhikrZones,v))throw Error('منطقة غير صالحة.');draft.timezone=v;}
  if(a==='tools_draft_role'){if(v!=='none' && !/^\d{17,20}$/.test(v))throw Error('رتبة غير صالحة.');draft.mention=v==='none'?'':v;}
  if(a==='tools_channels_next')state.opsChannelPage=Math.min(99,(state.opsChannelPage || 0)+1);
  if(a==='tools_channels_prev')state.opsChannelPage=Math.max(0,(state.opsChannelPage || 0)-1);
  const channels=preview?[{id:'444444444444444444',name:'قناة الأذكار'}]:[...(await current.guild.channels.fetch()).values()].filter(ch=>[0,5].includes(ch?.type) && ch.permissionsFor(current.actor)?.has(F.ViewChannel|F.SendMessages)).sort((x,y)=>x.rawPosition-y.rawPosition);
  const page=Math.min(state.opsChannelPage || 0,Math.max(0,Math.ceil(channels.length/25)-1));state.opsChannelPage=page;
  const opts=(o,selected)=>Object.entries(o).map(([value,label])=>({value,label,default:Array.isArray(selected)?selected.includes(value):selected===value}));
  const controls=[...(channels.length?[menu('tools_draft_channel','اختر قناة الأذكار · '+(page+1),channels.slice(page*25,page*25+25).map(ch=>({value:ch.id,label:clipped(ch.name,90),default:draft.channel===ch.id})),0)]:[]),menu('tools_draft_types','اختر أنواع الأذكار',opts(dhikrCategories,draft.types),1,{minValues:1,maxValues:10}),menu('tools_draft_interval','الفترة',opts(dhikrIntervals,draft.interval),2),menu('tools_draft_zone','المنطقة الزمنية',opts(dhikrZones,draft.timezone || 'Asia/Riyadh'),3),button('راجع الحفظ','tools_draft_save',4,3),button('المنشن','tools_roles',4),button('◀ قنوات','tools_channels_prev',4),button('قنوات ▶','tools_channels_next',4)];
  return centerCard(design,state,'إعداد الأذكار باختيارات عربية','القناة: '+(draft.channel?'<#'+draft.channel+'>':'اختر قناة')+'\nالأنواع: '+(draft.types || []).map(t=>dhikrCategories[t]).join('، ')+'\nالفترة: '+dhikrIntervals[draft.interval]+'\nالمنشن: '+(draft.mention?'<@&'+draft.mention+'>':'بدون')+'\nالحفظ يحتاج مراجعة؛ لا يرسل شيئًا ولا يشغّل الجدول تلقائيًا.',[...controls,home()]);
 }
 if(a==='tools_roles' || a==='tools_roles_next' || a==='tools_roles_prev'){
  const roles=preview?[]:[...(await current.guild.roles.fetch()).values()].filter(r=>r.id!==current.guild.id && r.mentionable).sort((x,y)=>x.name.localeCompare(y.name));
  let page=state.opsRolePage || 0;if(a==='tools_roles_next')page++;if(a==='tools_roles_prev')page--;page=Math.max(0,Math.min(page,Math.max(0,Math.ceil(roles.length/24)-1)));state.opsRolePage=page;
  return card('رتبة تنبيه الأذكار','تظهر الرتب القابلة للمنشن. الإرسال التجريبي لا يعمل منشن. صفحة '+(page+1),[menu('tools_draft_role','اختر رتبة أو بدون',[{label:'بدون منشن',value:'none'},...roles.slice(page*24,page*24+24).map(r=>({value:r.id,label:clipped(r.name,95)}))]),button('◀ السابق','tools_roles_prev'),button('التالي ▶','tools_roles_next')]);
 }
 if(a==='tools_draft_save')return review({id:'ops.dhikr.configure',data:{config:dhikrConfig(state.dhikrDraft || {})}},'حفظ الإعداد الجديد سيوقف الجدول السابق. شغّله بعد الحفظ من شاشة الأذكار.');
 if(a==='tools_dhikr_test'){if(!s.dhikr)throw Error('أكمل إعداد الأذكار أولًا.');return review({id:'ops.dhikr.test',data:{config:dhikrConfig(s.dhikr)}},'ستُرسل رسالة تجريبية واحدة إلى <#'+s.dhikr.channel+'> دون منشن، ولن يتغير الجدول.');}
 if(a==='tools_library' || a==='tools_library_choose'){
  const selected=a==='tools_library_choose'?v:'tasbih';if(!Object.hasOwn(dhikrLibrary,selected))throw Error('قسم محتوى غير معروف.');
  return card('مكتبة الأذكار · '+dhikrCategories[selected],dhikrLibrary[selected].map(formatDhikr).join('\n\n────────\n\n'),[menu('tools_library_choose','اختر قسم المحتوى',Object.entries(dhikrCategories).map(([value,label])=>({value,label}))),button('إعداد الأذكار','tools_draft',3)]);
 }
 if(a==='tools_dhikr' || a==='tools_menu' && state.opsArea==='dhikr')return {dhikr:true};
 if(a==='tools_tickets' || a==='tools_ticketfilter' || a==='tools_ticket_next' || a==='tools_ticket_prev' || a==='tools_menu' && state.opsArea==='tickets'){
  if(a==='tools_ticketfilter'){if(!['all','open','closed','mine'].includes(v))throw Error('فلتر غير صالح.');state.opsTicketFilter=v;state.opsPage=0;}
  if(a==='tools_ticket_next')state.opsPage=Math.min(999,(state.opsPage || 0)+1);if(a==='tools_ticket_prev')state.opsPage=Math.max(0,(state.opsPage || 0)-1);
  const filter=state.opsTicketFilter || 'open',page=state.opsPage || 0,rows=preview?[]:(await store.db.query("SELECT id,user_id,channel_id,status,assigned_to,created_at FROM control_center_tickets WHERE command_id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_id=$4 AND ($5='all' OR $5='mine' AND assigned_to=$6 OR status=$5) ORDER BY created_at DESC,id DESC LIMIT 11 OFFSET $7",[...store.scope,filter,interaction.user.id,page*10])).rows;
  const counts=preview?[]:(await store.db.query('SELECT status,COUNT(*)::int AS count,ROUND(AVG(EXTRACT(EPOCH FROM (first_assigned_at-created_at))/60)) AS response_minutes,ROUND(AVG(EXTRACT(EPOCH FROM (closed_at-created_at))/60)) AS resolution_minutes FROM control_center_tickets WHERE command_id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_id=$4 GROUP BY status',store.scope)).rows;
  return card('متابعة التذاكر','الصفحة '+(page+1)+' · '+counts.map(r=>(statuses[r.status] || r.status)+': '+r.count+(r.response_minutes!=null?' · متوسط الاستلام '+r.response_minutes+' د':'')+(r.resolution_minutes!=null?' · متوسط الإغلاق '+r.resolution_minutes+' د':'')).join(' · ')+'\n'+(rows.length?rows.slice(0,10).map(r=>'<#'+r.channel_id+'> · '+statuses[r.status]+' · المسؤول: '+(r.assigned_to || 'غير معيّن')).join('\n'):'لا توجد تذاكر مطابقة.'),[menu('tools_ticketfilter','تصفية التذاكر',[['open','المفتوحة'],['closed','المغلقة'],['mine','المسندة لي'],['all','الكل']].map(([value,label])=>({value,label}))),...(rows.length?[menu('tools_ticket','اختر تذكرة',rows.slice(0,10).map(r=>({value:r.id,label:'تذكرة '+r.user_id,description:statuses[r.status]})),1)]:[]),button('◀ السابق','tools_ticket_prev'),...(rows.length>10?[button('التالي ▶','tools_ticket_next')]:[])]);
 }
 if(a==='tools_ticket' || a==='tools_archive' || a==='tools_archive_next' || a==='tools_archive_prev' || /^tools_ticket_(take|release|close|reopen|archive)$/.test(a)){
  if(a==='tools_ticket'){if(!uuid(v))throw Error('اختر تذكرة.');state.opsTicket=v;state.archivePage=0;}
  if(!uuid(state.opsTicket))throw Error('اختر تذكرة من القائمة.');
  const row=preview?null:(await store.db.query('SELECT * FROM control_center_tickets WHERE command_id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_id=$4 AND id=$5',[...store.scope,state.opsTicket])).rows[0];if(!row)throw Error('التذكرة غير موجودة.');
  // Fresh channel access is mandatory even for an old stored archive.
  const op={id:'ops.ticket.archive',data:{id:row.id,version:row.state_version}};await authorizeOps({operation:op,store,current});
  if(a.startsWith('tools_ticket_')){op.id='ops.ticket.'+a.slice('tools_ticket_'.length);await authorizeOps({operation:op,store,current});return review(op,'التذكرة: <#'+row.channel_id+'>\nالحالة الحالية: '+statuses[row.status]+(op.id.endsWith('.archive')?'\nستُحفظ لقطة حتى آخر 100 رسالة داخل مساحة هذه اللوحة فقط.':''));}
  if(a.startsWith('tools_archive')){
   if(!row.archive)throw Error('أرشف التذكرة أولًا.');if(a==='tools_archive_next')state.archivePage=(state.archivePage || 0)+1;if(a==='tools_archive_prev')state.archivePage=(state.archivePage || 0)-1;
   const messages=(row.archive.messages || []).flatMap(m=>{const text=String(m.content || '')+'\n'+m.attachments.map(f=>f.name+': '+f.url).join('\n'),chunks=[];for(let i=0;i<Math.max(1,text.length);i+=2800)chunks.push({...m,part:text.slice(i,i+2800)});return chunks;}),page=Math.max(0,Math.min(state.archivePage || 0,Math.max(0,messages.length-1)));state.archivePage=page;const m=messages[page];
   return card('أرشيف خاص · '+(page+1)+' / '+messages.length,'لقطة: '+stamp(row.archive.capturedAt)+'\n'+(m?'العضو: '+m.authorId+' · '+stamp(m.createdAt)+'\n'+m.part:'لا توجد رسائل في اللقطة.'),[button('◀ السابق','tools_archive_prev'),button('التالي ▶','tools_archive_next'),button('قائمة التذاكر','tools_tickets')]);
  }
  return card('تفاصيل التذكرة','القناة: <#'+row.channel_id+'>\nصاحبها: '+row.user_id+'\nالحالة: '+statuses[row.status]+'\nالمسؤول: '+(row.assigned_to || 'غير معيّن')+'\nالإنشاء: '+stamp(row.created_at)+'\nآخر تحديث: '+stamp(row.updated_at)+'\nالأرشيف: '+stamp(row.archive?.capturedAt),[button('استلام','tools_ticket_take',0),button('إلغاء استلام','tools_ticket_release',0),button(row.status==='closed'?'إعادة فتح':'إغلاق',row.status==='closed'?'tools_ticket_reopen':'tools_ticket_close',0,row.status==='closed'?3:4),button('حفظ أرشيف','tools_ticket_archive',1),...(row.archive?[button('عرض الأرشيف','tools_archive',1)]:[]),button('قائمة التذاكر','tools_tickets',2)]);
 }
 if(a==='tools_applications' || a==='tools_appfilter' || a==='tools_app_next' || a==='tools_app_prev' || a==='tools_menu' && state.opsArea==='applications'){
  if(a==='tools_appfilter'){if(!['all','pending','accepted','rejected'].includes(v))throw Error('فلتر غير صالح.');state.opsAppFilter=v;state.opsPage=0;}
  if(a==='tools_app_next')state.opsPage=Math.min(999,(state.opsPage || 0)+1);if(a==='tools_app_prev')state.opsPage=Math.max(0,(state.opsPage || 0)-1);
  const filter=state.opsAppFilter || 'pending',page=state.opsPage || 0,rows=preview?[]:(await store.db.query("SELECT id,user_id,status,created_at FROM control_center_submissions WHERE command_id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_id=$4 AND ($5='all' OR status=$5) ORDER BY created_at DESC,id DESC LIMIT 11 OFFSET $6",[...store.scope,filter,page*10])).rows;
  const counts=preview?[]:(await store.db.query('SELECT status,COUNT(*)::int AS count FROM control_center_submissions WHERE command_id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_id=$4 GROUP BY status',store.scope)).rows;
  return card('متابعة التقديمات','صفحة '+(page+1)+' · '+counts.map(r=>statuses[r.status]+': '+r.count).join(' · ')+'\n'+(rows.length?rows.slice(0,10).map(r=>r.user_id+' · '+statuses[r.status]).join('\n'):'لا توجد طلبات مطابقة.'),[menu('tools_appfilter','حالة الطلبات',[['pending','بانتظار المراجعة'],['accepted','المقبولة'],['rejected','المرفوضة'],['all','الكل']].map(([value,label])=>({value,label}))),...(rows.length?[menu('tools_application','اختر طلبًا',rows.slice(0,10).map(r=>({value:r.id,label:'طلب '+r.user_id,description:statuses[r.status]})),1)]:[]),button('◀ السابق','tools_app_prev'),...(rows.length>10?[button('التالي ▶','tools_app_next')]:[])]);
 }
 if(a==='tools_application' || a==='tools_answer' || /^tools_app_(accept|reject|reset)$/.test(a)){
  if(a==='tools_application'){if(!uuid(v))throw Error('اختر طلبًا.');state.opsApplication=v;state.opsAnswer=0;}
  if(!uuid(state.opsApplication))throw Error('اختر طلبًا من القائمة.');const row=preview?null:(await store.db.query('SELECT * FROM control_center_submissions WHERE command_id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_id=$4 AND id=$5',[...store.scope,state.opsApplication])).rows[0];if(!row)throw Error('الطلب غير موجود.');
  if(a.startsWith('tools_app_'))return review({id:'ops.application.'+a.slice('tools_app_'.length),data:{id:row.id,version:row.state_version}},'العضو: '+row.user_id+'\nالحالة الحالية: '+statuses[row.status]+'\nتغيير الحالة فقط؛ دون منح رتبة أو إرسال رسالة.');
  const answers=Object.entries(row.answers || {});if(a==='tools_answer'){if(!/^\d$/.test(v) || !answers[Number(v)])throw Error('إجابة غير صالحة.');state.opsAnswer=Number(v);}const answer=answers[state.opsAnswer || 0];
  return card('تفاصيل التقديم','العضو: '+row.user_id+'\nالحالة: '+statuses[row.status]+'\nالمراجع: '+(row.reviewer_id || 'لم يُراجع')+'\nالتحديث: '+stamp(row.reviewed_at || row.created_at)+'\n\n'+(answer?answer[0]+'\n'+answer[1]:'لا توجد إجابات.'),[...(answers.length?[menu('tools_answer','عرض إجابة',answers.map(([question],i)=>({value:String(i),label:clipped(question,95)})))]:[]),button('قبول','tools_app_accept',2,3),button('رفض','tools_app_reject',2,4),button('إعادة للمراجعة','tools_app_reset',2),button('قائمة التقديمات','tools_applications',3)]);
 }
 if(a==='tools_logs' || a==='tools_log_status' || a==='tools_log_days' || a==='tools_log_actor' || a==='tools_log_next' || a==='tools_log_prev' || a==='tools_menu' && state.opsArea==='logs'){
  if(a==='tools_log_status'){if(!['all','succeeded','review_required','pending','failed'].includes(v))throw Error('فلتر غير صالح.');state.logStatus=v;state.logPage=0;}
  if(a==='tools_log_days'){if(!['7','30','90'].includes(v))throw Error('فترة غير صالحة.');state.logDays=Number(v);state.logPage=0;}
  if(a==='tools_log_actor'){if(!['all','me'].includes(v))throw Error('فلتر غير صالح.');state.logActor=v;state.logPage=0;}
  if(a==='tools_log_next')state.logPage=Math.min(999,(state.logPage || 0)+1);if(a==='tools_log_prev')state.logPage=Math.max(0,(state.logPage || 0)-1);
  const page=state.logPage || 0,rows=preview?[]:(await store.db.query(`SELECT * FROM (
   SELECT id::text,user_id,operation->>'id' AS kind,status,error,created_at FROM control_center_reviews WHERE command_id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_id=$4
   UNION ALL SELECT id::text,NULL::text AS user_id,kind,CASE WHEN status='completed' THEN 'succeeded' ELSE status END AS status,error,created_at FROM control_center_events WHERE command_id=$1 AND owner_id=$2 AND guild_id=$3 AND bot_id=$4
   UNION ALL SELECT 'run-'||r.id::text,NULL::text,'خطأ تشغيل الأمر','failed',r.error,r.created_at FROM code_command_runs r JOIN code_commands c ON c.id=r.command_id WHERE c.id=$1 AND c.owner_id=$2 AND c.guild_id=$3 AND c.bot_user_id=$4 AND r.success=FALSE
  ) e WHERE created_at>NOW()-($5::int*INTERVAL '1 day') AND ($6='all' OR status=$6) AND ($7::text IS NULL OR user_id=$7) ORDER BY created_at DESC,id DESC LIMIT 6 OFFSET $8`,[...store.scope,state.logDays || 30,state.logStatus || 'all',state.logActor==='me'?interaction.user.id:null,page*5])).rows;
  return card('سجل الإدارة · صفحة '+(page+1),rows.length?rows.slice(0,5).map(r=>(opsLabels[r.kind] || controlActions[r.kind]?.label || r.kind)+' · '+(statuses[r.status] || r.status)+'\nالمشرف: '+(r.user_id || 'أتمتة')+' · '+stamp(r.created_at)+'\nمرجع: '+r.id+(r.error?'\nالسبب: '+clipped(r.error,250):'')).join('\n\n'):'لا توجد عمليات مطابقة. نتائج Discord غير المؤكدة لا يعاد تنفيذها تلقائيًا.',[menu('tools_log_status','نتيجة التنفيذ',[['all','كل النتائج'],['succeeded','الناجحة'],['review_required','تحتاج مراجعة'],['failed','أخطاء تشغيل الأمر'],['pending','بانتظار التأكيد']].map(([value,label])=>({value,label}))),menu('tools_log_days','الفترة',[7,30,90].map(n=>({value:String(n),label:'آخر '+n+' يومًا'})),1),menu('tools_log_actor','المشرف',[{value:'all',label:'الجميع والأتمتة'},{value:'me',label:'عملياتي فقط'}],2),button('◀ السابق','tools_log_prev'),...(rows.length>5?[button('التالي ▶','tools_log_next')]:[])]);
 }
 throw Error('انتهت شاشة المتابعة؛ افتح مركز المتابعة مجددًا.');
}
