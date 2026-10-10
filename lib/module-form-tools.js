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
  if(raw.cooldownSeconds!==undefined){if(!Number.isInteger(raw.cooldownSeconds) || raw.cooldownSeconds<30 || raw.cooldownSeconds>3600)throw Error('Submission cooldown must be 30-3600 seconds.');result.cooldownSeconds=raw.cooldownSeconds;}
  if(raw.receiptText!==undefined){const receipt=String(raw.receiptText).trim();if(receipt.length>300)throw Error('Receipt text cannot exceed 300 characters.');result.receiptText=receipt;}
  return result;
}

// Validate the original input before storage; never silently truncate submissions.
export function validateModuleSubmission(config, raw) {
  const limits=moduleFormTools(config);
  const values={};
  for(const name of ['subject','details']) {
    if(typeof raw[name]!=='string') throw Error('Missing form answer.');
    const value=raw[name].trim();
    if(!value || value.length>limits[name+'MaxLength']) throw Error('Invalid form answer length.');
    values[name]=value;
  }
  return values;
}
