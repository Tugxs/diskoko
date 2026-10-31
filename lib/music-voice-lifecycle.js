// A gateway disconnect of this bot in this guild ends only its own music session.
export function watchMusicVoiceExit(client,{guildId,botId,channelId,onExit,onError=()=>{}}) {
  let active=true;
  const dispose=()=>{if(!active)return;active=false;client.off('voiceStateUpdate',listener);};
  const listener=(before,after)=>{
    if(!active || String(after.guild?.id || after.guildId)!==String(guildId) || String(after.id)!==String(botId))return;
    if(before.channelId!==channelId || after.channelId===channelId)return;
    dispose();
    try {Promise.resolve(onExit()).catch(onError);}catch(error){onError(error);}
  };
  client.on('voiceStateUpdate',listener);
  return dispose;
}
