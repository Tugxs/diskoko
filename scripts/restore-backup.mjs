import {readFile,writeFile} from 'node:fs/promises';
import pg from 'pg';
import {databaseOptions} from '../lib/database.js';
import {inspectBackup,restoreToEmptyDatabase} from '../lib/backup-restore.js';

// Passwords are read from a private file, never command-line arguments or logs.
const args=process.argv.slice(2),file=args[0],mode=args[1]||'--verify';
if(!file || !['--verify','--restore-isolated','--extract-recovery-key'].includes(mode) || !process.env.BACKUP_PASSWORD_FILE){
  console.error('Usage: BACKUP_PASSWORD_FILE=<private-file> node scripts/restore-backup.mjs <archive.dkbackup> [--verify|--restore-isolated|--extract-recovery-key]');process.exitCode=1;
}else{
  let archive,pool;
  try{
    const password=(await readFile(process.env.BACKUP_PASSWORD_FILE,'utf8')).replace(/\r?\n$/,'');
    archive=await inspectBackup(file,password);
    if(mode==='--verify')console.log(JSON.stringify({verified:true,id:archive.manifest.id,scope:archive.manifest.scope,schemaVersion:archive.manifest.schemaVersion,tables:archive.manifest.tables.length,rows:Object.values(archive.counts).reduce((a,b)=>a+b,0),recoveryKeyIncluded:archive.manifest.recoveryKeyIncluded}));
    else if(mode==='--extract-recovery-key'){
      const key=archive.manifest.recovery?.ENCRYPTION_KEY;
      if(typeof key!=='string' || !key || !process.env.RECOVERY_KEY_OUTPUT)throw Error('Missing recovery key or private output path');
      await writeFile(process.env.RECOVERY_KEY_OUTPUT,key,{flag:'wx',mode:0o600});console.log('Recovery key written to the explicitly selected new private file. Never upload it or paste it into chat.');
    }else{
      if(process.env.RESTORE_ACK!=='ISOLATED_EMPTY_DATABASE_NO_WORKERS')throw Error('Missing isolated recovery acknowledgement');
      pool=new pg.Pool({...databaseOptions('web'),max:1});
      console.log(JSON.stringify(await restoreToEmptyDatabase(pool,archive,{schemaOwner:process.env.DB_SCHEMA_OWNER})));
    }
  }catch{console.error('Backup verification or isolated restore failed. Check the password, archive, schema version and empty recovery target. No production restore was attempted.');process.exitCode=1;}
  finally{if(archive)await archive.cleanup();if(pool)await pool.end();}
}
