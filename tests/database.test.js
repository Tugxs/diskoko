import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import tls from 'node:tls';
import {once} from 'node:events';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import pg from 'pg';
import {databaseOptions,BoundedDatabasePool,createDatabasePool,databasePoolStats} from '../lib/database.js';

test('database transport verifies remote certificates and URL flags cannot weaken TLS',()=>{
  const env={DATABASE_URL:'postgres://example:fixture@db.example.invalid/app?sslmode=require',NODE_ENV:'production'};
  const options=databaseOptions('web',env),client=new pg.Client(options);
  assert.equal(client.connectionParameters.ssl.rejectUnauthorized,true);assert.equal(options.ssl.minVersion,'TLSv1.2');
  assert.equal(new URL(options.connectionString).search,'');assert.equal(options.max,8);
  assert.equal(databaseOptions('worker',env).max,5);assert.equal(databaseOptions('ledger',env).max,2);
  for(const flag of ['disable','no-verify','prefer','allow'])assert.throws(()=>databaseOptions('web',{...env,DATABASE_URL:env.DATABASE_URL.replace('require',flag)}));
  for(const suffix of ['&sslrootcert=untrusted','&options=-c%20statement_timeout=0','&ssl=false'])assert.throws(()=>databaseOptions('web',{...env,DATABASE_URL:env.DATABASE_URL+suffix}));
  assert.throws(()=>databaseOptions('web',{...env,DB_TLS_MODE:'local'}));
  assert.throws(()=>databaseOptions('web',{...env,DB_TLS_MODE:'pinned'}),/Pinned database/);
  assert.throws(()=>databaseOptions('web',{...env,DATABASE_URL:'not a url'}),/Invalid DATABASE_URL/);
});
test('plaintext is local-development only and invalid budgets fail at startup',()=>{
  const env={DATABASE_URL:'postgresql://u:p@localhost/test'};
  assert.equal(databaseOptions('web',env).ssl,false);
  assert.equal(databaseOptions('web',{...env,NODE_ENV:'production'}).ssl.rejectUnauthorized,true);
  assert.equal(databaseOptions('web',{...env,DB_TLS_MODE:'verify',DB_TLS_CA:'first\\nsecond'}).ssl.ca,'first\nsecond');
  assert.equal(databaseOptions('web',{...env,DATABASE_URL:'postgresql://u:p@remote.example/test'}).ssl.rejectUnauthorized,true);
  for(const [key,value] of [['DB_WEB_POOL_MAX','0'],['DB_WEB_POOL_MAX','17'],['DB_STATEMENT_TIMEOUT_MS','0'],['DB_LOCK_TIMEOUT_MS','NaN'],['DB_IDLE_TRANSACTION_TIMEOUT_MS','10']])assert.throws(()=>databaseOptions('web',{...env,[key]:value}));
  assert.throws(()=>databaseOptions('missing',env));
});

test('pool backlog is bounded for Promise, callback and pool.query callers even during stalled connection',async t=>{
  const sockets=new Set(),server=net.createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});server.listen(0,'127.0.0.1');await once(server,'listening');
  const pool=new BoundedDatabasePool({host:'127.0.0.1',port:server.address().port,user:'test',database:'test',max:1,connectionTimeoutMillis:150},{maxWaiting:1});
  t.after(async()=>{for(const socket of sockets)socket.destroy();await pool.end();server.close();});
  const first=pool.connect().catch(e=>e),second=pool.connect().catch(e=>e);
  assert.equal(pool.waitingCount,1);
  await assert.rejects(pool.connect(),e=>e.code==='DATABASE_BUSY' && e.status===503);
  await new Promise(resolve=>pool.connect(error=>{assert.equal(error.code,'DATABASE_BUSY');resolve();}));
  await assert.rejects(pool.query('SELECT 1'),e=>e.code==='DATABASE_BUSY');
  assert.equal(databasePoolStats(pool).waiting,1);await Promise.all([first,second]);
  assert.equal(pool.waitingCount,0);
});

test('verified TLS rejects untrusted certificates and incorrect names, accepts an explicitly trusted CA',async t=>{
  try{execFileSync('openssl',['version'],{stdio:'ignore'});}catch{if(process.env.CI)throw Error('OpenSSL is required for CI TLS verification');t.skip('OpenSSL unavailable locally; required in CI');return;}
  const dir=await mkdtemp(path.join(tmpdir(),'diskoko-tls-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(dir,'key.pem'),'-out',path.join(dir,'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'],{stdio:'ignore'});
  const cert=await readFile(path.join(dir,'cert.pem'),'utf8'),key=await readFile(path.join(dir,'key.pem'),'utf8');
  const sockets=new Set(),server=tls.createServer({cert,key},socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});server.on('tlsClientError',()=>{});server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{for(const s of sockets)s.destroy();server.close();});
  const connect=ssl=>new Promise((resolve,reject)=>{const s=tls.connect({host:'127.0.0.1',port:server.address().port,servername:'localhost',...ssl});s.once('secureConnect',()=>{const authorized=s.authorized;s.destroy();resolve(authorized);});s.once('error',reject);});
  const env={DATABASE_URL:'postgres://u:p@localhost/test',NODE_ENV:'production'};
  await assert.rejects(connect(databaseOptions('web',env).ssl));
  assert.equal(await connect(databaseOptions('web',{...env,DB_TLS_CA:cert}).ssl),true);
  await assert.rejects(connect({...databaseOptions('web',{...env,DB_TLS_CA:cert}).ssl,servername:'wrong.invalid'}),e=>e.code==='ERR_TLS_CERT_ALTNAME_INVALID');
  const pinned=databaseOptions('web',{DATABASE_URL:'postgres://u:p@dpg-fixture/test',DB_TLS_MODE:'pinned',DB_TLS_PIN_HOST:'dpg-fixture',DB_TLS_CA:cert});
  assert.equal(await connect({...pinned.ssl,servername:'dpg-fixture'}),true);
  await assert.rejects(connect({...pinned.ssl,servername:'dpg-other'}),e=>e.code==='DATABASE_TLS_IDENTITY');
  assert.ok(pinned.ssl.checkServerIdentity('dpg-fixture',{fingerprint256:'00'}));
});

test('real PostgreSQL applies server timeouts, recovers after cancellation and retains LISTEN notifications',{timeout:10000},async t=>{
  if(!process.env.RESOURCE_TEST_DATABASE_URL){t.skip('Requires disposable PostgreSQL; mandatory in CI');return;}
  const pool=createDatabasePool('web',{DATABASE_URL:process.env.RESOURCE_TEST_DATABASE_URL,DB_STATEMENT_TIMEOUT_MS:'1000'});t.after(()=>pool.end());
  const client=await pool.connect();
  assert.equal((await client.query('SHOW statement_timeout')).rows[0].statement_timeout,'1s');
  assert.equal((await client.query('SHOW lock_timeout')).rows[0].lock_timeout,'5s');
  assert.equal((await client.query('SHOW idle_in_transaction_session_timeout')).rows[0].idle_in_transaction_session_timeout,'2min');
  await assert.rejects(client.query('SELECT pg_sleep(2)'),e=>e.code==='57014');
  assert.equal((await client.query('SELECT 1 AS ok')).rows[0].ok,1);
  await client.query('LISTEN diskoko_database_test');
  const notification=once(client,'notification');await pool.query("SELECT pg_notify('diskoko_database_test','bounded')");
  assert.equal((await notification)[0].payload,'bounded');await client.query('UNLISTEN *');client.release();
});
