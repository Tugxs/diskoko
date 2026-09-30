const id = new URLSearchParams(location.search).get('v') || '';
const stage = document.getElementById('watchStage');
if (/^[A-Za-z0-9_-]{11}$/.test(id)) {
  const frame = document.createElement('iframe');
  frame.src = `https://www.youtube-nocookie.com/embed/${id}`;
  frame.title = 'مشغّل YouTube';
  frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  frame.allowFullscreen = true;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  stage.append(frame);
} else {
  stage.innerHTML = '<p class="watch-error">رابط الفيديو غير صالح. افتح رابط المشاهدة من لوحة البوت مرة أخرى.</p>';
}