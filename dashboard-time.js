function partsAt(time,timeZone){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(time).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));}
function epoch(p){return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second || 0);}
export function zonedInputToIso(value,timeZone){
 const m=String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);if(!m)throw Error('أدخل موعدًا صالحًا.');
 const desired={year:+m[1],month:+m[2],day:+m[3],hour:+m[4],minute:+m[5],second:+(m[6] || 0)},target=epoch(desired);let candidate=target;
 if(Object.keys(desired).some(key=>partsAt(target,'UTC')[key]!==desired[key]))throw Error('الموعد غير صالح.');
 for(let i=0;i<4;i++)candidate+=target-epoch(partsAt(candidate,timeZone));
 if(epoch(partsAt(candidate,timeZone))!==target)throw Error('هذا الموعد غير موجود بسبب تغيير التوقيت الصيفي. اختر موعدًا آخر.');
 for(const delta of [-3600000,3600000,-1800000,1800000])if(epoch(partsAt(candidate+delta,timeZone))===target)throw Error('هذا الموعد يتكرر بسبب تغيير التوقيت الصيفي. اختر موعدًا خارج فترة الانتقال أو استخدم UTC.');
 return new Date(candidate).toISOString();
}
export function formatScheduleTime(value,timeZone='UTC',locale='ar'){const date=new Date(value);if(value==null || !Number.isFinite(date.getTime()))return '—';return new Intl.DateTimeFormat(locale,{calendar:'gregory',timeZone,dateStyle:'medium',timeStyle:'short'}).format(date)+' · '+timeZone;}
formatScheduleTime.toIso=zonedInputToIso;
// Recurrence follows the sender's fixed UTC intervals, including its monthly anchor.
formatScheduleTime.upcoming=(value,repeat='once',count=3)=>{
 let next=new Date(value);if(!Number.isFinite(next.getTime()))return [];
 const anchor=next.getUTCDate(),dates=[];
 for(let i=0;i<Math.min(5,count);i++){
  dates.push(next.toISOString());if(repeat==='once')break;
  if(repeat==='monthly'){const last=new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+2,0)).getUTCDate();next=new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,Math.min(anchor,last),next.getUTCHours(),next.getUTCMinutes(),next.getUTCSeconds()));}
  else if(['daily','weekly'].includes(repeat))next=new Date(next.getTime()+(repeat==='weekly'?7:1)*86400000);else break;
 }
 return dates;
};
formatScheduleTime.inputValue=(value,timeZone='UTC')=>{const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';const p=partsAt(date,timeZone),pad=n=>String(n).padStart(2,'0');return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;};
