import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {watchMusicVoiceExit} from '../lib/music-voice-lifecycle.js';
const emit=(client,{guild='g',bot='b',before='room',after=null}={})=>client.emit('voiceStateUpdate',{channelId:before},{guild:{id:guild},id:bot,channelId:after});
test('a kicked or manually disconnected bot ends the session once and removes its listener',()=>{
 const client=new EventEmitter();let stopped=0;
 const dispose=watchMusicVoiceExit(client,{guildId:'g',botId:'b',channelId:'room',onExit:()=>stopped++});
 emit(client);emit(client);assert.equal(stopped,1);assert.equal(client.listenerCount('voiceStateUpdate'),0);dispose();
});
test('another guild, another bot, mute/deafen and initial joins cannot stop the session',()=>{
 const client=new EventEmitter();let stopped=0;
 const dispose=watchMusicVoiceExit(client,{guildId:'g',botId:'b',channelId:'room',onExit:()=>stopped++});
 emit(client,{guild:'other'});emit(client,{bot:'member'});emit(client,{after:'room'});emit(client,{before:null,after:'room'});
 assert.equal(stopped,0);dispose();emit(client);assert.equal(stopped,0);assert.equal(client.listenerCount('voiceStateUpdate'),0);
});
test('moving the bot out of its playback room stops only the matching session',()=>{
 const client=new EventEmitter();const stops=[];
 const removeOther=watchMusicVoiceExit(client,{guildId:'other',botId:'b',channelId:'room',onExit:()=>stops.push('other')});
 watchMusicVoiceExit(client,{guildId:'g',botId:'b',channelId:'room',onExit:()=>stops.push('g')});
 emit(client,{after:'new-room'});assert.deepEqual(stops,['g']);assert.equal(client.listenerCount('voiceStateUpdate'),1);removeOther();
});
test('cleanup rejection is handled and cannot leave an unhandled gateway rejection',async()=>{
 const client=new EventEmitter();let error;
 watchMusicVoiceExit(client,{guildId:'g',botId:'b',channelId:'room',onExit:async()=>{throw Error('cleanup');},onError:e=>error=e});
 emit(client);await new Promise(resolve=>setImmediate(resolve));assert.equal(error.message,'cleanup');assert.equal(client.listenerCount('voiceStateUpdate'),0);
});
