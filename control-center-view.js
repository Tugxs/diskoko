import {controlSections,controlActions,controlCount,controlIcons} from './control-center-catalog.js';
import {controlForms,readActions} from './control-center-forms.js';
import {pendingCenterActions} from './control-center-capabilities.js';
const b=(label,action,row,style=2)=>({type:'button',label,action,row,style});
const foot=()=>[b('◀ العودة للرئيسية','home',4,1),b('🔎 بحث','search',4),b('🕌 أذكار','dhikr_open',4),b('مساعدة','support',4)];
export function centerCard(design,state,title,description,controls=[],fields=[]){
 if(design.supportUrl)controls=controls.map(c=>c.action==='support'?{type:'link',label:'الدعم',url:design.supportUrl,row:c.row}:c);
 return {state,message:{embeds:[{title,description,color:parseInt(design.color.slice(1),16),author:{name:design.title,...(design.logoUrl?{icon_url:design.logoUrl}:{})},...((design.imageUrl || design.logoUrl)?{thumbnail:design.imageUrl || design.logoUrl}:{}),...(design.bannerUrl?{image:design.bannerUrl}:{}),fields,footer:{text:'ديسكوكو · مركز التحكم بالسيرفر'}}],controls}};}
export function centerPage(design,state,sectionId,page=0){
 const section=controlSections.find(s=>s.id===sectionId);if(!section)throw Error('القسم غير متاح.');
 const custom=design.buttons || {},entries=(section.pages[page] || section.pages[0]).filter(a=>custom[a.id]?.hidden!==true).sort((a,b)=>(custom[a.id]?.order ?? 100)-(custom[b.id]?.order ?? 100));
 state.section=section.id;state.page=page;
 const controls=entries.map((a,i)=>({...b((custom[a.id]?.label || a.label)+(pendingCenterActions[a.id]?' · قريبًا':''),'op_'+a.id,Math.floor(i/4),Number(custom[a.id]?.style || design.buttonStyle)),...(custom[a.id]?.emoji?{emoji:custom[a.id].emoji}:{}),...(pendingCenterActions[a.id]?{disabled:true}:{})}));
 if(section.pages.length>1){if(page>0)controls.push(b('◀ السابق','prev',3,1));if(page<section.pages.length-1)controls.push(b('التالي ▶','next',3,1));}
 else if(entries.length)controls.push({type:'select',action:'copy',placeholder:'📋 انسخ أمر',row:3,options:entries.map(a=>({label:custom[a.id]?.label || a.label,value:a.id,description:a.description}))});
 controls.push(...foot());
 return centerCard(design,state,section.title,section.description+'\nاختر الزر لعرض التفاصيل وإدخال بيانات العملية.\nالصفحة '+(page+1)+' من '+section.pages.length,controls,entries.map(a=>({name:(custom[a.id]?.emoji || '')+' '+(custom[a.id]?.label || a.label),value:a.description+'\n`'+(design.prefix || '!')+a.id+'`',inline:true})));
}
export function centerHome(design,state,info){state.section='home';state.page=0;return centerCard(design,state,design.title,design.description+'\n\n**معلومات النظام**\nالحالة: متصل\nالأوامر المفعّلة: '+(controlCount-Object.keys(pendingCenterActions).length)+' · قيد التجهيز: '+Object.keys(pendingCenterActions).length+'\nالسيرفر: '+info.name+'\n\nالحماية · التحكم والإعدادات · السجلات والمتابعة · إدارة الأعضاء · الإحصائيات\n\nاختر القسم المطلوب من القائمة بالأسفل.',[{type:'select',action:'section',placeholder:'اختر قسمًا',row:0,options:controlSections.map(s=>({label:controlIcons[s.id]+' '+s.title,value:s.id,description:s.description}))},...foot()]);}
// Returns a modal synchronously: Discord cannot open a form after a deferred reply.
export function centerRoute(ctx,design){
 const event=ctx.event || {},state={...(ctx.state || {})},action=event.action;
 if(action==='section')return {output:centerPage(design,state,event.values[0],0)};
 if(action==='next' || action==='prev'){const section=controlSections.find(s=>s.id===state.section);return {output:centerPage(design,state,section?.id || 'general',Math.max(0,Math.min((section?.pages.length || 1)-1,(state.page || 0)+(action==='next'?1:-1))))};}
 if(action==='copy'){const item=controlActions[event.values[0]];return {output:centerCard(design,state,'صيغة الأمر',item?'`'+(design.prefix || '!')+item.id+'`\n'+item.description:'الأمر غير متاح.',[b('رجوع للقسم','back',0),...foot()])};}
 if(action==='back' && state.section!=='home')return {output:centerPage(design,state,state.section,state.page || 0)};
 if(action==='search')return {output:{state,modal:{title:'البحث عن أمر',action:'search_submit',fields:controlForms.search}}};
 if(action==='dhikr_config')return {output:{state,modal:{title:'إعداد الأذكار',action:'dhikr_save',fields:controlForms.dhikr}}};
 if(action==='search_submit'){const query=String(event.fields?.query || '').trim().toLowerCase(),items=Object.values(controlActions).filter(a=>[a.id,a.label,a.description].join(' ').toLowerCase().includes(query)).slice(0,12);return {output:centerCard(design,state,'نتائج البحث',items.length?'اختر الأمر المطلوب.':'لا توجد نتائج.',[...items.map((a,i)=>b(a.label,'op_'+a.id,Math.floor(i/4))),...foot()],items.map(a=>({name:a.label,value:a.description+' · `'+a.id+'`',inline:true})))};}
 if(action?.startsWith('op_')){const id=action.slice(3),item=controlActions[id];if(!item)throw Error('أمر غير معروف.');const fields=controlForms[id];state.selectedAction=id;
  if(event.text && fields?.length)return {output:centerCard(design,state,item.label,'افتح النموذج لإدخال بيانات العملية ومراجعتها.',[b('إدخال البيانات','op_'+id,0),...foot()])};
  if(fields?.length)return {output:{state,modal:{title:item.label.slice(0,45),action:'form_'+id,fields}}};
  return {operation:{kind:readActions.has(id)?'read':'review',id,data:{}},state};
 }
 if(action?.startsWith('form_')){const id=action.slice(5);if(!controlActions[id])throw Error('أمر غير معروف.');return {operation:{kind:readActions.has(id)?'read':'review',id,data:event.fields || {}},state};}
 if(action==='confirm')return {operation:{kind:'apply',reviewId:state.centerReview},state};
 if(action==='cancel'){delete state.centerReview;return {output:centerCard(design,state,'ألغيت العملية','لم يُرسل أي تغيير إلى Discord.',foot())};}
 if(action==='support')return {output:centerCard(design,state,'مساعدة مركز التحكم','اختر قسمًا ثم اضغط الوظيفة. ستظهر المعطيات ومراجعة التغيير قبل التنفيذ. لا تمنح اللوحة صلاحيات إضافية.\nللدعم افتح مركز المساعدة من حسابك في ديسكوكو.',foot())};
 return {operation:{kind:action?.startsWith('dhikr_')?'dhikr':'home',id:action,data:event.fields || {}},state};
}
