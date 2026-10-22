import test from 'node:test';
import assert from 'node:assert/strict';
import {createMusicAdmission} from '../lib/music-capacity.js';

test('concurrent starting sessions share the active capacity ceiling and reject duplicate guild/bot joins',()=>{
 const sessions=new Map(),guard=createMusicAdmission(sessions,()=>3),release=[];
 for(let i=0;i<3;i++)release.push(guard.reserve('guild:bot'+i));
 assert.throws(()=>guard.reserve('other:bot'),/مشغول/);assert.throws(()=>guard.reserve('guild:bot0'),/جارٍ بدء/);
 sessions.set('guild:bot0',{});release[0]();release[0]();assert.deepEqual(guard.snapshot(),{active:1,starting:2});
 assert.throws(()=>guard.reserve('other:bot'),/مشغول/);release[1]();const next=guard.reserve('other:bot');next();release[2]();sessions.clear();assert.deepEqual(guard.snapshot(),{active:0,starting:0});
});
test('invalid session limits fail closed instead of silently enabling unlimited or excess music',()=>{
 for(const limit of ['bad','0','-1','101','1.5'])assert.throws(()=>createMusicAdmission(new Map(),()=>limit).reserve('key'),/غير صالح/);
 const guard=createMusicAdmission(new Map(),()=>undefined);const releases=[guard.reserve('a'),guard.reserve('b'),guard.reserve('c')];assert.throws(()=>guard.reserve('d'));releases.forEach(fn=>fn());assert.doesNotThrow(()=>guard.reserve('e'));
});
