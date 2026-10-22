import {canonicalPlan,subscriptionAccess} from './billing.js';

// Account-level actions remain available in read-only mode. They never mutate
// Discord, delete customer content, or depend on the selected server/bot.
export function mountSubscriptionLifecycle(app,{pool,requireUser,audit}) {
  const wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(error){next(error);}};
  app.delete('/api/billing/upgrade-requests/current',requireUser,wrap(async(req,res)=>{
    const result=await pool.query("UPDATE billing_upgrade_requests SET status='cancelled',updated_at=NOW() WHERE user_id=$1 AND status='pending' RETURNING id",[req.user.id]);
    if(result.rows.length)await audit(req.user.id,'subscription.request.cancelled','user',req.user.id,{requestId:result.rows[0].id});
    res.json({ok:true,cancelled:result.rows.length>0});
  }));
  app.post('/api/account/subscription/cancel',requireUser,wrap(async(req,res)=>{
    if(req.body.confirmed!==true)return res.status(400).json({error:'راجع أثر الإلغاء وأكد الطلب.'});
    const db=await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.user.id]);
      const subscription=(await db.query('SELECT * FROM subscriptions WHERE user_id=$1 ORDER BY updated_at DESC,id DESC LIMIT 1 FOR UPDATE',[req.user.id])).rows[0];
      if(!subscription || canonicalPlan(subscription.plan)==='free'){
        await db.query('COMMIT');return res.json({ok:true,unchanged:true});
      }
      if(subscription.cancel_at_period_end || ['cancelled','expired'].includes(subscription.status)){
        await db.query('COMMIT');return res.json({ok:true,unchanged:true,access:subscriptionAccess(subscription)});
      }
      const access=subscriptionAccess(subscription);
      const atEnd=access.mode==='full' && subscription.current_period_end && new Date(subscription.current_period_end)>new Date();
      const updated=(await db.query("UPDATE subscriptions SET cancel_at_period_end=$2,status=CASE WHEN $2 THEN status ELSE 'cancelled' END,updated_at=NOW() WHERE id=$1 RETURNING *",[subscription.id,Boolean(atEnd)])).rows[0];
      await db.query("UPDATE billing_upgrade_requests SET status='cancelled',updated_at=NOW() WHERE user_id=$1 AND status='pending'",[req.user.id]);
      await db.query("INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,details) VALUES($1,'subscription.cancel.requested','user',$2,$3)",[req.user.id,String(req.user.id),JSON.stringify({atPeriodEnd:Boolean(atEnd),periodEnd:subscription.current_period_end || null})]);
      await db.query('COMMIT');
      res.json({ok:true,atPeriodEnd:Boolean(atEnd),access:subscriptionAccess(updated),message:atEnd?'تم إيقاف التجديد؛ تظل الخدمة متاحة حتى نهاية الفترة.':'تم إلغاء الاشتراك. بياناتك محفوظة ويمكنك مراجعتها.'});
    }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
  }));
}
