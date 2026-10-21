import {mkdtemp,rm,open,stat} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createGzip} from 'node:zlib';
import {encryption,byteLimit,BACKUP_LIMIT,validateBackupPassword} from './backup-format.js';
import {DATABASE_SCHEMA_VERSION} from './database-schema.js';

export const backupGroups={
  accounts:{label:'الحسابات والاشتراكات والفوترة',tables:['users','projects','subscriptions','subscription_events','billing_invoices','billing_upgrade_requests','discount_coupons','support_reports']},
  commands:{label:'الأوامر البرمجية وبياناتها وأسرارها المشفّرة',prefixes:['code_','control_center_','admin_panel_'],tables:['code_commands']},
  workspace:{label:'إعدادات السيرفر والقوالب والبوتات',prefixes:['workspace_','ready_template_','standalone_module_','movie_','community_','interactive_'],tables:['guild_connections','custom_bots','bot_guild_settings','ai_bot_connections','customer_bot_registry','custom_templates','template_versions']},
  schedules:{label:'الرسائل المجدولة وسجل إرسالها',tables:['scheduled_messages','workspace_schedule_history']},
  history:{label:'سجلات الإدارة والاستخدام والتغييرات',prefixes:['guild_activity_'],tables:['audit_logs','usage_events','change_sets','change_operations']},
};
export const identifier=name=>{if(typeof name!=='string' || !/^[a-z_][a-z0-9_]{0,62}$/.test(name))throw Error('Unsupported database identifier');return '"'+name+'"';};
export async function backupCatalog(client){
  const tables=(await client.query(`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relispartition ORDER BY c.relname`)).rows.map(r=>r.name);
  const foreignKeys=(await client.query(`SELECT child.relname AS child,parent.relname AS parent FROM pg_constraint f JOIN pg_class child ON child.oid=f.conrelid JOIN pg_class parent ON parent.oid=f.confrelid JOIN pg_namespace n ON n.oid=child.relnamespace WHERE f.contype='f' AND n.nspname='public'`)).rows;
  return {tables,foreignKeys};
}
export function selectBackupTables(catalog,scope){
  if(scope==='full')return catalog.tables;
  if(!Object.hasOwn(backupGroups,scope))throw Object.assign(Error('اختر نطاق نسخة صالحًا.'),{status:400});
  const group=backupGroups[scope];
  const selected=new Set(catalog.tables.filter(t=>group.tables.includes(t) || group.prefixes?.some(prefix=>t.startsWith(prefix))));
  let changed=true;while(changed){changed=false;for(const {child,parent} of catalog.foreignKeys)if(selected.has(child) && !selected.has(parent)){if(!catalog.tables.includes(parent))throw Error('Cross-schema backup dependency');selected.add(parent);changed=true;}}
  return catalog.tables.filter(t=>selected.has(t));
}
export async function* backupLines(client,{scope='full',includeRecoveryKey=false,env=process.env,id=randomUUID(),signal}={}){
  const catalog=await backupCatalog(client),tables=selectBackupTables(catalog,scope);
  const columns=(await client.query(`SELECT table_name,column_name,data_type,udt_name,is_generated FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`)).rows.filter(r=>tables.includes(r.table_name));
  const header={type:'manifest',format:1,id,schemaVersion:DATABASE_SCHEMA_VERSION,createdAt:new Date().toISOString(),scope,tables,columns,
    recoveryKeyIncluded:includeRecoveryKey,exclusions:['external files and remote URLs','Render environment and infrastructure','Discord messages, members and server state'],
    ...(includeRecoveryKey?{recovery:{ENCRYPTION_KEY:env.ENCRYPTION_KEY}}:{})};
  if(includeRecoveryKey && (scope!=='full' || !env.ENCRYPTION_KEY))throw Object.assign(Error('مفتاح التعافي متاح مع النسخة الكاملة فقط وبعد ضبط مفتاح الموقع.'),{status:400});
  const hash=createHash('sha256'),counts={};
  function line(value){const text=JSON.stringify(value)+'\n';hash.update(text);return text;}
  yield line(header);
  for(const table of tables){
    if(signal?.aborted)throw Error('Backup cancelled');
    counts[table]=0;
    await client.query('DECLARE diskoko_backup_cursor NO SCROLL CURSOR FOR SELECT row_to_json(t)::text AS payload FROM public.'+identifier(table)+' t');
    try{while(true){
      if(signal?.aborted)throw Error('Backup cancelled');
      const row=(await client.query('FETCH FORWARD 1 FROM diskoko_backup_cursor')).rows[0];if(!row)break;
      // Keep PostgreSQL JSON as text. Parsing large integer IDs in JavaScript loses precision.
      if(Buffer.byteLength(row.payload)>8*1024*1024)throw Error('Backup row size limit exceeded');
      yield line({type:'row',table,json:row.payload});counts[table]++;
    }}finally{await client.query('CLOSE diskoko_backup_cursor').catch(()=>{});}
  }
  yield JSON.stringify({type:'complete',counts,sha256:hash.digest('hex')})+'\n';
}
export async function createBackupFile(client,{password,...options}){
  const directory=await mkdtemp(path.join(tmpdir(),'diskoko-backup-'));
  const file=path.join(directory,'archive.dkbackup');
  try{
    const {header,cipher}=await encryption(password);
    const handle=await open(file,'wx',0o600);await handle.write(header);await handle.close();
    await pipeline(Readable.from(backupLines(client,options)),byteLimit(512*1024*1024),createGzip(),cipher,byteLimit(BACKUP_LIMIT-52),createWriteStream(file,{flags:'a',mode:0o600}),{signal:options.signal});
    const append=await open(file,'a');try{await append.write(cipher.getAuthTag());}finally{await append.close();}
    return {file,directory,bytes:(await stat(file)).size,cleanup:()=>rm(directory,{recursive:true,force:true})};
  }catch(error){await rm(directory,{recursive:true,force:true});throw error;}
}

export function mountAdminBackups(app,{pool,requireAdmin,audit,env=process.env}){
  app.get('/api/admin/backups',requireAdmin,async(_req,res,next)=>{try{
    res.set('Cache-Control','no-store');
    const [catalog,history]=await Promise.all([backupCatalog(pool),pool.query(`SELECT id,action,details,created_at FROM audit_logs WHERE action LIKE 'admin.backup.%' ORDER BY id DESC LIMIT 40`)]);
    res.json({groups:Object.entries(backupGroups).map(([id,g])=>({id,label:g.label,tables:selectBackupTables(catalog,id)})),tables:catalog.tables,schemaVersion:DATABASE_SCHEMA_VERSION,maxBytes:BACKUP_LIMIT,
      history:history.rows,storage:'encrypted-download',automaticOffsite:false,recoveryUrl:'https://dashboard.render.com/d/dpg-dan4jcrtqb8s73aivb20-a/recovery'});
  }catch(error){next(error);}});
  let localBusy=false;
  app.post('/api/admin/backups/download',requireAdmin,async(req,res,next)=>{
    if(!req.body || typeof req.body!=='object' || Array.isArray(req.body))return res.status(400).json({error:'أرسل بيانات النسخة بصيغة JSON.'});
    let client,locked=false,ownsLocal=false,archive,timer;const abort=new AbortController();
    const stop=()=>{if(!res.writableFinished)abort.abort();};res.once('close',stop);
    try{
      validateBackupPassword(req.body.password);
      if(req.body.password!==req.body.confirmPassword || req.body.acknowledge!==true)throw Object.assign(Error('أكد كلمة المرور ومراجعة حساسية البيانات قبل التنزيل.'),{status:400});
      const scope=req.body.scope||'full';if(scope!=='full' && !Object.hasOwn(backupGroups,scope))throw Object.assign(Error('نطاق النسخة غير صالح.'),{status:400});
      if(localBusy)throw Object.assign(Error('هناك نسخة قيد الإنشاء. انتظر اكتمالها.'),{status:409});
      localBusy=true;ownsLocal=true;
      client=await pool.connect();locked=(await client.query("SELECT pg_try_advisory_lock(hashtext('diskoko:manual-backup:v1')) AS locked")).rows[0].locked;
      if(!locked)throw Object.assign(Error('هناك نسخة أخرى قيد الإنشاء.'),{status:409});
      const id=randomUUID(),started=Date.now();
      await audit(req.user.id,'admin.backup.started','backup',id,{scope});
      timer=setTimeout(()=>abort.abort(),120_000);timer.unref();
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL statement_timeout='15s';SET LOCAL idle_in_transaction_session_timeout='30s';SET LOCAL TIME ZONE 'UTC'");
      archive=await createBackupFile(client,{password:req.body.password,scope,includeRecoveryKey:req.body.includeRecoveryKey===true,env,id,signal:abort.signal});
      await client.query('COMMIT');
      clearTimeout(timer);
      await audit(req.user.id,'admin.backup.prepared','backup',id,{scope,bytes:archive.bytes,durationMs:Date.now()-started,recoveryKeyIncluded:req.body.includeRecoveryKey===true});
      res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      await new Promise((resolve,reject)=>res.download(archive.file,`diskoko-${scope}-${new Date().toISOString().slice(0,10)}-${id}.dkbackup`,err=>err?reject(err):resolve()));
      await audit(req.user.id,'admin.backup.sent','backup',id,{scope,bytes:archive.bytes});
    }catch(error){
      if(client)await client.query('ROLLBACK').catch(()=>{});
      await audit(req.user.id,'admin.backup.failed','backup',null,{reason:error.status?'request-rejected':'export-interrupted'}).catch(()=>{});
      if(res.headersSent)res.destroy();else next(error.status?error:Object.assign(Error('تعذر تجهيز النسخة أو انقطع التنزيل. لم تتغير بيانات الموقع؛ أعد المحاولة وتحقق من المساحة.'),{status:503,expose:true}));
    }finally{
      clearTimeout(timer);res.off('close',stop);
      // Erase references; passphrases and recovery keys never enter the audit log.
      req.body.password=undefined;req.body.confirmPassword=undefined;
      if(archive)await archive.cleanup().catch(()=>{});
      if(client){if(locked)await client.query("SELECT pg_advisory_unlock(hashtext('diskoko:manual-backup:v1'))").catch(()=>{});client.release();}
      if(ownsLocal)localBusy=false;
    }
  });
}
