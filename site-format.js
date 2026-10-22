// Keep rendered metadata dates current without rerendering customer editors.
const dates=new Map();
export function siteDate(value,method='toLocaleString',options){
 const date=value instanceof Date?value:new Date(value);
 if(value==null || value==='' || !Number.isFinite(date.getTime()))return '—';
 const settings={calendar:'gregory',...options};
 const ar=date[method]('ar-SA',settings),en=date[method]('en-US',settings);
 if(dates.size>=2000)dates.clear();
 dates.set(ar,{ar,en});dates.set(en,{ar,en});
 return document.documentElement.lang==='en'?en:ar;
}

const customerStates={
 paid:['مدفوع','Paid'],unpaid:['غير مدفوع','Unpaid'],void:['ملغى','Void'],refunded:['مسترد','Refunded'],trial:['مجاني','Free'],grace:['فترة سماح','Grace period'],past_due:['يحتاج مراجعة','Needs review'],connected:['متصل','Connected'],disconnected:['غير متصل','Disconnected'],online:['متصل','Online'],offline:['غير متصل','Offline'],queued:['في الانتظار','Queued'],retrying:['بانتظار المحاولة التالية','Waiting for retry'],processing:['قيد المعالجة','Processing'],ready:['جاهز','Ready'],error:['يحتاج مراجعة','Needs review'],schedule:['رسالة مجدولة','Scheduled message'],change_set:['خطة تغييرات','Change plan'],custom_template:['قالب مخصص','Custom template'],settings:['إعدادات','Settings'],

 draft:['مسودة','Draft'],pending:['بانتظار التنفيذ','Pending'],running:['جارٍ التنفيذ','Running'],succeeded:['مكتمل','Completed'],completed:['مكتمل','Completed'],failed:['يحتاج مراجعة','Needs review'],review_required:['نتيجة تحتاج تحققًا','Result needs verification'],cancel_requested:['جارٍ الإيقاف','Stopping'],cancelled:['متوقف','Stopped'],paused:['متوقف مؤقتًا','Paused'],manual_paused:['متوقف يدويًا','Manually paused'],scheduled:['مجدول','Scheduled'],sending:['جارٍ الإرسال','Sending'],sent:['تم الإرسال','Sent'],active:['نشط','Active'],disabled:['غير مفعّل','Disabled'],expired:['منتهي','Expired'],installed:['متصل','Connected'],install_required:['يحتاج ربطًا','Connection required'],unavailable:['تعذر التحقق','Verification unavailable'],permissions_insufficient:['الصلاحيات غير كافية','Insufficient permissions'],open:['مفتوح','Open'],closed:['مغلق','Closed'],approved:['معتمد','Approved'],rejected:['مرفوض','Rejected'],in_progress:['قيد المعالجة','In progress'],resolved:['تم الحل','Resolved'],user:['حساب','Account'],guild:['سيرفر','Server'],channel:['قناة','Channel'],role:['رتبة','Role'],command:['أمر','Command'],template:['قالب','Template']
};
siteDate.statusLabel=value=>customerStates[value]?.[document.documentElement.lang==='en'?1:0] || (document.documentElement.lang==='en'?'Unknown status':'حالة غير معروفة');
siteDate.errorMessage=error=>{
 const en=document.documentElement.lang==='en';
 if(error?.name==='AbortError' || error?.name==='TimeoutError')return en?'The request timed out. Check the result before trying an action again.':'انتهت مهلة الاتصال. تحقق من نتيجة العملية قبل إعادة تنفيذها.';
 if(/Failed to fetch|NetworkError|Load failed/i.test(error?.message || ''))return en?'Connection interrupted. Check your connection and the operation history before retrying.':'انقطع الاتصال. تحقق من الإنترنت وسجل العملية قبل إعادة المحاولة.';
 if(/Cannot read properties|is not a function|Unexpected token/i.test(error?.message || ''))return en?'Unable to display this section. Reload it and check operation history before repeating an action.':'تعذر عرض هذا القسم. أعد تحميله وراجع سجل العمليات قبل تكرار التنفيذ.';
 if(error?.status===429)return en?'Too many requests. Wait a moment before retrying.':'طلبات كثيرة في وقت قصير. انتظر قليلًا قبل المحاولة.';
 return error?.message || (en?'Unable to complete the request.':'تعذر إكمال الطلب.');
};

// Shared keyboard and mobile drawer behavior for account and server workspaces.
siteDate.bindNavigation=({toggle,panel})=>{
 if(!toggle || !panel || toggle.dataset.navigationBound)return;
 toggle.dataset.navigationBound='true';toggle.setAttribute('aria-controls',panel.id);
 document.querySelector('.skip-link')?.addEventListener('click',event=>{event.preventDefault();document.querySelector('#workspace')?.focus();});
 const mobile=()=>window.innerWidth<=760;
 const backdrop=document.createElement('button');backdrop.type='button';backdrop.className='navigation-backdrop';backdrop.setAttribute('aria-label','إغلاق قائمة التنقل');backdrop.hidden=true;backdrop.tabIndex=-1;document.body.append(backdrop);
 const sync=()=>{const open=panel.classList.contains('open');toggle.setAttribute('aria-expanded',String(open));document.body.dataset.navOpen=String(mobile()&&open);panel.inert=mobile()&&!open;const main=document.querySelector('.main-shell');if(main)main.inert=mobile()&&open;backdrop.hidden=!(mobile()&&open);};
 const close=focus=>{panel.classList.remove('open');sync();if(focus)toggle.focus();};
 backdrop.onclick=()=>close(true);
 toggle.onclick=()=>{panel.classList.toggle('open');sync();if(panel.classList.contains('open'))panel.querySelector('input,a,button,select')?.focus();};
 document.addEventListener('keydown',event=>{if(event.key==='Escape' && panel.classList.contains('open') && !document.querySelector('dialog[open]')){event.preventDefault();close(true);}});
 document.addEventListener('keydown',event=>{if(event.key!=='Tab' || !mobile() || !panel.classList.contains('open'))return;const items=[...panel.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled)')].filter(node=>!node.hidden && node.getClientRects().length);if(!items.length)return;const index=items.indexOf(document.activeElement);if(index<0 || !event.shiftKey&&index===items.length-1 || event.shiftKey&&index===0){event.preventDefault();items[event.shiftKey?items.length-1:0].focus();}});
 document.addEventListener('click',event=>{if(panel.contains(event.target)){if(event.target.closest('a[href]'))close(false);return;}if(!toggle.contains(event.target))close(false);});
 window.addEventListener('resize',sync);window.addEventListener('hashchange',()=>close(false));sync();
};
export function localizeDateText(text,language){
 for(const [source,pair] of [...dates].sort((a,b)=>b[0].length-a[0].length))if(text.includes(source))text=text.replaceAll(source,pair[language==='en'?'en':'ar']);
 return text;
}

const customerActions={
 'change_set.create':['حُفظت خطة تغييرات','Change plan saved'],'change_set.apply':['طُبقت خطة تغييرات','Change plan applied'],'change_set.failed':['تعثر تطبيق خطة','Change plan interrupted'],'change_set.cancel':['أُوقف باقي التنفيذ','Remaining execution stopped'],'bot.settings.update':['حُدثت إعدادات البوت','Bot settings updated'],'guild.verify':['تم التحقق من الربط','Connection verified'],'guild.rename':['تغيّر اسم السيرفر','Server renamed'],'schedule.create':['جُدولت رسالة','Message scheduled'],'schedule.cancel':['أُلغيت رسالة مجدولة','Schedule cancelled'],'analytics.settings':['حُدث إعداد جمع النشاط','Analytics collection updated'],'ai.bot.connect':['رُبط بوت بالسيرفر','Bot connected'],'ai.bot.disconnect':['فُك ربط بوت','Bot disconnected'],'custom_template.create':['حُفظ قالب مخصص','Custom template saved'],'custom_template.delete':['حُذف قالب مخصص','Custom template deleted'],'structure.delete':['حُذف عنصر من البنية','Server resource deleted'],'workspace.team.update':['حُدثت صلاحيات الفريق','Team permissions updated'],'billing.upgrade.requested':['سُجل طلب تغيير الباقة','Plan change requested']
};
siteDate.actionLabel=value=>customerActions[value]?.[document.documentElement.lang==='en'?1:0] || (document.documentElement.lang==='en'?'Management action':'إجراء إدارة');
