import assert from 'node:assert/strict';
import {createTokenBuckets} from '../lib/resource-protection.js';
import {createImageCache} from '../lib/image-resource-budget.js';
const b=createTokenBuckets({capacity:20,perSecond:1,maxKeys:10_000});
const snapshots=[];
for(let round=0;round<3;round++){
  for(let i=0;i<200_000;i++)b.take('synthetic-'+(round*200_000+i));
  global.gc?.();snapshots.push({requests:(round+1)*200_000,keys:b.size(),heapMiB:Math.round(process.memoryUsage().heapUsed/1048576*10)/10});
  assert.ok(b.size()<=10_000);
}
const cache=createImageCache();for(let i=0;i<100;i++)cache.set('synthetic-image-'+i,{data:'x'.repeat(1024*1024),expires:Date.now()+300_000});
assert.ok(cache.stats().bytes<=8*1024*1024);assert.ok(cache.stats().entries<=64);
console.log(JSON.stringify({syntheticKeyPressure:snapshots,imageCache:cache.stats(),note:'Algorithmic bounds only; this is not an authenticated production load/capacity test.'},null,2));
