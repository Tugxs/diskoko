// Presentation layer. Existing fields and review handlers remain authoritative.
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
  root.editorDispose=()=>root.closest('dialog').classList.remove('ai-editor-prototype');return true;
}
export function readEditorExtras(root) {
  const placement=root.querySelector('#moduleImagePlacement');
  if(!placement)return null;
  return {imagePlacement:placement.value,links:[...root.querySelectorAll('[data-editor-link-row]')].filter(row=>!row.hidden).map(row=>({label:row.querySelector('input[data-link-label]').value.trim(),url:row.querySelector('input[data-link-url]').value.trim()}))};
}
export function mountEditorPrototype(root, { english = false, markdown, botName = 'Diskoko', initial = {} } = {}) {
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
  const appearance = ordered[1];
  const text=(ar,en)=>english?en:ar;
  const tools=document.createElement('div');tools.className='editor-tools';
  tools.innerHTML=`<button type="button" data-editor-add-image>${text('+ صورة','+ Image')}</button><button type="button" data-editor-add-link>${text('+ زر رابط','+ Link button')}</button><button type="button" data-editor-undo>${text('تراجع','Undo')}</button><button type="button" data-editor-redo>${text('إعادة','Redo')}</button>`;
  layout.querySelector('.editor-stage header').append(tools);
  const position=document.createElement('label');position.textContent=text('موضع الصورة في Discord','Discord image placement');
  const positionInput=document.createElement('select');positionInput.id='moduleImagePlacement';
  positionInput.innerHTML=`<option value="image">${text('صورة كبيرة تحت النص','Large image below text')}</option><option value="thumbnail">${text('صورة صغيرة أعلى اليمين','Small image at top right')}</option>`;
  positionInput.value=initial.imagePlacement || 'image';position.append(positionInput);appearance.append(position);
  const linkSection=document.createElement('div');linkSection.className='editor-links';ordered[0].append(linkSection);
  for(let i=0;i<4;i++){
    const row=document.createElement('div');row.dataset.editorLinkRow=i;row.hidden=!initial.links?.[i];
    row.innerHTML=`<label>${text('اسم زر الرابط','Link button label')}<input data-link-label id="editorLinkLabel${i}" maxlength="80"></label><label>${text('رابط HTTPS','HTTPS URL')}<input data-link-url id="editorLinkUrl${i}" type="url" maxlength="512" dir="ltr"></label><button type="button" data-remove-link>${text('حذف الرابط','Remove link')}</button>`;
    row.querySelector('[data-link-label]').value=initial.links?.[i]?.label || '';row.querySelector('[data-link-url]').value=initial.links?.[i]?.url || '';
    row.querySelector('[data-remove-link]').onclick=()=>{row.hidden=true;row.querySelectorAll('input').forEach(field=>field.value='');row.dispatchEvent(new root.ownerDocument.defaultView.Event('input',{bubbles:true}));};linkSection.append(row);
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
    layout.querySelectorAll('.editor-title,.editor-description,.editor-button').forEach(node=>node.setAttribute('dir','auto'));
    layout.querySelector('.editor-bot').textContent=botName;
    layout.querySelector('.editor-title').textContent=get('moduleTitle').value;
    layout.querySelector('.editor-description').innerHTML=markdown(get('moduleDescription').value);
    const button=layout.querySelector('.editor-button'); button.textContent=get('moduleButton').value;
    button.style.background=['','#5865f2','#4e5058','#248046','#da373c'][Number(get('moduleButtonStyle').value)] || '#5865f2';
    layout.querySelector('.editor-card').style.borderInlineStartColor=get('moduleColor').value;
    const channel=get('moduleChannel');
    layout.querySelector('.editor-destination').textContent=channel.value ? `# ${channel.selectedOptions[0].textContent}` : (english?'Choose the destination under Function & destination':'اختر قناة النشر من قسم الوظيفة والقناة');
    const image=layout.querySelector('.editor-image'), file=get('moduleBanner').files[0];
    const composed=scene?.querySelector('[data-scene-preview]:not([hidden])');
    const saved=get('moduleBannerPreview')?.querySelector('img');
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl=undefined; }
    const src=composed?.src || (file && /^image\/(png|jpeg|webp|gif)$/.test(file.type) && file.size<=8*1024*1024 ? (objectUrl=URL.createObjectURL(file)) : saved?.src);
    image.hidden=!src; if(src)image.querySelector('img').src=src;
    const thumbnail=positionInput.value==='thumbnail';image.classList.toggle('editor-thumbnail',thumbnail);
    const card=layout.querySelector('.editor-card');if(thumbnail)card.prepend(image);else card.insertBefore(image,button);
    previewLinks.replaceChildren();
    for(const row of [...linkSection.children].filter(row=>!row.hidden)){
      const link=document.createElement('button');link.type='button';link.textContent=(row.querySelector('[data-link-label]').value || text('زر رابط','Link button'))+' ↗';
      link.onclick=()=>{select(0);row.querySelector('input').focus();};previewLinks.append(link);
    }
  };
  const fields=()=>[...inspector.querySelectorAll('input,textarea,select')].filter(field=>field.id && field.type!=='file');
  const snapshot=()=>({fields:Object.fromEntries(fields().map(field=>[field.id,field.type==='checkbox'?field.checked:field.value])),rows:[...linkSection.children].map(row=>row.hidden)});
  let history=[snapshot()],cursor=0,restoring=false;
  const syncHistoryButtons=()=>{tools.querySelector('[data-editor-undo]').disabled=cursor===0;tools.querySelector('[data-editor-redo]').disabled=cursor===history.length-1;};
  const changed=()=>{update();if(restoring)return;const next=snapshot();if(JSON.stringify(next)!==JSON.stringify(history[cursor])){history.splice(cursor+1);history.push(next);if(history.length>40)history.shift();cursor=history.length-1;}syncHistoryButtons();};
  const restore=step=>{const next=cursor+step;if(next<0 || next>=history.length)return;cursor=next;restoring=true;for(const field of fields()){const value=history[cursor].fields[field.id];if(value===undefined)continue;if(field.type==='checkbox')field.checked=value;else field.value=value;field.dispatchEvent(new root.ownerDocument.defaultView.Event('input',{bubbles:true}));} [...linkSection.children].forEach((row,i)=>row.hidden=history[cursor].rows[i]);restoring=false;update();syncHistoryButtons();};
  tools.querySelector('[data-editor-undo]').onclick=()=>restore(-1);tools.querySelector('[data-editor-redo]').onclick=()=>restore(1);
  body.addEventListener('input',changed); body.addEventListener('change',changed);syncHistoryButtons();
  const observer=new MutationObserver(update);
  if(scene)observer.observe(scene,{subtree:true,attributes:true,attributeFilter:['src','hidden']});
  const dialog=root.closest('dialog');
  const dispose=()=>{observer.disconnect();if(objectUrl)URL.revokeObjectURL(objectUrl);dialog.classList.remove('ai-editor-prototype');dialog.removeEventListener('close',dispose);root.editorDispose=null;};
  root.editorDispose=dispose;dialog.addEventListener('close',dispose,{once:true});
  select(0); update(); return true;
}
