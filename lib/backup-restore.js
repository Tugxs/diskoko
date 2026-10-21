import {open,mkdtemp,rm,stat} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pipeline} from 'node:stream/promises';
import {createGunzip} from 'node:zlib';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {Transform} from 'node:stream';
import {decryption,byteLimit,BACKUP_LIMIT} from './backup-format.js';
import {identifier,backupCatalog} from './admin-backups.js';
import {DATABASE_SCHEMA_VERSION,migrateApplicationSchema} from './database-schema.js';

async function* lines(file){
  let length=0;
  const input=createReadStream(file),bounded=new Transform({transform(chunk,_enc,done){for(const b of chunk){length=b===10?0:length+1;if(length>20*1024*1024)return done(Error('Archive row exceeds limit'));}done(null,chunk);}});
  input.on('error',e=>bounded.destroy(e));input.pipe(bounded);
  const reader=createInterface({input:bounded,crlfDelay:Infinity});
  try{for await(const line of reader)yield line;}finally{reader.close();input.destroy();bounded.destroy();}
}
export async function inspectBackup(file,password){
  const size=(await stat(file)).size;if(size<52 || size>BACKUP_LIMIT)throw Error('Invalid backup size');
  const handle=await open(file,'r'),header=Buffer.alloc(36),tag=Buffer.alloc(16);
  try{await handle.read(header,0,36,0);await handle.read(tag,0,16,size-16);}finally{await handle.close();}
  const directory=await mkdtemp(path.join(tmpdir(),'diskoko-restore-'));
  const compressed=path.join(directory,'authenticated.gz'),plain=path.join(directory,'verified.jsonl');
  const cleanup=()=>rm(directory,{recursive:true,force:true});
  try{
    // Authentication must finish before decompression, parsing, or any database write.
    await pipeline(createReadStream(file,{start:36,end:size-17}),await decryption(password,header,tag),byteLimit(BACKUP_LIMIT),createWriteStream(compressed,{flags:'wx',mode:0o600}));
    await pipeline(createReadStream(compressed),createGunzip(),byteLimit(512*1024*1024),createWriteStream(plain,{flags:'wx',mode:0o600}));
    let manifest,complete;const counts={},digest=createHash('sha256');
    for await(const line of lines(plain)){
      const record=JSON.parse(line);
      if(complete)throw Error('Unexpected trailing archive data');
      if(!manifest){
        if(record.type!=='manifest' || record.format!==1 || record.schemaVersion!==DATABASE_SCHEMA_VERSION || !Array.isArray(record.tables) || record.tables.length>300 || new Set(record.tables).size!==record.tables.length || !Array.isArray(record.columns))throw Error('Unsupported backup manifest or schema version');
        record.tables.forEach(identifier);manifest=record;for(const table of record.tables)counts[table]=0;
      }else if(record.type==='row'){
        if(!Object.hasOwn(counts,record.table) || typeof record.json!=='string' || Buffer.byteLength(record.json)>8*1024*1024)throw Error('Invalid archive row');
        // Validate JSON without reserializing it; the original text retains BIGINT precision.
        const row=JSON.parse(record.json);if(!row || typeof row!=='object' || Array.isArray(row))throw Error('Invalid row data');counts[record.table]++;
      }else if(record.type==='complete'){
        if(record.sha256!==digest.digest('hex') || JSON.stringify(record.counts)!==JSON.stringify(counts))throw Error('Backup completeness verification failed');complete=record;continue;
      }else throw Error('Unknown archive record');
      digest.update(line+'\n');
    }
    if(!manifest || !complete)throw Error('Incomplete backup');
    return {manifest,counts,plain,cleanup};
  }catch(error){await cleanup();throw error;}
}

// Operator only: no HTTP restore endpoint, no production target, no worker startup.
export async function restoreToEmptyDatabase(pool,verified,{schemaOwner}={}){
  const target=(await pool.query('SELECT current_database() AS name')).rows[0].name;
  if(!/^diskoko_restore_[a-z0-9_]{1,32}$/.test(target))throw Error('Restore target must be an isolated diskoko_restore_* database');
  const existing=(await backupCatalog(pool)).tables;
  if(existing.length)throw Error('Restore target is not empty; no existing table was modified');
  if((await pool.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()')).rows[0].n)throw Error('Restore target has other connections');
  await migrateApplicationSchema(pool,{schemaOwner});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout='120s';SET LOCAL lock_timeout='5s';SET LOCAL TIME ZONE 'UTC'");
    if(schemaOwner)await client.query('SET LOCAL ROLE '+identifier(schemaOwner));
    const catalog=await backupCatalog(client),manifest=verified.manifest;
    if(manifest.tables.some(t=>!catalog.tables.includes(t)))throw Error('Restore schema does not match archive');
    const columns=(await client.query(`SELECT table_name,column_name,data_type,udt_name,is_generated FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`)).rows;
    if(JSON.stringify(columns.filter(r=>manifest.tables.includes(r.table_name)))!==JSON.stringify(manifest.columns))throw Error('Archive column schema does not match this release');
    // Only the newly created, empty, isolated schema is touched. Constraint SQL comes
    // from this trusted migration, never from an uploaded archive.
    const constraints=(await client.query(`SELECT c.relname AS table_name,f.conname,pg_get_constraintdef(f.oid) AS definition FROM pg_constraint f JOIN pg_class c ON c.oid=f.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE f.contype='f' AND n.nspname='public'`)).rows;
    for(const f of constraints)await client.query('ALTER TABLE public.'+identifier(f.table_name)+' DROP CONSTRAINT '+identifier(f.conname));
    if(catalog.tables.length)await client.query('TRUNCATE '+catalog.tables.map(t=>'public.'+identifier(t)).join(','));
    const counts={},checksums={};for(const table of manifest.tables){counts[table]=0;checksums[table]=0n;}
    const checksum=text=>BigInt('0x'+createHash('sha256').update(text).digest('hex'));
    const modulus=1n<<256n;
    for await(const line of lines(verified.plain)){
      const r=JSON.parse(line);if(r.type!=='row')continue;
      const names=columns.filter(c=>c.table_name===r.table && c.is_generated==='NEVER').map(c=>identifier(c.column_name));
      await client.query('INSERT INTO public.'+identifier(r.table)+' ('+names.join(',')+') OVERRIDING SYSTEM VALUE SELECT '+names.join(',')+' FROM json_populate_record(NULL::public.'+identifier(r.table)+',$1::json)',[r.json]);counts[r.table]++;checksums[r.table]=(checksums[r.table]+checksum(r.json))%modulus;
    }
    for(const f of constraints)await client.query('ALTER TABLE public.'+identifier(f.table_name)+' ADD CONSTRAINT '+identifier(f.conname)+' '+f.definition);
    // Serial defaults must advance past restored IDs, including BIGINT values.
    for(const c of columns){
      const sequence=(await client.query('SELECT pg_get_serial_sequence($1,$2) AS name',['public.'+identifier(c.table_name),c.column_name])).rows[0].name;
      if(sequence)await client.query('SELECT setval($1,COALESCE((SELECT max('+identifier(c.column_name)+') FROM public.'+identifier(c.table_name)+'),1),EXISTS(SELECT 1 FROM public.'+identifier(c.table_name)+'))',[sequence]);
    }
    await client.query('INSERT INTO diskoko_schema_state(id,version) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET version=EXCLUDED.version',[DATABASE_SCHEMA_VERSION]);
    if(JSON.stringify(counts)!==JSON.stringify(verified.counts))throw Error('Restored row counts do not match');
    for(const table of manifest.tables){
      // A bounded, order-independent multiset checksum compares actual values,
      // not only row counts. No customer data is printed in the drill report.
      let count=0,sum=0n;await client.query('DECLARE diskoko_verify_cursor NO SCROLL CURSOR FOR SELECT row_to_json(t)::text AS payload FROM public.'+identifier(table)+' t');
      try{while(true){const row=(await client.query('FETCH FORWARD 1 FROM diskoko_verify_cursor')).rows[0];if(!row)break;count++;sum=(sum+checksum(row.payload))%modulus;}}finally{await client.query('CLOSE diskoko_verify_cursor');}
      if(count!==counts[table] || sum!==checksums[table])throw Error('Restored values differ from archive');
    }
    await client.query('COMMIT');
    return {target,scope:manifest.scope,tables:manifest.tables.length,rows:Object.values(counts).reduce((a,b)=>a+b,0),counts,valuesVerified:true,offline:true,recoveryKeyIncluded:manifest.recoveryKeyIncluded};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}
