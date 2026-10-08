import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAiProposal } from '../lib/local-ai.js';
import { describeDraft, groundDraftInputs, draftContracts, draftContractInstructions } from '../lib/ai-draft-contract.js';
import { validateInteractiveDraft } from '../lib/interactive-systems.js';

test('incomplete supported drafts stay editable but cannot pass publication validation',()=>{
  for(const input of [{kind:'giveaway'}, {kind:'poll',options:[]}, {kind:'tickets'}]) {
    const proposal=normalizeAiProposal({interactive:input});
    assert.ok(proposal);
    assert.equal(describeDraft(proposal).state,'needs_setup');
    assert.ok(validateInteractiveDraft(proposal.interactive));
  }
});
test('operational values without customer evidence are cleared',()=>{
  const proposal={interactive:{kind:'giveaway',prize:'Match ticket',durationMinutes:24,winnerCount:3}};
  const grounded=groundDraftInputs(proposal,{prompt:'Build a giveaway panel',context:[]});
  assert.equal(grounded.interactive.prize,'');
  assert.equal(grounded.interactive.durationMinutes,null);
  assert.equal(grounded.interactive.winnerCount,null);
  const explicit=groundDraftInputs(proposal,{prompt:'Match ticket for 24 minutes with 3 winners'});
  assert.deepEqual(explicit,proposal);
});
test('contract identities are unique and never authorize automatic publication',()=>{
  assert.equal(new Set(draftContracts.map(x=>x.id)).size,draftContracts.length);
  assert.equal(describeDraft({interactive:{kind:'giveaway'}}).confirmationRequired,true);
});

test('new editor form tools are optional contract settings rather than missing required inputs',()=>{
  const contract=draftContracts.find(x=>x.id==='suggestions');
  for(const key of ['subjectPlaceholder','detailsPlaceholder','subjectMaxLength','detailsMaxLength','links','imagePlacement'])assert.equal(contract.fields.find(x=>x.key===key)?.required,false,key);
  assert.match(draftContractInstructions(),/optional=.*subjectPlaceholder/);
  const draft=describeDraft({interactive:{kind:'module',moduleKind:'suggestions',title:'Ideas',description:'Share',buttonLabel:'Send',channelId:'123',reviewChannelId:'456',staffRoleId:'789'}});
  assert.equal(draft.state,'review_ready');
});
test('approved base contracts cannot be mistaken for standalone module kinds',()=>{
  const result=groundDraftInputs({interactive:{kind:'module',moduleKind:'giveaway',durationMinutes:0,winnerCount:1}},{prompt:'Create a giveaway'});
  assert.equal(result.interactive.kind,'giveaway');
  assert.equal(result.interactive.moduleKind,undefined);
  assert.equal(result.interactive.durationMinutes,null);
  assert.equal(result.interactive.winnerCount,null);
  assert.equal(groundDraftInputs({interactive:{kind:'module',moduleKind:'unknown'}},{prompt:'Test'}).interactive.moduleKind,'unknown');
});
test('unrequested numeric follow-up changes preserve customer-approved values',()=>{
  const result=groundDraftInputs({interactive:{kind:'giveaway',durationMinutes:100,winnerCount:10}},{prompt:'Change the title',previous_proposal:{interactive:{kind:'giveaway',durationMinutes:60,winnerCount:2}}});
  assert.equal(result.interactive.durationMinutes,60);
  assert.equal(result.interactive.winnerCount,2);
});
