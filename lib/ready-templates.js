import { PermissionFlagsBits } from 'discord.js';
import { problem } from './workspace-domain.js';
import { READY_MODULE_TYPES, defaultReadyModules } from './ready-template-module-types.js';

const P = PermissionFlagsBits;
const ROLE_PRESETS = {
  member: { label: 'عضو', permissions: '0', description: 'عضوية عادية بلا صلاحيات إدارية.' },
  vip: { label: 'مميز', permissions: '0', description: 'تمييز بصري، دون صلاحيات إدارية.' },
  support: { label: 'الدعم', permissions: String(P.ViewChannel | P.ReadMessageHistory | P.SendMessages | P.ManageThreads), description: 'الرد على الأعضاء وإدارة نقاشات الدعم؛ لا يمنح إدارة السيرفر.' },
  moderator: { label: 'مشرف', permissions: String(P.ManageMessages | P.ModerateMembers | P.ViewAuditLog), description: 'الإشراف على الرسائل والأعضاء والاطلاع على السجل؛ لا يمنح Administrator.' },
};
const SAFE_ROLE_BITS = Object.values(ROLE_PRESETS).reduce((bits, role) => bits | BigInt(role.permissions), 0n);

const source = 'https://discordtemplates.me/templates/838410903622778881';
export const READY_TEMPLATES = [{
  key: 'server-my-arabic', name: 'Diskoko Server My Arabic', icon: '🌙', language: 'ar-en',
  description: 'مجتمع عربي بقنوات ترحيب وإدارة ودعم وألعاب، مستوحى من القالب الذي اخترته مع صلاحيات محافظة قابلة للتعديل.',
  source,
  definition: {
    name: 'Diskoko Server My Arabic',
    roles: [
      { key: 'member', name: 'عضو', preset: 'member', color: 0x99aab5 },
      { key: 'vip', name: 'VIP', preset: 'vip', color: 0xffc857 },
      { key: 'support', name: 'الدعم الفني', preset: 'support', color: 0x50c5b7 },
      { key: 'moderator', name: 'مشرف', preset: 'moderator', color: 0x8d72e8 },
    ],
    categories: [
      { key: 'info', name: '▬▬▬▬ 𝐈𝐍𝐅𝐎 ▬▬▬▬', channels: [
        { key: 'welcome', name: '『💎』الترحيب', type: 0, access: 'read_only', topic: 'استقبال الأعضاء الجدد' },
        { key: 'rules', name: '『📚』القوانين', type: 0, access: 'read_only', topic: 'قوانين المجتمع وتوجيهاته' },
        { key: 'about', name: '〘・مـن-・حـنـا・〙', type: 0, access: 'read_only', topic: 'تعرف إلى المجتمع' },
      ] },
      { key: 'community', name: '▬▬▬▬ 𝐂𝐎𝐌𝐌𝐔𝐍𝐈𝐓𝐘 ▬▬▬▬', channels: [
        { key: 'general', name: '『🌐』الشات-العام', type: 0 },
        { key: 'announcements', name: '『👑』الاعلانات', type: 0, access: 'read_only' },
        { key: 'suggestions', name: '『✍』اقتراحاتكم', type: 0 },
        { key: 'questions', name: '『❓』الاستفسارات', type: 0 },
        { key: 'memes', name: '『😂』ميمز', type: 0 },
        { key: 'media', name: '『🎬』المقاطع-والتصاميم', type: 0 },
      ] },
      { key: 'support', name: '▬▬▬▬ 𝐒𝐔𝐏𝐏𝐎𝐑𝐓 ▬▬▬▬', channels: [
        { key: 'ticket', name: '『🔧』فتح-تكت', type: 0, access: 'read_only' },
        { key: 'support-chat', name: 'شات-الدعم-الفني', type: 0 },
        { key: 'support-voice', name: '𝐒𝐔𝐏𝐏𝐎𝐑𝐓 𝐕𝐎𝐈𝐂𝐄', type: 2 },
      ] },
      { key: 'voice', name: '▬▬▬▬ 𝐕𝐎𝐈𝐂𝐄 ▬▬▬▬', channels: [
        { key: 'voice-1', name: '« 𝐕𝐎𝐈𝐂𝐄 𝐂𝐇𝐀𝐓 »', type: 2 },
        { key: 'music', name: '♬ 𝐌𝐔𝐒𝐈𝐂 ♬', type: 2 },
        { key: 'afk', name: '«💤» 𝐀𝐅𝐊', type: 2 },
      ] },
      { key: 'games', name: '▬▬▬▬ 𝐆𝐀𝐌𝐄𝐒 ▬▬▬▬', channels: [
        { key: 'gta', name: 'grand-theft-auto', type: 2 },
        { key: 'fortnite-duos', name: '« 𝐃𝐔𝐎𝐒 »', type: 2 },
        { key: 'fortnite-squad', name: '« 𝐒𝐐𝐔𝐀𝐃 »', type: 2 },
      ] },
      { key: 'vip', name: '▬▬▬▬ 𝐏𝐑𝐈𝐕𝐀𝐓𝐄 ▬▬▬▬', channels: [
        { key: 'vip-chat', name: '『🔒』شات-خاص', type: 0, access: 'private', roleKey: 'vip' },
        { key: 'vip-voice', name: '« 𝐏𝐑𝐈𝐕𝐀𝐓𝐄 𝐑𝐎𝐎𝐌 »', type: 2, access: 'private', roleKey: 'vip' },
      ] },
      { key: 'staff', name: '▬▬ 𝐀𝐃𝐌𝐈𝐍𝐒𝐓𝐑𝐀𝐓𝐈𝐎𝐍 ▬▬', channels: [
        { key: 'staff-chat', name: '『📝』شات-الادارة', type: 0, access: 'private', roleKey: 'moderator' },
        { key: 'logs', name: '『🔒』اللوق', type: 0, access: 'private', roleKey: 'moderator' },
        { key: 'staff-voice', name: '« 𝐀𝐃𝐌𝐈𝐍 »', type: 2, access: 'private', roleKey: 'moderator' },
      ] },
    ],
    features: { welcome: { enabled: true, title: '👋 أهلًا بك في مجتمعنا!', description: 'مرحبًا {member}، سعداء بانضمامك إلينا. اطلع على القوانين وعرّفنا بنفسك!', color: '#8d72e8', channelKey: 'welcome' }, ticket: { enabled: true, title: '🛟 مركز الدعم', description: 'تحتاج مساعدة؟ افتح تذكرة وسيتواصل معك فريق الدعم.', channelKey: 'ticket', staffRoleKey: 'support' }, logs: { enabled: true, channelKey: 'logs' } },
  },
}, {
  key: 'streamer-community', name: 'Diskoko Streamer Community', icon: '🔴', language: 'ar-en', category: 'streamer',
  description: 'مجتمع ثنائي اللغة لصانع محتوى على أي منصة، بمساحة بث ومقاطع ومشتركين ودعم وسجلات واضحة.',
  source: 'https://xenon.bot/templates/Z5dbJ2mvxRbG',
  optionalIntegrations: ['تنبيهات البث والمشتركين لا تعمل تلقائيًا حتى تربط منصتك لاحقًا.'],
  definition: {
    name: 'Diskoko Streamer Community',
    roles: [
      { key: 'streamer', name: '🔴 Creator | صانع المحتوى', preset: 'vip', color: 0xe54565 },
      { key: 'moderator', name: '🛡️ Moderator | مشرف', preset: 'moderator', color: 0x58bcd7 },
      { key: 'support', name: '🛟 Support | الدعم', preset: 'support', color: 0x65c4aa },
      { key: 'subscriber', name: '💎 Subscriber | مشترك', preset: 'vip', color: 0x9c73eb },
      { key: 'member', name: '⭐ Member | عضو', preset: 'member', color: 0x99aab5 },
    ],
    categories: [
      { key: 'start', name: '✨・START | البداية', channels: [
        { key: 'welcome', name: '👋・welcome-ترحيب', type: 0, access: 'read_only', topic: 'ابدأ هنا وتعرّف على المجتمع | Start here' },
        { key: 'rules', name: '📜・rules-القوانين', type: 0, access: 'read_only', topic: 'قواعد المشاركة والبث | Community rules' },
        { key: 'announcements', name: '📢・news-الأخبار', type: 0, access: 'read_only', postRoleKey: 'streamer', topic: 'الإعلانات الرسمية من صانع المحتوى' },
      ] },
      { key: 'content', name: '🔴・LIVE & CONTENT | البث', channels: [
        { key: 'live', name: '🔴・live-البث', type: 0, access: 'read_only', postRoleKey: 'streamer', topic: 'ضع رابط البث يدويًا؛ التنبيهات الآلية تحتاج ربطًا لاحقًا' },
        { key: 'schedule', name: '🗓️・schedule-الجدول', type: 0, access: 'read_only', postRoleKey: 'streamer', topic: 'مواعيد البث والفيديوهات القادمة' },
        { key: 'videos', name: '📺・videos-الفيديوهات', type: 0, access: 'read_only', postRoleKey: 'streamer', topic: 'روابط الفيديوهات الجديدة' },
        { key: 'clips', name: '🎬・clips-اللقطات', type: 0, topic: 'أفضل لقطات المجتمع' },
      ] },
      { key: 'community', name: '💬・COMMUNITY | المجتمع', channels: [
        { key: 'general', name: '💬・chat-الدردشة', type: 0, topic: 'حديث المجتمع اليومي' },
        { key: 'introductions', name: '🙋・introduce-نفسك', type: 0, topic: 'عرّفنا بنفسك وما تتابعه' },
        { key: 'suggestions', name: '💡・ideas-اقتراحات', type: 0, topic: 'اقترح محتوى أو تطويرًا للمجتمع' },
        { key: 'gallery', name: '📸・gallery-مشاركات', type: 0, topic: 'تصاميم وصور المجتمع' },
      ] },
      { key: 'subscribers', name: '💎・SUBSCRIBERS | المشتركين', channels: [
        { key: 'subscriber-chat', name: '💎・subscriber-chat', type: 0, access: 'private', roleKey: 'subscriber', topic: 'نقاش المشتركين الخاص' },
        { key: 'subscriber-voice', name: '🎙️・subscriber-voice', type: 2, access: 'private', roleKey: 'subscriber' },
      ] },
      { key: 'voice', name: '🔊・VOICE | الصوت', channels: [
        { key: 'voice-general', name: '🔊・community-voice', type: 2 },
        { key: 'watch-party', name: '🍿・watch-party', type: 2 },
        { key: 'gaming', name: '🎮・gaming', type: 2 },
        { key: 'afk', name: '💤・afk', type: 2 },
      ] },
      { key: 'help', name: '🛟・HELP | المساعدة', channels: [
        { key: 'faq', name: '❔・faq-الأسئلة', type: 0, access: 'read_only', topic: 'الأسئلة المتكررة عن المجتمع والبث' },
        { key: 'ticket', name: '🎫・support-الدعم', type: 0, access: 'read_only', topic: 'افتح تذكرة خاصة مع فريق الدعم' },
      ] },
      { key: 'staff', name: '🛡️・STAFF | الإدارة', channels: [
        { key: 'staff-chat', name: '📝・staff-chat', type: 0, access: 'private', roleKey: 'moderator' },
        { key: 'staff-voice', name: '🎙️・staff-voice', type: 2, access: 'private', roleKey: 'moderator' },
        { key: 'logs', name: '📋・activity-logs', type: 0, access: 'private', roleKey: 'moderator' },
      ] },
    ],
    features: {
      welcome: { enabled: true, title: '👋 أهلًا بك | Welcome', description: 'أهلًا {member}! ابدأ بالقوانين وتعرّف على المجتمع. Welcome! Read the rules and introduce yourself.', color: '#9c73eb', channelKey: 'welcome' },
      ticket: { enabled: true, title: '🛟 الدعم | Support', description: 'تحتاج مساعدة خاصة؟ افتح تذكرة وسيرد فريق الدعم. Need help? Open a private ticket.', channelKey: 'ticket', staffRoleKey: 'support', buttonLabel: 'افتح تذكرة | Open ticket', color: '#65c4aa' },
      logs: { enabled: true, mode: 'unified', channelKey: 'logs', events: ['message_update', 'message_delete', 'voice_join', 'voice_leave', 'command'] },
    },
  },
}, {
  key: 'diskoko-gaming-1', name: 'Diskoko Gaming Arabic', icon: '🎮', language: 'ar',
  description: 'مجتمع ألعاب عربي متوسط الحجم: ترحيب، تجمع لاعبين، مشاركة لقطات، غرف صوتية، دعم وسجل نشاط مرتب.',
  definition: {
    name: 'Diskoko Gaming Arabic',
    roles: [
      { key: 'moderator', name: '🛡️ مشرف المجتمع', preset: 'moderator', color: 0x8d72e8 },
      { key: 'support', name: '🛟 فريق الدعم', preset: 'support', color: 0x44c7bf },
      { key: 'captain', name: '🏆 قائد فريق', preset: 'vip', color: 0xf4b942 },
      { key: 'gamer', name: '🎮 لاعب', preset: 'member', color: 0x61a7ef },
      { key: 'newcomer', name: '🌱 لاعب جديد', preset: 'member', color: 0x96ad9f },
    ],
    categories: [
      { key: 'start', name: '✦・البداية', channels: [
        { key: 'welcome', name: '👋・الترحيب', type: 0, access: 'read_only', topic: 'أهلًا بكل لاعب جديد في المجتمع' },
        { key: 'rules', name: '📜・القوانين', type: 0, access: 'read_only', topic: 'احترام اللاعبين، منع الإساءة والغش، وتنظيم اللعب' },
        { key: 'announcements', name: '📣・الإعلانات', type: 0, access: 'read_only', topic: 'أخبار المجتمع والمواعيد المهمة' },
      ] },
      { key: 'community', name: '💬・المجتمع', channels: [
        { key: 'general', name: '💬・الشات-العام', type: 0, topic: 'دردشة اللاعبين اليومية' },
        { key: 'introductions', name: '🙌・عرف-بنفسك', type: 0, topic: 'اسمك والألعاب التي تحبها' },
        { key: 'clips', name: '🎬・لقطات-اللعب', type: 0, topic: 'أفضل المقاطع واللحظات من ألعابك' },
        { key: 'memes', name: '😂・ميمز-الألعاب', type: 0, topic: 'ميمز خفيفة مرتبطة بالألعاب' },
      ] },
      { key: 'gaming', name: '🎮・منطقة اللعب', channels: [
        { key: 'looking-for-team', name: '🔎・ابحث-عن-فريق', type: 0, topic: 'اذكر اللعبة والمنصة والوقت المناسب لك' },
        { key: 'game-chat', name: '🕹️・نقاش-الألعاب', type: 0, topic: 'تجاربك ونصائحك عن الألعاب' },
        { key: 'results', name: '🏅・إنجازاتكم', type: 0, topic: 'شارك إنجازاتك ونتائج فريقك' },
        { key: 'events', name: '🏁・الفعاليات', type: 0, access: 'read_only', topic: 'إعلانات البطولات والفعاليات بعد إعدادها' },
      ] },
      { key: 'voice', name: '🔊・الغرف الصوتية', channels: [
        { key: 'lobby', name: '🔊・التجمع', type: 2 },
        { key: 'duo', name: '🎧・ثنائي', type: 2 },
        { key: 'squad', name: '🎙️・سكواد', type: 2 },
        { key: 'captains', name: '🏆・القادة', type: 2, access: 'private', roleKey: 'captain' },
        { key: 'afk', name: '💤・بعيد-عن-الجهاز', type: 2 },
      ] },
      { key: 'help', name: '🛟・المساعدة', channels: [
        { key: 'help-guide', name: '❔・الأسئلة-الشائعة', type: 0, access: 'read_only', topic: 'ضع هنا إجابات الأسئلة المتكررة عن مجتمعك' },
        { key: 'ticket', name: '🎫・افتح-تذكرة', type: 0, access: 'read_only', topic: 'اضغط زر الدعم لطلب المساعدة من الفريق' },
      ] },
      { key: 'staff', name: '🛡️・الإدارة', channels: [
        { key: 'staff-chat', name: '📝・شات-الإدارة', type: 0, access: 'private', roleKey: 'moderator' },
        { key: 'logs', name: '📋・سجل-النشاط', type: 0, access: 'private', roleKey: 'moderator' },
      ] },
    ],
    features: {
      welcome: { enabled: true, title: '🎮 أهلًا بك في ساحة اللعب!', description: 'يا هلا {member}! اقرأ القوانين، عرّفنا بنفسك، وابحث عن فريقك في 🔎・ابحث-عن-فريق. نتمنى لك لعبًا ممتعًا!', color: '#7067dc', channelKey: 'welcome', avatarPosition: 'right' },
      ticket: { enabled: true, title: '🛟 تحتاج مساعدة؟', description: 'عندك مشكلة في السيرفر أو تحتاج مساعدة من الفريق؟ اضغط الزر وافتح تذكرة خاصة.', channelKey: 'ticket', staffRoleKey: 'support', buttonLabel: '🎫 افتح تذكرة دعم', color: '#44c7bf' },
      logs: { enabled: true, mode: 'unified', channelKey: 'logs', events: ['message_create', 'message_update', 'message_delete', 'voice_join', 'voice_leave', 'command'] },
    },
  },
}, {
  key: 'diskoko-streamer', name: 'Diskoko Streamer', icon: '🎥', language: 'ar',
  description: 'سيرفر متوسط لصانع محتوى: إعلان البث، جدول المواعيد، المقاطع، مساحة للمشتركين، دعم وإدارة؛ بلا اعتماد تلقائي على منصة بث خارجية.',
  definition: {
    name: 'Diskoko Streamer',
    roles: [
      { key: 'streamer', name: '🎥 صانع المحتوى', preset: 'vip', color: 0xf06487 },
      { key: 'moderator', name: '🛡️ مشرف', preset: 'moderator', color: 0x8d72e8 },
      { key: 'support', name: '🛟 فريق الدعم', preset: 'support', color: 0x48c7bf },
      { key: 'subscriber', name: '💎 مشترك مميز', preset: 'vip', color: 0xe6b64b },
      { key: 'viewer', name: '⭐ متابع', preset: 'member', color: 0x7ca9dc },
    ],
    categories: [
      { key: 'start', name: '✨・ابدأ-هنا', channels: [
        { key: 'welcome', name: '👋・الترحيب', type: 0, access: 'read_only', topic: 'استقبال المتابعين الجدد' },
        { key: 'rules', name: '📜・القوانين', type: 0, access: 'read_only', topic: 'احترام الجميع، منع السبام وحرق المحتوى' },
        { key: 'announcements', name: '📢・الإعلانات', type: 0, access: 'read_only', postRoleKey: 'streamer', topic: 'أخبار صانع المحتوى والمجتمع' },
      ] },
      { key: 'broadcast', name: '🔴・البث-والمحتوى', channels: [
        { key: 'live', name: '🔴・على-البث', type: 0, access: 'read_only', postRoleKey: 'streamer', topic: 'إعلان البث المباشر ورابطه؛ تُنشر الإعلانات يدويًا أو بعد إعداد ربط خارجي' },
        { key: 'schedule', name: '🗓️・جدول-البث', type: 0, access: 'read_only', postRoleKey: 'streamer', topic: 'مواعيد البث القادمة والتغييرات' },
        { key: 'clips', name: '🎬・أفضل-اللقطات', type: 0, topic: 'شارك لقطاتك المفضلة مع المجتمع' },
        { key: 'videos', name: '📺・الفيديوهات', type: 0, access: 'read_only', postRoleKey: 'streamer', topic: 'روابط المقاطع والفيديوهات الجديدة' },
      ] },
      { key: 'community', name: '💬・المجتمع', channels: [
        { key: 'general', name: '💬・الشات-العام', type: 0, topic: 'دردشة المتابعين اليومية' },
        { key: 'suggestions', name: '💡・اقتراحات-المحتوى', type: 0, topic: 'أفكار للبث والحلقات القادمة' },
        { key: 'setups', name: '🖥️・إعداداتكم', type: 0, topic: 'شارك مساحة اللعب أو التصوير وأجهزتك' },
        { key: 'commands', name: '🤖・أوامر-البوت', type: 0, topic: 'استخدم أوامر البوت المتاحة للسيرفر' },
      ] },
      { key: 'subscribers', name: '💎・المشتركون', channels: [
        { key: 'subscriber-chat', name: '💎・شات-المشتركين', type: 0, access: 'private', roleKey: 'subscriber', topic: 'جلسة خاصة لأصحاب رتبة المشترك المميز' },
        { key: 'subscriber-voice', name: '🎙️・صوت-المشتركين', type: 2, access: 'private', roleKey: 'subscriber' },
      ] },
      { key: 'voice', name: '🔊・الغرف-الصوتية', channels: [
        { key: 'lobby', name: '🔊・تجمع-المتابعين', type: 2 },
        { key: 'gaming', name: '🎮・لعب-مع-المتابعين', type: 2 },
        { key: 'afk', name: '💤・بعيد-عن-الجهاز', type: 2 },
      ] },
      { key: 'help', name: '🛟・المساعدة', channels: [
        { key: 'faq', name: '❔・الأسئلة-الشائعة', type: 0, access: 'read_only', topic: 'ضع هنا روابطك وإجابات الأسئلة المتكررة' },
        { key: 'ticket', name: '🎫・فتح-تذكرة', type: 0, access: 'read_only', topic: 'افتح تذكرة خاصة للتواصل مع فريق الدعم' },
      ] },
      { key: 'staff', name: '🛡️・فريق-السيرفر', channels: [
        { key: 'creator-studio', name: '🎥・استديو-صانع-المحتوى', type: 0, access: 'private', roleKey: 'streamer', topic: 'تجهيز الأفكار والمواد قبل نشرها' },
        { key: 'staff-chat', name: '📝・شات-الإدارة', type: 0, access: 'private', roleKey: 'moderator' },
        { key: 'logs', name: '📋・سجل-النشاط', type: 0, access: 'private', roleKey: 'moderator' },
      ] },
    ],
    features: {
      welcome: { enabled: true, title: '🎥 أهلًا بك في مجتمع البث!', description: 'يا هلا {member}! تابع أخبار البث في 🔴・على-البث، وشاركنا رأيك ولقطاتك. نورتنا!', color: '#d967a4', channelKey: 'welcome', avatarPosition: 'right' },
      ticket: { enabled: true, title: '🛟 تواصل مع فريق السيرفر', description: 'عندك استفسار أو مشكلة؟ افتح تذكرة خاصة وسيساعدك الفريق.', channelKey: 'ticket', staffRoleKey: 'support', buttonLabel: '🎫 تواصل مع الدعم', color: '#48c7bf' },
      logs: { enabled: true, mode: 'unified', channelKey: 'logs', events: ['message_create', 'message_update', 'message_delete', 'voice_join', 'voice_leave', 'command'] },
    },
  },
}];
// Optional integrations describe future setup; installing a template never activates them.
const storeCategories = (english = false) => english ? [
  { key: 'start', name: '🛍️・START HERE', channels: [
    { key: 'welcome', name: '👋・welcome', type: 0, access: 'read_only' },
    { key: 'rules', name: '📜・store-policies', type: 0, access: 'read_only', topic: 'Add your store policies before opening.' },
    { key: 'announcements', name: '📢・announcements', type: 0, access: 'read_only', postRoleKey: 'owner' },
  ] },
  { key: 'catalog', name: '📦・CATALOG', channels: [
    { key: 'products', name: '🛍️・products', type: 0, access: 'read_only', postRoleKey: 'owner' },
    { key: 'offers', name: '🏷️・offers', type: 0, access: 'read_only', postRoleKey: 'owner' },
    { key: 'order-updates', name: '📬・service-updates', type: 0, access: 'read_only', postRoleKey: 'staff', topic: 'General store and delivery updates only. Never post a customer order or personal details here.' },
    { key: 'faq', name: '❔・faq', type: 0, access: 'read_only' },
  ] },
  { key: 'help', name: '🎫・CUSTOMER CARE', channels: [
    { key: 'order-help', name: '🎫・order-support', type: 0, access: 'read_only' },
    { key: 'reviews', name: '⭐・reviews', type: 0, topic: 'Share product feedback without order numbers or personal details. Contact support privately for an order issue.' },
    { key: 'questions', name: '💬・questions', type: 0 },
    { key: 'customer-gallery', name: '📸・customer-gallery', type: 0 },
  ] },
  { key: 'team', name: '🔒・STORE TEAM', channels: [
    { key: 'staff', name: '🧾・staff-desk', type: 0, access: 'private', roleKey: 'staff' },
    { key: 'staff-voice', name: '🎙️・staff-voice', type: 2, access: 'private', roleKey: 'staff' },
    { key: 'logs', name: '📋・activity-logs', type: 0, access: 'private', roleKey: 'staff' },
  ] },
] : [
  { key: 'start', name: '🛍️・ابدأ-هنا', channels: [
    { key: 'welcome', name: '👋・الترحيب', type: 0, access: 'read_only' },
    { key: 'rules', name: '📜・سياسات-المتجر', type: 0, access: 'read_only', topic: 'أضف سياسات متجرك قبل استقبال العملاء.' },
    { key: 'announcements', name: '📢・الإعلانات', type: 0, access: 'read_only', postRoleKey: 'owner' },
  ] },
  { key: 'catalog', name: '📦・الكتالوج', channels: [
    { key: 'products', name: '🛍️・المنتجات', type: 0, access: 'read_only', postRoleKey: 'owner' },
    { key: 'offers', name: '🏷️・العروض', type: 0, access: 'read_only', postRoleKey: 'owner' },
    { key: 'order-updates', name: '📬・تحديثات-الخدمة', type: 0, access: 'read_only', postRoleKey: 'staff', topic: 'أخبار عامة عن الخدمة والتوصيل فقط. لا تنشر طلب عميل أو بياناته هنا.' },
    { key: 'faq', name: '❔・الأسئلة-الشائعة', type: 0, access: 'read_only' },
  ] },
  { key: 'help', name: '🎫・خدمة-العملاء', channels: [
    { key: 'order-help', name: '🎫・دعم-الطلبات', type: 0, access: 'read_only' },
    { key: 'reviews', name: '⭐・تقييماتكم', type: 0, topic: 'شارك رأيك دون رقم طلب أو بيانات شخصية. مشكلات الطلبات عبر تذكرة خاصة.' },
    { key: 'questions', name: '💬・استفسارات', type: 0 },
    { key: 'customer-gallery', name: '📸・صور-العملاء', type: 0 },
  ] },
  { key: 'team', name: '🔒・فريق-المتجر', channels: [
    { key: 'staff', name: '🧾・متابعة-الفريق', type: 0, access: 'private', roleKey: 'staff' },
    { key: 'staff-voice', name: '🎙️・صوت-الفريق', type: 2, access: 'private', roleKey: 'staff' },
    { key: 'logs', name: '📋・سجل-النشاط', type: 0, access: 'private', roleKey: 'staff' },
  ] },
];
function storeTemplate(english) {
  const categories = storeCategories(english);
  return {
    key: english ? 'diskoko-store-en' : 'diskoko-store-ar', name: english ? 'Diskoko Store English' : 'Diskoko Store Arabic', icon: '🛍️', language: english ? 'en' : 'ar', category: 'store',
    description: english ? 'A focused English storefront with product display, offers, private order help and staff activity logs.' : 'متجر عربي مرتب لعرض المنتجات والعروض ودعم الطلبات الخاص وسجلات فريق العمل.',
    optionalIntegrations: english ? ['Payment gateway: not connected; configure checkout outside this template.', 'Inventory and order status: requires a separate store integration.'] : ['بوابة الدفع: غير مربوطة؛ جهز صفحة الدفع خارج القالب.', 'المخزون وحالة الطلبات: تحتاج ربطًا مستقلًا بالمتجر.'],
    definition: {
      name: english ? 'Diskoko Store English' : 'Diskoko Store Arabic',
      roles: [
        { key: 'owner', name: english ? '👑 Store Owner' : '👑 صاحب المتجر', preset: 'moderator', color: 0xdca94c },
        { key: 'staff', name: english ? '🛟 Customer Care' : '🛟 خدمة العملاء', preset: 'support', color: 0x4dc7b7 },
        { key: 'customer', name: english ? '🛒 Customer' : '🛒 عميل', preset: 'member', color: 0x8aa6d9 },
        { key: 'vip', name: english ? '💎 Returning Customer' : '💎 عميل مميز', preset: 'vip', color: 0xb995e3 },
      ], categories,
      features: {
        welcome: { enabled: true, title: english ? 'Welcome to our store' : 'أهلًا بك في متجرنا', description: english ? 'Welcome {member}! Browse the products and read the store policies before ordering.' : 'أهلًا {member}! تصفح المنتجات واطلع على سياسات المتجر قبل الطلب.', channelKey: 'welcome', color: '#8d72e8' },
        ticket: { enabled: true, title: english ? 'Order support' : 'دعم الطلبات', description: english ? 'Need help with an order? Open a private ticket. Do not post payment information in public channels.' : 'تحتاج مساعدة في طلبك؟ افتح تذكرة خاصة، ولا تشارك بيانات الدفع في القنوات العامة.', channelKey: 'order-help', staffRoleKey: 'staff', buttonLabel: english ? 'Open private ticket' : 'افتح تذكرة خاصة', color: '#4dc7b7' },
        logs: { enabled: true, mode: 'unified', channelKey: 'logs', events: ['message_update', 'message_delete', 'command'] },
      },
    },
  };
}
READY_TEMPLATES.push(storeTemplate(false), storeTemplate(true), {
  key: 'diskoko-community', name: 'Diskoko Community Arabic English', icon: '🌐', language: 'ar-en', category: 'community',
  description: 'مجتمع ثنائي اللغة بمساري دخول ونقاش واضحين، وإعلانات مشتركة ودعم خاص وإشراف منظم.',
  optionalIntegrations: ['الترجمة التلقائية بين القنوات غير مفعّلة؛ تحتاج خدمة ترجمة مستقلة.', 'الفعاليات المجدولة تحتاج إعدادها بعد التنصيب.'],
  definition: {
    name: 'Diskoko Community Arabic English',
    roles: [
      { key: 'moderator', name: '🛡️ Moderator | مشرف', preset: 'moderator', color: 0x8d72e8 },
      { key: 'support', name: '🛟 Support | الدعم', preset: 'support', color: 0x52c4bd },
      { key: 'member', name: '🌐 Member | عضو', preset: 'member', color: 0x84a8dd },
      { key: 'host', name: '🎉 Host | منظم', preset: 'support', color: 0xd8a75d },
    ],
    categories: [
      { key: 'start', name: '✨・START | البداية', channels: [
        { key: 'welcome', name: '👋・welcome-ترحيب', type: 0, access: 'read_only' },
        { key: 'rules', name: '📜・rules-القوانين', type: 0, access: 'read_only' },
        { key: 'announcements', name: '📢・news-الأخبار', type: 0, access: 'read_only', postRoleKey: 'moderator' },
      ] },
      { key: 'arabic', name: '💬・العربية', channels: [
        { key: 'chat-ar', name: '💬・الدردشة-العربية', type: 0 },
        { key: 'ideas-ar', name: '💡・اقتراحات-عربية', type: 0 },
        { key: 'voice-ar', name: '🔊・صوت-عربي', type: 2 },
      ] },
      { key: 'english', name: '💬・ENGLISH', channels: [
        { key: 'chat-en', name: '💬・english-chat', type: 0 },
        { key: 'ideas-en', name: '💡・suggestions', type: 0 },
        { key: 'voice-en', name: '🔊・english-voice', type: 2 },
      ] },
      { key: 'community', name: '🎉・COMMUNITY | المجتمع', channels: [
        { key: 'events', name: '🗓️・events-فعاليات', type: 0, access: 'read_only', postRoleKey: 'host', topic: 'ينشر المنظمون المواعيد المؤكدة بالعربية والإنجليزية.' },
        { key: 'showcase', name: '🎨・showcase-مشاركات', type: 0 },
        { key: 'introductions', name: '🙋・introduce-نفسك', type: 0 },
        { key: 'voice-lounge', name: '🔊・voice-تجمع', type: 2 },
        { key: 'help', name: '🎫・help-مساعدة', type: 0, access: 'read_only' },
      ] },
      { key: 'staff', name: '🔒・STAFF | الإدارة', channels: [
        { key: 'staff-chat', name: '🛡️・staff-chat', type: 0, access: 'private', roleKey: 'moderator' },
        { key: 'logs', name: '📋・activity-logs', type: 0, access: 'private', roleKey: 'moderator' },
      ] },
    ],
    features: {
      welcome: { enabled: true, title: 'أهلًا بك | Welcome', description: 'أهلًا {member}! اقرأ القوانين واختر مسار لغتك. Welcome! Read the rules and join your language channels.', channelKey: 'welcome', color: '#6f8bea' },
      ticket: { enabled: true, title: 'الدعم | Support', description: 'افتح تذكرة خاصة لطلب المساعدة. Open a private ticket for help.', channelKey: 'help', staffRoleKey: 'support', buttonLabel: 'مساعدة | Help', color: '#52c4bd' },
      logs: { enabled: true, mode: 'unified', channelKey: 'logs', events: ['message_update', 'message_delete', 'voice_join', 'voice_leave', 'command'] },
    },
  },
}, {
  key: 'diskoko-esports', name: 'Diskoko Esports', icon: '🏆', language: 'en', category: 'esports',
  description: 'An English esports hub for roster coordination, matches, results, team rooms and moderated applications.',
  optionalIntegrations: ['Tournament brackets and match results are manual until a tournament service is connected.', 'Live game statistics require a separate supported game API.'],
  definition: {
    name: 'Diskoko Esports',
    roles: [
      { key: 'organizer', name: '🏆 Organizer', preset: 'moderator', color: 0xe5b34a },
      { key: 'coach', name: '🧠 Coach', preset: 'support', color: 0x9e82e3 },
      { key: 'player', name: '🎮 Player', preset: 'member', color: 0x5aa6dc },
      { key: 'fan', name: '⭐ Fan', preset: 'member', color: 0x82b09b },
    ],
    categories: [
      { key: 'start', name: '🏁・START HERE', channels: [
        { key: 'welcome', name: '👋・welcome', type: 0, access: 'read_only' },
        { key: 'rules', name: '📜・rules', type: 0, access: 'read_only' },
        { key: 'news', name: '📢・team-news', type: 0, access: 'read_only', postRoleKey: 'organizer' },
      ] },
      { key: 'competition', name: '🏆・COMPETITION', channels: [
        { key: 'schedule', name: '🗓️・match-schedule', type: 0, access: 'read_only', postRoleKey: 'organizer' },
        { key: 'results', name: '📊・results', type: 0, access: 'read_only', postRoleKey: 'organizer' },
        { key: 'highlights', name: '🎬・highlights', type: 0 },
      ] },
      { key: 'roster', name: '🎮・ROSTER', channels: [
        { key: 'roster-news', name: '📋・roster-updates', type: 0, access: 'read_only', postRoleKey: 'organizer' },
        { key: 'tryouts', name: '🎫・tryout-applications', type: 0, access: 'read_only' },
        { key: 'scrims', name: '🎯・scrim-finder', type: 0 },
      ] },
      { key: 'team', name: '🔒・TEAM ROOM', channels: [
        { key: 'team-chat', name: '💬・team-chat', type: 0, access: 'private', roleKey: 'player', topic: 'Player role required. Give coaches the Player role too if they should join team discussion.' },
        { key: 'team-voice', name: '🎙️・team-voice', type: 2, access: 'private', roleKey: 'player' },
        { key: 'coach-notes', name: '🧠・coach-notes', type: 0, access: 'private', roleKey: 'coach' },
      ] },
      { key: 'fans', name: '⭐・FANS & STAFF', channels: [
        { key: 'general', name: '💬・general', type: 0 },
        { key: 'watch-party', name: '🔊・watch-party', type: 2 },
        { key: 'staff', name: '🛡️・organizer-desk', type: 0, access: 'private', roleKey: 'organizer' },
        { key: 'logs', name: '📋・activity-logs', type: 0, access: 'private', roleKey: 'organizer' },
      ] },
    ],
    features: {
      welcome: { enabled: true, title: 'Welcome to the arena', description: 'Welcome {member}! Check the match schedule, team news and community rules.', channelKey: 'welcome', color: '#5a8fe8' },
      ticket: { enabled: true, title: 'Tryout application', description: 'Open a private ticket to apply for a team tryout. An organizer will review your request.', channelKey: 'tryouts', staffRoleKey: 'organizer', buttonLabel: 'Apply for tryout', color: '#e5b34a' },
      logs: { enabled: true, mode: 'unified', channelKey: 'logs', events: ['message_update', 'message_delete', 'voice_join', 'voice_leave', 'command'] },
    },
  },
}, {
  key: 'diskoko-academy', name: 'Diskoko Academy Arabic', icon: '🎓', language: 'ar', category: 'academy',
  description: 'أكاديمية عربية بمسارات تعلم ومواد وأسئلة وتذاكر مساعدة ومساحة خاصة للمدربين.',
  optionalIntegrations: ['الدروس والملفات تُضاف يدويًا بعد التنصيب؛ لا يوجد نظام إدارة تعلم أو تسليم واجبات تلقائي.', 'الدفع والتسجيل في الدورات يحتاجان ربطًا خارجيًا مستقلًا.'],
  definition: {
    name: 'Diskoko Academy Arabic',
    roles: [
      { key: 'manager', name: '🎓 مدير الأكاديمية', preset: 'moderator', color: 0xd6a956 },
      { key: 'mentor', name: '👩‍🏫 مدرب', preset: 'support', color: 0x7a9ee5 },
      { key: 'learner', name: '📚 متعلم', preset: 'member', color: 0x69b4a7 },
      { key: 'graduate', name: '🏅 خريج', preset: 'vip', color: 0xe1b86c },
    ],
    categories: [
      { key: 'start', name: '✨・بداية-الرحلة', channels: [
        { key: 'welcome', name: '👋・الترحيب', type: 0, access: 'read_only' },
        { key: 'rules', name: '📜・إرشادات-التعلم', type: 0, access: 'read_only' },
        { key: 'announcements', name: '📢・الإعلانات', type: 0, access: 'read_only', postRoleKey: 'manager' },
      ] },
      { key: 'learning', name: '📚・المسارات', channels: [
        { key: 'roadmap', name: '🗺️・خريطة-التعلم', type: 0, access: 'read_only', postRoleKey: 'mentor' },
        { key: 'resources', name: '📂・الموارد', type: 0, access: 'read_only', postRoleKey: 'mentor' },
        { key: 'assignments', name: '📝・التطبيقات', type: 0, topic: 'مناقشة التطبيقات العامة فقط. تسليم الملفات أو التقييمات الخاصة عبر تذكرة المدرب.' },
        { key: 'milestones', name: '🏅・إنجازات-التعلم', type: 0 },
      ] },
      { key: 'discussion', name: '💬・النقاش-والأسئلة', channels: [
        { key: 'questions', name: '❔・اسأل-المدرب', type: 0 },
        { key: 'projects', name: '🎨・مشاريع-الطلاب', type: 0 },
        { key: 'study-groups', name: '👥・مجموعات-المذاكرة', type: 0 },
        { key: 'study-voice', name: '🔊・جلسة-مذاكرة', type: 2 },
      ] },
      { key: 'support', name: '🎫・المساعدة', channels: [
        { key: 'help', name: '🎫・طلب-مساعدة', type: 0, access: 'read_only' },
        { key: 'faq', name: '💡・الأسئلة-الشائعة', type: 0, access: 'read_only' },
      ] },
      { key: 'staff', name: '🔒・المدربون', channels: [
        { key: 'mentor-room', name: '🧠・غرفة-المدربين', type: 0, access: 'private', roleKey: 'mentor' },
        { key: 'mentor-voice', name: '🎙️・اجتماع-المدربين', type: 2, access: 'private', roleKey: 'mentor' },
        { key: 'logs', name: '📋・سجل-النشاط', type: 0, access: 'private', roleKey: 'manager' },
      ] },
    ],
    features: {
      welcome: { enabled: true, title: 'أهلًا بك في الأكاديمية', description: 'حيّاك {member}! ابدأ بالإرشادات وخريطة التعلم، ثم شارك في النقاش والأسئلة.', channelKey: 'welcome', color: '#6f9bdd' },
      ticket: { enabled: true, title: 'مساعدة المتعلمين', description: 'تحتاج مساعدة خاصة؟ افتح تذكرة وسيتواصل معك أحد المدربين.', channelKey: 'help', staffRoleKey: 'mentor', buttonLabel: 'طلب مساعدة', color: '#69b4a7' },
      logs: { enabled: true, mode: 'unified', channelKey: 'logs', events: ['message_update', 'message_delete', 'voice_join', 'voice_leave', 'command'] },
    },
  },
});
const starterGuides = {
  'server-my-arabic': [
    { key: 'start-guide', channelKey: 'about', title: '🌙 ابدأ من هنا | Start here', description: 'اقرأ القوانين، ثم شارك في الشات العام أو عرّفنا بنفسك. Read the rules first, then join the community chat. استخدم تذكرة الدعم للمسائل الخاصة.' },
    { key: 'support-guide', channelKey: 'questions', title: '❔ أين أطلب المساعدة؟', description: 'الاستفسارات العامة هنا، والمشكلات الخاصة عبر زر التذكرة في قناة فتح-تكت. لا تشارك بياناتك الشخصية في القنوات العامة.' },
  ],
  'streamer-community': [
    { key: 'live-guide', channelKey: 'live', title: '🔴 كيف تتابع البث؟ | Follow the stream', description: 'ينشر صانع المحتوى رابط البث هنا ومواعيده في قناة الجدول. تنبيهات المنصات التلقائية غير مفعّلة حتى يكتمل الربط.' },
    { key: 'community-guide', channelKey: 'faq', title: '💎 مجتمع المتابعين | Community guide', description: 'شارك في الدردشة واللقطات، واطلب المساعدة عبر تذكرة خاصة. قنوات المشتركين مخصصة لمن يمنحهم صاحب السيرفر رتبة المشترك.' },
  ],
  'diskoko-gaming-1': [
    { key: 'team-guide', channelKey: 'looking-for-team', title: '🎮 ابحث عن فريقك', description: 'اكتب اسم اللعبة والمنصة والمنطقة وموعد اللعب، ثم اتفقوا في الغرفة الصوتية المناسبة. تجنب مشاركة بياناتك الخاصة.' },
    { key: 'event-guide', channelKey: 'events', title: '🏁 الفعاليات والبطولات', description: 'ينشر المشرفون موعد الفعالية وقواعدها هنا بعد تأكيدها. شارك إنجازاتك في قناة الإنجازات، وافتح تذكرة عند وجود مشكلة.' },
  ],
  'diskoko-streamer': [
    { key: 'live-guide', channelKey: 'live', title: '🔴 متابعة البث', description: 'ضع رابط البث ومواعيده هنا وفي جدول البث. القناة جاهزة للنشر اليدوي؛ تنبيه البث التلقائي يحتاج ربط المنصة لاحقًا.' },
    { key: 'content-guide', channelKey: 'suggestions', title: '💡 شارك فكرتك', description: 'اقترح موضوعًا للبث أو الفيديو القادم. للمشكلات الخاصة استخدم تذكرة الدعم بدل الدردشة العامة.' },
  ],
  'diskoko-store-ar': [
    { key: 'order-guide', channelKey: 'products', title: '🛍️ كيف تطلب؟', description: 'تصفح المنتجات والعروض، ثم افتح تذكرة من قناة دعم الطلبات واكتب اسم المنتج واستفسارك. لا تشارك بيانات الدفع في القنوات العامة.' },
    { key: 'store-checklist', channelKey: 'faq', title: '❔ قبل الشراء', description: 'راجع وصف المنتج وسياسات المتجر. اسأل فريق الدعم عن السعر والتوفر وموعد التسليم قبل تأكيد الطلب. تحديثات الخدمة عامة؛ تفاصيل طلبك عبر تذكرة خاصة فقط. صاحب المتجر: أكمل معلومات التواصل وسياساتك قبل الإطلاق.' },
  ],
  'diskoko-store-en': [
    { key: 'order-guide', channelKey: 'products', title: '🛍️ How to order', description: 'Browse products and offers, then open a private ticket in order support with the product name and your question. Never share payment details in public channels.' },
    { key: 'store-checklist', channelKey: 'faq', title: '❔ Before you buy', description: 'Review the product details and store policies. Ask the team about price, availability and delivery before confirming. Service updates are public; discuss your own order in a private ticket. Store owner: complete your contact details and policies before launch.' },
  ],
  'diskoko-community': [
    { key: 'language-guide', channelKey: 'rules', title: '🌐 اختر لغتك | Choose your language', description: 'مرحبًا! اقرأ القوانين وشارك في قنوات العربية أو English. | Welcome! Read the rules, then join the Arabic or English channels. احترم اختلاف اللغات والأعضاء. | Respect all members and languages.' },
    { key: 'participation-guide', channelKey: 'events', title: '🎉 شارك في المجتمع | Join the community', description: 'ينشر أصحاب رتبة المنظم مواعيد الفعاليات المؤكدة هنا. شارك أعمالك في قناة المشاركات. | Hosts post confirmed event times here; share your work in the showcase channel. إنشاء حدث Discord نفسه خطوة منفصلة.' },
  ],
  'diskoko-esports': [
    { key: 'match-guide', channelKey: 'schedule', title: '🏆 Match day guide', description: 'Check the schedule and team announcements before each match. Organizers publish the confirmed time and lobby details here. Players coordinate privately in the team room; assign coaches the Player role too when they need access.' },
    { key: 'tryout-guide', channelKey: 'tryouts', title: '🎯 Join a tryout', description: 'Open the private application ticket and share your game, region, availability and experience. An organizer will review it. Tryout decisions and tournament results are managed by your team.' },
  ],
  'diskoko-academy': [
    { key: 'learning-guide', channelKey: 'roadmap', title: '🗺️ ابدأ مسارك', description: 'ابدأ بإرشادات التعلم، ثم تابع المواد في الموارد وطبّق ما تتعلمه في قناة التطبيقات. اسأل المدرب عند الحاجة وشارك مشروعك بعد المراجعة.' },
    { key: 'study-guide', channelKey: 'faq', title: '📚 طريقة الاستفادة من الأكاديمية', description: 'تصفح خريطة التعلم والموارد أولًا. استخدم قناة الأسئلة والتطبيقات للنقاش العام، وتذكرة المساعدة لتسليم خاص أو تقييم فردي. يضيف المدربون الدروس والمواعيد الفعلية بعد إعداد السيرفر.' },
  ],
};
for (const template of READY_TEMPLATES) if (starterGuides[template.key]) template.definition.features.guides = starterGuides[template.key];
const catalogHighlights = {
  'server-my-arabic': ['دخول واضح', 'دعم خاص', 'مساحة VIP'],
  'streamer-community': ['بث على أي منصة', 'غرف مشتركين', 'دعم وسجلات'],
  'diskoko-gaming-1': ['ابحث عن فريق', 'فعاليات ألعاب', 'دعم خاص'],
  'diskoko-streamer': ['جدول ومقاطع', 'غرف مشتركين', 'إعلانات صانع المحتوى'],
  'diskoko-store-ar': ['دعم طلبات خاص', 'دليل شراء جاهز', 'إعلانات ومنتجات'],
  'diskoko-store-en': ['Private order help', 'Ready buying guide', 'Offers and updates'],
  'diskoko-community': ['مساران لغويان', 'بطاقة إرشاد ثنائية', 'فعاليات ومشاركات'],
  'diskoko-esports': ['تقديم تجارب خاص', 'غرف فريق', 'تنظيم المباريات'],
  'diskoko-academy': ['مسار تعلم واضح', 'مساعدة مدربين', 'بطاقات إرشادية'],
};
for (const template of READY_TEMPLATES) if (catalogHighlights[template.key]) template.highlights = catalogHighlights[template.key];
// A stable series and edition let future variants coexist without changing
// installed template keys or silently rewriting previous customer reviews.
for (const template of READY_TEMPLATES) {
  template.seriesKey ??= template.key;
  template.edition ??= 1;
  template.revision ??= 2;
}
for (const key of ['diskoko-store-ar', 'diskoko-academy']) READY_TEMPLATES.find(template => template.key === key).featured = true;
// The catalog stores roles from highest to lowest; the editor can change this order.
const roleOrder = {
  'server-my-arabic': ['moderator', 'support', 'vip', 'member'],
  'streamer-community': ['streamer', 'moderator', 'support', 'subscriber', 'member'],
  'diskoko-gaming-1': ['moderator', 'support', 'captain', 'gamer', 'newcomer'],
  'diskoko-streamer': ['streamer', 'moderator', 'support', 'subscriber', 'viewer'],
  'diskoko-store-ar': ['owner', 'staff', 'vip', 'customer'],
  'diskoko-store-en': ['owner', 'staff', 'vip', 'customer'],
  'diskoko-community': ['moderator', 'support', 'host', 'member'],
  'diskoko-esports': ['organizer', 'coach', 'player', 'fan'],
  'diskoko-academy': ['manager', 'mentor', 'graduate', 'learner'],
};
for (const template of READY_TEMPLATES) template.definition.roles.sort((a, b) => roleOrder[template.key].indexOf(a.key) - roleOrder[template.key].indexOf(b.key));
for (const template of READY_TEMPLATES) template.definition.features.modules = defaultReadyModules(template);

const plain = value => String(value ?? '').trim();
const validKey = value => /^[a-z][a-z0-9-]{0,39}$/.test(value);
const validName = value => value.length >= 1 && value.length <= 100 && !/[\r\n]/.test(value);
export function readyImage(input) {
  if (!input) return null;
  const mime = plain(input.mime), base64 = plain(input.base64);
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime) || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length > 11_200_000) throw problem('صورة القالب يجب أن تكون PNG أو JPG أو WebP أو GIF وبحجم 8 ميجابايت كحد أقصى.');
  const bytes = Buffer.from(base64, 'base64');
  const valid = mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : mime === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 : mime === 'image/webp' ? bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' : ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6));
  if (!valid || bytes.length > 8 * 1024 * 1024) throw problem('تعذر قراءة الصورة أو تجاوزت 8 ميجابايت.');
  return { mime, base64 };
}
export function normalizeReadyDefinition(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw problem('القالب غير صالح.');
  const name = plain(input.name);
  if (!validName(name)) throw problem('اسم القالب يجب أن يكون من 1 إلى 100 حرف.');
  if (!Array.isArray(input.roles) || input.roles.length > 40 || !Array.isArray(input.categories) || !input.categories.length || input.categories.length > 25) throw problem('عدد الرتب أو التصنيفات غير صالح.');
  const keys = { role: new Set(), category: new Set(), channel: new Set() };
  const reserve = (kind, key) => { if (!validKey(key) || keys[kind].has(key)) throw problem('مفاتيح القالب مكررة أو غير صالحة.'); keys[kind].add(key); return key; };
  const roles = input.roles.map(item => {
    const key = reserve('role', plain(item.key)), roleName = plain(item.name), preset = plain(item.preset || 'member');
    if (!validName(roleName) || !Object.hasOwn(ROLE_PRESETS, preset)) throw problem('اسم الرتبة أو نوع صلاحياتها غير صالح.');
    const color = Number(item.color ?? 0);
    if (!Number.isInteger(color) || color < 0 || color > 0xffffff) throw problem('لون الرتبة غير صالح.');
    return { key, name: roleName, preset, color, permissions: ROLE_PRESETS[preset].permissions };
  });
  const roleKeys = new Set(roles.map(role => role.key));
  let channelCount = 0;
  const categories = input.categories.map(item => {
    const key = reserve('category', plain(item.key)), categoryName = plain(item.name);
    if (!validName(categoryName) || !Array.isArray(item.channels) || item.channels.length > 40) throw problem('تصنيف القنوات غير صالح.');
    const channels = item.channels.map(channel => {
      channelCount++;
      const channelKey = reserve('channel', plain(channel.key)), channelName = plain(channel.name), type = Number(channel.type ?? 0), access = plain(channel.access || 'public');
      if (!validName(channelName) || ![0, 2].includes(type) || !['public', 'read_only', 'private'].includes(access) || (type === 2 && access === 'read_only')) throw problem('اسم القناة أو نوعها أو وصولها غير صالح.');
      const roleKey = access === 'private' ? plain(channel.roleKey) : null;
      const postRoleKey = access === 'read_only' && type === 0 ? plain(channel.postRoleKey) : '';
      if (access === 'private' && !roleKeys.has(roleKey)) throw problem('القناة الخاصة تحتاج رتبة موجودة داخل القالب.');
      if (postRoleKey && !roleKeys.has(postRoleKey)) throw problem('رتبة النشر في القناة للقراءة فقط غير موجودة داخل القالب.');
      const topic = plain(channel.topic);
      if (topic.length > 1024) throw problem('وصف القناة طويل جدًا.');
      return { key: channelKey, name: channelName, type, access, ...(roleKey ? { roleKey } : {}), ...(postRoleKey ? { postRoleKey } : {}), ...(topic && type === 0 ? { topic } : {}) };
    });
    return { key, name: categoryName, channels };
  });
  if (channelCount < 1 || channelCount > 85) throw problem('القالب يحتاج من 1 إلى 85 قناة.');
  if (new Set(categories.map(item => item.name.toLowerCase())).size !== categories.length || new Set(roles.map(item => item.name.toLowerCase())).size !== roles.length) throw problem('أسماء التصنيفات والرتب يجب أن تكون فريدة داخل القالب.');
  if (categories.some(group => new Set(group.channels.map(item => item.name.toLowerCase())).size !== group.channels.length)) throw problem('لا تكرر اسم القناة داخل التصنيف نفسه.');
  const channelKeys = new Set(categories.flatMap(category => category.channels.map(channel => channel.key)));
  const rawFeatures = input.features || {};
  const features = {};
  for (const kind of ['welcome', 'ticket']) {
    const feature = rawFeatures[kind];
    if (!feature?.enabled) { features[kind] = { enabled: false }; continue; }
    const title = plain(feature.title), description = plain(feature.description), channelKey = plain(feature.channelKey);
    if (!title || title.length > 256 || !description || description.length > 2000 || !channelKeys.has(channelKey)) throw problem(`إعداد ${kind === 'welcome' ? 'الترحيب' : 'الدعم'} غير مكتمل.`);
    const channel = categories.flatMap(category => category.channels).find(row => row.key === channelKey);
    if (channel.type !== 0) throw problem('ميزة الترحيب أو التذاكر تحتاج قناة نصية.');
    features[kind] = { enabled: true, title, description, channelKey };
    if (kind === 'welcome') {
      const color = plain(feature.color || '#8d72e8');
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw problem('لون بطاقة الترحيب غير صالح.');
      features[kind].color = color;
      features[kind].banner = readyImage(feature.banner);
      features[kind].avatarPosition = ['left', 'right', 'top', 'center'].includes(feature.avatarPosition) ? feature.avatarPosition : 'right';
      features[kind].bannerPosition = feature.bannerPosition === 'above' ? 'above' : 'below';
      features[kind].composite = feature.composite === true;
      if (features[kind].composite && !features[kind].banner) throw problem('ارفع تصميم الترحيب قبل وضع صورة العضو داخله.');
      if (features[kind].composite && !['left', 'center', 'right'].includes(feature.avatarPosition)) throw problem('اختر موضع صورة العضو داخل التصميم.');
      features[kind].avatarVertical = Math.max(15, Math.min(85, Number(feature.avatarVertical ?? 50)));
      features[kind].avatarRadius = Math.max(60, Math.min(160, Number(feature.avatarRadius ?? 95)));
      if (!Number.isFinite(features[kind].avatarVertical) || !Number.isFinite(features[kind].avatarRadius)) throw problem('موضع صورة العضو غير صالح.');
    } else {
      const staffRoleKey = plain(feature.staffRoleKey);
      if (!roleKeys.has(staffRoleKey)) throw problem('اختر رتبة الدعم من القالب.');
      features[kind].staffRoleKey = staffRoleKey;
      features[kind].color = /^#[0-9a-fA-F]{6}$/.test(plain(feature.color || '#8d72e8')) ? plain(feature.color || '#8d72e8') : (() => { throw problem('لون بطاقة الدعم غير صالح.'); })();
      features[kind].banner = readyImage(feature.banner);
      features[kind].bannerPosition = feature.bannerPosition === 'above' ? 'above' : 'below';
      features[kind].imageStyle = ['logo', 'design'].includes(feature.imageStyle) ? feature.imageStyle : 'normal';
      if (features[kind].imageStyle === 'design' && (!features[kind].banner || features[kind].banner.mime !== 'image/png')) throw problem('ادمج شعار الدعم داخل التصميم الثابت قبل المراجعة.');
      features[kind].buttonLabel = plain(feature.buttonLabel || 'فتح تذكرة دعم');
      if (features[kind].buttonLabel.length > 80) throw problem('نص زر الدعم طويل جدًا.');
    }
  }
  if (rawFeatures.logs?.enabled) {
    const allChannels = categories.flatMap(category => category.channels);
    const byKey = new Map(allChannels.map(channel => [channel.key, channel]));
    const mode = rawFeatures.logs.mode === 'routed' ? 'routed' : 'unified';
    const allowedEvents = ['message_create', 'message_update', 'message_delete', 'voice_join', 'voice_leave', 'command'];
    const selectedEvents = Array.isArray(rawFeatures.logs.events) ? [...new Set(rawFeatures.logs.events.map(plain))] : allowedEvents;
    if ((mode === 'unified' && !selectedEvents.length) || selectedEvents.some(event => !allowedEvents.includes(event))) throw problem('اختر نوعًا واحدًا على الأقل من أحداث السجل.');
    const channelKey = plain(rawFeatures.logs.channelKey);
    const destination = byKey.get(channelKey);
    if (mode === 'unified' && (!destination || destination.type !== 0)) throw problem('اختر قناة نصية تستقبل اللوق الموحد.');
    let routes = [];
    if (mode === 'routed') {
      if (!Array.isArray(rawFeatures.logs.routes) || !rawFeatures.logs.routes.length || rawFeatures.logs.routes.length > 10) throw problem('أضف من قاعدة واحدة إلى عشر قواعد لوق.');
      const usedKeys = new Set();
      routes = rawFeatures.logs.routes.map((route, index) => {
        const key = plain(route.key || `log-${index + 1}`), targetKey = plain(route.targetKey);
        const target = byKey.get(targetKey);
        const sourceKeys = Array.isArray(route.sourceKeys) ? [...new Set(route.sourceKeys.map(plain))] : [];
        const sourceIds = Array.isArray(route.sourceIds) ? [...new Set(route.sourceIds.map(plain))] : [];
        const events = Array.isArray(route.events) ? [...new Set(route.events.map(plain))] : selectedEvents;
        if (!validKey(key) || usedKeys.has(key) || !target || target.type !== 0 || !(sourceKeys.length + sourceIds.length) || sourceKeys.length + sourceIds.length > 40 || sourceKeys.some(source => !byKey.has(source) || source === targetKey) || sourceIds.some(id => !/^\d{17,20}$/.test(id))) throw problem('راجع مصادر اللوق والقناة المستقبلة لكل قاعدة.');
        if (!events.length || events.some(event => !allowedEvents.includes(event))) throw problem(`اختر حدثًا واحدًا على الأقل لقاعدة اللوق ${index + 1}.`);
        if (sourceKeys.some(source => byKey.get(source).access === 'private') && target.access !== 'private') throw problem(`قاعدة اللوق ${index + 1} تراقب قناة خاصة. اختر لها قناة استقبال خاصة أيضًا.`);
        usedKeys.add(key);
        return { key, targetKey, sourceKeys, sourceIds, events };
      });
    }
    const events = mode === 'routed' ? [...new Set(routes.flatMap(route => route.events))] : selectedEvents;
    features.logs = { enabled: true, mode, channelKey: mode === 'unified' ? channelKey : routes[0].targetKey, events, routes };
  } else features.logs = { enabled: false };
  const rawGuides = rawFeatures.guides || [];
  if (!Array.isArray(rawGuides) || rawGuides.length > 8) throw problem('يمكن إضافة حتى 8 بطاقات بداية للقالب.');
  const guideKeys = new Set();
  features.guides = rawGuides.map((guide, index) => {
    const key = plain(guide.key), title = plain(guide.title), description = plain(guide.description), channelKey = plain(guide.channelKey);
    const channel = categories.flatMap(group => group.channels).find(item => item.key === channelKey);
    if (!validKey(key) || guideKeys.has(key) || !title || title.length > 256 || !description || description.length > 2000 || !channel || channel.type !== 0) throw problem(`راجع بطاقة البداية ${index + 1}: تحتاج عنوانًا ومحتوى وقناة نصية.`);
    guideKeys.add(key);
    return { key, title, description, channelKey };
  });
  const rawModules = rawFeatures.modules || [];
  if (!Array.isArray(rawModules) || rawModules.length > 16) throw problem('يمكن إضافة حتى 16 ميزة تفاعلية للقالب.');
  const moduleKeys = new Set();
  features.modules = rawModules.map((module, index) => {
    const key = plain(module.key), kind = plain(module.kind);
    if (!validKey(key) || moduleKeys.has(key) || !Object.hasOwn(READY_MODULE_TYPES, kind)) throw problem(`نوع الميزة ${index + 1} أو مفتاحها غير صالح.`);
    moduleKeys.add(key);
    if (!module.enabled) return { ...module, key, kind, enabled: false };
    const title = plain(module.title), description = plain(module.description), buttonLabel = plain(module.buttonLabel), channelKey = plain(module.channelKey);
    const channel = categories.flatMap(group => group.channels).find(item => item.key === channelKey);
    if (!title || title.length > 256 || !description || description.length > 2000 || !buttonLabel || buttonLabel.length > 80 || !channel || channel.type !== 0) throw problem(`أكمل عنوان ووصف وزر وقناة ميزة «${READY_MODULE_TYPES[kind].label}».`);
    if (channel.access === 'private' && !READY_MODULE_TYPES[kind].staffOnly) throw problem(`لوحة «${READY_MODULE_TYPES[kind].label}» تحتاج قناة يراها الأعضاء.`);
    const color = plain(module.color || '#8d72e8');
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw problem(`لون ميزة «${READY_MODULE_TYPES[kind].label}» غير صالح.`);
    const buttonStyle = Number(module.buttonStyle ?? 1);
    if (![1, 2, 3, 4].includes(buttonStyle)) throw problem(`لون زر ميزة «${READY_MODULE_TYPES[kind].label}» غير صالح.`);
    const result = { key, kind, enabled: true, title, description, buttonLabel, buttonStyle, channelKey, color, banner: readyImage(module.banner) };
    if (READY_MODULE_TYPES[kind].form) {
      result.subjectLabel = plain(module.subjectLabel || 'الموضوع');
      result.detailsLabel = plain(module.detailsLabel || 'التفاصيل أو الرابط');
      if (!result.subjectLabel || result.subjectLabel.length > 45 || !result.detailsLabel || result.detailsLabel.length > 45) throw problem(`تسميات نموذج «${READY_MODULE_TYPES[kind].label}» طويلة أو فارغة.`);
      const reviewChannelKey = plain(module.reviewChannelKey), reviewChannel = categories.flatMap(group => group.channels).find(item => item.key === reviewChannelKey);
      if (!reviewChannel || reviewChannel.type !== 0 || reviewChannel.access !== 'private') throw problem(`اختر قناة مراجعة خاصة لميزة «${READY_MODULE_TYPES[kind].label}».`);
      result.reviewChannelKey = reviewChannelKey;
    }
    if (READY_MODULE_TYPES[kind].form || READY_MODULE_TYPES[kind].staffOnly) {
      const staffRoleKey = plain(module.staffRoleKey);
      if (!roleKeys.has(staffRoleKey)) throw problem(`اختر رتبة فريق المراجعة لميزة «${READY_MODULE_TYPES[kind].label}».`);
      const reviewChannel = categories.flatMap(group => group.channels).find(item => item.key === (result.reviewChannelKey || channelKey));
      const staffRole = roles.find(item => item.key === staffRoleKey);
      if (reviewChannel?.access === 'private' && reviewChannel.roleKey !== staffRoleKey && staffRole?.preset !== 'moderator') throw problem(`رتبة فريق «${READY_MODULE_TYPES[kind].label}» لا تستطيع دخول قناة المراجعة الخاصة. اختر رتبتها أو رتبة إشراف.`);
      result.staffRoleKey = staffRoleKey;
    }
    if (READY_MODULE_TYPES[kind].answer) {
      result.answer = plain(module.answer);
      if (!result.answer || result.answer.length > 1800) throw problem('اكتب إجابة الأسئلة السريعة بحد أقصى 1800 حرف.');
    }
    if (READY_MODULE_TYPES[kind].role) {
      const roleKey = plain(module.roleKey), role = roles.find(item => item.key === roleKey);
      if (!role || role.preset !== 'member' || BigInt(role.permissions) !== 0n) throw problem('ميزة اختيار الاهتمامات لا تمنح إلا رتبة عضو عادية بلا صلاحيات.');
      result.roleKey = roleKey;
    }
    if (READY_MODULE_TYPES[kind].signup) {
      const capacity = Number(module.capacity ?? 0), startsAt = plain(module.startsAt);
      if (!Number.isInteger(capacity) || capacity < 0 || capacity > 10000 || (startsAt && (!Number.isFinite(Date.parse(startsAt)) || new Date(startsAt).getTime() <= Date.now()))) throw problem('راجع موعد الفعالية وعدد الأماكن. اترك الأماكن صفرًا لتكون مفتوحة.');
      result.capacity = capacity;
      result.startsAt = startsAt || null;
    }
    return result;
  });
  const mediaBytes = [features.welcome?.banner, features.ticket?.banner, ...features.modules.filter(module => module.enabled).map(module => module.banner)]
    .reduce((sum, image) => sum + (image?.base64?.length ? Math.ceil(image.base64.length * 3 / 4) : 0), 0);
  if (mediaBytes > 20 * 1024 * 1024) throw problem('صور القالب مجتمعة تتجاوز 20 ميجابايت. قلّل عدد الصور أو أحجامها قبل المراجعة.');
  return { name, roles, categories, features };
}

export function readyUsageUnits(definition) {
  return definition.roles.length + definition.categories.length + definition.categories.reduce((count, group) => count + group.channels.length, 0)
    + ['welcome', 'ticket'].filter(kind => definition.features[kind]?.enabled).length
    + (definition.features.logs?.enabled ? definition.features.logs.mode === 'routed' ? definition.features.logs.routes.length : 1 : 0)
    + (definition.features.guides?.length || 0)
    + (definition.features.modules || []).filter(module => module.enabled).length;
}

export function readyTemplateDiff(definition, snapshot, mode = 'add') {
  if (!['add', 'replace'].includes(mode)) throw problem('اختر الإضافة أو الاستبدال.');
  const rows = snapshot.channels || [], roles = snapshot.roles || [];
  const desiredChannels = definition.categories.flatMap(category => category.channels.map(channel => ({ ...channel, categoryKey: category.key, categoryName: category.name })));
  const expected = mode === 'replace' ? [
    ...definition.categories.map(category => ({ kind: 'category', key: category.key, name: category.name, action: 'create' })),
    ...desiredChannels.map(channel => ({ kind: 'channel', key: channel.key, name: channel.name, parent: channel.categoryName, access: channel.access, action: 'create' })),
    ...definition.roles.map(role => ({ kind: 'role', key: role.key, name: role.name, preset: role.preset, permissions: role.permissions, action: 'create' })),
  ] : [
    ...definition.categories.map(category => ({ kind: 'category', key: category.key, name: category.name, action: rows.some(row => row.type === 4 && row.name === category.name) ? 'reuse' : 'create' })),
    ...desiredChannels.map(channel => {
      const matches = rows.filter(row => row.type === channel.type && row.name === channel.name && rows.find(parent => parent.id === row.parent_id)?.name === channel.categoryName);
      if (matches.length > 1) throw problem(`أكثر من قناة باسم «${channel.name}» في التصنيف نفسه. غيّر الاسم قبل التنفيذ.`, 409);
      const existing = matches[0];
      const everyone = (existing?.permission_overwrites || []).find(row => row.id === snapshot.guildId);
      const denied = BigInt(everyone?.deny || '0');
      const actual = (denied & P.ViewChannel) ? 'private' : (denied & P.SendMessages) ? 'read_only' : 'public';
      const targetRole = roles.find(row => row.name === definition.roles.find(role => role.key === channel.roleKey)?.name && !row.managed);
      const roleAllowed = channel.access !== 'private' || Boolean(targetRole && (BigInt((existing?.permission_overwrites || []).find(row => row.id === targetRole.id)?.allow || '0') & P.ViewChannel));
      const postingRole = roles.find(row => row.name === definition.roles.find(role => role.key === channel.postRoleKey)?.name && !row.managed);
      const postingAllowed = !channel.postRoleKey || Boolean(postingRole && (BigInt((existing?.permission_overwrites || []).find(row => row.id === postingRole.id)?.allow || '0') & P.SendMessages));
      return { kind: 'channel', key: channel.key, name: channel.name, parent: channel.categoryName, access: channel.access, ...(channel.postRoleKey ? { postRole: definition.roles.find(role => role.key === channel.postRoleKey)?.name } : {}), action: existing ? (actual === channel.access && roleAllowed && postingAllowed ? 'reuse' : mode === 'replace' ? 'update' : 'conflict') : 'create', ...(existing ? { existingId: existing.id, actualAccess: actual } : {}) };
    }),
    ...definition.roles.map(role => {
      const existing = roles.find(row => row.name === role.name && !row.managed && row.id !== snapshot.guildId);
      return { kind: 'role', key: role.key, name: role.name, preset: role.preset, permissions: role.permissions, action: existing ? (mode === 'replace' && (String(existing.permissions) !== role.permissions || existing.color !== role.color) ? 'update' : 'reuse') : 'create', ...(existing ? { existingId: existing.id, currentPermissions: String(existing.permissions), hasAdministrator: Boolean(BigInt(existing.permissions || '0') & P.Administrator) } : {}) };
    }),
  ];
  if (expected.some(item => item.action === 'conflict')) throw problem('بعض القنوات الموجودة تحمل الاسم نفسه لكن صلاحياتها مختلفة. غيّر اسم القناة في القالب أو اختر الاستبدال لمراجعة تعديلها.', 409);
  const deletions = mode === 'replace' ? {
    channels: rows.map(row => ({ id: row.id, name: row.name, type: row.type })),
    roles: roles.filter(row => row.id !== snapshot.guildId && !row.managed).map(row => ({ id: row.id, name: row.name, position: row.position })),
  } : { channels: [], roles: [] };
  const reusedIds = new Set(expected.map(item => item.existingId).filter(Boolean));
  const retained = mode === 'add' ? {
    channels: rows.filter(row => !reusedIds.has(row.id)).map(row => ({ id: row.id, name: row.name, type: row.type, uncategorized: row.type !== 4 && !row.parent_id })),
    roles: roles.filter(row => row.id !== snapshot.guildId && !reusedIds.has(row.id)).map(row => ({ id: row.id, name: row.name, managed: Boolean(row.managed) })),
  } : { channels: [], roles: [] };
  return { mode, createOrReuse: expected, deletions, retained, warning: mode === 'replace' ? 'حذف القنوات يمحو رسائلها ولا يمكن استعادتها من Discord. حذف الرتب يزيلها من الأعضاء. يُنشأ الهيكل الجديد أولًا ثم تُحذف العناصر القديمة.' : null };
}

export { ROLE_PRESETS, SAFE_ROLE_BITS };

