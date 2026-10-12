import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {renderMusicCard} from '../lib/music-card.js';
import {normalizeMusicPanel} from '../lib/music-panel.js';

test('music background survives normalization and changes the rendered background pixel',async()=>{
  const config=normalizeMusicPanel({backgroundColor:'#104080',frameStyle:'minimal'});
  assert.equal(config.backgroundColor,'#104080');
  assert.equal(normalizeMusicPanel({}).backgroundColor,'');
  assert.throws(()=>normalizeMusicPanel({backgroundColor:'url(bad)'}),/خلفية/);
  const image=await renderMusicCard(config,null,null);const {data,info}=await sharp(image).raw().toBuffer({resolveWithObject:true});
  const pixel=(390*info.width+50)*info.channels;assert.deepEqual([...data.subarray(pixel,pixel+3)],[16,64,128]);
});
test('music logo keeps rectangular corners without a circular border or crop',async()=>{
  const logo=await sharp({create:{width:100,height:40,channels:4,background:'#ff0000'}}).png().toBuffer();
  const previous=global.fetch;global.fetch=async()=>({ok:true,headers:new Headers({'content-type':'image/png'}),arrayBuffer:async()=>logo});
  try{
    const image=await renderMusicCard(normalizeMusicPanel({logoUrl:'https://cdn.discordapp.com/test-logo-rectangle.png',backgroundColor:'#104080'}),null,null);
    const {data,info}=await sharp(image).raw().toBuffer({resolveWithObject:true});
    const pixel=(50*info.width+847)*info.channels;assert.deepEqual([...data.subarray(pixel,pixel+3)],[255,0,0]);
  }finally{global.fetch=previous;}
});
