import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {PGlite} from '@electric-sql/pglite';
import {migrateApplicationSchema,verifyRuntimeDatabase,DATABASE_SCHEMA_VERSION,externalMigrations} from '../lib/database-schema.js';
import {provisionRuntimeRole} from '../lib/database-runtime-role.js';
import {createDatabasePool} from '../lib/database.js';

test('complete schema is initialized atomically and can be migrated again without losing customer data',async()=>{
  const db=new PGlite();try{
    await db.exec('CREATE FUNCTION pg_advisory_xact_lock(integer) RETURNS void AS $$ SELECT $$ LANGUAGE SQL');
    const query=(sql,params)=>!params && sql.includes(';')?db.exec(sql):db.query(sql,params);
    const pool={connect:async()=>({query,release(){}})};
    await migrateApplicationSchema(pool);
    await db.query("INSERT INTO users(username) VALUES('kept')");await migrateApplicationSchema(pool);
    assert.equal((await db.query('SELECT version FROM diskoko_schema_state')).rows[0].version,DATABASE_SCHEMA_VERSION);
    assert.equal((await db.query('SELECT username FROM users')).rows[0].username,'kept');
    assert.ok((await db.query("SELECT to_regclass('session') AS t,to_regclass('customer_role_sync') AS r")).rows[0].t);
  }finally{await db.close();}
});
test('schema update rolls back on any failed migration and never stamps a partial version',async()=>{
  const statements=[];let released=false;
  await assert.rejects(migrateApplicationSchema({connect:async()=>({query:async sql=>{statements.push(sql);if(sql.includes('CREATE TABLE IF NOT EXISTS users'))throw Error('DDL failed');return {rows:[]};},release(){released=true;}})}),/DDL failed/);
  assert.ok(statements.includes('ROLLBACK'));assert.ok(!statements.includes('COMMIT'));assert.ok(released);
  assert.equal(externalMigrations({DB_SCHEMA_MODE:'external'}),true);assert.throws(()=>externalMigrations({DB_SCHEMA_MODE:'unknown'}));
});
test('runtime startup refuses stale schema and elevated roles',async()=>{
  const safe={version:DATABASE_SCHEMA_VERSION,rolsuper:false,rolcreaterole:false,rolcreatedb:false,rolbypassrls:false,can_create_schema_objects:false};
  await verifyRuntimeDatabase({query:async()=>({rows:[safe]})});
  for(const flag of ['rolsuper','rolcreaterole','rolcreatedb','rolbypassrls','can_create_schema_objects','role_membership','owns_schema_objects','assumed_role'])await assert.rejects(verifyRuntimeDatabase({query:async()=>({rows:[{...safe,[flag]:true}]})}),/excessive privileges/);
  await assert.rejects(verifyRuntimeDatabase({query:async()=>({rows:[{...safe,version:'old'}]})}),/schema is not ready/);
});
test('operator migration accepts only an explicit valid schema owner and rolls back an invalid identity',async()=>{
  const statements=[];
  await assert.rejects(migrateApplicationSchema({connect:async()=>({query:async sql=>{statements.push(sql);return {rows:[]};},release(){}})},{schemaOwner:'owner; SELECT 1'}),/Invalid schema owner/);
  assert.ok(statements.includes('ROLLBACK'));assert.ok(!statements.includes('COMMIT'));
});
test('real PostgreSQL runtime can use customer data, sessions and notifications but cannot change schema or roles',{timeout:30000},async t=>{
  if(!process.env.RESOURCE_TEST_DATABASE_URL){t.skip('Disposable PostgreSQL required; mandatory in CI');return;}
  const suffix=randomUUID().replaceAll('-','').slice(0,20),database='security_'+suffix,role='runtime_'+suffix;
  const admin=new pg.Pool({connectionString:process.env.RESOURCE_TEST_DATABASE_URL});let owner,runtime;
  t.after(async()=>{if(runtime)await runtime.end();if(owner)await owner.end();await admin.query('DROP DATABASE IF EXISTS "'+database+'" WITH (FORCE)');await admin.query('DROP ROLE IF EXISTS "'+role+'"');await admin.end();});
  await admin.query('CREATE DATABASE "'+database+'"');const url=new URL(process.env.RESOURCE_TEST_DATABASE_URL);url.pathname='/'+database;
  owner=createDatabasePool('web',{DATABASE_URL:url.toString()});await migrateApplicationSchema(owner);
  const client=await owner.connect(),password=randomUUID().replaceAll('-','');try{await provisionRuntimeRole(client,{role,password});}finally{client.release();}
  url.username=role;url.password=password;runtime=createDatabasePool('web',{DATABASE_URL:url.toString()});
  await verifyRuntimeDatabase(runtime);
  const created=(await runtime.query("INSERT INTO users(username) VALUES('runtime') RETURNING id")).rows[0];assert.ok(created.id);
  await runtime.query("INSERT INTO session(sid,sess,expire) VALUES('test','{}',NOW()+INTERVAL '1 hour')");
  await runtime.query("UPDATE users SET display_name='changed' WHERE id=$1",[created.id]);
  assert.equal((await runtime.query('SELECT display_name FROM users WHERE id=$1',[created.id])).rows[0].display_name,'changed');
  await runtime.query('DELETE FROM session');
  for(const sql of ['CREATE TABLE public.forbidden(id INT)','ALTER TABLE users ADD COLUMN forbidden TEXT','TRUNCATE users','CREATE ROLE forbidden_runtime_role','CREATE DATABASE forbidden_runtime_db','SET ROLE '+decodeURIComponent(new URL(process.env.RESOURCE_TEST_DATABASE_URL).username)])await assert.rejects(runtime.query(sql),e=>e.code==='42501');
  await assert.rejects(provisionRuntimeRole({},{role:'bad-name',password}),/Invalid runtime role/);
});
