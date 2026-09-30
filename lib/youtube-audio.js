import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const binary = process.env.DISKOKO_YTDLP_PATH || fileURLToPath(new URL(`../node_modules/youtube-dl-exec/bin/${process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'}`, import.meta.url));
const videoUrl = id => `https://www.youtube.com/watch?v=${id}`;

export async function youtubeAudioInfo(id) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw Error('رابط YouTube غير صالح. انسخ رابط فيديو واحد ثم حاول.');
  try {
    const { stdout } = await execFileAsync(binary, ['--no-config', '--no-playlist', '--no-warnings', '--skip-download', '--print', 'title', '--print', 'duration', videoUrl(id)], { timeout: 25_000, maxBuffer: 32_000, windowsHide: true });
    const [rawTitle, rawDuration] = stdout.trim().split(/\r?\n/);
    const duration = Number(rawDuration);
    if (!rawTitle || !Number.isFinite(duration) || duration <= 0) throw Error('هذا الفيديو غير متاح للتشغيل الصوتي. جرّب فيديو عامًا آخر.');
    if (duration > 7200) throw Error('المقطع أطول من ساعتين. اختر مقطعًا أقصر.');
    return { id, title: rawTitle.replace(/[\r\n\t]/g, ' ').slice(0, 100), duration };
  } catch (error) {
    if (error.message.includes('أطول من ساعتين') || error.message.includes('غير متاح')) throw error;
    throw Error('لم أتمكن من قراءة مقطع YouTube الآن. تأكد أن الرابط لفيديو عام وغير مقيّد ثم حاول لاحقًا.');
  }
}

export async function youtubeAudioStream(id) {
  const child = spawn(binary, ['--no-config', '--no-playlist', '--no-warnings', '--no-progress', '--format', 'bestaudio', '--output', '-', videoUrl(id)], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-2000); });
  child.stdout.once('close', () => { if (!child.killed) child.kill(); });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('انتهت مهلة تجهيز صوت YouTube. حاول مرة أخرى.')), 30_000);
      const done = (error) => { clearTimeout(timer); child.stdout.off('readable', ready); child.off('error', failed); child.off('close', closed); error ? reject(error) : resolve(); };
      const ready = () => done();
      const failed = () => done(Error('تعذر بدء مشغّل YouTube على الخادم.'));
      const closed = () => done(Error(stderr.includes('unavailable') ? 'هذا الفيديو غير متاح للتشغيل. جرّب رابطًا آخر.' : 'تعذر الحصول على صوت هذا الفيديو. جرّب رابطًا آخر أو لاحقًا.'));
      child.stdout.once('readable', ready);
      child.once('error', failed);
      child.once('close', closed);
    });
    return child.stdout;
  } catch (error) { child.kill(); throw error; }
}
