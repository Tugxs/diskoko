import { libraryModuleExtensions } from '../ai-library-catalog.js';
export const READY_MODULE_TYPES = Object.freeze({
  ...Object.fromEntries(libraryModuleExtensions.map(item=>[item.moduleKind,{icon:item.icon,label:item.title,action:item.action,actionEn:item.actionEn,form:true,private:item.private,workflow:item.workflow}])),
  interests: { icon: '🎯', label: 'اختيار الاهتمامات', action: 'اختيار الرتبة', role: true },
  suggestions: { icon: '💡', label: 'لوحة الاقتراحات', action: 'قدّم اقتراحًا', form: true },
  reports: { icon: '🚨', label: 'البلاغات الخاصة', action: 'أرسل بلاغًا خاصًا', form: true, private: true },
  events: { icon: '🗓️', label: 'التسجيل في الفعاليات', action: 'سجّل مشاركتك', signup: true },
  applications: { icon: '📝', label: 'طلبات الانضمام', action: 'قدّم طلبًا', form: true, private: true },
  faq: { icon: '❔', label: 'الأسئلة السريعة', action: 'اعرض الإجابة', answer: true },
  submissions: { icon: '🎬', label: 'استقبال المشاركات', action: 'أرسل مشاركتك', form: true },
  orders: { icon: '🛒', label: 'طلبات المتجر', action: 'أنشئ طلبًا', form: true, private: true },
  learning: { icon: '🎓', label: 'متابعة التعلّم', action: 'سجّل تقدمك', form: true, private: true },
  tasks: { icon: '📌', label: 'مهام فريق الإدارة', action: 'أضف مهمة', form: true, staffOnly: true },
});

// Each module asks for information that belongs to its actual workflow.
export const READY_MODULE_FIELDS = Object.freeze({
  ...Object.fromEntries(libraryModuleExtensions.map(item=>[item.moduleKind,{subject:item.subject,details:item.details,subjectEn:item.subjectEn,detailsEn:item.detailsEn,result:item.prompt}])),
  suggestions: { subject: 'عنوان الاقتراح', details: 'الاقتراح وسبب فائدته', result: 'ينشر الاقتراح بعد موافقة الفريق، ثم يصوّت عليه الأعضاء.' },
  reports: { subject: 'موضوع البلاغ', details: 'ما حدث وأين حدث؟', result: 'يصل البلاغ للفريق فقط ولا يُنشر للأعضاء.' },
  applications: { subject: 'الدور الذي تتقدم له', details: 'خبرتك ولماذا ترغب في الانضمام', result: 'يراجع الفريق الطلب ويقبل أو يرفض دون نشره.' },
  submissions: { subject: 'عنوان المشاركة', details: 'وصف المشاركة ورابط العمل', result: 'يراجع الفريق المشاركة ثم ينشر المقبول منها.' },
  orders: { subject: 'المنتج أو الخدمة المطلوبة', details: 'الكمية والمتطلبات وطريقة التواصل', result: 'يصل الطلب للفريق الخاص؛ لا يجري دفعًا تلقائيًا.' },
  learning: { subject: 'الدرس أو المهمة التعليمية', details: 'ما أُنجز وما يحتاج مساعدة', result: 'يراجع المرشد تقدم المتعلم ويحدّث حالته.' },
  tasks: { subject: 'عنوان مهمة الفريق', details: 'المطلوب والمسؤول والموعد', result: 'تظهر المهمة للفريق فقط ويمكن تحديد اكتمالها.' },
});

const MODULES_BY_TEMPLATE = {
  'server-my-arabic': ['interests', 'suggestions', 'reports', 'events', 'faq', 'submissions', 'tasks'],
  'streamer-community': ['interests', 'suggestions', 'reports', 'events', 'applications', 'faq', 'submissions', 'tasks'],
  'diskoko-gaming-1': ['interests', 'suggestions', 'reports', 'events', 'applications', 'faq', 'submissions', 'tasks'],
  'diskoko-streamer': ['interests', 'suggestions', 'reports', 'events', 'applications', 'faq', 'submissions', 'tasks'],
  'diskoko-store-ar': ['suggestions', 'reports', 'faq', 'submissions', 'orders', 'tasks'],
  'diskoko-store-en': ['suggestions', 'reports', 'faq', 'submissions', 'orders', 'tasks'],
  'diskoko-community': ['interests', 'suggestions', 'reports', 'events', 'applications', 'faq', 'submissions', 'tasks'],
  'diskoko-esports': ['interests', 'suggestions', 'reports', 'events', 'applications', 'faq', 'submissions', 'tasks'],
  'diskoko-academy': ['interests', 'suggestions', 'reports', 'applications', 'faq', 'submissions', 'learning', 'tasks'],
};

const CHANNEL_PREFERENCES = {
  interests: ['welcome', 'introductions', 'general', 'chat-ar'],
  suggestions: ['suggestions', 'ideas-ar', 'questions', 'general'],
  reports: ['ticket', 'help', 'order-help', 'questions'],
  events: ['events', 'schedule', 'announcements', 'news'],
  applications: ['tryouts', 'looking-for-team', 'help', 'questions'],
  faq: ['faq', 'help-guide', 'about', 'rules'],
  submissions: ['clips', 'gallery', 'showcase', 'projects', 'customer-gallery', 'media'],
  orders: ['order-help', 'products'],
  learning: ['assignments', 'roadmap'],
  tasks: ['staff-chat', 'staff', 'mentor-room'],
};
const ENGLISH_MODULES = {
  suggestions: ['💡 Suggestions', 'Share a suggestion', 'Share an idea for our store. Our team will review it before publication.'],
  reports: ['🚨 Private reports', 'Send a private report', 'Report a concern privately to our team.'],
  faq: ['❔ Quick answers', 'Show the answer', 'Find a quick answer to a common question.'],
  submissions: ['🎬 Customer showcase', 'Submit your work', 'Share your work with the team for review.'],
  orders: ['🛒 Order requests', 'Start an order', 'Tell our team what you need. Payment is arranged separately.'],
  tasks: ['📌 Team tasks', 'Add a task', 'Send an internal task to the staff team.'],
};

export function defaultReadyModules(template) {
  const channels = template.definition.categories.flatMap(group => group.channels).filter(channel => channel.type === 0);
  const staff = channels.find(channel => channel.access === 'private' && /^(staff|mentor-room|coach-notes)/.test(channel.key)) || channels.find(channel => channel.access === 'private');
  const publicChannels = channels.filter(channel => channel.access !== 'private');
  const safeRole = template.definition.roles.find(role => role.preset === 'member');
  const types = MODULES_BY_TEMPLATE[template.key] || [];
  return types.filter(kind => kind !== 'interests' || safeRole).filter(kind => kind !== 'tasks' || staff).map(kind => {
    const meta = READY_MODULE_TYPES[kind];
    const candidates = kind === 'tasks' ? channels : publicChannels;
    const channel = CHANNEL_PREFERENCES[kind].map(key => candidates.find(item => item.key === key)).find(Boolean) || (kind === 'tasks' ? staff : publicChannels[0]);
    const english = template.key === 'diskoko-store-en' ? ENGLISH_MODULES[kind] : null;
    return { key: kind, kind, enabled: false, title: english?.[0] || `${meta.icon} ${meta.label}`, description: english?.[2] || (kind === 'faq' ? 'اضغط الزر لعرض الإجابة السريعة. وإذا احتجت مساعدة إضافية افتح تذكرة الدعم.' : `اضغط الزر لاستخدام ${meta.label}.`), buttonLabel: english?.[1] || meta.action, color: '#8d72e8', channelKey: channel.key, ...(staff ? { reviewChannelKey: staff.key, staffRoleKey: staff.roleKey || template.definition.roles.find(role => ['moderator', 'support'].includes(role.preset))?.key || template.definition.roles[0]?.key } : {}), ...(kind === 'faq' ? { answer: english ? 'Write a clear answer to your most common customer question.' : 'اكتب هنا جوابًا واضحًا لأكثر سؤال يتكرر في مجتمعك.' } : {}), ...(kind === 'interests' ? { roleKey: safeRole.key } : {}), ...(kind === 'events' ? { capacity: 0, startsAt: '' } : {}), ...(meta.form ? { subjectLabel: english ? 'Subject' : READY_MODULE_FIELDS[kind]?.subject || 'الموضوع', detailsLabel: english ? 'Details or link' : READY_MODULE_FIELDS[kind]?.details || 'التفاصيل' } : {}) };
  });
}

// New intake tools reuse registered review workflows, preserving their own kind and settings.
export const moduleWorkflow = kind => READY_MODULE_TYPES[kind]?.workflow || kind;
