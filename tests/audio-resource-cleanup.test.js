import test from 'node:test';
import assert from 'node:assert/strict';
import {disposeAudioResource} from '../lib/audio-resource-cleanup.js';
test('audio cleanup closes each live pipeline stage once and tolerates missing stages',()=>{
 let closed=0;const stage=()=>({destroyed:false,destroy(){assert.equal(this.destroyed,false);this.destroyed=true;closed++;}});
 const playStream=stage(),volume=stage();const resource={playStream,volume,encoder:playStream};disposeAudioResource(resource);disposeAudioResource(resource);disposeAudioResource(null);assert.equal(closed,2);
});
