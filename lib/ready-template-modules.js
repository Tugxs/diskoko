import { randomUUID } from 'node:crypto';
import { PermissionFlagsBits } from 'discord.js';
import { READY_MODULE_TYPES, READY_MODULE_FIELDS, moduleWorkflow } from './ready-template-module-types.js';
import { moduleFormTools, validateModuleSubmission, moduleModalFields } from './module-form-tools.js';
import { workflowStages,workflowStageLabels } from './module-workflow-tools.js';
import { migrateWorkflowHistory,recordWorkflowHistory } from './workflow-history.js';

export async function migrateReadyTemplateModules(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS ready_template_module_panels (
    id UUID PRIMARY KEY, run_id UUID NOT NULL REFERENCES ready_template_runs(id) ON DELETE CASCADE,
    module_key TEXT NOT NULL, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, message_id TEXT,
    review_channel_id TEXT, staff_role_id TEXT, role_id TEXT, publishing_bot_id TEXT NOT NULL,
    config JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(run_id,module_key)
  );
  CREATE TABLE IF NOT EXISTS ready_template_module_entries (
    id UUID PRIMARY KEY, panel_id UUID NOT NULL REFERENCES ready_template_module_panels(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL, subject TEXT NOT NULL, details TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new', review_message_id TEXT,
    public_message_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS ready_template_module_entries_user ON ready_template_module_entries(panel_id,user_id,created_at DESC);
  CREATE TABLE IF NOT EXISTS ready_template_module_votes (
    entry_id UUID NOT NULL REFERENCES ready_template_module_entries(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(entry_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS ready_template_module_signups (
    panel_id UUID NOT NULL REFERENCES ready_template_module_panels(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(panel_id,user_id)
  );
  ALTER TABLE ready_template_module_entries ADD COLUMN IF NOT EXISTS public_message_id TEXT;
  ALTER TABLE ready_template_module_entries ADD COLUMN IF NOT EXISTS answers JSONB NOT NULL DEFAULT '[]';
  ALTER TABLE ready_template_module_entries ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';`);
  await pool.query("ALTER TABLE ready_template_module_signups ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed'; ALTER TABLE ready_template_module_signups ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;");
  await pool.query("CREATE TABLE IF NOT EXISTS ready_template_module_event_notices(panel_id UUID PRIMARY KEY REFERENCES ready_template_module_panels(id) ON DELETE CASCADE,status TEXT NOT NULL,message_id TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());");
  await migrateWorkflowHistory(pool);
}

const rows = buttons => [{ type: 1, components: buttons }];
const button = (label, id, style = 1) => ({ type: 2, style, label: label.slice(0, 80), custom_id: id });
const isStaff = (interaction, roleId) => interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || Boolean(roleId && interaction.member?.roles?.cache?.has(roleId));
const safe = value => String(value || '').replace(/@/g, '@\u200b').slice(0, 1000);

function workflowEmbed(config,entry,status){status += entry.metadata?.stage?' · '+workflowStageLabels[entry.metadata.stage]:'';const fields=(entry.answers || []).slice(0,5).map(answer=>({name:safe(answer.label).slice(0,45),value:safe(answer.value)||'—'}));return {title:safe(config.title).slice(0,256),description:(fields.length?`صاحب الطلب / Member: <@${entry.user_id}>\nالحالة / Status: **${status}**\n${entry.metadata?.reason || ''}${entry.metadata?.memberReply?'\nإجابة العضو / Member reply: '+safe(entry.metadata.memberReply):''}`:`**${safe(entry.subject).slice(0,120)}**\n${safe(entry.details)}\nالحالة / Status: **${status}**\n${safe(entry.metadata?.reason).slice(0,500)}`).slice(0,fields.length?400:2000),...(fields.length?{fields}:{}),color:parseInt(config.color.slice(1),16)};}
const managementButtons=(id,complete=false,editable=false)=>rows([...(complete?[button('تم الإنجاز / Complete',`diskoko:module-review:${id}:completed`,3)]:[]),button('إدارة الطلب / Manage',`diskoko:module-manage:${id}`,2),button('سجل الفريق / Staff history',`diskoko:module-staff-history:${id}`,2),button('طلب تفاصيل / Ask details',`diskoko:module-ask:${id}`,2),...(editable?[button('تحديث المشاركة / Update entry',`diskoko:module-public-edit:${id}`,2)]:[])]);

export async function handleReadyModuleInteraction(interaction, pool) {
  if (!interaction.customId?.startsWith('diskoko:module')) return false;
  const [prefix, kind, id, action] = interaction.customId.split(':');
  if (prefix !== 'diskoko' || !/^[0-9a-f-]{36}$/i.test(id || '') || !interaction.guildId) {
    await interaction.reply({ content: 'هذه اللوحة غير صالحة. / Invalid panel.', ephemeral: true }); return true;
  }
  if(kind==='module-public-edit' || kind==='module-public-save'){
    const entry=(await pool.query('SELECT e.*,p.guild_id,p.review_channel_id,p.staff_role_id,p.publishing_bot_id,p.channel_id,p.config FROM ready_template_module_entries e JOIN ready_template_module_panels p ON p.id=e.panel_id WHERE e.id=$1',[id])).rows[0];
    if(!entry || moduleWorkflow(entry.config.kind)!=='submissions' || entry.status!=='approved' || !entry.public_message_id || entry.guild_id!==interaction.guildId || entry.review_channel_id!==interaction.channelId || entry.review_message_id!==interaction.message?.id || entry.publishing_bot_id!==interaction.client.user.id || !isStaff(interaction,entry.staff_role_id)){await interaction.reply({content:'تعديل المشاركة المنشورة غير متاح / Published entry cannot be edited',ephemeral:true});return true;}
    const fields=moduleModalFields(entry.config);
    if(kind==='module-public-edit' && interaction.isButton()){await interaction.showModal({custom_id:`diskoko:module-public-save:${id}`,title:'تحديث المشاركة / Update entry',components:fields.map(field=>({type:18,label:field.label,component:{type:4,custom_id:field.id,style:field.style,required:field.required,max_length:field.maxLength,...(field.minLength?{min_length:field.minLength}:{}),value:(entry.answers?.find(answer=>answer.id===field.id)?.value || (field.id==='subject'?entry.subject:field.id==='details'?entry.details:'')).slice(0,field.maxLength)}}))});return true;}
    if(kind==='module-public-save' && interaction.isModalSubmit()){
      await interaction.deferReply({ephemeral:true});let submitted;try{submitted=validateModuleSubmission(entry.config,Object.fromEntries(fields.map(field=>[field.id,interaction.fields.getTextInputValue(field.id)])));}catch{await interaction.editReply('راجع إجابات النموذج / Check form answers');return true;}
      const target=await interaction.client.channels.fetch(entry.channel_id).catch(()=>null),message=await target?.messages.fetch(entry.public_message_id).catch(()=>null);if(!target || target.guildId!==interaction.guildId || !message || message.author?.id!==interaction.client.user.id){await interaction.editReply('تعذر التحقق من الرسالة المنشورة / Published message could not be verified');return true;}
      const claimed=await pool.query("UPDATE ready_template_module_entries SET status='updating' WHERE id=$1 AND status='approved' RETURNING id",[id]);if(!claimed.rowCount){await interaction.editReply('تغيّرت حالة المشاركة / Entry state changed');return true;}
      try{await message.edit({embeds:[{title:safe(submitted.subject).slice(0,256),description:safe(submitted.details).slice(0,350),...(submitted.answers?.length?{fields:submitted.answers.map(answer=>({name:safe(answer.label).slice(0,45),value:safe(answer.value)||'—'}))}:{}),color:parseInt(entry.config.color.slice(1),16)}],allowedMentions:{parse:[]}});await pool.query("UPDATE ready_template_module_entries SET status='approved',subject=$2,details=$3,answers=$4::jsonb,updated_at=NOW() WHERE id=$1 AND status='updating'",[id,submitted.subject,submitted.details,JSON.stringify(submitted.answers || [])]);await interaction.editReply('عُدّلت المشاركة نفسها دون نشر نسخة إضافية / Existing entry updated without duplication');}catch{await pool.query("UPDATE ready_template_module_entries SET status='update_uncertain' WHERE id=$1 AND status='updating'",[id]).catch(()=>{});await interaction.editReply('تعذر تأكيد التحديث. راجع الرسالة قبل إعادة التنفيذ / Update uncertain; inspect the message before retrying');}return true;
    }return false;
  }
  if(kind==='module-search' || kind==='module-search-submit'){
    const panel=(await pool.query('SELECT * FROM ready_template_module_panels WHERE id=$1',[id])).rows[0];
    if(!panel || moduleWorkflow(panel.config.kind)!=='submissions' || panel.guild_id!==interaction.guildId || panel.channel_id!==interaction.channelId || panel.message_id!==interaction.message?.id || panel.publishing_bot_id!==interaction.client.user.id){await interaction.reply({content:'البحث غير متاح / Search unavailable',ephemeral:true});return true;}
    if(kind==='module-search' && interaction.isButton()){await interaction.showModal({custom_id:`diskoko:module-search-submit:${id}`,title:'بحث المكتبة / Search resources',components:[{type:1,components:[{type:4,custom_id:'query',label:'كلمات البحث أو التصنيف / Search words',style:1,required:true,max_length:100}]}]});return true;}
    if(kind==='module-search-submit' && interaction.isModalSubmit()){await interaction.deferReply({ephemeral:true});const query=String(interaction.fields.getTextInputValue('query') || '').trim().slice(0,100);if(!query){await interaction.editReply('اكتب كلمات البحث / Enter search words');return true;}const matches=(await pool.query("SELECT subject,public_message_id FROM ready_template_module_entries WHERE panel_id=$1 AND status='approved' AND public_message_id IS NOT NULL AND COALESCE(metadata->>'stage','')<>'archived' AND (STRPOS(LOWER(subject),LOWER($2))>0 OR STRPOS(LOWER(details),LOWER($2))>0) ORDER BY updated_at DESC LIMIT 10",[id,query])).rows;await interaction.editReply({content:matches.map(entry=>`[${safe(entry.subject).slice(0,80).replace(/[\[\]]/g,'')}](${`https://discord.com/channels/${panel.guild_id}/${panel.channel_id}/${entry.public_message_id}`})`).join('\n') || 'لا توجد نتائج منشورة / No published results',allowedMentions:{parse:[]}});return true;}return false;
  }
  if(['module-ask','module-ask-submit','module-reply','module-reply-submit','module-accept-delivery'].includes(kind)){
    const entry=(await pool.query('SELECT e.*,p.guild_id,p.review_channel_id,p.staff_role_id,p.publishing_bot_id,p.config FROM ready_template_module_entries e JOIN ready_template_module_panels p ON p.id=e.panel_id WHERE e.id=$1',[id])).rows[0];
    const staff=kind.startsWith('module-ask');
    if(!entry || entry.guild_id!==interaction.guildId || entry.publishing_bot_id!==interaction.client.user.id || (staff?entry.review_channel_id!==interaction.channelId || entry.review_message_id!==interaction.message?.id || !isStaff(interaction,entry.staff_role_id):entry.user_id!==interaction.user.id)) {await interaction.reply({content:'هذا الطلب غير متاح لك / Request unavailable',ephemeral:true});return true;}
    if(kind==='module-accept-delivery'){
      await interaction.deferReply({ephemeral:true});if(moduleWorkflow(entry.config.kind)!=='orders'){await interaction.editReply('لا يوجد تسليم لهذا الطلب / No delivery');return true;}
      const accepted=await pool.query("UPDATE ready_template_module_entries SET status='completed',metadata=metadata || $2::jsonb,updated_at=NOW() WHERE id=$1 AND status='approved' AND metadata->>'stage'='delivered' RETURNING id",[id,JSON.stringify({acceptedBy:interaction.user.id,acceptedAt:new Date().toISOString()})]);if(accepted.rowCount)await recordWorkflowHistory(pool,id,interaction.user.id,'delivery_accepted',{});await interaction.editReply(accepted.rowCount?'أُكد استلام الطلب / Delivery accepted':'التسليم غير متاح أو سبق تأكيده / Delivery unavailable or already accepted');return true;
    }
    if(interaction.isButton()){
      if(!staff && !entry.metadata?.question){await interaction.reply({content:'لا يوجد طلب تفاصيل / No pending question',ephemeral:true});return true;}
      await interaction.showModal({custom_id:`diskoko:${staff?'module-ask-submit':'module-reply-submit'}:${id}`,title:staff?'طلب تفاصيل / Ask details':'إجابة الفريق / Reply to team',components:[{type:1,components:[{type:4,custom_id:'text',label:staff?'ما التفاصيل المطلوبة؟ / Question':'إجابتك / Your answer',style:2,required:true,max_length:1000}]}]});return true;
    }
    if(interaction.isModalSubmit()){
      await interaction.deferReply({ephemeral:true});const text=String(interaction.fields.getTextInputValue('text') || '').trim();if(!text || text.length>1000){await interaction.editReply('راجع طول النص / Check answer length');return true;}
      if(staff){await recordWorkflowHistory(pool,id,interaction.user.id,'question',{text});await pool.query('UPDATE ready_template_module_entries SET metadata=metadata || $2::jsonb,updated_at=NOW() WHERE id=$1',[id,JSON.stringify({question:text,questionBy:interaction.user.id,questionAt:new Date().toISOString()})]);await interaction.editReply('حُفظ السؤال ويظهر لصاحب الطلب في المتابعة / Question saved in member tracking');}
      else {
        if(!entry.metadata?.question){await interaction.editReply('لم يعد هناك سؤال معلق / No pending question');return true;}
        const sent=await pool.query("UPDATE ready_template_module_entries SET metadata=(metadata - 'question') || $2::jsonb,updated_at=NOW() WHERE id=$1 AND metadata->>'question'=$3 RETURNING id",[id,JSON.stringify({lastQuestion:entry.metadata.question,memberReply:text,repliedAt:new Date().toISOString()}),entry.metadata.question]);
        if(sent.rowCount)await recordWorkflowHistory(pool,id,interaction.user.id,'member_reply',{text});if(!sent.rowCount){await interaction.editReply('تغير السؤال. افتح المتابعة مجددًا / Question changed; open tracking again');return true;}
        const channel=await interaction.client.channels.fetch(entry.review_channel_id).catch(()=>null);const message=await channel?.messages.fetch(entry.review_message_id).catch(()=>null);if(message)await message.edit({content:'إجابة العضو / Member reply: '+safe(text),embeds:[workflowEmbed(entry.config,{...entry,metadata:{...entry.metadata,question:undefined,memberReply:text}},entry.status)],components:managementButtons(id,entry.status==='approved' && ['orders','learning','tasks'].includes(moduleWorkflow(entry.config.kind))),allowedMentions:{parse:[]}}).catch(()=>{});await interaction.editReply('حُفظت إجابتك للفريق / Answer saved for team');
      }return true;
    }return false;
  }
  if(kind==='module-signup-status' && interaction.isButton()){
    await interaction.deferReply({ephemeral:true});const panel=(await pool.query('SELECT * FROM ready_template_module_panels WHERE id=$1',[id])).rows[0];if(!panel || panel.config.kind!=='events' || panel.guild_id!==interaction.guildId || panel.channel_id!==interaction.channelId || panel.message_id!==interaction.message?.id || panel.publishing_bot_id!==interaction.client.user.id){await interaction.editReply('الفعالية غير متاحة / Event unavailable');return true;}
    const signup=(await pool.query('SELECT status,checked_in_at FROM ready_template_module_signups WHERE panel_id=$1 AND user_id=$2',[id,interaction.user.id])).rows[0];await interaction.editReply(!signup?'لست مسجلًا / Not registered':signup.status==='waiting'?'أنت في قائمة الانتظار / On the waiting list':signup.checked_in_at?'تسجيلك وحضورك مؤكّدان / Registered and checked in':'تسجيلك مؤكّد / Registration confirmed');return true;
  }
  if(kind==='module-checkin' && interaction.isButton()){
    await interaction.deferReply({ephemeral:true});const panel=(await pool.query('SELECT * FROM ready_template_module_panels WHERE id=$1',[id])).rows[0];
    if(!panel || panel.config.kind!=='events' || !panel.config.checkIn || panel.guild_id!==interaction.guildId || panel.channel_id!==interaction.channelId || panel.message_id!==interaction.message?.id || panel.publishing_bot_id!==interaction.client.user.id || !panel.config.startsAt || Date.parse(panel.config.startsAt)>Date.now()){await interaction.editReply('تأكيد الحضور غير متاح بعد / Check-in unavailable');return true;}
    const changed=await pool.query("UPDATE ready_template_module_signups SET checked_in_at=NOW() WHERE panel_id=$1 AND user_id=$2 AND status='confirmed' AND checked_in_at IS NULL RETURNING user_id",[id,interaction.user.id]);await interaction.editReply(changed.rowCount?'تم تأكيد حضورك / Checked in':'يجب أن تكون مسجلًا وقد يكون حضورك مؤكّدًا بالفعل / Register first or already checked in');return true;
  }
  if(kind==='module-roles' && interaction.isStringSelectMenu?.()){
    await interaction.deferReply({ephemeral:true});
    const panel=(await pool.query('SELECT * FROM ready_template_module_panels WHERE id=$1',[id])).rows[0],chosen=interaction.values || [];
    if(!panel || panel.config.kind!=='interests' || panel.guild_id!==interaction.guildId || panel.channel_id!==interaction.channelId || panel.publishing_bot_id!==interaction.client.user.id || !Array.isArray(panel.config.roleIds) || chosen.length>panel.config.maxRoles || chosen.some(role=>!panel.config.roleIds.includes(role))){await interaction.editReply('اختيار رتب غير صالح / Invalid role selection');return true;}
    const member=await interaction.guild.members.fetch(interaction.user.id).catch(()=>null);
    const roles=await Promise.all(panel.config.roleIds.map(id=>interaction.guild.roles.fetch(id).catch(()=>null)));
    if(!member || roles.some(role=>!role || role.managed || !role.editable || role.id===interaction.guildId || BigInt(role.permissions.bitfield)!==0n)){await interaction.editReply('تغيّرت صلاحيات الرتب أو ترتيبها. يجب أن تراجع الإدارة اللوحة / Role permissions changed; ask an administrator to review');return true;}
    const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${id}:${interaction.user.id}`]);const current=await interaction.guild.members.fetch(interaction.user.id);for(const role of roles){const selected=chosen.includes(role.id),has=current.roles.cache.has(role.id);if(selected && !has)await current.roles.add(role,'Diskoko interest selection');else if(!selected && has)await current.roles.remove(role,'Diskoko interest selection');}await client.query('COMMIT');await interaction.editReply('حُفظ اختيار الاهتمامات / Interests saved');}catch(error){await client.query('ROLLBACK').catch(()=>{});await interaction.editReply('تعذر إكمال تغيير الرتب. راجع رتبك الحالية قبل المحاولة / Could not finish updating roles; review your current roles');}finally{client.release();}return true;
  }
  if(kind==='module-faq' && interaction.isStringSelectMenu?.()){
    await interaction.deferReply({ephemeral:true});
    const panel=(await pool.query('SELECT * FROM ready_template_module_panels WHERE id=$1',[id])).rows[0];
    const question=panel?.config?.questions?.find(item=>item.id===interaction.values?.[0]);
    if(!panel || panel.config.kind!=='faq' || panel.guild_id!==interaction.guildId || panel.channel_id!==interaction.channelId || panel.publishing_bot_id!==interaction.client.user.id || !question){await interaction.editReply('هذا السؤال لم يعد متاحًا / Question unavailable');return true;}
    await interaction.editReply({content:question.answer,allowedMentions:{parse:[]}});return true;
  }
  if(kind==='module-staff-history' && interaction.isButton()){
    const entry=(await pool.query('SELECT e.*,p.guild_id,p.review_channel_id,p.staff_role_id,p.publishing_bot_id FROM ready_template_module_entries e JOIN ready_template_module_panels p ON p.id=e.panel_id WHERE e.id=$1',[id])).rows[0];
    if(!entry || entry.guild_id!==interaction.guildId || entry.review_channel_id!==interaction.channelId || entry.review_message_id!==interaction.message?.id || entry.publishing_bot_id!==interaction.client.user.id || !isStaff(interaction,entry.staff_role_id)){await interaction.reply({content:'سجل الفريق خاص / Staff history is private',ephemeral:true});return true;}
    await interaction.deferReply({ephemeral:true});const history=(await pool.query('SELECT actor_id,kind,data,created_at FROM ready_template_module_history WHERE entry_id=$1 ORDER BY created_at DESC LIMIT 100',[id])).rows;await interaction.editReply({files:history.length?[{attachment:Buffer.from(JSON.stringify(history,null,2)),name:'staff-history-'+id.slice(0,8)+'.json'}]:[],content:history.slice(0,5).map(item=>new Date(item.created_at).toISOString()+' · '+item.kind+' · '+safe(item.actor_id)+'\n'+safe(JSON.stringify(item.data))).join('\n').slice(0,1900) || 'لا يوجد سجل بعد / No history yet',allowedMentions:{parse:[]}});return true;
  }
  if(kind==='module-manage' || kind==='module-metadata'){
    const entry=(await pool.query('SELECT e.*,p.guild_id,p.review_channel_id,p.staff_role_id,p.publishing_bot_id,p.config FROM ready_template_module_entries e JOIN ready_template_module_panels p ON p.id=e.panel_id WHERE e.id=$1',[id])).rows[0];
    if(!entry || entry.guild_id!==interaction.guildId || entry.review_channel_id!==interaction.channelId || entry.review_message_id!==interaction.message?.id || entry.publishing_bot_id!==interaction.client.user.id || !isStaff(interaction,entry.staff_role_id)){await interaction.reply({content:'إدارة الطلب للفريق المخوّل فقط. / Only authorized staff can manage requests.',ephemeral:true});return true;}
    if(kind==='module-manage' && interaction.isButton()){
      const select=(key,label,options)=>({type:18,label,component:{type:3,custom_id:key,min_values:0,max_values:1,required:false,options:options.map(([value,label])=>({value,label,default:entry.metadata?.[key]===value}))}});
      const text=(key,label,max,style=1)=>({type:18,label,component:{type:4,custom_id:key,style,required:false,max_length:max,...(entry.metadata?.[key]?{value:entry.metadata[key]}:{})}});
      await interaction.showModal({custom_id:'diskoko:module-metadata:'+id,title:'إدارة الطلب / Manage request',components:[text('owner','معرف المسؤول / Assignee ID',20),select('priority','الأولوية / Priority',[['low','منخفضة / Low'],['normal','عادية / Normal'],['high','عالية / High'],['urgent','عاجلة / Urgent']]),text('due','الموعد ISO / Due date',30),text('comment','تعليق داخلي / Internal note',500,2),select('stage','مرحلة الطلب / Stage',workflowStages(entry.config.kind).map(value=>[value,workflowStageLabels[value]]))]});return true;
    }
    if(kind==='module-metadata' && interaction.isModalSubmit()){await interaction.deferReply({ephemeral:true});const metadata=Object.fromEntries(['owner','due','comment'].map(key=>[key,String(interaction.fields.getTextInputValue(key) || '').trim()]));metadata.priority=interaction.fields.getStringSelectValues('priority')?.[0] || '';metadata.stage=interaction.fields.getStringSelectValues('stage')?.[0] || '';if(metadata.priority && !['low','normal','high','urgent'].includes(metadata.priority) || metadata.due && !Number.isFinite(Date.parse(metadata.due))){await interaction.editReply('راجع الأولوية والموعد.');return true;}if(metadata.owner){if(!/^\d{17,20}$/.test(metadata.owner)){await interaction.editReply('معرف المسؤول غير صالح.');return true;}const member=await interaction.guild.members.fetch(metadata.owner).catch(()=>null);if(!member || !(member.permissions?.has(PermissionFlagsBits.ManageGuild) || member.roles?.cache?.has(entry.staff_role_id))){await interaction.editReply('المسؤول يجب أن يكون من فريق المراجعة.');return true;}}if(metadata.stage && !workflowStages(entry.config.kind).includes(metadata.stage)){await interaction.editReply('المراحل المسموحة: '+workflowStages(entry.config.kind).join(', '));return true;}if(metadata.due)metadata.due=new Date(metadata.due).toISOString();if(metadata.stage==='delivered' && (moduleWorkflow(entry.config.kind)!=='orders' || entry.status!=='approved')){await interaction.editReply('التسليم يحتاج طلبًا مقبولًا / Delivery needs an accepted order');return true;}metadata.updatedBy=interaction.user.id;await recordWorkflowHistory(pool,id,interaction.user.id,'staff_update',metadata);await pool.query('UPDATE ready_template_module_entries SET metadata=metadata || $2::jsonb,updated_at=NOW() WHERE id=$1',[id,JSON.stringify(metadata)]);await interaction.editReply('حُفظت بيانات المسؤول والأولوية والموعد والمرحلة والتعليق الداخلي.');return true;}return false;
  }
  if(kind==='module-history' && interaction.isButton()){await interaction.deferReply({ephemeral:true});const panel=(await pool.query('SELECT * FROM ready_template_module_panels WHERE id=$1',[id])).rows[0];if(!panel || panel.guild_id!==interaction.guildId || panel.channel_id!==interaction.channelId || panel.message_id!==interaction.message?.id || panel.publishing_bot_id!==interaction.client.user.id){await interaction.editReply('هذه اللوحة غير متاحة. / Panel unavailable.');return true;}const entries=(await pool.query('SELECT id,status,subject FROM ready_template_module_entries WHERE panel_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 10',[id,interaction.user.id])).rows;await interaction.editReply({content:entries.map(entry=>`#${entry.id.slice(0,8)} · ${safe(entry.subject).slice(0,80)} · ${safe(entry.status)}`).join('\n') || 'لا توجد طلبات سابقة / No previous requests',components:entries.length?rows(entries.slice(0,5).map(entry=>button('#'+entry.id.slice(0,8),`diskoko:module-track:${entry.id}`,2))):[],allowedMentions:{parse:[]}});return true;}
  if(kind==='module-track' && interaction.isButton()){
    await interaction.deferReply({ephemeral:true});const entry=(await pool.query('SELECT e.*,p.guild_id,p.publishing_bot_id,p.config FROM ready_template_module_entries e JOIN ready_template_module_panels p ON p.id=e.panel_id WHERE e.id=$1',[id])).rows[0];
    if(!entry || entry.user_id!==interaction.user.id || entry.guild_id!==interaction.guildId || entry.publishing_bot_id!==interaction.client.user.id){await interaction.editReply('هذا الطلب لا يخصك أو لم يعد متاحًا. / This request is not yours or is unavailable.');return true;}
    const followup=[...(entry.metadata?.question?[button('إجابة الفريق / Reply to team',`diskoko:module-reply:${id}`,1)]:[]),...(entry.metadata?.stage==='delivered' && entry.status==='approved' && moduleWorkflow(entry.config.kind)==='orders'?[button('تأكيد الاستلام / Accept delivery',`diskoko:module-accept-delivery:${id}`,3)]:[])];
    await interaction.editReply({embeds:[workflowEmbed(entry.config,entry,entry.status)],...(entry.metadata?.question?{content:'سؤال الفريق / Team question: '+safe(entry.metadata.question)}:{}),...(followup.length?{components:rows(followup)}:{}),allowedMentions:{parse:[]}});return true;
  }
  if (kind === 'module-vote' && interaction.isButton()) {
    await interaction.deferReply({ ephemeral: true });
    const entry = (await pool.query(`SELECT e.id,e.status,e.subject,e.details,e.metadata,e.public_message_id,p.guild_id,p.channel_id,p.publishing_bot_id,p.config
      FROM ready_template_module_entries e JOIN ready_template_module_panels p ON p.id=e.panel_id WHERE e.id=$1`, [id])).rows[0];
    if (!entry || entry.status !== 'approved' || entry.metadata?.stage==='closed' || entry.config.kind !== 'suggestions' || entry.guild_id !== interaction.guildId || entry.channel_id !== interaction.channelId || entry.public_message_id !== interaction.message?.id || entry.publishing_bot_id !== interaction.client.user.id) { await interaction.editReply('التصويت على هذا الاقتراح غير متاح. / Voting is unavailable.'); return true; }
    const added = await pool.query('INSERT INTO ready_template_module_votes(entry_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [id, interaction.user.id]);
    if (!added.rowCount) await pool.query('DELETE FROM ready_template_module_votes WHERE entry_id=$1 AND user_id=$2', [id, interaction.user.id]);
    const votes = (await pool.query('SELECT COUNT(*)::int AS total FROM ready_template_module_votes WHERE entry_id=$1', [id])).rows[0].total;
    const existing=interaction.message.embeds?.[0]?.toJSON() || {};
    await interaction.message.edit({ embeds: [{...existing,title:safe(entry.subject).slice(0,256),description:`${safe(entry.details).slice(0,350)}\n\n👍 الأصوات: **${votes}**`,color:parseInt(entry.config.color.slice(1),16)}] }).catch(() => {});
    await interaction.editReply(added.rowCount ? 'وصل صوتك للاقتراح. / Your vote was recorded.' : 'أُلغي صوتك من الاقتراح. / Your vote was removed.'); return true;
  }
  if ((kind === 'module-review' && interaction.isButton()) || (kind==='module-decision' && interaction.isModalSubmit())) {
    if (!['approved', 'rejected', 'completed'].includes(action)) { await interaction.reply({content:'إجراء المراجعة غير صالح. / Invalid review action.',ephemeral:true});return true; }
    if(kind==='module-review' && action!=='completed'){const pending=(await pool.query('SELECT e.*,p.guild_id,p.review_channel_id,p.staff_role_id,p.publishing_bot_id FROM ready_template_module_entries e JOIN ready_template_module_panels p ON p.id=e.panel_id WHERE e.id=$1',[id])).rows[0];if(!pending || pending.guild_id!==interaction.guildId || pending.review_channel_id!==interaction.channelId || pending.review_message_id!==interaction.message?.id || pending.publishing_bot_id!==interaction.client.user.id || !isStaff(interaction,pending.staff_role_id)){await interaction.reply({content:'هذه المراجعة غير متاحة. / Review unavailable.',ephemeral:true});return true;}await interaction.showModal({custom_id:`diskoko:module-decision:${id}:${action}`,title:'سبب القرار / Decision reason',components:[{type:1,components:[{type:4,custom_id:'reason',label:'سبب القرار (اختياري) / Reason',style:2,required:false,max_length:500}]}]});return true;}
    await interaction.deferReply({ ephemeral: true });
    let reason=kind==='module-decision'?String(interaction.fields.getTextInputValue('reason') || '').trim().slice(0,500):'';
    if (!['approved', 'rejected', 'completed'].includes(action)) { await interaction.editReply('إجراء المراجعة غير صالح. / Invalid review action.'); return true; }
    const entry = (await pool.query(`SELECT e.*,p.guild_id,p.review_channel_id,p.staff_role_id,p.publishing_bot_id,p.config
      FROM ready_template_module_entries e JOIN ready_template_module_panels p ON p.id=e.panel_id WHERE e.id=$1`, [id])).rows[0];
    if (!entry || entry.guild_id !== interaction.guildId || entry.review_channel_id !== interaction.channelId || entry.review_message_id !== interaction.message?.id || entry.publishing_bot_id !== interaction.client.user.id) { await interaction.editReply('هذه المراجعة لم تعد متاحة. / Review no longer available.'); return true; }
    if (!isStaff(interaction, entry.staff_role_id)) { await interaction.editReply('هذه المراجعة مخصصة لفريق الإدارة. / Only authorized staff can review.'); return true; }
    if(action==='completed')reason=entry.metadata?.reason || '';
    if (action === 'completed' && !['orders', 'learning', 'tasks'].includes(moduleWorkflow(entry.config.kind))) { await interaction.editReply('إكمال المهمة غير متاح لهذه الميزة. / Completion unavailable for this workflow.'); return true; }
    const publishes = action === 'approved' && ['suggestions', 'submissions'].includes(moduleWorkflow(entry.config.kind));
    const updated = await pool.query("UPDATE ready_template_module_entries SET status=$1,updated_at=NOW(),metadata=metadata || $4::jsonb WHERE id=$2 AND status=$3 RETURNING id", [publishes ? 'publishing' : action, id, action === 'completed' ? 'approved' : 'new',JSON.stringify({reason,reviewedBy:interaction.user.id})]);
    if (!updated.rowCount) { await interaction.editReply('تمت مراجعة هذا الطلب سابقًا. / This request has already been reviewed.'); return true; }
    if (publishes) {
      const target = await interaction.client.channels.fetch(entry.config.channelId || (await pool.query('SELECT channel_id FROM ready_template_module_panels WHERE id=$1', [entry.panel_id])).rows[0]?.channel_id).catch(() => null);
      if (!target?.isTextBased() || target.guildId !== interaction.guildId) { await pool.query("UPDATE ready_template_module_entries SET status='new' WHERE id=$1 AND status='publishing'", [id]); await interaction.editReply('تعذر الوصول لقناة النشر. راجع صلاحيات البوت ثم حاول مجددًا. / Publishing channel unavailable; review bot permissions.'); return true; }
      try {
        const message = await target.send({ embeds: [{ title: safe(entry.subject).slice(0,256),...(entry.answers?.length?{fields:entry.answers.slice(0,5).map(answer=>({name:safe(answer.label).slice(0,45),value:safe(answer.value)||'—'}))}:{}), description: `${safe(entry.details).slice(0,350)}${entry.config.kind === 'suggestions' ? '\n\n👍 الأصوات: **0**' : ''}`, color: parseInt(entry.config.color.slice(1), 16) }], ...(entry.config.kind === 'suggestions' ? { components: rows([button('👍 صوّت للاقتراح', `diskoko:module-vote:${id}`)]) } : {}), allowedMentions: { parse: [] } });
        await pool.query("UPDATE ready_template_module_entries SET status='approved',public_message_id=$1,updated_at=NOW() WHERE id=$2 AND status='publishing'", [message.id, id]);
      } catch (error) { await pool.query("UPDATE ready_template_module_entries SET status='publication_uncertain' WHERE id=$1 AND status='publishing'", [id]); await interaction.editReply('حالة النشر تحتاج مراجعة الإدارة. أُوقف تكرار النشر حتى تُراجع الرسالة الفعلية. / Publishing state is uncertain. Staff must inspect the actual message before retrying.'); return true; }
    }
    const status = action === 'approved' ? 'مقبول / Accepted' : action === 'completed' ? 'مكتمل / Completed' : 'مرفوض / Rejected';
    await recordWorkflowHistory(pool,id,interaction.user.id,'decision',{status:action,reason});entry.metadata={...entry.metadata,reason};await interaction.message?.edit({embeds:[workflowEmbed(entry.config,entry,status)],components:managementButtons(id,action==='approved' && ['orders','learning','tasks'].includes(moduleWorkflow(entry.config.kind)),action==='approved' && moduleWorkflow(entry.config.kind)==='submissions'),allowedMentions:{parse:[]}}).catch(()=>{});
    if(entry.config.notifyMember){try{const member=await interaction.client.users.fetch(entry.user_id);await member.send({content:`${safe(entry.config.title)} · ${status} · #${id.slice(0,8)}${reason?'\n'+safe(reason):''}`,allowedMentions:{parse:[]}});}catch{/* Closed DMs do not repeat the reviewed action. */}}
    await interaction.editReply(`${entry.config.kind === 'tasks' ? 'المهمة' : entry.config.kind === 'learning' ? 'تقدم المتعلم' : entry.config.kind === 'orders' ? 'طلب المتجر' : 'الطلب'}: ${status}.`); return true;
  }
  if (kind === 'module-submit' && interaction.isModalSubmit()) {
    await interaction.deferReply({ ephemeral: true });
    const panel = (await pool.query('SELECT * FROM ready_template_module_panels WHERE id=$1', [id])).rows[0];
    if (!panel || panel.guild_id !== interaction.guildId || panel.publishing_bot_id !== interaction.client.user.id || !READY_MODULE_TYPES[panel.config.kind]?.form) { await interaction.editReply('هذه اللوحة لم تعد متاحة. / Panel no longer available.'); return true; }
    if (READY_MODULE_TYPES[panel.config.kind].staffOnly && !isStaff(interaction, panel.staff_role_id)) { await interaction.editReply('هذا النموذج مخصص لفريق الإدارة. / This form is for authorized staff.'); return true; }
    let subject,details,answers=[];
    try { ({subject,details,answers=[]}=validateModuleSubmission(panel.config,Object.fromEntries(moduleModalFields(panel.config).map(field=>[field.id,interaction.fields.getTextInputValue(field.id)])))); } catch { await interaction.editReply('اكتب الموضوع والتفاصيل وراجع حدود طول الإجابة في النموذج. / Complete the form within the answer limits.');return true; }
    const recent = (await pool.query("SELECT 1 FROM ready_template_module_entries WHERE panel_id=$1 AND user_id=$2 AND created_at>NOW()-($3::int * INTERVAL '1 second') LIMIT 1", [id, interaction.user.id, moduleFormTools(panel.config).cooldownSeconds ?? 30])).rowCount;
    if (recent) { await interaction.editReply('تم استلام طلبك مؤخرًا. انتظر قليلًا قبل إرسال طلب جديد. / Your recent request was received; wait before submitting again.'); return true; }
    const reviewChannel = await interaction.client.channels.fetch(panel.review_channel_id).catch(() => null);
    if (!reviewChannel?.isTextBased() || reviewChannel.guildId !== interaction.guildId) { await interaction.editReply('قناة مراجعة الطلبات غير متاحة. أبلغ مدير السيرفر لتصحيح إعداد الميزة. / Review channel unavailable; ask a server administrator to correct the configuration.'); return true; }
    const entryId = randomUUID();
    const submissionClient=await pool.connect();
    let inserted=false;
    try{
      await submissionClient.query('BEGIN');
      await submissionClient.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`module-intake:${id}:${interaction.user.id}`]);
      const duplicate=await submissionClient.query("SELECT 1 FROM ready_template_module_entries WHERE panel_id=$1 AND user_id=$2 AND created_at>NOW()-($3::int * INTERVAL '1 second') LIMIT 1",[id,interaction.user.id,moduleFormTools(panel.config).cooldownSeconds ?? 30]);
      if(!duplicate.rowCount){await submissionClient.query('INSERT INTO ready_template_module_entries(id,panel_id,user_id,subject,details,answers) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[entryId,id,interaction.user.id,subject,details,JSON.stringify(answers)]);inserted=true;}
      await submissionClient.query('COMMIT');
    }catch(error){await submissionClient.query('ROLLBACK').catch(()=>{});throw error;}finally{submissionClient.release();}
    if(!inserted){await interaction.editReply('وصل طلبك بالفعل؛ لم نرسل نسخة أخرى / Already received; no duplicate sent');return true;}
    try {
      const message=await reviewChannel.send({embeds:[workflowEmbed(panel.config,{subject,details,answers,user_id:interaction.user.id},'جديد / New')],components:rows([button('قبول / Accept',`diskoko:module-review:${entryId}:approved`,3),button('رفض / Reject',`diskoko:module-review:${entryId}:rejected`,4),button('إدارة / Manage',`diskoko:module-manage:${entryId}`,2),button('طلب تفاصيل / Ask details',`diskoko:module-ask:${entryId}`,2),button('سجل الفريق / Staff history',`diskoko:module-staff-history:${entryId}`,2)]),allowedMentions:{parse:[]}});
      await pool.query('UPDATE ready_template_module_entries SET review_message_id=$1 WHERE id=$2', [message.id, entryId]);
    } catch (error) {
      await pool.query("UPDATE ready_template_module_entries SET status='review_uncertain' WHERE id=$1", [entryId]).catch(()=>{});
      await interaction.editReply('تعذر تأكيد وصول الطلب. لا تعِد إرساله؛ اطلب من الإدارة مراجعة الحالة / Delivery could not be confirmed; ask staff to review before resubmitting');return true;
    }
    const received = { suggestions: 'وصل اقتراحك للفريق؛ سيُنشر للتصويت إذا وافقوا عليه. / Suggestion received; it will be published after approval.', reports: 'وصل بلاغك بشكل خاص إلى الفريق. / Your private report was received.', applications: 'وصل طلب انضمامك للفريق. / Application received.', submissions: 'وصلت مشاركتك؛ ستُنشر بعد المراجعة إذا قُبلت. / Submission received; it will be published after approval.', orders: 'وصل طلب المتجر للفريق. تابع طريقة الدفع والتسليم معهم مباشرة. / Order received; arrange payment and delivery with the team.', learning: 'سُجّل تقدمك وسيُراجعه المرشد. / Progress received for mentor review.', tasks: 'أُضيفت المهمة إلى قائمة الفريق. / Task added to the team queue.' }[panel.config.kind] || 'وصل طلبك إلى الفريق. / Request received.';
    await interaction.editReply({content:`${panel.config.receiptText || received} رقم المتابعة / Tracking: ${entryId.slice(0, 8)}.`,components:rows([button('حالة طلبي / My request',`diskoko:module-track:${entryId}`,2)]),allowedMentions:{parse:[]}}); return true;
  }
  if (kind !== 'module' || !interaction.isButton()) return false;
  const panel = (await pool.query('SELECT * FROM ready_template_module_panels WHERE id=$1', [id])).rows[0];
  if (!panel || panel.guild_id !== interaction.guildId || panel.channel_id !== interaction.channelId || panel.message_id !== interaction.message?.id || panel.publishing_bot_id !== interaction.client.user.id) { await interaction.reply({ content: 'هذه اللوحة لم تعد متاحة. / Panel no longer available.', ephemeral: true }); return true; }
  const config = panel.config, type = READY_MODULE_TYPES[config.kind];
  if (!type) { await interaction.reply({ content: 'نوع هذه الميزة غير معروف. / Unknown feature type.', ephemeral: true }); return true; }
  if (type.staffOnly && !isStaff(interaction, panel.staff_role_id)) { await interaction.reply({ content: 'هذه الميزة مخصصة لفريق الإدارة. / This feature is for authorized staff.', ephemeral: true }); return true; }
  if(type.role && config.roleIds?.length){const member=await interaction.guild.members.fetch(interaction.user.id);await interaction.reply({content:'اختر اهتماماتك / Choose interests',components:[{type:1,components:[{type:3,custom_id:`diskoko:module-roles:${id}`,min_values:0,max_values:config.maxRoles,options:config.roleIds.map(role=>({label:config.roleLabels?.[role] || role,value:role,default:config.roleIds.filter(id=>member.roles.cache.has(id)).length<=config.maxRoles && member.roles.cache.has(role)}))}]}],ephemeral:true});return true;}
  if(type.answer && config.questions?.length){await interaction.reply({content:'اختر سؤالًا / Choose a question',components:[{type:1,components:[{type:3,custom_id:`diskoko:module-faq:${id}`,placeholder:'الأسئلة / Questions',options:config.questions.map(item=>({label:item.question,value:item.id}))}]}],ephemeral:true});return true;}
  if (type.form) {
    const fields=moduleModalFields({...config,subjectLabel:config.subjectLabel || READY_MODULE_FIELDS[config.kind]?.subject,detailsLabel:config.detailsLabel || READY_MODULE_FIELDS[config.kind]?.details});
    await interaction.showModal({custom_id: `diskoko:module-submit:${id}`,title:config.title.slice(0,45),components:fields.map(field=>({type:1,components:[{type:4,custom_id:field.id,label:field.label,style:field.style,required:field.required,max_length:field.maxLength,...(field.minLength?{min_length:field.minLength}:{}),...(field.placeholder?{placeholder:field.placeholder}:{})}]}))});return true;
  }
  await interaction.deferReply({ ephemeral: true });
  if (type.answer) { await interaction.editReply(config.answer); return true; }
  if (type.role) {
    const role = await interaction.guild.roles.fetch(panel.role_id).catch(() => null);
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!role || !member || !role.editable || role.managed || role.id===interaction.guildId || (role.permissions?.bitfield !== undefined && BigInt(role.permissions.bitfield)!==0n)) { await interaction.editReply('تعذر تعديل الرتبة. اطلب من الإدارة مراجعة صلاحياتها ورفع رتبة البوت فوقها.'); return true; }
    const hasRole = member.roles.cache.has(role.id);
    if (hasRole) await member.roles.remove(role, 'Diskoko interest selection'); else await member.roles.add(role, 'Diskoko interest selection');
    await interaction.editReply(hasRole ? `أُزيلت رتبة «${role.name}».` : `أُضيفت رتبة «${role.name}».`); return true;
  }
  if (type.signup) {
    if (config.startsAt && new Date(config.startsAt) <= new Date()) { await interaction.editReply('انتهى موعد التسجيل لهذه الفعالية. / Registration has closed.'); return true; }
    const client = await pool.connect(); let joined, total, waiting=false;
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [id]);
      const current = (await client.query('SELECT 1 FROM ready_template_module_signups WHERE panel_id=$1 AND user_id=$2', [id, interaction.user.id])).rowCount;
      total = Number((await client.query("SELECT COUNT(*)::int AS total FROM ready_template_module_signups WHERE panel_id=$1 AND status='confirmed'", [id])).rows[0].total);
      if (!current && !config.waitlist && config.capacity && total >= config.capacity) { await client.query('ROLLBACK'); await interaction.editReply('اكتملت أماكن هذه الفعالية. / The event is full.'); return true; }
      if (current) { await client.query('DELETE FROM ready_template_module_signups WHERE panel_id=$1 AND user_id=$2', [id, interaction.user.id]); joined = false; if(config.waitlist)await client.query("UPDATE ready_template_module_signups SET status='confirmed' WHERE panel_id=$1 AND status='waiting' AND user_id=(SELECT user_id FROM ready_template_module_signups WHERE panel_id=$1 AND status='waiting' ORDER BY created_at,user_id LIMIT 1) AND (SELECT COUNT(*) FROM ready_template_module_signups WHERE panel_id=$1 AND status='confirmed') < $2",[id,config.capacity || 10000]); }
      else { waiting=Boolean(config.capacity && total>=config.capacity);await client.query('INSERT INTO ready_template_module_signups(panel_id,user_id,status) VALUES($1,$2,$3)',[id,interaction.user.id,waiting?'waiting':'confirmed']);joined=true;}
      total=Number((await client.query("SELECT COUNT(*)::int AS total FROM ready_template_module_signups WHERE panel_id=$1 AND status='confirmed'",[id])).rows[0].total);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
    const embeds=(interaction.message.embeds || []).map(embed=>embed.toJSON());if(!embeds.length)embeds.push({title:config.title,color:parseInt(config.color.slice(1),16)});
    const textIndex=embeds.findIndex(embed=>embed.title===config.title);const selected=textIndex<0?embeds.length-1:textIndex;embeds[selected]={...embeds[selected],description:`${config.description}\n\n👥 المسجلون: **${total}**${config.capacity?` من ${config.capacity}`:''}`};
    await interaction.message.edit({ embeds }).catch(() => {});
    await interaction.editReply(joined ? (waiting?'أُضفت إلى قائمة الانتظار. راجع التسجيل لمعرفة توفر مكان / Added to waiting list':'تم تسجيل مشاركتك. / Registration confirmed.') : 'أُلغي تسجيلك. / Registration cancelled.'); return true;
  }
  await interaction.editReply('الميزة غير متاحة الآن. / Feature unavailable.'); return true;
}
