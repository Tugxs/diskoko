function attachEditorStorage(root,english){
  root.editorStorageDispose?.();let disposed=false;
  const scope=root.dataset.editorScope,win=root.ownerDocument.defaultView;if(!scope || !win.indexedDB)return;
  const status=document.createElement('small');status.className='form-note';status.textContent=english?'Draft saves on this device':'المسودة تُحفظ على هذا الجهاز';root.querySelector('.editor-stage').append(status);const restore=document.createElement('button');restore.type='button';restore.textContent=english?'Restore saved draft':'استعادة مسودة محفوظة';restore.hidden=true;status.after(restore);let db,saved,timer;
  const opened=win.indexedDB.open('diskoko-editor-drafts',1);opened.onupgradeneeded=()=>opened.result.createObjectStore('drafts');opened.onsuccess=()=>{db=opened.result;if(disposed){db.close();return;}const read=db.transaction('drafts').objectStore('drafts').get(scope);read.onsuccess=()=>{saved=read.result;restore.hidden=!saved;};};opened.onerror=()=>status.textContent=english?'Draft storage unavailable':'تعذر حفظ المسودة على الجهاز';
  const capture=()=>({fields:[...root.querySelectorAll('input[id],textarea[id],select[id]')].filter(field=>!/confirm/i.test(field.id)).map(field=>({id:field.id,value:field.multiple?[...field.selectedOptions].map(option=>option.value):field.type==='checkbox'?field.checked:field.value,files:field.type==='file'?[...field.files]:undefined})),form:root.editorFormSnapshot?.(),faq:root.editorFaqSnapshot?.(),scene:root.editorSceneSnapshot?.(),time:Date.now()});
  const save=()=>{win.clearTimeout(timer);timer=win.setTimeout(()=>{if(!db || disposed)return;try{const current=capture(),record={...current,previous:saved?{...saved,previous:undefined}:undefined};const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(record,scope);tx.oncomplete=()=>{saved=record;restore.hidden=false;status.textContent=english?'Draft saved on this device':'حُفظت المسودة على الجهاز';};tx.onerror=()=>status.textContent=english?'Draft could not be saved':'تعذر حفظ المسودة';}catch{status.textContent=english?'Draft could not be saved':'تعذر حفظ المسودة';}},500);};
  const apply=record=>{if(!record)return;if(record.form)root.editorFormRestore?.(record.form);if(record.faq)root.editorFaqRestore?.(record.faq);if(record.scene)root.editorSceneRestore?.(record.scene);for(const item of record.fields){const field=root.querySelector('#'+item.id);if(!field)continue;if(field.type==='file'){if(win.DataTransfer){const transfer=new win.DataTransfer();for(const file of item.files || [])transfer.items.add(file);field.files=transfer.files;}}else if(field.multiple){for(const option of field.options)option.selected=item.value.includes(option.value);}else if(field.type==='checkbox')field.checked=item.value;else field.value=item.value;field.dispatchEvent(new win.Event('input',{bubbles:true}));field.dispatchEvent(new win.Event('change',{bubbles:true}));}};restore.onclick=()=>apply(saved);const previous=document.createElement('button');previous.type='button';previous.textContent=english?'Restore previous saved version':'استعادة النسخة المحفوظة السابقة';previous.onclick=()=>apply(saved?.previous);restore.after(previous);root.addEventListener('input',save);root.addEventListener('change',save);root.editorStorageDispose=()=>{disposed=true;win.clearTimeout(timer);root.removeEventListener('input',save);root.removeEventListener('change',save);db?.close();};
}
// Presentation layer. Existing fields and review handlers remain authoritative.
function enhanceEditorContent(root,english) {
  for(const field of root.querySelectorAll('textarea[maxlength],input[maxlength]:not([type])')) {
    if(field.dataset.editorEnhanced)continue;
    field.dataset.editorEnhanced='true';
    const count=document.createElement('small');count.className='form-note';count.setAttribute('aria-live','polite');
    field.after(count);const update=()=>count.textContent=`${field.value.length} / ${field.maxLength}`;field.addEventListener('input',update);update();
    if(field.tagName!=='TEXTAREA')continue;
    const bar=document.createElement('div');bar.className='editor-tools';
    for(const [ar,en,start,end] of [['عريض','Bold','**','**'],['مائل','Italic','*','*'],['تسطير','Underline','__','__'],['شطب','Strike','~~','~~'],['مخفي','Spoiler','||','||'],['اقتباس','Quote','> ',''],['قائمة','List','- ',''],['كود','Code','`','`']]){
      const button=document.createElement('button');button.type='button';button.textContent=english?en:ar;
      button.onclick=()=>{const a=field.selectionStart,b=field.selectionEnd;const value=field.value.slice(a,b);if(field.value.length+start.length+end.length>field.maxLength)return;field.setRangeText(start+value+end,a,b,'select');field.dispatchEvent(new root.ownerDocument.defaultView.Event('input',{bubbles:true}));field.focus();};bar.append(button);
    }
    field.before(bar);
  }
  const colorField=root.querySelector('input[type="color"]');
  if(colorField && !root.querySelector('[data-editor-palette]')){const presets=document.createElement('div');presets.dataset.editorPalette='true';presets.className='editor-tools';presets.setAttribute('aria-label',english?'Color combinations':'ألوان متناسقة');
    for(const [ar,en,color,style] of [['هادئ','Calm','#5865f2',1],['واضح','Clear','#248046',3],['محايد','Neutral','#4e5058',2]]){const preset=document.createElement('button');preset.type='button';preset.textContent=english?en:ar;preset.onclick=()=>{colorField.value=color;const buttonStyle=root.querySelector('#moduleButtonStyle');if(buttonStyle)buttonStyle.value=style;colorField.dispatchEvent(new root.ownerDocument.defaultView.Event('input',{bubbles:true}));};presets.append(preset);}colorField.closest('label').after(presets);
  }
  for(const field of root.querySelectorAll('input[type="color"]')){
    if(field.dataset.editorEnhanced)continue;field.dataset.editorEnhanced='true';
    const palette=document.createElement('div');palette.className='editor-tools';
    for(const color of ['#5865f2','#248046','#da373c','#f0b232','#4e5058','#8d72e8']){const button=document.createElement('button');button.type='button';button.textContent=color;button.style.borderColor=color;button.title=color;button.onclick=()=>{field.value=color;field.dispatchEvent(new root.ownerDocument.defaultView.Event('input',{bubbles:true}));};palette.append(button);}field.after(palette);
  }
}
export function mountPanelStudio(root) {
  let optedOut;try{optedOut=new URLSearchParams(root.ownerDocument.defaultView.location.search).get('editorPreview')==='0';}catch{return false;}
  const body=root.querySelector('.dialog-body'),preview=body?.querySelector('.ai-discord-preview');
  if(!preview || root.querySelector('.editor-workspace') || optedOut)return false;
  const english=document.querySelector('#aiInterfaceLanguage')?.value==='en';
  const layout=document.createElement('div');layout.className='editor-workspace';
  layout.innerHTML=`<aside class="editor-inspector"><nav>${(english?['Content','Appearance','Function & review']:['المحتوى','المظهر','الوظيفة والمراجعة']).map((name,i)=>`<button type="button" data-studio-tab="${i}" aria-pressed="${i===0}">${name}</button>`).join('')}</nav><div data-studio-fields="0"></div><div data-studio-fields="1" hidden></div><div data-studio-fields="2" hidden></div></aside><section class="editor-stage"></section>`;
  for(const node of [...body.children]){
    if(node===preview || node.id==='dialogError' || node.classList.contains('ai-emoji-picker'))continue;
    const ids=[...node.querySelectorAll('input,select,textarea')].map(input=>input.id).join(' ');
    const index=/Channel|Role|Confirmed|Confirm|Starts|Duration|Winners|Prize|NativeType|NativeLocation/.test(ids)?2:/Image|Color|Style|Position|Avatar/.test(ids) || node.classList.contains('ai-scene-review')?1:0;
    layout.querySelector(`[data-studio-fields="${index}"]`).append(node);
  }
  layout.querySelector('.editor-stage').append(preview);body.append(layout);
  root.closest('dialog').classList.add('ai-editor-prototype');
  const select=index=>{layout.querySelectorAll('[data-studio-fields]').forEach(node=>node.hidden=Number(node.dataset.studioFields)!==index);layout.querySelectorAll('[data-studio-tab]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.studioTab)===index)));};
  layout.querySelectorAll('[data-studio-tab]').forEach(button=>button.onclick=()=>select(Number(button.dataset.studioTab)));
  for(const [selector,ids] of [['#aiPreviewTitle',['aiInteractiveTitle','aiPollQuestion']],['#aiPreviewDescription',['aiInteractiveDescription']],['#aiMessagePreviewText',['aiMessageContent']],['#aiSpecialPreviewTitle',['aiSpecialTitle']]]){
    const node=preview.querySelector(selector),field=ids.map(id=>root.querySelector('#'+id)).find(Boolean);if(!node || !field)continue;
    node.tabIndex=0;node.setAttribute('role','button');node.title=english?'Edit this element':'تعديل هذا العنصر';
    const edit=()=>{select(Number(field.closest('[data-studio-fields]').dataset.studioFields));field.focus();field.scrollIntoView({block:'nearest'});};node.onclick=edit;node.onkeydown=event=>{if(event.key==='Enter' || event.key===' '){event.preventDefault();edit();}};
  }
  enhanceEditorContent(root,english);
  attachEditorStorage(root,english);
  root.editorDispose=()=>root.closest('dialog').classList.remove('ai-editor-prototype');return true;
}
export function readEditorExtras(root) {
  const placement=root.querySelector('#moduleImagePlacement');
  if(!placement)return null;
  return {...(root.querySelector('#moduleWaitlist')?{reminderMinutes:Number(root.querySelector('#moduleReminder').value),waitlist:root.querySelector('#moduleWaitlist').checked,checkIn:root.querySelector('#moduleCheckIn').checked}:{}),...(root.querySelector('#moduleRoleIds')?.selectedOptions.length?{roleIds:[...root.querySelector('#moduleRoleIds').selectedOptions].map(option=>option.value),maxRoles:Number(root.querySelector('#moduleMaxRoles').value)}:{}),...(root.editorFaqSnapshot?.().length?{questions:root.editorFaqSnapshot()}:{}),...(root.querySelector('#moduleCustomFields')?.checked?{formFields:[...root.querySelectorAll('[data-module-field]')].map(row=>({id:row.dataset.moduleField,label:row.querySelector('[data-field-label]').value,placeholder:row.querySelector('[data-field-hint]').value,style:Number(row.querySelector('[data-field-style]').value),required:row.querySelector('[data-field-required]').checked,maxLength:Number(row.querySelector('[data-field-max]').value),minLength:Number(row.querySelector('[data-field-min]').value)}))}:{}),...(root.querySelector('#moduleNotify')?{notifyMember:root.querySelector('#moduleNotify').checked}:{}),...(root.querySelector('#moduleCooldown')?{cooldownSeconds:Number(root.querySelector('#moduleCooldown').value),receiptText:root.querySelector('#moduleReceipt').value}:{}),layout:root.querySelector('#moduleLayout')?.value || 'classic',footer:root.querySelector('#moduleFooter')?.value || '',imagePlacement:placement.value,links:[...root.querySelectorAll('[data-editor-link-row]')].filter(row=>!row.hidden).map(row=>({label:row.querySelector('input[data-link-label]').value.trim(),url:row.querySelector('input[data-link-url]').value.trim()}))};
}
export function mountEditorPrototype(root, { english = false, markdown, botName = 'Diskoko', initial = {}, workflow = '', identity } = {}) {
  if (new URLSearchParams(location.search).get('editorPreview')==='0') return false;
  const body = root.querySelector('.dialog-body');
  const sections = [...body.querySelectorAll('.ai-module-section')];
  if (!sections.length) return false;
  root.closest('dialog').classList.add('ai-editor-prototype');
  const words = english ? ['Content', 'Appearance', 'Function & destination', 'Discord preview', 'Select an element to edit it. Nothing is published until final confirmation.'] : ['المحتوى', 'المظهر', 'الوظيفة والقناة', 'معاينة Discord', 'اختر عنصرًا لتعديله. لا يحدث نشر قبل المراجعة والتأكيد النهائي.'];
  const layout = document.createElement('div');
  layout.className = 'editor-workspace';
  layout.innerHTML = `<aside class="editor-inspector"><nav aria-label="${english ? 'Editor sections' : 'أقسام التعديل'}">${words.slice(0,3).map((word,i)=>`<button type="button" data-editor-tab="${i}" aria-pressed="${i===0}">${word}</button>`).join('')}</nav><div class="editor-fields"></div></aside><section class="editor-stage"><header><b>${words[3]}</b><p>${words[4]}</p></header><div class="editor-discord"><div class="editor-bot"></div><article class="editor-card"><button type="button" data-editor-target="moduleTitle" class="editor-title"></button><button type="button" data-editor-target="moduleDescription" class="editor-description"></button><button type="button" data-editor-target="moduleBanner" class="editor-image" hidden><img alt="${english ? 'Final panel image' : 'صورة اللوحة النهائية'}"></button><button type="button" data-editor-target="moduleButton" class="editor-button"></button></article><p class="editor-destination"></p></div></section>`;
  body.append(layout);
  const inspector = layout.querySelector('.editor-fields');
  // Content, appearance, then operational settings; move, never clone, real inputs.
  const ordered = [sections[0], sections[2], sections[1]].filter(Boolean);
  ordered.forEach((section,index)=>{section.dataset.editorSection=index; inspector.append(section);});
  const guide=document.createElement('p');guide.className='editor-workflow-note';
  guide.textContent=(workflow?workflow+' ':'')+(english?'The main button keeps this module action. Additional buttons open HTTPS links only. Channels, roles and permissions are checked again before publication.':'الزر الأساسي ينفّذ وظيفة هذه اللوحة. الأزرار الإضافية تفتح روابط HTTPS فقط. تُفحص القنوات والرتب والصلاحيات مجددًا قبل النشر.');
  ordered[2].prepend(guide);
  const appearance = ordered[1];
  const text=(ar,en)=>english?en:ar;
  if(root.querySelector('#moduleCapacity')){const label=document.createElement('label');label.textContent=text('تذكير في قناة الفعالية قبل الموعد بالدقائق؛ صفر يعطله','Channel reminder before start in minutes; zero disables');const reminder=document.createElement('input');reminder.type='number';reminder.id='moduleReminder';reminder.min=0;reminder.max=10080;reminder.value=initial.reminderMinutes || 0;label.append(reminder);ordered[2].append(label);for(const [id,ar,en] of [['moduleWaitlist','قائمة انتظار عند اكتمال الأماكن','Waiting list when full'],['moduleCheckIn','زر تأكيد الحضور عند الموعد','Check-in button when event starts']]){const label=document.createElement('label');label.textContent=text(ar,en);const input=document.createElement('input');input.type='checkbox';input.id=id;input.checked=initial[id==='moduleWaitlist'?'waitlist':'checkIn']===true;label.append(input);ordered[2].append(label);}}
  if(root.querySelector('#moduleRole')){
    const label=document.createElement('label');label.textContent=text('رتب متعددة اختيارية (حتى 25)','Optional multiple roles (up to 25)');const select=document.createElement('select');select.id='moduleRoleIds';select.multiple=true;select.size=6;select.innerHTML=root.querySelector('#moduleRole').innerHTML;for(const option of select.options)option.selected=(initial.roleIds || []).includes(option.value);label.append(select);ordered[2].append(label);
    const maxLabel=document.createElement('label');maxLabel.textContent=text('أقصى عدد اهتمامات للعضو','Maximum interests per member');const max=document.createElement('input');max.id='moduleMaxRoles';max.type='number';max.min=1;max.max=25;max.value=initial.maxRoles || 1;maxLabel.append(max);ordered[2].append(maxLabel);
  }
  if(root.querySelector('#moduleAnswer')){
    const questions=document.createElement('div');questions.dataset.faqQuestions='true';ordered[2].append(questions);
    const addQuestion=value=>{if(questions.children.length>=25)return;const row=document.createElement('fieldset');row.dataset.faqQuestion='true';const label=document.createElement('label');label.textContent=text('السؤال','Question');const question=document.createElement('input');question.dataset.faqTitle='true';question.maxLength=100;question.value=value?.question || '';label.append(question);const answerLabel=document.createElement('label');answerLabel.textContent=text('الإجابة الخاصة','Private answer');const answer=document.createElement('textarea');answer.dataset.faqAnswer='true';answer.maxLength=1800;answer.value=value?.answer || '';answerLabel.append(answer);const remove=document.createElement('button');remove.type='button';remove.textContent=text('حذف السؤال','Remove question');remove.onclick=()=>{row.remove();questions.dispatchEvent(new root.ownerDocument.defaultView.Event('input',{bubbles:true}));};row.append(label,answerLabel,remove);questions.append(row);};
    for(const value of initial.questions || [])addQuestion(value);
    const add=document.createElement('button');add.type='button';add.textContent=text('+ سؤال وإجابة','+ Question and answer');add.onclick=()=>{addQuestion();questions.dispatchEvent(new root.ownerDocument.defaultView.Event('input',{bubbles:true}));};ordered[2].append(add);
    const legacy=root.querySelector('#moduleAnswer');const visibility=()=>legacy.closest('label').hidden=questions.children.length>0;questions.addEventListener('input',visibility);add.addEventListener('click',visibility);visibility();
    root.editorFaqSnapshot=()=>[...questions.children].map(row=>({question:row.querySelector('[data-faq-title]').value,answer:row.querySelector('[data-faq-answer]').value}));
    root.editorFaqRestore=value=>{questions.replaceChildren();for(const question of value)addQuestion(question);visibility();};
  }
  const tools=document.createElement('div');tools.className='editor-tools';
  tools.innerHTML=`<button type="button" data-editor-add-image>${text('+ صورة','+ Image')}</button><button type="button" data-editor-add-link>${text('+ زر رابط','+ Link button')}</button><button type="button" data-editor-undo>${text('تراجع','Undo')}</button><button type="button" data-editor-redo>${text('إعادة','Redo')}</button>`;
  layout.querySelector('.editor-stage header').append(tools);
  const position=document.createElement('label');position.textContent=text('موضع الصورة في Discord','Discord image placement');
  const layoutLabel=document.createElement('label');layoutLabel.textContent=text('ترتيب العرض','Presentation order');const layoutChoice=document.createElement('select');layoutChoice.id='moduleLayout';layoutChoice.innerHTML=`<option value="classic">${text('النص ثم الصورة','Text then image')}</option><option value="image_first">${text('الصورة ثم البطاقة — صورتان مضمنتان في الرسالة','Image then card — two embeds in the message')}</option>`;layoutChoice.value=initial.layout || 'classic';layoutLabel.append(layoutChoice);appearance.append(layoutLabel);
  const positionInput=document.createElement('select');positionInput.id='moduleImagePlacement';
  positionInput.innerHTML=`<option value="image">${text('صورة كبيرة تحت النص','Large image below text')}</option><option value="thumbnail">${text('صورة صغيرة أعلى اليمين','Small image at top right')}</option>`;
  positionInput.value=initial.imagePlacement || 'image';position.append(positionInput);appearance.append(position);
  if(root.querySelector('#moduleSubjectLabel')){
    const notifyLabel=document.createElement('label');notifyLabel.textContent=text('إشعار العضو برسالة خاصة عند تغيّر الحالة (قد تكون رسائله مغلقة)','Notify member by DM on status changes (DMs may be closed)');const notify=document.createElement('input');notify.type='checkbox';notify.id='moduleNotify';notify.checked=initial.notifyMember===true;notifyLabel.append(notify);ordered[2].append(notifyLabel);
    const customLabel=document.createElement('label');customLabel.textContent=text('تخصيص خانات النموذج (1 إلى 5)','Customize form fields (1 to 5)');const custom=document.createElement('input');custom.type='checkbox';custom.id='moduleCustomFields';custom.checked=Array.isArray(initial.formFields);customLabel.append(custom);ordered[2].append(customLabel);const fieldList=document.createElement('div');fieldList.className='editor-custom-fields';ordered[2].append(fieldList);
    const addField=field=>{if(fieldList.children.length>=5)return;const row=document.createElement('fieldset');row.dataset.moduleField=field.id;row.innerHTML=`<label>${text('اسم الخانة','Field label')}<input data-field-label maxlength="45"></label><label>${text('إرشاد','Hint')}<input data-field-hint maxlength="100"></label><label>${text('نوع الإجابة','Answer type')}<select data-field-style><option value="1">${text('نص قصير','Short text')}</option><option value="2">${text('نص طويل','Paragraph')}</option></select></label><label>${text('مطلوبة','Required')}<input data-field-required type="checkbox"></label><label>${text('أقل طول','Minimum length')}<input data-field-min type="number" min="0" max="1000"></label><label>${text('أقصى طول','Maximum length')}<input data-field-max type="number" min="1" max="1000"></label>`;for(const [key,value]of [['label',field.label],['hint',field.placeholder || ''],['style',field.style || 1],['min',field.minLength || 0],['max',field.maxLength || 120]])row.querySelector('[data-field-'+key+']').value=value;row.querySelector('[data-field-required]').checked=field.required!==false;for(const [ar,en,fn]of [['حذف','Remove',()=>{if(fieldList.children.length>1)row.remove();}],['أعلى','Up',()=>row.previousElementSibling?.before(row)],['أسفل','Down',()=>row.nextElementSibling?.after(row)]]){const button=document.createElement('button');button.type='button';button.textContent=text(ar,en);button.onclick=()=>{fn();fieldList.dispatchEvent(new root.ownerDocument.defaultView.Event('input',{bubbles:true}));};row.append(button);}fieldList.append(row);};
    for(const field of initial.formFields || [{id:'subject',label:root.querySelector('#moduleSubjectLabel').value,style:1,maxLength:120},{id:'details',label:root.querySelector('#moduleDetailsLabel').value,style:2,maxLength:1000}])addField(field);
    const add=document.createElement('button');add.type='button';add.textContent=text('+ إضافة خانة','+ Add field');add.onclick=()=>{const ids=new Set([...fieldList.children].map(row=>row.dataset.moduleField));let index=1;while(ids.has('field_'+index))index++;addField({id:'field_'+index,label:text('خانة جديدة','New field')});fieldList.dispatchEvent(new root.ownerDocument.defaultView.Event('input',{bubbles:true}));};ordered[2].append(add);const showFields=()=>{fieldList.hidden=add.hidden=!custom.checked;};custom.addEventListener('change',showFields);showFields();
    root.editorFormSnapshot=()=>({enabled:custom.checked,fields:[...fieldList.children].map(row=>({id:row.dataset.moduleField,label:row.querySelector('[data-field-label]').value,placeholder:row.querySelector('[data-field-hint]').value,style:Number(row.querySelector('[data-field-style]').value),required:row.querySelector('[data-field-required]').checked,minLength:Number(row.querySelector('[data-field-min]').value),maxLength:Number(row.querySelector('[data-field-max]').value)}))});root.editorFormRestore=value=>{fieldList.replaceChildren();for(const field of value.fields)addField(field);custom.checked=value.enabled;showFields();};
    const cooldownLabel=document.createElement('label');cooldownLabel.textContent=text('فاصل طلبات العضو بالثواني (30–3600)','Seconds between member submissions (30–3600)');const cooldown=document.createElement('input');cooldown.id='moduleCooldown';cooldown.type='number';cooldown.min=30;cooldown.max=3600;cooldown.value=initial.cooldownSeconds ?? 30;cooldownLabel.append(cooldown);ordered[2].append(cooldownLabel);
    const receiptLabel=document.createElement('label');receiptLabel.textContent=text('رسالة استلام خاصة اختيارية — يضاف رقم متابعة','Optional private receipt — tracking number is retained');const receipt=document.createElement('textarea');receipt.id='moduleReceipt';receipt.maxLength=300;receipt.value=initial.receiptText || '';receiptLabel.append(receipt);ordered[2].append(receiptLabel);
  }
  const footerLabel=document.createElement('label');footerLabel.textContent=text('تذييل اختياري — لا يضاف تلقائيًا','Optional footer — never added automatically');
  const footerInput=document.createElement('input');footerInput.id='moduleFooter';footerInput.maxLength=300;footerInput.value=initial.footer || '';footerLabel.append(footerInput);ordered[0].append(footerLabel);
  if(identity){const generation=root.editorGeneration;const status=document.createElement('small');status.className='form-note';const save=document.createElement('button');save.type='button';save.textContent=text('حفظ ألوان وتذييل هذا السيرفر والبوت','Save this server and bot identity');save.onclick=async()=>{try{await identity.save({color:root.querySelector('#moduleColor').value,buttonStyle:Number(root.querySelector('#moduleButtonStyle').value),footer:footerInput.value});status.textContent=text('حُفظت الهوية دون تغيير اللوحات المنشورة','Identity saved without changing published panels');}catch(error){status.textContent=error.message;}};const apply=document.createElement('button');apply.type='button';apply.textContent=text('تطبيق الهوية المحفوظة','Apply saved identity');apply.onclick=async()=>{try{const config=await identity.load();if(root.editorGeneration!==generation)return;if(!config){status.textContent=text('لا توجد هوية محفوظة','No saved identity');return;}for(const [id,key]of [['moduleColor','color'],['moduleButtonStyle','buttonStyle'],['moduleFooter','footer']]){const field=root.querySelector('#'+id);field.value=config[key];field.dispatchEvent(new root.ownerDocument.defaultView.Event('input',{bubbles:true}));}status.textContent=text('طُبقت على المسودة الحالية','Applied to current draft');}catch(error){status.textContent=error.message;}};appearance.append(save,apply,status);}
  const footerPreview=document.createElement('small');footerPreview.className='editor-footer';layout.querySelector('.editor-card').append(footerPreview);
  if(root.querySelector('#moduleSubjectLabel')){const history=document.createElement('button');history.type='button';history.className='editor-button';history.textContent=text('طلباتي','My requests');history.title=text('يعرض للعضو طلباته فقط','Shows only the member’s own requests');layout.querySelector('.editor-card').append(history);}
  const actionPreview=document.createElement('section');actionPreview.className='editor-action-preview';layout.querySelector('.editor-stage').append(actionPreview);
  const linkSection=document.createElement('div');linkSection.className='editor-links';ordered[0].append(linkSection);
  for(let i=0;i<4;i++){
    const row=document.createElement('div');row.dataset.editorLinkRow=i;row.hidden=!initial.links?.[i];
    row.innerHTML=`<label>${text('اسم زر الرابط','Link button label')}<input data-link-label id="editorLinkLabel${i}" maxlength="80"></label><label>${text('رابط HTTPS','HTTPS URL')}<input data-link-url id="editorLinkUrl${i}" type="url" maxlength="512" dir="ltr"></label><button type="button" data-remove-link>${text('حذف الرابط','Remove link')}</button>`;
    row.querySelector('[data-link-label]').value=initial.links?.[i]?.label || '';row.querySelector('[data-link-url]').value=initial.links?.[i]?.url || '';
    row.querySelector('[data-remove-link]').onclick=()=>{row.hidden=true;row.querySelectorAll('input').forEach(field=>field.value='');row.dispatchEvent(new root.ownerDocument.defaultView.Event('input',{bubbles:true}));};linkSection.append(row);
    for(const [direction,ar,en] of [[-1,'تقديم الرابط','Move link up'],[1,'تأخير الرابط','Move link down']]){
      const move=document.createElement('button');move.type='button';move.textContent=text(ar,en);
      move.onclick=()=>{const visible=[...linkSection.children].filter(node=>!node.hidden);const at=visible.indexOf(row),other=visible[at+direction];if(!other)return;if(direction<0)other.before(row);else other.after(row);row.dispatchEvent(new root.ownerDocument.defaultView.Event('input',{bubbles:true}));};row.append(move);
    }
  }
  const previewLinks=document.createElement('div');previewLinks.className='editor-preview-links';layout.querySelector('.editor-card').append(previewLinks);
  for (const selector of ['.ai-scene-review', '#moduleBanner', '#moduleBannerPreview']) {
    const node = body.querySelector(selector);
    if (node) appearance.append(node.closest('label') || node);
  }
  const scene = appearance.querySelector('.ai-scene-review');
  if (scene) {
    const advanced = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = english ? 'Advanced image composition' : 'تصميم صورة مركبة — خيارات متقدمة';
    advanced.append(summary); scene.before(advanced); advanced.append(scene);
  }
  const select = index => {
    ordered.forEach((section,i)=>section.hidden=i!==index);
    layout.querySelectorAll('[data-editor-tab]').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
  };
  layout.querySelectorAll('[data-editor-tab]').forEach(button=>button.onclick=()=>select(Number(button.dataset.editorTab)));
  const get = id => root.querySelector('#'+id);
  tools.querySelector('[data-editor-add-image]').onclick=()=>{select(1);get('moduleBanner').focus();get('moduleBanner').click();};
  tools.querySelector('[data-editor-add-link]').onclick=()=>{const row=[...linkSection.children].find(row=>row.hidden);if(!row)return;row.hidden=false;select(0);row.querySelector('input').focus();row.dispatchEvent(new root.ownerDocument.defaultView.Event('input',{bubbles:true}));};
  layout.querySelectorAll('[data-editor-target]').forEach(button=>button.onclick=()=>{
    const field=get(button.dataset.editorTarget); if (!field) return;
    const section=field.closest('[data-editor-section]'); if(section)select(Number(section.dataset.editorSection));
    field.focus(); field.scrollIntoView({block:'nearest'});
  });
  let objectUrl;
  const update = () => {
    if(!root.ownerDocument.defaultView?.document)return;
    layout.querySelectorAll('.editor-title,.editor-description,.editor-button').forEach(node=>node.setAttribute('dir','auto'));
    layout.querySelector('.editor-bot').textContent=botName;
    footerPreview.textContent=footerInput.value;footerPreview.hidden=!footerInput.value;
    actionPreview.replaceChildren();
    const heading=document.createElement('b');heading.textContent=text('ما يحدث عند ضغط الزر','What happens when the button is pressed');actionPreview.append(heading);
    const explanation=document.createElement('p');explanation.textContent=workflow;actionPreview.append(explanation);
    if(get('moduleCustomFields')?.checked){for(const field of readEditorExtras(root).formFields){const label=document.createElement('label');label.textContent=field.label+(field.required?' *':'');const input=document.createElement(field.style===2?'textarea':'input');input.disabled=true;input.placeholder=field.placeholder;label.append(input);actionPreview.append(label);}}
    else if(get('moduleSubjectLabel'))for(const prefix of ['subject','details']){
      const label=document.createElement('label');label.textContent=get(prefix==='subject'?'moduleSubjectLabel':'moduleDetailsLabel').value+' *';
      const hint=get('module'+prefix+'Placeholder')?.value || '';const input=document.createElement(prefix==='subject'?'input':'textarea');input.placeholder=hint;input.disabled=true;label.append(input);
      const limit=document.createElement('small');limit.textContent=text('الحد الأقصى: ','Maximum: ')+(get('module'+prefix+'MaxLength')?.value || '') ;label.append(limit);actionPreview.append(label);
    }
    if(get('moduleReceipt')?.value){const receipt=document.createElement('p');receipt.textContent=text('رسالة الاستلام: ','Private receipt: ')+get('moduleReceipt').value+' · '+text('رقم متابعة','Tracking number');actionPreview.append(receipt);}
    if(get('moduleCooldown')){const note=document.createElement('small');note.textContent=text('فاصل الطلبات بالثواني: ','Submission cooldown in seconds: ')+get('moduleCooldown').value;actionPreview.append(note);}
    if(get('moduleAnswer')){const questions=root.editorFaqSnapshot?.() || [];if(questions.length){const select=document.createElement('select');for(const [index,question]of questions.entries()){const option=document.createElement('option');option.value=index;option.textContent=question.question;select.append(option);}const answer=document.createElement('p');const selected=()=>answer.textContent=questions[Number(select.value)]?.answer || '';select.onchange=selected;selected();actionPreview.append(select,answer);}else{const answer=document.createElement('p');answer.textContent=get('moduleAnswer').value || text('أكمل الإجابة التي تظهر للعضو','Complete the private answer');actionPreview.append(answer);}}
    if(get('moduleCapacity')){const summary=document.createElement('p');summary.textContent=text('عدد الأماكن: ','Capacity: ')+(get('moduleCapacity').value==='0'?text('مفتوح','Unlimited'):get('moduleCapacity').value)+' · '+(get('moduleStartsAt')?.value || text('دون موعد إغلاق','No closing time'));actionPreview.append(summary);}
    if(get('moduleRole')){const role=document.createElement('p');role.textContent=get('moduleRoleIds')?.selectedOptions.length?[...get('moduleRoleIds').selectedOptions].map(option=>option.textContent).join(' · ')+' ( '+get('moduleMaxRoles').value+' )':get('moduleRole').selectedOptions[0]?.textContent || '';actionPreview.append(role);}
    layout.querySelector('.editor-title').textContent=get('moduleTitle').value;
    layout.querySelector('.editor-description').innerHTML=markdown(get('moduleDescription').value);
    const button=layout.querySelector('[data-editor-target="moduleButton"]'); button.textContent=get('moduleButton').value;
    button.style.background=['','#5865f2','#4e5058','#248046','#da373c'][Number(get('moduleButtonStyle').value)] || '#5865f2';
    layout.querySelector('.editor-card').style.borderInlineStartColor=get('moduleColor').value;
    const channel=get('moduleChannel');
    layout.querySelector('.editor-destination').textContent=channel.value ? `# ${channel.selectedOptions[0].textContent}` : (english?'Choose the destination under Function & destination':'اختر قناة النشر من قسم الوظيفة والقناة');
    const image=layout.querySelector('.editor-image'), file=get('moduleBanner').files[0];
    const composed=scene?.querySelector('[data-scene-enabled]')?.checked ? scene.querySelector('[data-scene-preview]:not([hidden])') : null;
    const saved=get('moduleBannerPreview')?.querySelector('img');
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl=undefined; }
    const src=composed?.src || (file && /^image\/(png|jpeg|webp|gif)$/.test(file.type) && file.size<=8*1024*1024 ? (objectUrl=URL.createObjectURL(file)) : saved?.src);
    image.hidden=!src; if(src)image.querySelector('img').src=src;
    const thumbnail=positionInput.value==='thumbnail';image.classList.toggle('editor-thumbnail',thumbnail);
    const card=layout.querySelector('.editor-card');if(thumbnail)card.prepend(image);else if(layoutChoice.value==='image_first')card.querySelector('.editor-title').before(image);else card.insertBefore(image,button);
    previewLinks.replaceChildren();
    for(const row of [...linkSection.children].filter(row=>!row.hidden)){
      const link=document.createElement('button');link.type='button';link.textContent=(row.querySelector('[data-link-label]').value || text('زر رابط','Link button'))+' ↗';
      link.onclick=()=>{select(0);row.querySelector('input').focus();};previewLinks.append(link);
    }
  };
  const fields=()=>[...inspector.querySelectorAll('input,textarea,select')].filter(field=>field.id && field.type!=='file');
  const snapshot=()=>({faq:root.editorFaqSnapshot?.(),form:root.editorFormSnapshot?.(),fields:Object.fromEntries(fields().map(field=>[field.id,field.multiple?[...field.selectedOptions].map(option=>option.value):field.type==='checkbox'?field.checked:field.value])),rows:Object.fromEntries([...linkSection.children].map(row=>[row.dataset.editorLinkRow,row.hidden])),order:[...linkSection.children].map(row=>row.dataset.editorLinkRow)});
  let history=[snapshot()],cursor=0,restoring=false;
  const syncHistoryButtons=()=>{tools.querySelector('[data-editor-undo]').disabled=cursor===0;tools.querySelector('[data-editor-redo]').disabled=cursor===history.length-1;};
  const changed=()=>{update();if(restoring)return;const next=snapshot();if(JSON.stringify(next)!==JSON.stringify(history[cursor])){history.splice(cursor+1);history.push(next);if(history.length>40)history.shift();cursor=history.length-1;}syncHistoryButtons();};
  const restore=step=>{const next=cursor+step;if(next<0 || next>=history.length)return;cursor=next;restoring=true;if(history[cursor].form)root.editorFormRestore?.(history[cursor].form);if(history[cursor].faq)root.editorFaqRestore?.(history[cursor].faq);for(const field of fields()){const value=history[cursor].fields[field.id];if(value===undefined)continue;if(field.multiple){for(const option of field.options)option.selected=value.includes(option.value);}else if(field.type==='checkbox')field.checked=value;else field.value=value;field.dispatchEvent(new root.ownerDocument.defaultView.Event('input',{bubbles:true}));} for(const id of history[cursor].order){const row=[...linkSection.children].find(row=>row.dataset.editorLinkRow===id);row.hidden=history[cursor].rows[id];linkSection.append(row);}restoring=false;update();syncHistoryButtons();};
  tools.querySelector('[data-editor-undo]').onclick=()=>restore(-1);tools.querySelector('[data-editor-redo]').onclick=()=>restore(1);
  body.addEventListener('input',changed); body.addEventListener('change',changed);syncHistoryButtons();
  const observer=new MutationObserver(update);
  if(scene)observer.observe(scene,{subtree:true,attributes:true,attributeFilter:['src','hidden']});
  const dialog=root.closest('dialog');
  const dispose=()=>{observer.disconnect();if(objectUrl)URL.revokeObjectURL(objectUrl);dialog.classList.remove('ai-editor-prototype');dialog.removeEventListener('close',dispose);root.editorDispose=null;};
  root.editorDispose=dispose;dialog.addEventListener('close',dispose,{once:true});
  enhanceEditorContent(root,english);
  select(0); update(); return true;
}
