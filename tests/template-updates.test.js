import test from 'node:test';import assert from 'node:assert/strict';
import {mergeTemplateUpdate} from '../lib/template-updates.js';
test('template upgrade preserves customizations while taking untouched vendor changes',()=>{
 const base={name:'Old',roles:[{key:'member',name:'Member',color:1}],features:{enabled:false,title:'Old'}};
 const custom=structuredClone(base);custom.name='My community';custom.roles[0].color=2;
 const latest=structuredClone(base);latest.features.enabled=true;latest.roles.push({key:'support',name:'Support',color:3});
 const result=mergeTemplateUpdate(base,custom,latest);assert.equal(result.definition.name,'My community');assert.equal(result.definition.roles[0].color,2);assert.equal(result.definition.features.enabled,true);assert.equal(result.definition.roles[1].key,'support');assert.deepEqual(result.conflicts,[]);assert.equal(base.roles[0].color,1);
});
test('conflicting updates and deletions remain explicit and never silently overwrite customer changes',()=>{
 const base={roles:[{key:'a',name:'A'},{key:'b',name:'B'}]},custom={roles:[{key:'b',name:'Custom B'}]},latest={roles:[{key:'a',name:'New A'},{key:'b',name:'New B'}]};
 const result=mergeTemplateUpdate(base,custom,latest);assert.equal(result.definition.roles.length,1);assert.equal(result.definition.roles[0].name,'Custom B');assert.equal(result.conflicts.length,2);
});
