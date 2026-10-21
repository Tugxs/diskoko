import {managedLoop} from './service-lifecycle.js';
import {enforceTeamWrite} from './dashboard-team.js';
import crypto from 'node:crypto';
import {projectDiscord} from './code-project-discord.js';
import {PermissionFlagsBits} from 'discord.js';
import {projectLedger} from './code-project-ledger.js';
import {parseCodeProject} from './code-project.js';
import {createProjectApi} from './code-project-api.js';
import {runCode,normalizeCodeOutput} from './code-command-sandbox.js';

export async function runProjectJob(bot,pool,job,transport) {
  const db=await pool.connect(),ledger=projectLedger(pool);let logs=[];
  try {
    await db.query('BEGIN');
    const command=(await db.query('SELECT * FROM code_commands WHERE id=$1 FOR SHARE',[job.command_id])).rows[0];
    if(!command?.enabled || command.active_revision!==job.revision || command.bot_user_id!==bot.user.id)throw new Error('The project is disabled, changed or belongs to another bot.');
    const lock=(await db.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked',['code-run:'+command.id])).rows[0];
    if(!lock?.locked)throw Object.assign(new Error('Project is busy.'),{code:'CODE_BUSY'});
    const guild=await bot.guilds.fetch(command.guild_id),actor=await guild.members.fetch(job.user_id),target=await guild.channels.fetch(job.channel_id);
    if(!target || target.guildId!==command.guild_id || !target.isTextBased() || typeof target.send!=='function')throw new Error('Scheduled channel is unavailable.');
    if(!target.permissionsFor(actor)?.has(PermissionFlagsBits.ViewChannel | (target.isThread?.()?PermissionFlagsBits.SendMessagesInThreads:PermissionFlagsBits.SendMessages)))throw new Error('Scheduled actor can no longer access or send to this channel.');
    if(!actor.permissions.has(PermissionFlagsBits.ManageGuild))throw new Error('Scheduled actor no longer has Manage Server permission.');
    await enforceTeamWrite({originalUrl:`/api/workspace/${command.guild_id}/commands`,params:{guildId:command.guild_id},body:{},query:{},user:{id:command.owner_id,discord_id:actor.id}},db);
    const source=(await db.query('SELECT source FROM code_command_versions WHERE command_id=$1 AND revision=$2',[command.id,job.revision])).rows[0]?.source;
    const project=parseCodeProject(source);if(!project?.permissions.includes('schedule'))throw new Error('Scheduling permission is not granted.');
    const interaction={id:job.id,user:actor.user,guild,memberPermissions:actor.permissions};
    const sdk=createProjectApi({project,client:db,pool,command,interaction});
    const saved=(await db.query('SELECT state FROM code_command_state WHERE command_id=$1 AND discord_user_id=$2',[command.id,job.user_id])).rows[0]?.state || {};
    const output=normalizeCodeOutput(await runCode(source,{user:{id:actor.id,name:actor.user.username},guild:{id:guild.id,name:guild.name},event:job.event,state:saved,preview:false},command.owner_id+':'+command.guild_id+':'+command.bot_user_id,{bridge:sdk.call,onLogs:value=>logs=value}));
    if(output.modal || output.message.controls.length)throw new Error('Scheduled results support messages and embeds; interactive controls require a user invocation.');
    const key=job.id+':result';
    const claim=(await ledger.query("INSERT INTO code_project_effects(command_id,event_key,method,status) VALUES($1,$2,'schedule.output','started') ON CONFLICT DO NOTHING RETURNING event_key",[command.id,key])).rows;
    if(!claim.length)throw new Error('Scheduled output was already attempted.');
    const message=await (transport || projectDiscord(bot)).post('/channels/'+target.id+'/messages',{signal:AbortSignal.timeout(5000),body:{content:output.message.content,embeds:output.message.embeds,allowed_mentions:{parse:[]},nonce:crypto.createHash('sha256').update(job.id).digest('hex').slice(0,24),enforce_nonce:true}});
    await ledger.query("UPDATE code_project_effects SET status='completed',result=$3 WHERE command_id=$1 AND event_key=$2",[command.id,key,JSON.stringify({id:message.id})]);
    await db.query('INSERT INTO code_command_state(command_id,discord_user_id,state) VALUES($1,$2,$3) ON CONFLICT(command_id,discord_user_id) DO UPDATE SET state=EXCLUDED.state,updated_at=NOW()',[command.id,job.user_id,JSON.stringify(output.state ?? saved)]);
    await db.query('INSERT INTO code_command_runs(command_id,revision,success,logs) VALUES($1,$2,TRUE,$3)',[command.id,job.revision,JSON.stringify(logs)]);
    await db.query("UPDATE code_project_jobs SET status='completed' WHERE id=$1",[job.id]);
    await db.query('COMMIT');
  }catch(error){
    await db.query('ROLLBACK').catch(()=>{});
    if(error.code==='CODE_BUSY'){await pool.query("UPDATE code_project_jobs SET status='pending',run_at=NOW()+INTERVAL '5 seconds' WHERE id=$1",[job.id]);return;}
    await pool.query("UPDATE code_project_jobs SET status='failed',error=$2 WHERE id=$1",[job.id,String(error.message).slice(0,400)]);
    await pool.query('INSERT INTO code_command_runs(command_id,revision,success,error,logs) VALUES($1,$2,FALSE,$3,$4)',[job.command_id,job.revision,String(error.message).slice(0,400),JSON.stringify(logs)]).catch(()=>{});
  }finally{db.release();}
}

export function startProjectScheduler(bot,pool,guildId=null) {
  bot.diskokoProjectStop?.();let busy=false;
  const stop=managedLoop('project-scheduler:'+bot.user.id+':'+(guildId||'all'),async()=>{
    if(busy || !bot.isReady())return;busy=true;
    try{
      await pool.query("UPDATE code_project_jobs j SET status='cancelled',error='Project changed or was disabled.' FROM code_commands c WHERE j.command_id=c.id AND c.bot_user_id=$1 AND ($2::text IS NULL OR c.guild_id=$2) AND j.status='pending' AND (NOT c.enabled OR c.active_revision<>j.revision)",[bot.user.id,guildId]);
      await pool.query("UPDATE code_project_jobs j SET status='failed',error='Worker stopped; verify prior effects before scheduling again.' FROM code_commands c WHERE j.command_id=c.id AND c.bot_user_id=$1 AND ($2::text IS NULL OR c.guild_id=$2) AND j.status='running' AND j.claimed_at<NOW()-INTERVAL '10 minutes'",[bot.user.id,guildId]);
      const job=(await pool.query("WITH due AS (SELECT j.id FROM code_project_jobs j JOIN code_commands c ON c.id=j.command_id WHERE j.status='pending' AND j.run_at<=NOW() AND c.bot_user_id=$1 AND ($2::text IS NULL OR c.guild_id=$2) AND c.enabled AND c.active_revision=j.revision ORDER BY j.run_at FOR UPDATE OF j SKIP LOCKED LIMIT 1) UPDATE code_project_jobs SET status='running',claimed_at=NOW() WHERE id IN(SELECT id FROM due) RETURNING *",[bot.user.id,guildId])).rows[0];
      if(job)await runProjectJob(bot,pool,job);
    }
    finally{busy=false;}
  },{intervalMs:5000});
  bot.diskokoProjectStop=stop;return stop;
}
