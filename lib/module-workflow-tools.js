import { moduleWorkflow } from './ready-template-module-types.js';
export function workflowStages(kind){
  const flow=moduleWorkflow(kind);
  if(flow==='suggestions')return ['studying','planned','in_progress','completed','closed'];
  if(flow==='orders')return ['queued','in_progress','delivered'];
  if(flow==='learning')return ['in_progress','needs_revision','completed'];
  if(flow==='submissions')return ['reviewing','published','archived'];
  return ['reviewing','in_progress','completed'];
}
export const workflowStageLabels={studying:'قيد الدراسة / Studying',planned:'مخطط / Planned',in_progress:'قيد العمل / In progress',completed:'مكتمل / Completed',closed:'التصويت مغلق / Voting closed',queued:'في الانتظار / Queued',delivered:'تم التسليم / Delivered',needs_revision:'يحتاج تعديلًا / Needs revision',reviewing:'قيد المراجعة / Reviewing',published:'منشور / Published',archived:'مؤرشف / Archived'};
