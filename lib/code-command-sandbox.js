import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const active = new Set();
const tenants = new Set();
export const CODE_LIMIT = 24_000;
export function codeSource(value) {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value) > CODE_LIMIT) throw new Error('اكتب كود JavaScript لا يتجاوز 24 KB ويحتوي على الدالة handle(ctx).');
  return value;
}
export async function runCode(source, context, tenant = 'preview') {
  codeSource(source);
  if (active.size >= 2 || tenants.has(tenant)) throw Object.assign(new Error('هناك تنفيذ جارٍ. انتظر قليلًا ثم حاول مجددًا.'),{code:'CODE_BUSY',status:429,expose:true});
  if (JSON.stringify(context).length > 24_000) throw new Error('بيانات التجربة أكبر من الحد المسموح.');
  tenants.add(tenant);
  return new Promise((resolve, reject) => {
    // Do not inherit NODE_OPTIONS, tokens, database credentials or the parent's flags.
    const child = fork(fileURLToPath(new URL('./code-command-worker.js', import.meta.url)), [], {
      env: {}, execArgv: ['--max-old-space-size=64'], stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true,
    });
    active.add(child);
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true; clearTimeout(timer); active.delete(child); tenants.delete(tenant); child.kill();
      error ? reject(error) : resolve(result);
    };
    const timer = setTimeout(() => finish(new Error('توقف الكود لتجاوز وقت التنفيذ المسموح.')), 2000);
    child.once('error', error => finish(error));
    child.once('exit', () => finish(new Error('توقف تنفيذ الكود. راجع الذاكرة أو صيغة الكود.')));
    child.once('message', message => finish(message.error ? new Error(message.error) : null, message.output));
    child.send({ source, context });
  });
}

const text = (value, max, required = false) => {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`نص غير صالح أو يتجاوز ${max} حرفًا.`);
  return value;
};
const action = value => {
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(value)) throw new Error('معرّف الإجراء من 1 إلى 32 حرفًا لاتينيًا أو رقمًا.');
  return value;
};
const url = value => {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || value.length > 500) throw new Error('استخدم رابط HTTPS صالحًا.');
  return value;
};
export function normalizeCodeOutput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('يجب أن تُرجع handle كائنًا يحتوي message أو modal.');
  if (Object.keys(raw).some(key => !['message', 'modal', 'state'].includes(key))) throw new Error('النتيجة تحتوي قدرة غير مدعومة. المتاح: message وmodal وstate.');
  if (Boolean(raw.message) === Boolean(raw.modal)) throw new Error('أرجع message أو modal، واحدًا فقط.');
  const result = {};
  if (raw.state !== undefined) {
    if (!raw.state || typeof raw.state !== 'object' || Array.isArray(raw.state) || JSON.stringify(raw.state).length > 8000) throw new Error('الحالة يجب أن تكون كائنًا لا يتجاوز 8 KB.');
    result.state = JSON.parse(JSON.stringify(raw.state));
  }
  if (raw.modal) {
    const m = raw.modal;
    if (!Array.isArray(m.fields) || !m.fields.length || m.fields.length > 5) throw new Error('النموذج يحتاج من 1 إلى 5 حقول.');
    const ids = new Set();
    result.modal = { title: text(m.title, 45, true), action: action(m.action), fields: m.fields.map(f => {
      const id = action(f.id); if (ids.has(id)) throw new Error('معرّفات حقول النموذج مكررة.'); ids.add(id);
      return { id, label: text(f.label, 45, true), placeholder: text(f.placeholder, 100), paragraph: f.paragraph === true, required: f.required !== false };
    }) };
  } else {
    const m = raw.message;
    const embeds = m.embeds === undefined ? [] : m.embeds;
    if (!Array.isArray(embeds) || embeds.length > 3) throw new Error('أضف حتى 3 بطاقات.');
    let total = 0;
    result.message = { content: text(m.content, 2000), embeds: embeds.map(e => {
      const title = text(e.title, 256), description = text(e.description, 4096);
      if (!title && !description && !e.image) throw new Error('البطاقة فارغة.');
      total += (title?.length || 0) + (description?.length || 0);
      const color = e.color === undefined ? 0x8b70ef : e.color;
      if (!Number.isInteger(color) || color < 0 || color > 0xffffff) throw new Error('لون البطاقة غير صالح.');
      return { title, description, color, ...(e.image ? { image: { url: url(e.image) } } : {}), ...(e.thumbnail ? { thumbnail: { url: url(e.thumbnail) } } : {}) };
    }), controls: [] };
    if (total > 6000) throw new Error('نص البطاقات يتجاوز 6000 حرف.');
    const controls = m.controls === undefined ? [] : m.controls;
    if (!Array.isArray(controls) || controls.length > 5) throw new Error('أضف حتى 5 أزرار أو قوائم.');
    const ids = new Set();
    result.message.controls = controls.map(c => {
      if (c.type === 'link') return { type: 'link', label: text(c.label, 80, true), url: url(c.url) };
      const id = action(c.action); if (ids.has(id)) throw new Error('معرّفات الإجراءات مكررة.'); ids.add(id);
      if (c.type === 'button') return { type: 'button', action: id, label: text(c.label, 80, true), style: [1,2,3,4].includes(c.style) ? c.style : 2 };
      if (c.type === 'select') {
        if (!Array.isArray(c.options) || !c.options.length || c.options.length > 25) throw new Error('القائمة تحتاج من 1 إلى 25 خيارًا.');
        const values = new Set();
        return { type: 'select', action: id, placeholder: text(c.placeholder, 150), options: c.options.map(o => {
          const value = text(o.value, 100, true); if (values.has(value)) throw new Error('قيم خيارات القائمة مكررة.'); values.add(value);
          return { label: text(o.label, 100, true), value, description: text(o.description, 100) };
        }) };
      }
      throw new Error('نوع العنصر غير مدعوم. استخدم button أو select أو link.');
    });
    if (!result.message.content && !result.message.embeds.length) throw new Error('الرسالة فارغة.');
  }
  return result;
}
