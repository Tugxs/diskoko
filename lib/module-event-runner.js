import { processOverdueRequests } from './workflow-history.js';
export async function processModuleReminders({pool,discordBotFetch}){
  const due=await pool.query("SELECT id,guild_id,channel_id,publishing_bot_id,config FROM ready_template_module_panels WHERE config->>'kind'='events' AND COALESCE((config->>'reminderMinutes')::int,0)>0 AND (config->>'startsAt')::timestamptz>NOW() AND (config->>'startsAt')::timestamptz<=NOW()+((config->>'reminderMinutes')::int * INTERVAL '1 minute') LIMIT 50");
  for(const panel of due.rows){
    const claim=await pool.query("INSERT INTO ready_template_module_event_notices(panel_id,status) VALUES($1,'sending') ON CONFLICT DO NOTHING RETURNING panel_id",[panel.id]);
    if(!claim.rowCount)continue;
    try{
      const response=await discordBotFetch(`/channels/${panel.channel_id}/messages`,{method:'POST',body:JSON.stringify({content:`⏰ ${panel.config.title}\n<t:${Math.floor(Date.parse(panel.config.startsAt)/1000)}:R>`,allowed_mentions:{parse:[]}})},panel);
      if(!response.ok || !response.data?.id)throw new Error('Reminder not confirmed');
      await pool.query("UPDATE ready_template_module_event_notices SET status='sent',message_id=$2 WHERE panel_id=$1 AND status='sending'",[panel.id,response.data.id]);
    }catch{await pool.query("UPDATE ready_template_module_event_notices SET status='uncertain' WHERE panel_id=$1 AND status='sending'",[panel.id]).catch(()=>{});}
  }
}
export function startModuleReminderRunner(options){let running=false;const tick=async()=>{if(running)return;running=true;try{await processModuleReminders(options);await processOverdueRequests(options);}catch(error){console.error('Module reminders failed:',error.message);}finally{running=false;}};const timer=setInterval(tick,60000);timer.unref();void tick();return ()=>clearInterval(timer);}
