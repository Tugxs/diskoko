// Keep rendered metadata dates current without rerendering customer editors.
const dates=new Map();
export function siteDate(value,method='toLocaleString',options){
 const date=value instanceof Date?value:new Date(value);
 const ar=date[method]('ar-SA',options),en=date[method]('en-US',options);
 dates.set(ar,{ar,en});dates.set(en,{ar,en});
 return document.documentElement.lang==='en'?en:ar;
}
export function localizeDateText(text,language){
 for(const [source,pair] of [...dates].sort((a,b)=>b[0].length-a[0].length))if(text.includes(source))text=text.replaceAll(source,pair[language==='en'?'en':'ar']);
 return text;
}
