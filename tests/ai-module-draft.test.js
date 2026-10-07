import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAiProposal, presentAiRequest } from '../lib/local-ai.js';
import { editablePanelRequest } from '../lib/ai-intent.js';

test('role button requests produce eligible editable functional drafts in Arabic and English', () => {
  for (const prompt of ['ابغى تسوي لي نظام إعطاء رتبه يكون ثابت داخل السيرفر','أبغى زر يوزع رول في الروم','Build a role button panel']) assert.equal(editablePanelRequest(prompt),true);
  const proposal = normalizeAiProposal({interactive:{kind:'module',moduleKind:'interests',title:'اختر رتبتك',description:'اضغط لإضافة الرتبة أو إزالتها.',buttonLabel:'خذ الرتبة',roleId:'foreign',permissions:'administrator',code:'run()',designScene:{background:'#123456',layers:[]},links:[{label:'External',url:'https://example.com'}]}});
  assert.equal(proposal.interactive.moduleKind,'interests');
  assert.equal(proposal.interactive.roleId,undefined);
  assert.equal(proposal.interactive.code,undefined);
  assert.equal(proposal.interactive.designScene.background,'#123456');
  assert.equal(proposal.interactive.links,undefined);
  assert.equal(presentAiRequest({prompt:'أبغى زر رتبة',proposal}).proposal.interactive.kind,'module');
});
test('unimplemented modules and incomplete copy cannot become executable drafts',()=>{
  assert.equal(normalizeAiProposal({interactive:{kind:'module',moduleKind:'music',title:'Music',description:'Play',buttonLabel:'Play'}}),null);
  assert.equal(normalizeAiProposal({interactive:{kind:'module',moduleKind:'faq',title:'FAQ'}}),null);
});
