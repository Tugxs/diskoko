import {migrateCore} from './database-core-schema.js';
import {migrateAuthentication} from './authentication.js';
import {migrateResourceBudgets} from './resource-budget-store.js';
import {migrateWorkspace} from './workspace-api.js';
import {migrateLocalAi} from './local-ai.js';
import {migrateInteractiveSystems} from './interactive-systems.js';
import {migrateAiBotConnections} from './ai-bot-connections.js';
import {migrateMovieClubs} from './movie-club.js';
import {migrateDiscordJobQueue} from './discord-job-queue.js';
import {migrateReadyTemplates} from './ready-templates-api.js';
import {migrateStandaloneModules} from './standalone-modules-api.js';
import {migrateGuildActivityLogs} from './guild-activity-logs.js';
import {migrateAdminPanel} from './admin-panel-api.js';
import {grantRuntimeAccess} from './database-runtime-role.js';

export const DATABASE_SCHEMA_VERSION='2026-10-21.1';
export function externalMigrations(env=process.env){
  if(env.DB_SCHEMA_MODE && !['startup','external'].includes(env.DB_SCHEMA_MODE))throw Error('Invalid DB_SCHEMA_MODE');
  return env.DB_SCHEMA_MODE==='external';
}
export async function migrateWorkerSchema(pool){
  await migrateGuildActivityLogs(pool);await migrateAdminPanel(pool);
  // These pre-existing community tables were historically created by panel tools.
  // Recovery must recreate them without starting a Discord client or publishing panels.
  await pool.query(`CREATE TABLE IF NOT EXISTS community_panels (
    guild_id TEXT NOT NULL,panel_key TEXT NOT NULL,channel_id TEXT NOT NULL,message_id TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(guild_id,panel_key));
    CREATE TABLE IF NOT EXISTS customer_link_panels (
    guild_id TEXT PRIMARY KEY,channel_id TEXT NOT NULL,message_id TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS diskoko_game_panel (guild_id TEXT PRIMARY KEY,channel_id TEXT NOT NULL,message_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS diskoko_game_scores (guild_id TEXT NOT NULL,user_id TEXT NOT NULL,played_on DATE NOT NULL,points INT NOT NULL DEFAULT 0,PRIMARY KEY(guild_id,user_id,played_on))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS customer_role_sync (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT,revision BIGINT NOT NULL DEFAULT 0);
    ALTER TABLE customer_role_sync ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0`);
}
export async function migrateApplicationSchema(pool,{runtimeRole,schemaOwner}={}){
  // One connection/transaction: no concurrent web/worker DDL or partially stamped schema.
  const client=await pool.connect();
  try{
    await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='120s';SET LOCAL lock_timeout='10s'");
    if(schemaOwner){
      if(!/^[a-z][a-z0-9_]{2,47}$/.test(schemaOwner))throw Error('Invalid schema owner role');
      await client.query('SET LOCAL ROLE "'+schemaOwner+'"');
    }
    await client.query("SELECT pg_advisory_xact_lock(hashtext('diskoko:schema:v1'))");
    for(const migrate of [migrateCore,migrateAuthentication,migrateResourceBudgets,migrateWorkspace,migrateLocalAi,migrateInteractiveSystems,migrateAiBotConnections,migrateMovieClubs,migrateDiscordJobQueue,migrateReadyTemplates,migrateStandaloneModules,migrateWorkerSchema])await migrate(client);
    await client.query(`CREATE TABLE IF NOT EXISTS session (sid varchar PRIMARY KEY,sess json NOT NULL,expire timestamp(6) NOT NULL);
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON session(expire);
      CREATE TABLE IF NOT EXISTS diskoko_schema_state(id SMALLINT PRIMARY KEY CHECK(id=1),version TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await client.query('INSERT INTO diskoko_schema_state(id,version) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET version=EXCLUDED.version,updated_at=NOW()',[DATABASE_SCHEMA_VERSION]);
    if(runtimeRole)await grantRuntimeAccess(client,runtimeRole);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}
export async function verifyRuntimeDatabase(pool){
  const row=(await pool.query(`SELECT r.rolsuper,r.rolcreaterole,r.rolcreatedb,r.rolbypassrls,
    (SELECT version FROM diskoko_schema_state WHERE id=1) AS version,
    has_schema_privilege(current_user,'public','CREATE') AS can_create_schema_objects,
    EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS role_membership,
    EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relowner=r.oid) AS owns_schema_objects,
    current_user<>session_user AS assumed_role
    FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
  if(!row || row.version!==DATABASE_SCHEMA_VERSION)throw Error('Database schema is not ready; run the reviewed migration before deployment');
  if(row.rolsuper || row.rolcreaterole || row.rolcreatedb || row.rolbypassrls || row.can_create_schema_objects || row.role_membership || row.owns_schema_objects || row.assumed_role)throw Error('Runtime database role has excessive privileges');
}
