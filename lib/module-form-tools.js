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
  if(raw.formFields!==undefined)result.formFields=normalizeModuleFields(raw.formFields);
  if(raw.notifyMember!==undefined){if(typeof raw.notifyMember!=='boolean')throw Error('Invalid notification setting.');result.notifyMember=raw.notifyMember;}
  if(raw.dueReminder!==undefined){if(typeof raw.dueReminder!=='boolean')throw Error('Invalid due reminder setting.');result.dueReminder=raw.dueReminder;}
  return result;
}

// Validate the original input before storage; never silently truncate submissions.
export function validateModuleSubmission(config, raw) {
  const limits=moduleFormTools(config);
  if(limits.formFields){const answers=limits.formFields.map(field=>{const value=raw[field.id];if(typeof value!=='string')throw Error('Missing form answer.');const text=value.trim();if((field.required && !text) || (text && text.length<field.minLength) || text.length>field.maxLength)throw Error('Invalid form answer length.');return {id:field.id,label:field.label,value:text};});return {subject:answers[0].value || config.title || 'Request',details:answers.slice(1).map(a=>a.label+': '+a.value).join('\n'),answers};}
  const values={};
  for(const name of ['subject','details']) {
    if(typeof raw[name]!=='string') throw Error('Missing form answer.');
    const value=raw[name].trim();
    if(!value || value.length>limits[name+'MaxLength']) throw Error('Invalid form answer length.');
    values[name]=value;
  }
  return values;
}

export function normalizeModuleFields(fields){
  if(!Array.isArray(fields) || fields.length<1 || fields.length>5)throw Error('Choose 1-5 form fields.');const used=new Set();
  return fields.map((field,index)=>{const id=field?.id || 'field_'+(index+1);const label=String(field?.label || '').trim(),placeholder=String(field?.placeholder || '').trim();const style=field?.style ?? 1,required=field?.required ?? true,maxLength=field?.maxLength ?? (style===2?1000:120),minLength=field?.minLength ?? 0;
    if(!/^[a-z][a-z0-9_]{0,19}$/.test(id) || used.has(id) || !label || label.length>45 || placeholder.length>100 || ![1,2].includes(style) || typeof required!=='boolean' || !Number.isInteger(maxLength) || maxLength<1 || maxLength>1000 || !Number.isInteger(minLength) || minLength<0 || minLength>maxLength)throw Error('Invalid form field.');used.add(id);return {id,label,placeholder,style,required,maxLength,minLength};});
}
export function moduleModalFields(config){const tools=moduleFormTools(config);return tools.formFields || [{id:'subject',label:config.subjectLabel || 'Subject',style:1,required:true,maxLength:tools.subjectMaxLength,minLength:0,placeholder:tools.subjectPlaceholder},{id:'details',label:config.detailsLabel || 'Details',style:2,required:true,maxLength:tools.detailsMaxLength,minLength:0,placeholder:tools.detailsPlaceholder}];}
