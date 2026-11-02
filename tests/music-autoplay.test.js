import test from 'node:test';
import assert from 'node:assert/strict';
import {selectAutoplayTrack,fillAutoplay} from '../lib/music-autoplay.js';
const track=(id,other={})=>({encoded:id,info:{identifier:id,length:180000,sourceName:'youtube',...other}});
test('automatic choice skips played items, streams, long tracks and other sources',()=>{
 const good=track('new');assert.equal(selectAutoplayTrack({data:[track('old'),track('stream',{isStream:true}),track('long',{length:7200001}),track('other',{sourceName:'soundcloud'}),good]},new Set(['old'])),good);
 assert.equal(selectAutoplayTrack({data:[track('old')]},new Set(['old'])),null);
});
test('manual queue takes priority and autoplay off never performs a lookup',async()=>{
 for(const session of [{queue:[{id:'manual'}],autoplay:true},{queue:[],autoplay:false}]){
  await fillAutoplay({...session,lastTrack:{id:'old'},engine:'lavalink'},{active:()=>true,resolve:()=>{throw Error('must not search');}});
 }
});
test('one pending lookup cannot revive a closed session, override manual queue or ignore disabling',async()=>{
 for(const change of ['closed','manual','off']){
  const session={queue:[],autoplay:true,lastTrack:{id:'old'},engine:'lavalink',playedIds:new Set(['old'])};let release,calls=0,active=true;
  const deps={active:()=>active,resolve:()=>{calls++;return new Promise(resolve=>release=resolve);}};
  const first=fillAutoplay(session,deps),second=fillAutoplay(session,deps);
  if(change==='closed')active=false;if(change==='manual')session.queue.push({id:'manual'});if(change==='off')session.autoplay=false;
  release({id:'new'});await Promise.all([first,second]);assert.equal(calls,1);assert.deepEqual(session.queue,change==='manual'?[{id:'manual'}]:[]);
 }
});
test('autoplay appends an available recommendation and releases pending state on failure',async()=>{
 const s={queue:[],autoplay:true,lastTrack:{id:'old'},engine:'lavalink',playedIds:new Set()};
 await fillAutoplay(s,{active:()=>true,resolve:async()=>({id:'new'})});assert.deepEqual(s.queue,[{id:'new',requestedBy:'autoplay'}]);assert.equal(s.autoplayPending,null);
 s.queue=[];await assert.rejects(fillAutoplay(s,{active:()=>true,resolve:async()=>{throw Error('offline');}}));assert.equal(s.autoplayPending,null);
});
