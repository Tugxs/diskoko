import {randomUUID} from 'node:crypto';
import {managedLoop, serviceLoopStatus, safeOperationError, queueConsumer} from './lib/service-lifecycle.js';
import {createDatabasePool} from './lib/database.js';
import {externalMigrations,migrateApplicationSchema,verifyRuntimeDatabase} from './lib/database-schema.js';
import { getDiscordBotStatus, startDiscordBot, stopDiscordBot } from './discord-bot.js';
import { restoreAiBots, stopAllAiBots, syncAiBots } from './lib/ai-bot-connections.js';
import { claimDiscordJob, executeDiscordJob, recoverDiscordJobQueue } from './lib/discord-job-queue.js';
import { customerRoleConfig, syncCustomerRoles } from './lib/customer-roles.js';

const required = ['DATABASE_URL', 'ENCRYPTION_KEY', 'DISCORD_BOT_TOKEN'];
const missing = required.filter(name => !process.env[name]);
if (missing.length) throw new Error(`Missing bot worker environment variables: ${missing.join(', ')}`);

const pool=createDatabasePool('worker');
let stopping = false;
const runtimeId = randomUUID();
const loops = [];
let customerRoleCursor = 0;
let consumer;

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
  } catch (error) { throw error; }
}

async function sweepCustomerRoles() {
  if (stopping || !customerRoleConfig()) return;
  try {
    const { rows } = await pool.query('SELECT id FROM users WHERE discord_id IS NOT NULL AND id>$1 ORDER BY id LIMIT 30', [customerRoleCursor]);
    if (!rows.length) { customerRoleCursor = 0; return; }
    customerRoleCursor = rows.at(-1).id;
    for (const row of rows) await pool.query(`INSERT INTO customer_role_sync(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING`, [row.id]);
  } catch (error) { throw error; }
}

async function heartbeat() {
  await pool.query("INSERT INTO bot_runtime_state(id,status,seen_at) VALUES('original',$1,NOW()) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,seen_at=NOW()", [{...getDiscordBotStatus(),runtimeId,draining:stopping,loops:serviceLoopStatus(),activeJobs:consumer?.size||0,rssBytes:process.memoryUsage().rss,release:process.env.RENDER_GIT_COMMIT||null}]);
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => {console.error('Worker drain deadline exceeded');process.exit(1);}, 85_000).unref();
  try {
    // Stop polls first. Await a claim already in progress before snapshotting active jobs.
    await Promise.all(loops.map(stop => stop()));
    await pool.query("UPDATE bot_runtime_state SET status=jsonb_set(status,'{draining}','true'::jsonb) WHERE id='original' AND status->>'runtimeId'=$1",[runtimeId]);
    await Promise.allSettled([...activeJobs]);
    await Promise.all([stopDiscordBot(), stopAllAiBots()]);
    // The old generation must never delete the replacement worker's heartbeat.
    await pool.query("DELETE FROM bot_runtime_state WHERE id='original' AND status->>'runtimeId'=$1",[runtimeId]);
    await pool.end();clearTimeout(timeout);process.exit(0);
  } catch (error) { console.error('Bot worker shutdown failed', safeOperationError(error));process.exit(1); }
}
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());

if(externalMigrations())await verifyRuntimeDatabase(pool);else await migrateApplicationSchema(pool);
await pool.query("UPDATE customer_role_sync SET retry_at=NOW(),attempts=0,last_error=NULL WHERE last_error LIKE 'Expected one assignable Discord role%'");
await recoverDiscordJobQueue(pool);
if(!stopping)await startDiscordBot({ pool });
if(!stopping)await restoreAiBots(pool);
if(!stopping){
  await heartbeat();
  loops.push(managedLoop('heartbeat',heartbeat,{intervalMs:10000}));
  loops.push(managedLoop('connected-bots',()=>syncAiBots(pool),{intervalMs:10000}));
  loops.push(managedLoop('queue-recovery',()=>recoverDiscordJobQueue(pool),{intervalMs:60000}));
  consumer=queueConsumer({claim:()=>claimDiscordJob(pool),execute:job=>executeDiscordJob(pool,job)});loops.push(()=>consumer.stop());
  loops.push(managedLoop('customer-roles',pumpCustomerRoles,{intervalMs:1500}));
  loops.push(managedLoop('customer-role-sweep',sweepCustomerRoles,{intervalMs:60000,immediate:true}));
  console.info('Diskoko bot worker started',{runtimeId,release:process.env.RENDER_GIT_COMMIT||null});
}
