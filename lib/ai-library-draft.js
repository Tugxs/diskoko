const englishServerRules=['Respect all members and communicate politely.','Avoid spam and unwanted mentions.','Post content in the appropriate channel.','Ask staff before advertising.','Respect privacy and do not share personal information.','Follow staff guidance and report issues through support.'];
import { responseLanguage } from './ai-language.js';
const placeholder = value => /\[[^\]]+\]/.test(String(value || ''));

export function cleanLibraryValue(value) {
  const text = String(value || '').trim();
  return placeholder(text) ? '' : text;
}

export function incompleteLibraryValue(value) {
  const text = String(value || '').trim();
  return !text || /\[[^\]]+\](?!\(https?:\/\/)/.test(text) || /^(?:اختر|أدخل|ادخل|اكتب|حدد)\s+(?:القناة|العنوان|النص|الوصف|الجائزة|السؤال|الخيار|المدة)/i.test(text);
}

export function validatedAiImage(image) {
  if (!image) return null;
  const mime = String(image.mime || '');
  const base64 = String(image.base64 || '');
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime) || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length > 470000) throw Object.assign(new Error('الصورة غير صالحة أو كبيرة جدًا.'), { status: 400 });
  const bytes = Buffer.from(base64, 'base64');
  const valid = mime === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 : mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!valid || bytes.length > 350000) throw Object.assign(new Error('نوع الصورة أو حجمها غير صالح.'), { status: 400 });
  return { mime, base64 };
}

export function validatedAiMedia(media) {
  if (!media) return null;
  const mime = String(media.mime || '');
  const base64 = String(media.base64 || '');
  if (!['image/gif', 'video/mp4', 'video/quicktime'].includes(mime) || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length > 28_000_000) throw Object.assign(new Error('الملف المتحرك غير صالح أو يتجاوز 20 ميجابايت.'), { status: 400 });
  const bytes = Buffer.from(base64, 'base64');
  const signature = bytes.toString('ascii', 0, 6);
  const valid = mime === 'image/gif' ? ['GIF87a', 'GIF89a'].includes(signature) : bytes.toString('ascii', 4, 8) === 'ftyp';
  if (!valid || !bytes.length || bytes.length > 20 * 1024 * 1024) throw Object.assign(new Error('نوع GIF أو الفيديو غير صالح، أو حجمه يتجاوز 20 ميجابايت.'), { status: 400 });
  return { mime, base64 };
}

function defaultMessage(title,english=false) {
  if(english)return '📣 **Community announcement**\nWrite the details you want to share with your community.';
  const messages = {
    'إعلان مع صورة': '📣 **إعلان لمجتمعنا**\nلدينا خبر جديد نشارككم به. تابعوا هذه القناة للتفاصيل، ويسعدنا سماع آرائكم.',
  };
  return messages[title] || '📣 **رسالة جديدة**\nاكتب التفاصيل التي تريد مشاركتها مع أعضاء مجتمعك.';
}

// The library describes a task; unanswered fields belong in its review card, not in a Discord post.
export function libraryDraftProposal({ mode, category, title, prompt }) {
  if(mode==='module') {
    const template=readyAiModule(String(category || ''),String(title || ''));
    if(!template)return null;
    const english=responseLanguage(prompt)==='en';
    const meta=READY_MODULE_TYPES[template.moduleKind],fields=READY_MODULE_FIELDS[template.moduleKind];
    const actions={interests:'Choose role',suggestions:'Suggest an idea',reports:'Send private report',events:'Register',applications:'Apply',faq:'Show answer',submissions:'Submit your work',orders:'Start an order',learning:'Record progress',tasks:'Add task'};
    const englishFields={suggestions:['Suggestion title','Idea and its benefit'],reports:['Report subject','What happened and where?'],applications:['Role you are applying for','Experience and motivation'],submissions:['Submission title','Description and work link'],orders:['Product or service','Quantity and requirements'],learning:['Lesson or assignment','Progress and help needed'],tasks:['Task title','Requirements, owner and deadline']};
    const interactive=moduleDraft({kind:'module',moduleKind:template.moduleKind,title:english?template.titleEn:template.title,description:english?template.promptEn:template.prompt,buttonLabel:english?actions[template.moduleKind]:meta.action,...(meta.form?{subjectLabel:english?englishFields[template.moduleKind][0]:fields.subject,detailsLabel:english?englishFields[template.moduleKind][1]:fields.details}:{})});
    return {operations:[],message:null,interactive,review_request:prompt,draft:true};
  }
  if (mode !== 'execute') return null;
  const template = readyAiTemplate(String(category || ''), String(title || ''));
  if (!template) return null;
  const name = template.title;
  const channel = cleanLibraryValue(String(prompt).match(/في\s+(?:قناة\s+)?#?([^\s،.]+)/u)?.[1] || String(prompt).match(/\bin\s+#([^\s,.]+)/i)?.[1] || '');
  const namedTitle = cleanLibraryValue(String(prompt).match(/بعنوان\s+([^\n،.]{2,100})/u)?.[1] || String(prompt).match(/\b(?:title|titled)\s+["“]?([^\n,"”]{2,100})/i)?.[1] || '');
  const english=responseLanguage(prompt)==='en';
  let interactive = null;
  if (template.kind === 'giveaway') interactive = { kind: 'giveaway', prize: cleanLibraryValue(String(prompt).match(/لجائزة\s+([^\n،.]+?)(?=\s+لمدة|\s+في\s+#|،|\.|$)/u)?.[1] || ''), channel, durationMinutes: '', winnerCount: 1 };
  else if (template.kind === 'tickets') interactive = { kind: 'tickets', title: namedTitle, description: cleanLibraryValue(String(prompt).match(/وصفها\s+([^\n.]+)/u)?.[1] || String(prompt).match(/\bdescription\s+["“]?([^\n."”]+)/i)?.[1] || ''), channel };
  else if (template.kind === 'poll') interactive = { kind: 'poll', question: cleanLibraryValue(String(prompt).match(/عن\s+([^\n،.]+?)(?=\s+بخيارات|$)/u)?.[1] || ''), channel, options: ['', ''] };
  else if (template.kind === 'event') interactive = { kind: 'event', title: namedTitle || '', description: english?'Join our community event. Register using the button if registration is enabled.':'انضم إلينا في فعالية مجتمعنا. سجّل مشاركتك من الزر إذا كان التسجيل متاحًا.', channel };
  else if (template.kind === 'scheduled_event') interactive = { kind: 'scheduled_event', title: cleanLibraryValue(String(prompt).match(/بعنوان\s+([^،.]+)/u)?.[1] || ''), description: '' };
  else if (template.kind === 'welcome') interactive = { kind: 'welcome', title: namedTitle || (english?'Welcome {name}!':'👋 أهلًا بك في مجتمعنا!'), description: english?'Welcome {member}! Please read the rules and introduce yourself.':'مرحبًا {member}، سعداء بانضمامك إلينا. اطلع على القوانين وعرّفنا بنفسك!', channel };
  else if (template.kind === 'rules') interactive = { kind: 'rules', title: namedTitle || (english?'📜 Server rules':'📜 قوانين السيرفر'), description: english?'Read these rules to keep our community safe and welcoming.':'أهلًا بك! اقرأ القوانين التالية لتحافظ على بيئة ممتعة وآمنة للجميع.', rules: (english?englishServerRules:defaultServerRules).map(body => ({ title: '', body })), singleText: (english?englishServerRules:defaultServerRules).join('\n\n'), style: 'single', channel };
  else if (template.kind === 'channel_control') interactive = { kind: 'channel_control', channel, mode: 'locked', roleIds: [] };
  if (interactive) return { operations: [], message: null, interactive, review_request: prompt, draft: true };
  if (template.kind === 'message') return { operations: [], message: { channel, content: defaultMessage(name,english) }, review_request: prompt, draft: true };
  return null;
}
import { readyAiTemplate, readyAiModule } from '../ai-library-catalog.js';
import { READY_MODULE_TYPES, READY_MODULE_FIELDS } from './ready-template-module-types.js';
import { moduleDraft } from './ai-module-draft.js';
import { defaultServerRules } from './rules-card.js';
