import {controlCenterFiles} from './control-center-project-files.js';
const safeUrl=value=>{if(!value)return '';const u=new URL(value);if(u.protocol!=='https:' || u.username || u.password || value.length>500)throw Error('استخدم رابط HTTPS للصورة.');return u.href;};
export function normalizeAdminPanel(value={}){
 const title=String(value.title || 'لوحة إدارة السيرفر').trim(),description=String(value.description || 'معلومات سيرفرك وإدارته من مكان واحد.').trim(),color=String(value.color || '#9d7bea');
 if(!title || title.length>100 || description.length>600 || !/^#[0-9a-f]{6}$/i.test(color))throw Error('راجع العنوان والوصف ولون اللوحة.');
 const minutes=value.replyMinutes==='permanent'?'permanent':Number(value.replyMinutes || 15);if(![5,15,30,60,'permanent'].includes(minutes))throw Error('اختر مدة المساعد من 5 إلى 60 دقيقة.');
 const channelId=String(value.channelId || '');if(channelId && !/^\d{17,20}$/.test(channelId))throw Error('اختر قناة صالحة.');
 const imageUrl=safeUrl(String(value.imageUrl || '')),supportUrl=safeUrl(String(value.supportUrl || ''));
 const commandMode=value.commandMode || 'slash',prefix=String(value.prefix || '!');
 if(!['slash','prefix','both'].includes(commandMode) || !/^\S{1,5}$/u.test(prefix) || /^[\p{L}\p{N}]/u.test(prefix))throw Error('اختر نوع الأمر وبادئة رمزية صالحة مثل !.');
 const buttons=Object.create(null);
 if(value.buttons!==undefined){
  if(!value.buttons || typeof value.buttons!=='object' || Array.isArray(value.buttons) || Object.keys(value.buttons).length>220)throw Error('راجع إعدادات أزرار اللوحة.');
  for(const [id,button] of Object.entries(value.buttons)){
   if(!/^[a-z][a-z0-9_-]{0,31}$/.test(id) || ['constructor','prototype','__proto__'].includes(id) || !button || typeof button!=='object' || Array.isArray(button))throw Error('إعداد زر غير صالح.');
   const label=String(button.label || '').trim(),emoji=String(button.emoji || '').trim(),style=Number(button.style || value.buttonStyle || 2),order=Number(button.order ?? 100);
   if(label.length>60 || emoji.length>100 || ![1,2,3,4].includes(style) || !Number.isInteger(order) || order<0 || order>999 || (button.hidden!==undefined && typeof button.hidden!=='boolean'))throw Error('راجع اسم الزر ورمزه ولونه وترتيبه.');
   buttons[id]={label,emoji,style,order,hidden:button.hidden===true};
  }
 }
 const footerText=String(value.footerText ?? '').trim();if(footerText.length>200)throw Error('النص أسفل البطاقة حتى 200 حرف.');
 return {footerText,channelId,title,description,color,imageUrl,supportUrl,buttons,commandMode,prefix,logoUrl:safeUrl(String(value.logoUrl || '')),bannerUrl:safeUrl(String(value.bannerUrl || '')),buttonStyle:[1,2,3,4].includes(Number(value.buttonStyle))?Number(value.buttonStyle):2,replyMinutes:minutes};
}
export function adminPanelProject(value={}){
 const config=normalizeAdminPanel(value);
 if(value.controlCenter===true)return {format:'diskoko-project@1',entry:'index.js',permissions:['admin'],origins:[],files:{...controlCenterFiles,'panel.json':JSON.stringify(config,null,2),'index.js':`import {admin} from 'diskoko';
import design from ${JSON.stringify('./panel.json')};
import {centerRoute} from './control-center-view.js';
export async function handle(ctx){
 try{const route=centerRoute(ctx,design);if(route.output)return route.output;
 if(!ctx.event.action && design.channelId)await admin.publish(design.channelId,design);
 return await admin.center({operation:route.operation,state:route.state,design});
 }catch(error){return {state:ctx.state,message:{embeds:[{title:'تعذر إكمال الطلب',description:String(error.message).slice(0,1500),color:0xe35769}],controls:[{type:'button',label:'الرئيسية',action:'home',style:2}]}};}
}`}};
 return {format:'diskoko-project@1',entry:'index.js',permissions:['admin'],origins:[],files:{'panel.json':JSON.stringify(config,null,2),'index.js':`import {admin} from 'diskoko';
import design from ${JSON.stringify('./panel.json')};
const button=(label,action)=>({type:'button',label,action,style:design.buttonStyle});
const menu=()=>({type:'select',action:'page',placeholder:'اختر قسم الإدارة',options:[{label:'نظرة عامة',value:'overview'},{label:'القنوات',value:'channels'},{label:'الرتب',value:'roles'},{label:'سجل التغييرات',value:'logs'}]});
function card(ctx,title,description,controls,fields=[]){return {state:ctx.state,message:{embeds:[{title,description,color:parseInt(design.color.slice(1),16),author:{name:design.title,...(design.logoUrl?{icon_url:design.logoUrl}:{})},...(design.bannerUrl?{image:design.bannerUrl}:{}),fields,footer:{text:'إدارة موثوقة · لا تُنفذ التغييرات قبل تأكيدك'}}],controls}};}
export async function handle(ctx){
 const action=ctx.event.action;
 try{
  if(action==='reply_on' || action==='reply_always'){const mode=await admin.startReply(action==='reply_always'?'permanent':design.replyMinutes,design.channelId);return card(ctx,'مساعد الإدارة يعمل','رد على رسالة المساعد في القناة الخاصة. '+(mode.permanent?'الوضع يعمل باستمرار حتى توقفه.':'المدة: '+mode.minutes+' دقيقة.')+' إيقافه متاح من الزر.',[menu(),button('إيقاف المساعد','reply_off')]);}
  if(action==='reply_off'){await admin.stopReply();return card(ctx,'أوقفت وضع الرد','اللوحة والأمر ما زالا متاحين.',[menu(),button('تشغيل المساعد','reply_on')]);}
  if(action==='add_channel')return {modal:{title:'إضافة قناة',action:'review_channel',fields:[{id:'name',label:'اسم القناة',required:true},{id:'topic',label:'وصف القناة',paragraph:true,required:false}]}};
  if(action==='add_role')return {modal:{title:'إضافة رتبة',action:'review_role',fields:[{id:'name',label:'اسم الرتبة',required:true},{id:'color',label:'اللون HEX مثل #9d7bea',required:true}]}};
  if(action==='edit_channel'){ctx.state.target=ctx.event.values[0];return {state:ctx.state,modal:{title:'تعديل القناة',action:'review_channel_edit',fields:[{id:'name',label:'الاسم الجديد',required:true},{id:'topic',label:'الوصف الجديد',paragraph:true,required:false}]}};}
  if(action==='edit_role'){ctx.state.target=ctx.event.values[0];return {state:ctx.state,modal:{title:'تعديل الرتبة',action:'review_role_edit',fields:[{id:'name',label:'الاسم الجديد',required:true},{id:'color',label:'اللون HEX',required:true}]}};}
 const authority=await admin.authority();if(!authority.manager)return {message:{content:'هذه اللوحة للمشرفين الذين يملكون صلاحية إدارة السيرفر. لا يمنح تشغيل الأمر صلاحيات جديدة.'}};
  if(!action && design.channelId)await admin.publish(design.channelId,design);
  if(['review_channel','review_role','review_channel_edit','review_role_edit'].includes(action)){
   const fields=ctx.event.fields || {},role=action.includes('role'),edit=action.endsWith('_edit');
   const review=await admin.review({kind:role?'role':'channel',action:edit?'update':'create',...(edit?{id:ctx.state.target}:{}),name:fields.name,...(role?{color:fields.color}:{topic:fields.topic || ''})});
   ctx.state.reviewId=review.id;return card(ctx,'راجع التغيير قبل التنفيذ',review.summary,[button('أؤكد التنفيذ','confirm'),button('إلغاء المراجعة','cancel'),menu()]);
  }
  if(action==='confirm'){const result=await admin.apply(ctx.state.reviewId);delete ctx.state.reviewId;return card(ctx,'نتيجة التنفيذ',result.message,[menu(),button('تحديث','refresh')]);}
  if(action==='cancel'){delete ctx.state.reviewId;return card(ctx,'ألغيت المراجعة','لم ترسل تغييرات إلى Discord.',[menu()]);}
  if(action==='page')ctx.state.resourcePage=0;
  if(action==='list_next')ctx.state.resourcePage=Math.min(19,(ctx.state.resourcePage || 0)+1);
  if(action==='list_prev')ctx.state.resourcePage=Math.max(0,(ctx.state.resourcePage || 0)-1);
  const page=action==='page'?ctx.event.values[0]:(ctx.state.page || 'overview');ctx.state.page=page;
  if(page==='logs'){const logs=await admin.logs();return card(ctx,'سجل التغييرات',logs.length?logs.map(x=>x.at+' · '+x.action+' · '+x.status).join('\\n').slice(0,3900):'لا يوجد سجل متاح. سجلات Discord تتطلب صلاحية عرض سجل التدقيق للمشرف والبوت.',[menu(),button('تحديث','refresh')]);}
  if(page==='channels' || page==='roles'){
   const items=await admin.resources(page,ctx.state.resourcePage || 0),role=page==='roles';const editable=items.filter(x=>x.editable).slice(0,25);
   return card(ctx,role?'رتب السيرفر':'قنوات السيرفر',items.map(x=>x.name).join('\\n') || 'لا توجد عناصر متاحة.',[menu(),button(role?'إضافة رتبة':'إضافة قناة',role?'add_role':'add_channel'),...(editable.length?[{type:'select',action:role?'edit_role':'edit_channel',placeholder:'اختر عنصرًا للتعديل',options:editable.map(x=>({label:x.name.slice(0,100),value:x.id}))}]:[]),...(ctx.state.resourcePage>0?[button('السابق','list_prev')]:[]),...(items.length===25 && (ctx.state.resourcePage || 0)<19?[button('التالي','list_next')]:[])]);
  }
  const info=await admin.overview();return card(ctx,info.name,design.description,[menu(),button('تحديث','refresh'),button('تشغيل المساعد','reply_on'),button('تشغيل دائم','reply_always'),button('إيقاف المساعد','reply_off')],[{name:'الأعضاء',value:String(info.members),inline:true},{name:'القنوات',value:String(info.channels),inline:true},{name:'الرتب',value:String(info.roles),inline:true},{name:'التعزيزات',value:String(info.boosts),inline:true},{name:'مستوى التعزيز',value:String(info.boostLevel),inline:true}]);
 }catch(error){return card(ctx,'تعذر إكمال الطلب',String(error.message).slice(0,1000),[menu(),button('تحديث','refresh')]);}
}`}};
}
