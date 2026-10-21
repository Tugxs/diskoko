import {randomUUID, createHash} from 'node:crypto';
import nodemailer from 'nodemailer';
import {managedLoop, serviceLoopStatus, safeOperationError} from './service-lifecycle.js';
import {databasePoolStats} from './database.js';

// Reuse the existing runtime KV table. No runtime DDL or elevated database role.
const JOURNAL = 'ops:journal:v1';
const labels = {
  site:'توافر الموقع والخدمات',
  release:'فحص النسخة على الفرع الرئيسي',
  automations:'تأخر مهام اللوحات والسحوبات', connections:'تراجع اتصال البوتات الخاصة',
  database:'اتصال قاعدة البيانات', worker:'نبض عامل Discord', gateway:'اتصال بوت ديسكوكو',
  queue:'تأخر طابور Discord', execution:'طلبات عالقة أثناء التنفيذ', discord_errors:'إخفاقات اتصال Discord',
  schedules:'الرسائل المجدولة', projects:'مهام الأوامر البرمجية', roles:'مزامنة رتب العملاء',
  loops:'تقدم مهام الخدمة', memory:'ذاكرة الخدمة', http_errors:'أخطاء الموقع', pool:'انتظار اتصالات قاعدة البيانات', storage:'مساحة بيانات الموقع',
};
const seconds = (now, value) => value ? Math.max(0, Math.floor((now-new Date(value).getTime())/1000)) : null;
export function operationalConditions(s) {
  const worker=s.externalWorker && (!s.worker || s.worker.ageSeconds>90);
  const staleLoop=Object.values({...s.loops,...s.worker?.loops}).some(l=>l.failures>=3 || l.running && seconds(s.at,l.startedAt)>300 || seconds(s.at,l.startedAt||l.createdAt)>Math.max(180,3*(l.intervalMs||60000)/1000));
  return {
    database:s.database!=='ready', worker:Boolean(worker),
    gateway:Boolean(s.externalWorker && s.worker?.ageSeconds<=90 && s.worker.online!==true && s.uptimeSeconds>120),
    queue:s.queue?.oldestPendingSeconds>45 || s.queue?.pending>=200,
    execution:s.queue?.oldestRunningSeconds>90,
    discord_errors:s.queue?.recentErrors>=10,
    schedules:s.schedules?.overdueSeconds>180 || s.schedules?.sendingSeconds>600,
    projects:s.projects?.overdueSeconds>180 || s.projects?.runningSeconds>600,
    roles:s.roles?.repeatedFailures>0 && s.roles?.oldestSeconds>900,
    automations:s.automations?.giveawaySeconds>300 || s.automations?.centerSeconds>180 || s.automations?.reminderSendingSeconds>180,
    connections:(s.worker?.uptimeSeconds??s.uptimeSeconds)>180 && s.connections?.stale>=3 && s.connections.stale>=s.connections.total/2,
    loops:staleLoop, memory:s.rssBytes>440*1024*1024 || s.worker?.rssBytes>440*1024*1024, http_errors:s.http?.errors>=10 && s.http.errors/Math.max(1,s.http.requests)>.1,
    pool:s.pool?.waiting>=8,storage:s.databaseBytes>0 && s.databaseBytes>s.databaseSoftLimitBytes*.9,
  };
}
export async function collectOperations(pool,{externalWorker=true,now=Date.now(),uptime=process.uptime(),memory=process.memoryUsage(),loops=serviceLoopStatus(),http={}}={}) {
  const row=(await pool.query({text:`SELECT NOW() AS clock,pg_database_size(current_database())::text AS database_bytes,
    (SELECT jsonb_build_object('seenAt',seen_at,'status',status) FROM bot_runtime_state WHERE id='original') AS worker,
    (SELECT jsonb_build_object('pending',count(*) FILTER(WHERE status='pending'),'running',count(*) FILTER(WHERE status='running'),
      'oldestPendingAt',min(created_at) FILTER(WHERE status='pending'),'oldestRunningAt',min(started_at) FILTER(WHERE status='running'),
      'recentErrors',count(*) FILTER(WHERE completed_at>NOW()-INTERVAL '5 minutes' AND (status='failed' OR response_status>=500))) FROM discord_jobs) AS queue,
    (SELECT jsonb_build_object('overdueAt',min(run_at) FILTER(WHERE status='scheduled' AND run_at<NOW()),'sendingAt',min(updated_at) FILTER(WHERE status='sending')) FROM scheduled_messages WHERE status IN('scheduled','sending')) AS schedules,
    (SELECT jsonb_build_object('overdueAt',min(run_at) FILTER(WHERE status='pending' AND run_at<NOW()),'runningAt',min(claimed_at) FILTER(WHERE status='running')) FROM code_project_jobs WHERE status IN('pending','running')) AS projects,
    (SELECT jsonb_build_object('repeatedFailures',count(*) FILTER(WHERE attempts>=5),'oldestAt',min(requested_at) FILTER(WHERE attempts>=5)) FROM customer_role_sync) AS roles,
    (SELECT min(GREATEST(ends_at,COALESCE(next_retry_at,ends_at))) FROM diskoko_giveaways WHERE (status='active' OR status='ended' AND announced_at IS NULL) AND ends_at<NOW() AND (next_retry_at IS NULL OR next_retry_at<=NOW())) AS giveaway_at,
    (SELECT min(due_at) FROM control_center_jobs WHERE enabled AND status IN('idle','sending') AND due_at<NOW()) AS center_at,
    (SELECT min(created_at) FROM ready_template_module_event_notices WHERE status='sending') AS reminder_at,
    (SELECT jsonb_build_object('total',count(*),'stale',count(*) FILTER(WHERE created_at<NOW()-INTERVAL '5 minutes' AND (gateway_seen_at IS NULL OR gateway_seen_at<NOW()-INTERVAL '3 minutes'))) FROM customer_bot_registry WHERE token_encrypted<>'__diskoko_public__') AS connections`,query_timeout:8000})).rows[0];
  // Database time avoids clock skew between web and worker machines.
  const clock=new Date(row.clock).getTime();
  return {at:now,database:'ready',externalWorker,uptimeSeconds:Math.floor(uptime),rssBytes:memory.rss,http,loops,
    databaseBytes:Number(row.database_bytes),pool:pool.options?databasePoolStats(pool):null,
    worker:row.worker?{ageSeconds:seconds(clock,row.worker.seenAt),online:row.worker.status?.online===true,draining:row.worker.status?.draining===true,loops:row.worker.status?.loops||{},rssBytes:row.worker.status?.rssBytes||null,uptimeSeconds:row.worker.status?.uptimeSeconds??null}:null,
    queue:{pending:Number(row.queue.pending),running:Number(row.queue.running),recentErrors:Number(row.queue.recentErrors),oldestPendingSeconds:seconds(clock,row.queue.oldestPendingAt),oldestRunningSeconds:seconds(clock,row.queue.oldestRunningAt)},
    schedules:{overdueSeconds:seconds(clock,row.schedules.overdueAt),sendingSeconds:seconds(clock,row.schedules.sendingAt)},
    projects:{overdueSeconds:seconds(clock,row.projects.overdueAt),runningSeconds:seconds(clock,row.projects.runningAt)},
    roles:{repeatedFailures:Number(row.roles.repeatedFailures),oldestSeconds:seconds(clock,row.roles.oldestAt)},
    automations:{giveawaySeconds:seconds(clock,row.giveaway_at),centerSeconds:seconds(clock,row.center_at),reminderSendingSeconds:seconds(clock,row.reminder_at)},
    connections:{total:Number(row.connections.total),stale:Number(row.connections.stale)}};
}

export function alertConfiguration(env=process.env) {
  const emails=String(env.OPS_ALERT_EMAILS||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(emails.length>3 || emails.some(s=>s.length>254 || !/^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(s)))throw Error('Invalid OPS_ALERT_EMAILS');
  const channel=env.OPS_ALERT_CHANNEL_ID||'',guild=env.OPS_ALERT_GUILD_ID||'';
  if(channel && (!/^\d{17,20}$/.test(channel) || !/^\d{17,20}$/.test(guild)))throw Error('Invalid operations alert channel');
  const webhook=env.OPS_DISCORD_WEBHOOK_URL||'';
  if(webhook && !/^https:\/\/discord\.com\/api\/webhooks\/\d{17,20}\/[A-Za-z0-9_-]{40,200}$/.test(webhook))throw Error('Invalid operations webhook');
  return {emails,channel,guild,emailReady:Boolean(emails.length && env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS),discordReady:Boolean(channel && guild && (webhook || env.DISCORD_BOT_TOKEN))};
}
const guidance = {
  database:['تعذّر إكمال فحص قاعدة البيانات.','قد يتعذر حفظ الإعدادات وتنفيذ المهام.','افحص حالة PostgreSQL واتصال الشبكة وشهادة TLS والصلاحيات في Render.'],
  worker:['لم تصل نبضة العامل أو تجاوز عمرها 90 ثانية.','قد تتأخر أوامر Discord والمهام الخلفية.','افتح سجلات العامل في Render وتحقق من تشغيله وعدم تكرار إعادة التشغيل.'],
  gateway:['العامل يرسل نبضته، لكن بوت ديسكوكو غير متصل بعد مهلة بدء التشغيل.','قد يتوقف رد البوت وتنفيذ التفاعلات.','راجع سجلات اتصال Discord وحالة التوكن وحدود الاتصال؛ لا تغيّر التوكن قبل معرفة السبب.'],
  connections:['ثلاثة اتصالات خاصة على الأقل متأخرة وتمثل نصف الاتصالات أو أكثر.','قد تتأخر استجابة بعض البوتات الخاصة.','راجع اتصالات البوتات الخاصة وتوقيت آخر نبضة وسجلات العامل.'],
  queue:['انتظار طلب Discord تجاوز 45 ثانية أو وصل الطابور إلى 200 طلب.','قد تصل ردود وتنفيذات Discord متأخرة.','راجع عمر الطابور وتقدم العامل وحدود Discord قبل زيادة التزامن.'],
  execution:['طلب Discord بقي في حالة تنفيذ أكثر من 90 ثانية.','نتيجة بعض الطلبات لم تتأكد بعد.','راجع نتيجة الطلب في Discord وسجل التنفيذ قبل أي إعادة يدوية لتجنب التكرار.'],
  discord_errors:['رُصدت 10 إخفاقات على الأقل في طلبات Discord خلال خمس دقائق.','بعض عمليات Discord قد تفشل.','راجع رموز استجابة Discord وصلاحيات البوت والاتصال؛ راجع نتيجة كل طلب قبل إعادته.'],
  schedules:['رسالة مجدولة متأخرة أكثر من 3 دقائق أو إرسال مستمر أكثر من 10 دقائق.','قد تتأخر الرسائل المجدولة.','راجع صفحة الرسائل المجدولة وحالة العامل وصلاحية الإرسال للقناة.'],
  projects:['مهمة أمر برمجي متأخرة أكثر من 3 دقائق أو قيد التنفيذ أكثر من 10 دقائق.','قد تتأخر المهام المبرمجة للأوامر.','راجع سجل المهمة ومحرك التنفيذ والمهلة المحددة لها.'],
  roles:['مزامنة رتبة أخفقت خمس مرات على الأقل وظلت معلقة أكثر من 15 دقيقة.','قد لا تصل بعض رتب العملاء.','راجع ترتيب رتبة البوت وصلاحية إدارة الرتب وإعدادات المزامنة.'],
  automations:['تأخر إعلان سحب أكثر من 5 دقائق أو مهام لوحة أكثر من 3 دقائق.','قد تتأخر إعلانات السحوبات أو تذكيرات اللوحات.','راجع سجلات السحوبات واللوحات وحالة العامل وصلاحية إرسال الرسائل.'],
  loops:['فشلت مهمة خدمة ثلاث مرات أو توقفت عن التقدم ضمن المدة المتوقعة.','قد تتأخر الوظيفة المرتبطة بالمهمة.','راجع المهام المتأخرة في مراقبة التشغيل وسجلات الخدمة لتحديد المهمة والسبب.'],
  memory:['تجاوز استهلاك ذاكرة الموقع أو العامل 440 MiB.','قد تتباطأ الخدمة أو يعيد Render تشغيلها عند نفاد الذاكرة.','راجع منحنى الذاكرة والمهام النشطة وحدود الذاكرة قبل ترقية الخطة.'],
  http_errors:['رُصدت 10 استجابات خطأ خادم على الأقل ونسبتها تجاوزت 10% من الطلبات المقاسة.','قد يواجه بعض المستخدمين أخطاء في الموقع.','راجع سجلات أخطاء الموقع وآخر نشر؛ لا يتضمن هذا التنبيه بيانات طلبات العملاء.'],
  pool:['ثمانية طلبات على الأقل تنتظر اتصال قاعدة البيانات.','قد تتباطأ صفحات الموقع والمهام.','راجع الاتصالات والاستعلامات البطيئة وحدود تجمع الاتصالات.'],
  storage:['تجاوز حجم قاعدة البيانات 90% من الميزانية التشغيلية المحددة.','قد تنفد المساحة المخطط لها مع استمرار النمو.','راجع نمو البيانات وسياسة الاحتفاظ والنسخ الاحتياطي وسعة PostgreSQL.'],
  release:['فشل الفحص الآلي للنسخة على الفرع الرئيسي.','قد يتوقف نشر النسخة الجديدة؛ هذا لا يثبت توقف النسخة الحالية.','افتح GitHub Actions وحدد أول فحص فاشل وأصلحه قبل أي نشر يدوي.'],
  site:['لم يجتز الموقع أو فحص خدماته التحقق.','قد يتعذر استخدام الموقع أو بعض وظائفه.','راجع Render وفحوص الصحة وسجلات الموقع والعامل لتحديد السبب.'],
};
export function alertText(event) {
  const state={incident:'عطل مؤكد',recovered:'تم التعافي',reminder:'العطل مستمر',test:'اختبار التنبيهات'}[event.type]||'تنبيه';
  const [observed,impact,action]=guidance[event.key]||guidance.site;
  const details=event.type==='test'?'هذه رسالة اختبار فقط، ولا تعني وجود عطل.\nالغرض: التأكد من وصول التنبيه بالتنسيق الجديد.':event.type==='recovered'?'الحالة: لم يعد شرط العطل قائمًا بعد فحوص التأكيد.\nالمتابعة: تحقق من الوظيفة المتأثرة؛ التعافي لا يعيد الطلبات السابقة تلقائيًا.':`ما رُصد: ${observed}\nالأثر المحتمل: ${impact}\nالإجراء المقترح: ${action}\nسبب العطل الجذري لم يُحسم بهذا الفحص؛ راجع السجلات للتشخيص.`;
  const time=new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium',timeStyle:'medium',timeZone:'Asia/Riyadh'}).format(new Date(event.at));
  return `[ديسكوكو | ${state}] ${labels[event.key]||'مراقبة التشغيل'}\n${details}\nالوقت: ${time} (الرياض)\nمرجع: ${event.id}\nالتفاصيل: لوحة الإدارة ← مراقبة التشغيل.\nلا تعِد تنفيذ طلبات Discord غير المؤكدة قبل مراجعة نتيجتها.`;
}
export function createAlertSender(env=process.env,{fetchImpl=fetch,transport}={}) {
  const config=alertConfiguration(env);
  const mail=transport || (config.emailReady?nodemailer.createTransport({host:env.SMTP_HOST,port:Number(env.SMTP_PORT||465),secure:Number(env.SMTP_PORT||465)===465,requireTLS:Number(env.SMTP_PORT||465)!==465,tls:{minVersion:'TLSv1.2'},auth:{user:env.SMTP_USER,pass:env.SMTP_PASS},connectionTimeout:8000,greetingTimeout:8000,socketTimeout:10000}):null);
  return {config,async send(channel,event){
    const text=alertText(event);
    if(channel==='email'){
      if(!config.emailReady)throw Object.assign(Error('Email alerts not configured'),{code:'ALERT_EMAIL_UNCONFIGURED'});
      await mail.sendMail({from:env.SMTP_FROM||env.SMTP_USER,to:config.emails,subject:`ديسكوكو: ${event.type==='recovered'?'تعافٍ':event.type==='test'?'اختبار':'تنبيه تشغيل'}`,text,messageId:`<${event.id}@diskoko.com>`});
    }else if(channel==='discord'){
      if(!config.discordReady)throw Object.assign(Error('Discord alerts not configured'),{code:'ALERT_DISCORD_UNCONFIGURED'});
      if(env.OPS_DISCORD_WEBHOOK_URL){
        const target=await fetchImpl(env.OPS_DISCORD_WEBHOOK_URL,{signal:AbortSignal.timeout(8000)});
        const scope=target.ok?await target.json():null;
        if(scope?.guild_id!==config.guild || scope?.channel_id!==config.channel)throw Object.assign(Error('Invalid webhook scope'),{code:'ALERT_CHANNEL_SCOPE'});
        const response=await fetchImpl(env.OPS_DISCORD_WEBHOOK_URL+'?wait=true',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(10000),body:JSON.stringify({content:text,allowed_mentions:{parse:[]}})});
        if(!response.ok)throw Object.assign(Error('Discord webhook rejected'),{code:`ALERT_DISCORD_${response.status}`});
        return;
      }
      const headers={Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`,'Content-Type':'application/json'};
      // Fail closed if a copied channel ID points outside the configured operations guild.
      const target=await fetchImpl(`https://discord.com/api/v10/channels/${config.channel}`,{headers,signal:AbortSignal.timeout(8000)});
      if(!target.ok || (await target.json()).guild_id!==config.guild)throw Object.assign(Error('Invalid alert channel scope'),{code:'ALERT_CHANNEL_SCOPE'});
      const response=await fetchImpl(`https://discord.com/api/v10/channels/${config.channel}/messages`,{method:'POST',headers,signal:AbortSignal.timeout(10000),body:JSON.stringify({content:text,allowed_mentions:{parse:[]},nonce:createHash('sha256').update(event.id).digest('hex').slice(0,24),enforce_nonce:true})});
      if(!response.ok)throw Object.assign(Error('Discord alert rejected'),{code:`ALERT_DISCORD_${response.status}`});
    }else throw Error('Unknown alert transport');
  }};
}

export function advanceIncidents(previous,conditions,{now=Date.now(),channels=['email','discord']}={}) {
  const state=structuredClone(previous || {incidents:{},history:[],outbox:[]});
  state.incidents||={};state.history||=[];state.outbox||=[];
  const emit=(key,type)=>{const event={id:randomUUID(),key,type,at:now,delivery:Object.fromEntries(channels.map(c=>[c,{attempts:0,nextAt:now}]))};state.history.unshift(event);state.outbox.push(event);};
  for(const [key,bad] of Object.entries(conditions)){
    if(!Object.hasOwn(labels,key))continue;
    const item=state.incidents[key]||{active:false,badSince:null,goodSince:null};
    if(bad){item.goodSince=null;item.badSince??=now;
      if(!item.active && now-item.badSince>=20000){item.active=true;item.lastAlertAt=now;emit(key,'incident');}
      else if(item.active && now-item.lastAlertAt>=1800000){item.lastAlertAt=now;emit(key,'reminder');}
    }else{item.badSince=null;item.goodSince??=now;
      if(item.active && now-item.goodSince>=20000){item.active=false;emit(key,'recovered');}
    }
    state.incidents[key]=item;
  }
  state.history=state.history.slice(0,50);
  // Drop oldest reminders first under prolonged transport failure, preserving current incidents.
  state.outbox=state.outbox.slice(-50);
  return state;
}

export function createOperationsMonitor(pool,{env=process.env,collect=collectOperations,sender=createAlertSender(env),now=Date.now,log=console.error,immediate=true}={}) {
  let snapshot,checkedAt=0,journal,localDatabaseState,stopping=false,busy=false;
  const http={requests:0,errors:0};let minute=now();
  const metrics=(req,res,next)=>{res.once('finish',()=>{if(req.path?.startsWith('/api/health') || req.path?.startsWith('/api/operations/health'))return;if(now()-minute>60000){http.requests=0;http.errors=0;minute=now();}http.requests++;if(res.statusCode>=500)http.errors++;});next();};
  async function observe({test=false}={}) {
    if(stopping)return;
    let db;
    try{
      snapshot=await collect(pool,{externalWorker:env.BOT_GATEWAY_MODE==='external',now:now(),http:{...http}});snapshot.databaseSoftLimitBytes=Number(env.RESOURCE_DB_SOFT_LIMIT_MB||700)*1024*1024;checkedAt=now();
      db=await pool.connect();await db.query('BEGIN');
      const lock=(await db.query("SELECT pg_try_advisory_xact_lock(hashtext('diskoko:operations:v1')) AS locked")).rows[0];
      if(!lock.locked){await db.query('ROLLBACK');db.release();db=null;return false;}
      const saved=(await db.query('SELECT status FROM bot_runtime_state WHERE id=$1 FOR UPDATE',[JOURNAL])).rows[0]?.status;
      let previous=saved;
      if(localDatabaseState){
        previous=structuredClone(saved||{incidents:{},history:[],outbox:[]});
        previous.incidents.database=localDatabaseState.incidents.database;
        previous.history=[...localDatabaseState.history,...previous.history].slice(0,50);
        previous.outbox=[...localDatabaseState.outbox.filter(e=>!Object.values(e.delivery).every(d=>d.sentAt)),...previous.outbox].slice(-50);
        localDatabaseState=null;
      }
      journal=advanceIncidents(previous,operationalConditions(snapshot),{now:now()});
      journal.snapshot=snapshot;journal.checkedAt=checkedAt;
      if(test){const event={id:randomUUID(),key:'worker',type:'test',at:now(),delivery:{email:{attempts:0,nextAt:now()},discord:{attempts:0,nextAt:now()}}};journal.history.unshift(event);journal.history=journal.history.slice(0,50);journal.outbox.push(event);journal.outbox=journal.outbox.slice(-50);}
      // Claim delivery for this process before releasing the DB lock; the lease survives restarts.
      const owner=randomUUID(),due=[];
      for(const event of journal.outbox)for(const [channel,d] of Object.entries(event.delivery))if(!d.sentAt && d.nextAt<=now() && (!d.leaseUntil || d.leaseUntil<now()) && due.length<2){d.owner=owner;d.leaseUntil=now()+180000;due.push({event,channel});}
      await db.query('INSERT INTO bot_runtime_state(id,status,seen_at) VALUES($1,$2,NOW()) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,seen_at=NOW()',[JOURNAL,JSON.stringify(journal)]);
      await db.query('COMMIT');db.release();db=null;
      for(const {event,channel} of due){
        let failure;try{await sender.send(channel,event);}catch(error){failure=safeOperationError(error).code;log('Operations notification failed',{channel,code:failure});}
        // Re-lock the current journal so overlapping deploys cannot overwrite another delivery.
        const client=await pool.connect();
        try{await client.query('BEGIN');const current=(await client.query('SELECT status FROM bot_runtime_state WHERE id=$1 FOR UPDATE',[JOURNAL])).rows[0]?.status;
          const entry=current?.outbox.find(e=>e.id===event.id),delivery=entry?.delivery[channel];
          if(delivery?.owner===owner){delivery.attempts++;delete delivery.owner;delete delivery.leaseUntil;
            if(failure){delivery.lastError=failure;delivery.nextAt=now()+Math.min(1800000,30000*2**Math.min(delivery.attempts,6));}else{delivery.sentAt=now();delete delivery.lastError;}
            const history=current.history.find(e=>e.id===event.id);if(history)history.delivery=structuredClone(entry.delivery);
            current.outbox=current.outbox.filter(e=>!Object.values(e.delivery).every(d=>d.sentAt));
            await client.query('UPDATE bot_runtime_state SET status=$2,seen_at=NOW() WHERE id=$1',[JOURNAL,JSON.stringify(current)]);journal=current;
          }
          await client.query('COMMIT');
        }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
      }
      localDatabaseState=null;return true;
    }catch(error){
      if(db){await db.query('ROLLBACK').catch(()=>{});db.release();}
      snapshot={at:now(),database:'unavailable',externalWorker:env.BOT_GATEWAY_MODE==='external'};checkedAt=now();
      log('Operations observation failed',safeOperationError(error));
      // A database outage cannot persist an outbox. Keep bounded local delivery progress;
      // the independent watchdog remains responsible when this process is also unavailable.
      localDatabaseState=advanceIncidents(localDatabaseState,{database:true},{now:now()});
      let attempted=0;
      for(const event of localDatabaseState.outbox)for(const [channel,d] of Object.entries(event.delivery))if(!d.sentAt && d.nextAt<=now() && attempted++<2)try{await sender.send(channel,event);d.sentAt=now();}catch{d.attempts++;d.nextAt=now()+Math.min(1800000,30000*2**Math.min(d.attempts,6));}
    }
  }
  async function tick(options){if(stopping || busy)return false;busy=true;try{return await observe(options);}finally{busy=false;}}
  const loop=managedLoop('operations',tick,{intervalMs:20000,immediate,log});
  let testAt=0;
  return {metrics,tick,async stop(){stopping=true;await loop();},
    publicHealth(){const fresh=checkedAt>0 && now()-checkedAt<60000;return {ok:Boolean(fresh && snapshot?.database==='ready' && !Object.values(operationalConditions(snapshot)).some(Boolean)),checkedAt:fresh?new Date(checkedAt).toISOString():null};},
    async details(){const saved=(await pool.query('SELECT status FROM bot_runtime_state WHERE id=$1',[JOURNAL])).rows[0]?.status;
      return {health:this.publicHealth(),snapshot,journal:saved||journal,notifications:{emailConfigured:sender.config.emailReady,discordConfigured:sender.config.discordReady,emailRecipients:sender.config.emails,discordChannelId:sender.config.channel},thresholds:{workerSeconds:90,pendingSeconds:45,runningSeconds:90,scheduleSeconds:180,confirmationSeconds:20,reminderMinutes:30},release:{commit:env.RENDER_GIT_COMMIT||null,service:env.RENDER_SERVICE_ID||null}};},
    async test(){if(testAt && now()-testAt<60000)throw Object.assign(Error('انتظر دقيقة قبل إعادة اختبار التنبيه.'),{status:429});const accepted=await tick({test:true});if(!accepted)throw Object.assign(Error('الفحص مشغول أو اتصال قاعدة البيانات غير متاح. حاول بعد قليل.'),{status:503});testAt=now();return this.details();},
  };
}
