import {draftVersion} from './ai-draft-version.js';
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
const tables={poll:'diskoko_polls',event:'diskoko_event_panels',giveaway:'diskoko_giveaways',welcome:'diskoko_welcome_cards',module:'ready_template_module_panels'};
export async function migrateLibraryPanelLifecycle(pool){for(const [kind,table] of Object.entries(tables))if(kind!=='module')await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS disabled BOOLEAN NOT NULL DEFAULT FALSE`);}
export function mountLibraryPanelLifecycle(app,{pool,requireUser,requireWriteAccess,authorizedGuild,discordBotFetch}){
  app.get?.('/api/ai/panels',requireUser,async(req,res,next)=>{try{
    if(!await authorizedGuild(req.user,req.query.guildId))throw fail('السيرفر غير متاح.',403);
    const me=await discordBotFetch('/users/@me');if(!me.ok)throw fail('تعذر التحقق من البوت.');
    const {rows}=await pool.query(`SELECT r.id,r.conversation_id,r.proposal,r.status,r.publication_state,r.interactive_kind,r.interactive_channel_id,r.interactive_message_id,r.sent_channel_id,r.sent_message_id,r.publishing_bot_id,r.design_bot_id,r.publication_review,r.library_title,r.created_at,s.id AS module_install_id,s.status AS install_status,p.id AS module_panel_id,p.publishing_bot_id AS module_bot_id,(p.config - 'banner' - 'designScene') AS module_config,p.message_id AS module_message_id,p.channel_id AS module_channel_id,p.disabled AS module_disabled
      FROM ai_requests r LEFT JOIN standalone_module_installs s ON s.source_request_id=r.id AND s.edit_install_id IS NULL LEFT JOIN ready_template_module_panels p ON p.standalone_install_id=s.id
      WHERE r.user_id=$1 AND r.guild_id=$2 AND r.publication_state IS DISTINCT FROM 'cancelled' AND (r.interactive_kind IS NOT NULL OR r.sent_message_id IS NOT NULL OR r.publication_state IN ('publishing','review_required') OR s.status IN ('succeeded','running','failed')) ORDER BY r.created_at DESC LIMIT 200`,[req.user.id,req.query.guildId]);
    const legacy=(await pool.query("SELECT s.id,s.kind,s.created_at,s.status,(s.config - 'banner' - 'designScene') AS config,p.publishing_bot_id,p.disabled,p.channel_id,p.message_id FROM standalone_module_installs s JOIN ready_template_module_panels p ON p.standalone_install_id=s.id WHERE s.user_id=$1 AND s.guild_id=$2 AND s.source_request_id IS NULL AND s.edit_install_id IS NULL AND s.status IN ('succeeded','failed','running')",[req.user.id,req.query.guildId])).rows;
    for(const row of legacy)rows.push({id:row.id,standalone:true,module_install_id:row.id,module_bot_id:row.publishing_bot_id,module_config:row.config,module_disabled:row.disabled,module_channel_id:row.channel_id,module_message_id:row.message_id,install_status:row.status,proposal:{interactive:{kind:'module',moduleKind:row.kind}},created_at:row.created_at});
    const panels=rows.filter(row=>{const bot=row.module_bot_id || row.publishing_bot_id || row.publication_review?.botId || row.design_bot_id;return !bot || bot==='public' ? !req.publishingBotId : bot===me.data.id;}).map(row=>({id:row.id,request_id:row.standalone?null:row.id,conversation_id:row.conversation_id,proposal:{...row.proposal,draftVersion:draftVersion(row.proposal)},status:row.status,publication_state:row.module_disabled?'disabled':row.publication_state || (row.install_status==='succeeded'?'completed':row.install_status),interactive_kind:row.interactive_kind || (row.module_install_id?'module':row.proposal?.interactive?.kind || 'message'),interactive_channel_id:row.module_channel_id || row.interactive_channel_id || row.sent_channel_id,interactive_message_id:row.module_message_id || row.interactive_message_id || row.sent_message_id,module_install_id:row.module_install_id,module_kind:row.module_config?.kind,title:row.module_config?.title || row.proposal?.interactive?.title || row.library_title || 'رسالة / Message',disabled:row.module_disabled || row.publication_state==='disabled',created_at:row.created_at}));
    res.json({panels});
  }catch(error){next(error);}});
  app.post('/api/ai/requests/:id/panel-action',requireUser,requireWriteAccess,async(req,res,next)=>{
    const db=await pool.connect();let item,mutated=false;
    try{
      if(req.body.confirmed!==true || !['disable','cancel'].includes(req.body.action))throw fail('راجع الإجراء وأكده.',400);
      await db.query('BEGIN');item=(await db.query('SELECT * FROM ai_requests WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.user.id])).rows[0];
      if(!item){const install=(await db.query('SELECT * FROM standalone_module_installs WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.user.id])).rows[0];if(install)item={id:install.id,guild_id:install.guild_id,proposal:{interactive:{kind:'module'}},publication_state:install.status==='cancelled'?'cancelled':install.status==='running'?'publishing':null,publishing_bot_id:install.config.executorBotId,standalone:true};}
      if(!item || !await authorizedGuild(req.user,item.guild_id))throw fail('الإعداد غير متاح.',404);
      const me=await discordBotFetch('/users/@me');if(!me.ok)throw fail('البوت غير متاح.');
      const scope=item.publishing_bot_id || item.publication_review?.botId || item.design_bot_id;
      if((!scope || scope==='public') && req.publishingBotId)throw fail('هذا الإعداد يخص بوت ديسكوكو العام.',403);
      if(scope && scope!=='public' && scope!==me.data.id)throw fail('اللوحة تخص بوتًا آخر.',403);
      if(item.publication_state==='cancelled'){await db.query('COMMIT');return res.json({ok:true});}
      const kind=item.interactive_kind || item.proposal?.interactive?.kind || 'message';
      if(kind==='tickets')throw fail('استخدم إدارة لوحة الدعم.');
      if(item.publication_state==='publishing'){const failed=kind==='module'?(await db.query("SELECT id FROM standalone_module_installs WHERE source_request_id=$1 AND user_id=$2 AND status='failed'",[item.id,req.user.id])).rows[0]:null;if(!failed)throw fail('النشر قيد التنفيذ؛ لا يمكن إلغاؤه الآن.');}
      const cancel=req.body.action==='cancel';let panel;
      if(kind==='module')panel=(await db.query('SELECT p.* FROM ready_template_module_panels p JOIN standalone_module_installs s ON s.id=p.standalone_install_id WHERE (s.source_request_id=$1 OR s.id=$1) AND s.user_id=$2 AND s.guild_id=$3 AND s.edit_install_id IS NULL',[item.id,req.user.id,item.guild_id])).rows[0];
      else if(tables[kind])panel=(await db.query(`SELECT * FROM ${tables[kind]} WHERE request_id=$1 AND guild_id=$2`,[item.id,item.guild_id])).rows[0];
      if(panel?.publishing_bot_id && panel.publishing_bot_id!==me.data.id)throw fail('اللوحة تخص بوتًا آخر.',403);
      if(kind==='channel_control'){
        const receipt=item.publication_review?.channelControl;
        if(!receipt)throw fail('هذا تغيير قناة قديم بلا نسخة استعادة. افتح تعديل وحدد الإعداد المطلوب؛ لن نخمن صلاحيات سابقة.');
        const current=await discordBotFetch(`/channels/${item.interactive_channel_id}`);
        if(!current.ok || current.data.guild_id!==item.guild_id)throw fail('القناة غير متاحة.');
        for(const key of Object.keys(receipt.after))if(JSON.stringify(current.data[key])!==JSON.stringify(receipt.after[key]))throw fail('تغيرت القناة بعد التنفيذ. راجع إعداداتها قبل استعادة النسخة السابقة.');
        const result=await discordBotFetch(`/channels/${item.interactive_channel_id}`,{method:'PATCH',body:JSON.stringify(receipt.before)});mutated=true;if(!result.ok)throw fail('تعذر استعادة إعداد القناة.');
      }else if(kind==='scheduled_event'){
        const path=`/guilds/${item.guild_id}/scheduled-events/${item.interactive_message_id}`;
        const event=await discordBotFetch(path);if(event.status!==404 && !event.ok)throw fail('تعذر قراءة الحدث.');
        if(event.ok && (cancel || ![3,4].includes(event.data.status))){if(event.data.creator_id && event.data.creator_id!==me.data.id)throw fail('الحدث يخص بوتًا آخر.',403);const result=await discordBotFetch(path,cancel?{method:'DELETE'}:{method:'PATCH',body:JSON.stringify({status:event.data.status===2?3:4})});mutated=true;if(!result.ok && result.status!==404)throw fail('تعذر إيقاف الحدث.');}
      }else if(kind!=='welcome'){
        const channelId=panel?.channel_id || item.interactive_channel_id || item.sent_channel_id;
        if(!channelId)throw fail('لم يُحفظ مكان النشر. تحتاج الحالة مراجعة قبل الإلغاء.');
        const channel=await discordBotFetch(`/channels/${channelId}`);if(channel.status!==404 && (!channel.ok || channel.data.guild_id!==item.guild_id))throw fail('قناة اللوحة غير متاحة.');
        let ids=kind==='rules'?item.proposal?.interactive?.publishedMessageIds || [item.interactive_message_id]:[panel?.message_id || item.interactive_message_id || item.sent_message_id];
        if(!ids[0] && kind==='module' && panel && cancel && channel.ok){
          ids=[];let before,complete=false;const since=new Date(panel.created_at || item.created_at).getTime();
          for(let page=0;page<10;page++){const batch=await discordBotFetch(`/channels/${channelId}/messages?limit=100${before?'&before='+before:''}`);if(!batch.ok || !Array.isArray(batch.data))throw fail('تعذر مراجعة سجل اللوحة.');for(const message of batch.data)if(message.author?.id===me.data.id && (message.components || []).some(row=>(row.components || []).some(component=>component.custom_id===`diskoko:module:${panel.id}`)))ids.push(message.id);if(batch.data.length<100 || batch.data.some(message=>new Date(message.timestamp).getTime()<since)){complete=true;break;}before=batch.data.at(-1).id;}if(!complete)throw fail('سجل القناة كبير؛ يلزم مراجعة الحالة قبل الإلغاء.');
        }else if(!ids[0])throw fail('حالة النشر غير مؤكدة ولا توجد رسالة محفوظة. تحتاج مراجعة الإدارة لمنع حذف رسالة أخرى.');
        if(channel.ok)for(const id of ids){const path=`/channels/${channelId}/messages/${id}`,message=await discordBotFetch(path);if(message.status===404)continue;if(!message.ok || message.data.author?.id!==me.data.id)throw fail('تعذر التحقق من رسالة اللوحة.');const result=await discordBotFetch(path,cancel?{method:'DELETE'}:{method:'PATCH',body:JSON.stringify({components:[],allowed_mentions:{parse:[]}})});mutated=true;if(!result.ok && result.status!==404)throw fail('تعذر تعديل رسالة اللوحة؛ راجع الحالة قبل المحاولة.');}
      }
      if(kind==='welcome')await db.query('UPDATE diskoko_welcome_cards SET disabled=TRUE WHERE request_id=$1 AND guild_id=$2',[item.id,item.guild_id]);
      else if(panel && tables[kind])await db.query(`UPDATE ${tables[kind]} SET disabled=TRUE WHERE id=$1`,[panel.id]);
      if(kind==='module' && cancel)await db.query("UPDATE standalone_module_installs SET status='cancelled',updated_at=NOW() WHERE source_request_id=$1 OR id=$2",[item.id,panel?.standalone_install_id || null]);
      if(kind==='giveaway' && panel){await db.query("UPDATE diskoko_giveaways SET remaining_seconds=CASE WHEN status='active' THEN GREATEST(1,EXTRACT(EPOCH FROM ends_at-NOW())::int) ELSE remaining_seconds END,status=CASE WHEN $2::text IS NOT NULL THEN $2 WHEN status='active' THEN 'manual_paused' ELSE status END WHERE id=$1",[panel.id,cancel?'paused':null]);}
      await db.query('UPDATE ai_requests SET publication_state=$2 WHERE id=$1',[item.id,cancel?'cancelled':'disabled']);await db.query('COMMIT');res.json({ok:true,keptEntries:true});
    }catch(error){await db.query('ROLLBACK').catch(()=>{});if(mutated && item)await pool.query("UPDATE ai_requests SET publication_state='review_required' WHERE id=$1",[item.id]).catch(()=>{});next(error);}finally{db.release();}
  });
}
