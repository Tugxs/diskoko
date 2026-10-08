import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAiProposal, presentAiRequest } from '../lib/local-ai.js';
import { editablePanelRequest } from '../lib/ai-intent.js';
import { moduleDraft } from '../lib/ai-module-draft.js';
import { mergePanelEdits } from '../lib/ai-welcome-design.js';

test('generated extras stay editable and unsafe components are discarded',()=>{
  const source={kind:'module',moduleKind:'faq',title:'Help',imagePlacement:'thumbnail',links:[{label:'Docs',url:'https://discord.com/developers/docs'}]};
  assert.equal(moduleDraft(source).imagePlacement,'thumbnail');
  assert.equal(moduleDraft(source).links.length,1);
  for(const url of ['javascript:alert(1)','https://user:pass@example.com']) assert.deepEqual(moduleDraft({...source,links:[{label:'Bad',url}]}).links,[]);
  assert.equal(moduleDraft({...source,imagePlacement:'anywhere'}).imagePlacement,'image');
  const prior=moduleDraft(source);
  assert.deepEqual(mergePanelEdits(prior,{...prior,imagePlacement:'image',links:[]},'Change the title to "FAQ"').links,prior.links);
  assert.equal(mergePanelEdits(prior,{...prior,imagePlacement:'image'},'Move the image below the text').imagePlacement,'image');
});

test('role button requests produce eligible editable functional drafts in Arabic and English', () => {
  for (const prompt of ['ابغى تسوي لي نظام إعطاء رتبه يكون ثابت داخل السيرفر','أبغى زر يوزع رول في الروم','Build a role button panel']) assert.equal(editablePanelRequest(prompt),true);
  const proposal = normalizeAiProposal({interactive:{kind:'module',moduleKind:'interests',title:'اختر رتبتك',description:'اضغط لإضافة الرتبة أو إزالتها.',buttonLabel:'خذ الرتبة',roleId:'foreign',permissions:'administrator',code:'run()',designScene:{background:'#123456',layers:[]},links:[{label:'External',url:'https://example.com'}]}});
  assert.equal(proposal.interactive.moduleKind,'interests');
  assert.equal(proposal.interactive.roleId,undefined);
  assert.equal(proposal.interactive.code,undefined);
  assert.equal(proposal.interactive.designScene.background,'#123456');
  assert.deepEqual(proposal.interactive.links,[{label:'External',url:'https://example.com/'}]);
  assert.equal(presentAiRequest({prompt:'أبغى زر رتبة',proposal}).proposal.interactive.kind,'module');
});
test('unimplemented modules and incomplete copy cannot become executable drafts',()=>{
  assert.equal(normalizeAiProposal({interactive:{kind:'module',moduleKind:'music',title:'Music',description:'Play',buttonLabel:'Play'}}),null);
  assert.equal(normalizeAiProposal({interactive:{kind:'module',moduleKind:'faq',title:'FAQ'}}).interactive.moduleKind,'faq');
});
