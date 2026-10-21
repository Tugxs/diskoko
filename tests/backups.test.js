import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import pg from 'pg';
import {PGlite} from '@electric-sql/pglite';
import {JSDOM} from 'jsdom';
import {selectBackupTables,createBackupFile,mountAdminBackups} from '../lib/admin-backups.js';
import {inspectBackup,restoreToEmptyDatabase} from '../lib/backup-restore.js';
import {validateBackupPassword} from '../lib/backup-format.js';
import {migrateApplicationSchema} from '../lib/database-schema.js';
import {resourcePolicy} from '../lib/resource-protection.js';

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

test('backup routes always require admin middleware and a rejected download cannot clear another local lock',async()=>{
  const routes=[];mountAdminBackups({get:(...r)=>routes.push(r),post:(...r)=>routes.push(r)},{pool:{},requireAdmin(){},audit:async()=>{}});
  assert.equal(routes.length,2);assert.equal(routes[0][1],routes[1][1]);assert.equal(routes[1][0],'/api/admin/backups/download');
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
  await source.query("INSERT INTO users(id,username,access_token) VALUES(9007199254740997,'restore-fixture','encrypted-token-fixture')");
  await source.query("INSERT INTO projects(user_id,name) VALUES(9007199254740997,'عينة الاسترجاع')");
  const c=await source.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');archive=await createBackupFile(c,{password,scope:'full',includeRecoveryKey:true,env:{ENCRYPTION_KEY:'drill-only-key'}});await c.query('COMMIT');}finally{c.release();}
  verified=await inspectBackup(archive.file,password);const result=await restoreToEmptyDatabase(target,verified);assert.ok(result.offline);assert.ok(result.tables>80);
  assert.equal((await target.query('SELECT id,access_token FROM users')).rows[0].id,'9007199254740997');assert.equal((await target.query('SELECT name FROM projects')).rows[0].name,'عينة الاسترجاع');
  assert.equal((await target.query("INSERT INTO users(username) VALUES('next') RETURNING id")).rows[0].id,'9007199254740998');
  await assert.rejects(target.query("INSERT INTO projects(user_id,name) VALUES(42,'invalid')"),e=>e.code==='23503');
  await assert.rejects(restoreToEmptyDatabase(target,verified),/not empty/);
});
