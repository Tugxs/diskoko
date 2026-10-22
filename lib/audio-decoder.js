import {spawn} from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

// Keep ownership of the decoder process instead of hiding it inside a stream
// transformer. Stopping/replacing a session must also stop its native CPU/RAM.
export function createAudioDecoder(source,{spawnProcess=spawn,binary=ffmpeg}={}){
 const child=spawnProcess(binary,['-hide_banner','-analyzeduration','0','-loglevel','error','-i','pipe:0','-f','s16le','-ar','48000','-ac','2','pipe:1'],{stdio:['pipe','pipe','pipe'],windowsHide:true});
 let stopping=false;
 const done=new Promise(resolve=>child.once('close',resolve));
 const stop=()=>{if(stopping)return;stopping=true;source.unpipe(child.stdin);source.destroy();child.stdin.destroy();child.stdout.destroy();if(child.exitCode===null)child.kill('SIGKILL');};
 const fail=()=>{if(!stopping)child.stdout.destroy(Error('تعذر تحويل مصدر الصوت. جرّب مقطعًا آخر.'));stop();};
 child.on('error',fail);child.stdin.on('error',fail);child.stderr.on('data',()=>{});source.on('error',fail);
 child.once('close',code=>{if(code!==0 && !stopping)fail();});
 child.stdout.once('close',()=>{if(!stopping)stop();});
 source.pipe(child.stdin);
 return {stream:child.stdout,stop,done};
}
