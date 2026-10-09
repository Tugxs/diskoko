export function panelExtras(raw = {}) {
  const imagePlacement=raw.imagePlacement ?? 'image';
  if(!['image','thumbnail'].includes(imagePlacement))throw Error('اختر صورة كبيرة أو صورة جانبية.');
  const links=raw.links ?? [];
  const footer=String(raw.footer ?? '').trim();
  if(footer.length>300)throw Error('تذييل اللوحة لا يتجاوز 300 حرف.');
  if(!Array.isArray(links) || links.length>4)throw Error('الحد الأقصى أربعة أزرار روابط إضافية.');
  return {...(footer?{footer}:{}),imagePlacement,links:links.map(link=>{
    const label=String(link?.label || '').trim(),value=String(link?.url || '').trim();
    let url;try{url=new URL(value);}catch{throw Error('رابط غير صالح.');}
    if(!label || label.length>80 || value.length>512 || url.protocol!=='https:' || url.username || url.password)throw Error('أكمل اسم الزر ورابط HTTPS دون بيانات دخول.');
    return {label,url:url.href};
  })};
}
