import {PermissionFlagsBits as F} from 'discord.js';
import {problem} from './workspace-domain.js';
const flags={ViewChannel:F.ViewChannel,SendMessages:F.SendMessages,ReadMessageHistory:F.ReadMessageHistory,EmbedLinks:F.EmbedLinks,AttachFiles:F.AttachFiles,ManageChannels:F.ManageChannels,ManageRoles:F.ManageRoles,Connect:F.Connect,Speak:F.Speak};
export function effectiveChannelPermissions(guildId,roles,channel,roleIds=[],memberId=null,owner=false){
 let bits=roles.filter(r=>r.id===guildId || roleIds.includes(r.id)).reduce((n,r)=>n|BigInt(r.permissions || '0'),0n);
 if(owner || (bits&F.Administrator)!==0n)return {administrator:true,permissions:Object.fromEntries(Object.keys(flags).map(k=>[k,true])),bits:bits.toString()};
 const overwrites=channel.permission_overwrites || [];const everyone=overwrites.find(o=>String(o.id)===guildId && Number(o.type)===0);
 const apply=o=>{if(o)bits=(bits&~BigInt(o.deny || '0'))|BigInt(o.allow || '0');};apply(everyone);
 let deny=0n,allow=0n;for(const o of overwrites)if(Number(o.type)===0 && roleIds.includes(String(o.id)) && String(o.id)!==guildId){deny|=BigInt(o.deny || '0');allow|=BigInt(o.allow || '0');}bits=(bits&~deny)|allow;
 if(memberId)apply(overwrites.find(o=>Number(o.type)===1 && String(o.id)===memberId));
 const visible=(bits&F.ViewChannel)!==0n;
 return {administrator:false,permissions:Object.fromEntries(Object.entries(flags).map(([name,flag])=>[name,name==='ViewChannel'?(bits&flag)!==0n:visible && (bits&flag)!==0n])),bits:bits.toString()};
}
export async function dashboardPermissionSnapshot(discord,guildId){
 const [roles,channels,me]=await Promise.all([discord(`/guilds/${guildId}/roles`),discord(`/guilds/${guildId}/channels`),discord('/users/@me')]);
 if(!roles.ok || !channels.ok || !me.ok)throw problem('تعذر فحص الصلاحيات. راجع اتصال بوت التنفيذ.',409);
 const member=await discord(`/guilds/${guildId}/members/${me.data.id}`);if(!member.ok)throw problem('تعذر قراءة رتب بوت التنفيذ.',409);
 return {roles:roles.data,channels:channels.data,bot:me.data.id,botRoles:member.data.roles || [],botPosition:Math.max(0,...roles.data.filter(r=>member.data.roles?.includes(r.id)).map(r=>r.position))};
}
export function readinessChecks(guildId,snapshot){
 const {roles,botRoles,channels}=snapshot;
 const guildBits=roles.filter(r=>r.id===guildId || botRoles.includes(r.id)).reduce((n,r)=>n|BigInt(r.permissions || '0'),0n),has=flag=>(guildBits&F.Administrator)!==0n || (guildBits&flag)!==0n;
 const voice=channels.filter(c=>c.type===2).some(c=>{const p=effectiveChannelPermissions(guildId,roles,c,botRoles).permissions;return p.ViewChannel&&p.Connect&&p.Speak;});
 const writable=channels.filter(c=>[0,5].includes(c.type)).some(c=>{const p=effectiveChannelPermissions(guildId,roles,c,botRoles).permissions;return p.ViewChannel && p.SendMessages && p.EmbedLinks;});
 return [{key:'builder',title:'القنوات والرتب',ready:has(F.ManageChannels)&&has(F.ManageRoles),missing:[!has(F.ManageChannels)&&'إدارة القنوات',!has(F.ManageRoles)&&'إدارة الرتب'].filter(Boolean),target:'builder'},
 {key:'panels',title:'نشر اللوحات والرسائل',ready:writable,missing:writable?[]:['قناة نصية تسمح بعرض القناة وإرسال الرسائل والروابط المضمنة'],target:'bots'},
 {key:'music',title:'الدخول إلى روم صوتي',ready:voice,missing:voice?[]:['روم صوتي يسمح بعرض القناة والاتصال والتحدث'],target:'bots'}];
}
