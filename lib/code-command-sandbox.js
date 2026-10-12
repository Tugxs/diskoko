import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {parseCodeProject,PROJECT_LIMIT} from './code-project.js';

const active = new Set();
const tenants = new Set();
export const CODE_LIMIT = PROJECT_LIMIT;
export function codeSource(value) {
  if(typeof value!=='string' || !value.trim())throw new Error('Provide JavaScript source or a project JSON document.');
  if(Buffer.byteLength(value)>CODE_LIMIT)throw new Error('Project source exceeds 128 KB.');
  parseCodeProject(value);
  return value;
}
export async function runCode(source, context, tenant = 'preview', options = {}) {
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
    let settled = false;const controller=new AbortController();
    const finish = (error, result) => {
      if (settled) return;
      settled = true; controller.abort();clearTimeout(timer); active.delete(child); tenants.delete(tenant); child.kill();
      error ? reject(error) : resolve(result);
    };
    const timer = setTimeout(() => finish(new Error('توقف الكود لتجاوز وقت التنفيذ المسموح.')), options.bridge ? 20000 : 2000);
    child.once('error', error => finish(error));
    child.once('exit', () => finish(new Error('توقف تنفيذ الكود. راجع الذاكرة أو صيغة الكود.')));
    let calls=0;
    child.on('message', async message => {
      if(settled)return;
      if(message.type==='rpc'){
        try{
          if(!options.bridge || ++calls>16 || typeof message.args!=='string' || message.args.length>24000)throw new Error('Project API access is unavailable or exceeded.');
          const value=await options.bridge(message.method,JSON.parse(message.args),controller.signal);
          if(JSON.stringify(value ?? null).length>24000)throw new Error('API response exceeds 24 KB.');
          if(!settled)child.send({type:'rpc-result',id:message.id,value});
        }catch(error){if(!settled)child.send({type:'rpc-result',id:message.id,error:String(error.message).slice(0,400)});}
        return;
      }
      options.onLogs?.(Array.isArray(message.logs)?message.logs.slice(0,40).map(item=>String(item).slice(0,300)):[]);
      finish(message.error ? new Error(message.error) : null, message.output);
    });
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
  let parsed;try{parsed=new URL(value);}catch{throw new Error('Use a valid HTTPS URL.');}
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
      if (!title && !description && !e.image && !e.thumbnail && !e.fields?.length && !e.author && !e.footer) throw new Error('البطاقة فارغة.');
      total += (title?.length || 0) + (description?.length || 0);
      const fields=e.fields || [];
      if(!Array.isArray(fields) || fields.length>25)throw new Error('Embed supports up to 25 fields.');
      const safeFields=fields.map(f=>{const name=text(f.name,256,true),value=text(f.value,1024,true);total+=name.length+value.length;return {name,value,inline:f.inline===true};});
      let author,footer,timestamp;
      if(e.author){author={name:text(e.author.name,256,true),...(e.author.url?{url:url(e.author.url)}:{}),...(e.author.icon_url?{icon_url:url(e.author.icon_url)}:{})};total+=author.name.length;}
      if(e.footer){footer={text:text(e.footer.text,2048,true),...(e.footer.icon_url?{icon_url:url(e.footer.icon_url)}:{})};total+=footer.text.length;}
      if(e.timestamp){if(typeof e.timestamp!=='string' || e.timestamp.length>50 || !Number.isFinite(Date.parse(e.timestamp)))throw new Error('Invalid embed timestamp.');timestamp=new Date(e.timestamp).toISOString();}
      const color = e.color === undefined ? 0x8b70ef : e.color;
      if (!Number.isInteger(color) || color < 0 || color > 0xffffff) throw new Error('لون البطاقة غير صالح.');
      return { title, description, color, ...(safeFields.length?{fields:safeFields}:{}),...(author?{author}:{}),...(footer?{footer}:{}),...(timestamp?{timestamp}:{}),...(e.url?{url:url(e.url)}:{}), ...(e.image ? { image: { url: url(typeof e.image==='string'?e.image:e.image.url) } } : {}), ...(e.thumbnail ? { thumbnail: { url: url(typeof e.thumbnail==='string'?e.thumbnail:e.thumbnail.url) } } : {}) };
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
