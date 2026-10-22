// Close all accessible stages, including the upstream volume transform, so an
// abandoned FFmpeg pipe cannot remain blocked after its final Opus stream stops.
export function disposeAudioResource(resource){
 for(const stream of new Set([resource?.playStream,resource?.volume,resource?.encoder])){
  if(stream && !stream.destroyed)stream.destroy();
 }
}
