import {problem} from './workspace-domain.js';

// Never delete the roles of the person authorizing a replacement. In particular,
// removing their Administrator/Manage Guild role revokes the next batch's access.
export async function templateExecutorRoles(call,guildId,actorId) {
  if(!/^\d{17,20}$/.test(String(actorId || ''))) throw problem('تعذر التحقق من هوية منفذ القالب. أعد ربط حساب Discord.',409);
  const result=await call(`/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(actorId)}`);
  if(!result.ok || !Array.isArray(result.data?.roles)) throw problem('تعذر التحقق من رتب حسابك داخل السيرفر. لم نبدأ حذف الرتب؛ تحقق من عضويتك واتصال البوت ثم أعد المراجعة.',409);
  return new Set(result.data.roles.map(String));
}

export function assertTemplateRoleDeletionSafe(steps,protectedIds) {
  const unsafe=steps.find(step=>step.kind==='delete-role' && step.status!=='succeeded' && protectedIds.has(String(step.resource_id)));
  if(unsafe)throw problem(`لن نحذف رتبتك «${unsafe.name}» حتى لا تفقد صلاحياتك أثناء التنفيذ. حدّث مراجعة القالب لحماية رتبك ثم تابع من مراجعة جديدة.`,409);
}
