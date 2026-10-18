import {randomInt} from 'node:crypto';
import {PermissionFlagsBits as F} from 'discord.js';
export const dhikrTexts={tasbih:'سبحان الله وبحمده، سبحان الله العظيم.',tahmid:'الحمد لله رب العالمين.',takbir:'الله أكبر، الله أكبر، لا إله إلا الله.',istighfar:'أستغفر الله العظيم وأتوب إليه.',salat:'اللهم صلِّ وسلم على نبينا محمد.',hawqala:'لا حول ولا قوة إلا بالله.',ayat:'﴿فَاذْكُرُونِي أَذْكُرْكُمْ وَاشْكُرُوا لِي وَلَا تَكْفُرُونِ﴾ [البقرة: 152]',dua:'ربنا آتنا في الدنيا حسنة وفي الآخرة حسنة وقنا عذاب النار.'};
export function dhikrConfig(data){
 const channel=String(data.channel || '').replace(/[<#>]/g,'');if(!/^\d{17,20}$/.test(channel))throw Error('اختر قناة صحيحة للأذكار.');
 const types=[...new Set(String(data.types || '').split(/[,،\s]+/).filter(Boolean))];if(!types.length || types.some(t=>!Object.hasOwn(dhikrTexts,t)))throw Error('اختر أنواع الأذكار من الأنواع المعروضة.');
 const interval=String(data.interval);if(!['1','5','10','30','60','random3-8','random5-15','random10-30'].includes(interval))throw Error('اختر فترة ثابتة أو عشوائية من الفترات المعروضة.');
 const mention=String(data.mention || '').replace(/[<@&>]/g,'');if(mention && !/^\d{17,20}$/.test(mention))throw Error('المنشن اختياري؛ أدخل معرّف رتبة فقط.');return {channel,types,interval,mention};
}
export function dhikrDelay(config){const m=config.interval.match(/^random(\d+)-(\d+)$/);return (m?randomInt(Number(m[1]),Number(m[2])+1):Number(config.interval))*60000;}
export async function checkDhikr(guild,actor,config){
 const channel=await guild.channels.fetch(config.channel),bot=await guild.members.fetchMe({force:true});
 if(!channel?.isTextBased() || channel.guildId!==guild.id || !channel.permissionsFor(actor)?.has(F.ViewChannel|F.SendMessages) || !channel.permissionsFor(bot)?.has(F.ViewChannel|F.SendMessages))throw Error('راجع صلاحية عرض قناة الأذكار والإرسال فيها للعضو والبوت.');
 if(config.mention){const role=await guild.roles.fetch(config.mention);if(!role || role.id===guild.id || (!role.mentionable && !channel.permissionsFor(bot)?.has(F.MentionEveryone)))throw Error('رتبة التنبيه غير متاحة للمنشن.');}
 return channel;
}
