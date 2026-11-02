import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {GuardedLavalinkRest} from '../lib/guarded-lavalink-rest.js';
test('nonstandard upstream JSON cannot discard HTTP status or leak voice credentials',async()=>{
 const server=http.createServer((req,res)=>{req.resume();res.writeHead(404,{'content-type':'application/json'});res.end('{"unusual":"response","token":"do-not-log"}');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const rest=new GuardedLavalinkRest({manager:{options:{userAgent:'test',restTimeout:2}}},{url:`127.0.0.1:${server.address().port}`,auth:'test-only',secure:false});
  await assert.rejects(rest.updatePlayer({guildId:'g',playerOptions:{voice:{token:'private-voice-token'}}}),e=>e.status===404 && !JSON.stringify(e).includes('private-voice-token') && !JSON.stringify(e).includes('do-not-log'));
 }finally{await new Promise(resolve=>server.close(resolve));}
});
