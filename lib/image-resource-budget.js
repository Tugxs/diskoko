import sharp from 'sharp';

// A small shared native cache/thread budget applies to both the web and bot processes.
sharp.cache({memory:16,files:0,items:64});sharp.concurrency(1);
let active=0;const queue=[];
const busy=()=>Object.assign(Error('معالجة الصور مشغولة مؤقتًا. انتظر قليلًا ثم حاول.'),{status:429,code:'IMAGE_BUSY',expose:true,retryAfter:2});
export const imageResourceStats=()=>({active,queued:queue.length});
export function nativeImageWork(task){
  return new Promise((resolve,reject)=>{
    const start=()=>{active++;Promise.resolve().then(task).then(resolve,reject).finally(()=>{active--;const next=queue.shift();if(next){clearTimeout(next.timer);next.start();}});};
    if(!active)return start();if(queue.length>=2)return reject(busy());
    const item={start};item.timer=setTimeout(()=>{const i=queue.indexOf(item);if(i>=0){queue.splice(i,1);reject(busy());}},2000);item.timer.unref();queue.push(item);
  });
}
export async function readBoundedImage(response,maxBytes=4_000_000){
  if(Number(response.headers.get('content-length') || 0)>maxBytes){await response.body?.cancel().catch(()=>{});throw Error('Image exceeds size limit');}
  if(!response.body)throw Error('Empty image response');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw Error('Image exceeds size limit');chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  return Buffer.concat(chunks,size);
}
export function createImageCache({maxBytes=8*1024*1024,maxEntries=64,now=Date.now}={}){
  if(!Number.isFinite(maxBytes) || maxBytes<1 || !Number.isInteger(maxEntries) || maxEntries<1)throw Error('Invalid image cache budget');
  const entries=new Map();let bytes=0;
  const remove=key=>{const old=entries.get(key);if(old){bytes-=old.bytes;entries.delete(key);}};
  return {
    get(key){const old=entries.get(key);if(!old)return;if(old.value.expires<=now()){remove(key);return;}entries.delete(key);entries.set(key,old);return old.value;},
    set(key,value){remove(key);const size=Buffer.byteLength(String(value.data || ''),'utf8');if(size>maxBytes)return;
      while(entries.size>=maxEntries || bytes+size>maxBytes)remove(entries.keys().next().value);
      entries.set(key,{value,bytes:size});bytes+=size;},
    delete:remove,keys:()=>entries.keys(),get size(){return entries.size;},stats:()=>({entries:entries.size,bytes}),
  };
}
export function sampledGifFrames(pages,delays,maxFrames=24){
  const step=Math.max(1,Math.ceil(pages/maxFrames)),result=[];
  for(let page=0;page<pages;page+=step){let delay=0;for(let i=page;i<Math.min(page+step,pages);i++)delay+=Number(delays?.[i]) || 100;result.push({page,delay});}
  return result;
}
