import { normalizeReadyDefinition } from './ready-templates.js';
import { problem } from './workspace-domain.js';

export const TEMPLATE_FORMAT = 'diskoko-server-template';
export function importServerTemplate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.format !== TEMPLATE_FORMAT || value.version !== 1) throw problem('اختر ملف قالب ديسكوكو بإصدار مدعوم.');
  if (Buffer.byteLength(JSON.stringify(value)) > 5_000_000) throw problem('حجم القالب يتجاوز 5 ميجابايت.');
  const features = value.definition?.features || {};
  const unknown = Object.keys(features).filter(key => !['welcome', 'ticket', 'logs', 'guides', 'modules'].includes(key));
  if (unknown.length) throw problem(`القالب يحتوي ميزات غير مدعومة: ${unknown.join('، ')}. لن يتم تجاهلها أو تفعيلها تلقائيًا.`);
  const definition = normalizeReadyDefinition(value.definition);
  for (const role of value.definition.roles) {
    const normalized = definition.roles.find(item => item.key === role.key);
    if (role.permissions !== undefined && String(role.permissions) !== String(normalized.permissions)) throw problem(`صلاحيات الرتبة «${role.name}» لا تطابق نوع الصلاحيات المدعوم. عدّلها قبل الاستيراد.`);
  }
  for (const group of value.definition.categories) {
    if (group.permission_overwrites || group.permissionOverwrites || group.overwrites) throw problem('صلاحيات التصنيفات الخام تحتاج تحويلًا إلى صيغة ديسكوكو قبل الاستيراد.');
    if (group.channels.some(channel => channel.permission_overwrites || channel.permissionOverwrites || channel.overwrites)) throw problem('صلاحيات القنوات الخام تحتاج تحويلًا إلى خيارات الوصول المدعومة قبل الاستيراد.');
  }
  if (definition.features.logs.routes?.some(route => route.sourceIds?.length)) throw problem('قواعد السجل تشير إلى قنوات من السيرفر الأصلي. استخدم مفاتيح قنوات القالب بدل معرفات المصدر.');
  return definition;
}
export function exportServerTemplate(definition) {
  const normalized = normalizeReadyDefinition(definition);
  const bundle = { format: TEMPLATE_FORMAT, version: 1, definition: normalized };
  importServerTemplate(bundle);
  return bundle;
}
