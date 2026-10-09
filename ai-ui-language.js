const translations = new Map(Object.entries({
  'AI ديسكوكو':'Diskoko AI','المحادثات':'Conversations','+ جديدة':'+ New','محادثة جديدة':'New conversation','إرسال':'Send','إرفاق':'Attach','مايك':'Voice','إلغاء':'Cancel','إغلاق':'Close','تنفيذ':'Apply','القناة':'Channel','قناة النشر':'Publish channel','اختر قناة نصية':'Choose a text channel','لون البطاقة':'Card accent color','لون اللوحة':'Panel accent color','عنوان اللوحة':'Panel title','عنوان البطاقة':'Card title','الوصف':'Description','اسم الزر':'Button label','مسمى زر النظام':'Action button label','نمط زر Discord':'Discord button style','أساسي':'Primary','ثانوي':'Secondary','نجاح':'Success','خطر':'Danger','روابط إضافية اختيارية (HTTPS)':'Optional HTTPS links','طريقة عرض الصورة':'Image presentation','صورة عادية':'Original image','شعار دائري صغير داخل البطاقة':'Small circular logo','شعار دائري داخل تصميمك':'Circular logo in your design','موضع الصورة':'Image position','فوق البطاقة':'Above the card','تحت البطاقة':'Below the card','يمين':'Right','يسار':'Left','الوسط':'Center','موضع صورة العضو':'Member avatar position','عنوان بطاقة الترحيب':'Welcome title','رسالة كل عضو جديد':'Message for each new member','تصميم الترحيب الخاص بسيرفرك':'Your final welcome background','ضع صورة العضو داخل التصميم الذي رفعته':'Compose the member avatar into your uploaded design','ارتفاع صورة العضو':'Avatar vertical position','حجم صورة العضو':'Avatar size','شكل صورة العضو':'Avatar shape','موضع التصميم عند استخدام بطاقة Discord':'Background position in native Discord cards','أعلى بطاقة Discord فقط':'Above native Discord card only','شعار السيرفر الدائري (اختياري)':'Circular server logo (optional)','رسالتك إلى AI ديسكوكو':'Your message to Diskoko AI','اكتب ما تحتاجه لسيرفرك…':'Describe what you need for your server…','التغييرات على Discord تظهر للمراجعة قبل تطبيقها.':'Discord changes are reviewed before applying.','✦ بوتك وهويتك':'Your bot and identity','شرح الربط ↗':'Connection guide ↗','اربط بوتك الخاص بديسكوكو AI':'Connect your bot to Diskoko AI','بوت ديسكوكو':'Diskoko bot','بوتك الخاص':'Your bot','متصل وجاهز':'Connected and ready','جارٍ التحقق…':'Checking…','متصل':'Connected','مكتبة AI ديسكوكو':'Diskoko AI library','توسيع المكتبة':'Expand library','ابحث عن إجراء…':'Search actions…','الكل':'All','مميزات السيرفر':'Server features','الجيف آواي':'Giveaways','تذاكر الدعم':'Support tickets','الرسائل':'Messages','إدارة المجتمع':'Community management','اختيار الاهتمامات':'Interest roles','لوحة الاقتراحات':'Suggestions','البلاغات الخاصة':'Private reports','التسجيل في الفعاليات':'Event registration','طلبات الانضمام':'Applications','الأسئلة السريعة':'Quick answers','استقبال المشاركات':'Submissions','طلبات المتجر':'Store orders','متابعة التعلّم':'Learning progress','مهام فريق الإدارة':'Staff tasks','جيف آواي سريع':'Quick giveaway','جائزة اشتراك':'Subscription giveaway','جائزة لأكثر من فائز':'Multiple winners','لوحة تذاكر الدعم':'Support ticket panel','دعم العملاء':'Customer support','قسم طلب المساعدة':'Help requests','إعلان مع صورة':'Image announcement','رسالة ترحيب تلقائية':'Automatic welcome','إعلان فعالية':'Event announcement','قوانين السيرفر':'Server rules','تحكم بالقناة':'Channel controls','حدث Discord مجدول':'Scheduled Discord event','استطلاع رأي':'Poll','إعداد الميزة':'Configure feature','إكمال التفاصيل ومراجعة النشر':'Complete details and review','مراجعة قبل النشر':'Review before publishing','أؤكد تنفيذ هذه الإعدادات':'Confirm these settings','الصورة المرفقة مرجع فقط. ارفع الصور النهائية التي تريد نشرها. الأزرار تستخدم أنماط Discord الثابتة ووظيفة النظام الحقيقي.':'The attachment is a reference only. Upload your final images. Buttons use native Discord styles and the real system function.',
}));

for(const [ar,en] of Object.entries({
  'عنوان الفعالية':'Event title','تفاصيل الفعالية وموعدها':'Event details and date','تفعيل زر تسجيل المشاركين والعدّاد':'Enable registration and participant count','مسمى زر التسجيل':'Registration button label','صورة أو GIF أو فيديو للفعالية (اختياري)':'Event image, GIF or video (optional)','صورة الشعار التي ستُدمج داخل التصميم':'Final logo to compose into your design','مكان الشعار المبدئي':'Initial logo position','تحريك الشعار يمينًا ويسارًا':'Horizontal logo position','تحريك الشعار أعلى وأسفل':'Vertical logo position','راجعت البطاقة والإعدادات وأوافق على النشر.':'I reviewed the card and settings and confirm publication.','بحث':'Search','عريض':'Bold','مائل':'Italic','تسطير':'Underline','شطب':'Strikethrough','مخفي':'Spoiler','اقتباس':'Quote','كود':'Code','مراجعة إعلان الفعالية':'Review event announcement','مراجعة لوحة تذاكر الدعم':'Review support tickets','مراجعة الجيف آواي':'Review giveaway','بطاقة الترحيب التلقائي':'Automatic welcome card','إرسال الرسالة إلى Discord':'Publish message to Discord','عنوان لوحة الدعم':'Support title','وصف لوحة الدعم':'Support description','رتبة فريق الدعم':'Support team role','اختر رتبة فريق الدعم':'Choose support staff role','اسم القناة الجديدة (إذا اخترت إنشاءها)':'New channel name (if creating one)','＋ أنشئ قناة دعم جديدة':'＋ Create a new support channel','تصنيف قنوات التذاكر (اختياري)':'Ticket category (optional)','قناة عرض اللوحة':'Panel channel','نص الزر':'Button text','اسم خانة الموضوع':'Subject field label','اسم خانة التفاصيل':'Details field label','الإجابة التي تظهر للعضو':'Answer shown to the member','موعد إغلاق التسجيل (اختياري)':'Registration deadline (optional)','عدد الأماكن؛ صفر يعني مفتوح':'Capacity; zero means unlimited','رتبة اهتمام عادية بلا صلاحيات':'Interest role without permissions','لون الجيف آواي':'Giveaway accent color','الجائزة':'Prize','المدة بالدقائق':'Duration in minutes','عدد الفائزين':'Winner count','عنوان الجيف آواي':'Giveaway title','وصف الجيف آواي':'Giveaway description','السؤال':'Question','عنوان القوانين':'Rules title','نص القوانين':'Rules text','تفعيل الترحيب':'Activate welcome','نشر البطاقة':'Publish card','نشر النظام':'Publish system','نشر في Discord':'Publish to Discord','التأكيد':'Confirmation','لم يُربط بهذا السيرفر بعد':'Not connected to this server yet','ربط بوتي':'Connect my bot','ربط بوتك الخاص':'Connect your bot','✦ ميزة مستقلة لسيرفرك':'✦ Standalone server feature','⚡ إجراء بعد المراجعة':'⚡ Action after review','اختر القناة والرتبة وإعدادات هذه الميزة، ثم راجع النشر.':'Choose the channel, role and settings, then review publication.','ابحث في الإجراءات':'Search actions','اختر إجراءً وأرسل القالب كما هو. أكمل بياناته في بطاقة المراجعة، وشاهد شكله في سيرفرك قبل التأكيد.':'Choose an action or describe your own idea. Complete its review and preview before confirming.','مساعدك لتنظيم السيرفر. محادثاتك محفوظة لهذا السيرفر ويمكنك الرجوع إليها.':'Your server assistant. Conversations are saved for this server.','خلّ AI ينشر وينفذ باسم بوت سيرفرك بعد مراجعتك. يبقى بوت ديسكوكو الخيار الأساسي حتى تربط بوتك.':'Use your own bot after reviewing each change. Diskoko is the default until you connect a bot.','اختيار السيرفر الافتراضي لأدوات الموقع. لا يرسل أي تعديل إلى Discord؛ سيُفحص الاتصال والصلاحيات عند التنفيذ.':'Select the executor for this server. This selection does not change Discord; connectivity and permissions are checked before execution.',
}))translations.set(ar,en);

for(const [ar,en] of Object.entries({
  'مساعدك لتنظيم السيرفر. محادثاتك محفوظة لهذا السيرفر ويمكنك الرجوع إليها.':'Your server assistant. Conversations are saved for this server.',
  'أهلًا، أنا AI ديسكوكو':'Hello, I am Diskoko AI',
  'قل لي وش تحتاج في سيرفرك، وبساعدك بخطوات واضحة. تقدر تتابع معي في نفس المحادثة، وسأفهم سياق كلامنا.':'Describe what your server needs. Continue in the same conversation to refine your draft.',
  'رتب لي الرومات':'Suggest a channel layout','نظّم الرتب':'Suggest roles','فصل البوت':'Disconnect bot','الخطوات ↗':'Instructions ↗',
  'متصل؛ يعتمد النشر على صلاحياته في القناة':'Connected; publication requires channel permissions',
  'سيُفحص اتصاله عند اختياره':'Connection checked when selected','عنوان لوحة الدعم':'Support panel title','لون بطاقة الدعم':'Support card accent color',
  'رتبة فريق الدعم (مطلوبة)':'Support team role (required)','اختر رتبة الدعم':'Choose support role','تصنيف التذاكر (اختياري)':'Ticket category (optional)','دون تصنيف':'No category',
  'بنر اختياري يظهر مع البطاقة':'Optional final banner','موضع البنر':'Banner position','فوق التفاصيل':'Above details','تحت التفاصيل':'Below details',
  'يفتح زر الدعم قناة خاصة لكل عضو. التذكرة خاصة بصاحبها ورتبة الدعم المحددة.':'The support button opens a private channel for the requester and selected support role.',
  'راجعت القناة والبطاقة والإعدادات، وأوافق على نشر هذا النظام في Discord.':'I reviewed the channel, card and settings and confirm publication in Discord.',
  'تأكيد التنفيذ':'Confirm execution','اختر إجراءً وأرسل القالب كما هو. أكمل بياناته في بطاقة المراجعة، وشاهد شكله في سيرفرك قبل التأكيد.':'Choose an action, complete its review fields and inspect the preview before confirming.',
  'المسار: حدد قناة اللوحة ورتبة الدعم ← راجع النص والبنر ← أكد النشر ← العميل يفتح تذكرة خاصة ← الفريق يستلمها ويتابعها':'Workflow: choose channel and support role → review text and banner → confirm publication → member opens a private ticket → staff handle it',
  'المسار: حدد الجائزة والمدة والقناة ← راجع البطاقة والبنر ← أكد النشر ← يتفاعل الأعضاء مع زر المشاركة':'Workflow: choose prize, duration and channel → review → publish → members enter',
  'المسار: حدد القناة والنص والصورة إن وجدت ← راجع المحتوى وموضع الصورة ← أكد النشر في Discord':'Workflow: choose channel, text and final image → review → publish in Discord',
  'المسار: اختر قناة الترحيب والبطاقة ← راجع المعاينة ← فعّلها ← يرحّب البوت تلقائيًا بكل عضو جديد':'Workflow: choose welcome channel → review → activate → bot welcomes each joining member',
  'المسار: جهز إعلان الفعالية ← فعّل زر التسجيل إن أردت ← راجع المعاينة ← انشر ويتحدث عدّاد المشاركين':'Workflow: prepare event → enable registration if needed → review → publish with attendance counter',
  'المسار: اختر القناة وعدّل القوانين ← اختر طريقة عرض البطاقة واللون والصورة ← راجع المعاينة ← انشر':'Workflow: choose channel and rules → edit appearance → review → publish',
  'المسار: اختر قناة صوتية أو مكانًا آخر ← اضبط الموعد والغلاف ← راجع شكل الحدث ← أنشئه في Events داخل Discord':'Workflow: choose voice channel or location → set date and cover → review → create Discord event',
  'المسار: حدد السؤال والخيارات والصور ← راجع المعاينة ← انشر ← يصوّت الأعضاء وتظهر النتائج':'Workflow: set question and choices → review → publish → members vote and view results',
}))translations.set(ar,en);

for(const [ar,en] of Object.entries({'راجعت الإعدادات وأوافق على النشر في Discord.':'I reviewed these settings and confirm publication in Discord.','نعم، أؤكد التنفيذ':'Yes, confirm execution','معاينة الصورة التي ستُرسل / Preview of the image to publish':'Preview of the image to publish','تنزيل التصميم / Download design':'Download design','حُفظ تصميم الصورة دون نشر / Image draft saved without publishing':'Image draft saved without publishing'}))translations.set(ar,en);

for(const [ar,en] of Object.entries({
  'وصفها للأعضاء':'Description shown to members','نص الزر':'Button label','اختر قناة':'Choose a channel','اختر رتبة':'Choose a role',
  'شكل الزر':'Button style','بنفسجي':'Primary','رمادي':'Secondary','أخضر':'Success','أحمر':'Danger',
  'قناة مراجعة خاصة لا يراها الأعضاء':'Private staff review channel','رتبة الفريق':'Staff role','اسم خانة الموضوع':'Subject field label','اسم خانة التفاصيل':'Details field label',
  'الإجابة التي تظهر للعضو':'Answer shown to the member','موعد إغلاق التسجيل (اختياري)':'Registration deadline (optional)','عدد الأماكن؛ صفر يعني مفتوح':'Capacity; zero means unlimited',
  'يضيف العضو هذه الرتبة أو يزيلها بنفسه. يجب أن تكون رتبة البوت أعلى منها.':'Members can add or remove this role. The bot role must be above it.',
  'صورة أو GIF للوحة (اختياري، حتى 8 ميجابايت)':'Final panel image or GIF (optional, up to 8 MiB)',
  'ارفع الصورة النهائية':'Upload the final source image','مراجعة تركيب الميزة':'Review panel publication','لاحقًا':'Later','نعم، انشر الميزة':'Confirm publication',
}))translations.set(ar,en);

export function initializeAiLanguage(root,dialog,userId,catalog=[]) {
  if (document.getElementById('sitePreferences')) { for (const item of catalog) { if(item.titleEn)translations.set(item.title,item.titleEn);if(item.promptEn)translations.set(item.prompt,item.promptEn); } return {language:()=>document.documentElement.lang==='en'?'en':'ar',disconnect:()=>{}}; }
  for(const item of catalog){if(item.titleEn)translations.set(item.title,item.titleEn);if(item.promptEn)translations.set(item.prompt,item.promptEn);}
  const key=`diskoko:ai-language:${userId}`;
  let language;
  try{language=localStorage.getItem(key);}catch{}
  if(!['ar','en','auto'].includes(language))language='auto';
  const select=document.createElement('select');select.id='aiInterfaceLanguage';select.setAttribute('aria-label','لغة واجهة AI / AI language');
  select.innerHTML='<option value="auto">تلقائي / Auto</option><option value="ar">العربية</option><option value="en">English</option>';select.value=language;
  root.querySelector('.ai-chat-main .panel-head')?.append(select);
  const originals=new WeakMap();
  const translate=()=>{
    if(!root.ownerDocument?.defaultView?.document || !root.contains(select))return;
    for(const scope of [root,dialog].filter(Boolean)){
      scope.dir=language==='en'?'ltr':'rtl';
      const walker=root.ownerDocument.createTreeWalker(scope,NodeFilter.SHOW_TEXT);
      for(let node=walker.nextNode();node;node=walker.nextNode()){
        const parent=node.parentElement;
        if(!parent || parent.closest('.ai-discord-preview,.ai-bubble,#aiConversations,input,textarea,[data-scene-preview]'))continue;
        if(parent.closest('#aiChatTitle') && !['New conversation','محادثة جديدة'].includes(node.nodeValue.trim()))continue;
        if(parent.closest('option') && /^\d{17,22}$/.test(parent.value || ''))continue;
        if(!parent.closest('label,legend,button,summary,option,.panel-head,.ai-bot-connect,.form-note,.notice,.badge,.head,.ai-welcome,.ai-library-note,.ai-scene-review,h1,h2,h3'))continue;
        const old=originals.get(node);
        if(old && node.nodeValue===old.translated){if(language!=='en')node.nodeValue=old.source;continue;}
        if(language!=='en')continue;
        const source=node.nodeValue,trimmed=source.trim();
        const replacement=translations.get(trimmed) || (/^[0-9\u0660-\u0669]+ \u0625\u062c\u0631\u0627\u0621 \u0642\u0627\u0628\u0644 \u0644\u0644\u0645\u0631\u0627\u062c\u0639\u0629 \u0648\u0627\u0644\u062a\u0646\u0641\u064a\u0630$/.test(trimmed)?trimmed.split(' ')[0]+' reviewable actions':null) || (/^اسم الرابط \d+$/.test(trimmed)?trimmed.replace('اسم الرابط','Link label'): /^الرابط \d+$/.test(trimmed)?trimmed.replace('الرابط','URL'): /\p{Script=Arabic}/u.test(trimmed) && trimmed.includes(' / ') ? trimmed.split(' / ').slice(1).join(' / '):null);
        if(replacement){const translated=source.replace(trimmed,replacement);originals.set(node,{source,translated});node.nodeValue=translated;}
      }
      scope.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(input=>{const original=input.dataset.aiPlaceholder || input.placeholder;input.dataset.aiPlaceholder=original;input.placeholder=language==='en'?(translations.get(original)||original):original;input.dir='auto';});
    }
  };
  let scheduled=false;
  const observer=new MutationObserver(()=>{if(!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;translate();});}});
  observer.observe(root,{childList:true,subtree:true});if(dialog)observer.observe(dialog,{childList:true,subtree:true});
  select.onchange=()=>{language=select.value;try{localStorage.setItem(key,language);}catch{}translate();};translate();
  return {language:()=>language==='auto'?undefined:language,disconnect:()=>observer.disconnect()};
}

export const uiTranslations = translations;
