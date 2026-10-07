// Shared, bounded design data. No HTML, CSS, scripts, URLs or executable actions.
const hex = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#ffffff';
const number = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.min(max,Math.max(min,Number(value))) : fallback;
export function normalizeDesignScene(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const layers = Array.isArray(source.layers) ? source.layers.slice(0,12).flatMap((layer,index)=>{
    if (!layer || !['text','image','box'].includes(layer.type)) return [];
    return [{id:`layer-${index}`,type:layer.type,x:number(layer.x,10,0,100),y:number(layer.y,10,0,100),width:number(layer.width,80,1,100),height:number(layer.height,30,1,100),
      color:hex(layer.color),opacity:number(layer.opacity,1,0,1),shape:['circle','square','rounded'].includes(layer.shape)?layer.shape:'square',strokeColor:hex(layer.strokeColor),strokeWidth:number(layer.strokeWidth,0,0,20),
      ...(layer.type==='text'?{text:String(layer.text || '').slice(0,500),fontFamily:['Arial','Tahoma','Verdana'].includes(layer.fontFamily)?layer.fontFamily:'Arial',fontSize:number(layer.fontSize,36,14,96),align:['left','center','right'].includes(layer.align)?layer.align:'center',bold:layer.bold===true}:{}),
    }];
  }) : [];
  for(const layer of layers){layer.x=Math.min(layer.x,100-layer.width);layer.y=Math.min(layer.y,100-layer.height);}
  return {version:1,width:1200,height:480,background:hex(source.background || '#171923'),...(source.gradient?{gradient:{color:hex(source.gradient.color),direction:['horizontal','vertical','diagonal'].includes(source.gradient.direction)?source.gradient.direction:'horizontal'}}:{}),layers};
}

export function applyDesignEdits(source, edits) {
  const scene=normalizeDesignScene(source);
  if(!scene || !Array.isArray(edits))return scene;
  const fields=new Set(['text','x','y','width','height','color','opacity','shape','fontSize','fontFamily','align','bold','strokeColor','strokeWidth']);
  for(const edit of edits.slice(0,24)){
    if(!edit || edit.op!=='set')continue;
    if(edit.layer==='background' && edit.field==='color') {scene.background=hex(edit.value);continue;}
    if(Number.isInteger(edit.layer) && edit.layer>=0 && edit.layer<scene.layers.length && fields.has(edit.field))scene.layers[edit.layer][edit.field]=edit.value;
  }
  return normalizeDesignScene(scene);
}

export async function renderDesignScene(source, file) {
  const ranges={x:[0,100],y:[0,100],width:[1,100],height:[1,100],fontSize:[14,96],opacity:[0,1],strokeWidth:[0,20]};
  for(const layer of source?.layers || [])for(const [key,[min,max]] of Object.entries(ranges))if(layer[key]!==undefined && (!Number.isFinite(Number(layer[key])) || Number(layer[key])<min || Number(layer[key])>max))throw Error(`${key}: ${min}–${max}`);
  for(const layer of source?.layers || [])if(Number(layer.x)+Number(layer.width)>100 || Number(layer.y)+Number(layer.height)>100)throw Error('Keep the element within the canvas / حرّك العنصر داخل حدود التصميم');
  const scene=normalizeDesignScene(source);
  if (!scene) throw Error('Invalid design / تصميم غير صالح');
  const canvas=document.createElement('canvas');canvas.width=scene.width;canvas.height=scene.height;
  const ctx=canvas.getContext('2d');
  if (!ctx) throw Error('Canvas unavailable / تعذر رسم التصميم');
  let bitmap;
  if (scene.layers.some(layer=>layer.type==='image')) {
    if (!file || !['image/png','image/jpeg','image/webp'].includes(file.type) || file.size>25*1024*1024) throw Error('Upload a final PNG/JPG/WebP image / ارفع الصورة النهائية');
    bitmap=await createImageBitmap(file);
  }
  try {
    ctx.fillStyle=scene.background;
    if(scene.gradient){const gradient=ctx.createLinearGradient(0,0,scene.gradient.direction==='vertical'?0:1200,scene.gradient.direction==='horizontal'?0:480);gradient.addColorStop(0,scene.background);gradient.addColorStop(1,scene.gradient.color);ctx.fillStyle=gradient;}
    ctx.fillRect(0,0,1200,480);
    for (const layer of scene.layers) {
      const x=layer.x*12,y=layer.y*4.8,w=layer.width*12,h=layer.height*4.8;
      ctx.save();ctx.globalAlpha=layer.opacity;ctx.fillStyle=layer.color;
      if (layer.type==='text') {
        ctx.font=`${layer.bold?'bold ':''}${layer.fontSize}px ${layer.fontFamily}, sans-serif`;ctx.textAlign=layer.align;ctx.textBaseline='top';
        ctx.direction=/\p{Script=Arabic}/u.test(layer.text)?'rtl':'ltr';
        ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
        const lines=[];
        for (const paragraph of layer.text.split('\n')) {
          let line='';
          for (const word of paragraph.split(/\s+/)) {const next=line?`${line} ${word}`:word;if (line && ctx.measureText(next).width>w) {lines.push(line);line=word;} else line=next;}
          lines.push(line);
        }
        const tx=x+(layer.align==='center'?w/2:layer.align==='right'?w:0);
        lines.slice(0,24).forEach((line,index)=>ctx.fillText(line,tx,y+index*layer.fontSize*1.3,w));
      } else {
        ctx.beginPath();
        if (layer.shape==='circle') ctx.arc(x+w/2,y+h/2,Math.min(w,h)/2,0,Math.PI*2);
        else if (layer.shape==='rounded') ctx.roundRect(x,y,w,h,Math.min(w,h)*0.12);
        else ctx.rect(x,y,w,h);
        if (layer.type==='box') ctx.fill();
        else {ctx.clip();const scale=Math.max(w/bitmap.width,h/bitmap.height);ctx.drawImage(bitmap,x+(w-bitmap.width*scale)/2,y+(h-bitmap.height*scale)/2,bitmap.width*scale,bitmap.height*scale);}
        if(layer.strokeWidth){ctx.strokeStyle=layer.strokeColor;ctx.lineWidth=layer.strokeWidth;ctx.stroke();}
      }
      ctx.restore();
    }
    const base64=canvas.toDataURL('image/png').split(',')[1];
    if (base64.length>460000) throw Error('Design too large; simplify it / التصميم كبير، قلّل التفاصيل');
    return {mime:'image/png',base64};
  } finally {bitmap?.close();}
}
