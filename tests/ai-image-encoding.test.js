import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeDesignImage} from '../ai-design-scene.js';
test('large canvas PNG uses a bounded compressed image without changing its dimensions',()=>{
  const canvas={width:1200,height:480,toDataURL:(mime)=>`data:${mime};base64,${'A'.repeat(mime==='image/png'?600000:40000)}`};
  assert.equal(encodeDesignImage(canvas).mime,'image/webp');
  assert.equal(canvas.width,1200);assert.equal(canvas.height,480);
});
test('unsupported WebP encoding cannot label a fallback PNG as WebP',()=>{
  const canvas={toDataURL:(mime)=>`data:${mime==='image/jpeg'?'image/jpeg':'image/png'};base64,${'A'.repeat(mime==='image/jpeg'?50000:600000)}`};
  assert.equal(encodeDesignImage(canvas).mime,'image/jpeg');
});
test('an image exceeding every encoding limit is blocked before publication',()=>{
  assert.throws(()=>encodeDesignImage({toDataURL:mime=>`data:${mime};base64,${'A'.repeat(600000)}`}),/Design too large/);
});
