// Three-way update: customer edits win; concurrent vendor edits are reported for review.
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function mergeTemplateUpdate(base,custom,latest){
 const conflicts=[];
 const merge=(b,c,n,path)=>{
  if(same(c,b))return structuredClone(n);
  if(same(n,b) || same(c,n))return structuredClone(c);
  if(Array.isArray(b)&&Array.isArray(c)&&Array.isArray(n) && [...b,...c,...n].every(x=>x&&typeof x.key==='string') && [b,c,n].every(xs=>new Set(xs.map(x=>x.key)).size===xs.length)){
   const bm=new Map(b.map(x=>[x.key,x])),cm=new Map(c.map(x=>[x.key,x])),nm=new Map(n.map(x=>[x.key,x]));
   return [...new Set([...c.map(x=>x.key),...n.map(x=>x.key)])].map(key=>merge(bm.get(key),cm.get(key),nm.get(key),`${path}[${key}]`)).filter(x=>x!==undefined);
  }
  if(b && c && n && [b,c,n].every(x=>typeof x==='object'&&!Array.isArray(x))){
   const result={};for(const key of new Set([...Object.keys(b),...Object.keys(c),...Object.keys(n)])){const value=merge(b[key],c[key],n[key],path?`${path}.${key}`:key);if(value!==undefined)result[key]=value;}return result;
  }
  conflicts.push({path,base:b,custom:c,latest:n});return structuredClone(c);
 };
 return {definition:merge(base,custom,latest,''),conflicts};
}
