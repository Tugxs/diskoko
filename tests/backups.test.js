import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import pg from 'pg';
import {PGlite} from '@electric-sql/pglite';
import {JSDOM} from 'jsdom';
import {selectBackupTables,createBackupFile,mountAdminBackups} from '../lib/admin-backups.js';
import {inspectBackup,restoreToEmptyDatabase} from '../lib/backup-restore.js';
import {validateBackupPassword} from '../lib/backup-format.js';
import {migrateApplicationSchema} from '../lib/database-schema.js';
import {resourcePolicy} from '../lib/resource-protection.js';
import express from 'express';

const password='disposable-test-passphrase-only';
test('selected backups include dependency closure and reject arbitrary scopes',()=>{
  const catalog={tables:['users','projects','code_commands','code_project_data','unrelated'],foreignKeys:[{child:'code_project_data',parent:'code_commands'},{child:'code_commands',parent:'projects'},{child:'projects',parent:'users'}]};
  assert.deepEqual(selectBackupTables(catalog,'commands'),catalog.tables.slice(0,4));
  assert.deepEqual(selectBackupTables(catalog,'full'),catalog.tables);
  assert.throws(()=>selectBackupTables(catalog,'users; DROP TABLE users'));
  assert.throws(()=>validateBackupPassword('short'));
  assert.throws(()=>validateBackupPassword('界'.repeat(100)));
  const p=resourcePolicy({method:'POST',originalUrl:'/api/admin/backups/download',get:()=>undefined});assert.ok(p.download && p.heavy);assert.equal(p.limit,512*1024);
});

test('encrypted archive round trip preserves BIGINT, JSON, bytea and recovery material; tampering and wrong passwords fail before writes',async()=>{
  const db=new PGlite();let archive,verified;
  try{
    await db.exec("CREATE TABLE sample(id BIGINT PRIMARY KEY,details JSONB,bytes BYTEA);INSERT INTO sample VALUES(9007199254740997,'{\"x\":\"أهلاً\"}',decode('deadbeef','hex'))");
    // PGlite supports the same PostgreSQL cursors and row_to_json format as production.
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    archive=await createBackupFile(db,{password,scope:'full',includeRecoveryKey:true,env:{ENCRYPTION_KEY:'test-only-encryption-key'}});
    await db.query('COMMIT');
    const raw=await readFile(archive.file);assert.ok(!raw.includes(Buffer.from('test-only-encryption-key')));assert.ok(!raw.includes(Buffer.from('أهلاً')));
    verified=await inspectBackup(archive.file,password);assert.equal(verified.manifest.recovery.ENCRYPTION_KEY,'test-only-encryption-key');assert.equal(verified.counts.sample,1);
    const text=await readFile(verified.plain,'utf8');assert.match(text,/9007199254740997/);assert.match(text,/deadbeef/);
    await assert.rejects(inspectBackup(archive.file,'incorrect-passphrase-here'));
    raw[45]^=1;const damaged=archive.file+'.damaged';await writeFile(damaged,raw);await assert.rejects(inspectBackup(damaged,password));
    await assert.rejects(restoreToEmptyDatabase({query:async()=>({rows:[{name:'production'}]})},verified),/isolated/);
  }finally{if(verified)await verified.cleanup();if(archive)await archive.cleanup();await db.close();}
});

test('backup HTTP rejects non-admins and repeated downloads, retains the active lock, and keeps secrets out of audit records',async()=>{
  const db=new PGlite(),app=express(),events=[];app.use(express.json());let allow,started;
  const gate=new Promise(r=>allow=r),entered=new Promise(r=>started=r);
  const client={query:async(sql,params)=>sql.includes('pg_try_advisory_lock')?{rows:[{locked:true}]}:sql.includes('pg_advisory_unlock')?{rows:[]}:!params && sql.includes(';')?db.exec(sql):db.query(sql,params),release(){}};
  mountAdminBackups(app,{pool:{connect:async()=>client},requireAdmin(req,res,next){if(req.get('x-test-admin')!=='yes')return res.status(403).json({error:'denied'});req.user={id:1};next();},audit:async(...event)=>{events.push(event);if(event[1]==='admin.backup.started'){started();await gate;}},env:{ENCRYPTION_KEY:'private-test-key'}});
  app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}/api/admin/backups/download`;
  const options={method:'POST',headers:{'Content-Type':'application/json','x-test-admin':'yes'},body:JSON.stringify({password,confirmPassword:password,scope:'full',acknowledge:true,includeRecoveryKey:true})};
  try{
    await db.query('CREATE TABLE fixture(id INT)');
    assert.equal((await fetch(url,{...options,headers:{'Content-Type':'application/json'}})).status,403);
    const first=fetch(url,options);await entered;
    assert.equal((await fetch(url,options)).status,409);assert.equal((await fetch(url,options)).status,409);
    allow();const response=await first;assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.match(response.headers.get('content-disposition'),/\.dkbackup/);assert.ok((await response.arrayBuffer()).byteLength>52);
    const audit=JSON.stringify(events);assert.ok(!audit.includes(password));assert.ok(!audit.includes('private-test-key'));
    assert.ok(events.some(e=>e[1]==='admin.backup.prepared'));
  }finally{allow();await new Promise(r=>server.close(r));await db.close();}
});

test('admin backup UI presents scope, encryption and explicit non-durable storage, without a production restore button',async()=>{
  const dom=new JSDOM(await readFile('admin-console.html','utf8'),{url:'https://diskoko.test/admin',runScripts:'outside-only'});
  const groups=[{id:'commands',label:'أوامر',tables:['users','code_commands']}];
  dom.window.fetch=async url=>({ok:true,json:async()=>url==='/api/me'?{user:{isAdmin:true,username:'admin'}}:url==='/api/admin/backups'?{groups,tables:['users','code_commands'],history:[]}:url==='/api/admin/users'?{users:[]}: {}});
  try{
    dom.window.eval(await readFile('admin-console.20260921.js','utf8'));await new Promise(r=>setTimeout(r,30));
    dom.window.document.querySelector('[data-view=backups]').click();await new Promise(r=>setTimeout(r,30));
    const doc=dom.window.document;assert.ok(doc.querySelector('#backupForm'));assert.match(doc.querySelector('#content').textContent,/ليس تخزينًا خارجيًا تلقائيًا/);
    const scope=doc.querySelector('#backupScope');scope.value='commands';scope.dispatchEvent(new dom.window.Event('change'));
    assert.equal(doc.querySelector('#backupRecoveryKey').disabled,true);assert.match(doc.querySelector('#backupTables').textContent,/code_commands/);
    assert.equal(doc.querySelector('input[name=password]').type,'password');assert.equal(doc.querySelector('input[name=acknowledge]').required,true);
    assert.equal(doc.querySelectorAll('[data-restore-production]').length,0);
  }finally{dom.window.close();}
});

test('real PostgreSQL complete encrypted backup restores to an empty isolated database with foreign keys, sequences and encrypted tokens intact',{timeout:120000},async t=>{
  if(!process.env.RESOURCE_TEST_DATABASE_URL){t.skip('Disposable PostgreSQL required; mandatory in CI');return;}
  const suffix=randomUUID().replaceAll('-','').slice(0,12),sourceName='diskoko_restore_source_'+suffix,targetName='diskoko_restore_target_'+suffix;
  const admin=new pg.Pool({connectionString:process.env.RESOURCE_TEST_DATABASE_URL}),make=name=>{const u=new URL(process.env.RESOURCE_TEST_DATABASE_URL);u.pathname='/'+name;return new pg.Pool({connectionString:u.toString(),max:1});};
  let source,target,archive,verified;
  t.after(async()=>{if(verified)await verified.cleanup();if(archive)await archive.cleanup();if(source)await source.end();if(target)await target.end();for(const name of [sourceName,targetName])await admin.query('DROP DATABASE IF EXISTS "'+name+'" WITH (FORCE)');await admin.end();});
  for(const name of [sourceName,targetName])await admin.query('CREATE DATABASE "'+name+'"');source=make(sourceName);target=make(targetName);
  await migrateApplicationSchema(source);
  // Production histories can append this column after the original table creation.
  await source.query('ALTER TABLE users DROP COLUMN google_id;ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE');
  const recoveryKey='drill-only-key',key=createHash('sha256').update(recoveryKey).digest(),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  const encrypted=Buffer.concat([cipher.update('disposable-no-real-token'),cipher.final()]);
  const encryptedToken=[iv,cipher.getAuthTag(),encrypted].map(b=>b.toString('base64url')).join('.');
  await source.query("INSERT INTO users(id,username,access_token) VALUES(9007199254740997,'restore-fixture',$1)",[encryptedToken]);
  await source.query("INSERT INTO projects(user_id,name) VALUES(9007199254740997,'عينة الاسترجاع')");
  await source.query("SELECT setval('projects_id_seq',5000,true)");
  await source.query("INSERT INTO community_panels(guild_id,panel_key,channel_id,message_id) VALUES('test-guild','account','test-channel','test-message');INSERT INTO customer_link_panels(guild_id,channel_id,message_id) VALUES('test-guild','test-channel','test-message');INSERT INTO diskoko_game_panel VALUES('test-guild','test-channel','test-message');INSERT INTO diskoko_game_scores VALUES('test-guild','test-user',CURRENT_DATE,7)");
  await source.query(`INSERT INTO session(sid,sess,expire) VALUES('restore-json','{ "cookie" : { "sameSite" : "lax" }, "id" : 9007199254740997 }',NOW()+INTERVAL '1 hour')`);
  const c=await source.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');archive=await createBackupFile(c,{password,scope:'full',includeRecoveryKey:true,env:{ENCRYPTION_KEY:recoveryKey}});await c.query('COMMIT');}finally{c.release();}
  verified=await inspectBackup(archive.file,password);const result=await restoreToEmptyDatabase(target,verified);assert.ok(result.offline);assert.ok(result.tables>80);
  const recovered=(await target.query('SELECT id,access_token FROM users')).rows[0];assert.equal(recovered.id,'9007199254740997');assert.equal(recovered.access_token,encryptedToken);
  const [restoredIv,tag,data]=recovered.access_token.split('.').map(v=>Buffer.from(v,'base64url')),decipher=createDecipheriv('aes-256-gcm',createHash('sha256').update(verified.manifest.recovery.ENCRYPTION_KEY).digest(),restoredIv);decipher.setAuthTag(tag);assert.equal(Buffer.concat([decipher.update(data),decipher.final()]).toString(),'disposable-no-real-token');
  assert.equal((await target.query('SELECT name FROM projects')).rows[0].name,'عينة الاسترجاع');
  assert.equal((await target.query('SELECT points FROM diskoko_game_scores')).rows[0].points,7);
  assert.equal((await target.query("SELECT sess->>'id' AS id FROM session")).rows[0].id,'9007199254740997');
  assert.equal((await target.query("INSERT INTO users(username) VALUES('next') RETURNING id")).rows[0].id,'9007199254740998');
  assert.equal((await target.query("INSERT INTO projects(user_id,name) VALUES(9007199254740997,'after deleted IDs') RETURNING id")).rows[0].id,'5001');
  await assert.rejects(target.query("INSERT INTO projects(user_id,name) VALUES(42,'invalid')"),e=>e.code==='23503');
  await assert.rejects(restoreToEmptyDatabase(target,verified),/not empty/);
});
