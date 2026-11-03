import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createAudioManagerCache,readAudioWithRecovery} from '../lib/lavalink-lifecycle.js';
import {ManagedAudioConnector,disposeAudioManager} from '../lib/managed-audio-connector.js';
function fixture(options={}){
 const built=[],disposed=[];
 const cache=createAudioManagerCache({build:()=>{const m=new EventEmitter();m.players=new Map();m.connections=new Map();m.online=false;m.getIdealNode=()=>m.online?{}:null;built.push(m);return {manager:m,start:()=>{if(options.ready!==false){m.online=true;m.emit('ready');}}};},dispose:m=>disposed.push(m),...options});return {cache,built,disposed};
}
test('concurrent starts share one manager; an idle disconnected manager is rebuilt after being ready',async()=>{
 const f=fixture(),client={};const [a,b]=await Promise.all([f.cache.get(client),f.cache.get(client)]);assert.equal(a,b);assert.equal(f.built.length,1);
 a.online=false;const next=await f.cache.get(client);assert.notEqual(a,next);assert.deepEqual(f.disposed,[a]);
});
test('a stale callback cannot invalidate a replacement or affect a different bot',async()=>{
 const f=fixture(),client={},other={};const old=await f.cache.get(client),separate=await f.cache.get(other);old.online=false;const fresh=await f.cache.get(client);
 assert.equal(f.cache.invalidate(client,old),false);assert.equal(await f.cache.get(client),fresh);assert.equal(await f.cache.get(other),separate);
});
test('active players or voice joins prevent a manager reset that would cut another guild',async()=>{
 for(const field of ['players','connections']){
  const f=fixture(),client={},m=await f.cache.get(client);m[field].set('other',{});m.online=false;
  await assert.rejects(f.cache.get(client));assert.equal(f.disposed.length,0);assert.equal(f.built.length,1);
 }
});
test('read-only 502/timeout retries once with a fresh idle manager; 429 and writes are never replayed',async()=>{
 for(const err of [{status:502},{name:'TimeoutError'}]){
  const f=fixture(),client={};let calls=0;
  assert.equal(await readAudioWithRecovery(f.cache,client,async()=>{if(!calls++)throw err;return 'track';}),'track');assert.equal(calls,2);assert.equal(f.built.length,2);
 }
 const f=fixture();let calls=0;await assert.rejects(readAudioWithRecovery(f.cache,{},async()=>{calls++;throw {status:429};}));assert.equal(calls,1);
});
test('unavailable nodes have a finite wait, cleanup and retry cooldown',async()=>{
 let now=0;const f=fixture({ready:false,timeoutMs:15,cooldownMs:100,now:()=>now}),client={};
 await assert.rejects(f.cache.get(client));assert.equal(f.disposed.length,1);await assert.rejects(f.cache.get(client));assert.equal(f.built.length,1);
 now=101;const pending=f.cache.get(client);await assert.rejects(pending);assert.equal(f.built.length,2);
});
test('an upstream outage has at most two read attempts, never an unbounded retry loop',async()=>{
 const f=fixture();let calls=0;await assert.rejects(readAudioWithRecovery(f.cache,{},async()=>{calls++;throw {status:502};}));assert.equal(calls,2);assert.equal(f.built.length,2);
});
test('retiring a connector removes only its owned gateway listeners and prevents close reconnection',()=>{
 const client=new EventEmitter();client.isReady=()=>true;client.user={id:'bot'};const unrelated=()=>{};client.on('raw',unrelated);
 const connector=new ManagedAudioConnector(client);let cleanup=0;const node=new EventEmitter();node.cleanupWebsocket=()=>cleanup++;
 const manager={options:{reconnectTries:3},nodes:new Map([['audio',node]]),connector};connector.set(manager);connector.listen([]);
 assert.equal(client.listenerCount('raw'),2);assert.equal(client.listenerCount('clientReady'),0);
 disposeAudioManager(manager);assert.equal(client.listenerCount('raw'),1);assert.equal(manager.options.reconnectTries,0);assert.equal(cleanup,1);node.emit('ready');assert.equal(cleanup,2);
});
