import { createHash } from 'node:crypto';

const problem=(message,status=409)=>Object.assign(new Error(message),{status});
export function ticketPublicationNonce(id,botId){return createHash('sha256').update(`${id}:${botId || 'public'}:0`).digest('hex').slice(0,25);}
export function mountTicketPanelLifecycle(app,{pool,requireUser,requireWriteAccess,authorizedGuild,discordBotFetch}){
  app.get?.('/api/ai/ticket-panels',requireUser,async(req,res,next)=>{try{
    if(!await authorizedGuild(req.user,req.query.guildId))throw problem('السيرفر غير متاح.',403);
    const {rows}=await pool.query(`SELECT r.id,r.conversation_id,r.proposal,r.status,r.publication_state,r.interactive_kind,r.interactive_channel_id,r.interactive_message_id,r.created_at,p.title,p.disabled,
      (SELECT count(*)::int FROM diskoko_tickets t WHERE t.panel_id=p.id AND t.status='open') AS open_tickets
      FROM ai_requests r LEFT JOIN diskoko_ticket_panels p ON p.request_id=r.id
      WHERE r.user_id=$1 AND r.guild_id=$2 AND NULLIF(COALESCE(r.publishing_bot_id,r.publication_review->>'botId',r.design_bot_id),'public') IS NOT DISTINCT FROM $3
      AND (r.interactive_kind='tickets' OR r.publication_review->>'kind'='tickets') AND r.publication_state IS DISTINCT FROM 'cancelled'
      ORDER BY r.created_at DESC LIMIT 100`,[req.user.id,req.query.guildId,req.publishingBotId || null]);
    res.json({panels:rows});
  }catch(error){next(error);}});
  app.post('/api/ai/requests/:id/ticket-panel-action',requireUser,requireWriteAccess,async(req,res,next)=>{
    const db=await pool.connect();
    try{
      if(req.body.confirmed!==true || !['disable','cancel'].includes(req.body.action))throw problem('راجع الإجراء وأكده أولًا.',400);
      await db.query('BEGIN');
      const item=(await db.query('SELECT * FROM ai_requests WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.user.id])).rows[0];
      if(!item || !await authorizedGuild(req.user,item.guild_id))throw problem('الإعداد غير متاح.',404);
      const ownerBot=item.publishing_bot_id || item.publication_review?.botId || item.design_bot_id;
      if((ownerBot==='public'?null:ownerBot || null)!==(req.publishingBotId || null))throw problem('اختر البوت الذي يخص هذه اللوحة.',403);
      if(item.interactive_kind!=='tickets' && item.publication_review?.kind!=='tickets')throw problem('هذا الإجراء خاص بلوحات الدعم.',400);
      if(item.publication_state==='cancelled'){await db.query('COMMIT');return res.json({ok:true,alreadyCancelled:true});}
      const review=item.publication_review || {};
      if(item.publication_state==='publishing' && Date.now()-new Date(review.startedAt || item.created_at).getTime()<300000)throw problem('النشر قيد التنفيذ. انتظر اكتماله قبل الإلغاء.');
      const panel=(await db.query('SELECT * FROM diskoko_ticket_panels WHERE request_id=$1 AND guild_id=$2',[item.id,item.guild_id])).rows[0];
      let channelId=panel?.channel_id || item.interactive_channel_id || review.channelId;
      const me=await discordBotFetch('/users/@me');if(!me.ok)throw problem('تعذر التحقق من هوية البوت.');
      let found=[];
      if(channelId){
        const channel=await discordBotFetch(`/channels/${channelId}`);
        if(channel.status!==404 && (!channel.ok || channel.data?.guild_id!==item.guild_id))throw problem('تعذر التحقق من قناة اللوحة.');
        if(channel.ok && (panel?.message_id || item.interactive_message_id)){
          const message=await discordBotFetch(`/channels/${channelId}/messages/${panel?.message_id || item.interactive_message_id}`);
          if(message.status!==404 && !message.ok)throw problem('تعذر قراءة رسالة اللوحة.');
          if(message.ok)found=[message.data];
        }else if(channel.ok){
          if(req.body.action!=='cancel')throw problem('هذه حالة نشر غير مؤكدة. استخدم إلغاء الطلب العالق.');
          let before,complete=false;
          const since=new Date(review.startedAt || item.created_at).getTime();
          for(let page=0;page<10;page++){
            const batch=await discordBotFetch(`/channels/${channelId}/messages?limit=100${before?`&before=${before}`:''}`);
            if(!batch.ok || !Array.isArray(batch.data))throw problem('تعذر مراجعة سجل القناة؛ لم يُلغ الطلب.');
            found.push(...batch.data.filter(message=>String(message.nonce || '')===ticketPublicationNonce(item.id,req.publishingBotId)));
            if(batch.data.length<100 || batch.data.some(message=>new Date(message.timestamp).getTime()<since)){complete=true;break;}
            before=batch.data.at(-1).id;
          }
          if(!complete)throw problem('سجل القناة كبير؛ تحتاج الحالة مراجعة الإدارة قبل إلغائها.');
        }
      }else if(!panel && review.createChannelName){
        // No durable channel receipt exists; never guess a channel or delete customer structure.
        // Any orphan message cannot open tickets without a registered panel.
      }
      for(const message of found){
        if(message.author?.id!==me.data.id)throw problem('رسالة اللوحة تخص بوتًا آخر.',403);
        const result=await discordBotFetch(`/channels/${channelId}/messages/${message.id}`,req.body.action==='cancel'?{method:'DELETE'}:{method:'PATCH',body:JSON.stringify({components:[],allowed_mentions:{parse:[]}})});
        if(!result.ok && result.status!==404)throw problem('تعذر إزالة لوحة الدعم. لم يُحذف سجلها، ويمكن مراجعة الحالة.');
      }
      await db.query('UPDATE diskoko_ticket_panels SET disabled=TRUE WHERE request_id=$1 AND guild_id=$2',[item.id,item.guild_id]);
      await db.query('UPDATE ai_requests SET publication_state=$2 WHERE id=$1',[item.id,req.body.action==='cancel'?'cancelled':'disabled']);
      await db.query('COMMIT');res.json({ok:true,removedMessages:found.length,keptTickets:true});
    }catch(error){await db.query('ROLLBACK').catch(()=>{});next(error);}finally{db.release();}
  });
}
