const ticketRequest = text => /(?:لوحة|نظام|زر|بطاقة)\s*(?:ال)?(?:دعم|تذاكر|تيكت)|(?:فتح|إنشاء|انشاء)\s*(?:تذكرة|تيكت)|\b(?:support|ticket|helpdesk)\s+(?:panel|system|card)|\b(?:panel|system|card)\s+(?:for\s+)?(?:support|tickets?)|\bopen\s+(?:a\s+)?ticket\b/i.test(text);
const textOnly = text => /(?:نص|صياغة|وصف)[^\n]{0,60}?(?:فقط|بس)|(?:لا|بدون)\s*(?:تنفيذ|نشر|زر|تذاكر)|\b(?:text|wording|copy)\s+only\b|\bwithout\s+(?:publishing|execution|buttons|tickets)\b/i.test(text);

// A workflow blueprint is advice about several steps, never one Discord message.
export function workflowBlueprintRequest(value) {
  const text = String(value || '');
  return /(?:صمم|صمّم|اقترح|خطط|خطة|تصميم|كيف|طريقة|رتب|رتّب|ابن|جهز|سو[يّي])[^\n]{0,120}(?:رحلة|تجربة|مسار|خطوات|استراتيجية|خطة|قياس|تهيئة|انضمام)|(?:رحلة|تجربة|مسار)\s+(?:العضو|الأعضاء|المستخدم|العميل|الجدد|الجديد)/i.test(text)
    && !/(?:اكتب|صغ|انشر|أرسل|ارسل)\s+(?:رسالة|إعلان|اعلان|نص)/i.test(text);
}

export function ideaSelectionRequest(value) {
  const text = String(value || '');
  return /(?:اقترح|اعطني|أعطني|هات|ولد|ولّد|قدم|قدّم)[^\n]{0,90}(?:أفكار|افكار|اقتراحات|مبادرات|أنشطة|انشطة|فعاليات)|(?:أفكار|افكار)\s+(?:عملية|لتنشيط|لزيادة|لتحسين)/i.test(text);
}

export function editablePanelRequest(value) {
  const text=String(value || '').replace(/[«“"][^»”"]*[»”"]/g,'');
  if (/^\s*(?:how|why|what|explain|compare|كيف|ليش|لماذا|ما الفرق|اشرح)/i.test(text) || planningRequest(text)) return false;
  return /\b(?:create|build|make|prepare|design|want|need)\b|(?:أريد|اريد|أبغى|ابغى|جهز|صمم|صمّم|سوي|سوّي|أنشئ|انشئ)/i.test(text)
    && /\b(?:panel|card|welcome|poll|giveaway|announcement|rules)\b|(?:لوحة|بطاقة|ترحيب|استطلاع|تصويت|جيف|إعلان|اعلان|قوانين)/i.test(text);
}

export const planningRequest = value => workflowBlueprintRequest(value) || ideaSelectionRequest(value);

export function unsupportedAutomationRequest(context) {
  const users = [...context].reverse().filter(item => item.role === 'user').map(item => String(item.content || ''));
  const latest = users.find(text => !/^(?:نعم|ايه|أيوه|يلا|نفذ|انشر|تمام|موافق)[\s.!؟]*$/i.test(text.trim())) || users[0] || '';
  const creation = /(?:أنشئ|انشئ|ابن|جهز|سوي|اصنع|ركب|شغل|أبغى|ابغى)\s*(?:لي\s*)?(?:بوت|لعبة)(?:\s|$)/i.test(latest);
  if (creation || /\b(?:create|build|make|host|run)\b.{0,35}\b(?:standalone\s+bot|new\s+bot|game|music\s+bot)\b/i.test(latest)) return true;
  if (/(?:لوحة|بطاقة|استطلاع|ترحيب|قوانين|تصويت|إعلان|اعلان|فعالية)/.test(latest) && /(?:باستخدام|بواسطة|عبر|ببوت|البوت\s+(?:المختار|الحالي)|بوتي)/.test(latest)) return false;
  return /بوت\s+(?:خاص|مستقل|موسيقى|ألعاب|العاب)/i.test(latest);
}

export function alignAiProposalWithIntent(parsed, context) {
  if (!parsed || parsed.executeNow !== true) return parsed;
  const recentUsers = [...context].reverse().filter(item => item.role === 'user');
  if (planningRequest(recentUsers[0]?.content)) return { ...parsed, executeNow: false, operations: [], message: null, interactive: null };
  const latest = String(recentUsers[0]?.content || '');
  if (!ticketRequest(latest) && /(?:استطلاع|تصويت|ترحيب|قوانين|قانون|جيف|giveaway|فعالية|فعاليات|حدث|إعلان|اعلان|\bpoll\b|\bwelcome\b|\brules\b|\bevent\b|\bannouncement\b)/i.test(latest)) return parsed;
  if (parsed.interactive && Array.isArray(parsed.operations) && parsed.operations.length) {
    const requestedStructure = recentUsers.some(item => /(?:أنشئ|انشئ|سوي|جهز|ابن|أضف|اضف)\s*(?:لي\s*)?(?:قناة|روم|تصنيف|رتبة)|(?:قناة|روم|تصنيف|رتبة)\s+جديد/i.test(String(item.content || '')));
    if (!requestedStructure) parsed = { ...parsed, operations: [] };
  }
  const intent = recentUsers.slice(0, 4).find(item => ticketRequest(String(item.content || '')));
  if (!intent || textOnly(String(intent.content || ''))) return parsed;
  if (parsed.interactive?.kind === 'tickets') return { ...parsed, message: null };
  // A visual model can confuse the appearance of welcome/support cards.
  // An explicit support request must keep the real ticket workflow, even if
  // the generated draft chose another interactive kind.
  if (!parsed.interactive && !parsed.message) return parsed;
  if (parsed.interactive) {
    const source = parsed.interactive;
    return { ...parsed, message: null, interactive: {
      kind: 'tickets', channel: String(source.channel || 'الدعم'),
      title: source.title || 'خدمة العملاء',
      description: source.description || 'تحتاج مساعدة؟ اضغط الزر لفتح تذكرة خاصة، وسيتابع معك فريق الدعم.',
      ...Object.fromEntries(['referenceOnly','color','imagePosition','buttonLabel','buttonStyle','links'].filter(key => key in source).map(key => [key, source[key]])),
    } };
  }
  const channelName = String(parsed.message.channel || '').replace(/^#/, '').trim();
  const titleMatch = String(intent.content).match(/بعنوان\s+["«]?([^\n،.\"»]{2,80})/i);
  const title = titleMatch?.[1]?.trim() || 'خدمة العملاء';
  const description = 'تحتاج مساعدة؟ اضغط الزر لفتح تذكرة خاصة، وسيتابع معك فريق الدعم.';
  return { ...parsed, message: null, interactive: { kind: 'tickets', title, description, channel: channelName || 'الدعم' } };
}
