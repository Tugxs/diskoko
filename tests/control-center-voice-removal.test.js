import test from 'node:test';
import assert from 'node:assert/strict';
import {controlActions} from '../control-center-catalog.js';
import {pendingCenterActions} from '../control-center-capabilities.js';
import {normalizeCodeOutput} from '../lib/code-command-sandbox.js';
import {createCenterEngine} from '../lib/control-center-engine.js';
import {centerPage} from '../control-center-view.js';
import {normalizeAdminPanel} from '../admin-panel-template.js';
test('voice assistant is removed while text assistant and persistent voice remain',()=>{
 assert.equal(normalizeAdminPanel({buttons:{aivoice:{label:'Old'}}}).buttons.aivoice,undefined);
 assert.equal(controlActions.aivoice,undefined);assert.equal(pendingCenterActions.aivoice,undefined);
 assert.ok(controlActions.aichat);assert.ok(controlActions.oracle);assert.ok(controlActions['bot-setvoice']);
 assert.ok(!JSON.stringify(centerPage(normalizeAdminPanel(),{},'owner',1)).includes('aivoice'));
});
test('old center projects lose voice buttons, fields and copy choices without changing custom scripts',()=>{
 const raw={message:{embeds:[{title:'Owner',fields:[{name:'Custom voice title',value:'Description '+String.fromCharCode(96)+'!aivoice'+String.fromCharCode(96)},{name:'Text',value:'aichat'}]}],controls:[{type:'button',label:'Old voice',action:'op_aivoice'},{type:'button',label:'Text',action:'op_aichat'},{type:'select',action:'copy',options:[{label:'Voice',value:'aivoice'},{label:'Text',value:'aichat'}]}]}};
 const out=normalizeCodeOutput(raw,{centerFeatures:true}).message;
 assert.equal(out.embeds[0].fields.length,1);assert.equal(out.controls.length,2);assert.equal(out.controls[1].options.length,1);
 assert.equal(normalizeCodeOutput(raw).message.controls.length,3);assert.equal(raw.message.controls[2].options.length,2);
 raw.message.controls=[{type:'select',action:'copy',options:[{label:'Voice',value:'aivoice'}]}];
 assert.equal(normalizeCodeOutput(raw,{centerFeatures:true}).message.controls.length,0);
});

test('legacy direct voice invocation is rejected before operations or Discord calls',async()=>{
 const invoke=createCenterEngine({authority:async()=>({manager:true}),command:{}});
 await assert.rejects(invoke({operation:{kind:'review',id:'aivoice'},design:normalizeAdminPanel()}),/تم إلغاء/);
});
