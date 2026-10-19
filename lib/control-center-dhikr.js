import {randomInt} from 'node:crypto';
import {PermissionFlagsBits as F} from 'discord.js';
import {dhikrLibrary,dhikrCategories} from './control-center-dhikr-content.js';
export {dhikrLibrary,dhikrCategories};
export const dhikrTexts=Object.fromEntries(Object.entries(dhikrLibrary).map(([key,entries])=>[key,entries[0].text]));
export const dhikrZones={'Asia/Riyadh':'الرياض','Asia/Dubai':'دبي','Africa/Cairo':'القاهرة','Europe/Istanbul':'إسطنبول','Africa/Casablanca':'الدار البيضاء',UTC:'UTC'};
export const dhikrIntervals={'1':'كل دقيقة','5':'كل 5 دقائق','10':'كل 10 دقائق','30':'كل نصف ساعة','60':'كل ساعة','random3-8':'عشوائي: 3–8 دقائق','random5-15':'عشوائي: 5–15 دقيقة','random10-30':'عشوائي: 10–30 دقيقة','daily':'صباحًا 07:00 ومساءً 19:00'};
export function dhikrConfig(data){
 const channel=String(data.channel || '').replace(/[<#>]/g,'');if(!/^\d{17,20}$/.test(channel))throw Error('اختر قناة صحيحة للأذكار.');
 const names=Object.fromEntries(Object.entries(dhikrCategories).map(([k,v])=>[v,k]));
 const types=[...new Set((Array.isArray(data.types)?data.types:String(data.types || '').split(/[,،]+/).flatMap(v=>Object.hasOwn(names,v.trim())?[v.trim()]:v.trim().split(/\s+/))).filter(Boolean).map(t=>names[t] || t))];
 if(!types.length || types.some(t=>!Object.hasOwn(dhikrLibrary,t)))throw Error('اختر أنواع الأذكار من الأنواع المعروضة.');
 const interval=String(data.interval);if(!Object.hasOwn(dhikrIntervals,interval))throw Error('اختر فترة ثابتة أو عشوائية من الفترات المعروضة.');
 const timezone=data.timezone || 'Asia/Riyadh';if(!Object.hasOwn(dhikrZones,timezone))throw Error('اختر منطقة زمنية من القائمة.');
 if(interval==='daily' && (!types.includes('morning') || !types.includes('evening')))throw Error('الجدول الصباحي والمسائي يحتاج نوعي أذكار الصباح والمساء.');
 const mention=String(data.mention || '').replace(/[<@&>]/g,'');if(mention && !/^\d{17,20}$/.test(mention))throw Error('المنشن اختياري؛ أدخل معرّف رتبة فقط.');return {channel,types,interval,mention,timezone};
}
export function dhikrDelay(config,now=Date.now()){
 if(config.interval==='daily'){
  const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:config.timezone || 'Asia/Riyadh',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  let at=Math.floor(now/60000)*60000+60000;
  for(let i=0;i<48*60;i++,at+=60000)if(['07:00','19:00'].includes(formatter.format(at)))return at-now;
  throw Error('تعذر تحديد موعد الأذكار القادم.');
 }
 const m=config.interval.match(/^random(\d+)-(\d+)$/);return (m?randomInt(Number(m[1]),Number(m[2])+1):Number(config.interval))*60000;
}
export function chooseDhikr(config,lastId,at=Date.now(),pick=randomInt){
 let kinds=config.types;
 if(config.interval==='daily'){
  const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:config.timezone || 'Asia/Riyadh',hour:'2-digit',hourCycle:'h23'}).format(at));
  const kind=hour>=12?'evening':'morning';return {id:kind+'-pack',text:dhikrLibrary[kind].map(formatDhikr).join('\n\n'),reference:'حصن المسلم · '+dhikrCategories[kind],repetitions:1};
 }
 const entries=kinds.flatMap(kind=>dhikrLibrary[kind] || []),previous=entries.find(e=>e.id===lastId);
 const alternatives=entries.filter(e=>e.id!==lastId && (!previous || e.text!==previous.text));
 const available=alternatives.length?alternatives:entries;if(!available.length)throw Error('لا يوجد محتوى للأنواع المختارة.');return available[pick(available.length)];
}
export function formatDhikr(entry){return entry.text+'\n\nالمصدر: '+entry.reference+(entry.repetitions>1?'\nعدد التكرار للقارئ: '+entry.repetitions:'');}
export async function checkDhikr(guild,actor,config){
 const channel=await guild.channels.fetch(config.channel),bot=await guild.members.fetchMe({force:true});
 if(![0,5].includes(channel?.type) || channel.guildId!==guild.id || !channel.permissionsFor(actor)?.has(F.ViewChannel|F.SendMessages) || !channel.permissionsFor(bot)?.has(F.ViewChannel|F.SendMessages))throw Error('اختر قناة نصية أو إعلانات، وراجع صلاحية عرض القناة والإرسال فيها للعضو والبوت.');
 if(config.mention){const role=await guild.roles.fetch(config.mention);if(!role || role.id===guild.id || (!role.mentionable && !channel.permissionsFor(bot)?.has(F.MentionEveryone)))throw Error('رتبة التنبيه غير متاحة للمنشن.');}
 return channel;
}
