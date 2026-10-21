// Runs only after a failed Audit on main; no customer payloads or raw CI logs.
const event={id:crypto.randomUUID(),key:'release',type:'incident',at:Date.now()};
try {
  const {createAlertSender}=await import('../lib/operations.js');
  const sender=createAlertSender(process.env);
  for(const channel of ['email','discord'])try{await sender.send(channel,event);}catch{console.warn('CI failure notification not accepted',{channel});}
}catch{
  // npm ci itself might have failed, leaving no mail dependencies. Discord uses
  // only built-in fetch so this important failure can still be reported.
  const url=process.env.OPS_DISCORD_WEBHOOK_URL||'';
  if(/^https:\/\/discord\.com\/api\/webhooks\/\d{17,20}\/[A-Za-z0-9_-]{40,200}$/.test(url))try{
    const r=await fetch(url+'?wait=true',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(10000),body:JSON.stringify({content:'ديسكوكو: فشل فحص النسخة على الفرع الرئيسي. النشر الآلي محجوب؛ راجع GitHub Actions قبل أي نشر يدوي.',allowed_mentions:{parse:[]}})});
    if(!r.ok)console.warn('CI Discord notification not accepted');
  }catch{console.warn('CI Discord notification unavailable');}
  console.warn('CI email dependency unavailable; check native GitHub/Render failure notifications.');
}
