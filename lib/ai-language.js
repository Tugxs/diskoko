// Response language is independent of the requested design's content language.
export function responseLanguage(prompt, context = [], preferred) {
  const text = String(prompt || '');
  if (/(?:رد|تحدث|جاوب|أجب)[^\n]{0,25}(?:إنجليزي|انجليزي)|\b(?:reply|respond|answer|speak)\b[^\n]{0,25}\bEnglish\b/i.test(text)) return 'en';
  if (/(?:رد|تحدث|جاوب|أجب)[^\n]{0,25}عربي|\b(?:reply|respond|answer|speak)\b[^\n]{0,25}\bArabic\b/i.test(text)) return 'ar';
  const withoutQuoted = text.replace(/["«“][^"»”]*["»”]/g, '');
  if (/\p{Script=Arabic}/u.test(withoutQuoted)) return 'ar';
  if (/[a-z]{3}/i.test(withoutQuoted)) return 'en';
  if(['ar','en'].includes(preferred))return preferred;
  const previous = [...context].reverse().find(item => item.role === 'user' && /\p{L}/u.test(String(item.content || '')));
  return previous ? responseLanguage(previous.content) : 'ar';
}

export function localizedAiMessage(key, language) {
  const messages = {
    vision: {
      ar: 'لم أتمكن من قراءة الصورة المرجعية. لن أختلق وصفًا لها أو أنشرها. صف ترتيب العناصر نصيًا أو راجع الإدارة لتفعيل الرؤية.',
      en: 'I could not read the reference image. I will not invent a description or publish it. Describe the layout in text, or contact the administrator to restore vision.',
    },
    draft_plain: {
      ar: 'جهزت قالبًا قابلًا للتعديل. افتح المراجعة لتكمل البيانات وتشاهد المعاينة وتختار القناة والبوت. لم يُنشر أو يُفعّل شيء بعد.',
      en: 'Your editable draft is ready. Open review to complete its fields, inspect the preview and choose the channel and bot. Nothing has been published or activated.',
    },
    draft: {
      ar: 'جهزت مسودة قابلة للمراجعة والتعديل. الصورة المرجعية لن تُنشر؛ ارفع الصور النهائية داخل المراجعة. لا يحدث نشر أو تفعيل حتى تؤكد الإعدادات والقناة والبوت. مظهر بطاقة Discord الأصلي يخضع لحدوده؛ أشكال صورة العضو تحتاج تصميمًا مركبًا.',
      en: 'Your editable draft is ready for review. The reference screenshot will not be published; upload your final images in review. Nothing is published or activated until you confirm the settings, channel and bot. Native Discord appearance has fixed limits; custom avatar shapes require a composed image.',
    },
  };
  return messages[key]?.[language === 'en' ? 'en' : 'ar'] || '';
}
