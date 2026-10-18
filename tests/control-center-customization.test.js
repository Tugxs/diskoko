import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAdminPanel} from '../admin-panel-template.js';
import {centerPage,centerRoute} from '../control-center-view.js';

test('panel customization preserves independent branding and native button choices',()=>{
 const design=normalizeAdminPanel({color:'#312050',imageUrl:'https://example.com/card.gif',bannerUrl:'https://example.com/banner.gif',buttons:{avatar:{label:'صور الأعضاء',emoji:'🎭',style:3,order:0},help:{hidden:true}}});
 const page=centerPage(design,{},'general');
 assert.equal(design.color,'#312050');
 assert.equal(design.imageUrl,'https://example.com/card.gif');
 assert.equal(page.message.controls[0].label.trim(),'صور الأعضاء');assert.equal(page.message.controls[0].emoji,'🎭');
 assert.equal(page.message.controls[0].style,3);
 assert.ok(!page.message.controls.some(c=>c.action==='op_help'));
 assert.equal(page.message.embeds[0].color,0x312050);
});
test('customization rejects prototype keys, invalid native colors and oversized assets',()=>{
 for(const buttons of [JSON.parse('{"__proto__":{}}'),{avatar:{style:5}},{avatar:{order:-1}},{avatar:{label:'x'.repeat(61)}},{avatar:{hidden:'yes'}}])assert.throws(()=>normalizeAdminPanel({buttons}));
 assert.throws(()=>normalizeAdminPanel({imageUrl:'http://example.com/card.png'}));
 assert.throws(()=>normalizeAdminPanel({supportUrl:'https://user:password@example.com'}));
});
test('opening a native form is synchronous and never executes an operation',()=>{
 const route=centerRoute({state:{},event:{action:'op_ban'}},normalizeAdminPanel());
 assert.equal(route.operation,undefined);
 assert.equal(route.output.modal.action,'form_ban');
});
