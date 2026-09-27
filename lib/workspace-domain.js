export function problem(message, status = 400) { return Object.assign(new Error(message), { status, expose: true }); }
export { BOT_COMMAND_KEYS as supportedCommands } from './bot-catalog.js';
const ROLE_PERMISSION_MASK = Object.values(PermissionFlagsBits).reduce((mask, flag) => mask | flag, 0n);
const CHANNEL_PERMISSION_MASK = ROLE_PERMISSION_MASK & ~PermissionFlagsBits.Administrator;
export function manageable(guild) {
  const permissions = BigInt(guild.permissions || '0');
  return Boolean(guild.owner || (permissions & 32n) || (permissions & 8n));
}
export function normalizeOperations(input, snapshot) {
  if (!Array.isArray(input) || !input.length || input.length > 100) throw problem('أضف من 1 إلى 100 تغيير في المراجعة.');
  const keys = new Set();
  const plannedCategories = new Map();
  return input.map((item, index) => {
    if (!item || !['category', 'channel', 'role'].includes(item.resource_type)) throw problem('نوع العنصر غير مدعوم.');
    const action = item.action || 'create';
    if (!['create', 'update'].includes(action)) throw problem('هذه العملية غير مدعومة.');
    const name = String(item.name || '').trim();
    if (!name || name.length > 100 || /\[[^\]]+\]/.test(name)) throw problem('اكتب اسم العنصر النهائي دون خانات بين أقواس، بحد أقصى 100 حرف.');
    const op = { operation_key: `edit:${index}`, resource_type: item.resource_type, action, name };
    if (op.resource_type === 'category' && action === 'create') plannedCategories.set(name.toLowerCase(), op.operation_key);
    if (action === 'update') {
      const rows = op.resource_type === 'role' ? snapshot.roles : snapshot.channels;
      const resource = rows.find(row => row.id === String(item.resource_id));
      if (!resource || (op.resource_type === 'category' ? resource.type !== 4 : op.resource_type === 'channel' && resource.type === 4)) throw problem('العنصر لم يعد موجودًا في هذا السيرفر. حدّث البيانات.');
      if (op.resource_type === 'role' && (resource.managed || resource.id === snapshot.guildId)) throw problem('رتبة النظام لا يمكن تعديلها هنا.');
      if (keys.has(resource.id)) throw problem('اجمع تعديل العنصر في تغيير واحد.');
      keys.add(resource.id);
      op.resource_id = resource.id;
      op.before = { name: resource.name };
    }
    if (op.resource_type === 'channel') {
      if (action === 'create') {
        op.type = Number(item.type ?? 0);
        if (![0, 2, 15].includes(op.type)) throw problem('اختر قناة نصية أو صوتية أو منتدى.');
        if (item.access) {
          if (!['read_only', 'staff_only'].includes(item.access)) throw problem('إعداد وصول القناة غير مدعوم.');
          if (item.access === 'read_only' && op.type === 2) throw problem('القراءة فقط متاحة للقنوات النصية والمنتديات.');
          op.access = item.access;
          op.guild_id = snapshot.guildId;
          if (op.access === 'staff_only') {
            const role = snapshot.roles.find(row => row.id === String(item.staff_role_id) && row.id !== snapshot.guildId);
            if (!role) throw problem('اختر رتبة موجودة لقناة الفريق الخاصة.');
            op.staff_role_id = role.id;
          }
        }
        if (item.parent_name) {
          const parentName = String(item.parent_name).trim().toLowerCase();
          const planned = plannedCategories.get(parentName);
          const existing = snapshot.channels.find(row => row.type === 4 && row.name.toLowerCase() === parentName);
          if (planned) op.parent_key = planned;
          else if (existing) op.parent_id = existing.id;
          else throw problem(`التصنيف «${item.parent_name}» غير موجود. ضعه قبل القناة في الخطة.`);
        }
      }
      if (Object.hasOwn(item, 'parent_id')) {
        op.parent_id = item.parent_id || null;
        if (op.parent_id && !snapshot.channels.some(row => row.id === op.parent_id && row.type === 4)) throw problem('التصنيف المختار غير موجود.');
        if (action === 'update') op.before.parent_id = snapshot.channels.find(row => row.id === op.resource_id).parent_id ?? null;
      }
      if (Object.hasOwn(item, 'topic')) {
        const topic = String(item.topic || '').trim();
        const channelType = action === 'update' ? snapshot.channels.find(row => row.id === op.resource_id)?.type : op.type;
        if (![0, 15].includes(channelType)) throw problem('وصف القناة غير متاح لهذا النوع من القنوات.');
        if (topic.length > ([15,16].includes(channelType) ? 4096 : 1024)) throw problem('وصف القناة تجاوز الحد المسموح لنوعها.');
        op.topic = topic || null;
        if (action === 'update') op.before.topic = snapshot.channels.find(row => row.id === op.resource_id).topic ?? null;
      }
      if (Object.hasOwn(item, 'position')) {
        const position = Number(item.position);
        if (!Number.isInteger(position) || position < 0 || position > 500) throw problem('ترتيب القناة غير صالح.');
        op.position = position;
        if (action === 'update') {
          op.before.position = snapshot.channels.find(row => row.id === op.resource_id).position;
          op.position_changed = item.position_changed === true;
        }
      }
    }
    if (['channel','category'].includes(op.resource_type)) {
      const channel = action === 'update' ? snapshot.channels.find(row => row.id === op.resource_id) : null;
      const type = channel?.type ?? op.type ?? 4;
      for (const [key, max, types] of [['rate_limit_per_user',21600,[0,2,15]],['default_thread_rate_limit_per_user',21600,[0,15]],['bitrate',384000,[2]],['user_limit',99,[2]]]) {
        if (!Object.hasOwn(item,key)) continue;
        if (!types.includes(type)) throw problem(`هذا الإعداد لا يناسب نوع القناة: ${key}.`);
        const value = Number(item[key]);
        if (!Number.isInteger(value) || value < (key === 'bitrate' ? 8000 : 0) || value > max) throw problem(`قيمة ${key} خارج الحدود المسموحة.`);
        op[key] = value;
        if (channel) op.before[key] = channel[key] ?? 0;
      }
      for (const [key, types] of [['nsfw',[0,2,15]],['video_quality_mode',[2]]]) {
        if (!Object.hasOwn(item,key)) continue;
        if (!types.includes(type)) throw problem(`هذا الإعداد لا يناسب نوع القناة: ${key}.`);
        const value = key === 'nsfw' ? item[key] : Number(item[key]);
        if (key === 'nsfw' ? typeof value !== 'boolean' : ![1,2].includes(value)) throw problem(`قيمة ${key} غير صالحة.`);
        op[key] = value;
        if (channel) op.before[key] = channel[key] ?? (key === 'nsfw' ? false : 1);
      }
      if (Object.hasOwn(item, 'default_auto_archive_duration')) {
        if (![0,15].includes(type) || ![60,1440,4320,10080].includes(Number(item.default_auto_archive_duration))) throw problem('مدة أرشفة السلاسل غير صالحة لهذه القناة.');
        op.default_auto_archive_duration = Number(item.default_auto_archive_duration);
        if (channel) op.before.default_auto_archive_duration = channel.default_auto_archive_duration ?? 1440;
      }
      if (Object.hasOwn(item, 'rtc_region')) {
        if (type !== 2 || !(item.rtc_region === null || /^[a-z0-9-]{2,40}$/i.test(String(item.rtc_region)))) throw problem('منطقة الصوت غير صالحة.');
        op.rtc_region = item.rtc_region;
        if (channel) op.before.rtc_region = channel.rtc_region ?? null;
      }
      for (const [key, allowed] of [['default_sort_order',[0,1]],['default_forum_layout',[0,1,2]]]) if (Object.hasOwn(item,key)) {
        if (type !== 15 || !allowed.includes(Number(item[key]))) throw problem(`خيار المنتدى ${key} غير صالح.`);
        op[key] = Number(item[key]);
        if (channel) op.before[key] = channel[key] ?? 0;
      }
      if (Object.hasOwn(item, 'available_tags')) {
        if (type !== 15 || !Array.isArray(item.available_tags) || item.available_tags.length > 20) throw problem('وسوم المنتدى غير صالحة أو تتجاوز 20 وسمًا.');
        const tags = item.available_tags.map(tag => ({ ...(tag.id ? { id: String(tag.id) } : {}), name: String(tag.name || '').trim(), moderated: tag.moderated === true }));
        if (tags.some(tag => !tag.name || tag.name.length > 20 || tag.id && !channel?.available_tags?.some(existing => String(existing.id) === tag.id)) || new Set(tags.map(tag => tag.name.toLowerCase())).size !== tags.length) throw problem('اسم الوسم يجب أن يكون فريدًا ولا يتجاوز 20 حرفًا، ومعرف الوسم يجب أن يكون موجودًا.');
        op.available_tags = tags;
        if (channel) op.before.available_tags = (channel.available_tags || []).map(tag => ({ id: String(tag.id), name: tag.name, moderated: tag.moderated === true }));
      }
      if (Object.hasOwn(item,'permission_overwrites')) {
        if (!Array.isArray(item.permission_overwrites) || item.permission_overwrites.length > 100) throw problem('صلاحيات القناة كثيرة أو غير صالحة.');
        const seen = new Set();
        op.permission_overwrites = item.permission_overwrites.map(row => {
          const id = String(row.id || '');
          const type = Number(row.type);
          const role = snapshot.roles.find(entry => entry.id === id);
          if ((type === 0 && !role) || (type === 1 && !/^\d{15,22}$/.test(id)) || ![0,1].includes(type) || seen.has(id)) throw problem('قاعدة صلاحيات القناة تشير إلى رتبة أو عضو غير صالح.');
          seen.add(id);
          if (!/^\d+$/.test(String(row.allow ?? '0')) || !/^\d+$/.test(String(row.deny ?? '0'))) throw problem('صلاحيات القناة غير صالحة.');
          const allow = BigInt(row.allow || '0'), deny = BigInt(row.deny || '0');
          if (allow < 0n || deny < 0n || (allow & deny) !== 0n || ((allow | deny) & ~CHANNEL_PERMISSION_MASK) !== 0n) throw problem('صلاحيات القناة غير مدعومة أو متعارضة.');
          return { id, type, allow: String(allow), deny: String(deny) };
        });
        if (channel) op.before.permission_overwrites = (channel.permission_overwrites || []).map(row => ({ id: row.id, type: row.type, allow: String(row.allow || '0'), deny: String(row.deny || '0') }));
      }
    }
    if (op.resource_type === 'role' && Object.hasOwn(item, 'color')) {
      const color = Number(item.color);
      if (!Number.isInteger(color) || color < 0 || color > 0xffffff) throw problem('لون الرتبة غير صالح.');
      op.color = color;
      if (action === 'update') op.before.color = snapshot.roles.find(row => row.id === op.resource_id).color;
    }
    if (op.resource_type === 'role' && Object.hasOwn(item, 'colors')) {
      const colors = item.colors;
      if (!colors || typeof colors !== 'object') throw problem('ألوان الرتبة غير صالحة.');
      for (const key of ['primary_color','secondary_color','tertiary_color']) if (colors[key] !== null && (!Number.isInteger(colors[key]) || colors[key] < 0 || colors[key] > 0xffffff)) throw problem('قيمة لون الرتبة خارج الحدود.');
      if (!Number.isInteger(colors.primary_color)) throw problem('اختر لونًا أساسيًا للرتبة.');
      if (colors.tertiary_color !== null && (colors.primary_color !== 11127295 || colors.secondary_color !== 16759788 || colors.tertiary_color !== 16761760)) throw problem('ألوان النمط المجسم للرتبة غير صالحة.');
      op.colors = { primary_color: colors.primary_color, secondary_color: colors.secondary_color ?? null, tertiary_color: colors.tertiary_color ?? null };
      if (action === 'update') op.before.colors = snapshot.roles.find(row => row.id === op.resource_id).colors || { primary_color: snapshot.roles.find(row => row.id === op.resource_id).color || 0, secondary_color: null, tertiary_color: null };
      delete op.color; delete op.before?.color;
    }
    if (op.resource_type === 'role' && Object.hasOwn(item, 'unicode_emoji')) {
      const emoji = item.unicode_emoji === null ? null : String(item.unicode_emoji).trim();
      if (emoji && (emoji.length > 16 || !/\p{Extended_Pictographic}/u.test(emoji) || [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(emoji)].length !== 1)) throw problem('اختر إيموجي Unicode واحدًا لرمز الرتبة.');
      op.unicode_emoji = emoji || null;
      if (action === 'update') op.before.unicode_emoji = snapshot.roles.find(row => row.id === op.resource_id).unicode_emoji ?? null;
    }
    if (op.resource_type === 'role' && Object.hasOwn(item, 'icon')) {
      const icon = item.icon;
      if (icon !== null && (typeof icon !== 'string' || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(icon) || icon.length > 350000)) throw problem('رمز الرتبة يجب أن يكون صورة PNG أو JPEG أو WebP ثابتة بحجم لا يتجاوز 256 كيلوبايت.');
      op.icon = icon;
      if (action === 'update') op.before.icon = snapshot.roles.find(row => row.id === op.resource_id).icon ?? null;
    }
    if (op.resource_type === 'role' && op.icon && op.unicode_emoji) throw problem('اختر صورة أو إيموجي واحدًا فقط لرمز الرتبة.');
    if (op.resource_type === 'role' && action === 'update' && (Object.hasOwn(op, 'icon') || Object.hasOwn(op, 'unicode_emoji'))) {
      const role = snapshot.roles.find(row => row.id === op.resource_id);
      op.before.icon = role.icon ?? null;
      op.before.unicode_emoji = role.unicode_emoji ?? null;
    }
    if (op.resource_type === 'role' && Object.hasOwn(item, 'position')) {
      const position = Number(item.position);
      if (!Number.isInteger(position) || position < 1 || position > 500) throw problem('ترتيب الرتبة غير صالح.');
      op.position = position;
      if (action === 'update') op.before.position = snapshot.roles.find(row => row.id === op.resource_id).position;
    }
    if (op.resource_type === 'role') {
      const role = action === 'update' ? snapshot.roles.find(row => row.id === op.resource_id) : null;
      for (const key of ['hoist','mentionable']) if (Object.hasOwn(item,key)) {
        if (typeof item[key] !== 'boolean') throw problem('خيارات إظهار الرتبة والإشارة إليها غير صالحة.');
        op[key] = item[key]; if (role) op.before[key] = role[key] === true;
      }
      if (Object.hasOwn(item,'permissions')) {
        if (!/^\d+$/.test(String(item.permissions))) throw problem('صلاحيات الرتبة غير صالحة.');
        const value = BigInt(item.permissions);
        if (value < 0n || (value & ~ROLE_PERMISSION_MASK) !== 0n) throw problem('صلاحيات الرتبة غير مدعومة.');
        if ((value & PermissionFlagsBits.Administrator) !== 0n && (BigInt(role?.permissions || '0') & PermissionFlagsBits.Administrator) === 0n && item.confirm_admin !== true) throw problem('تفعيل Administrator يحتاج تأكيدًا صريحًا في المراجعة.');
        op.permissions = String(value); if (role) op.before.permissions = String(role.permissions || '0');
      }
    }
    return op;
  });
}
export function operationBody(op, parentId) {
  const body = { name: op.name };
  if ((op.action || 'create') === 'create') {
    if (op.resource_type === 'category') body.type = 4;
    else if (op.resource_type === 'channel') body.type = op.type ?? 0;
    else body.mentionable = false;
  }
  if (op.resource_type === 'channel' && (op.parent_key || Object.hasOwn(op, 'parent_id'))) body.parent_id = parentId ?? op.parent_id ?? null;
  if (op.resource_type === 'channel' && op.action === 'create' && op.access === 'read_only') body.permission_overwrites = [{ id: op.guild_id, type: 0, allow: '0', deny: String(PermissionFlagsBits.SendMessages) }];
  if (op.resource_type === 'channel' && op.action === 'create' && op.access === 'staff_only') body.permission_overwrites = [
    { id: op.guild_id, type: 0, allow: '0', deny: String(PermissionFlagsBits.ViewChannel) },
    { id: op.staff_role_id, type: 0, allow: String(PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory | PermissionFlagsBits.SendMessages), deny: '0' },
  ];
  if (op.resource_type === 'channel' && Object.hasOwn(op, 'topic') && (op.type ?? 0) !== 2) body.topic = op.topic;
  if (op.resource_type === 'role' && Object.hasOwn(op, 'color')) body.color = op.color;
  for (const key of ['rate_limit_per_user','default_thread_rate_limit_per_user','default_auto_archive_duration','bitrate','user_limit','rtc_region','nsfw','video_quality_mode','default_sort_order','default_forum_layout','available_tags','permission_overwrites','permissions','hoist','mentionable','colors','unicode_emoji','icon']) if (Object.hasOwn(op,key)) body[key] = op[key];
  if (Object.hasOwn(op, 'unicode_emoji') && op.unicode_emoji) body.icon = null;
  return body;
}
function bitChanges(a, b) {
  let value = BigInt(a || '0') ^ BigInt(b || '0'), count = 0;
  while (value) { value &= value - 1n; count++; }
  return count;
}
export function operationUnits(op) {
  if (op.action !== 'update') return 1;
  const before = op.before || {};
  let units = 0;
  for (const key of ['name','parent_id','topic','position','color','colors','hoist','mentionable','rate_limit_per_user','default_thread_rate_limit_per_user','default_auto_archive_duration','bitrate','user_limit','rtc_region','nsfw','video_quality_mode','default_sort_order','default_forum_layout','available_tags']) {
    const colors = value => JSON.stringify(['primary_color','secondary_color','tertiary_color'].map(field => value?.[field] ?? null));
    if (Object.hasOwn(op,key) && (key === 'position' && op.position_changed || (key === 'colors' ? colors(op[key]) !== colors(before[key]) : key === 'available_tags' ? JSON.stringify(op[key] || []) !== JSON.stringify(before[key] || []) : String(op[key] ?? '') !== String(before[key] ?? '')))) units++;
  }
  if (Object.hasOwn(op,'icon') || Object.hasOwn(op,'unicode_emoji')) {
    const oldIcon = before.icon || before.unicode_emoji || null;
    const newIcon = Object.hasOwn(op,'icon') && op.icon ? op.icon : Object.hasOwn(op,'unicode_emoji') && op.unicode_emoji ? op.unicode_emoji : Object.hasOwn(op,'icon') || Object.hasOwn(op,'unicode_emoji') ? null : oldIcon;
    if (oldIcon !== newIcon) units++;
  }
  if (Object.hasOwn(op,'permissions')) units += bitChanges(op.permissions, before.permissions);
  if (Object.hasOwn(op,'permission_overwrites')) {
    const old = new Map((before.permission_overwrites || []).map(row => [String(row.id),row]));
    const next = new Map(op.permission_overwrites.map(row => [String(row.id),row]));
    for (const id of new Set([...old.keys(),...next.keys()])) {
      const previous = old.get(id), current = next.get(id);
      let bits = BigInt(previous?.allow || '0') | BigInt(previous?.deny || '0') | BigInt(current?.allow || '0') | BigInt(current?.deny || '0');
      for (let bit = 1n; bits; bit <<= 1n) if (bits & bit) {
        const state = row => (BigInt(row?.allow || '0') & bit) ? 'allow' : (BigInt(row?.deny || '0') & bit) ? 'deny' : 'inherit';
        if (state(previous) !== state(current)) units++;
        bits &= ~bit;
      }
    }
  }
  return units;
}
export function planUsageUnits(operations) { return operations.reduce((total, op) => total + operationUnits(op), 0); }
export function channelReorderEntries(channels, resource, requestedPosition) {
  const parentId = resource.parent_id || null;
  const siblings = channels.filter(channel => resource.type === 4
    ? channel.type === 4
    : channel.type !== 4 && (channel.parent_id || null) === parentId);
  const ordered = siblings.filter(channel => channel.id !== resource.id)
    .sort((a, b) => Number(a.position || 0) - Number(b.position || 0) || String(a.id).localeCompare(String(b.id)));
  ordered.splice(Math.min(Math.max(0, requestedPosition), ordered.length), 0, resource);
  return ordered.map((channel, position) => ({ id: channel.id, position }));
}
export function resolveExisting(op, snapshot, parentId) {
  const rows = op.resource_type === 'role' ? snapshot.roles : snapshot.channels;
  if (op.action === 'update') return rows.find(row => row.id === op.resource_id);
  const expectedType = op.resource_type === 'category' ? 4 : (op.type ?? 0);
  const matches = rows.filter(row => row.name.toLowerCase() === op.name.toLowerCase()
    && (op.resource_type === 'role' || row.type === expectedType)
    && (op.resource_type !== 'channel' || (row.parent_id ?? null) === (parentId ?? op.parent_id ?? null)));
  if (matches.length > 1) throw problem(`يوجد أكثر من عنصر باسم «${op.name}». راجع الأسماء قبل المتابعة.`, 409);
  return matches[0];
}
export function checkExistingAccess(op, resource) {
  if (!resource) return;
  // Updates are intentionally changing the resource; this comparison is only for reusing a create.
  if (op.action === 'update') return;
  if (op.action !== 'update') {
    const expected = operationBody(op);
    for (const key of ['permissions','color','hoist','mentionable','topic','rate_limit_per_user','default_thread_rate_limit_per_user','bitrate','user_limit','nsfw','video_quality_mode']) {
      if (!Object.hasOwn(expected,key)) continue;
      if (String(resource[key] ?? '') !== String(expected[key] ?? '')) throw problem(`العنصر «${op.name}» موجود لكن إعداد «${key}» مختلف. عدّل الموجود أو غيّر الاسم.`, 409);
    }
  }
  if (!op.access && !Object.hasOwn(op,'permission_overwrites')) return;
  const overwrites = Array.isArray(resource.permission_overwrites) ? resource.permission_overwrites : [];
  if (Object.hasOwn(op,'permission_overwrites')) {
    const normalize = rows => rows.map(row => `${row.id}:${row.type}:${row.allow || '0'}:${row.deny || '0'}`).sort().join('|');
    if (normalize(overwrites) !== normalize(op.permission_overwrites)) throw problem(`القناة «${op.name}» موجودة لكن صلاحياتها تختلف عن المراجعة.`, 409);
    return;
  }
  const everyone = overwrites.find(row => row.id === op.guild_id);
  const denied = BigInt(everyone?.deny || '0');
  if (op.access === 'read_only' && (denied & PermissionFlagsBits.SendMessages) !== 0n) return;
  if (op.access === 'staff_only') {
    const staff = overwrites.find(row => row.id === op.staff_role_id);
    if ((denied & PermissionFlagsBits.ViewChannel) !== 0n && (BigInt(staff?.allow || '0') & PermissionFlagsBits.ViewChannel) !== 0n) return;
  }
  throw problem(`القناة «${op.name}» موجودة لكن صلاحياتها مختلفة عن الخطة. راجعها قبل المتابعة.`, 409);
}
export function checkConflict(op, resource) {
  if (op.action !== 'update') return;
  if (!resource) throw problem(`العنصر «${op.name}» لم يعد موجودًا. أنشئ مراجعة جديدة.`, 409);
  const canonical = (key, value) => key === 'permission_overwrites'
    ? (value || []).map(row => ({ id: String(row.id), type: Number(row.type), allow: String(row.allow || '0'), deny: String(row.deny || '0') })).sort((a,b) => a.id.localeCompare(b.id))
    : key === 'available_tags'
      ? (value || []).map(row => ({ id: String(row.id || ''), name: String(row.name), moderated: row.moderated === true }))
      : key === 'colors' ? { primary_color: value?.primary_color ?? null, secondary_color: value?.secondary_color ?? null, tertiary_color: value?.tertiary_color ?? null }
      : value ?? null;
  const same = (key, a, b) => JSON.stringify(canonical(key, a)) === JSON.stringify(canonical(key, b));
  const changed = Object.entries(op.before || {}).some(([key, value]) => !same(key, resource[key], value));
  // A prior request may have succeeded at Discord before its response was lost.
  const alreadyApplied = Object.entries(operationBody(op)).every(([key, value]) => same(key, resource[key], value));
  if (changed && !alreadyApplied) throw problem(`تغيّر «${resource.name}» خارج هذه المراجعة. حدّث السيرفر وأنشئ مراجعة جديدة.`, 409);
}
export function connectionState(response) {
  if (response.ok) return 'installed';
  if (response.status === 404) return 'install_required';
  if (response.status === 403) return 'permissions_insufficient';
  return 'unavailable';
}
export function normalizeSchedule(body, now = Date.now()) {
  const content = String(body.content || '').trim();
  const runAt = new Date(body.run_at);
  if (!content || content.length > 2000) throw problem('اكتب رسالة من 1 إلى 2000 حرف.');
  if (!Number.isFinite(runAt.getTime()) || runAt.getTime() < now + 60_000) throw problem('اختر موعدًا بعد دقيقة على الأقل.');
  if (!['once', 'daily', 'weekly'].includes(body.repeat)) throw problem('اختر تكرارًا صالحًا.');
  const timezone = String(body.timezone || 'UTC');
  try { new Intl.DateTimeFormat('ar', { timeZone: timezone }).format(); } catch { throw problem('المنطقة الزمنية غير صالحة.'); }
  return { content, run_at: runAt.toISOString(), repeat: body.repeat, timezone, channel_id: String(body.channel_id || '') };
}
import { PermissionFlagsBits } from 'discord.js';
