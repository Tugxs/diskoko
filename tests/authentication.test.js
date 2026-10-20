import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import session from 'express-session';
import {PGlite} from '@electric-sql/pglite';
import {migrateAuthentication,mountAuthentication,isAdminIdentity,adminSessionFresh,requireSiteAdmin,csrfToken,csrfProtection,privateAuthResponses,safeReturnTo} from '../lib/authentication.js';

const discordId='100000000000000001';
async function setup(t,{verified=true,config={}}={}) {
  const db=new PGlite();
  const pool={query:async(sql,params)=>{const r=await db.query(sql,params);return {...r,rowCount:r.affectedRows ?? r.rows.length};}};
  await db.exec(`CREATE TABLE users(id BIGSERIAL PRIMARY KEY,discord_id TEXT UNIQUE,google_id TEXT UNIQUE,username TEXT NOT NULL,
    display_name TEXT,avatar TEXT,email TEXT,status TEXT NOT NULL DEFAULT 'active',access_token TEXT,refresh_token TEXT,token_expires_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),last_login_at TIMESTAMPTZ DEFAULT NOW());`);
  // PGlite exec handles multi-statement migrations like production pg.query.
  const original=pool.query;pool.query=async(sql,params)=>!params && sql.includes(';')?(await db.exec(sql),{rows:[],rowCount:0}):original(sql,params);
  await migrateAuthentication(pool);
  await migrateAuthentication(pool);
  let clock=Date.now(),writes=0,profile={id:discordId,sub:'google-subject',username:'member',name:'Member',email:'admin@example.test',verified,email_verified:verified};
  const calls=[];
  const app=express();app.use(['/api','/auth','/admin'],privateAuthResponses);app.use(express.json());
  app.use(session({secret:'test-only-session-secret',resave:false,saveUninitialized:false,name:'diskoko.sid',cookie:{httpOnly:true,sameSite:'lax'}}));
  app.get('/api/csrf-token',(req,res)=>res.json({token:csrfToken(req)}));
  app.use('/api',csrfProtection(new Set(['https://diskoko.test'])));
  const requireUser=async(req,res,next)=>{try{const user=(await pool.query('SELECT * FROM users WHERE id=$1',[req.session.userId || -1])).rows[0];if(!user)return res.status(401).json({error:'login'});if(user.status!=='active')return res.status(403).json({error:'suspended'});req.user=user;next();}catch(e){next(e);}};
  // This clock-controlled wrapper calls the production middleware without changing global Date.
  const guard=requireSiteAdmin(requireUser,config,()=>clock);
  app.get('/api/admin/test',guard,(_req,res)=>res.json({ok:true}));
  app.post('/api/admin/test',guard,(_req,res)=>{writes++;res.json({ok:true});});
  app.get('/api/customer',requireUser,(req,res)=>res.json({id:req.user.id}));
  // Test-only seed exposes no production route and permits exercising old session invalidation.
  app.get('/seed',(req,res)=>{req.session.marker='do-not-copy';res.json({token:csrfToken(req)});});
  app.get('/seed-legacy',async(req,res)=>{req.session.userId=(await pool.query('SELECT id FROM users LIMIT 1')).rows[0]?.id;res.json({ok:true});});
  mountAuthentication(app,{pool,config:{DISCORD_CLIENT_ID:'test',GOOGLE_CLIENT_ID:'test',...config},baseUrl:'https://diskoko.test',now:()=>clock,
    rateLimit:()=> (_req,_res,next)=>next(),encrypt:v=>v?'sealed:'+v:null,audit:async()=>{},requestCustomerRoleSync:async()=>{},sendWelcomeEmail:async()=>{},
    request:async url=>{calls.push(url);return {ok:true,json:async()=>url.includes('/token')?{access_token:'test-token',refresh_token:'test-refresh',expires_in:3600}:profile};}});
  app.use((error,_req,res,_next)=>res.status(500).json({error:error.message}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await db.close();});
  const base='http://127.0.0.1:'+server.address().port;
  function client(){let cookie;return {get cookie(){return cookie;},set cookie(value){cookie=value;},async request(path,options={}){const r=await fetch(base+path,{...options,redirect:'manual',headers:{...(cookie?{Cookie:cookie}:{}),...options.headers}});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r;}};}
  async function begin(c,provider='discord',returnTo='/account.html'){const r=await c.request('/auth/'+provider+'?returnTo='+encodeURIComponent(returnTo));assert.equal(r.status,302);return new URL(r.headers.get('location')).searchParams.get('state');}
  async function login(c,provider='discord'){const state=await begin(c,provider);return c.request('/auth/'+provider+'/callback?code=ok&state='+state);}
  return {client,begin,login,pool,calls,base,get writes(){return writes;},set profile(p){profile=p;},advance:ms=>clock+=ms};
}

test('admin identity rejects unverified, legacy, suspended and empty identities; stable Discord IDs remain explicit',()=>{
  const c={ADMIN_EMAILS:' ADMIN@example.test ',ADMIN_DISCORD_IDS:discordId};
  for(const u of [null,{}, {status:'active',email:'admin@example.test'}, {status:'active',email:'admin@example.test',email_verified:'true'}, {status:'suspended',discord_id:discordId,email_verified:true}])assert.equal(isAdminIdentity(u,c),false);
  assert.equal(isAdminIdentity({status:'active',email:'Admin@Example.test',email_verified:true},c),true);
  assert.equal(isAdminIdentity({status:'active',discord_id:discordId,email_verified:false},c),true);
  assert.equal(isAdminIdentity({status:'active',discord_id:null},{ADMIN_DISCORD_IDS:'null'}),false);
});

test('admin authentication binds account and provider subject and distinguishes write freshness',()=>{
  const now=Date.now(),user={id:1,discord_id:discordId};const s={authentication:{userId:'1',provider:'discord',subject:discordId,at:now-16*60_000}};
  assert.equal(adminSessionFresh(s,user,{now}),true);assert.equal(adminSessionFresh(s,user,{now,write:true}),false);
  assert.equal(adminSessionFresh(s,{...user,id:2},{now}),false);assert.equal(adminSessionFresh(s,{...user,discord_id:'other'},{now}),false);
  assert.equal(adminSessionFresh({authentication:{...s.authentication,at:now+1}},user,{now}),false);
  assert.equal(adminSessionFresh({},user,{now}),false);
  assert.equal(adminSessionFresh({authentication:{...s.authentication,at:String(now)}},user,{now}),false);
});

test('return paths reject cross-origin, encoded separators, controls and malformed values',()=>{
  for(const p of ['//evil.test','/\\evil.test','/%2f%2fevil.test','/%5cevil.test','/%0d%0ax','https://evil.test','/%zz',[],null])assert.equal(safeReturnTo(p),null,String(p));
  assert.equal(safeReturnTo('/studio?guild=123#commands'),'/studio?guild=123#commands');
});

test('Discord login rotates the real session, invalidates old cookie and old CSRF, and logout destroys access',async t=>{
  const s=await setup(t),c=s.client();const seed=await (await c.request('/seed')).json(),oldCookie=c.cookie;
  const state=await s.begin(c);const r=await c.request('/auth/discord/callback?code=ok&state='+state);
  assert.equal(r.status,302);assert.notEqual(c.cookie,oldCookie);
  assert.equal((await c.request('/api/customer')).status,200);
  const old=s.client();old.cookie=oldCookie;assert.equal((await old.request('/api/customer')).status,401);
  assert.equal((await c.request('/api/logout',{method:'POST',headers:{'x-csrf-token':seed.token}})).status,403);
  const token=(await (await c.request('/api/csrf-token')).json()).token;assert.notEqual(token,seed.token);
  assert.equal((await c.request('/api/logout',{method:'POST',headers:{'x-csrf-token':token,Origin:'https://evil.test'}})).status,403);
  const logout=await c.request('/api/logout',{method:'POST',headers:{'x-csrf-token':token}});assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Expires=Thu, 01 Jan 1970/);
  assert.equal((await c.request('/api/customer')).status,401);
});

test('Google email verification is authoritative and persisted; ordinary customers cannot reach admin routes',async t=>{
  const s=await setup(t,{verified:false,config:{ADMIN_EMAILS:'admin@example.test'}}),c=s.client();
  assert.equal((await s.login(c,'google')).status,302);assert.equal((await c.request('/api/admin/test')).status,403);assert.equal((await c.request('/api/customer')).status,200);
  assert.equal((await s.pool.query('SELECT email_verified FROM users')).rows[0].email_verified,false);
  s.profile={sub:'google-subject',email:'admin@example.test',email_verified:true};
  assert.equal((await s.login(c,'google')).status,302);assert.equal((await c.request('/api/admin/test')).status,200);
  const token=(await (await c.request('/api/csrf-token')).json()).token;
  assert.equal((await c.request('/api/admin/test',{method:'POST',headers:{'x-csrf-token':token}})).status,200);assert.equal(s.writes,1);
  await s.pool.query('UPDATE users SET email_verified=FALSE');assert.equal((await c.request('/api/admin/test')).status,403);
  await s.pool.query('UPDATE users SET email_verified=TRUE');
  await s.pool.query("UPDATE users SET status='suspended'");assert.equal((await c.request('/api/admin/test')).status,403);
});

test('OAuth state expires, cannot cross browsers/providers, and parallel callbacks claim one flow',async t=>{
  const s=await setup(t),c=s.client(),state=await s.begin(c),foreign=s.client();
  assert.equal((await foreign.request('/auth/discord/callback?code=ok&state='+state)).status,400);
  assert.equal((await c.request('/auth/google/callback?code=ok&state='+state)).status,400);
  assert.equal((await c.request('/auth/discord/callback?code=ok&state='+encodeURIComponent('é'.repeat(48)))).status,400);
  const cookie=c.cookie;
  const results=await Promise.all([fetch(s.base+'/auth/discord/callback?code=ok&state='+state,{redirect:'manual',headers:{Cookie:cookie}}),fetch(s.base+'/auth/discord/callback?code=ok&state='+state,{redirect:'manual',headers:{Cookie:cookie}})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[302,400]);assert.equal(s.calls.filter(u=>u.endsWith('/token')).length,1);
  const newer=await s.begin(c);s.advance(11*60_000);assert.equal((await c.request('/auth/discord/callback?code=ok&state='+newer)).status,400);
});

test('sensitive admin writes expire independently of reads; reauthentication does not replay the write',async t=>{
  const s=await setup(t,{config:{ADMIN_DISCORD_IDS:discordId}}),c=s.client();await s.login(c);
  assert.equal((await c.request('/api/admin/test',{method:'POST'})).status,403);assert.equal(s.writes,0);
  const token=(await (await c.request('/api/csrf-token')).json()).token;
  s.advance(16*60_000);
  const response=await c.request('/api/admin/test',{method:'POST',headers:{'x-csrf-token':token}});
  assert.equal(response.status,401);const data=await response.json();assert.equal(data.code,'ADMIN_REAUTH_REQUIRED');assert.equal(data.reauthUrl,'/auth/discord?returnTo=%2Fadmin');assert.equal(s.writes,0);
  assert.equal((await c.request('/api/admin/test')).status,200);
  assert.equal((await s.login(c)).status,302);assert.equal(s.writes,0);
  const fresh=(await (await c.request('/api/csrf-token')).json()).token;
  assert.equal((await c.request('/api/admin/test',{method:'POST',headers:{'x-csrf-token':fresh}})).status,200);assert.equal(s.writes,1);
  const legacy=s.client();await legacy.request('/seed-legacy');assert.equal((await legacy.request('/api/admin/test')).status,401);
  s.advance(5*60*60_000);assert.equal((await c.request('/api/admin/test')).status,401);
});

test('linking a first Discord identity requires recent proof of the existing Google account',async t=>{
  const s=await setup(t),c=s.client();await s.login(c,'google');s.advance(16*60_000);
  const r=await c.request('/auth/discord?returnTo=%2Faccount.html');assert.equal(r.status,302);
  assert.match(r.headers.get('location'),/^\/auth\/google\?returnTo=/);
  assert.equal((await s.pool.query('SELECT discord_id FROM users')).rows[0].discord_id,null);
  assert.equal((await s.login(c,'google')).status,302);assert.equal((await s.login(c,'discord')).status,302);
});

test('Discord linking preserves Google ownership and refuses another account or replacement identity',async t=>{
  const s=await setup(t),c=s.client();await s.login(c,'google');await s.login(c,'discord');
  let users=(await s.pool.query('SELECT id,discord_id,google_id,email_verified FROM users')).rows;
  assert.equal(users.length,1);assert.equal(users[0].discord_id,discordId);assert.equal(users[0].google_id,'google-subject');assert.equal(users[0].email_verified,true);
  s.profile={id:'100000000000000002',username:'other',verified:false,email:'other@example.test'};
  assert.equal((await s.login(c,'discord')).status,409);
  await s.pool.query("INSERT INTO users(discord_id,username) VALUES('100000000000000003','another')");
  s.profile={id:'100000000000000003',username:'another'};assert.equal((await s.login(c,'discord')).status,409);
  assert.equal((await c.request('/api/customer')).status,200);
});

test('auth responses are not cached and session cookies are HTTP-only and SameSite',async t=>{
  const s=await setup(t),c=s.client(),r=await c.request('/auth/discord');
  assert.equal(r.headers.get('cache-control'),'no-store, max-age=0');assert.match(r.headers.get('vary'),/Cookie/);
  assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match(r.headers.get('set-cookie'),/SameSite=Lax/);
  assert.equal((await c.request('/auth/discord/callback?code=ok&state=invalid')).status,400);assert.equal(s.calls.length,0);
});

test('legacy email-only Discord administrators can verify their address by logging in again',async t=>{
  const s=await setup(t,{config:{ADMIN_EMAILS:'admin@example.test'}}),c=s.client();
  await s.pool.query('INSERT INTO users(discord_id,username,email) VALUES($1,$2,$3)',[discordId,'legacy','admin@example.test']);
  await c.request('/seed-legacy');assert.equal((await c.request('/api/admin/test')).status,403);
  assert.equal((await s.login(c,'discord')).status,302);
  assert.equal((await s.pool.query('SELECT email_verified FROM users')).rows[0].email_verified,true);
  assert.equal((await c.request('/api/admin/test')).status,200);
});
