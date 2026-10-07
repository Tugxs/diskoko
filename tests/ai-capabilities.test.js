import test from 'node:test';
import assert from 'node:assert/strict';
import { aiPromptLibrary } from '../ai-library-catalog.js';
import { aiCapabilities, capabilityKnowledge } from '../lib/ai-capabilities.js';
import { mergePanelEdits, applyReferencePreferences } from '../lib/ai-welcome-design.js';
import { normalizeAiProposal } from '../lib/local-ai.js';
import { designIdeas, selectDesignIdeas } from '../scripts/ai-design-library.mjs';
import { alignAiProposalWithIntent, unsupportedAutomationRequest } from '../lib/ai-intent.js';
import { responseLanguage, localizedAiMessage } from '../lib/ai-language.js';

test('conversation language differs from quoted content and failed vision is localized',()=>{
  assert.equal(responseLanguage('أبغى عنوان "Welcome home"'),'ar');
  assert.equal(responseLanguage('Make the title "مرحبًا"'),'en');
  assert.equal(responseLanguage('جاوب بالإنجليزي'),'en');
  assert.equal(responseLanguage('أبغى لوحة رتبة',[],'en'),'ar');
  assert.equal(responseLanguage('Build a role panel',[],'ar'),'en');
  assert.match(localizedAiMessage('vision','en'),/could not read/);
  assert.match(localizedAiMessage('vision','ar'),/لم أتمكن/);
});

test('English support intent retains tickets and does not treat a later poll as support',()=>{
  const source={executeNow:true,message:{channel:'help',content:'Help'},operations:[]};
  const result=alignAiProposalWithIntent(source,[{role:'user',content:'Build a support panel'}]);
  assert.equal(result.interactive.kind,'tickets'); assert.equal(result.message,null);
  const poll={executeNow:true,interactive:{kind:'poll',question:'When?',options:['Today','Tomorrow']}};
  assert.equal(alignAiProposalWithIntent(poll,[{role:'user',content:'Build a support panel'},{role:'user',content:'Now make a poll'}]).interactive.kind,'poll');
  assert.equal(unsupportedAutomationRequest([{role:'user',content:'Build a standalone bot'}]),true);
});

test('one hundred bilingual ideas are knowledge, not automatic executors',()=>{
  assert.equal(designIdeas.length,100);
  assert.equal(new Set(designIdeas.map(item=>item.id)).size,100);
  assert.ok(designIdeas.every(item=>item.titleAr && item.titleEn));
  assert.ok(designIdeas.some(item=>item.availability==='development'));
  assert.ok(selectDesignIdeas('I need technical support').some(item=>item.route==='tickets'));
});

test('knowledge follows the existing library without promoting editors into executors', () => {
  assert.equal(aiCapabilities.length, aiPromptLibrary.length);
  for (const item of aiCapabilities) {
    assert.equal(item.confirmationRequired, true);
    assert.equal(item.scope, 'user/guild/bot');
  }
  assert.match(capabilityKnowledge(), /starter messages, never fixed designs/);
});

test('Arabic and English square requests survive normalization and preserve function',()=>{
  for (const prompt of ['خل صورة العضو مربعة','Make the avatar square']) {
    const draft=applyReferencePreferences({kind:'welcome',title:'Welcome',description:'Hello {name}',channel:'welcome'},{prompt});
    const plan=normalizeAiProposal({interactive:draft}).interactive;
    assert.equal(plan.avatarShape,'square'); assert.equal(plan.composite,true);
    assert.equal(plan.kind,'welcome'); assert.equal(plan.description,'Hello {name}');
  }
});

test('negated shapes and shapes inside quoted titles are not image commands',()=>{
  const source={kind:'welcome',title:'Hello',description:'Welcome',avatarShape:'circle',composite:false};
  assert.equal(applyReferencePreferences(source,{prompt:'Make the avatar square, not circular'}).avatarShape,'square');
  assert.equal(applyReferencePreferences(source,{prompt:'أبغى الصورة مربعة، مو دائرية'}).avatarShape,'square');
  assert.equal(applyReferencePreferences(source,{prompt:'Set the title "Square"'}).composite,false);
});

test('English follow-up changes only the requested text and appearance', () => {
  const previous = {kind:'tickets', title:'Help', description:'Contact us', color:'#112233', buttonLabel:'Open', buttonStyle:3};
  const proposed = {...previous,title:'Unrequested',description:'Changed',color:'#abcdef',buttonLabel:'Support',buttonStyle:2};
  const result = mergePanelEdits(previous, proposed, 'Change the color to #229944 and rename the button to "Ask for help". Keep everything else.');
  assert.equal(result.title,'Help'); assert.equal(result.description,'Contact us');
  assert.equal(result.color,'#229944'); assert.equal(result.buttonLabel,'Ask for help');
  assert.equal(result.buttonStyle,3);
});

test('preserving text is not a request to replace it during a font edit',()=>{
  const previous={kind:'tickets',title:'Help',description:'Original copy',designScene:{layers:[{type:'text',text:'Heading',fontSize:36}]}};
  const result=mergePanelEdits(previous,{...previous,description:'Invented replacement',designEdits:[{op:'set',layer:0,field:'fontSize',value:64}]},'Only change the heading font size to 64. Keep all other elements and text exactly as they are.');
  assert.equal(result.description,'Original copy');assert.equal(result.designScene.layers[0].fontSize,64);
});

test('explicit heading and body placement prevents overlapping the final image',()=>{
  const result=applyReferencePreferences({kind:'tickets',description:'Original body',designScene:{layers:[{type:'text',text:'Heading',bold:true,x:0,y:20,width:100,height:40},{type:'image',x:0,y:20,width:100,height:100},{type:'text',text:'Original body',x:0,y:0,width:100,height:100}]}},{prompt:'A heading at the top, a circular image on the right and body text on the left.'});
  const [heading,image,body]=result.designScene.layers;
  assert.equal(heading.y,5);assert.equal(body.x,5);assert.equal(body.width,35);assert.equal(body.text,'Original body');assert.ok(body.x+body.width<image.x);
});

test('initial background boxes stay behind text and defaults follow card content language',()=>{
  const source={kind:'tickets',title:'Help',description:'Contact us',designScene:{layers:[{type:'text',text:'Wrong heading',bold:true},{type:'box',x:0,y:0,width:100,height:100}]}};
  const result=applyReferencePreferences(source,{prompt:'Use title "Exact title"'});
  assert.equal(result.designScene.layers[0].type,'box');assert.equal(result.designScene.layers[1].text,'Exact title');assert.equal(result.buttonLabel,'Open support ticket');
  const saved=applyReferencePreferences({...source,buttonLabel:'My button'},{prompt:'Keep this draft',previous_proposal:{interactive:source}});
  assert.equal(saved.designScene.layers[0].type,'text');assert.equal(saved.buttonLabel,'My button');
  assert.equal(applyReferencePreferences(source,{prompt:'Use button label "Open test ticket"'}).buttonLabel,'Open test ticket');
});
