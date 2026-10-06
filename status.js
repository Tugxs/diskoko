const target = document.getElementById('statusLive');

if (target) {
  const show = (message, { online = false, detail = '' } = {}) => {
    const dot = document.createElement('span');
    dot.className = online ? 'status-dot-live online' : 'status-dot-live';
    const title = document.createElement('strong');
    title.textContent = message;
    target.replaceChildren(dot, title);

    if (detail) {
      const note = document.createElement('small');
      note.textContent = detail;
      target.append(note);
    }
  };

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);

  fetch('/api/health', {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal: controller.signal,
  })
    .then(async response => {
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error('Health check failed');
      show('الخدمة الأساسية تعمل', {
        online: true,
        detail: 'واجهة الموقع وقاعدة البيانات متاحتان وقت الفحص.',
      });
    })
    .catch(() => show('تعذر جلب الحالة الآن', {
      detail: 'أعد المحاولة بعد قليل. لا يعرض هذا الفحص حالة Discord أو بوتات العملاء.',
    }))
    .finally(() => window.clearTimeout(timeout));
}
