import { Shoukaku } from 'shoukaku';
import { GuardedLavalinkPlayer } from './guarded-lavalink-player.js';
import {GuardedLavalinkRest} from './guarded-lavalink-rest.js';
import {loadedMusicTracks,loadYoutubeMix} from './music-autoplay.js';

import {createAudioManagerCache,readAudioWithRecovery} from './lavalink-lifecycle.js';
import {ManagedAudioConnector,disposeAudioManager} from './managed-audio-connector.js';
const managers=createAudioManagerCache({build:createManager,dispose:disposeAudioManager});

export function lavalinkConfigured(guildId = '') {
  const allowed = String(process.env.LAVALINK_TEST_GUILDS || '').split(',').map(value => value.trim()).filter(Boolean);
  return Boolean(process.env.LAVALINK_HOST && process.env.LAVALINK_PASSWORD && (!allowed.length || allowed.includes(String(guildId))));
}

export async function lavalinkFor(client, guildId = '') {
  if (!lavalinkConfigured(guildId)) throw Error('مشغّل الموسيقى الخارجي غير مهيأ لهذا السيرفر الآن. استخدم رابط ملف صوتي مباشر أو اطلب من إدارة ديسكوكو تفعيل Lavalink.');
  return managers.get(client);
}
function createManager(client){
 const host=process.env.LAVALINK_HOST.trim(),port=Number(process.env.LAVALINK_PORT || 443);
 if(!/^[a-zA-Z0-9.-]+$/.test(host)||!Number.isInteger(port)||port<1||port>65535)throw Error('إعداد خادم الموسيقى غير صالح.');
 const node={name:'diskoko-audio',url:host+':'+port,auth:process.env.LAVALINK_PASSWORD,secure:process.env.LAVALINK_SECURE!=='false'};
 const connector=new ManagedAudioConnector(client);
 const manager=new Shoukaku(connector,[node],{resume:false,reconnectTries:3,reconnectInterval:5,restTimeout:12,structures:{player:GuardedLavalinkPlayer,rest:GuardedLavalinkRest}});
 manager.on('error',(name,error)=>console.error('Lavalink node error',{name,errorName:error?.name,status:error?.status}));
 return {manager,start:()=>connector.start([node])};
}

export async function resolveLavalinkTrack(client, url, guildId = '') {
  if(!lavalinkConfigured(guildId))throw Error('خادم الموسيقى غير مهيأ لهذا السيرفر.');
  let result;
  try {result=await readAudioWithRecovery(managers,client,async manager=>{const node=manager.getIdealNode();if(!node)throw Object.assign(Error('Audio node disconnected'),{status:503});return node.rest.resolve(url);});}
  catch(error){console.error('Lavalink track lookup failed',{name:error?.name,status:error?.status,recoveryExhausted:true});throw Error('تعذر اتصال خادم الموسيقى بعد محاولة التعافي. قد يكون الخادم متوقفًا أو يعيد التشغيل؛ لم نغيّر صلاحيات الروم. حاول بعد قليل.');}
  const track = loadedMusicTracks(result)[0];
  if (!track?.encoded) throw Error('لم يجد خادم الموسيقى صوتًا متاحًا لهذا الرابط. افتحه في YouTube وتأكد أنه عام، ثم جرّب مقطعًا آخر.');
  const duration = Number(track.info?.length || 0) / 1000;
  if(!Number.isFinite(duration) || track.info?.isStream)throw Error('اختر أغنية محددة؛ البث المباشر غير مدعوم في هذه القائمة.');
  if (duration > 7200) throw Error('المقطع أطول من ساعتين. اختر مقطعًا أقصر.');
  return { kind: 'lavalink', url, encoded: track.encoded, title: String(track.info?.title || 'مقطع صوتي').slice(0, 100), author:String(track.info?.author || '').slice(0,100), duration, id: track.info?.identifier || '' };
}

export function stopLavalinkFor(client) {managers.stop(client);}

export async function resolveLavalinkRecommendation(client,previous,excluded,guildId){
 const manager=await lavalinkFor(client,guildId),node=manager.getIdealNode();
 if(!node)throw Error('خادم الموسيقى غير متصل الآن.');
 const track=await loadYoutubeMix(node,previous,excluded);
 if(!track)return null;
 return {kind:'lavalink',url:track.info.uri || '',encoded:track.encoded,title:String(track.info.title || 'مقطع مقترح').slice(0,100),author:String(track.info.author || '').slice(0,100),duration:Number(track.info.length)/1000,id:track.info.identifier};
}

