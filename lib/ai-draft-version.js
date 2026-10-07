import { createHash } from 'node:crypto';

const stable=value=>Array.isArray(value)?value.map(stable):value && typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
// One version covers content, function and appearance, independent of JSONB key ordering.
export function draftVersion(proposal){
  if(!proposal?.interactive && !proposal?.message)return null;
  return createHash('sha256').update(JSON.stringify(stable({interactive:proposal.interactive || null,message:proposal.message || null}))).digest('hex');
}
export function checkDraftVersion(proposal,version){
  if(version===undefined && proposal?.draftProtocol!==1)return;
  if(typeof version!=='string' || version!==draftVersion(proposal))throw Object.assign(new Error('تغيّرت المسودة. افتح أحدث نسخة وراجعها قبل التنفيذ. / Draft changed. Reopen the latest version before applying.'),{status:409});
}
export async function checkCurrentDraft(db,item,id,userId,body,{editing=false}={}){
  checkDraftVersion(item?.proposal,body.draftVersion);
  if(!item?.proposal?.draftProtocol || editing)return;
  const newer=(await db.query("SELECT newer.id FROM ai_requests newer JOIN ai_requests current ON current.id=$1 WHERE newer.conversation_id=current.conversation_id AND newer.user_id=$2 AND newer.guild_id=current.guild_id AND newer.design_bot_id IS NOT DISTINCT FROM current.design_bot_id AND newer.created_at>current.created_at AND (newer.status IN ('pending','processing') OR (newer.status='completed' AND newer.proposal IS NOT NULL)) LIMIT 1",[id,userId])).rows[0];
  if(newer)throw Object.assign(new Error('يوجد طلب أحدث في المحادثة. راجع نسخته قبل النشر. / A newer draft exists in this conversation. Review it before publishing.'),{status:409});
}
