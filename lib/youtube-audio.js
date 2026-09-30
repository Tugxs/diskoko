import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const binary = process.env.DISKOKO_YTDLP_PATH || fileURLToPath(new URL(`../node_modules/youtube-dl-exec/bin/${process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'}`, import.meta.url));
const videoUrl = id => `https://www.youtube.com/watch?v=${id}`;

export function describeYoutubeFailure(details = '') {
  const message = String(details).toLowerCase();
  if (/video is unavailable|not available|removed by the uploader|private video|video unavailable/.test(message)) return 'لم يجد YouTube هذا المقطع أو أنه غير متاح. افتح الرابط في YouTube وتأكد من نسخه كاملًا، خاصة الفرق بين الرقم 0 والحرف O، ثم حاول.';
  if (/sign in|age.restricted|age.restriction|login required/.test(message)) return 'هذا الفيديو يتطلب تسجيل دخول أو عليه تقييد عمري؛ اختر فيديو عامًا غير مقيّد.';
  if (/geo.restrict|not available in your country/.test(message)) return 'هذا الفيديو محجوب في موقع الخادم؛ اختر فيديو متاحًا في بلد الخادم.';
  if (/timed out|timeout|econnreset|network/.test(message)) return 'تعذر الاتصال بـ YouTube الآن. انتظر قليلًا ثم حاول مجددًا.';
  return 'تعذر قراءة صوت هذا الفيديو من YouTube الآن. تأكد من تشغيله في المتصفح، ثم جرّب مقطعًا عامًا آخر.';
}

export async function youtubeAudioInfo(id) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw Error('رابط YouTube غير صالح. انسخ رابط فيديو واحد ثم حاول.');
  try {
    const { stdout } = await execFileAsync(binary, ['--no-config', '--no-playlist', '--no-warnings', '--extractor-args', 'youtube:player_client=android', '--encoding', 'utf-8', '--skip-download', '--print', 'title', '--print', 'duration', videoUrl(id)], { timeout: 25_000, maxBuffer: 32_000, windowsHide: true });
    const [rawTitle, rawDuration] = stdout.trim().split(/\r?\n/);
    const duration = Number(rawDuration);
    if (!rawTitle || !Number.isFinite(duration) || duration <= 0) throw Error('هذا الفيديو غير متاح للتشغيل الصوتي. جرّب فيديو عامًا آخر.');
    if (duration > 7200) throw Error('المقطع أطول من ساعتين. اختر مقطعًا أقصر.');
    return { id, title: rawTitle.replace(/[\r\n\t]/g, ' ').slice(0, 100), duration };
  } catch (error) {
    if (error.message.includes('أطول من ساعتين') || error.message.includes('غير متاح للتشغيل الصوتي')) throw error;
    console.error('YouTube audio metadata failed', { videoId: id, code: error.code || null, detail: String(error.stderr || error.message || '').slice(-500) });
    throw Error(describeYoutubeFailure(error.stderr || error.message));
  }
}

export async function youtubeAudioStream(id) {
  const child = spawn(binary, ['--no-config', '--no-playlist', '--no-warnings', '--extractor-args', 'youtube:player_client=android', '--no-progress', '--format', 'bestaudio', '--output', '-', videoUrl(id)], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-2000); });
  child.stdout.once('close', () => { if (!child.killed) child.kill(); });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('انتهت مهلة تجهيز صوت YouTube. حاول مرة أخرى.')), 30_000);
      const done = (error) => { clearTimeout(timer); child.stdout.off('readable', ready); child.off('error', failed); child.off('close', closed); error ? reject(error) : resolve(); };
      const ready = () => done();
      const failed = (error) => { console.error('YouTube audio process failed', { videoId: id, code: error.code || null, detail: String(error.message || '').slice(-500) }); done(Error('تعذر بدء مشغّل YouTube على الخادم.')); };
      const closed = (code) => { console.error('YouTube audio stream closed before playback', { videoId: id, code, detail: stderr.slice(-500) }); done(Error(describeYoutubeFailure(stderr))); };
      child.stdout.once('readable', ready);
      child.once('error', failed);
      child.once('close', closed);
    });
    return child.stdout;
  } catch (error) { child.kill(); throw error; }
}
