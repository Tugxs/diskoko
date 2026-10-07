import test from 'node:test';
import assert from 'node:assert/strict';
import { welcomeDesign, missingReferenceVision } from '../lib/ai-welcome-design.js';
import { normalizeAiProposal } from '../lib/local-ai.js';

test('welcome reference preserves bounded editable style without arbitrary executable fields', () => {
  const plan = normalizeAiProposal({ interactive: { kind: 'welcome', title: 'HELLO {name}', description: 'هلا {member}', referenceOnly: true, avatarPosition: 'right', color: '#383940', bannerPosition: 'above', code: '<script>bad()</script>' } }).interactive;
  assert.equal(plan.referenceOnly, true);
  assert.equal(plan.color, '#383940');
  assert.equal(plan.avatarPosition, 'right');
  assert.equal(plan.code, undefined);
  assert.equal(welcomeDesign({ color: 'javascript:x', avatarPosition: 'script' }).color, '#8b5cf6');
  assert.equal(welcomeDesign({ avatarPosition: 'center' }).avatarPosition, 'center');
});

test('reference-dependent requests cannot pretend to read an image without vision', () => {
  const job = { has_attachment: true, prompt: 'صمم بطاقة ترحيب مثل الصورة' };
  assert.equal(missingReferenceVision(job), true);
  assert.equal(missingReferenceVision({ ...job, image_analysis: 'صورة عضو يمين العنوان' }), false);
  assert.equal(missingReferenceVision({ prompt: job.prompt }), false);
});
