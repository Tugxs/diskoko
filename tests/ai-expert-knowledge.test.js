import test from 'node:test';
import assert from 'node:assert/strict';
import { expertContext, expertKnowledge, expertSources, existingEditorHelp } from '../scripts/ai-expert-knowledge.mjs';
import { selectAiKnowledge } from '../scripts/ai-knowledge.mjs';
import { knowledgeCorpus } from '../scripts/ai-semantic-knowledge.mjs';
import { applyReferencePreferences } from '../lib/ai-welcome-design.js';

test('Arabic role requests get actionable role knowledge without obsolete prohibition',()=>{
  const text=selectAiKnowledge('ابغى لوحة زر يوزع رتبة عادية داخل السيرفر');
  assert.match(text,/moduleKind interests/);
  assert.doesNotMatch(text,/قوالب الرتب.*أزيلت|توهم العميل بتوزيع الرتب/);
});
test('music knowledge explains real architecture without declaring an executor',()=>{
  const text=expertContext('ابغى ميوزك فيه قائمة تشغيل وتخطي');
  assert.match(text,/existing_editor/);
  assert.match(text,/Lavalink/);
  assert.match(text,/no conversation music draft/i);
  assert.doesNotMatch(text,/route=music/);
});
test('expert records are sourced and enter the existing semantic corpus',()=>{
  assert.equal(new Set(expertKnowledge.map(x=>x.id)).size,expertKnowledge.length);
  for(const item of expertKnowledge){assert.match(expertSources[item.source].url,/^https:\/\//);assert.ok(knowledgeCorpus.some(x=>x.id===item.id && x.availability===item.availability));}
});
test('supported layout knowledge keeps native buttons outside artwork',()=>{
  const text=expertContext('قالب صورة دائرية وأزرار وتصميم معرض');
  assert.match(text,/circle/i);
  assert.match(text,/buttons stay outside/);
  assert.match(text,/requires_development/);
});
test('music editor guidance avoids invented settings and respects a different function',()=>{
  const answer=existingEditorHelp('اشرح لي الميوزك');
  assert.match(answer,/اللوحات التفاعلية/);assert.match(answer,/لم يُربط بعد/);assert.doesNotMatch(answer,/تردد الصوت|زر.*الإعدادات/);
  assert.equal(existingEditorHelp('ابغى لوحة رتبة بعنوان "music"'),null);
  assert.equal(existingEditorHelp('لا أبغى ميوزك'),null);
});
test('explicit heading and image layout produces an editable scene even when planner omitted it',()=>{
  const result=applyReferencePreferences({kind:'tickets',title:'Studio support',color:'#001f3f',imageShape:'circle'},{prompt:'heading left and a circular final image on the right'});
  assert.equal(result.kind,'tickets');assert.equal(result.designScene.layers[0].text,'Studio support');assert.equal(result.designScene.layers[1].shape,'circle');assert.equal(result.designScene.layers[1].x,60);
});
test('an unrequested ticket response-time guarantee is removed without changing quoted copy',()=>{
  const proposal={kind:'tickets',description:'Staff respond within 24 hours.'};
  assert.doesNotMatch(applyReferencePreferences(proposal,{prompt:'Create a support panel'}).description,/24/);
  assert.match(applyReferencePreferences(proposal,{prompt:'Set description to "Staff respond within 24 hours."'}).description,/24/);
});
