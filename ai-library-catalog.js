import { englishAiLibrary } from './ai-library-english.js';
export const libraryModuleExtensions=Object.freeze([
  {
    "moduleKind": "bug_reports",
    "icon": "🐛",
    "title": "بلاغات الأعطال",
    "titleEn": "Bug reports",
    "workflow": "reports",
    "action": "أبلغ عن عطل",
    "actionEn": "Report a bug",
    "subject": "اسم المشكلة",
    "details": "خطوات التكرار والنتيجة المتوقعة",
    "subjectEn": "Issue title",
    "detailsEn": "Steps to reproduce and expected result",
    "prompt": "يجمع الفريق الأعطال في قناة خاصة ويقبل البلاغ أو يرفضه بعد المراجعة.",
    "promptEn": "The team reviews bug reports privately and accepts or rejects them.",
    "form": true,
    "private": true
  },
  {
    "moduleKind": "appeals",
    "icon": "⚖️",
    "title": "طلبات الاستئناف",
    "titleEn": "Moderation appeals",
    "workflow": "applications",
    "action": "قدّم استئنافًا",
    "actionEn": "Submit an appeal",
    "subject": "القرار محل الاستئناف",
    "details": "سبب الاعتراض والمعلومات الداعمة",
    "subjectEn": "Decision to appeal",
    "detailsEn": "Reason and supporting information",
    "prompt": "يراجع الفريق الاستئناف بشكل خاص؛ القبول يسجل قرار المراجعة ولا يرفع حظرًا أو عقوبة تلقائيًا.",
    "promptEn": "Staff review appeals privately. Approval records a decision; it does not automatically reverse a ban or punishment.",
    "form": true,
    "private": true
  },
  {
    "moduleKind": "partnerships",
    "icon": "🤝",
    "title": "طلبات الشراكة",
    "titleEn": "Partnership requests",
    "workflow": "applications",
    "action": "اطلب شراكة",
    "actionEn": "Request a partnership",
    "subject": "اسم المشروع",
    "details": "فكرة الشراكة وروابط المشروع",
    "subjectEn": "Project name",
    "detailsEn": "Partnership proposal and project links",
    "prompt": "تصل عروض الشراكة إلى الفريق الخاص للموافقة أو الرفض دون نشر تلقائي.",
    "promptEn": "Partnership proposals reach the private team for approval or rejection without automatic publication.",
    "form": true,
    "private": true
  },
  {
    "moduleKind": "feedback",
    "icon": "💬",
    "title": "ملاحظات العملاء",
    "titleEn": "Customer feedback",
    "workflow": "reports",
    "action": "شارك ملاحظتك",
    "actionEn": "Share feedback",
    "subject": "موضوع الملاحظة",
    "details": "تجربتك والتحسين المطلوب",
    "subjectEn": "Feedback subject",
    "detailsEn": "Your experience and suggested improvement",
    "prompt": "يستقبل الفريق ملاحظات العملاء بشكل خاص ويراجعها دون نشرها أو احتساب تقييم نجوم.",
    "promptEn": "The team reviews customer feedback privately; it is not published or counted as a star rating.",
    "form": true,
    "private": true
  },
  {
    "moduleKind": "commissions",
    "icon": "🎨",
    "title": "طلبات الأعمال المخصصة",
    "titleEn": "Custom work requests",
    "workflow": "orders",
    "action": "اطلب عملًا مخصصًا",
    "actionEn": "Request custom work",
    "subject": "نوع العمل المطلوب",
    "details": "المواصفات والموعد والميزانية الاختيارية",
    "subjectEn": "Work requested",
    "detailsEn": "Specifications, deadline and optional budget",
    "prompt": "يراجع الفريق طلب العمل المخصص ويقبله أو يرفضه، ثم يحدد إنجازه. لا يجري دفعًا تلقائيًا.",
    "promptEn": "Staff review custom work requests, accept or reject them, and mark accepted work complete. No payment is processed.",
    "form": true,
    "private": true
  },
  {
    "moduleKind": "mentoring",
    "icon": "🧭",
    "title": "طلبات الإرشاد",
    "titleEn": "Mentoring requests",
    "workflow": "learning",
    "action": "اطلب إرشادًا",
    "actionEn": "Request mentoring",
    "subject": "المجال أو المهارة",
    "details": "هدفك وما تحتاج المساعدة فيه",
    "subjectEn": "Topic or skill",
    "detailsEn": "Your goal and the help you need",
    "prompt": "يراجع المرشد الطلب في قناة خاصة ويقبله أو يرفضه ثم يحدد اكتماله؛ لا يحجز موعدًا تلقائيًا.",
    "promptEn": "A mentor privately reviews, accepts or rejects a request and marks it complete; no appointment is booked automatically.",
    "form": true,
    "private": true
  },
  {
    "moduleKind": "resources",
    "icon": "📚",
    "title": "مكتبة الموارد",
    "titleEn": "Resource library",
    "workflow": "submissions",
    "action": "أرسل موردًا",
    "actionEn": "Submit a resource",
    "subject": "عنوان المورد",
    "details": "وصف المورد ورابطه وفائدته",
    "subjectEn": "Resource title",
    "detailsEn": "Description, resource link and benefit",
    "prompt": "يراجع الفريق الموارد في قناة خاصة ثم ينشر المقبول منها في قناة اللوحة. الروابط لا تنفذ أكوادًا.",
    "promptEn": "Staff review resources privately and publish approved ones in the panel channel. Links never execute code.",
    "form": true,
    "private": false
  }
].map(item=>Object.freeze(item)));
// The only executable templates offered by Diskoko AI. Keep this list shared
// between the browser and the API so a hidden draft cannot be revived by name.
export const aiPromptLibrary = Object.freeze([
  { category: 'مميزات السيرفر', title: 'اختيار الاهتمامات', moduleKind: 'interests', prompt: 'يختار العضو رتبة اهتمام عادية بنفسه، ويمكنه إزالتها بالضغط مرة أخرى.' },
  { category: 'مميزات السيرفر', title: 'لوحة الاقتراحات', moduleKind: 'suggestions', prompt: 'يقدّم العضو اقتراحًا خاصًا؛ ينشره الفريق بعد المراجعة ثم يصوّت عليه المجتمع.' },
  { category: 'مميزات السيرفر', title: 'البلاغات الخاصة', moduleKind: 'reports', prompt: 'يرسل العضو بلاغًا خاصًا إلى قناة الإدارة، دون نشره للعامة.' },
  { category: 'مميزات السيرفر', title: 'التسجيل في الفعاليات', moduleKind: 'events', prompt: 'يسجّل العضو مشاركته أو يلغيها، مع موعد وعدد أماكن اختياريين.' },
  { category: 'مميزات السيرفر', title: 'طلبات الانضمام', moduleKind: 'applications', prompt: 'يتقدم العضو لرتبة أو فريق، ويراجع طلبه المشرفون في قناة خاصة.' },
  { category: 'مميزات السيرفر', title: 'الأسئلة السريعة', moduleKind: 'faq', prompt: 'يعرض البوت إجابة محددة للعضو عند الضغط على زر اللوحة.' },
  { category: 'مميزات السيرفر', title: 'استقبال المشاركات', moduleKind: 'submissions', prompt: 'يراجع الفريق أعمال الأعضاء وروابطها، وينشر المقبول منها.' },
  { category: 'مميزات السيرفر', title: 'طلبات المتجر', moduleKind: 'orders', prompt: 'يستقبل الفريق طلب منتج أو خدمة في قناة خاصة ويتابع إنجازه. لا يتضمن دفعًا تلقائيًا.' },
  { category: 'مميزات السيرفر', title: 'متابعة التعلّم', moduleKind: 'learning', prompt: 'يسجل المتعلم إنجازه واحتياجه للمساعدة؛ يراجع المرشد تقدمه حتى الاكتمال.' },
  { category: 'مميزات السيرفر', title: 'مهام فريق الإدارة', moduleKind: 'tasks', prompt: 'ينشئ الفريق مهمة داخل قناة خاصة، ثم يحدد قبولها وإنجازها.' },
  { category: 'الجيف آواي', title: 'جيف آواي سريع', prompt: 'جهز جيف آواي في #[القناة] لجائزة [الجائزة] لمدة [المدة بالدقائق] دقيقة، مع [عدد الفائزين] فائز. اعرض التفاصيل في بطاقة المراجعة قبل النشر.', kind: 'giveaway' },
  { category: 'الجيف آواي', title: 'جائزة اشتراك', prompt: 'جهز جيف آواي لجائزة اشتراك [المدة] في #[القناة]، ينتهي بعد [عدد الساعات] ساعة، وفائز واحد.', kind: 'giveaway' },
  { category: 'الجيف آواي', title: 'جائزة لأكثر من فائز', prompt: 'نظم جيف آواي في #[القناة] لجائزة [الجائزة]، لمدة [المدة] دقيقة، واختر [عدد الفائزين] فائزين.', kind: 'giveaway' },
  { category: 'تذاكر الدعم', title: 'لوحة تذاكر الدعم', prompt: 'جهز لوحة تذاكر دعم في #[القناة] بعنوان [العنوان]، ووصفها [الوصف]. اعرض الخطة قبل النشر.', kind: 'tickets' },
  { category: 'تذاكر الدعم', title: 'دعم العملاء', prompt: 'جهز لوحة تذاكر دعم للعملاء في #[القناة]، بعنوان [اسم الخدمة]، مع زر يفتح محادثة خاصة لصاحب الطلب وفريق الدعم. اجعل استلام التذكرة لفريق الدعم فقط.', kind: 'tickets' },
  { category: 'تذاكر الدعم', title: 'قسم طلب المساعدة', prompt: 'جهز لوحة تذاكر لطلبات المساعدة في #[القناة]. اجعل العنوان واضحًا والوصف ودودًا ومختصرًا.', kind: 'tickets' },
  { category: 'الرسائل', title: 'إعلان مع صورة', prompt: 'اكتب رسالة أنيقة عن [الموضوع] للنشر في #[القناة]. سأرفق صورة مع الرسالة؛ اعرض النص للمراجعة قبل النشر.', kind: 'message' },
  { category: 'الرسائل', title: 'رسالة ترحيب تلقائية', prompt: 'جهز بطاقة ترحيب تلقائية للأعضاء الجدد في #[القناة] بعنوان [العنوان] ونص [الوصف] وصورة العضو.', kind: 'welcome' },
  { category: 'الرسائل', title: 'إعلان فعالية', prompt: 'جهز إعلان فعالية [الاسم] بتاريخ [الوقت] في #[القناة] مع زر تسجيل اختياري وعدّاد للمشاركين.', kind: 'event' },
  { category: 'الرسائل', title: 'قوانين السيرفر', prompt: 'جهز بطاقة قوانين لسيرفري في #[القناة]. أريد اختيار طريقة العرض وتعديل القوانين واللون والصورة قبل النشر.', kind: 'rules' },
  { category: 'إدارة المجتمع', title: 'تحكم بالقناة', prompt: 'أريد التحكم في #[القناة]: من يستطيع الكتابة، اسم القناة ووصفها، بطء المحادثة والمحتوى الحساس. اعرض التغييرات للمراجعة قبل التنفيذ.', kind: 'channel_control' },
  { category: 'إدارة المجتمع', title: 'حدث Discord مجدول', prompt: 'أنشئ حدث Discord أصليًا لسيرفري بعنوان [اسم الحدث]، مع الموعد والمكان والوصف وصورة الغلاف. اعرض نموذج الحدث للمراجعة قبل إنشائه في Events.', kind: 'scheduled_event' },
  { category: 'إدارة المجتمع', title: 'استطلاع رأي', prompt: 'جهز استطلاعًا تفاعليًا في #[القناة] عن [السؤال] بخيارات [الخيار الأول] و[الخيار الثاني]. اعرض التفاصيل قبل النشر.', kind: 'poll' },
  ...libraryModuleExtensions.map(item=>({...item,category:'مميزات السيرفر'})),
].map(item => Object.freeze({...item,titleEn:item.titleEn || englishAiLibrary[item.title]?.[0] || item.title,promptEn:item.promptEn || englishAiLibrary[item.title]?.[1] || item.prompt})));

export const readyAiTemplate = (category, title) => aiPromptLibrary.find(item => !item.moduleKind && item.category === category && item.title === title) || null;
export const readyAiModule = (category, title) => aiPromptLibrary.find(item => item.moduleKind && item.category === category && item.title === title) || null;

export function libraryFeatures(item,english=false){
  const kind=item.moduleKind || item.kind;
  const t=(ar,en)=>english?en:ar;
  if(item.moduleKind){const extension=libraryModuleExtensions.find(x=>x.moduleKind===kind);const flow=extension?.workflow || kind;
    if(kind==='interests')return [t('رتبة عادية قابلة للإزالة','Reversible ordinary role'),t('صورة وأزرار روابط','Image and link buttons')];
    if(kind==='faq')return [t('إجابة خاصة للعضو','Private member answer'),t('صورة وأزرار روابط','Image and link buttons')];
    if(kind==='events')return [t('سعة وموعد إغلاق','Capacity and closing time'),t('تسجيل وإلغاء','Register and cancel')];
    return [t('نموذج بخانات قابلة للتعديل','Editable intake fields'),t('مراجعة خاصة ورقم متابعة','Private review and tracking'),['orders','learning','tasks'].includes(flow)?t('قبول وإنجاز','Accept and complete'):['suggestions','submissions'].includes(flow)?t('النشر بعد الموافقة','Publish after approval'):t('قبول أو رفض دون نشر','Accept or reject privately')];
  }
  const features={giveaway:[['المدة والفائزون','Duration and winners'],['مشاركة وسحب فعلي','Participation and real draw']],tickets:[['تذكرة خاصة وفريق الدعم','Private ticket and support staff'],['استلام وإغلاق','Claim and close']],welcome:[['عند انضمام العضو','On member join'],['متغيرات العضو وصورته','Member variables and avatar']],rules:[['طرق عرض القوانين','Rules presentation choices'],['نص وألوان وصورة','Text, color and image']],poll:[['خيارات التصويت','Voting choices'],['تصويت ونتائج','Votes and results']],event:[['تفاصيل وصورة','Details and image'],['تسجيل اختياري','Optional registration']],channel_control:[['صلاحيات وبطء المحادثة','Permissions and slow mode'],['مراجعة التغييرات','Review changes']],scheduled_event:[['الموعد والمكان','Time and location'],['حدث Discord أصلي','Native Discord event']],message:[['تنسيق وصورة','Formatting and image'],['روابط ومراجعة الإرسال','Links and send review']]};
  return (features[kind] || []).map(pair=>pair[english?1:0]);
}
