export function loadedMusicTracks(result){
 if(result?.loadType==='error' || result?.loadType==='empty')return [];
 if(result?.data?.encoded)return [result.data];
 if(Array.isArray(result?.data))return result.data;
 return result?.data?.tracks || result?.tracks || [];
}
export function youtubeMixUrl(id){
 return /^[a-zA-Z0-9_-]{11}$/.test(id || '')?`https://www.youtube.com/watch?v=${id}&list=RD${id}`:null;
}
export async function loadYoutubeMix(node,previous,excluded){
 const url=youtubeMixUrl(previous.id);
 if(!url)return null;
 const result=await node.rest.resolve(url);
 return result?.loadType==='playlist'?selectAutoplayTrack(result,excluded):null;
}
export function selectAutoplayTrack(result,excluded){
 const tracks=loadedMusicTracks(result);
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
