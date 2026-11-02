export function selectAutoplayTrack(result,excluded){
 const tracks=result?.data?.tracks || result?.tracks || (Array.isArray(result?.data)?result.data:[]);
 return tracks.find(track=>track?.encoded && track.info?.identifier && !excluded.has(track.info.identifier) && !track.info.isStream && Number.isFinite(Number(track.info.length)) && Number(track.info.length)>0 && Number(track.info.length)<=7200000 && (!track.info.sourceName || track.info.sourceName==='youtube')) || null;
}
export async function fillAutoplay(session,{active,resolve}){
 if(session.queue.length || !session.autoplay || !session.lastTrack || session.engine!=='lavalink')return;
 if(session.autoplayPending)return session.autoplayPending;
 session.autoplayPending=(async()=>{
  const next=await resolve(session.lastTrack,session.playedIds);
  if(next && active() && session.autoplay && !session.queue.length)session.queue.push({...next,requestedBy:'autoplay'});
 })();
 try{await session.autoplayPending;}finally{session.autoplayPending=null;}
}
