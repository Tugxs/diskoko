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
          if(!options.bridge || ++calls>16 || typeof message.args!=='string' || message.args.length>64000)throw new Error('Project API access is unavailable or exceeded.');
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
// Compatibility for already published control-center projects; retain strict limits for custom labels.
const legacyCenterLabels = new Map([
  ['نوع الحماية: spam/link/bots/create/delete/join', ['نوع الحماية', 'spam/link/bots/join']],
  ['الأنواع: tasbih,tahmid,takbir,istighfar,salat,hawqala,ayat,dua', ['أنواع الأذكار (مفصولة بفاصلة)', 'tasbih,tahmid,takbir,istighfar,salat,hawqala,ayat,dua']],
  ['دقائق ثابتة: 1/5/10/30/60 أو random3-8/5-15/10-30', ['الفترة بالدقائق أو عشوائية', '1/5/10/30/60 أو random3-8/random5-15/random10-30']],
]);
export function normalizeCodeOutput(raw,{panelFooter,centerFeatures=false}={}) {
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
      const legacy = ['dhikr_save','form_aprot','form_dprot'].includes(m.action) ? legacyCenterLabels.get(f.label) : undefined;
      return { id, label: text(legacy ? legacy[0] : f.label, 45, true), placeholder: text(f.placeholder ?? legacy?.[1], 100), paragraph: f.paragraph === true, required: f.required !== false };
    }) };
  } else {
    const m = raw.message;
    const files=m.files || [];if(!Array.isArray(files) || files.length>1)throw new Error('حتى ملف PNG واحد للبطاقة.');
    const safeFiles=files.map(f=>{if(f.name!=='circle.png' || typeof f.data!=='string' || f.data.length>16000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(f.data) || !Buffer.from(f.data,'base64').subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('ملف صورة البطاقة غير صالح.');return {name:f.name,data:f.data};});
    const mediaUrl=value=>value==='attachment://circle.png' && safeFiles.length?value:url(value);
    const embeds = m.embeds === undefined ? [] : m.embeds;
    if (!Array.isArray(embeds) || embeds.length > 3) throw new Error('أضف حتى 3 بطاقات.');
    let total = 0;
    result.message = { content: text(m.content, 2000), embeds: embeds.map(e => {
      const title = text(e.title, 256), description = text(e.description, 4096);
      if (!title && !description && !e.image && !e.thumbnail && !e.fields?.length && !e.author && !e.footer) throw new Error('البطاقة فارغة.');
      total += (title?.length || 0) + (description?.length || 0);
      const fields=e.fields || [];
      if(!Array.isArray(fields) || fields.length>25)throw new Error('Embed supports up to 25 fields.');
      const safeFields=fields.filter(f=>!centerFeatures || !/`[^`]*\baivoice`/.test(String(f.value))).map(f=>{const name=text(f.name,256,true),value=text(f.value,1024,true);total+=name.length+value.length;return {name,value,inline:f.inline===true};});
      let author,footer,timestamp;
      if(e.author){author={name:text(e.author.name,256,true),...(e.author.url?{url:url(e.author.url)}:{}),...(e.author.icon_url?{icon_url:url(e.author.icon_url)}:{})};total+=author.name.length;}
      if(e.footer && !(e.footer.text==='ديسكوكو · مركز التحكم بالسيرفر' && panelFooter==='')){footer={text:text(e.footer.text==='ديسكوكو · مركز التحكم بالسيرفر' && panelFooter!==undefined?panelFooter:e.footer.text,2048,true),...(e.footer.icon_url?{icon_url:url(e.footer.icon_url)}:{})};total+=footer.text.length;}
      if(e.timestamp){if(typeof e.timestamp!=='string' || e.timestamp.length>50 || !Number.isFinite(Date.parse(e.timestamp)))throw new Error('Invalid embed timestamp.');timestamp=new Date(e.timestamp).toISOString();}
      const color = e.color === undefined ? 0x8b70ef : e.color;
      if (!Number.isInteger(color) || color < 0 || color > 0xffffff) throw new Error('لون البطاقة غير صالح.');
      return { title, description, color, ...(safeFields.length?{fields:safeFields}:{}),...(author?{author}:{}),...(footer?{footer}:{}),...(timestamp?{timestamp}:{}),...(e.url?{url:url(e.url)}:{}), ...(e.image ? { image: { url: mediaUrl(typeof e.image==='string'?e.image:e.image.url) } } : {}), ...(e.thumbnail ? { thumbnail: { url: mediaUrl(typeof e.thumbnail==='string'?e.thumbnail:e.thumbnail.url) } } : {}) };
    }), controls: [] };
    if (total > 6000) throw new Error('نص البطاقات يتجاوز 6000 حرف.');
    if(safeFiles.length)result.message.files=safeFiles;
    const controls = m.controls === undefined ? [] : m.controls;
    if (!Array.isArray(controls) || controls.length > 25) throw new Error('أضف حتى 25 زرًا موزعة على 5 صفوف.');
    const ids = new Set();
    const visibleControls=centerFeatures?controls.filter(c=>!['op_aivoice','form_aivoice','aivoice'].includes(c.action)).map(c=>c.type==='select' && Array.isArray(c.options)?{...c,options:c.options.filter(o=>o.value!=='aivoice')}:c).filter(c=>c.type!=='select' || !Array.isArray(c.options) || c.options.length):controls;
    result.message.controls = visibleControls.map(c => {
      if(c.row!==undefined && (!Number.isInteger(c.row) || c.row<0 || c.row>4))throw new Error('رقم صف الزر من 0 إلى 4.');
      const placement=c.row===undefined?{}:{row:c.row};
      const available=centerFeatures && ['op_anticreate','op_antidelete'].includes(c.action) && typeof c.label==='string' && c.label.endsWith(' · قريبًا');
      if(c.disabled===true && !available)placement.disabled=true;
      if(c.emoji){const value=text(c.emoji,100,true),custom=value.match(/^<(a?):([a-zA-Z0-9_]{2,32}):(\d{17,20})>$/);placement.emoji=custom?{id:custom[3],name:custom[2],animated:custom[1]==='a'}:/^\d{17,20}$/.test(value)?{id:value}:{name:value};}
      if (c.type === 'link') return { ...placement,type: 'link', label: text(c.label, 80, true), url: url(c.url) };
      const id = action(c.action); if (ids.has(id)) throw new Error('معرّفات الإجراءات مكررة.'); ids.add(id);
      if (c.type === 'button') return { ...placement,type: 'button', action: id, label: text(available?c.label.replace(/ · قريبًا$/,''):c.label, 80, true), style: [1,2,3,4].includes(c.style) ? c.style : 2 };
      if (c.type === 'select') {
        if (!Array.isArray(c.options) || !c.options.length || c.options.length > 25) throw new Error('القائمة تحتاج من 1 إلى 25 خيارًا.');
        const values = new Set();
        const min=c.minValues ?? 1,max=c.maxValues ?? 1;
        if(!Number.isInteger(min) || !Number.isInteger(max) || min<1 || max<min || max>c.options.length)throw new Error('حدود اختيار القائمة غير صالحة.');
        if(c.options.filter(o=>o.default===true).length>max)throw new Error('الاختيارات الافتراضية تتجاوز حد القائمة.');
        return { ...placement,type: 'select', action: id, ...(c.minValues!==undefined?{minValues:min}:{}), ...(c.maxValues!==undefined?{maxValues:max}:{}), placeholder: text(c.placeholder, 150), options: c.options.map(o => {
          const value = text(o.value, 100, true); if (values.has(value)) throw new Error('قيم خيارات القائمة مكررة.'); values.add(value);
          return { label: text(o.label, 100, true), value, description: text(o.description, 100), ...(o.default===true?{default:true}:{}) };
        }) };
      }
      throw new Error('نوع العنصر غير مدعوم. استخدم button أو select أو link.');
    });
    // Validate Discord's real component budget before attempting an API request.
    componentRows(result.message.controls);
    if (!result.message.content && !result.message.embeds.length) throw new Error('الرسالة فارغة.');
  }
  return result;
}

export function componentRows(controls){
 const rows=[];let cursor=0;
 for(const c of controls){let n=c.row;
  if(n===undefined){n=cursor;if(rows[n]?.length && (c.type==='select' || rows[n][0].type==='select' || rows[n].length===5))n=++cursor;}
  if(n>4)throw new Error('Discord يسمح بخمسة صفوف فقط.');
  rows[n] ??=[];
  if(rows[n].length && (c.type==='select' || rows[n][0].type==='select') || rows[n].length>=5)throw new Error('الصف يحتوي حتى خمسة أزرار أو قائمة واحدة.');
  rows[n].push(c);cursor=Math.max(cursor,n);
 }
 return rows.filter(Boolean);
}
