import { READY_MODULE_TYPES } from './ready-template-module-types.js';

const field=(key,label,type='text',required=true)=>({key,label,type,required});
const destination=field('channelId','قناة النشر','channel');
const entries=[
  ['giveaway',[field('prize','الجائزة'),field('durationMinutes','المدة بالدقائق','number'),field('winnerCount','عدد الفائزين','number'),destination],'lib/interactive-systems.js','giveaway participation and scheduled draw'],
  ['tickets',[field('title','العنوان'),field('description','الوصف'),destination,field('staffRoleId','فريق الدعم','role')],'lib/interactive-systems.js','ticket open, staff handling and closure'],
  ['poll',[field('question','السؤال'),field('options','خيارات التصويت','list'),destination],'lib/interactive-systems.js','vote and results'],
  ['welcome',[field('title','العنوان'),field('description','رسالة الترحيب'),destination],'lib/interactive-systems.js','member join'],
  ['event',[field('title','العنوان'),field('description','الوصف'),destination],'lib/interactive-systems.js','attendance when enabled'],
  ['rules',[field('title','العنوان'),field('singleText','القوانين'),destination],'lib/interactive-systems.js','static rules message'],
  ['scheduled_event',[field('title','عنوان الحدث'),field('startsAt','بداية الحدث','datetime')],'lib/interactive-systems.js','native scheduled event'],
  ['channel_control',[destination,field('mode','وضع القناة','select')],'lib/interactive-systems.js','reviewed channel permissions'],
  ['message',[field('content','نص الرسالة'),destination],'lib/local-ai.js','static announcement'],
];
const moduleEntries=Object.entries(READY_MODULE_TYPES).map(([id,meta])=>[id,[field('title','العنوان'),field('description','الوصف'),field('buttonLabel','نص الزر'),destination,...(id==='interests'?[field('roleId','الرتبة العادية','role')]:[]),...(meta.form?[field('reviewChannelId','قناة مراجعة خاصة','channel'),field('staffRoleId','رتبة الفريق','role'),field('subjectLabel','اسم خانة الموضوع','text',false),field('detailsLabel','اسم خانة التفاصيل','text',false),field('subjectPlaceholder','إرشاد الموضوع','text',false),field('detailsPlaceholder','إرشاد التفاصيل','text',false),field('subjectMaxLength','حد الموضوع','number',false),field('detailsMaxLength','حد التفاصيل','number',false)]:[]),...(id==='events'?[field('capacity','عدد المقاعد','number',false),field('startsAt','الموعد','datetime',false)]:[]),...(id==='faq'?[field('answer','الإجابة')]:[]),field('footer','تذييل اختياري','text',false),field('imagePlacement','مكان الصورة','select',false),field('links','أزرار الروابط','list',false)],'lib/standalone-modules-api.js',`existing module handler: ${id}`]);
export const draftContracts=Object.freeze([...entries,...moduleEntries].map(([id,fields,executor,handler])=>Object.freeze({
  id,version:1,support:'available_after_setup',draft:true,publish:true,fields,
  scope:['owner','guild','bot'],permissions:['verified by existing executor at review and apply'],
  preview:id==='message'?'message_review':moduleEntries.some(x=>x[0]===id)?'module_review':'interactive_review',
  executor,handler,edit:moduleEntries.some(x=>x[0]===id)?'owned module message edit':'requires per-executor verification',stop:'requires per-executor verification',
})));
export function draftContract(proposal){const source=proposal?.interactive || proposal?.message;if(!source)return null;const id=proposal.interactive?(source.kind==='module'?source.moduleKind:source.kind):'message';return draftContracts.find(item=>item.id===id)||null;}
export function canonicalDraft(proposal){
  const source=proposal?.interactive;
  if(source?.kind==='module' && entries.some(([id])=>id===source.moduleKind && id!=='message')) {
    const {moduleKind,...interactive}=source;
    return {...proposal,interactive:{...interactive,kind:moduleKind}};
  }
  return proposal;
}
const missing=value=>value===null || value===undefined || value==='' || (typeof value==='string' && /\[[^\]]+\]/.test(value)) || (Array.isArray(value) && (value.length<2 || value.some(missing)));
export function describeDraft(proposal){
  const contract=draftContract(proposal);if(!contract)return null;
  const source=proposal.interactive || proposal.message;
  const missingFields=contract.fields.filter(item=>item.required && missing(source[item.key])).map(item=>({key:item.key,label:item.label,type:item.type}));
  return {version:1,capability:contract.id,capabilityVersion:contract.version,state:missingFields.length?'needs_setup':'review_ready',missingFields,confirmationRequired:true,publication:'not_started'};
}
export function draftContractInstructions(){return 'Supported draft contracts (not permission to execute): '+draftContracts.map(item=>`${item.id}: required=${item.fields.filter(x=>x.required).map(x=>x.key).join(',')}; optional=${item.fields.filter(x=>!x.required).map(x=>x.key).join(',')}; preview=${item.preview}`).join('; ')+'. For any supported creation request, ALWAYS return an interactive/message draft even with missing fields. Missing text is an empty string; missing numeric values are null. Omit optional settings unless requested. Do not ask for channel/role IDs or invent prize, duration, winner count, poll options or schedules. The existing editor collects these. Return executeNow=true for REVIEW ONLY. Questions may return executeNow=false. Unsupported essential actions must be disclosed, never replaced with another function.';}

// Operational values require customer evidence, independent of model confidence.
export function groundDraftInputs(proposal,job){
  proposal=canonicalDraft(proposal);
  if(!proposal?.interactive)return proposal;
  const result={...proposal,interactive:{...proposal.interactive}};
  const source=result.interactive;
  if(source.kind!=='giveaway')return result;
  const human=[job.prompt,...(job.context || []).filter(x=>x.role==='user').map(x=>x.content)].join('\n');
  const previous=job.previous_proposal?.interactive?.kind==='giveaway'?job.previous_proposal.interactive:{};
  const plain=human.replace(/\[[^\]]+\]/g,'').toLocaleLowerCase();
  if(!previous.prize && (!source.prize || !plain.includes(String(source.prize).toLocaleLowerCase())))source.prize='';
  const durations=[...plain.matchAll(/(\d+)\s*(minutes?|mins?|دقيق\S*|hours?|ساع\S*|days?|يوم|أيام)/gi)].map(x=>Number(x[1])*(/hour|ساع/i.test(x[2])?60:/day|يوم|أيام/i.test(x[2])?1440:1));
  if(!durations.includes(Number(source.durationMinutes)))source.durationMinutes=previous.durationMinutes ?? null;
  const winners=[...plain.matchAll(/(\d+)\s*(winners?|فائز\S*|فايز\S*)/gi),...plain.matchAll(/(?:winners?|الفائزين|الفايزين)\s*[:：=]?\s*(\d+)/gi)].map(x=>Number(x[1]));
  if(!winners.includes(Number(source.winnerCount)))source.winnerCount=previous.winnerCount ?? null;
  if(/\[[^\]]+\]/.test(source.channel || ''))source.channel='';
  return result;
}
