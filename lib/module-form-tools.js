// Existing two-field workflows retain their storage and review handlers.
export function moduleFormTools(raw={}) {
  const result={};
  for(const [name,limit] of [['subject',120],['details',1000]]) {
    const max=raw[name+'MaxLength'] ?? limit;
    if(!Number.isInteger(max) || max<1 || max>limit) throw Error(`Invalid ${name} length (1-${limit}).`);
    const placeholder=String(raw[name+'Placeholder'] ?? '').trim();
    if(placeholder.length>100) throw Error('Form hints cannot exceed 100 characters.');
    result[name+'MaxLength']=max;result[name+'Placeholder']=placeholder;
  }
  return result;
}
