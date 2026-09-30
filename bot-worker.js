import pg from 'pg';
import { getDiscordBotStatus, startDiscordBot, stopDiscordBot } from './discord-bot.js';
import { migrateAiBotConnections, restoreAiBots, stopAllAiBots, syncAiBots } from './lib/ai-bot-connections.js';
import { migrateMovieClubs } from './lib/movie-club.js';
import { claimDiscordJob, executeDiscordJob, migrateDiscordJobQueue, recoverDiscordJobQueue } from './lib/discord-job-queue.js';
import { migrateGuildActivityLogs } from './lib/guild-activity-logs.js';
import { customerRoleConfig, syncCustomerRoles } from './lib/customer-roles.js';

const required = ['DATABASE_URL', 'ENCRYPTION_KEY', 'DISCORD_BOT_TOKEN'];
const missing = required.filter(name => !process.env[name]);
if (missing.length) throw new Error(`Missing bot worker environment variables: ${missing.join(', ')}`);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });
let stopping = false;
let running = false;
let interval;
let queueTimer;
let customerRoleTimer;
let customerRoleSweepTimer;
let customerRoleCursor = 0;
const activeJobs = new Set();

async function pumpQueue() {
  if (stopping) return;
  try {
    while (activeJobs.size < 3) {
      const job = await claimDiscordJob(pool);
      if (!job) break;
      const task = executeDiscordJob(pool, job).catch(error => console.error('Discord queue task failed', error)).finally(() => activeJobs.delete(task));
      activeJobs.add(task);
    }
  } catch (error) { console.error('Discord queue poll failed', error); }
  finally { if (!stopping) queueTimer = setTimeout(() => void pumpQueue(), activeJobs.size ? 200 : 800); }
}

async function pumpCustomerRoles() {
  if (stopping || !customerRoleConfig()) return;
  try {
    const { rows } = await pool.query(`SELECT user_id,revision,attempts FROM customer_role_sync WHERE retry_at<=NOW()
      ORDER BY retry_at LIMIT 1`);
    const job = rows[0];
    if (!job) return;
    try {
      const result = await syncCustomerRoles(pool, job.user_id);
      await pool.query('DELETE FROM customer_role_sync WHERE user_id=$1 AND revision=$2', [job.user_id, job.revision]);
      if (result.status === 'synced' && result.changed) console.info('Customer roles updated', { userId: job.user_id, changed: result.changed });
    } catch (error) {
      await pool.query(`UPDATE customer_role_sync SET attempts=attempts+1,retry_at=NOW()+LEAST(1800,POWER(2,LEAST(attempts,10))*30)*INTERVAL '1 second',last_error=$2
        WHERE user_id=$1 AND revision=$3`, [job.user_id, String(error.message).slice(0, 300), job.revision]);
      console.error('Customer role sync failed', { userId: job.user_id, error: error.message });
    }
  } catch (error) { console.error('Customer role queue failed', error.message); }
}

async function sweepCustomerRoles() {
  if (stopping || !customerRoleConfig()) return;
  try {
    const { rows } = await pool.query('SELECT id FROM users WHERE discord_id IS NOT NULL AND id>$1 ORDER BY id LIMIT 30', [customerRoleCursor]);
    if (!rows.length) { customerRoleCursor = 0; return; }
    customerRoleCursor = rows.at(-1).id;
    for (const row of rows) await pool.query(`INSERT INTO customer_role_sync(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING`, [row.id]);
  } catch (error) { console.error('Customer role sweep failed', error.message); }
}

async function heartbeat() {
  if (stopping || running) return;
  running = true;
  try {
    await syncAiBots(pool);
    await pool.query("INSERT INTO bot_runtime_state(id,status,seen_at) VALUES('original',$1,NOW()) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,seen_at=NOW()", [getDiscordBotStatus()]);
  } catch (error) { console.error('Bot worker heartbeat failed', error); }
  finally { running = false; }
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(interval);
  clearTimeout(queueTimer);
  clearInterval(customerRoleTimer);
  clearInterval(customerRoleSweepTimer);
  const timeout = setTimeout(() => process.exit(1), 25_000).unref();
  try {
    await Promise.allSettled([...activeJobs]);
    await Promise.all([stopDiscordBot(), stopAllAiBots()]);
    await pool.query("DELETE FROM bot_runtime_state WHERE id='original'");
    await pool.end();
    clearTimeout(timeout);
    process.exit(0);
  } catch (error) { console.error('Bot worker shutdown failed', error); process.exit(1); }
}

process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());

await migrateAiBotConnections(pool);
await migrateMovieClubs(pool);
await migrateDiscordJobQueue(pool);
await migrateGuildActivityLogs(pool);
await pool.query(`CREATE TABLE IF NOT EXISTS customer_role_sync (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, revision BIGINT NOT NULL DEFAULT 0);
  ALTER TABLE customer_role_sync ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0`);
await pool.query("UPDATE customer_role_sync SET retry_at=NOW(),attempts=0,last_error=NULL WHERE last_error LIKE 'Expected one assignable Discord role%'");
await recoverDiscordJobQueue(pool);
await startDiscordBot({ pool });
await restoreAiBots(pool);
await heartbeat();
interval = setInterval(() => void heartbeat(), 10_000);
setInterval(() => void recoverDiscordJobQueue(pool).catch(error => console.error('Discord queue recovery failed', error.message)), 60_000).unref();
void pumpQueue();
customerRoleTimer = setInterval(() => void pumpCustomerRoles(), 1_500);
customerRoleSweepTimer = setInterval(() => void sweepCustomerRoles(), 60_000);
void sweepCustomerRoles();
console.info('Diskoko bot worker started');
