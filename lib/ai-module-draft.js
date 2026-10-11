import { READY_MODULE_TYPES } from './ready-template-module-types.js';
import { normalizeDesignScene } from '../ai-design-scene.js';
import { panelExtras } from './ai-panel-extras.js';
import { moduleFormTools } from './module-form-tools.js';
import { moduleFaqTools } from './module-faq-tools.js';

// A generated draft contains copy and approved settings, never Discord IDs or code.
export function moduleDraft(source) {
  if (source?.kind !== 'module' || !READY_MODULE_TYPES[source.moduleKind]) return null;
  const text = (key, max) => String(source[key] || '').trim().slice(0, max);
  const result = { kind: 'module', moduleKind: source.moduleKind, title: text('title', 256), description: text('description', 2000), channel: text('channel', 100), buttonLabel: text('buttonLabel', 80), color: /^#[0-9a-f]{6}$/i.test(source.color || '') ? source.color : '#8d72e8', buttonStyle: [1,2,3,4].includes(Number(source.buttonStyle)) ? Number(source.buttonStyle) : 1 };
  for (const [key, max] of [['answer',1800],['subjectLabel',45],['detailsLabel',45]]) if (source[key]) result[key] = text(key,max);
  if (Number.isInteger(source.capacity) && source.capacity >= 0 && source.capacity <= 10000) result.capacity = source.capacity;
  if (source.moduleKind === 'events' && typeof source.startsAt === 'string' && Number.isFinite(Date.parse(source.startsAt))) result.startsAt = new Date(source.startsAt).toISOString();
  if(source.moduleKind==='events'){for(const key of ['waitlist','checkIn'])if(typeof source[key]==='boolean')result[key]=source[key];if(Number.isInteger(source.reminderMinutes) && source.reminderMinutes>=0 && source.reminderMinutes<=10080)result.reminderMinutes=source.reminderMinutes;}
  // Treat generated URLs as untrusted data. Invalid extras never invalidate the
  // customer's otherwise editable draft or become executable components.
  try { Object.assign(result, panelExtras(source)); }
  catch { Object.assign(result, panelExtras({imagePlacement:['image','thumbnail'].includes(source.imagePlacement)?source.imagePlacement:'image'})); }
  const scene = normalizeDesignScene(source.designScene);
  if(READY_MODULE_TYPES[source.moduleKind].form) {
    try{Object.assign(result,moduleFormTools(source));}catch{Object.assign(result,moduleFormTools());}
  }
  if (scene) result.designScene = scene;
  if(source.moduleKind==='faq'){try {Object.assign(result,moduleFaqTools(source));}catch{/* Invalid generated questions stay out of executable settings. */}}
  return result;
}
