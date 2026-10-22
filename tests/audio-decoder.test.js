import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {EventEmitter} from 'node:events';
import {createAudioDecoder} from '../lib/audio-decoder.js';

test('stopping a decoder kills the owned native process and input once, even when output is blocked',async()=>{
 const child=new EventEmitter();Object.assign(child,{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),exitCode:null});let kills=0;
 child.kill=signal=>{assert.equal(signal,'SIGKILL');kills++;child.exitCode=-1;queueMicrotask(()=>child.emit('close',-1));};
 const source=new PassThrough();let args;const decoder=createAudioDecoder(source,{binary:'fixture',spawnProcess:(...values)=>{args=values;return child;}});decoder.stream.on('error',()=>{});
 decoder.stop();decoder.stop();await decoder.done;assert.equal(kills,1);assert.equal(source.destroyed,true);assert.equal(decoder.stream.destroyed,true);assert.equal(args[2].windowsHide,true);assert.ok(args[1].includes('s16le'));
});
