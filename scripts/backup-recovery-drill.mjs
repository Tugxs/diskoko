import pg from 'pg';
import {randomBytes,createHash,createDecipheriv} from 'node:crypto';
import {databaseOptions} from '../lib/database.js';
import {createBackupFile} from '../lib/admin-backups.js';
import {inspectBackup,restoreToEmptyDatabase} from '../lib/backup-restore.js';

// Run only through the authenticated operator shell. The maintenance URL is a
// temporary process variable, never stored in the web/worker service settings.
if(process.env.RESTORE_ACK!=='ISOLATED_EMPTY_DATABASE_NO_WORKERS' || !process.env.RESTORE_ADMIN_DATABASE_URL){
  console.error('An explicit isolated drill acknowledgement and temporary maintenance URL are required.');process.exitCode=1;
}else{
  const source=new pg.Pool({...databaseOptions('web'),max:1});
  const maintenance=new pg.Pool({...databaseOptions('web',{...process.env,DATABASE_URL:process.env.RESTORE_ADMIN_DATABASE_URL}),max:1});
  const targetName='diskoko_restore_'+Date.now()+'_'+randomBytes(4).toString('hex');
  let target,archive,verified,created=false,phase='preflight';const started=Date.now();
  try{
    const sourceName=(await source.query('SELECT current_database() AS name')).rows[0].name;
    if(sourceName===targetName)throw Error('Invalid isolated target');
    if(process.env.DB_SCHEMA_OWNER){if(!/^[a-z][a-z0-9_]{2,47}$/.test(process.env.DB_SCHEMA_OWNER))throw Error('Invalid schema owner');await maintenance.query('SET ROLE "'+process.env.DB_SCHEMA_OWNER+'"');}
    phase='create-target';await maintenance.query('CREATE DATABASE "'+targetName+'"');created=true;
    const url=new URL(process.env.RESTORE_ADMIN_DATABASE_URL);url.pathname='/'+targetName;
    target=new pg.Pool({...databaseOptions('web',{...process.env,DATABASE_URL:url.toString()}),max:1});
    phase='export';const client=await source.connect(),password=randomBytes(48).toString('base64url');
    try{
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SET LOCAL TIME ZONE 'UTC'");
      archive=await createBackupFile(client,{password,scope:'full',includeRecoveryKey:true});
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
    phase='authenticate';const exportedMs=Date.now()-started;verified=await inspectBackup(archive.file,password);
    phase='restore';const result=await restoreToEmptyDatabase(target,verified,{schemaOwner:process.env.DB_SCHEMA_OWNER});
    phase='key-verification';const key=verified.manifest.recovery?.ENCRYPTION_KEY;
    if(!key || key!==process.env.ENCRYPTION_KEY)throw Error('Recovery key mismatch');
    const token=(await target.query('SELECT access_token FROM users WHERE access_token IS NOT NULL LIMIT 1')).rows[0]?.access_token;
    let encryptedTokenVerified=false;
    if(token){const [iv,tag,data]=token.split('.').map(v=>Buffer.from(v,'base64url'));const decipher=createDecipheriv('aes-256-gcm',createHash('sha256').update(key).digest(),iv);decipher.setAuthTag(tag);const plain=Buffer.concat([decipher.update(data),decipher.final()]);if(!plain.length)throw Error('Empty recovered token');plain.fill(0);encryptedTokenVerified=true;}
    phase='report';const report={...result,counts:undefined,exportedMs,totalMs:Date.now()-started,encryptedBytes:archive.bytes,encryptedTokenVerified,completedAt:new Date().toISOString(),kind:'logical-restore-same-host',productionUntouched:true};
    await source.query("INSERT INTO audit_logs(action,target_type,target_id,details) VALUES('admin.backup.drill','backup',$1,$2::jsonb)",[verified.manifest.id,JSON.stringify(report)]);
    console.log(JSON.stringify(report));
  }catch(error){
    const code=/^[A-Z0-9_]{1,40}$/.test(error.code||'')?error.code:'RECOVERY_FAILED';
    const known=['Restore schema does not match archive','Archive column schema does not match this release','Restored values differ from archive','Recovery key mismatch','Invalid sequence watermark'];
    console.error(JSON.stringify({recovered:false,phase,code,...(known.includes(error.message)?{reason:error.message}:{}),productionUntouched:true}));process.exitCode=1;
  }finally{
    if(verified)await verified.cleanup();if(archive)await archive.cleanup();if(target)await target.end();
    if(created){try{await maintenance.query('DROP DATABASE "'+targetName+'"');}catch{console.error('Disposable drill database remains: '+targetName);process.exitCode=1;}}
    await source.end();await maintenance.end();
  }
}
