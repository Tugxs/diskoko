import https from 'node:https';
import {lookup} from 'node:dns/promises';
import sharp from 'sharp';
import {publicIpv4} from './code-project-api.js';
export async function centerImage(url,signal){
 const u=new URL(url);if(u.protocol!=='https:' || u.username || u.password || u.port && u.port!=='443' || u.href.length>500)throw Error('استخدم رابط صورة HTTPS عامًا.');
 const addresses=await lookup(u.hostname,{family:4,all:true});if(!addresses.length || addresses.some(a=>!publicIpv4(a.address)))throw Error('روابط الشبكات الداخلية غير مسموحة.');
 const data=await new Promise((resolve,reject)=>{const req=https.get(u,{signal,lookup:(_host,_options,cb)=>cb(null,addresses[0].address,4),headers:{Accept:'image/*'}},res=>{if(res.statusCode!==200){res.resume();reject(Error('تعذر تحميل الصورة؛ التحويلات غير مسموحة.'));return;}const chunks=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>4*1024*1024)res.destroy(Error('الصورة أكبر من 4 MB.'));else chunks.push(chunk);});res.on('error',reject);res.on('end',()=>resolve(Buffer.concat(chunks)));});req.setTimeout(5000,()=>req.destroy(Error('انتهت مهلة تحميل الصورة.')));req.on('error',reject);});
 const info=await sharp(data,{limitInputPixels:16000000}).metadata();if(!['png','jpeg','gif','webp'].includes(info.format))throw Error('الصورة يجب أن تكون PNG أو JPEG أو GIF أو WebP.');return {data,info};
}
export async function emojiImage(url,signal){const {data}=await centerImage(url,signal);const png=await sharp(data,{limitInputPixels:16000000}).resize(128,128,{fit:'inside'}).png().toBuffer();if(png.length>256000)throw Error('صورة الإيموجي تتجاوز الحجم المتاح.');return 'data:image/png;base64,'+png.toString('base64');}
export async function circleImage(url,signal){const {data}=await centerImage(url,signal);return sharp(data,{limitInputPixels:16000000}).resize(128,128,{fit:'cover'}).composite([{input:Buffer.from('<svg width="128" height="128"><circle cx="64" cy="64" r="64" fill="white"/></svg>'),blend:'dest-in'}]).png({palette:true,colours:32}).toBuffer();}
