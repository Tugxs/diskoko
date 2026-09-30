import { Shoukaku, Connectors } from 'shoukaku';

const managers = new WeakMap();

export function lavalinkConfigured(guildId = '') {
  const allowed = String(process.env.LAVALINK_TEST_GUILDS || '').split(',').map(value => value.trim()).filter(Boolean);
  return Boolean(process.env.LAVALINK_HOST && process.env.LAVALINK_PASSWORD && (!allowed.length || allowed.includes(String(guildId))));
}

export async function lavalinkFor(client, guildId = '') {
  if (!lavalinkConfigured(guildId)) throw Error('مشغّل الموسيقى الخارجي غير مهيأ لهذا السيرفر الآن. استخدم رابط ملف صوتي مباشر أو اطلب من إدارة ديسكوكو تفعيل Lavalink.');
  let entry = managers.get(client);
  if (!entry) {
    const host = process.env.LAVALINK_HOST.trim();
    const port = Number(process.env.LAVALINK_PORT || 443);
    if (!/^[a-zA-Z0-9.-]+$/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) throw Error('إعداد خادم الموسيقى غير صالح.');
    const node = { name: 'diskoko-audio', url: `${host}:${port}`, auth: process.env.LAVALINK_PASSWORD, secure: process.env.LAVALINK_SECURE !== 'false' };
    const manager = new Shoukaku(new Connectors.DiscordJS(client), [node], { resume: false, reconnectTries: 3, reconnectInterval: 5 });
    manager.on('error', (name, error) => console.error('Lavalink node error', { name, error: error?.message || String(error) }));
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        managers.delete(client);
        reject(Error('خادم الموسيقى لا يستجيب الآن. حاول بعد قليل.'));
      }, 15_000);
      const check = () => {
        const current = manager.getIdealNode();
        if (current) { clearTimeout(timer); resolve(manager); }
      };
      manager.once('ready', check);
      check();
    });
    entry = { manager, ready };
    managers.set(client, entry);
    // Shoukaku normally starts its nodes on clientReady. This manager is
    // created on the first music request, after that event has fired.
    if (client.isReady()) manager.connector.ready([node]);
  }
  return entry.ready;
}

export async function resolveLavalinkTrack(client, url, guildId = '') {
  const manager = await lavalinkFor(client, guildId);
  const node = manager.getIdealNode();
  if (!node) throw Error('خادم الموسيقى غير متصل الآن. حاول بعد قليل.');
  let result;
  try { result = await node.rest.resolve(url); }
  catch (error) { console.error('Lavalink track lookup failed', { error: error?.message || String(error) }); throw Error('تعذر قراءة المقطع من خادم الموسيقى. جرّب رابطًا عامًا آخر أو حاول لاحقًا.'); }
  const track = result?.data?.encoded ? result.data : result?.data?.tracks?.[0] || result?.tracks?.[0];
  if (!track?.encoded) throw Error('لم يجد خادم الموسيقى صوتًا متاحًا لهذا الرابط. افتحه في YouTube وتأكد أنه عام، ثم جرّب مقطعًا آخر.');
  const duration = Number(track.info?.length || 0) / 1000;
  if (duration > 7200) throw Error('المقطع أطول من ساعتين. اختر مقطعًا أقصر.');
  return { kind: 'lavalink', url, encoded: track.encoded, title: String(track.info?.title || 'مقطع صوتي').slice(0, 100), duration, id: track.info?.identifier || '' };
}

export function stopLavalinkFor(client) {
  const entry = managers.get(client);
  if (!entry) return;
  managers.delete(client);
  try { entry.manager.removeNode('diskoko-audio', 'Customer bot disconnected'); } catch { /* already closed */ }
}

