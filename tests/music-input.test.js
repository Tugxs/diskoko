import test from 'node:test';
import assert from 'node:assert/strict';
import {musicSearchQuery,musicJoinFailure} from '../lib/music-input.js';
import {musicPanelMessage,musicEntryModal,musicSlashOptions} from '../lib/music-panel.js';
test('music names become bounded YouTube search, while URLs and source prefixes never become searches',()=>{
 assert.equal(musicSearchQuery('  فنان   أغنية  '),'ytsearch:فنان أغنية');
 for(const input of ['', 'https://example.com/a','http://localhost/a','ytsearch:input','file:/etc/passwd','www.example.com/a','x'.repeat(201)])assert.equal(musicSearchQuery(input),null);
});
test('voice failure classification preserves safe status without leaking voice credentials',()=>{
 const error={name:'RestError',status:404,message:undefined,token:'secret',path:'/sessions/private-session/players/guild'};
 const result=musicJoinFailure(error);assert.equal(result.diagnostic.status,404);assert.equal(result.diagnostic.staleSession,true);assert.equal(JSON.stringify(result).includes('secret'),false);assert.equal(JSON.stringify(result).includes('private-session'),false);
 assert.match(musicJoinFailure({status:429}).message,/قيّد/);assert.match(musicJoinFailure({status:403}).message,/الخدمة/);
 assert.match(musicJoinFailure({name:'RestError'}).message,/لا يعني/);
});
test('playing music exposes a separate enqueue button and input accepts names without changing existing slash option keys',()=>{
 const playing=musicPanelMessage({},'play',{channelId:'123',volume:.8,queue:[{title:'Song'}],engine:'lavalink'});
 const button=playing.components.flatMap(row=>row.components).find(button=>button.custom_id==='diskoko:music:enqueue:play');assert.equal(button.label,'إضافة الأغنية التالية');
 assert.ok(playing.components.every(row=>row.components.length<=5));assert.ok(playing.components.length<=5);
 assert.match(musicEntryModal('play').components[0].label,/اسمها/);assert.equal(musicSlashOptions[0].name,'رابط');assert.match(musicSlashOptions[0].description,/اسمها/);
});
