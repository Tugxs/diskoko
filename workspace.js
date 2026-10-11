import {siteDate} from './site-format.js';
import { initializeAiLanguage } from './ai-ui-language.js';
import { normalizeDesignScene, renderDesignScene } from './ai-design-scene.js';
import { aiPromptLibrary, libraryModuleExtensions, libraryFeatures } from './ai-library-catalog.js';
import { mountEditorPrototype, readEditorExtras, mountPanelStudio } from './ai-editor-prototype.js';

const sceneReviewState=new WeakMap();
function bindDesignScene(plan,prefix,confirmId,launchId,requestId) {
  const input=document.getElementById(prefix); if (!input || sceneReviewState.has(input)) return;
  const scene=normalizeDesignScene(plan.designScene) || normalizeDesignScene({background:'#171923',layers:[{type:'text',text:plan.title || plan.question || 'Your design / تصميمك',x:10,y:20,width:80,height:50,fontSize:44,bold:true}]});
  const field=document.createElement('fieldset');field.className='ai-scene-review';
  field.innerHTML=`<legend>التصميم المرن / Flexible design</legend><label class="check-row"><input data-scene-enabled type="checkbox" ${plan.designScene?'checked':''}>صمّم صورة قابلة للتعديل / Compose an editable image</label><div data-scene-controls ${plan.designScene?'':'hidden'}><p data-scene-status role="status"></p><img data-scene-preview hidden style="width:100%;height:auto" alt="معاينة التصميم الفعلي / Actual design preview"><details><summary>تعديل عناصر التصميم / Edit design elements</summary><label>الخلفية / Background<input data-scene-background type="color" value="${scene.background}"></label><label class="check-row"><input data-scene-gradient type="checkbox" ${scene.gradient?'checked':''}>تدرج الخلفية / Gradient</label><div class="form-grid two"><label>لون التدرج / Gradient color<input data-scene-gradient-color type="color" value="${scene.gradient?.color || '#334466'}"></label><label>اتجاه التدرج / Gradient direction<select data-scene-gradient-direction>${['horizontal','vertical','diagonal'].map(value=>`<option ${scene.gradient?.direction===value?'selected':''}>${value}</option>`).join('')}</select></label></div><div data-scene-layers></div></details><div class="button-row"><button type="button" class="btn small secondary" data-scene-add="text">+ نص / Text</button><button type="button" class="btn small secondary" data-scene-add="image">+ صورة / Image</button><button type="button" class="btn small secondary" data-scene-add="box">+ شكل / Shape</button><button type="button" class="btn small secondary" data-scene-undo>تراجع / Undo</button><button type="button" class="btn small secondary" data-scene-redo>إعادة / Redo</button><button type="button" class="btn small secondary" data-scene-save>حفظ تصميم الصورة / Save image draft</button><button type="button" class="btn small primary" data-scene-render>تحديث المعاينة / Update preview</button></div><p class="form-note">الأزرار الفعلية خارج هذه الصورة. الصورة المرفوعة هنا نهائية وليست لقطة المرجع. / Functional buttons remain outside the image. Upload your final image here, not the reference screenshot.</p><a data-scene-download hidden download="diskoko-design.png">تنزيل التصميم / Download design</a></div>`;
  input.closest('label').before(field);
  if(plan.sceneInitiallyDisabled){field.querySelector('[data-scene-enabled]').checked=false;field.querySelector('[data-scene-controls]').hidden=true;}
  if(plan.publishedDesign)field.querySelector('[data-scene-save]').hidden=true;
  const state={field,scene,enabled:()=>field.querySelector('[data-scene-enabled]').checked};sceneReviewState.set(input,state);
  let revision=0,savedRevision=Number(plan.designRevision || 0);
  const snapshots=[...(plan.sceneVersions || []).slice(-5).map(normalizeDesignScene).filter(Boolean),JSON.parse(JSON.stringify(scene))];let historyPosition=snapshots.length-1;
  const reset=()=>{if(JSON.stringify(scene)!==JSON.stringify(snapshots[historyPosition])){snapshots.splice(historyPosition+1);snapshots.push(JSON.parse(JSON.stringify(scene)));if(snapshots.length>20)snapshots.shift();historyPosition=snapshots.length-1;}revision++;const confirm=document.getElementById(confirmId),launch=document.getElementById(launchId);if(confirm)confirm.checked=false;if(launch)launch.disabled=true;};
  const renderLayers=()=>{
    field.querySelector('[data-scene-layers]').innerHTML=scene.layers.map((layer,index)=>`<details><summary>${index+1}. ${layer.type}</summary>${layer.type==='text'?`<label>النص / Text<textarea data-layer="${index}" data-property="text" maxlength="500" dir="auto">${esc(layer.text)}</textarea></label>`:''}<div class="form-grid two">${['x','y','width','height',...(layer.type==='text'?['fontSize']:['strokeWidth',...(layer.type==='image'?['focusX','focusY']:[])]),'opacity'].map(key=>`<label>${({x:'أفقي / X',y:'رأسي / Y',width:'عرض / Width',height:'ارتفاع / Height',fontSize:'حجم الخط / Font size',strokeWidth:'حجم الإطار / Border width',focusX:'موضع القص الأفقي / Crop focus X',focusY:'موضع القص الرأسي / Crop focus Y',opacity:'شفافية / Opacity'})[key]}<input type="number" data-layer="${index}" data-property="${key}" min="${key==='fontSize'?14:key==='width'||key==='height'?1:0}" max="${key==='fontSize'?96:key==='opacity'?1:key==='strokeWidth'?20:100}" step="${key==='opacity'?'0.1':'1'}" value="${layer[key]}"></label>`).join('')}<label>اللون / Color<input type="color" data-layer="${index}" data-property="color" value="${layer.color}"></label><label>لون الإطار / Border color<input type="color" data-layer="${index}" data-property="strokeColor" value="${layer.strokeColor}"></label>${layer.type==='text'?`<label>الخط / Font<select data-layer="${index}" data-property="fontFamily">${['Arial','Tahoma','Verdana'].map(value=>`<option ${layer.fontFamily===value?'selected':''}>${value}</option>`).join('')}</select></label><label class="check-row"><input type="checkbox" data-layer="${index}" data-property="bold" ${layer.bold?'checked':''}>عريض / Bold</label><label>المحاذاة / Align<select data-layer="${index}" data-property="align">${['left','center','right'].map(value=>`<option ${layer.align===value?'selected':''}>${value}</option>`).join('')}</select></label>`:`${layer.type==='image'?`<label>ملاءمة الصورة / Image fit<select data-layer="${index}" data-property="fit"><option value="cover" ${layer.fit==='cover'?'selected':''}>ملء مع قص / Cover</option><option value="contain" ${layer.fit==='contain'?'selected':''}>الصورة كاملة / Contain</option></select></label>`:''}<label>الشكل / Shape<select data-layer="${index}" data-property="shape">${['circle','square','rounded'].map(value=>`<option ${layer.shape===value?'selected':''}>${value}</option>`).join('')}</select></label>`}</div><button type="button" class="btn small secondary" data-layer-up="${index}">↑</button><button type="button" class="btn small secondary" data-layer-down="${index}">↓</button><button type="button" class="btn small secondary" data-layer-remove="${index}">حذف / Remove</button></details>`).join('');
    field.querySelectorAll('[data-property]').forEach(control=>control.oninput=()=>{scene.layers[Number(control.dataset.layer)][control.dataset.property]=control.type==='number'?Number(control.value):control.type==='checkbox'?control.checked:control.value;reset();});
    field.querySelectorAll('[data-layer-remove],[data-layer-up],[data-layer-down]').forEach(button=>button.onclick=()=>{const index=Number(button.dataset.layerRemove ?? button.dataset.layerUp ?? button.dataset.layerDown);if(button.dataset.layerRemove!==undefined)scene.layers.splice(index,1);else {const other=button.dataset.layerUp!==undefined?index-1:index+1;if(other>=0&&other<scene.layers.length)[scene.layers[index],scene.layers[other]]=[scene.layers[other],scene.layers[index]];}reset();renderLayers();});
  };
  const generate=async()=>{
    reset(); const current=revision,status=field.querySelector('[data-scene-status]');status.textContent='جارٍ تجهيز التصميم / Rendering…';
    try {const image=await renderDesignScene(scene,input.files[0]);if(current!==revision || !field.isConnected)return;const preview=field.querySelector('[data-scene-preview]');preview.src=`data:${image.mime};base64,${image.base64}`;preview.hidden=false;const download=field.querySelector('[data-scene-download]');download.href=preview.src;download.download=`diskoko-design.${({'image/png':'png','image/webp':'webp','image/jpeg':'jpg'})[image.mime]}`;download.hidden=false;status.textContent='معاينة الصورة التي ستُرسل / Preview of the image to publish';}
    catch(error){if(current===revision){field.querySelector('[data-scene-preview]').hidden=true;status.textContent=error.message;}}
  };
  field.querySelector('[data-scene-render]').onclick=generate;
  const syncNativeStyle=()=>{const style=document.getElementById(`${prefix}Style`);if(style){style.disabled=state.enabled();if(state.enabled())style.value='normal';}};
  field.querySelector('[data-scene-enabled]').onchange=()=>{field.querySelector('[data-scene-controls]').hidden=!state.enabled();syncNativeStyle();reset();};
  syncNativeStyle();
  field.querySelector('[data-scene-background]').oninput=event=>{scene.background=event.target.value;reset();};
  field.querySelectorAll('[data-scene-gradient],[data-scene-gradient-color],[data-scene-gradient-direction]').forEach(control=>control.oninput=()=>{if(field.querySelector('[data-scene-gradient]').checked)scene.gradient={color:field.querySelector('[data-scene-gradient-color]').value,direction:field.querySelector('[data-scene-gradient-direction]').value};else delete scene.gradient;reset();});
  field.querySelectorAll('[data-scene-add]').forEach(button=>button.onclick=()=>{if(scene.layers.length>=12)return;scene.layers.push(normalizeDesignScene({layers:[{type:button.dataset.sceneAdd,text:'Text / نص',x:10,y:10,width:30,height:50,fontSize:36,color:'#ffffff'}]}).layers[0]);reset();renderLayers();});
  field.querySelector('[data-scene-undo]').onclick=()=>{if(historyPosition>0){Object.assign(scene,JSON.parse(JSON.stringify(snapshots[--historyPosition])));field.querySelector('[data-scene-background]').value=scene.background;reset();renderLayers();void generate();}};
  field.querySelector('[data-scene-redo]').onclick=()=>{if(historyPosition<snapshots.length-1){Object.assign(scene,JSON.parse(JSON.stringify(snapshots[++historyPosition])));field.querySelector('[data-scene-background]').value=scene.background;reset();renderLayers();void generate();}};
  field.querySelector('[data-scene-save]').onclick=async()=>{const status=field.querySelector('[data-scene-status]');try{if(!requestId)throw Error('Draft unavailable');const result=await api(`/api/ai/requests/${encodeURIComponent(requestId)}/save-design`,{method:'POST',body:JSON.stringify({revision:savedRevision,designScene:normalizeDesignScene(scene)})});savedRevision=result.revision;if(result.draftVersion){aiDraftVersions.set(requestId,result.draftVersion);aiReviewVersions.set(requestId,result.draftVersion);}status.textContent='حُفظ تصميم الصورة دون نشر / Image draft saved without publishing';}catch(error){status.textContent=error.message;}};
  const root=input.closest('#dialogContent');if(root){root.editorSceneSnapshot=()=>({scene:JSON.parse(JSON.stringify(scene)),enabled:state.enabled()});root.editorSceneRestore=value=>{const checked=normalizeDesignScene(value.scene);if(!checked)return;Object.assign(scene,checked);field.querySelector('[data-scene-enabled]').checked=value.enabled;field.querySelector('[data-scene-controls]').hidden=!value.enabled;field.querySelector('[data-scene-background]').value=scene.background;syncNativeStyle();reset();renderLayers();void generate();};}
  input.addEventListener('change',reset);renderLayers();if(plan.designScene && !plan.sceneInitiallyDisabled)void generate();
}
function sceneEnabled(prefix) { const input=document.getElementById(prefix);return input && sceneReviewState.get(input)?.enabled(); }

function panelReviewFields(plan, functional = true) {
  return `<p class="notice info">صور المحادثة مرجع للتصميم. الصور التي ترفعها داخل هذه المراجعة هي الصور النهائية للنشر. الأزرار تستخدم أنماط Discord الثابتة ووظيفة النظام الحقيقي.</p>${functional ? `${plan.kind === 'event' ? '' : `<label>مسمى زر النظام<input id="aiPanelButtonLabel" maxlength="80" value="${esc(plan.buttonLabel || (plan.kind === 'tickets' ? 'فتح تذكرة دعم' : plan.kind === 'giveaway' ? '🎉 شارك في الجيف آواي' : 'سجّل مشاركتك'))}"></label>`}<label>نمط زر Discord<select id="aiPanelButtonStyle"><option value="1">أساسي</option><option value="2">ثانوي</option><option value="3">نجاح</option><option value="4">خطر</option></select></label>` : ''}<fieldset><legend>روابط إضافية اختيارية (HTTPS)</legend>${Array.from({ length: 4 }, (_,i) => `<div class="form-grid two"><label>اسم الرابط ${i+1}<input data-panel-link-label="${i}" maxlength="80" value="${esc(plan.links?.[i]?.label || '')}"></label><label>الرابط ${i+1}<input data-panel-link-url="${i}" type="url" maxlength="512" value="${esc(plan.links?.[i]?.url || '')}"></label></div>`).join('')}</fieldset>`;
}
function readPanelReview() {
  const labels=[...document.querySelectorAll('[data-panel-link-label]')];
  const links=labels.map((input,i)=>({label:input.value.trim(),url:document.querySelector(`[data-panel-link-url="${i}"]`).value.trim()})).filter(link=>link.label || link.url);
  if (links.some(link=>!link.label || !/^https:\/\//i.test(link.url))) throw Error('أكمل اسم كل رابط واستخدم HTTPS.');
  const activeScene=[...document.querySelectorAll('input[type=file]')].map(input=>sceneReviewState.get(input)).find(entry=>entry?.enabled());
  return { ...(activeScene?{designScene:normalizeDesignScene(activeScene.scene)}:{}), links, ...(($('#aiPanelButtonLabel') || $('#aiEventButton')) ? {buttonLabel:($('#aiPanelButtonLabel') || $('#aiEventButton')).value,buttonStyle:Number($('#aiPanelButtonStyle').value)} : {}) };
}
function bindPanelReview(plan, previewButton, confirmId, launchId, requestId) {
  for (const prefix of ['aiMessageImage','aiSpecialImage','aiInteractiveImage']) if (document.getElementById(prefix)) bindDesignScene(plan,prefix,confirmId,launchId,requestId);
  for (const id of ['aiMessageImageStyle','aiSpecialImageStyle','aiInteractiveImageStyle']) { const control=document.getElementById(id); if (control && !sceneEnabled(id.replace(/Style$/,'')) && ['circle','square','rounded'].includes(plan.imageShape)) control.value=plan.imageShape; }
  if ($('#aiPanelButtonStyle')) $('#aiPanelButtonStyle').value=String(plan.buttonStyle || 1);
  const preview=document.createElement('div'); preview.className='ai-panel-link-preview';
  const button=document.querySelector(previewButton); (button || $('.ai-discord-preview')).after(preview);
  const update=()=>{
    if (($('#aiPanelButtonLabel') || $('#aiEventButton')) && button) { button.textContent=($('#aiPanelButtonLabel') || $('#aiEventButton')).value; button.style.background=['','#5865f2','#4e5058','#248046','#da373c'][Number($('#aiPanelButtonStyle').value)]; }
    preview.innerHTML=[...document.querySelectorAll('[data-panel-link-label]')].filter(input=>input.value.trim()).map(input=>`<span class="ai-discord-button" style="background:#4e5058">${esc(input.value.trim())} ↗</span>`).join('');
  };
  $('#dialogContent').oninput=event=>{
    if (event.target.id===confirmId) return;
    if (!$('#'+confirmId) || !$('#'+launchId)) return;
    $('#'+confirmId).checked=false; $('#'+launchId).disabled=true; update();
  };
  $('#dialogContent').onchange=event=>{
    if (event.target.id===confirmId) return;
    if (!$('#'+confirmId) || !$('#'+launchId)) return;
    $('#'+confirmId).checked=false; $('#'+launchId).disabled=true; update();
  };
  update();
}
async function loadPublishedDesignImage(item, anchor, refresh) {
  if (!item.editExisting) return;
  const dialogContent = $('#dialogContent'); dialogContent.dataset.aiReviewRequest = item.id;
  try {
    const current = await api('/api/ai/requests/'+encodeURIComponent(item.id)+'/published-preview');
    if (!$('#dialog').open || dialogContent.dataset.aiReviewRequest !== item.id) return;
    item.currentDesignImages=current.images || [];
    if (refresh) refresh();
    else if (current.images?.[0]?.url && !$('.ai-discord-banner')) {
      const target=document.querySelector(anchor); if(!target)return;
      const image=document.createElement('img'); image.className='ai-discord-banner'; image.src=current.images[0].url; image.alt='الصورة الحالية المعتمدة للوحة';
      if(current.imagePosition==='below')target.after(image);else target.before(image);
    }
  } catch(error) { toast(error.message); }
}
const READY_MODULE_TYPES = {
  ...Object.fromEntries(libraryModuleExtensions.map(item=>[item.moduleKind,{icon:item.icon,label:item.title,form:true}])),
  interests: { icon: '🎯', label: 'اختيار الاهتمامات', role: true }, suggestions: { icon: '💡', label: 'لوحة الاقتراحات', form: true },
  reports: { icon: '🚨', label: 'البلاغات الخاصة', form: true }, events: { icon: '🗓️', label: 'التسجيل في الفعاليات' },
  applications: { icon: '📝', label: 'طلبات الانضمام', form: true }, faq: { icon: '❔', label: 'الأسئلة السريعة', answer: true },
  submissions: { icon: '🎬', label: 'استقبال المشاركات', form: true }, orders: { icon: '🛒', label: 'طلبات المتجر', form: true },
  learning: { icon: '🎓', label: 'متابعة التعلّم', form: true }, tasks: { icon: '📌', label: 'مهام فريق الإدارة', form: true, staffOnly: true },
};
const READY_MODULE_FIELDS = {
  ...Object.fromEntries(libraryModuleExtensions.map(item=>[item.moduleKind,[item.subject,item.details,item.prompt]])),
  suggestions: ['عنوان الاقتراح', 'الاقتراح وسبب فائدته', 'بعد موافقة الفريق يُنشر الاقتراح مع زر تصويت.'],
  reports: ['موضوع البلاغ', 'ما حدث وأين حدث؟', 'البلاغ خاص ويظهر لفريق المراجعة فقط.'],
  applications: ['الدور الذي تتقدم له', 'خبرتك ولماذا ترغب في الانضمام', 'يقبل الفريق الطلب أو يرفضه داخل قناة خاصة.'],
  submissions: ['عنوان المشاركة', 'وصف المشاركة ورابط العمل', 'ينشر الفريق المشاركات المقبولة فقط.'],
  orders: ['المنتج أو الخدمة المطلوبة', 'الكمية والمتطلبات وطريقة التواصل', 'يتابع الفريق الطلب حتى اكتماله؛ الدفع خارج هذه الميزة.'],
  learning: ['الدرس أو المهمة التعليمية', 'ما أُنجز وما يحتاج مساعدة', 'يراجع المرشد التقدم ويحدد اكتماله.'],
  tasks: ['عنوان مهمة الفريق', 'المطلوب والمسؤول والموعد', 'تُعرض المهمة للفريق فقط ويمكن تحديد اكتمالها.'],
};
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function discordMarkdownPreview(value) {
  return esc(value).split('\n').map(line => {
    let rendered = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<u>$1</u>').replace(/~~(.+?)~~/g, '<s>$1</s>')
      .replace(/\|\|(.+?)\|\|/g, '<span class="ai-preview-spoiler">$1</span>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g, '<u>$1</u>');
    if (/^#{1,3} /.test(rendered)) rendered = `<strong class="ai-preview-heading">${rendered.replace(/^#{1,3} /, '')}</strong>`;
    if (/^&gt; /.test(rendered)) rendered = `<span class="ai-preview-quote">${rendered.slice(5)}</span>`;
    return renderGuildEmojiMarkup(rendered);
  }).join('<br>');
}
const basicEmojiGroups = {
  'وجوه': '😀 😃 😄 😁 😆 😅 😂 🤣 😊 🙂 🙃 😉 😍 🥰 😘 😎 🤩 🥳 😢 😭 😡 🤔 🤗 😴 🤯 🥺 😇 😋 😏 😬 🫡',
  'أشخاص': '👋 🤚 ✋ 🖐️ 👍 👎 👌 ✌️ 🤞 🤟 🤘 👏 🙌 🫶 🤝 💪 🙏 👀 👤 🧑 👩 👨 👶 👑',
  'احتفال': '🎉 🎊 🎁 🎂 🎈 🎆 🎇 ✨ 🎮 🎯 🏆 🥇 🥈 🥉 🎟️ 🎫 🎵 🎶 🎤 🎧 🎬 📸',
  'قلوب': '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💕 💞 💖 💗 💓 💘 💝 💔 ❤️‍🔥',
  'رموز': '✅ ❌ ❗ ❓ ⚠️ 💯 🔥 ⭐ 🌟 💡 📌 📢 🔔 🔕 🔒 🔓 🛡️ ⚙️ 📅 ⏰ ⏳ ➕ ➖ ➡️ ⬅️ ⬆️ ⬇️',
  'طبيعة': '🌸 🌹 🌻 🌷 🍀 🌿 🌈 ☀️ 🌙 🌍 🌊 ❄️ ☁️ ⚡ 🐱 🐶 🦊 🦁 🐼 🐸 🐧 🦋',
  'طعام': '🍎 🍓 🍉 🍋 🍕 🍔 🍟 🌮 🍣 🍰 🍪 🍫 🍿 ☕ 🧃 🥤',
};
function renderGuildEmojiMarkup(value) {
  const known = new Set((state.data?.emojis || []).map(emoji => String(emoji.id)));
  return value.replace(/&lt;(a?):([A-Za-z0-9_]{2,32}):(\d{15,22})&gt;/g, (match, animated, name, id) => known.has(id) ? `<img class="ai-emoji-inline" src="https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'webp'}?size=48" alt=":${name}:" title=":${name}:">` : match);
}
const emojiPreviewText = value => renderGuildEmojiMarkup(esc(value));
function installAiEmojiPickers() {
  if (screen() !== 'assistant') return;
  const body = $('#dialogContent .dialog-body');
  const existing = body.querySelector('.ai-emoji-picker');
  if (existing?.emojiBind) { existing.emojiBind(); return; }
  const fields = [...body.querySelectorAll('input:not([type]),input[type="text"],input[type="url"],textarea')].filter(field => !field.disabled && !field.readOnly && field.closest('label'));
  if (!fields.length) return;
  const picker = document.createElement('div'); picker.className = 'ai-emoji-picker'; picker.hidden = true;
  picker.innerHTML = '<div class="ai-emoji-picker-head"><b>اختر إيموجي</b><button type="button" class="btn small secondary" data-emoji-close>إغلاق</button></div><div class="ai-emoji-tabs"><button type="button" data-emoji-tab="basic" class="active">إيموجيات Discord</button><button type="button" data-emoji-tab="server">إيموجيات السيرفر</button></div><label class="ai-emoji-search">بحث<input type="search" placeholder="ابحث عن إيموجي السيرفر"></label><div class="ai-emoji-results"></div>';
  body.append(picker);
  let target = null, start = 0, end = 0, tab = 'basic';
  const search = picker.querySelector('input[type="search"]'), results = picker.querySelector('.ai-emoji-results');
  const render = () => {
    const query = search.value.trim().toLocaleLowerCase('ar');
    if (tab === 'server') {
      const emojis = (state.data?.emojis || []).filter(emoji => !query || emoji.name.toLocaleLowerCase().includes(query));
      results.innerHTML = emojis.length ? `<div class="ai-emoji-grid">${emojis.map(emoji => `<button type="button" data-emoji-value="${esc(`<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`)}" title=":${esc(emoji.name)}:"><img src="https://cdn.discordapp.com/emojis/${esc(emoji.id)}.${emoji.animated ? 'gif' : 'webp'}?size=48" alt=":${esc(emoji.name)}:"></button>`).join('')}</div>` : '<p class="form-note">لا توجد إيموجيات متاحة لهذا السيرفر أو لا تطابق البحث.</p>';
    } else results.innerHTML = Object.entries(basicEmojiGroups).filter(([name]) => !query || name.includes(query)).map(([name, values]) => `<b class="ai-emoji-group">${name}</b><div class="ai-emoji-grid">${values.split(' ').map(value => `<button type="button" data-emoji-value="${esc(value)}" title="${esc(name)}">${value}</button>`).join('')}</div>`).join('') || '<p class="form-note">لا توجد نتائج. اختر تصنيفًا أو امسح البحث.</p>';
  };
  const bindFields = () => [...body.querySelectorAll('input:not([type]),input[type="text"],input[type="url"],textarea')].filter(field => !field.disabled && !field.readOnly && field.closest('label') && !field.nextElementSibling?.classList.contains('ai-emoji-trigger')).forEach(field => {
    const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'ai-emoji-trigger'; trigger.textContent = '😀'; trigger.title = 'أضف إيموجي عند المؤشر'; trigger.setAttribute('aria-label', `إيموجي: ${field.closest('label').textContent.trim()}`);
    field.after(trigger);
    trigger.onclick = event => { event.preventDefault(); target = field; start = field.selectionStart ?? field.value.length; end = field.selectionEnd ?? start; picker.hidden = false; render(); };
  });
  picker.emojiBind = bindFields;
  bindFields();
  picker.querySelector('[data-emoji-close]').onclick = () => { picker.hidden = true; target?.focus(); };
  picker.querySelectorAll('[data-emoji-tab]').forEach(button => button.onclick = () => { tab = button.dataset.emojiTab; picker.querySelectorAll('[data-emoji-tab]').forEach(item => item.classList.toggle('active', item === button)); search.value = ''; render(); });
  search.oninput = render;
  results.onclick = event => {
    const button = event.target.closest('[data-emoji-value]'); if (!button || !target) return;
    const emoji = button.dataset.emojiValue, next = target.value.slice(0, start) + emoji + target.value.slice(end);
    if (target.maxLength > 0 && next.length > target.maxLength) { toast('هذا الحقل وصل إلى الحد الأقصى من الأحرف.'); return; }
    target.setRangeText(emoji, start, end, 'end'); target.dispatchEvent(new Event('input', { bubbles: true })); target.focus();
    start = end = target.selectionStart; picker.hidden = true;
  };
}
const fmt = value => new Intl.NumberFormat(document.documentElement.lang==='en'?'en-US':'ar-SA').format(value ?? 0);
const date = value => value ? siteDate(new Date(value), "toLocaleString", { dateStyle: 'medium', timeStyle: 'short' }) : 'لم يتم بعد';
const state = { account: null, guild: new URLSearchParams(location.search).get('guild'), data: null, loading: true, error: null, tab: 'channels', channelFilter: 'permanent', draft: [], templates: null, readyCatalog: null, readyRuns: [], readyDraft: null, readyDraftCache: {}, readyKey: null, readyMode: 'add', readyStep: 'structure', readyFilter: 'all', readySearch: '', epoch: 0, days: 7 };
function temporaryTicketChannel(channel) { return /^(?:تذكرة|ticket)[-・_]/i.test(String(channel.name || '')); }
const sections = [ ['overview', '⌂', 'نظرة عامة'], ['alerts', '⚠', 'التنبيهات'], ['builder', '▤', 'القنوات والرتب'], ['ready-templates', '▣', 'قوالب جاهزة'], ['bots', '◈', 'اللوحات التفاعلية'], ['commands', '⌘', 'الأوامر'], ['assistant', '✦', 'AI ديسكوكو'], ['automation', '◷', 'الرسائل المجدولة'], ['analytics', '⌁', 'النشاط والتحليلات'], ['safety', '◇', 'الأمان والصلاحيات'], ['activity', '≡', 'سجل التغييرات'], ['settings', '⚙', 'إعدادات السيرفر'] ];
const aliases = { dashboard: 'overview', 'bot-settings': 'commands', 'custom-bot': 'bots', 'server-detail': 'builder', preview: 'builder', 'custom-template': 'builder', newserver: 'builder' };
function screen() { const hash = location.hash.slice(1); return aliases[hash] || (sections.some(([key]) => key === hash) || hash === 'servers' ? hash : 'overview'); }
let csrfPromise;
const aiDraftVersions=new Map(),aiReviewVersions=new Map();
async function api(url, options = {}) {
  const method = options.method || 'GET';
  if(method==='POST' && options.body){const payload=JSON.parse(options.body);const id=url.match(/^\/api\/ai\/requests\/([^/]+)\//)?.[1] || payload.sourceRequestId;if(id && aiReviewVersions.has(id))options={...options,body:JSON.stringify({...payload,draftVersion:aiReviewVersions.get(id)})};}
  const headers = { 'Content-Type': 'application/json' };
  if (method !== 'GET') {
    csrfPromise ||= fetch('/api/csrf-token', { credentials: 'include', cache: 'no-store' }).then(async response => { if (!response.ok) throw Error('تعذر التحقق من الجلسة.'); return (await response.json()).token; }).catch(error => { csrfPromise = null; throw error; });
    headers['X-CSRF-Token'] = await csrfPromise;
  }
  const response = await fetch(url, { ...options, method, headers, credentials: 'include', cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || 'تعذر إكمال الطلب. أعد المحاولة.'), { status: response.status, inviteUrl: body.inviteUrl });
  return body;
}
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { $('#toast').hidden = true; }, 5000); }
function run(fn) { return async event => { try { await fn(event); } catch (error) { toast(error.message); } }; }
function badge(text, tone = 'neutral') { return `<span class="badge ${tone}">${esc(text)}</span>`; }
const statuses = { installed: ['متصل بالسيرفر', 'good'], install_required: ['يحتاج ربطًا', 'warn'], permissions_insufficient: ['تحقق من الصلاحيات', 'warn'], unavailable: ['تعذر التحقق', 'bad'], draft: ['بانتظار المراجعة', 'purple'], pending: ['لم يُنفذ', 'neutral'], running: ['جارٍ التنفيذ', 'warn'], cancel_requested: ['جارٍ الإيقاف', 'warn'], succeeded: ['مكتمل', 'good'], failed: ['يحتاج مراجعة', 'bad'], scheduled: ['مجدولة', 'purple'], sending: ['جارٍ الإرسال', 'warn'], sent: ['تم الإرسال', 'good'], cancelled: ['أُوقف', 'neutral'] };
function status(value) { return badge(...(statuses[value] || ['لم يتم التحقق', 'neutral'])); }
function action(label, target, style = 'secondary') { return `<a class="btn ${style}" href="${url(target)}">${label}</a>`; }
function url(target, guild = state.guild) { return `/studio${guild ? `?guild=${encodeURIComponent(guild)}` : ''}#${target}`; }
function head(title, description, controls = '') { return `<div class="page-head"><div><span class="eyebrow" data-i18n-preserve>${esc(state.data?.guild.name || 'مساحة مجتمعك')}</span><h1>${title}</h1><p>${description}</p></div>${controls}</div>`; }
function metric(label, value, detail, icon) { return `<article class="metric"><div class="metric-top"><span>${label}</span><span class="metric-icon">${icon}</span></div><b>${value === null || value === undefined ? '—' : fmt(value)}</b><small>${detail}</small></article>`; }
function empty(title, description, control = '') { return `<div class="empty"><div class="empty-symbol">◇</div><h3>${title}</h3><p>${description}</p>${control}</div>`; }
function panel(title, body, control = '') { return `<section class="panel"><div class="panel-head"><h3>${title}</h3>${control}</div>${body}</section>`; }
function draftKey() { return `diskoko:review:${state.account?.user.id}:${state.guild}`; }
function readDraft() { try { const value = JSON.parse(localStorage.getItem(draftKey()) || '[]'); state.draft = Array.isArray(value) ? value.slice(0, 100) : []; } catch { state.draft = []; } }
function saveDraft() { try { localStorage.setItem(draftKey(), JSON.stringify(state.draft)); } catch { toast('تعذر حفظ قائمة التغييرات على هذا الجهاز. احتفظ بالصفحة مفتوحة.'); } draftBar(); }
function draftChangeUnits(op) {
  if (op.action !== 'update') return 1;
  const original = (op.resource_type === 'role' ? state.data?.roles : state.data?.channels)?.find(item => item.id === op.resource_id);
  if (!original) return 1;
  let units = 0;
  const defaults = { hoist: false, mentionable: false, rate_limit_per_user: 0, default_thread_rate_limit_per_user: 0, default_auto_archive_duration: 1440, bitrate: 64000, user_limit: 0, rtc_region: null, nsfw: false, video_quality_mode: 1, default_sort_order: 0, default_forum_layout: 0, available_tags: [] };
  const colors = value => JSON.stringify(['primary_color','secondary_color','tertiary_color'].map(field => value?.[field] ?? null));
  for (const key of ['name','parent_id','topic','position','color','colors','hoist','mentionable','rate_limit_per_user','default_thread_rate_limit_per_user','default_auto_archive_duration','bitrate','user_limit','rtc_region','nsfw','video_quality_mode','default_sort_order','default_forum_layout','available_tags']) if (Object.hasOwn(op,key) && (key === 'position' && op.position_changed || (key === 'colors' ? colors(op[key]) !== colors(original.colors || { primary_color: original.color || 0 }) : key === 'available_tags' ? JSON.stringify(op[key]) !== JSON.stringify(original[key] || []) : String(op[key] ?? '') !== String(original[key] ?? defaults[key] ?? '')))) units++;
  if (Object.hasOwn(op,'icon') || Object.hasOwn(op,'unicode_emoji')) {
    const oldIcon = original.icon || original.unicode_emoji || null;
    const newIcon = op.icon || op.unicode_emoji || null;
    if (oldIcon !== newIcon) units++;
  }
  if (Object.hasOwn(op,'permissions')) { let bits = BigInt(op.permissions) ^ BigInt(original.permissions || '0'); while (bits) { bits &= bits - 1n; units++; } }
  if (Object.hasOwn(op,'permission_overwrites')) {
    const before = new Map((original.permission_overwrites || []).map(row => [String(row.id),row]));
    const after = new Map(op.permission_overwrites.map(row => [String(row.id),row]));
    for (const id of new Set([...before.keys(),...after.keys()])) {
      const old = before.get(id), next = after.get(id);
      let bits = BigInt(old?.allow || '0') | BigInt(old?.deny || '0') | BigInt(next?.allow || '0') | BigInt(next?.deny || '0');
      for (let bit = 1n; bits; bit <<= 1n) if (bits & bit) { const value = row => (BigInt(row?.allow || '0') & bit) ? 'allow' : (BigInt(row?.deny || '0') & bit) ? 'deny' : 'inherit'; if (value(old) !== value(next)) units++; bits &= ~bit; }
    }
  }
  return units;
}
function visibleChannelPosition(position) { return Number(position ?? 0) + 1; }
function channelOrder(item, channels = state.data?.channels || []) {
  if (!item?.id) return 1;
  const siblings = channels.filter(channel => item.type === 4 ? channel.type === 4 : channel.type !== 4 && (channel.parent_id || null) === (item.parent_id || null));
  return siblings.sort((a, b) => Number(a.position || 0) - Number(b.position || 0)).findIndex(channel => channel.id === item.id) + 1;
}
function draftBar() {
  const node = $('#draftBar'); node.hidden = screen() === 'builder' || !state.draft.length || !state.data || state.loading;
  const resume = $('#resumeBuilderDraft'); if (resume) resume.hidden = !state.draft.length;
  node.innerHTML = `<div><b>عدد التغييرات المتوقع: ${fmt(state.draft.reduce((total, op) => total + draftChangeUnits(op), 0))}</b><small>${fmt(state.draft.length)} عناصر · تُحسب الإعدادات التي تغيّرت فقط عند التنفيذ · ${esc(state.data?.guild.name)}</small></div><div class="actions"><button class="btn secondary" id="discardDraft">تجاهل التغييرات</button><button class="btn primary" id="reviewDraft">مراجعة وتطبيق التغييرات ←</button></div>`;
  $('#reviewDraft').onclick = () => reviewLocal();
  $('#discardDraft').onclick = () => confirmDialog('تجاهل التغييرات؟', 'ستُزال قائمة التغييرات من هذا الجهاز. لن يتغير سيرفرك في Discord.', 'تجاهل التغييرات', () => { state.draft = []; saveDraft(); closeDialog(); render(); });
}
function modal(title, body, footer = '') {
  $('#dialogContent').editorStorageDispose?.();
  $('#dialogContent').editorFormSnapshot=null;
  $('#dialogContent').editorFormRestore=null;
  $('#dialogContent').editorFaqSnapshot=null;
  $('#dialogContent').editorFaqRestore=null;
  $('#dialogContent').editorSceneSnapshot=null;
  $('#dialogContent').editorSceneRestore=null;
  $('#dialogContent').editorDispose?.();
  $('#dialog').classList.remove('ai-editor-prototype');
  const dialog = $('#dialog'); $('#dialogContent').dataset.editorScope=state.account?.user.id && state.guild?JSON.stringify([state.account.user.id,state.guild,state.aiEditorBotScope || 'diskoko',title]):''; $('#dialogContent').innerHTML = `<div class="dialog-head"><h2 id="dialogTitle">${title}</h2><button class="icon-btn" id="closeDialog" aria-label="إغلاق">×</button></div><div class="dialog-body"><div class="dialog-error" id="dialogError" role="alert" hidden></div>${body}</div>${footer ? `<div class="dialog-foot">${footer}</div>` : ''}`;
  $('#dialogContent').querySelectorAll('.ai-discord-bot-name').forEach(node => { node.innerHTML = `◈ ${esc(state.aiBotName || 'ديسكوكو')} <small>BOT</small>`; });
  if (state.aiBotName) $('#dialogContent').querySelectorAll('.form-note').forEach(node => { node.textContent = node.textContent.replace('بواسطة بوت ديسكوكو', `بواسطة بوت ${state.aiBotName}`); });
  $('#closeDialog').onclick = closeDialog;
  installAiEmojiPickers();
  if (!dialog.open) dialog.showModal();
  const content=$('#dialogContent'),generation=Symbol();content.editorGeneration=generation;
  queueMicrotask(()=>{if(content.editorGeneration===generation && dialog.open)mountPanelStudio(content);});
}
function closeDialog() { $('#dialog').querySelectorAll('input[type="password"]').forEach(input => { input.value = ''; }); $('#dialog').close(); }
function modalError(error) { $('#dialogError').hidden = false; $('#dialogError').textContent = error.message; }
function confirmDialog(title, description, label, callback) { modal(title, `<p>${esc(description)}</p>`, `<button class="btn secondary" id="cancelConfirm">إلغاء</button><button class="btn primary" id="confirmAction">${label}</button>`); $('#cancelConfirm').onclick = closeDialog; $('#confirmAction').onclick = async event => { event.currentTarget.disabled = true; try { await callback(); } catch (error) { modalError(error); $('#confirmAction').disabled = false; } }; }
function shell() {
  $('#navigation').innerHTML = `<div class="nav-label">إدارة مجتمعك</div>${sections.map(([key, icon, label]) => `<a class="nav-link ${screen() === key ? 'active' : ''}" href="${url(key)}" ${screen() === key ? 'aria-current="page"' : ''}><span class="nav-icon" aria-hidden="true">${icon}</span>${label}${key === 'alerts' && state.data?.alerts?.length ? `<span class="badge bad">${fmt(state.data.alerts.length)}</span>` : ''}</a>`).join('')}`;
  const servers = state.account?.servers || [];
  $('#guildSelect').innerHTML = `<option value="">اختر سيرفرًا</option>${servers.map(guild => `<option data-i18n-preserve value="${esc(guild.id)}" ${guild.id === state.guild ? 'selected' : ''}>${esc(guild.name)}</option>`).join('')}`;
  $('#guildSelect').disabled = !servers.length;
  $('#breadcrumb').textContent = sections.find(([key]) => key === screen())?.[2] || 'سيرفراتي';
  $('#connectionStatus').outerHTML = `<span id="connectionStatus" class="badge ${state.loading ? 'neutral' : statuses[state.data?.connection.status]?.[1] || 'neutral'}">${state.loading ? 'جارٍ التحقق' : statuses[state.data?.connection.status]?.[0] || 'اختر سيرفرًا'}</span>`;
  $('#lastSync').textContent = state.data ? `آخر تحقق: ${date(state.data.connection.checked_at)}` : '';
  document.title = `${$('#breadcrumb').textContent} — ${state.data?.guild.name || 'ديسكوكو'}`;
}
async function loadGuild() {
  const epoch = ++state.epoch; state.loading = true; state.error = null; state.data = null; render();
  try {
    if (!state.guild) { state.loading = false; render(); return; }
    if (!state.account.servers.some(guild => guild.id === state.guild)) throw Object.assign(Error('هذا السيرفر غير متاح لحسابك. اختر سيرفرًا من القائمة.'), { status: 403 });
    const data = await api(`/api/workspace/${encodeURIComponent(state.guild)}`);
    if (epoch !== state.epoch) return;
    state.data = data; readDraft();
    const guild = state.account.servers.find(item => item.id === state.guild); guild.name = data.guild.name; guild.connection = { install_status: data.connection.status };
  } catch (error) { if (epoch !== state.epoch) return; state.error = error; }
  if (epoch === state.epoch) { state.loading = false; render(); }
}
function render() {
  const executionError = $('#executionError');
  if (executionError && executionError.dataset.guild !== state.guild) executionError.remove();
  shell(); draftBar(); const area = $('#workspace');
  if (state.loading) { area.innerHTML = '<div class="loading" role="status">نحمّل بيانات سيرفرك…</div>'; return; }
  if (state.error) { area.innerHTML = head('تعذر فتح مساحة العمل', 'لم نغيّر حالة الربط أو بيانات سيرفرك.') + `<div class="panel">${empty('نحتاج خطوة للمتابعة', esc(state.error.message), `<div class="actions"><button class="btn primary" id="retry">إعادة المحاولة</button><a class="btn secondary" href="/account.html#servers">اختيار سيرفر آخر</a>${state.error.status === 401 ? `<a class="btn secondary" href="/auth/discord?returnTo=${encodeURIComponent(location.pathname + location.search + location.hash)}">إعادة ربط الحساب</a>` : ''}</div>`)}</div>`; $('#retry').onclick = run(() => state.account ? loadGuild() : start()); return; }
  if (!state.guild || screen() === 'servers') { renderServers(); return; }
  const selected = screen();
  const pages = { overview: overview, alerts: alertsPage, builder: builder, 'ready-templates': readyTemplatesPage, bots: bots, commands: commands, assistant: assistant, automation: automation, analytics: analytics, activity: activity, settings: settings, safety: safety };
  Promise.resolve(pages[selected]?.()).catch(error => { if (screen() === selected) area.innerHTML = head('تعذر تحميل القسم', 'حاول مرة أخرى دون تغيير إعداداتك.') + `<div class="panel">${empty('البيانات غير متاحة الآن', esc(error.message), '<button class="btn primary" id="retrySection">إعادة المحاولة</button>')}</div>`; $('#retrySection')?.addEventListener('click', render); });
}
function renderServers() {
  $('#workspace').innerHTML = head('كل مجتمع يبدأ من هنا', 'اختر سيرفرك، وكل أدواته ستكون في مكان واحد.', '<a class="btn primary" href="/account.html#create">＋ تجهيز سيرفر جديد</a>') + `<div class="server-grid">${(state.account?.servers || []).map(guild => `<article class="server-card"><div class="server-title"><span class="server-image">${guild.icon ? `<img src="https://cdn.discordapp.com/icons/${encodeURIComponent(guild.id)}/${encodeURIComponent(guild.icon)}.png?size=96" alt="">` : esc(guild.name.slice(0, 1))}</span><div><h3 data-i18n-preserve>${esc(guild.name)}</h3><small>${guild.owner ? 'أنت مالك السيرفر' : 'لديك صلاحية الإدارة'}</small></div></div>${status(guild.connection?.install_status)}<br><a class="btn primary" href="${url(guild.connection?.install_status === 'installed' ? 'overview' : 'settings', guild.id)}">${guild.connection?.install_status === 'installed' ? 'فتح لوحة السيرفر' : 'إكمال الربط'} ←</a></article>`).join('') || empty('لا توجد سيرفرات قابلة للإدارة', 'أنشئ سيرفرًا في Discord أو تأكد من صلاحية إدارة السيرفر في حسابك.')}</div>`;
}
function connectionNotice() {
  const d = state.data; if (d.connection.status === 'installed' && d.connection.readable) return '';
  const messages = { install_required: 'اربط بوت ديسكوكو أو بوتك الخاص لتظهر القنوات والرتب وتبدأ إدارة سيرفرك.', permissions_insufficient: 'لم يتمكن البوت المختار من الوصول إلى السيرفر. راجع الربط والصلاحيات.', unavailable: 'تعذر الاتصال بـ Discord الآن. هذا لا يعني أن البوت غير مثبت.' };
  return `<div class="notice"><div><b>${messages[d.connection.status] || 'تعذر قراءة بعض بيانات السيرفر.'}</b><p>لن تتاح التعديلات حتى يكتمل التحقق من السيرفر.</p></div>${action('مراجعة الاتصال', 'settings')}</div>`;
}
function changeName(change) { return change.plan?.name || ({ gaming: 'قالب مجتمع ألعاب', support: 'قالب مركز دعم', study: 'قالب مساحة دراسة', custom: 'تعديلات القنوات والرتب' }[change.template_key]) || 'خطة تغييرات'; }
function changeRows(changes) { return changes.length ? `<div class="rows">${changes.map(change => `<div class="row"><span class="row-icon">≡</span><div class="row-main"><b>${esc(changeName(change))}</b><small>${date(change.updated_at)} · المحتسب من الرصيد ${fmt(change.completed_units || 0)} · المخطط ${fmt(change.plan?.operations?.reduce((n, op) => n + draftChangeUnits(op), 0) || change.usage_units || 0)}</small></div>${status(change.status)}<button class="btn text" data-plan="${esc(change.id)}">عرض ←</button></div>`).join('')}</div>` : empty('لم تبدأ أي تغييرات بعد', 'عدّل القنوات أو اختر قالبًا، وستجد المراجعة والنتيجة هنا.', action('استكشف القنوات والرتب', 'builder')); }

function alertRows(items) {
  const labels = { settings: 'راجع الربط', activity: 'راجع الخطة', 'ready-templates': 'افتح القالب', assistant: 'افتح المحادثة', automation: 'عرض الرسالة', builder: 'افتح القنوات' };
  const sources = { bot: 'البوت', connection: 'الاتصال', channels: 'القنوات والرتب', templates: 'القوالب', ai: 'ديسكوكو AI', schedules: 'الجدولة', giveaways: 'الجيف أوي', history: 'سجل الإدارة' };
  return `<div class="rows">${items.map(item => `<div class="row alert-row ${item.severity === 'critical' ? 'alert-critical' : ''}"><span class="row-icon" aria-hidden="true">${item.severity === 'critical' ? '!' : '◷'}</span><div class="row-main"><div class="alert-row-meta"><span>${esc(sources[item.source] || 'المجتمع')}</span>${item.createdAt ? `<time>${date(item.createdAt)}</time>` : ''}</div><b>${esc(item.title)}</b>${item.detail ? `<small>${esc(item.detail)}</small>` : ''}</div><div class="actions">${item.kind === 'change' ? `<button class="btn secondary" data-alert-plan="${esc(item.id)}">راجع الخطة</button>` : item.target ? action(labels[item.target] || 'عرض التفاصيل', item.target, 'secondary') : ''}${item.channelId ? `<a class="btn secondary" href="https://discord.com/channels/${encodeURIComponent(state.guild)}/${encodeURIComponent(item.channelId)}${item.messageId ? `/${encodeURIComponent(item.messageId)}` : ''}" target="_blank" rel="noopener">${item.messageId ? 'عرض الرسالة' : 'افتح القناة'} ↗</a>` : ''}${item.kind === 'giveaway' && item.retryable ? `<button class="btn secondary" data-alert-retry="${esc(item.id)}">محاولة واحدة</button>` : ''}${item.kind === 'giveaway' && item.stoppable ? `<button class="btn danger" data-alert-pause="${esc(item.id)}">إيقاف المحاولات</button>` : ''}${item.kind === 'schedule' || item.kind === 'upcoming' ? `<button class="btn secondary" data-alert-cancel="${esc(item.id)}">إلغاء المهمة</button>` : ''}${item.id ? `<button class="btn text" data-alert-dismiss="${esc(item.kind)}:${esc(item.id)}" aria-label="حذف تنبيه ${esc(item.title)}">حذف التنبيه</button>` : ''}</div></div>`).join('')}</div>`;
}

function bindAlertActions() {
  document.querySelectorAll('[data-alert-plan]').forEach(button => { button.onclick = run(() => showPlan(button.dataset.alertPlan)); });
  document.querySelectorAll('[data-alert-dismiss]').forEach(button => { button.onclick = run(async () => { const [kind, id] = button.dataset.alertDismiss.split(':'); await api(`/api/workspace/${encodeURIComponent(state.guild)}/alerts/${kind}/${encodeURIComponent(id)}/dismiss`, { method: 'POST' }); await loadGuild(); }); });
  document.querySelectorAll('[data-alert-retry]').forEach(button => { button.onclick = () => confirmDialog('محاولة إعلان الجيف أوي؟', 'ستجرى محاولة واحدة فقط. إذا فشلت سيتوقف البوت مجددًا لحماية حسابه من التكرار.', 'محاولة واحدة', async () => { await api(`/api/workspace/${encodeURIComponent(state.guild)}/alerts/giveaway/${encodeURIComponent(button.dataset.alertRetry)}/retry`, { method: 'POST' }); closeDialog(); await loadGuild(); }); });
  document.querySelectorAll('[data-alert-pause]').forEach(button => { button.onclick = () => confirmDialog('إيقاف محاولات الجيف أوي؟', 'لن يحاول البوت تعديل رسالة هذا الجيف أوي تلقائيًا بعد الآن. ستبقى نتيجة السحب محفوظة.', 'إيقاف المحاولات', async () => { await api(`/api/workspace/${encodeURIComponent(state.guild)}/alerts/giveaway/${encodeURIComponent(button.dataset.alertPause)}/pause`, { method: 'POST' }); closeDialog(); await loadGuild(); }); });
  document.querySelectorAll('[data-alert-cancel]').forEach(button => { button.onclick = () => confirmDialog('إلغاء الرسالة المجدولة؟', 'لن تُرسل هذه المهمة لاحقًا. يمكنك إنشاء رسالة جديدة بعد مراجعة القناة.', 'إلغاء المهمة', async () => { await api(`/api/workspace/${encodeURIComponent(state.guild)}/schedules/${encodeURIComponent(button.dataset.alertCancel)}/cancel`, { method: 'POST' }); closeDialog(); await loadGuild(); }); });
  document.querySelectorAll('[data-alert-refresh]').forEach(button => { button.onclick = run(() => loadGuild()); });
}

function alertSummary() { const items = state.data.alerts || []; return items.length ? panel('تنبيهات تحتاج إجراء', alertRows(items.slice(0, 3)), action('عرض كل التنبيهات', 'alerts', 'text')) : ''; }
function alertsPage() {
  const items = state.data.alerts || [];
  const upcoming = state.data.upcoming || [], recent = state.data.recent || [];
  const tab = state.alertTab || 'action';
  const all = tab === 'action' ? items : tab === 'upcoming' ? upcoming : recent;
  const sources = [['all','كل الأقسام'], ['connection','الاتصال'], ['channels','القنوات'], ['templates','القوالب'], ['ai','ديسكوكو AI'], ['schedules','الجدولة'], ['giveaways','الجيف أوي'], ['bot','البوت'], ['history','السجل']];
  const selectedSource = state.alertSource || 'all';
  const filtered = selectedSource === 'all' ? all : all.filter(item => item.source === selectedSource);
  const content = filtered.length ? alertRows(filtered) : empty(tab === 'action' ? 'لا توجد أمور تحتاج إجراءً' : tab === 'upcoming' ? 'لا توجد مهام قادمة' : 'لا توجد أحداث حديثة', selectedSource !== 'all' ? 'لا توجد عناصر في هذا القسم؛ اختر كل الأقسام لعرض البقية.' : 'ستظهر العناصر هنا عند حدوثها.');
  $('#workspace').innerHTML = head('مركز التنبيهات', 'المشاكل والمهام القادمة وما تغيّر في سيرفرك، مع إجراء واضح لكل عنصر. حذف التنبيه يخفيه من صفحات ديسكوكو ولا يلغي المهمة أو السجل؛ تنبيهات انقطاع الاتصال تعود بعد يوم إن استمرت.', '<button class="btn secondary" id="refreshAlerts">تحديث الحالة ↻</button>') + `<div class="alert-tabs" role="tablist" aria-label="أنواع التنبيهات"><button type="button" data-alert-tab="action" role="tab" aria-selected="${tab === 'action'}">يحتاج إجراء <span>${fmt(items.length)}</span></button><button type="button" data-alert-tab="upcoming" role="tab" aria-selected="${tab === 'upcoming'}">قادم <span>${fmt(upcoming.length)}</span></button><button type="button" data-alert-tab="recent" role="tab" aria-selected="${tab === 'recent'}">حدث مؤخرًا <span>${fmt(recent.length)}</span></button></div>${panel(tab === 'action' ? 'تحتاج مراجعتك' : tab === 'upcoming' ? 'مهام قادمة' : 'آخر التغييرات', content)}`;
  $('#workspace .alert-tabs').insertAdjacentHTML('afterend', `<div class="alert-filters"><span>تصفية حسب القسم</span><select id="alertSource" aria-label="تصفية التنبيهات حسب القسم">${sources.map(([key,label]) => `<option value="${key}" ${selectedSource === key ? 'selected' : ''}>${label}</option>`).join('')}</select><small>${fmt(filtered.length)} معروضة</small></div>`);
  $('#refreshAlerts').onclick = run(() => loadGuild()); bindAlertActions();
  document.querySelectorAll('[data-alert-tab]').forEach(button => { button.onclick = () => { state.alertTab = button.dataset.alertTab; state.alertSource = 'all'; alertsPage(); }; });
  $('#alertSource').onchange = event => { state.alertSource = event.target.value; alertsPage(); };
}
function bindPlans() { document.querySelectorAll('[data-plan]').forEach(button => { button.onclick = run(() => showPlan(button.dataset.plan)); }); }
function overviewTimeline(data) {
  const plans = (data.changeSets || []).map(change => ({ kind: 'plan', id: change.id, title: changeName(change), at: change.updated_at, status: change.status }));
  const publications = (data.publications || []).map(item => ({ kind: 'publication', title: item.interactive_kind === 'scheduled_event' ? 'أُنشئ حدث في Discord' : item.interactive_kind === 'welcome' ? 'فُعّل الترحيب التلقائي' : item.interactive_kind === 'rules' ? 'نُشرت بطاقة القوانين' : item.interactive_kind === 'giveaway' ? 'نُشر جيف أوي' : item.interactive_kind === 'tickets' ? 'نُشرت لوحة الدعم' : 'نُشر محتوى في السيرفر', at: item.published_at, channelId: item.interactive_channel_id || item.sent_channel_id, messageId: item.interactive_message_id || item.sent_message_id }));
  const latest = [...plans, ...publications].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 6);
  return latest.length ? `<div class="rows">${latest.map(item => `<div class="row"><span class="row-icon">${item.kind === 'publication' || item.status === 'succeeded' ? '✓' : item.status === 'failed' ? '!' : '◷'}</span><div class="row-main"><b>${esc(item.title)}</b><small>${date(item.at)}</small></div>${item.kind === 'plan' ? `${status(item.status)}<button class="btn text" data-plan="${esc(item.id)}">التفاصيل ←</button>` : item.channelId && item.messageId ? `<a class="btn text" href="https://discord.com/channels/${encodeURIComponent(state.guild)}/${encodeURIComponent(item.channelId)}/${encodeURIComponent(item.messageId)}" target="_blank" rel="noopener noreferrer">في Discord ↗</a>` : badge('نُشر', 'good')}</div>`).join('')}</div>` : empty('لا توجد عمليات منشورة بعد', 'ستظهر هنا الخطط والمنشورات الجديدة فور حفظها أو تنفيذها.');
}
function overview() {
  const d = state.data;
  const alerts = d.alerts || [];
  const changes = d.overview?.changes || {};
  const schedules = d.overview?.schedules || {};
  const drafts = Number(changes.drafts ?? d.changeSets.filter(change => change.status === 'draft').length);
  const failed = Number(changes.failed ?? d.changeSets.filter(change => change.status === 'failed').length);
  const running = Number(changes.running ?? d.changeSets.filter(change => change.status === 'running').length);
  const upcoming = Number(schedules.upcoming || 0);
  const localDrafts = state.draft.length;
  const readable = d.connection.readable;
  const botOnline = Boolean(d.bot?.online);
  const priority = alerts.length ? { title: 'هناك أمر يحتاج انتباهك', detail: `${fmt(alerts.length)} تنبيه${alerts.length === 1 ? '' : 'ات'} يحتاج إلى مراجعة أو إجراء.`, label: 'راجع التنبيهات', target: 'alerts' }
    : !readable || !botOnline ? { title: 'أكمل اتصال السيرفر', detail: 'راجع اتصال البوت وقراءة القنوات والرتب قبل تنفيذ أي تغيير.', label: 'افتح إعدادات الاتصال', target: 'settings' }
    : localDrafts || drafts ? { title: 'تغييراتك جاهزة للمراجعة', detail: `${fmt(drafts)} خطة محفوظة و${fmt(localDrafts)} تعديل على هذا الجهاز. راجع التفاصيل قبل التطبيق.`, label: 'عرض خطط التغيير', target: 'activity' }
    : { title: 'سيرفرك جاهز للخطوة التالية', detail: 'ابدأ بقالب جاهز أو اضبط قنواتك ورتبك. ستراجع التغييرات قبل نشرها.', label: 'استكشف القوالب الجاهزة', target: 'ready-templates' };
  const overviewMetrics = `<div class="metrics overview-metrics">${metric('أعضاء السيرفر', d.members, 'عدد تقريبي من Discord', '♧')}${metric('القنوات', d.channels?.filter(channel => channel.type !== 4).length, readable ? `${fmt(d.channels.filter(channel => channel.type === 4).length)} تصنيفات` : 'تعذر جلب البنية الآن', '▤')}${metric('مسودات التغيير', drafts + localDrafts, `${fmt(drafts)} محفوظة · ${fmt(localDrafts)} على هذا الجهاز`, '≡')}${metric('رسائل قادمة', upcoming, schedules.next_at ? `أقرب موعد: ${date(schedules.next_at)}` : 'لا توجد رسائل مجدولة', '◷')}</div>`;
  const readiness = `<div class="rows"><div class="row"><span class="row-icon">◈</span><div class="row-main"><b>قراءة السيرفر</b><small>${readable ? `تم التحقق ${date(d.connection.checked_at)}` : 'القنوات والرتب غير متاحة الآن'}</small></div>${status(d.connection.status)}</div><div class="row"><span class="row-icon">🤖</span><div class="row-main"><b>${d.bot?.custom ? 'بوتك الخاص' : 'بوت ديسكوكو'}</b><small data-i18n-preserve>${esc(d.bot?.username || 'البوت المنفذ لهذا السيرفر')}</small></div>${badge(botOnline ? 'متصل' : 'غير متصل', botOnline ? 'good' : 'warn')}</div><div class="row"><span class="row-icon">⚠</span><div class="row-main"><b>المشاكل النشطة</b><small>${alerts.length ? 'افتح التنبيهات للاطلاع على الحل' : 'لا توجد تنبيهات تحتاج إجراءً الآن'}</small></div>${badge(alerts.length ? `${fmt(alerts.length)} تحتاج متابعة` : 'لا توجد', alerts.length ? 'warn' : 'good')}</div><div class="row"><span class="row-icon">⌁</span><div class="row-main"><b>تحليلات النشاط</b><small>جمع الأعداد يحتاج موافقتك</small></div>${badge(d.preferences.analytics_enabled ? 'مفعّلة' : 'غير مفعّلة', d.preferences.analytics_enabled ? 'good' : 'neutral')}</div></div>`;
  const navigation = [['alerts', 'التنبيهات'], ['bots', 'اللوحات التفاعلية'], ['commands', 'الأوامر'], ['analytics', 'النشاط والتحليلات'], ['safety', 'الأمان والصلاحيات'], ['activity', 'سجل التغييرات'], ['settings', 'إعدادات السيرفر']];
  $('#workspace').innerHTML = head('نظرة عامة على سيرفرك', 'حالة المجتمع وما يحتاج إجراءً، في مكان واحد.', `<div class="actions"><button class="btn secondary" id="overviewRefresh" type="button">تحديث البيانات ↻</button><a class="btn secondary" href="https://discord.com/channels/${encodeURIComponent(state.guild)}" target="_blank" rel="noopener">فتح Discord ↗</a></div>`) + connectionNotice() + `<section class="hero overview-hero"><div><span class="eyebrow">${esc(d.guild.name)} · آخر تحقق ${date(d.connection.checked_at)}</span><h2>${priority.title}</h2><p>${priority.detail}</p><div class="actions">${action(priority.label, priority.target, 'primary')}${localDrafts ? '<button class="btn secondary" id="overviewLocalDraft" type="button">مراجعة تعديلات هذا الجهاز</button>' : ''}</div></div><div class="hero-art" aria-hidden="true"><span>${alerts.length ? '⚠' : '◈'}</span></div></section>${overviewMetrics}${failed || running ? `<div class="overview-work-note">${failed ? `<span>${fmt(failed)} خطط تعثرت وتحتاج مراجعة</span>` : ''}${running ? `<span>${fmt(running)} خطط قيد التنفيذ</span>` : ''}${action('عرض سجل التغييرات', 'activity', 'text')}</div>` : ''}${alerts.length ? panel('يحتاج انتباهك', alertRows(alerts.slice(0, 2)), action('كل التنبيهات', 'alerts', 'text')) : ''}<div class="section-title"><h3>ابدأ من هنا</h3><small>اختر ما تريد إنجازه</small></div><div class="quick-actions overview-quick-actions">${[['ready-templates', '▣', 'القوالب الجاهزة', 'هيكل متكامل قابل للتعديل'], ['builder', '▤', 'القنوات والرتب', 'اضبط بنية السيرفر خطوة بخطوة'], ['assistant', '✦', 'ديسكوكو AI', 'صمّم وراجع قبل التنفيذ'], ['automation', '◷', 'الرسائل المجدولة', 'جهّز ما سيُنشر لاحقًا']].map(([key, icon, title, sub]) => `<a class="quick-action" href="${url(key)}"><span class="quick-icon">${icon}</span><span><strong>${title}</strong><small>${sub}</small></span><em>←</em></a>`).join('')}</div><div class="grid-2 overview-bottom">${panel('حالة التشغيل', readiness, `<a class="btn text" href="${url('settings')}">إدارة الاتصال</a>`)}${panel('آخر ما حدث', overviewTimeline(d), action('سجل التغييرات كاملًا', 'activity', 'text'))}</div>${panel('أدوات الإدارة والمتابعة', `<div class="overview-directory">${navigation.map(([key, label]) => `<a href="${url(key)}">${esc(label)} <span aria-hidden="true">←</span></a>`).join('')}</div>`)}`;
  $('#overviewRefresh').onclick = run(() => loadGuild());
  $('#overviewLocalDraft')?.addEventListener('click', () => reviewLocal());
  bindPlans(); bindAlertActions();
}
function builder() {
  const d = state.data; const labels = { channels: 'القنوات والتصنيفات', roles: 'الرتب', access: 'معاينة الوصول' };
  $('#workspace').innerHTML = head('القنوات والرتب', 'تحكم ببنية سيرفرك من مكان واحد. كل تعديل يمر بمراجعة قبل تطبيقه.') + connectionNotice() + `<div class="notice info"><div><b>لتحكم كامل، امنح البوت صلاحية Administrator وضع رتبته فوق الرتب التي سيعدلها.</b><p>تحقق من البوت المختار أدناه قبل التعديل. يجب أن تكون رتبته فوق الرتب المستهدفة، ويحتاج صلاحيات إدارة القنوات والرتب.</p></div>${action('إعدادات البوت', 'settings', 'secondary')}</div><section class="ready-executor-panel" aria-label="بوت تنفيذ القنوات والرتب"><div class="ready-executor-head"><div><span class="ready-executor-kicker">القنوات والرتب</span><h3>بوت التنفيذ</h3><p>اختر البوت الذي سينفذ تغييرات القنوات والتصنيفات والرتب في هذا السيرفر.</p></div></div><div id="builderBotConnection" role="status">جارٍ فحص البوت…</div></section><div class="tabs" role="tablist" aria-label="بنية السيرفر">${Object.entries(labels).map(([key, label]) => `<button role="tab" aria-selected="${state.tab === key}" class="tab ${state.tab === key ? 'active' : ''}" data-tab="${key}">${label}</button>`).join('')}</div><div id="builderContent"></div>`;
  void loadServerExecutor('builderBotConnection', 'builder');
  document.querySelectorAll('[data-tab]').forEach(button => { button.onclick = () => { state.tab = button.dataset.tab; builder(); }; });
  if (!d.connection.readable) { $('#builderContent').innerHTML = empty('ننتظر اكتمال الاتصال', 'بعد التحقق من الربط، ستظهر البنية الفعلية لسيرفرك.', action('إكمال الربط', 'settings', 'primary')); return; }
  if (state.tab === 'access') { accessPreview(); return; }
  const roles = state.tab === 'roles';
  $('#builderContent').innerHTML = `<div class="toolbar"><input class="search" id="resourceSearch" aria-label="بحث في العناصر" placeholder="ابحث بالاسم…">${!roles ? `<select id="channelFilter" class="filter-select" aria-label="عرض القنوات"><option value="permanent" ${state.channelFilter === 'permanent' ? 'selected' : ''}>القنوات الأساسية</option><option value="tickets" ${state.channelFilter === 'tickets' ? 'selected' : ''}>التذاكر المؤقتة</option><option value="all" ${state.channelFilter === 'all' ? 'selected' : ''}>كل القنوات</option></select>` : ''}<div class="actions">${!roles ? '<button class="btn secondary" id="newCategory">＋ تصنيف</button>' : ''}<button class="btn primary" id="newResource">＋ ${roles ? 'رتبة جديدة' : 'قناة جديدة'}</button></div></div><section class="panel" id="resourceList"></section>`;
  const selected = new Set();
  const batchButton = document.createElement('button'); batchButton.type = 'button'; batchButton.className = 'btn secondary'; batchButton.id = 'batchEdit'; batchButton.disabled = true; batchButton.textContent = 'تعديل جماعي';
  $('#builderContent .actions').prepend(batchButton);
  const resume = document.createElement('button'); resume.type = 'button'; resume.className = 'btn secondary'; resume.id = 'resumeBuilderDraft'; resume.hidden = !state.draft.length; resume.textContent = 'التعديلات المؤجلة'; resume.onclick = () => reviewLocal();
  $('#builderContent .actions').append(resume);
  function rows(term = '') {
    let html = '';
    if (roles) html = [...d.roles].sort((a, b) => b.position - a.position).filter(role => role.name.toLowerCase().includes(term)).map(role => `<div class="row"><span class="role-dot" style="--role-color:#${Number(role.color || 0xa8b0c8).toString(16).padStart(6, '0')}"></span><div class="row-main"><b data-i18n-preserve>${esc(role.name)}</b><small>${role.managed ? 'يديرها تطبيق' : role.id === state.guild ? 'الرتبة العامة' : 'رتبة مخصصة'}</small></div>${role.managed || role.id === state.guild ? badge('رتبة نظام') : `<button class="btn small secondary" data-edit="${esc(role.id)}" data-kind="role">تعديل</button>`}</div>`).join('');
    else {
      const groups = [{ id: null, name: 'قنوات دون تصنيف' }, ...d.channels.filter(channel => channel.type === 4).sort((a, b) => a.position - b.position)];
      for (const group of groups) {
        const children = d.channels.filter(channel => channel.type !== 4 && (channel.parent_id || null) === group.id).sort((a, b) => a.position - b.position).filter(channel => `${channel.name} ${group.name}`.toLowerCase().includes(term)).filter(channel => term || state.channelFilter === 'all' || (temporaryTicketChannel(channel) === (state.channelFilter === 'tickets')));
        if (!children.length && group.id === null) continue;
        if (!children.length && term && !group.name.toLowerCase().includes(term)) continue;
        html += `<div class="tree-category"><span>⌄ <span ${group.id ? 'data-i18n-preserve' : ''}>${esc(group.name)}</span> <small>· ${fmt(children.length)}</small></span>${group.id ? `<button class="btn text" data-edit="${esc(group.id)}" data-kind="category">تعديل</button>` : ''}</div>`;
        html += children.map(channel => `<div class="row tree-channel"><span class="row-icon">${channel.type === 2 ? '◖' : '#'}</span><div class="row-main"><b data-i18n-preserve>${esc(channel.name)}</b><small>${channel.type === 2 ? 'قناة صوتية' : channel.type === 0 ? 'قناة نصية' : 'قناة Discord'}</small></div><button class="btn small secondary" data-edit="${esc(channel.id)}" data-kind="channel">تعديل</button></div>`).join('');
      }
    }
    $('#resourceList').innerHTML = html || empty('لا توجد نتائج', 'جرّب اسمًا آخر أو أضف عنصرًا جديدًا.');
    document.querySelectorAll('#resourceList .row [data-edit]').forEach(button => {
      const check = document.createElement('input'); check.type = 'checkbox'; check.className = 'resource-select'; check.setAttribute('aria-label', `اختيار ${button.closest('.row')?.querySelector('b')?.textContent || 'عنصر'}`); check.checked = selected.has(button.dataset.edit);
      check.onchange = () => { if (check.checked) selected.add(button.dataset.edit); else selected.delete(button.dataset.edit); batchButton.disabled = selected.size === 0; batchButton.textContent = `تعديل جماعي${selected.size ? ` (${selected.size})` : ''}`; };
      button.closest('.row').prepend(check);
      const row = button.closest('.row'); row.draggable = true;
      row.title = 'اسحب العنصر فوق عنصر آخر في المجموعة نفسها لترتيبه، أو استخدم حقل الترتيب في تعديل العنصر.';
      row.ondragstart = event => { event.dataTransfer.setData('text/plain', button.dataset.edit); event.dataTransfer.effectAllowed = 'move'; };
      row.ondragover = event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; };
      row.ondrop = event => {
        event.preventDefault(); const sourceId = event.dataTransfer.getData('text/plain'); const targetId = button.dataset.edit;
        if (!sourceId || sourceId === targetId) return;
        const list = roles ? d.roles : d.channels;
        const source = list.find(item => item.id === sourceId), target = list.find(item => item.id === targetId);
        if (!source || !target || (!roles && (source.parent_id || null) !== (target.parent_id || null))) { toast('اسحب القناة داخل تصنيفها نفسه. لن يتغير شيء.'); return; }
        const position = roles ? Number(target.position) : channelOrder(target, d.channels) - 1;
        const current = roles ? Number(source.position) : channelOrder(source, d.channels) - 1;
        if (position === current) return;
        let op = state.draft.find(item => item.resource_id === sourceId);
        if (!op) { op = { resource_type: roles ? 'role' : 'channel', action: 'update', resource_id: sourceId, name: source.name }; state.draft.push(op); }
        op.position = position; if (!roles) { op.position_changed = true; op.position_before_display = channelOrder(source, d.channels); }
        saveDraft(); reviewLocal();
      };
    });
    document.querySelectorAll('[data-edit]').forEach(button => { button.onclick = () => editResource(button.dataset.kind, button.dataset.edit); });
  }
  rows(); $('#resourceSearch').oninput = event => rows(event.target.value.trim().toLowerCase());
  $('#channelFilter')?.addEventListener('change', event => { state.channelFilter = event.target.value; rows($('#resourceSearch').value.trim().toLowerCase()); });
  $('#newResource').onclick = () => editResource(roles ? 'role' : 'channel');
  $('#newCategory')?.addEventListener('click', () => editResource('category'));
  batchButton.onclick = () => {
    const resources = (roles ? d.roles : d.channels).filter(item => selected.has(item.id));
    if (!resources.length) return;
    const controls = roles
      ? '<label class="check-row"><input id="batchHoistSet" type="checkbox">تغيير إظهار الأعضاء منفصلين</label><label><select id="batchHoist"><option value="true">إظهار</option><option value="false">إخفاء</option></select></label><label class="check-row"><input id="batchMentionSet" type="checkbox">تغيير السماح بالإشارة</label><label><select id="batchMention"><option value="true">سماح</option><option value="false">منع</option></select></label>'
      : '<label class="check-row"><input id="batchSlowSet" type="checkbox">تغيير بطء المحادثة للقنوات النصية والمنتديات</label><label>المدة بالثواني<input id="batchSlow" type="number" min="0" max="21600" value="0"></label><label class="check-row"><input id="batchNsfwSet" type="checkbox">تغيير تصنيف البالغين</label><label><select id="batchNsfw"><option value="false">إيقاف</option><option value="true">تفعيل</option></select></label>';
    modal('تعديل جماعي', `<form id="batchForm" class="form-grid"><p class="form-note">اختر الإعدادات التي تريد تغييرها فقط في ${fmt(resources.length)} عناصر. ستظهر كل قناة أو رتبة على حدة في المراجعة قبل التنفيذ.</p>${controls}</form>`, '<button class="btn secondary" id="cancelBatch">إلغاء</button><button class="btn primary" type="submit" form="batchForm">متابعة للتنفيذ</button>');
    $('#cancelBatch').onclick = closeDialog;
    $('#batchForm').onsubmit = event => {
      event.preventDefault();
      const changed = roles ? $('#batchHoistSet').checked || $('#batchMentionSet').checked : $('#batchSlowSet').checked || $('#batchNsfwSet').checked;
      if (!changed) { modalError(Error('اختر إعدادًا واحدًا على الأقل.')); return; }
      for (const item of resources) {
        const existing = state.draft.find(op => op.resource_id === item.id);
        const op = existing || { resource_type: roles ? 'role' : 'channel', action: 'update', resource_id: item.id, name: item.name };
        if (roles) { if ($('#batchHoistSet').checked) op.hoist = $('#batchHoist').value === 'true'; if ($('#batchMentionSet').checked) op.mentionable = $('#batchMention').value === 'true'; }
        else { if ($('#batchSlowSet').checked && [0,15].includes(item.type)) op.rate_limit_per_user = Number($('#batchSlow').value); if ($('#batchNsfwSet').checked && [0,2,15].includes(item.type)) op.nsfw = $('#batchNsfw').value === 'true'; }
        if (!existing && draftChangeUnits(op)) state.draft.push(op);
      }
      saveDraft(); closeDialog(); reviewLocal();
    };
  };
}
function accessPreview() {
  const channels = state.data.channels.filter(channel => channel.type !== 4);
  const channelOptions = includeTickets => channels.filter(channel => includeTickets || !temporaryTicketChannel(channel)).map(channel => `<option data-i18n-preserve value="${esc(channel.id)}">${esc(channel.name)}</option>`).join('');
  $('#builderContent').innerHTML = `<section class="panel"><div class="panel-head"><div><h3>من يستطيع الوصول فعلًا؟</h3><p class="form-note">اختر قناة ورتبة، أو ابحث عن عضو لحساب رُتبه مجتمعة مع استثناءاته. تظهر المسودة بجانب الوضع الحالي قبل إرسالها إلى Discord.</p></div></div><div class="form-grid"><label>القناة<select id="accessChannel">${channelOptions(false)}</select></label><label class="check-row"><input id="accessIncludeTickets" type="checkbox">إظهار تذاكر الدعم المؤقتة (${fmt(channels.filter(temporaryTicketChannel).length)})</label><label>محاكاة رتبة<select id="accessRole">${state.data.roles.map(role => `<option data-i18n-preserve value="${esc(role.id)}">${esc(role.name)}</option>`).join('')}</select></label><label>أو ابحث عن عضو<input id="accessMemberSearch" type="search" autocomplete="off" placeholder="اكتب اسم العضو أو معرّفه"></label><div id="accessMemberResults" role="status"></div></div><div id="accessSummary"></div><div id="accessMatrix" class="permission-matrix"></div></section>`;
  let member = null, timer;
  const render = () => {
    const channel = channels.find(row => row.id === $('#accessChannel').value);
    if (!channel) return;
    const roleId = member?.id || $('#accessRole').value;
    const memberRoles = member?.roles || null;
    const draft = state.draft.find(op => op.resource_id === channel.id && Object.hasOwn(op, 'permission_overwrites'));
    const currentRows = channel.permission_overwrites || [];
    const plannedRows = draft?.permission_overwrites || currentRows;
    const result = (bit, rows) => effectivePermission(channel, roleId, bit, rows, memberRoles);
    const view = result(1024n, plannedRows), send = result(2048n, plannedRows);
    const parent = state.data.channels.find(row => row.id === channel.parent_id);
    $('#accessSummary').innerHTML = `<div class="notice ${view.allowed ? 'info' : 'warn'}"><div><b>${member ? esc(member.name) : `محاكاة رتبة ${esc(state.data.roles.find(row => row.id === roleId)?.name || '')}`}: ${view.allowed ? 'يمكن رؤية القناة' : 'لا يمكن رؤية القناة'}</b><p>${send.allowed ? 'يمكن إرسال الرسائل' : 'لا يمكن إرسال الرسائل'} · ${esc(view.source)}${parent ? ` · التصنيف: ${esc(parent.name)}` : ''}${draft ? ' · تشمل النتيجة مسودتك غير المنفذة' : ''}</p></div></div>`;
    const voiceOnly = new Set(['Connect','Speak','Stream','MuteMembers','MoveMembers','DeafenMembers','PrioritySpeaker','UseSoundboard','UseVAD','RequestToSpeak','UseEmbeddedActivities','UseExternalSounds','SetVoiceChannelStatus']);
    $('#accessMatrix').innerHTML = channelPermissionChoices.filter(([key]) => channel.type === 2 || !voiceOnly.has(key)).map(([key,label,value]) => { const now = result(BigInt(value), currentRows), next = result(BigInt(value), plannedRows); return `<div class="access-result"><b>${esc(label)}</b><span>${next.allowed ? '✓ مسموح' : '× ممنوع'}</span><small>${esc(next.source)}${draft && now.allowed !== next.allowed ? ` · قبل المسودة: ${now.allowed ? 'مسموح' : 'ممنوع'}` : ''}</small></div>`; }).join('');
  };
  $('#accessChannel').onchange = render;
  $('#accessIncludeTickets').onchange = event => { const current = $('#accessChannel').value; $('#accessChannel').innerHTML = channelOptions(event.target.checked); if ([...$('#accessChannel').options].some(option => option.value === current)) $('#accessChannel').value = current; render(); };
  $('#accessRole').onchange = () => { member = null; $('#accessMemberSearch').value = ''; $('#accessMemberResults').textContent = ''; render(); };
  $('#accessMemberSearch').oninput = () => {
    clearTimeout(timer); const query = $('#accessMemberSearch').value.trim();
    if (query.length < 2) { member = null; $('#accessMemberResults').textContent = 'اكتب حرفين على الأقل.'; render(); return; }
    timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/workspace/${encodeURIComponent(state.guild)}/members/search?q=${encodeURIComponent(query)}`);
        const data = await response.json(); if (!response.ok) throw Error(data.error || 'تعذر البحث.');
        if ($('#accessMemberSearch').value.trim() !== query) return;
        $('#accessMemberResults').innerHTML = data.members.length ? data.members.map(row => `<button type="button" class="btn secondary small" data-access-member="${esc(row.id)}">${esc(row.name)} <small data-i18n-preserve>${esc(row.username)}</small></button>`).join('') : '<small>لا يوجد عضو مطابق.</small>';
        document.querySelectorAll('[data-access-member]').forEach(button => { button.onclick = () => { member = data.members.find(row => row.id === button.dataset.accessMember); $('#accessMemberSearch').value = member.name; $('#accessMemberResults').textContent = ''; render(); }; });
      } catch (error) { $('#accessMemberResults').textContent = error.message; }
    }, 300);
  };
  render();
}
const rolePermissionGroups = [
  ['إدارة السيرفر', [['Administrator','التحكم الكامل (Administrator)','8'],['ManageGuild','إدارة السيرفر','32'],['ManageChannels','إدارة القنوات','16'],['ManageRoles','إدارة الرتب','268435456'],['ViewAuditLog','عرض سجل التدقيق','128'],['ManageWebhooks','إدارة Webhooks','536870912']]],
  ['الإشراف والأعضاء', [['KickMembers','طرد الأعضاء','2'],['BanMembers','حظر الأعضاء','4'],['ModerateMembers','إيقاف الأعضاء مؤقتًا','1099511627776'],['ManageNicknames','تغيير ألقاب الآخرين','134217728'],['ManageMessages','إدارة الرسائل','8192']]],
  ['المحادثات', [['ViewChannel','عرض القنوات','1024'],['SendMessages','إرسال الرسائل','2048'],['ReadMessageHistory','قراءة سجل الرسائل','65536'],['EmbedLinks','تضمين الروابط','16384'],['AttachFiles','إرفاق الملفات','32768'],['AddReactions','إضافة التفاعلات','64'],['UseExternalEmojis','استخدام إيموجي خارجي','262144'],['MentionEveryone','الإشارة إلى الجميع','131072'],['CreatePublicThreads','إنشاء سلاسل عامة','34359738368'],['CreatePrivateThreads','إنشاء سلاسل خاصة','68719476736'],['SendMessagesInThreads','الكتابة في السلاسل','274877906944']]],
  ['الصوت', [['Connect','الاتصال بالقنوات الصوتية','1048576'],['Speak','التحدث','2097152'],['Stream','مشاركة الشاشة','512'],['MuteMembers','كتم الأعضاء','4194304'],['DeafenMembers','إسكات الأعضاء','8388608'],['MoveMembers','نقل الأعضاء','16777216'],['PrioritySpeaker','متحدث ذو أولوية','256'],['UseSoundboard','استخدام لوحة الأصوات','4398046511104']]],
  ['إدارة المجتمع', [['CreateInstantInvite','إنشاء روابط دعوة','1'],['ViewGuildInsights','عرض إحصاءات السيرفر','524288'],['ManageGuildExpressions','إدارة الإيموجيات والملصقات','1073741824'],['CreateGuildExpressions','إنشاء تعبيرات السيرفر','8796093022208'],['ManageEvents','إدارة الفعاليات','8589934592'],['CreateEvents','إنشاء فعاليات','17592186044416'],['ChangeNickname','تغيير لقبه الشخصي','67108864'],['ViewCreatorMonetizationAnalytics','عرض إحصاءات الربح','2199023255552']]],
  ['الرسائل والسلاسل المتقدمة', [['SendTTSMessages','إرسال رسائل صوتية TTS','4096'],['UseExternalStickers','استخدام ملصقات خارجية','137438953472'],['UseApplicationCommands','استخدام أوامر التطبيقات','2147483648'],['ManageThreads','إدارة السلاسل','17179869184'],['SendVoiceMessages','إرسال رسائل صوتية','70368744177664'],['SendPolls','إنشاء استطلاعات','562949953421312'],['PinMessages','تثبيت الرسائل','2251799813685248'],['BypassSlowmode','تجاوز بطء المحادثة','4503599627370496'],['UseExternalApps','استخدام تطبيقات خارجية','1125899906842624']]],
  ['الصوت والأنشطة المتقدمة', [['UseVAD','استخدام كشف الصوت التلقائي','33554432'],['RequestToSpeak','طلب التحدث في المنصة','4294967296'],['UseEmbeddedActivities','بدء أنشطة داخل الصوت','549755813888'],['UseExternalSounds','استخدام أصوات خارجية','35184372088832'],['SetVoiceChannelStatus','تعيين حالة القناة الصوتية','281474976710656']]],
];
const channelPermissionChoices = [
  ['ViewChannel','عرض القناة','1024'],['SendMessages','إرسال الرسائل','2048'],['ReadMessageHistory','قراءة السجل','65536'],['EmbedLinks','تضمين الروابط','16384'],['AttachFiles','إرفاق الملفات','32768'],['AddReactions','إضافة التفاعلات','64'],['MentionEveryone','الإشارة إلى الجميع','131072'],['ManageMessages','إدارة الرسائل','8192'],['CreatePublicThreads','إنشاء سلاسل عامة','34359738368'],['SendMessagesInThreads','الكتابة في السلاسل','274877906944'],['Connect','الاتصال الصوتي','1048576'],['Speak','التحدث','2097152'],['Stream','مشاركة الشاشة','512'],['MuteMembers','كتم الأعضاء','4194304'],['MoveMembers','نقل الأعضاء','16777216'],
  ['CreateInstantInvite','إنشاء دعوة','1'],['SendTTSMessages','رسائل TTS','4096'],['UseExternalEmojis','إيموجيات خارجية','262144'],['UseExternalStickers','ملصقات خارجية','137438953472'],['UseApplicationCommands','أوامر التطبيقات','2147483648'],['ManageThreads','إدارة السلاسل','17179869184'],['CreatePrivateThreads','إنشاء سلاسل خاصة','68719476736'],['ManageWebhooks','إدارة Webhooks','536870912'],['SendVoiceMessages','رسائل صوتية','70368744177664'],['SendPolls','الاستطلاعات','562949953421312'],['PinMessages','تثبيت الرسائل','2251799813685248'],['BypassSlowmode','تجاوز بطء المحادثة','4503599627370496'],['DeafenMembers','إسكات الأعضاء','8388608'],['PrioritySpeaker','متحدث ذو أولوية','256'],['UseSoundboard','لوحة الأصوات','4398046511104'],['UseVAD','كشف الصوت التلقائي','33554432'],['RequestToSpeak','طلب التحدث','4294967296'],['UseEmbeddedActivities','الأنشطة الصوتية','549755813888'],['UseExternalSounds','أصوات خارجية','35184372088832'],['SetVoiceChannelStatus','حالة القناة الصوتية','281474976710656']
];
function channelTypeSettings(item, type) {
  if (type === 2) return `<details><summary>إعدادات الصوت</summary><div class="form-grid"><label>جودة الصوت (بت/ثانية)<input id="resourceBitrate" type="number" min="8000" max="384000" step="1000" value="${Number(item.bitrate || 64000)}"></label><label>منطقة الاتصال<input id="resourceRegion" value="${esc(item.rtc_region || '')}" placeholder="تلقائي — اتركه فارغًا"></label><label>بطء المحادثة النصية في الصوت<input id="resourceSlowmode" type="number" min="0" max="21600" value="${Number(item.rate_limit_per_user || 0)}"></label><label class="check-row"><input id="resourceNsfw" type="checkbox" ${item.nsfw ? 'checked' : ''}>قناة للبالغين فقط</label></div><p class="form-note">حد جودة الصوت يعتمد على مستوى تعزيز السيرفر. سنتحقق منه قبل إضافة الخطة.</p></details>`;
  if (![0,15].includes(type)) return '';
  const archive = Number(item.default_auto_archive_duration || 1440);
  const threads = `<label>أرشفة السلاسل الجديدة<select id="resourceArchive">${[[60,'بعد ساعة'],[1440,'بعد يوم'],[4320,'بعد 3 أيام'],[10080,'بعد أسبوع']].map(([value,label]) => `<option value="${value}" ${archive === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>بطء المحادثة داخل السلاسل<input id="resourceThreadSlowmode" type="number" min="0" max="21600" value="${Number(item.default_thread_rate_limit_per_user || 0)}"></label>`;
  if (type === 0) return `<details><summary>إعدادات السلاسل</summary><div class="form-grid">${threads}</div></details>`;
  const tags = (item.available_tags || []).map(tag => tag.name).join('\n');
  return `<details><summary>إعدادات المنتدى</summary><div class="form-grid">${threads}<label>ترتيب المنشورات<select id="resourceForumSort"><option value="0" ${Number(item.default_sort_order || 0) === 0 ? 'selected' : ''}>أحدث نشاط</option><option value="1" ${Number(item.default_sort_order || 0) === 1 ? 'selected' : ''}>أحدث منشور</option></select></label><label>شكل العرض<select id="resourceForumLayout"><option value="0" ${Number(item.default_forum_layout || 0) === 0 ? 'selected' : ''}>افتراضي</option><option value="1" ${Number(item.default_forum_layout || 0) === 1 ? 'selected' : ''}>قائمة</option><option value="2" ${Number(item.default_forum_layout || 0) === 2 ? 'selected' : ''}>معرض</option></select></label><label class="wide">وسوم المنتدى — وسم في كل سطر<textarea id="resourceForumTags" maxlength="420" rows="5">${esc(tags)}</textarea></label></div><p class="form-note">يمكن إضافة حتى 20 وسمًا. احتفظ باسم الوسم الحالي للحفاظ على ارتباط المنشورات به؛ إعادة التسمية تُعامل كوسم جديد.</p></details>`;
}
function effectivePermission(channel, roleId, bit, overwrites = channel?.permission_overwrites || [], memberRoleIds = null) {
  const roles = state.data?.roles || [];
  if (memberRoleIds && roleId === state.data?.guild?.owner_id) return { allowed: true, source: 'مالك السيرفر يملك الوصول الكامل' };
  const selectedRoles = memberRoleIds ? [state.guild, ...memberRoleIds] : [state.guild, roleId];
  const base = roles.filter(role => role.id === state.guild || selectedRoles.includes(role.id)).reduce((value, role) => value | BigInt(role.permissions || '0'), 0n);
  if (base & 8n) return { allowed: true, source: 'Administrator يتجاوز قيود القناة' };
  let allowed = Boolean(base & bit), source = allowed ? 'صلاحيات الرتبة أو @everyone في السيرفر' : 'لم تُمنح الصلاحية في السيرفر';
  const everyone = overwrites.find(entry => String(entry.id) === String(state.guild) && Number(entry.type) === 0);
  if (everyone && ((BigInt(everyone.allow || '0') | BigInt(everyone.deny || '0')) & bit)) {
    allowed = Boolean(BigInt(everyone.allow || '0') & bit); source = 'استثناء @everyone في القناة';
  }
  const roleRows = overwrites.filter(entry => Number(entry.type) === 0 && selectedRoles.includes(String(entry.id)) && String(entry.id) !== String(state.guild));
  if (roleRows.some(row => (BigInt(row.deny || '0') & bit) !== 0n)) { allowed = false; source = 'استثناء رتبة في القناة'; }
  if (roleRows.some(row => (BigInt(row.allow || '0') & bit) !== 0n)) { allowed = true; source = 'استثناء رتبة في القناة'; }
  if (memberRoleIds) {
    const member = overwrites.find(entry => String(entry.id) === String(roleId) && Number(entry.type) === 1);
    if (member && ((BigInt(member.allow || '0') | BigInt(member.deny || '0')) & bit)) {
      allowed = Boolean(BigInt(member.allow || '0') & bit); source = 'استثناء خاص بهذا العضو';
    }
  }
  if (allowed && bit !== 1024n && !effectivePermission(channel, roleId, 1024n, overwrites, memberRoleIds).allowed) return { allowed: false, source: 'لا يمكن استخدام الصلاحية دون عرض القناة' };
  if (allowed && [4096n, 16384n, 32768n, 131072n].includes(bit) && !effectivePermission(channel, roleId, 2048n, overwrites, memberRoleIds).allowed) return { allowed: false, source: 'إرسال الرسائل ممنوع، لذا هذا الخيار غير قابل للاستخدام' };
  if (allowed && [2097152n, 512n, 256n].includes(bit) && !effectivePermission(channel, roleId, 1048576n, overwrites, memberRoleIds).allowed) return { allowed: false, source: 'الاتصال بالقناة الصوتية ممنوع' };
  return { allowed, source };
}
function permissionExplanation(channel, roleId, bit, overwrites = channel?.permission_overwrites || [], memberRoleIds = null) {
  const result = effectivePermission(channel, roleId, bit, overwrites, memberRoleIds);
  const parent = state.data?.channels.find(entry => entry.id === channel?.parent_id);
  const synced = parent && JSON.stringify(parent.permission_overwrites || []) === JSON.stringify(channel?.permission_overwrites || []);
  return `${result.allowed ? 'مسموح' : 'ممنوع'}: ${result.source}${synced ? ' · القناة متزامنة مع تصنيفها' : ''}.`;
}
function advancedEditResource(kind, id, typeOverride, nameDraft) {
  const original = (kind === 'role' ? state.data.roles : state.data.channels).find(item => item.id === id);
  const existing = state.draft.find(item => item.resource_id === id && id);
  const item = { ...original, ...existing, ...(typeOverride === undefined ? {} : { type: typeOverride }), ...(nameDraft === undefined ? {} : { name: nameDraft }) };
  const type = kind === 'category' ? 4 : kind === 'role' ? null : Number(item.type ?? 0);
  const role = kind === 'role';
  const label = { role: 'الرتبة', channel: 'القناة', category: 'التصنيف' }[kind];
  const roleFlags = BigInt(item.permissions || '0');
  const memberTargetOptions = [...new Set((item.permission_overwrites || []).filter(row => Number(row.type) === 1).map(row => String(row.id)))].map(memberId => `<option value="${esc(memberId)}" data-member="1">عضو ${esc(memberId)}</option>`).join('');
  const displayedOrder = role ? null : channelOrder(original, state.data.channels);
  const currentOrder = existing && Object.hasOwn(existing, 'position') ? Number(existing.position) + 1 : displayedOrder;
  const sections = role ? `<details open><summary>شكل الرتبة وترتيبها</summary><div class="form-grid"><label>اللون<input id="resourceColor" type="color" value="#${Number(item.color || 0x99aab5).toString(16).padStart(6,'0')}"></label><label>الترتيب<input id="resourcePosition" type="number" min="1" max="500" value="${Number(item.position || 1)}"></label><label class="check-row"><input id="resourceHoist" type="checkbox" ${item.hoist ? 'checked' : ''}>إظهار أعضاء هذه الرتبة منفصلين في قائمة الأعضاء</label><label class="check-row"><input id="resourceMentionable" type="checkbox" ${item.mentionable ? 'checked' : ''}>السماح بالإشارة إلى هذه الرتبة</label></div></details><details><summary>صلاحيات الرتبة</summary><p class="form-note">الإعدادات غير المعروضة تبقى كما هي. Administrator يمنح جميع الصلاحيات؛ امنحه فقط لرتبة تثق بها.</p>${rolePermissionGroups.map(([title, flags]) => `<fieldset class="permission-group"><legend>${title}</legend>${flags.map(([key,text,bit]) => `<label class="check-row"><input type="checkbox" data-role-permission="${key}" value="${bit}" ${(roleFlags & BigInt(bit)) !== 0n ? 'checked' : ''}>${text}</label>`).join('')}</fieldset>`).join('')}</details>` : `<details open><summary>تفاصيل ${label}</summary><div class="form-grid">${kind === 'channel' && !id ? '<label>نوع القناة<select id="resourceType"><option value="0">نصية</option><option value="2">صوتية</option><option value="15">منتدى</option></select></label>' : ''}${kind === 'channel' ? `<label>التصنيف<select id="resourceParent"><option value="">دون تصنيف</option>${state.data.channels.filter(c => c.type === 4).map(c => `<option data-i18n-preserve value="${esc(c.id)}" ${item.parent_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}<label>الترتيب<input id="resourcePosition" type="number" min="1" max="501" value="${currentOrder}"></label>${kind === 'channel' && type !== 2 ? `<label>وصف القناة<textarea id="resourceTopic" maxlength="${type === 15 ? 4096 : 1024}" rows="3">${esc(item.topic || '')}</textarea></label><label>بطء المحادثة بالثواني<input id="resourceSlowmode" type="number" min="0" max="21600" value="${Number(item.rate_limit_per_user || 0)}"></label><label class="check-row"><input id="resourceNsfw" type="checkbox" ${item.nsfw ? 'checked' : ''}>قناة للبالغين فقط (NSFW)</label>` : ''}${kind === 'channel' && type === 2 ? `<label>حد الأعضاء (0 = بلا حد)<input id="resourceUserLimit" type="number" min="0" max="99" value="${Number(item.user_limit || 0)}"></label><label>جودة الفيديو<select id="resourceVideoQuality"><option value="1" ${item.video_quality_mode !== 2 ? 'selected' : ''}>تلقائية</option><option value="2" ${item.video_quality_mode === 2 ? 'selected' : ''}>720p</option></select></label>` : ''}</div></details>${kind === 'channel' ? channelTypeSettings(item,type) : ''}<details><summary>من يرى ${label} وماذا يستطيع أن يفعل؟</summary><p class="form-note">اختر رتبة ثم حدّد السماح أو المنع أو وراثة إعدادات السيرفر. لن تتغير صلاحيات الرتب الأخرى.</p><label>الرتبة أو العضو<select id="permissionTarget">${state.data.roles.filter(r => !r.managed || r.id === state.guild).map(r => `<option value="${esc(r.id)}">${r.id === state.guild ? '@everyone' : esc(r.name)}</option>`).join('')}${memberTargetOptions}</select></label><label>إضافة عضو بالاسم<input id="memberSearch" type="search" autocomplete="off" placeholder="اكتب اسم العضو للبحث"></label><div id="memberSearchResults" role="status"></div><div class="permission-matrix">${channelPermissionChoices.map(([key,text]) => `<label>${text}<select data-channel-permission="${key}"><option value="inherit">بدون استثناء هنا</option><option value="allow">سماح</option><option value="deny">منع</option></select><small data-permission-result="${key}"></small></label>`).join('')}</div></details>`;
  modal(`${id ? 'تعديل' : 'إضافة'} ${label}`, `<form id="resourceForm" class="resource-editor"><label>اسم ${label}<input id="resourceName" required maxlength="100" value="${esc(item.name || '')}" placeholder="اكتب اسمًا واضحًا"></label>${sections}<p class="form-note">ستظهر مراجعة التغييرات مباشرة بعد المتابعة. أكّد التنفيذ لإرسالها إلى Discord.</p></form>`, '<button class="btn secondary" id="cancelEdit">إلغاء</button><button class="btn primary" type="submit" form="resourceForm">متابعة للتنفيذ</button>');
  $('#cancelEdit').onclick = closeDialog;
  if (role) {
    const permissionSection = document.querySelector('[data-role-permission]')?.closest('details');
    if (permissionSection) {
      const search = document.createElement('input'); search.type = 'search'; search.placeholder = 'ابحث عن صلاحية بالاسم'; search.setAttribute('aria-label', 'بحث في صلاحيات الرتبة');
      permissionSection.querySelector('.form-note')?.after(search);
      search.oninput = () => permissionSection.querySelectorAll('.permission-group').forEach(group => { let visible = 0; group.querySelectorAll('.check-row').forEach(row => { row.hidden = !row.textContent.toLowerCase().includes(search.value.trim().toLowerCase()); if (!row.hidden) visible++; }); group.hidden = visible === 0; });
    }
    const features = state.data.guild.features || [];
    const enhanced = features.includes('ENHANCED_ROLE_COLORS'), icons = features.includes('ROLE_ICONS');
    const appearance = document.createElement('details');
    appearance.innerHTML = `<summary>مظهر الرتبة المتقدم</summary><div class="form-grid"><label>نمط اللون<select id="resourceColorStyle"><option value="solid">لون واحد</option><option value="gradient" ${enhanced ? '' : 'disabled'}>لون متدرج</option><option value="holographic" ${enhanced ? '' : 'disabled'}>لون مجسم</option></select></label><label id="resourceSecondaryWrap">اللون الثاني<input id="resourceSecondaryColor" type="color" value="#${Number(item.colors?.secondary_color || 0x7561de).toString(16).padStart(6,'0')}"></label><label>إيموجي رمز الرتبة<input id="resourceRoleEmoji" maxlength="16" value="${esc(item.unicode_emoji || '')}" placeholder="مثال: ⭐" ${icons ? '' : 'disabled'}></label></div><p class="form-note">${enhanced ? 'الألوان المتقدمة متاحة في هذا السيرفر.' : 'التدرج يحتاج ميزة ENHANCED_ROLE_COLORS في السيرفر.'} ${icons ? 'إيموجي الرتبة متاح.' : 'رمز الرتبة يحتاج ميزة ROLE_ICONS.'}</p>`;
    permissionSection?.before(appearance);
    const iconPicker = document.createElement('div');
    iconPicker.innerHTML = `<label>رمز الرتبة<select id="resourceIconMode" ${icons ? '' : 'disabled'}><option value="keep">الإبقاء على الرمز الحالي</option><option value="emoji">إيموجي</option><option value="image">رفع صورة</option><option value="none">بدون رمز</option></select></label><label id="resourceIconUpload" hidden>صورة الرتبة (64×64 بكسل، حتى 256 كيلوبايت)<input id="resourceRoleImage" type="file" accept="image/png,image/jpeg,image/webp"></label><p class="form-note">رفع صورة الرتبة يحتاج مستوى تعزيز السيرفر الثاني (Boost Level 2) أو ميزة ROLE_ICONS. لا تُرسل الصورة إلى Discord قبل مراجعة التغييرات.</p>`;
    appearance.append(iconPicker);
    const iconMode = $('#resourceIconMode');
    iconMode.value = item.unicode_emoji ? 'emoji' : item.icon ? 'keep' : 'none';
    const emojiLabel = $('#resourceRoleEmoji').closest('label');
    iconMode.onchange = () => { emojiLabel.hidden = iconMode.value !== 'emoji'; $('#resourceIconUpload').hidden = iconMode.value !== 'image'; };
    iconMode.onchange();
    const style = $('#resourceColorStyle');
    style.value = item.colors?.tertiary_color ? 'holographic' : item.colors?.secondary_color ? 'gradient' : 'solid';
    if (!enhanced && style.value !== 'solid') { const current = document.createElement('option'); current.value = 'retain'; current.textContent = 'الإبقاء على النمط الحالي'; style.add(current); style.value = 'retain'; }
    const updateStyle = () => { $('#resourceSecondaryWrap').hidden = style.value !== 'gradient'; $('#resourceColor').closest('label').hidden = style.value === 'holographic'; };
    style.onchange = updateStyle; updateStyle();
  } else {
    const matrix = document.querySelector('.permission-matrix');
    if (matrix && matrix.children.length > 10) {
      const advanced = document.createElement('details'); advanced.innerHTML = '<summary>صلاحيات إضافية للقناة</summary><div class="permission-matrix"></div>';
      const target = advanced.querySelector('.permission-matrix');
      [...matrix.children].slice(10).forEach(row => target.append(row));
      matrix.after(advanced);
    }
  }
  if ($('#resourceType')) { $('#resourceType').value = String(type); $('#resourceType').onchange = event => advancedEditResource(kind, id, Number(event.target.value), $('#resourceName').value); }
  const rows = (item.permission_overwrites || []).map(r => ({ id: String(r.id), type: Number(r.type), allow: String(r.allow || '0'), deny: String(r.deny || '0') }));
  if (!role) {
    const presets = document.createElement('div'); presets.className = 'actions';
    presets.innerHTML = '<button type="button" class="btn secondary small" data-access-preset="chat">محادثة مفتوحة</button><button type="button" class="btn secondary small" data-access-preset="read">قراءة فقط</button><button type="button" class="btn secondary small" data-access-preset="hidden">إخفاء القناة</button>';
    $('#permissionTarget').parentElement.after(presets);
    presets.querySelectorAll('[data-access-preset]').forEach(button => { button.onclick = () => {
      const target = $('#permissionTarget').selectedOptions[0];
      let row = rows.find(entry => entry.id === target.value);
      if (!row) { row = { id: target.value, type: target.dataset.member === '1' ? 1 : 0, allow: '0', deny: '0' }; rows.push(row); }
      let allow = BigInt(row.allow), deny = BigInt(row.deny);
      for (const bit of [1024n, 2048n, 65536n]) { allow &= ~bit; deny &= ~bit; }
      if (button.dataset.accessPreset === 'chat') allow |= 1024n | 2048n | 65536n;
      else if (button.dataset.accessPreset === 'read') { allow |= 1024n | 65536n; deny |= 2048n; }
      else deny |= 1024n;
      row.allow = String(allow); row.deny = String(deny);
      showPermissions();
    }; });
  }
  if (!role && kind === 'channel') {
    const parent = state.data.channels.find(channel => channel.id === item.parent_id && channel.type === 4);
    if (parent) {
      const same = (left, right) => JSON.stringify((left || []).map(row => [String(row.id), Number(row.type), String(row.allow || '0'), String(row.deny || '0')]).sort((a,b) => a[0].localeCompare(b[0]))) === JSON.stringify((right || []).map(row => [String(row.id), Number(row.type), String(row.allow || '0'), String(row.deny || '0')]).sort((a,b) => a[0].localeCompare(b[0])));
      const note = document.createElement('div');
      note.className = 'notice info';
      note.innerHTML = `<div><b id="categorySyncState">${same(rows, parent.permission_overwrites) ? 'متزامنة مع التصنيف' : 'صلاحيات مستقلة عن التصنيف'}</b><p>تصنيف «${esc(parent.name)}» هو مصدر الصلاحيات عند المزامنة. نسخ قواعده يحل محل استثناءات القناة بعد المراجعة.</p></div><button type="button" class="btn secondary" id="syncCategoryPermissions">نسخ صلاحيات التصنيف</button>`;
      $('#permissionTarget').closest('details').prepend(note);
      $('#syncCategoryPermissions').onclick = () => {
        rows.splice(0, rows.length, ...(parent.permission_overwrites || []).map(row => ({ id: String(row.id), type: Number(row.type), allow: String(row.allow || '0'), deny: String(row.deny || '0') })));
        $('#categorySyncState').textContent = 'ستتزامن مع التصنيف بعد التنفيذ';
        showPermissions();
      };
    }
  }
  const updatePermissionExplanations = () => {
    const target = $('#permissionTarget')?.value;
    if (!target) return;
    document.querySelectorAll('[data-permission-result]').forEach(node => {
      const choice = channelPermissionChoices.find(entry => entry[0] === node.dataset.permissionResult);
      if (choice) {
        const selected = $('#permissionTarget').selectedOptions[0];
        if (selected?.dataset.member === '1' && !selected.dataset.roles) { node.textContent = 'ابحث عن العضو باسمه لتفسير صلاحياته من جميع رتبه.'; return; }
        const memberRoles = selected?.dataset.member === '1' ? JSON.parse(selected.dataset.roles || '[]') : null;
        node.textContent = permissionExplanation(item, target, BigInt(choice[2]), rows, memberRoles);
      }
    });
  };
  const showPermissions = () => { const current = rows.find(r => r.id === $('#permissionTarget').value); const allow = BigInt(current?.allow || '0'), deny = BigInt(current?.deny || '0'); document.querySelectorAll('[data-channel-permission]').forEach(select => { const bit = BigInt(channelPermissionChoices.find(c => c[0] === select.dataset.channelPermission)[2]); select.value = (allow & bit) ? 'allow' : (deny & bit) ? 'deny' : 'inherit'; }); updatePermissionExplanations(); };
  if (!role) { $('#permissionTarget').onchange = showPermissions; showPermissions(); document.querySelectorAll('[data-channel-permission]').forEach(select => { select.onchange = () => { const id = $('#permissionTarget').value; let row = rows.find(r => r.id === id); if (!row) { row = { id, type: $('#permissionTarget').selectedOptions[0]?.dataset.member === '1' ? 1 : 0, allow: '0', deny: '0' }; rows.push(row); } const bit = BigInt(channelPermissionChoices.find(c => c[0] === select.dataset.channelPermission)[2]); let allow = BigInt(row.allow), deny = BigInt(row.deny); allow &= ~bit; deny &= ~bit; if (select.value === 'allow') allow |= bit; if (select.value === 'deny') deny |= bit; row.allow = String(allow); row.deny = String(deny); updatePermissionExplanations(); }; }); }
  if (!role && $('#memberSearch')) {
    let searchTimer;
    $('#memberSearch').oninput = () => {
      clearTimeout(searchTimer);
      const query = $('#memberSearch').value.trim();
      if (query.length < 2) { $('#memberSearchResults').textContent = 'اكتب حرفين على الأقل.'; return; }
      searchTimer = setTimeout(async () => {
        try {
          const response = await fetch(`/api/workspace/${encodeURIComponent(state.guild)}/members/search?q=${encodeURIComponent(query)}`);
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'تعذر البحث عن الأعضاء.');
          if ($('#memberSearch').value.trim() !== query) return;
          $('#memberSearchResults').innerHTML = result.members.length ? result.members.map(member => `<button type="button" class="btn secondary small" data-member-result="${esc(member.id)}">${esc(member.name)} <small data-i18n-preserve>${esc(member.username)}</small></button>`).join('') : '<small>لا توجد نتائج مطابقة.</small>';
          document.querySelectorAll('[data-member-result]').forEach(button => { button.onclick = () => {
            const member = result.members.find(entry => entry.id === button.dataset.memberResult);
            let option = [...$('#permissionTarget').options].find(entry => entry.value === member.id);
            if (!option) { option = new Option(`${member.name} — عضو`, member.id); $('#permissionTarget').add(option); }
            option.dataset.member = '1'; option.dataset.roles = JSON.stringify(member.roles || []);
            $('#permissionTarget').value = member.id;
            $('#memberSearchResults').textContent = '';
            showPermissions();
          }; });
        } catch (error) { $('#memberSearchResults').textContent = error.message; }
      }, 300);
    };
  }
  $('#resourceForm').onsubmit = async event => {
    event.preventDefault(); const name = $('#resourceName').value.trim(); if (!name) return;
    const op = { resource_type: kind, action: id ? 'update' : 'create', name, ...(id ? { resource_id: id } : {}) };
    if (!role) { const requestedPosition = Number($('#resourcePosition').value) - 1; if (!id || requestedPosition + 1 !== displayedOrder) { op.position = requestedPosition; if (id) { op.position_changed = true; op.position_before_display = displayedOrder; } } if (kind === 'channel') { op.parent_id = $('#resourceParent').value || null; if (!id) op.type = Number($('#resourceType').value); if ($('#resourceTopic')) op.topic = $('#resourceTopic').value.trim(); if ($('#resourceSlowmode')) op.rate_limit_per_user = Number($('#resourceSlowmode').value); if ($('#resourceNsfw')) op.nsfw = $('#resourceNsfw').checked; if ($('#resourceUserLimit')) op.user_limit = Number($('#resourceUserLimit').value); if ($('#resourceVideoQuality')) op.video_quality_mode = Number($('#resourceVideoQuality').value); } if (rows.length) op.permission_overwrites = rows; }
    else { const requestedPosition = Number($('#resourcePosition').value); if ((!id && requestedPosition !== 1) || (id && requestedPosition !== Number(original.position ?? 1))) op.position = requestedPosition; op.color = parseInt($('#resourceColor').value.slice(1),16); op.hoist = $('#resourceHoist').checked; op.mentionable = $('#resourceMentionable').checked; let flags = BigInt(item.permissions || '0'); document.querySelectorAll('[data-role-permission]').forEach(input => { const bit = BigInt(input.value); flags = input.checked ? flags | bit : flags & ~bit; }); op.permissions = String(flags); if ((flags & 8n) && !(roleFlags & 8n)) { if (!confirm('هذه الرتبة ستحصل على Administrator والتحكم الكامل في السيرفر. هل تريد متابعتها إلى المراجعة؟')) return; op.confirm_admin = true; }
      const style = $('#resourceColorStyle')?.value;
      if (style === 'gradient') { op.colors = { primary_color: op.color, secondary_color: parseInt($('#resourceSecondaryColor').value.slice(1),16), tertiary_color: null }; delete op.color; }
      else if (style === 'holographic') { op.colors = { primary_color: 11127295, secondary_color: 16759788, tertiary_color: 16761760 }; delete op.color; }
      else if (style === 'retain') delete op.color;
      else if (original?.colors?.secondary_color || original?.colors?.tertiary_color) { op.colors = { primary_color: op.color, secondary_color: null, tertiary_color: null }; delete op.color; }
      if ($('#resourceIconMode') && !$('#resourceIconMode').disabled) {
        const mode = $('#resourceIconMode').value;
        if (mode === 'image') {
          const file = $('#resourceRoleImage').files?.[0];
          if (!file || !['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 256 * 1024) { modalError(new Error('اختر صورة PNG أو JPEG أو WebP ثابتة لا تتجاوز 256 كيلوبايت.')); return; }
          const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('تعذر قراءة الصورة.')); reader.readAsDataURL(file); }).catch(error => { modalError(error); return null; });
          if (!data) return;
          op.icon = data; op.unicode_emoji = null;
        } else if (mode === 'emoji') {
          const emoji = $('#resourceRoleEmoji').value.trim();
          if (!emoji) { modalError(new Error('اختر إيموجي واحدًا أو غيّر الخيار إلى بدون رمز.')); return; }
          if (!id || emoji !== (original.unicode_emoji || null) || original.icon) { op.unicode_emoji = emoji; op.icon = null; }
        } else if (mode === 'none' && (original?.icon || original?.unicode_emoji)) { op.icon = null; op.unicode_emoji = null; }
        else if (mode === 'keep' && existing?.icon?.startsWith('data:')) { op.icon = existing.icon; op.unicode_emoji = null; }
      }
    }
    if (!role && kind === 'channel') {
      const numberSetting = (selector, key, fallback) => { const input = $(selector); if (input && (!id || Number(input.value) !== Number(original[key] ?? fallback))) op[key] = Number(input.value); };
      numberSetting('#resourceBitrate', 'bitrate', 64000);
      numberSetting('#resourceArchive', 'default_auto_archive_duration', 1440);
      numberSetting('#resourceThreadSlowmode', 'default_thread_rate_limit_per_user', 0);
      numberSetting('#resourceForumSort', 'default_sort_order', 0);
      numberSetting('#resourceForumLayout', 'default_forum_layout', 0);
      if ($('#resourceRegion')) { const region = $('#resourceRegion').value.trim() || null; if (!id || region !== (original.rtc_region || null)) op.rtc_region = region; }
      if ($('#resourceForumTags')) {
        const names = $('#resourceForumTags').value.split('\n').map(name => name.trim()).filter(Boolean);
        const tags = names.map(name => { const previous = original.available_tags?.find(tag => tag.name === name); return { ...(previous?.id ? { id: String(previous.id) } : {}), name, moderated: previous?.moderated === true }; });
        const before = (original.available_tags || []).map(tag => ({ id: String(tag.id), name: tag.name, moderated: tag.moderated === true }));
        if (!id || JSON.stringify(tags) !== JSON.stringify(before)) op.available_tags = tags;
      }
    }
    if (existing) state.draft[state.draft.indexOf(existing)] = op; else state.draft.push(op);
    saveDraft(); closeDialog(); reviewLocal();
  };
}
function editResource(kind, id) {
  return advancedEditResource(kind, id);
  const original = (kind === 'role' ? state.data.roles : state.data.channels).find(item => item.id === id);
  const existing = state.draft.find(item => item.resource_id === id && id);
  const item = { ...original, ...existing };
  const label = { role: 'الرتبة', channel: 'القناة', category: 'التصنيف' }[kind];
  modal(`${id ? 'تعديل' : 'إضافة'} ${label}`, `<form id="resourceForm" class="form-grid"><label>الاسم<input id="resourceName" required maxlength="100" value="${esc(item.name || '')}" placeholder="اكتب اسمًا واضحًا"></label>${kind === 'channel' ? `${!id ? '<label>نوع القناة<select id="resourceType"><option value="0">قناة نصية</option><option value="2">قناة صوتية</option><option value="15">منتدى</option></select></label>' : ''}<label>التصنيف<select id="resourceParent"><option value="">دون تصنيف</option>${state.data.channels.filter(channel => channel.type === 4).map(channel => `<option data-i18n-preserve value="${esc(channel.id)}" ${item.parent_id === channel.id ? 'selected' : ''}>${esc(channel.name)}</option>`).join('')}</select></label><label>الترتيب<input id="resourcePosition" type="number" min="0" max="500" value="${Number(item.position || 0)}"></label>${(item.type ?? 0) !== 2 ? `<label>وصف القناة<textarea id="resourceTopic" maxlength="${type === 15 ? 4096 : 1024}" rows="3" placeholder="اشرح هدف القناة للأعضاء">${esc(item.topic || '')}</textarea></label>` : ''}` : ''}${kind === 'role' ? `<label>ترتيب الرتبة<input id="resourcePosition" type="number" min="1" max="500" value="${Number(item.position || 1)}"></label><label>لون الرتبة<input id="resourceColor" type="color" value="#${Number(item.color || 0x99aab5).toString(16).padStart(6, '0')}"></label>` : ''}<p class="form-note">سيُضاف هذا التعديل إلى قائمة المراجعة. لن يتغير شيء في Discord حتى تراجع وتؤكد التطبيق.</p></form>`, '<button class="btn secondary" id="cancelEdit">إلغاء</button><button class="btn primary" type="submit" form="resourceForm">متابعة للتنفيذ</button>');
  $('#cancelEdit').onclick = closeDialog;
  $('#resourceForm').onsubmit = event => {
    event.preventDefault(); const name = $('#resourceName').value.trim(); if (!name) return;
    const op = { resource_type: kind, action: id ? 'update' : 'create', name, ...(id ? { resource_id: id, before: { name: original.name } } : {}) };
    if (kind === 'channel') { op.parent_id = $('#resourceParent').value || null; if (!id) op.type = Number($('#resourceType').value); if ($('#resourceTopic')) op.topic = $('#resourceTopic').value.trim() || null; }
    if (kind === 'role') op.color = parseInt($('#resourceColor').value.slice(1), 16);
    if (existing) state.draft[state.draft.indexOf(existing)] = op; else state.draft.push(op);
    saveDraft(); closeDialog(); reviewLocal();
  };
}
async function renderTemplates() {
  state.templates ||= (await api('/api/workspace-templates')).templates;
  if (screen() !== 'builder' || state.tab !== 'templates') return;
  $('#builderContent').innerHTML = `<div class="notice info"><div><b>ابدأ بهيكل جاهز، واحتفظ بما بنيته.</b><p>القوالب تضيف العناصر الناقصة فقط. راجع أسماء القنوات والرتب قبل إنشاء الخطة.</p></div></div><div class="template-grid">${state.templates.map((template, index) => `<article class="template"><div class="template-icon">${['🎮', '🛟', '📚'][index] || '◇'}</div><h3 data-i18n-preserve>${esc(template.name)}</h3><p>${fmt(template.categories.length)} تصنيفات · ${fmt(template.operations.filter(op => op.resource_type === 'channel').length)} قنوات · ${fmt(template.roles.length)} رتب</p><button class="btn secondary" data-template="${esc(template.key)}">معاينة القالب ←</button></article>`).join('')}</div>`;
  document.querySelectorAll('[data-template]').forEach(button => { button.onclick = () => {
    const template = state.templates.find(item => item.key === button.dataset.template);
    modal(esc(template.name), `<p class="form-note">ستُعاد الاستفادة من العناصر المطابقة في التصنيف نفسه. لن تُحذف قنوات أو رتب.</p>${operationTable(template.operations)}`, `<button class="btn primary" id="createTemplate" ${!state.data.connection.readable ? 'disabled' : ''}>حفظ خطة للمراجعة</button>`);
    $('#createTemplate').onclick = async event => { event.currentTarget.disabled = true; try { const created = await api('/api/change-sets', { method: 'POST', body: JSON.stringify({ guildId: state.guild, templateKey: template.key }) }); closeDialog(); await loadGuild(); await showPlan(created.changeSet.id); } catch (error) { modalError(error); $('#createTemplate').disabled = false; } };
  }; });
}
function operationDetails(op) {
  const parts = [];
  if (Object.hasOwn(op, 'position')) parts.push(`الترتيب ${fmt(op.resource_type === 'role' ? op.position : visibleChannelPosition(op.position))}`);
  if (Object.hasOwn(op, 'rate_limit_per_user')) parts.push(`بطء المحادثة ${fmt(op.rate_limit_per_user)} ثانية`);
  if (Object.hasOwn(op, 'nsfw')) parts.push(op.nsfw ? 'للبالغين' : 'مناسبة للجميع');
  if (Object.hasOwn(op, 'user_limit')) parts.push(`حد الصوت ${fmt(op.user_limit)}`);
  if (Object.hasOwn(op, 'video_quality_mode')) parts.push(op.video_quality_mode === 2 ? 'فيديو 720p' : 'فيديو تلقائي');
  if (Object.hasOwn(op, 'hoist')) parts.push(op.hoist ? 'إظهار الرتبة منفصلة' : 'إخفاء فصل الرتبة');
  if (Object.hasOwn(op, 'mentionable')) parts.push(op.mentionable ? 'يمكن الإشارة للرتبة' : 'منع الإشارة للرتبة');
  if (Object.hasOwn(op, 'permissions')) parts.push(`صلاحيات الرتبة: ${fmt(BigInt(op.permissions).toString(2).replace(/0/g,'').length)} مفعّلة${(BigInt(op.permissions) & 8n) ? ' · Administrator' : ''}`);
  if (Object.hasOwn(op, 'permission_overwrites')) parts.push(`قواعد وصول ${fmt(op.permission_overwrites.length)} رتب وأعضاء`);
  return parts.length ? ` · ${esc(parts.join(' · '))}` : '';
}
function operationTable(operations, removable = false) {
  const names = new Map(operations.map(op => [op.operation_key, op.name]));
  const labels = { name: 'الاسم', parent_id: 'التصنيف', topic: 'الوصف', position: 'الترتيب', color: 'اللون', colors: 'نمط الألوان', icon: 'رمز الرتبة', unicode_emoji: 'إيموجي الرتبة', hoist: 'إظهار الرتبة منفصلة', mentionable: 'إمكانية الإشارة', rate_limit_per_user: 'بطء المحادثة', default_thread_rate_limit_per_user: 'بطء السلاسل', default_auto_archive_duration: 'أرشفة السلاسل', bitrate: 'جودة الصوت', user_limit: 'حد الأعضاء', rtc_region: 'منطقة الصوت', nsfw: 'قناة للبالغين', video_quality_mode: 'جودة الفيديو', default_sort_order: 'ترتيب المنتدى', default_forum_layout: 'عرض المنتدى', available_tags: 'وسوم المنتدى' };
  const beforeAfter = op => {
    if (op.action !== 'update') return '';
    const original = (op.resource_type === 'role' ? state.data.roles : state.data.channels)?.find(row => row.id === op.resource_id);
    const old = { ...(original || {}), ...(op.before || {}) };
    const changes = Object.entries(labels).filter(([key]) => Object.hasOwn(op, key) && (key !== 'position' || op.position_changed) && String(old[key] ?? '') !== String(op[key] ?? ''));
    const display = (key, value, previous = false) => key === 'parent_id' ? state.data.channels?.find(c => c.id === value)?.name || 'دون تصنيف' : key === 'position' && op.resource_type !== 'role' ? String(previous ? op.position_before_display ?? channelOrder(original, state.data.channels) : Number(value ?? 0) + 1) : key === 'color' ? `#${Number(value || 0).toString(16).padStart(6, '0')}` : key === 'icon' ? value ? 'صورة الرتبة' : 'بدون صورة' : key === 'colors' ? 'ألوان الرتبة' : key === 'available_tags' ? `${(value || []).length} وسوم` : typeof value === 'boolean' ? value ? 'مفعّل' : 'معطّل' : String(value ?? 'غير محدد');
    const permissionChanges = [];
    if (Object.hasOwn(op, 'permission_overwrites')) {
      const prior = new Map((old.permission_overwrites || []).map(row => [String(row.id), row]));
      const next = new Map(op.permission_overwrites.map(row => [String(row.id), row]));
      const stateOf = (row, bit) => (BigInt(row?.allow || '0') & bit) ? 'سماح' : (BigInt(row?.deny || '0') & bit) ? 'منع' : 'وراثة';
      for (const id of new Set([...prior.keys(), ...next.keys()])) for (const [, label, flag] of channelPermissionChoices) {
        const bit = BigInt(flag), before = stateOf(prior.get(id), bit), after = stateOf(next.get(id), bit);
        if (before !== after) permissionChanges.push({ label: `${state.data.roles?.find(role => role.id === id)?.name || `العضو ${id}`} · ${label}`, before, after });
      }
    }
    if (Object.hasOwn(op, 'permissions')) for (const [, label, flag] of rolePermissionGroups.flatMap(([, flags]) => flags)) {
      const bit = BigInt(flag), before = (BigInt(old.permissions || '0') & bit) ? 'مفعّلة' : 'غير مفعّلة', after = (BigInt(op.permissions) & bit) ? 'مفعّلة' : 'غير مفعّلة';
      if (before !== after) permissionChanges.push({ label, before, after });
    }
    const allChanges = [...changes.map(([key,label]) => ({ label, before: display(key, old[key], true), after: display(key, op[key]) })), ...permissionChanges];
    return allChanges.length ? `<ul class="change-diff">${allChanges.map(change => `<li>${esc(change.label)}: <span class="before">${esc(change.before)}</span> ← <span class="after">${esc(change.after)}</span></li>`).join('')}</ul>` : '';
  };
  return `<div class="table-wrap"><table><thead><tr><th>الإجراء</th><th>العنصر والتغيير</th>${removable ? '<th>إزالة</th>' : ''}</tr></thead><tbody>${operations.map((op, index) => `<tr><td>${badge(op.action === 'update' ? 'تعديل' : 'إضافة / مطابقة', op.action === 'update' ? 'warn' : 'purple')}</td><td><b data-i18n-preserve>${esc(op.name)}</b><small>${{ channel: op.type === 2 ? 'قناة صوتية' : op.type === 15 ? 'منتدى' : 'قناة', category: 'تصنيف', role: 'رتبة' }[op.resource_type] || ''}${op.before?.name && op.before.name !== op.name ? ` · <span class="before" data-i18n-preserve>${esc(op.before.name)}</span> ← <span class="after" data-i18n-preserve>${esc(op.name)}</span>` : ''}${op.parent_key ? ` · التصنيف: ${esc(names.get(op.parent_key) || op.parent_name || '')}` : Object.hasOwn(op, 'parent_id') ? ` · التصنيف: ${esc(state.data.channels?.find(c => c.id === op.parent_id)?.name || 'دون تصنيف')}` : ''}${Object.hasOwn(op, 'color') ? ` · اللون: #${Number(op.color).toString(16).padStart(6, '0')}` : ''}${op.access === 'read_only' ? ' · للقراءة فقط' : op.access === 'staff_only' ? ` · خاصة برتبة ${esc(state.data.roles?.find(role => role.id === op.staff_role_id)?.name || 'فريق محدد')}` : ''}${operationDetails(op)}</small>${beforeAfter(op)}</td>${removable ? `<td><button class="btn text" data-remove="${index}" aria-label="إزالة ${esc(op.name)} من قائمة المراجعة">×</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}
function draftWarnings(operations) {
  const warnings = [];
  const view = 1024n, send = 2048n;
  for (const op of operations) {
    if (op.resource_type === 'role' && Object.hasOwn(op, 'permissions') && (BigInt(op.permissions) & 8n)) warnings.push(`الرتبة «${op.name}» تملك Administrator؛ ستتجاوز معظم قيود القنوات.`);
    if (!['channel', 'category'].includes(op.resource_type)) continue;
    for (const row of op.permission_overwrites || []) {
      const allow = BigInt(row.allow || '0'), deny = BigInt(row.deny || '0');
      const target = row.id === state.guild ? '@everyone' : state.data.roles?.find(role => role.id === row.id)?.name || `العضو ${row.id}`;
      if ((deny & view) && (allow & send)) warnings.push(`في «${op.name}»: ${target} يمكنه الإرسال بحسب الاستثناء لكنه ممنوع من رؤية القناة؛ راجع قاعدة الوصول.`);
      if (row.id === state.guild && (deny & view)) warnings.push(`القناة «${op.name}» مخفية عن جميع الأعضاء ما لم تسمح لهم رتبة أو استثناء آخر برؤيتها.`);
    }
    const original = state.data.channels?.find(channel => channel.id === op.resource_id);
    if (original?.parent_id && Object.hasOwn(op, 'permission_overwrites')) {
      const parent = state.data.channels.find(channel => channel.id === original.parent_id);
      const normalized = rows => JSON.stringify((rows || []).map(row => [String(row.id), Number(row.type), String(row.allow || '0'), String(row.deny || '0')]).sort((a,b) => a[0].localeCompare(b[0])));
      if (parent && normalized(original.permission_overwrites) === normalized(parent.permission_overwrites) && normalized(op.permission_overwrites) !== normalized(parent.permission_overwrites)) warnings.push(`«${op.name}» متزامنة الآن مع التصنيف؛ هذه التغييرات ستجعل صلاحياتها مستقلة عنه.`);
    }
  }
  return warnings;
}
function draftExecutionBlocked() {
  const signature = JSON.stringify(state.draft);
  const inPage = state.blockedDraftGuild === state.guild && state.blockedDraft === signature;
  try { return localStorage.getItem(draftKey() + ':blocked') === signature || inPage; } catch { return inPage; }
}
function blockDraftExecution(operations) {
  state.blockedDraftGuild = state.guild;
  state.blockedDraft = JSON.stringify(operations);
  try { localStorage.setItem(draftKey() + ':blocked', state.blockedDraft); } catch { /* keep the in-page lock */ }
}
async function verifyExecutionFix(guildId) {
  if (state.guild !== guildId || state.applyingDraft) return;
  await loadGuild();
  if (state.guild !== guildId || !state.data?.connection.readable) return;
  state.blockedDraft = '';
  try { localStorage.removeItem(draftKey() + ':blocked'); } catch { /* no persistent storage */ }
  $('#executionError')?.remove();
  toast('تم تحديث حالة السيرفر. راجع تعديلاتك؛ سيُفحص الرصيد والصلاحيات وترتيب الرتب مجددًا قبل التنفيذ.');
}
function showExecutionError(error, guildId, planId = '') {
  if (state.guild !== guildId) return;
  $('#executionError')?.remove();
  const notice = document.createElement('div');
  notice.id = 'executionError';
  notice.className = 'dialog-error';
  notice.setAttribute('role', 'alert');
  notice.dataset.guild = guildId;
  const solution = error.status === 402 ? 'خفّض عدد التعديلات أو راجع رصيد باقتك، ثم أعد المراجعة.'
    : error.status === 401 ? 'أعد تسجيل الدخول، ثم راجع حالة التنفيذ قبل المحاولة.'
    : error.status === 403 ? 'تحقق من صلاحيات حسابك والبوت، ومن وضع رتبة البوت فوق الرتبة المستهدفة.'
    : planId ? 'راجع حالة التنفيذ وما اكتمل في السجل قبل إنشاء تعديل جديد؛ لا تكرر الطلب إذا كان ما زال يعمل.'
    : 'تعديلاتك محفوظة على هذا الجهاز. راجع الإعدادات والاتصال ثم أعد المراجعة.';
  notice.innerHTML = '<b>تعذر إكمال التغييرات</b><p>' + esc(readableChangeError(error.message)) + '</p><p>' + esc(solution) + '</p>' + (planId ? '<button class="btn secondary" id="inspectExecution">عرض حالة التنفيذ</button>' : '<button class="btn secondary" id="verifyExecution">تحقق بعد إصلاح المشكلة</button>');
  $('#workspace').before(notice);
  $('#verifyExecution')?.addEventListener('click', run(() => verifyExecutionFix(guildId)));
  $('#inspectExecution')?.addEventListener('click', run(() => showPlan(planId)));
  notice.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}
function reviewLocal() {
  if (!state.draft.length || !state.data || state.applyingDraft) return;
  const guildId = state.guild;
  const units = state.draft.reduce((total, op) => total + draftChangeUnits(op), 0);
  const warnings = draftWarnings(state.draft);
  const blocked = draftExecutionBlocked();
  if (blocked) warnings.unshift('توقف التنفيذ بعد خطأ سابق. أصلح السبب ثم اضغط «تحقق بعد إصلاح المشكلة» في التنبيه أعلى الصفحة، أو عدّل التغييرات.');
  const summary = '<div class="notice info"><div><b>السيرفر المستهدف: ' + esc(state.data.guild.name) + '</b><p>الاستهلاك المتوقع: ' + fmt(units) + ' تغييرات في ' + fmt(state.draft.length) + ' عناصر. لا يُستهلك رصيد عند المراجعة أو التأجيل؛ يُحسب فقط ما يُنفذ فعلًا، ولا تُحسب الإعدادات غير المتغيرة.</p></div></div>';
  const attention = warnings.length ? '<div class="notice warn"><div><b>نقاط تحتاج انتباهك قبل التنفيذ</b>' + warnings.map(message => '<p>' + esc(message) + '</p>').join('') + '</div></div>' : '';
  modal('مراجعة التغييرات وتطبيقها', summary + (!units ? '<p class="form-note">لم يتغير أي إعداد. أزل العناصر غير المعدلة أو غيّر أحد خياراتها.</p>' : '') + attention + operationTable(state.draft, true) + '<p class="form-note">بالضغط على «نعم، أكد التنفيذ» توافق على تطبيق التغييرات المعروضة على هذا السيرفر.</p>', '<button class="btn secondary" id="laterPlan">لاحقًا</button><button class="btn secondary" id="cancelDraft">إلغاء التغييرات</button><button class="btn primary" id="applyPlan" ' + (units && state.data.connection.readable && !blocked ? '' : 'disabled') + '>نعم، أكد التنفيذ</button>');
  document.querySelectorAll('[data-remove]').forEach(button => { button.onclick = () => { state.draft.splice(Number(button.dataset.remove), 1); saveDraft(); if (state.draft.length) reviewLocal(); else closeDialog(); }; });
  if (blocked) {
    const verify = document.createElement('button');
    verify.className = 'btn secondary'; verify.id = 'verifyReview'; verify.textContent = 'تحقق بعد إصلاح المشكلة';
    $('#dialogContent .dialog-foot').prepend(verify);
    verify.onclick = run(async () => { closeDialog(); await verifyExecutionFix(guildId); });
  }
  $('#laterPlan').onclick = closeDialog;
  $('#cancelDraft').onclick = () => { state.draft = []; saveDraft(); closeDialog(); };
  $('#applyPlan').onclick = async () => {
    if (state.applyingDraft || state.guild !== guildId || draftExecutionBlocked()) return;
    state.applyingDraft = true;
    const operations = JSON.parse(JSON.stringify(state.draft));
    let planId = '';
    let applied = false;
    $('#executionError')?.remove();
    $('#applyPlan').disabled = true;
    $('#applyPlan').textContent = 'جارٍ التطبيق…';
    $('#closeDialog').disabled = true;
    $('#laterPlan').disabled = true;
    $('#cancelDraft').disabled = true;
    document.querySelectorAll('[data-remove]').forEach(button => { button.disabled = true; });
    try {
      const execute = async () => {
        const created = await api('/api/change-sets', { method: 'POST', body: JSON.stringify({ guildId, operations }) });
        planId = created.changeSet.id;
        if (state.guild !== guildId) throw Error('تغيّر السيرفر المختار. الخطة محفوظة في سجل السيرفر الأصلي ولم نطبقها.');
        state.draft = [];
        saveDraft();
        await api('/api/change-sets/' + encodeURIComponent(planId) + '/apply', { method: 'POST', body: JSON.stringify({ confirmed: true, guildId }) });
        applied = true;
      };
      if (navigator.locks?.request) {
        await navigator.locks.request('diskoko:changes:' + state.account.user.id + ':' + guildId, { ifAvailable: true }, async lock => {
          if (!lock) throw Error('هناك تنفيذ من نافذة أخرى لهذا السيرفر. انتظر نتيجته وراجع السجل قبل المحاولة.');
          await execute();
        });
      } else await execute();
    } catch (error) {
      if (state.guild === guildId) blockDraftExecution(operations);
      closeDialog();
      if (planId && state.guild === guildId) await loadGuild();
      showExecutionError(error, guildId, planId);
    } finally {
      state.applyingDraft = false;
      closeDialog();
    }
    if (applied && state.guild === guildId) {
      await loadGuild();
      toast('اكتملت التغييرات على سيرفرك. الاستهلاك الفعلي والتفاصيل في سجل التغييرات.');
    }
  };
}
async function showPlan(id, returnToWorkspace = false) {
  const expectedGuild = state.guild;
  const data = await api(`/api/change-sets/${encodeURIComponent(id)}`);
  if (state.guild !== expectedGuild || data.changeSet.guild_id !== state.guild) throw Error('هذه الخطة تخص سيرفرًا آخر.');
  const done = data.operations.filter(op => op.status === 'succeeded').length;
  const complete = data.changeSet.status === 'succeeded';
  const cancelled = data.changeSet.status === 'cancelled';
  const failed = data.changeSet.status === 'failed';
  const charged = data.operations.reduce((n, op) => n + Number(op.result?.usage_units || 0), 0);
  const completedKeys = new Set(data.operations.filter(op => op.status === 'succeeded').map(op => op.operation_key));
  const remaining = Math.max(0, data.changeSet.plan.operations.reduce((n, op) => n + draftChangeUnits(op), 0) - charged);
  modal('مراجعة التغييرات', `<div class="notice info"><div><b data-i18n-preserve>${esc(state.data.guild.name)}</b><p>${fmt(done)} من ${fmt(data.operations.length)} عناصر مكتملة · استُهلك ${fmt(charged)} تغييرات منفذة فعليًا · ${fmt(remaining)} غير منفذة ولا تُحسب من رصيدك.${cancelled ? ' أُوقف باقي التنفيذ وبقي السجل للمراجعة.' : complete ? ' اكتمل التطبيق.' : failed ? ' توقفت الخطة: راجع السبب، أصلح الإعداد أو صلاحية البوت، ثم أنشئ مراجعة جديدة. لن نكرر الطلب نفسه.' : ' يمكن تنفيذ الباقي أو إيقافه.'}</p></div>${status(data.changeSet.status)}</div>${operationTable(data.changeSet.plan.operations)}<div class="rows">${data.operations.map(op => `<div class="row"><div class="row-main"><b data-i18n-preserve>${esc(data.changeSet.plan.operations.find(item => item.operation_key === op.operation_key)?.name || op.operation_key)}</b>${op.result?.error ? `<small>${esc(readableChangeError(op.result.error))}</small>` : ''}</div>${status(op.status)}</div>`).join('')}</div>${!complete && !cancelled && !failed && !returnToWorkspace ? '<label class="check-row"><input type="checkbox" id="confirmApply">راجعت التغييرات وأوافق على تطبيقها على هذا السيرفر.</label>' : ''}`, complete || cancelled || failed ? '<button class="btn primary" id="donePlan">تم</button>' : `<button class="btn secondary" id="laterPlan">لاحقًا</button><button class="btn secondary" id="cancelPlan">إيقاف المتبقي</button><button class="btn primary" id="applyPlan" ${returnToWorkspace && state.data.connection.readable ? '' : 'disabled'}>نعم، أؤكد التنفيذ</button>`);
  if (complete || cancelled || failed) { $('#donePlan').onclick = closeDialog; return; }
  $('#laterPlan').onclick = closeDialog;
  $('#cancelPlan').onclick = () => confirmDialog('إيقاف بقية الخطة؟', done ? 'سيبقى ما نُفذ فعليًا في Discord وفي سجل التغييرات. سيتوقف الباقي ولن يُحسب من رصيدك، ويمكنك بدء خطة جديدة.' : 'ستتوقف الخطة دون تنفيذ أو استهلاك رصيد، وسيبقى سجلها للمراجعة. يمكنك بدء خطة جديدة.', 'إيقاف المتبقي', async () => { await api(`/api/change-sets/${encodeURIComponent(id)}/cancel`, { method: 'POST' }); closeDialog(); await loadGuild(); await showPlan(id); });
  if (!returnToWorkspace) $('#confirmApply').onchange = event => { $('#applyPlan').disabled = !event.target.checked || !state.data.connection.readable; };
  $('#applyPlan').onclick = async event => {
    event.currentTarget.disabled = true; event.currentTarget.textContent = 'جارٍ التطبيق…'; $('#closeDialog').disabled = true; $('#laterPlan').disabled = true;
    try { await api(`/api/change-sets/${encodeURIComponent(id)}/apply`, { method: 'POST', body: JSON.stringify({ confirmed: true, guildId: state.guild }) }); closeDialog(); await loadGuild(); if (!returnToWorkspace) await showPlan(id); toast('اكتملت التغييرات على سيرفرك وسُجلت في سجل التغييرات.'); }
    catch (error) { closeDialog(); await loadGuild(); await showPlan(id, returnToWorkspace); modalError(error); }
  };
}

const botWorkshopDesigns = [
  { icon: '♫', title: 'استديو الموسيقى', tag: 'بوت صوتي + لوحة تفاعلية', description: 'صمّم لوحة بهوية سيرفرك. يضع العضو الرابط والروم في الأمر نفسه، ثم يدخله البوت ويبدأ الصوت. التحكم بالطابور والصوت يبقى في اللوحة.', actions: 'اختيار الروم · تشغيل · إيقاف · التالي · مستوى الصوت' },
  { icon: '🎬', title: 'نادي الأفلام', tag: 'كتالوج + لوحة تفاعلية', description: 'نظّم أفلام مجتمعك ومسلسلاته، وشارك روابط مشاهدة خارجية، واستقبل اقتراحات الأعضاء بعد مراجعتها.', actions: 'كتالوج · معاينة · روابط مشاهدة · اقتراحات' },
  { icon: '▶', title: 'لوحة يوتيوب', tag: 'قالب تفاعلي', description: 'صمّم لوحة بهوية سيرفرك، ثم يضيف الأعضاء روابط الفيديو من داخل Discord. يظهر زر المشاهدة بعد اختيار الفيديو.', actions: 'تصميم اللوحة · إضافة فيديو · مشاهدة' },
  { icon: '✧', title: 'واجهة المجتمع', tag: 'هوية + أزرار تفاعلية', description: 'صمّم واجهة لسيرفرك ببنر وشعار وثيم مستقل عن ألوان الأزرار. رتّب الروابط والقنوات والردود والإيموجيات لكل بوت.', actions: 'روابط · قنوات · ردود · إيموجيات · معاينة' },
  { icon: '✦', title: 'لوحة الألعاب', tag: 'قيد التجهيز', description: 'معاينة قائمة الألعاب داخل اللوحة. اختيار اللعبة معلق حاليًا ولا يفتح لعبة أو ينفذ أمرًا.', actions: 'أسئلة سريعة · حجر ورقة مقص · تخمين رقم · تحدي معلومات' },
];

async function openCommunityPanelDesigner(available, selectedId = available.find(item => item.selected)?.id || available[0]?.id, editName = '') {
  if (!selectedId) return toast('اختر بوتًا متصلًا بهذا السيرفر.');
  const guildId = state.guild;
  const [list, emojiResult] = await Promise.all([
    api(`/api/ai/bots/${encodeURIComponent(selectedId)}/commands?guildId=${encodeURIComponent(guildId)}`),
    api(`/api/ai/bots/${encodeURIComponent(selectedId)}/emojis?guildId=${encodeURIComponent(guildId)}`).catch(() => ({ emojis: [] })),
  ]);
  const existing = (list.commands || []).find(item => item.name === editName && item.response_kind === 'community_panel');
  const config = existing?.panel_config || {};
  const channels = (state.data?.channels || []).filter(channel => [0, 5].includes(channel.type));
  const emojis = (emojiResult.emojis || []).filter(item => item.available);
  const buttons = (config.buttons?.length ? config.buttons : [
    { label: 'الإعلانات', emoji: '📢', kind: 'channel', target: channels[0]?.id || '', style: 5 },
    { label: 'الفعاليات', emoji: '📅', kind: 'text', target: 'ترقبوا فعالياتنا القادمة!', style: 1 },
  ]).map(item => ({ ...item }));
  modal('تصميم واجهة المجتمع', `<div class="community-editor" dir="rtl"><p class="form-note">لوحة لروابط مجتمعك وقنواته وردوده السريعة. يختار كل سيرفر وبوت تصميمه وأمره الخاص.</p><form id="communityForm" class="form-grid"><div class="form-grid two"><label>البوت المنفذ<select id="communityBot">${available.map(item => `<option data-i18n-preserve value="${esc(item.id)}" ${item.id === selectedId ? 'selected' : ''}>${esc(item.label)}</option>`).join('')}</select></label><label>اسم الأمر بعد /<input id="communityCommand" maxlength="32" required ${existing ? 'readonly' : ''} value="${esc(existing?.name || 'مجتمع')}"></label></div><div class="form-grid two"><label>اسم المجتمع<input id="communityTitle" maxlength="60" required value="${esc(config.title || 'بوابة المجتمع')}"></label><label>لون إطار البطاقة والثيم<input id="communityColor" type="color" value="${esc(config.color || '#a479ff')}"></label></div><label>الوصف<textarea id="communityDescription" maxlength="180" rows="2">${esc(config.description || 'اكتشف أقسام مجتمعنا من مكان واحد.')}</textarea></label><div class="form-grid two"><label>صورة البنر من مرفقات Discord<input id="communityBanner" type="url" placeholder="https://cdn.discordapp.com/..." value="${esc(config.bannerUrl || '')}"></label><label>شعار السيرفر من مرفقات Discord<input id="communityLogo" type="url" placeholder="https://cdn.discordapp.com/..." value="${esc(config.logoUrl || '')}"></label></div><label>لون المربعات داخل البطاقة<input id="communityTile" type="color" value="${esc(config.tileColor || '#a479ff')}"></label><div class="section-title"><h3>الأزرار أسفل البطاقة</h3><button class="btn secondary small" id="communityAdd" type="button">＋ إضافة زر</button></div><p class="form-note">لكل زر اسم وإيموجي ووظيفة. ألوان أزرار Discord هي الأزرق والرمادي والأخضر والأحمر؛ روابط القنوات والمواقع تظهر بلون الرابط الذي يحدده Discord.</p><div id="communityButtonRows"></div><div class="community-preview" id="communityPreview"><div class="community-preview-card"><div class="community-preview-top"><span>COMMUNITY / DISKOKO</span><span id="communityPreviewLogo">◆</span></div><div class="community-preview-copy"><b id="communityPreviewTitle"></b><p id="communityPreviewDescription"></p></div><div class="community-preview-tiles" id="communityPreviewTiles"></div></div><div class="community-preview-actions" id="communityPreviewActions"></div></div><p class="form-note">المعاينة قريبة من Discord. صورة البطاقة ستُرسل كملف، والأزرار الحقيقية تظهر تحتها. إذا لم تُفتح صورة Discord للعامة ستظهر البطاقة من دونها.</p></form></div>`, `<button class="btn secondary" id="communityCancel" type="button">إلغاء</button><button class="btn primary" id="communitySave" type="submit" form="communityForm">${existing ? 'حفظ التعديلات' : 'إنشاء اللوحة والأمر'}</button>`);
  $('#dialog')?.classList.add('community-modal');
  $('#communityCancel').onclick = closeDialog;
  $('#communityBot').onchange = () => openCommunityPanelDesigner(available, $('#communityBot').value);
  const styleOptions = [[1, 'أزرق'], [2, 'رمادي'], [3, 'أخضر'], [4, 'أحمر']];
  const render = () => {
    $('#communityButtonRows').innerHTML = buttons.map((button, index) => `<div class="community-button-row" data-index="${index}"><div class="community-button-heading"><strong>زر ${index + 1}</strong><div><button type="button" data-move="up" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-move="down" ${index === buttons.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-remove ${buttons.length === 1 ? 'disabled' : ''}>×</button></div></div><div class="form-grid two"><label>اسم الزر<input data-field="label" maxlength="80" required value="${esc(button.label || '')}"></label><label>وظيفة الزر<select data-field="kind"><option value="text" ${button.kind === 'text' ? 'selected' : ''}>رد داخل Discord</option><option value="channel" ${button.kind === 'channel' ? 'selected' : ''}>فتح قناة</option><option value="link" ${button.kind === 'link' ? 'selected' : ''}>فتح رابط خارجي</option></select></label></div><div class="form-grid two"><label>إيموجي عادي أو كود سيرفر<input data-field="emoji" maxlength="80" value="${esc(button.emoji || '')}" placeholder="📢 أو <:name:id>"></label><label>إيموجيات هذا السيرفر<select data-emoji-picker><option value="">اختر من إيموجيات السيرفر</option>${emojis.map(emoji => `<option value="${esc(`<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`)}">${esc(emoji.name)}</option>`).join('')}</select></label></div><div class="form-grid two"><label>لون زر Discord<select data-field="style" ${button.kind !== 'text' ? 'disabled' : ''}>${styleOptions.map(([value, label]) => `<option value="${value}" ${Number(button.style) === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>${button.kind === 'channel' ? 'القناة' : button.kind === 'link' ? 'رابط HTTPS' : 'النص الذي يراه العضو'}${button.kind === 'channel' ? `<select data-field="target"><option value="">اختر قناة</option>${channels.map(channel => `<option value="${esc(channel.id)}" ${button.target === channel.id ? 'selected' : ''}># ${esc(channel.name)}</option>`).join('')}</select>` : `<input data-field="target" maxlength="${button.kind === 'link' ? 512 : 500}" required value="${esc(button.target || '')}" placeholder="${button.kind === 'link' ? 'https://...' : 'اكتب الرد'}">`}</label></div></div>`).join('');
    $('#communityButtonRows').querySelectorAll('[data-index]').forEach(row => {
      const index = Number(row.dataset.index);
      row.querySelectorAll('[data-field]').forEach(field => field.addEventListener(field.tagName === 'SELECT' ? 'change' : 'input', () => { buttons[index][field.dataset.field] = field.value; if (field.dataset.field === 'kind') { buttons[index].target = ''; render(); } else preview(); }));
      row.querySelector('[data-emoji-picker]').onchange = event => { if (event.target.value) { buttons[index].emoji = event.target.value; row.querySelector('[data-field="emoji"]').value = event.target.value; preview(); } };
      row.querySelector('[data-remove]').onclick = () => { buttons.splice(index, 1); render(); };
      row.querySelectorAll('[data-move]').forEach(control => control.onclick = () => { const next = index + (control.dataset.move === 'up' ? -1 : 1); [buttons[index], buttons[next]] = [buttons[next], buttons[index]]; render(); });
    });
    preview();
  };
  const preview = () => {
    const card = $('#communityPreview .community-preview-card');
    card.style.setProperty('--community-accent', $('#communityColor').value);
    card.style.setProperty('--community-tile', $('#communityTile').value);
    const banner = $('#communityBanner').value.trim();
    card.style.backgroundImage = /^https:\/\/cdn\.discordapp\.com\//i.test(banner) || /^https:\/\/media\.discordapp\.net\//i.test(banner) ? `linear-gradient(#160f28a8,#160f28e5),url("${banner.replace(/["\\]/g, '')}")` : '';
    const logo = $('#communityLogo').value.trim();
    $('#communityPreviewLogo').innerHTML = /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\//i.test(logo) ? `<img src="${esc(logo)}" alt="شعار السيرفر">` : '◆';
    $('#communityPreviewTitle').textContent = $('#communityTitle').value || 'بوابة المجتمع';
    $('#communityPreviewDescription').textContent = $('#communityDescription').value;
    $('#communityPreviewTiles').innerHTML = buttons.map(item => `<span>${esc(item.label)}</span>`).join('');
    $('#communityPreviewActions').innerHTML = buttons.map(item => `<span class="community-native-button style-${item.kind === 'text' ? Number(item.style) || 2 : 5}">${esc(item.emoji)} ${esc(item.label)}</span>`).join('');
  };
  $('#communityAdd').onclick = () => { if (buttons.length >= 10) return toast('الحد الأقصى 10 أزرار.'); buttons.push({ label: '', emoji: '', kind: 'text', target: '', style: 2 }); render(); };
  $('#communityForm').addEventListener('input', preview);
  render();
  $('#communityForm').onsubmit = run(async event => {
    event.preventDefault();
    const save = $('#communitySave'); save.disabled = true;
    try {
      const panelConfig = { title: $('#communityTitle').value, description: $('#communityDescription').value, color: $('#communityColor').value, tileColor: $('#communityTile').value, bannerUrl: $('#communityBanner').value.trim(), logoUrl: $('#communityLogo').value.trim(), buttons };
      const name = $('#communityCommand').value.trim();
      const path = `/api/ai/bots/${encodeURIComponent(selectedId)}/commands${existing ? `/${encodeURIComponent(existing.name)}` : ''}`;
      await api(path, { method: existing ? 'PATCH' : 'POST', body: JSON.stringify({ guildId, name, description: 'افتح واجهة المجتمع التفاعلية', responseKind: 'community_panel', panelConfig }) });
      closeDialog(); toast(existing ? 'حُفظ التصميم. افتح الأمر من جديد لرؤية التغييرات.' : 'أُنشئت واجهة المجتمع. جرّب الأمر في Discord.'); await bots();
    } catch (error) { modalError(error); save.disabled = false; }
  });
}


async function openMovieClubDesigner(available, selectedId = available[0]?.id) {
  if (!selectedId) return toast('اربط بوتًا متصلًا بهذا السيرفر أولًا.');
  const guildId = state.guild;
  const path = `/api/movie-clubs/${encodeURIComponent(guildId)}/${encodeURIComponent(selectedId)}`;
  let data;
  try { data = await api(path); } catch (error) { return toast(error.message); }
  const club = data.club || {}, items = data.items || [], suggestions = data.suggestions || [];
  const channels = (state.data?.channels || []).filter(channel => [0, 5].includes(channel.type));
  const channelOptions = value => `<option value="">اختر قناة نصية</option>${channels.map(channel => `<option value="${esc(channel.id)}" ${channel.id === value ? 'selected' : ''}># ${esc(channel.name)}</option>`).join('')}`;
  const publicCount = items.filter(item => item.status === 'published').length;
  modal('تصميم نادي الأفلام', `<div class="movie-club-designer" dir="rtl"><p class="notice info">هذه اللوحة تعرض معلومات وروابط مشاهدة خارج Discord. كل عضو يشاهد بحسابه الخاص؛ البوت لا يبث Netflix أو أي فيلم داخل السيرفر.</p><form id="movieClubForm" class="form-grid"><label>البوت الذي يعرض النادي<select id="movieClubBot">${available.map(item => `<option data-i18n-preserve value="${esc(item.id)}" ${item.id === selectedId ? 'selected' : ''}>${esc(item.label)}</option>`).join('')}</select></label><label>قناة اللوحة<select id="movieClubChannel" required>${channelOptions(club.channel_id)}</select></label><label>قناة مراجعة الاقتراحات (اختياري)<select id="movieClubReview">${channelOptions(club.review_channel_id)}</select></label><label>اسم أمر Discord بعد /<input id="movieClubCommand" maxlength="32" required value="${esc(club.command_name || 'نادي')}"></label><label>اسم النادي<input id="movieClubTitle" maxlength="100" required value="${esc(club.title || 'نادي الأفلام')}"></label><label>وصف قصير<textarea id="movieClubDescription" maxlength="500" rows="2">${esc(club.description || 'مساحة لمحبي الأفلام والمسلسلات.')}</textarea></label><label>رسالة الترحيب في اللوحة<input id="movieClubWelcome" maxlength="500" value="${esc(club.welcome || 'أهلًا بك في نادي الأفلام!')}"></label><label>صورة رئيسية تملك حق استخدامها (HTTPS)<input id="movieClubBanner" type="url" value="${esc(club.banner_url || '')}" placeholder="https://..."></label><label>لون الهوية<input id="movieClubColor" type="color" value="${esc(club.color || '#8659e6')}"></label><div class="movie-club-labels"><label>زر التفاصيل<input id="movieClubDetailsLabel" maxlength="80" value="${esc(club.labels?.details || 'التفاصيل')}"></label><label>زر البحث<input id="movieClubSearchLabel" maxlength="80" value="${esc(club.labels?.search || 'ابحث عن عمل')}"></label><label>زر الاقتراح<input id="movieClubSuggestLabel" maxlength="80" value="${esc(club.labels?.suggest || 'اقترح عملًا')}"></label></div></form><div class="movie-club-preview" id="movieClubPreview"><div class="movie-club-preview-art" id="movieClubPreviewArt"></div><div class="movie-club-preview-content"><b id="movieClubPreviewTitle"></b><p id="movieClubPreviewDescription"></p><small>${fmt(publicCount)} أعمال منشورة · المشاهدة تفتح خدمة خارجية</small><div id="movieClubPreviewButtons"></div></div></div><div class="section-title"><h3>الكتالوج <span class="badge purple">${fmt(items.length)}</span></h3><button class="btn secondary small" type="button" id="movieClubAdd">+ إضافة عمل</button></div><div class="movie-club-items">${items.map(item => `<div class="row"><div class="row-main"><b>${esc(item.title)}</b><small>${item.kind === 'series' ? 'مسلسل' : 'فيلم'} · ${fmt(item.year)} · ${item.status === 'published' ? 'منشور' : 'مسودة'}${!item.poster_url ? ' · بلا صورة' : ''}${!item.links?.length ? ' · بلا رابط مشاهدة' : ''}</small></div><button class="btn small secondary" data-movie-edit="${esc(item.id)}">تعديل</button></div>`).join('') || '<p class="form-note">الكتالوج فارغ. أضف فيلمًا أو مسلسلًا، واحفظه مسودة أو انشره.</p>'}</div><details><summary>اقتراحات الأعضاء بانتظار المراجعة (${fmt(suggestions.filter(item => item.status === 'pending').length)})</summary>${suggestions.filter(item => item.status === 'pending').map(item => `<div class="row"><div class="row-main"><b>${esc(item.title)}</b><small>${esc(item.details || 'بلا تفاصيل')}</small></div><button class="btn small secondary" data-movie-review="${esc(item.id)}" data-status="approved">قبول</button><button class="btn small secondary" data-movie-review="${esc(item.id)}" data-status="rejected">رفض</button></div>`).join('') || '<p class="form-note">لا توجد اقتراحات جديدة.</p>'}</details><p class="form-note">قبل النشر: سيُسجّل أمر /${esc(club.command_name || 'نادي')} لهذا البوت وتُرسل لوحة واحدة في القناة المختارة. لن تتغير إعدادات الترحيب أو الرتب أو الدعم. بعد تعديل الكتالوج اضغط «تحديث اللوحة» ليظهر التغيير في الرسالة المثبتة.</p></div>`, `<button class="btn secondary" id="movieClubClose">إغلاق</button><button class="btn secondary" id="movieClubSave">حفظ المسودة</button>${club.status === 'published' ? '<button class="btn secondary" id="movieClubUnpublish">إلغاء النشر</button>' : ''}<button class="btn primary" id="movieClubPublish">${club.status === 'published' ? 'تحديث اللوحة' : 'نشر النادي'}</button>`);
  $('#dialog')?.classList.add('movie-club-modal');
  $('#movieClubForm').onsubmit = event => event.preventDefault();
  const currentSchedule = (data.schedules || []).find(item => item.status === 'scheduled');
  document.querySelector('.movie-club-items').insertAdjacentHTML('afterend', `<details class="movie-club-schedule"><summary>اختيارات النادي المجدولة ${currentSchedule ? '· مفعّلة' : '· متوقفة'}</summary><p class="form-note">انشر اللوحة أولًا، ثم اختر القناة والموعد. الوقت الذي تدخله هنا حسب ساعة جهازك؛ تُحفظ المنطقة الزمنية مع المهمة. إذا حُذفت القناة أو نقصت صلاحيات البوت تتوقف المهمة وتظهر رسالة واضحة في سجل الرسائل المجدولة.</p><div class="form-grid"><label>قناة اختيارات النادي<select id="movieScheduleChannel">${channelOptions(currentSchedule?.channel_id || club.channel_id)}</select></label><label>التكرار<select id="movieScheduleRepeat"><option value="weekly">أسبوعيًا</option><option value="daily">يوميًا</option><option value="monthly">شهريًا</option></select></label><label>أول موعد<input id="movieScheduleAt" type="datetime-local"></label><label>المنطقة الزمنية<select id="movieScheduleZone"><option value="Asia/Riyadh">الرياض</option><option value="UTC">UTC</option></select></label></div><div class="actions"><button class="btn small primary" id="movieScheduleSave" ${club.status === 'published' ? '' : 'disabled'}>تفعيل الجدولة</button>${currentSchedule ? '<button class="btn small secondary" id="movieScheduleCancel">إيقاف الجدولة</button>' : ''}</div>${(data.schedules || []).filter(item => item.status === 'failed').map(item => `<p class="notice">توقفت مهمة سابقة: ${esc(item.last_error || 'راجع القناة وصلاحيات البوت.')}</p>`).join('')}</details>`);
  $('#movieScheduleRepeat').value = currentSchedule?.repeat || 'weekly';
  $('#movieScheduleZone').value = currentSchedule?.timezone || 'Asia/Riyadh';
  if (currentSchedule?.run_at) { const point = new Date(currentSchedule.run_at); $('#movieScheduleAt').value = new Date(point.getTime() - point.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
  $('#movieScheduleSave').onclick = run(async () => {
    if (!$('#movieScheduleAt').value) throw Error('اختر موعد النشر الأول.');
    await api(`${path}/schedule`, { method: 'POST', body: JSON.stringify({ channelId: $('#movieScheduleChannel').value, repeat: $('#movieScheduleRepeat').value, runAt: new Date($('#movieScheduleAt').value).toISOString(), timezone: $('#movieScheduleZone').value }) });
    toast('فُعّلت جدولة اختيارات النادي.'); await openMovieClubDesigner(available, selectedId);
  });
  $('#movieScheduleCancel')?.addEventListener('click', run(async () => { await api(`${path}/schedule/cancel`, { method: 'POST', body: JSON.stringify({}) }); toast('توقفت جدولة النادي.'); await openMovieClubDesigner(available, selectedId); }));
  $('#movieClubClose').onclick = closeDialog;
  $('#movieClubBot').onchange = () => openMovieClubDesigner(available, $('#movieClubBot').value);
  const preview = () => {
    $('#movieClubPreviewTitle').textContent = $('#movieClubTitle').value || 'نادي الأفلام';
    $('#movieClubPreviewDescription').textContent = `${$('#movieClubWelcome').value}\n${$('#movieClubDescription').value}`;
    $('#movieClubPreview').style.setProperty('--movie-accent', $('#movieClubColor').value);
    const image = $('#movieClubBanner').value.trim();
    $('#movieClubPreviewArt').style.backgroundImage = /^https:\/\//i.test(image) ? `url("${image.replace(/["\\]/g, '')}")` : '';
    $('#movieClubPreviewButtons').innerHTML = [$('#movieClubDetailsLabel').value, $('#movieClubSearchLabel').value, $('#movieClubSuggestLabel').value].map(value => `<span>${esc(value)}</span>`).join('');
  };
  $('#movieClubForm').addEventListener('input', preview); preview();
  const save = async () => api(path, { method: 'PUT', body: JSON.stringify({ channelId: $('#movieClubChannel').value, reviewChannelId: $('#movieClubReview').value, commandName: $('#movieClubCommand').value, title: $('#movieClubTitle').value, description: $('#movieClubDescription').value, welcome: $('#movieClubWelcome').value, bannerUrl: $('#movieClubBanner').value, color: $('#movieClubColor').value, labels: { details: $('#movieClubDetailsLabel').value, search: $('#movieClubSearchLabel').value, suggest: $('#movieClubSuggestLabel').value } }) });
  $('#movieClubSave').onclick = run(async () => { await save(); toast('حُفظت مسودة النادي.'); await openMovieClubDesigner(available, selectedId); });
  $('#movieClubPublish').onclick = run(async () => {
    const button = $('#movieClubPublish'); button.disabled = true;
    try {
      const saved = await save();
      const commandName = saved.club.command_name;
      const commands = await api(`/api/ai/bots/${encodeURIComponent(selectedId)}/commands?guildId=${encodeURIComponent(guildId)}`);
      const existing = commands.commands.find(item => item.name === commandName);
      if (existing && existing.response_kind !== 'movie_club') throw Error(`الأمر /${commandName} مستخدم لميزة أخرى. اختر اسمًا مختلفًا.`);
      if (!existing) await api(`/api/ai/bots/${encodeURIComponent(selectedId)}/commands`, { method: 'POST', body: JSON.stringify({ guildId, name: commandName, description: 'افتح نادي الأفلام والمسلسلات', responseKind: 'movie_club' }) });
      await api(`${path}/publish`, { method: 'POST', body: JSON.stringify({}) });
      toast('نُشرت لوحة النادي في Discord. جرّب الأمر والأزرار في القناة المختارة.');
      await openMovieClubDesigner(available, selectedId);
    } finally { button.disabled = false; }
  });
  $('#movieClubUnpublish')?.addEventListener('click', run(async () => { await api(`${path}/unpublish`, { method: 'POST', body: JSON.stringify({}) }); toast('أُزيلت لوحة النادي من القناة. الكتالوج محفوظ.'); await openMovieClubDesigner(available, selectedId); }));
  $('#movieClubAdd').onclick = () => openMovieItemEditor(available, selectedId, path);
  document.querySelectorAll('[data-movie-edit]').forEach(button => button.onclick = () => openMovieItemEditor(available, selectedId, path, items.find(item => String(item.id) === button.dataset.movieEdit)));
  document.querySelectorAll('[data-movie-review]').forEach(button => button.onclick = run(async () => { await api(`${path}/suggestions/${button.dataset.movieReview}/review`, { method: 'POST', body: JSON.stringify({ status: button.dataset.status }) }); await openMovieClubDesigner(available, selectedId); }));
}

function openMovieItemEditor(available, selectedId, path, item = null) {
  modal(item ? 'تعديل العمل' : 'إضافة عمل للنادي', `<form id="movieItemForm" class="form-grid" dir="rtl"><label>العنوان<input id="movieItemTitle" maxlength="100" required value="${esc(item?.title || '')}"></label><label>النوع<select id="movieItemKind"><option value="movie" ${item?.kind !== 'series' ? 'selected' : ''}>فيلم</option><option value="series" ${item?.kind === 'series' ? 'selected' : ''}>مسلسل</option></select></label><label>سنة الإصدار<input id="movieItemYear" type="number" min="1888" max="${new Date().getUTCFullYear() + 3}" required value="${esc(item?.year || new Date().getUTCFullYear())}"></label><label>وصف مختصر<textarea id="movieItemSummary" maxlength="500">${esc(item?.summary || '')}</textarea></label><label>وسوم مفصولة بفاصلة<input id="movieItemTags" value="${esc((item?.tags || []).join(', '))}"></label><label>صورة تملك حق استخدامها (HTTPS)<input id="movieItemPoster" type="url" value="${esc(item?.poster_url || '')}"></label>${[0,1,2,3,4].map(index => `<div class="movie-club-link-row"><label>خدمة المشاهدة ${index + 1}<input data-movie-service="${index}" maxlength="60" value="${esc(item?.links?.[index]?.service || '')}" placeholder="مثال: Netflix"></label><label>رابط الخدمة الخارجي<input data-movie-url="${index}" type="url" value="${esc(item?.links?.[index]?.url || '')}" placeholder="https://..."></label></div>`).join('')}<label>الحالة<select id="movieItemStatus"><option value="draft" ${item?.status !== 'published' ? 'selected' : ''}>مسودة</option><option value="published" ${item?.status === 'published' ? 'selected' : ''}>منشور</option></select></label><p class="form-note">العمل المنشور يحتاج رابط مشاهدة. الصورة اختيارية، لكن ستظهر علامة «بلا صورة» في الكتالوج حتى تضيفها. الروابط تفتح الخدمة خارج Discord.</p></form>`, `<button class="btn secondary" id="movieItemBack">رجوع</button>${item ? '<button class="btn secondary" id="movieItemDelete">حذف العمل</button>' : ''}<button class="btn primary" type="submit" form="movieItemForm">حفظ العمل</button>`);
  $('#movieItemBack').onclick = () => openMovieClubDesigner(available, selectedId);
  $('#movieItemDelete')?.addEventListener('click', run(async () => { if (!confirm('هل تريد حذف هذا العمل من الكتالوج؟')) return; await api(`${path}/items/${item.id}`, { method: 'DELETE' }); await openMovieClubDesigner(available, selectedId); }));
  $('#movieItemForm').onsubmit = run(async event => {
    event.preventDefault();
    const links = [...document.querySelectorAll('[data-movie-service]')].map(field => ({ service: field.value.trim(), url: document.querySelector(`[data-movie-url="${field.dataset.movieService}"]`).value.trim() })).filter(link => link.service || link.url);
    const body = { title: $('#movieItemTitle').value, kind: $('#movieItemKind').value, year: Number($('#movieItemYear').value), summary: $('#movieItemSummary').value, tags: $('#movieItemTags').value, posterUrl: $('#movieItemPoster').value, links, status: $('#movieItemStatus').value };
    await api(`${path}/items${item ? `/${item.id}` : ''}`, { method: item ? 'PUT' : 'POST', body: JSON.stringify(body) });
    toast('حُفظ العمل. حدّث لوحة النادي بعد تعديل الكتالوج المنشور.'); await openMovieClubDesigner(available, selectedId);
  });
}

async function bots() {
  const guild = state.guild, epoch = state.epoch;
  $('#workspace').innerHTML = head('اللوحات التفاعلية', 'اختر البوت الذي يعرض اللوحة ويستجيب لأزرارها داخل Discord.') + '<div class="loading" role="status">جارٍ فحص بوتك…</div>';
  let bot = null, publicBot = null, managedBots = [], botQuota = null, connectionError = '';
  try {
    const [selected, registry] = await Promise.all([
      api(`/api/ai/bot-connection?guildId=${encodeURIComponent(guild)}`),
      api(`/api/ai/bots?guildId=${encodeURIComponent(guild)}`),
    ]);
    bot = selected.bot; publicBot = registry.publicBot || null; managedBots = registry.bots || []; botQuota = registry.quota || null;
  }
  catch (error) { connectionError = error.message; }
  if (guild !== state.guild || epoch !== state.epoch || screen() !== 'bots') return;
  const availableBots = [publicBot, ...managedBots].filter(item => item?.online);
  let panelEdit = null;
  try { panelEdit = JSON.parse(sessionStorage.getItem(`diskoko-panel-edit:${guild}`) || 'null'); } catch { panelEdit = null; }
  const statusText = connectionError ? 'تعذر فحص الاتصال' : publicBot ? 'بوت ديسكوكو جاهز للوحات' : !bot && managedBots.length ? 'بوتاتك مربوطة، والتنفيذ الحالي على ديسكوكو' : !bot ? 'لم تربط بوتك بعد' : !bot.online ? 'البوت غير متصل' : !bot.selected ? 'البوت متصل، لكن التنفيذ على ديسكوكو' : 'بوتك متصل ومختار للتنفيذ';
  const nextStep = connectionError ? 'حدّث الصفحة أو افتح إعدادات البوت إذا استمرت المشكلة.' : publicBot ? 'اختر بوت ديسكوكو أو أي بوت خاص متصل عند تصميم اللوحة.' : !bot && managedBots.length ? 'اختر أحد البوتات المتصلة أدناه ليصبح منفذ الميزات الجديدة.' : !bot ? 'اربط بوتك الأول، ثم يمكنك إضافة بوتات أخرى وتوزيع الميزات بينها.' : !bot.online ? 'راجع اتصال البوت المختار أو اختر بوتًا آخر متصلًا.' : !bot.selected ? 'اختر بوتًا خاصًا للتنفيذ حتى تُنشر المميزات باسمه.' : 'اختر ميزة أدناه. ستُنشر باسم البوت المختار بعد مراجعتك.';
  $('#workspace').innerHTML = head('اللوحات التفاعلية', 'صمّم تجربة الموسيقى أو الفيديو أو الألعاب، ثم اربطها بالبوت والقناة والأمر المناسب.') + connectionNotice() + `
    <section class="panel bot-workshop-status"><div class="bot-workshop-orbit" aria-hidden="true"><span>◈</span><i></i><i></i></div><div class="bot-workshop-intro"><small>اللوحات التفاعلية · ${esc(state.data.guild.name)}</small><h2>اختر بوت ديسكوكو أو بوتك الخاص لكل لوحة.</h2><p>صمّم اللوحة وانشرها عبر بوت ديسكوكو مباشرة، أو وزّع لوحاتك على بوتاتك الخاصة.</p></div><div class="server-title bot-workshop-identity"><span class="server-image">🤖</span><div class="row-main"><h3 data-i18n-preserve>${esc(publicBot?.name || bot?.name || 'أضف بوت ديسكوكو إلى السيرفر')}</h3><small>${esc(statusText)}</small></div>${badge(availableBots.length ? 'جاهز' : 'يحتاج خطوة', availableBots.length ? 'good' : 'warn')}</div>
    <p class="form-note">${esc(nextStep)}</p><div class="actions">
    ${!connectionError ? `<button class="btn primary" id="botWorkshopConnect" ${botQuota && botQuota.used >= botQuota.limit ? 'disabled' : ''}>${managedBots.length ? '+ إضافة بوت آخر' : '+ ربط بوتك الأول'}</button>` : ''}
    ${bot?.online && !bot.selected ? '<button class="btn primary" id="botWorkshopSelect">اختيار بوتي للتنفيذ</button>' : ''}
    <a class="btn secondary" href="/ai-bot-guide.html" target="_blank" rel="noopener noreferrer">شرح الإنشاء والربط ↗</a>
    <button class="btn secondary" id="botWorkshopRefresh" type="button">تحديث الحالة</button></div>
    ${bot ? `<div class="bot-workshop-checks"><span>${bot.online ? '✓ متصل' : '○ غير متصل'}</span><span>${bot.memberJoins ? '✓ استقبال الأعضاء مفعّل' : '○ الترحيب يحتاج Server Members Intent'}</span><span>${bot.messageContent ? '✓ محتوى الرسائل مفعّل' : '○ نص الرسائل المحذوفة يحتاج Message Content Intent'}</span></div>` : ''}
    <small class="form-note">${botQuota ? `بوتات خطتك: ${fmt(botQuota.used)} من ${fmt(botQuota.limit)} على حسابك كله. ` : ''}اختر البوت عند إنشاء كل لوحة؛ وتبقى لوحات البوتات الأخرى تعمل ما دامت متصلة. رموز الربط محفوظة مشفرة.${botQuota && botQuota.used >= botQuota.limit ? ' وصلت للحد؛ افصل بوتًا أو راجع الاشتراك قبل إضافة آخر.' : ''}</small></section>
    <div class="section-title"><h3>بوتات هذا السيرفر <span class="badge purple">${fmt(managedBots.length + (publicBot ? 1 : 0))}</span></h3><small>لكل بوت اتصال مستقل. الاسم هنا للتمييز داخل لوحة التحكم فقط.</small></div>
    <div class="server-grid bot-workshop-fleet">${publicBot ? `<article class="server-card bot-workshop-bot selected"><div class="server-title"><span class="server-image">✦</span><div class="row-main"><h3>بوت ديسكوكو</h3><small>البوت العام · جاهز لهذا السيرفر</small></div>${badge("متاح للوحات", "good")}</div><p class="form-note">يمكنك استخدامه للموسيقى ونادي الأفلام ولوحة يوتيوب دون ربط بوت خاص.</p><div class="actions"><button class="btn small secondary" data-manage-bot-commands="${esc(publicBot.id)}">إدارة أوامر اللوحات</button></div></article>` : ""}${managedBots.map(item => `<article class="server-card bot-workshop-bot ${item.selected ? 'selected' : ''}"><div class="server-title"><span class="server-image">🤖</span><div class="row-main"><h3 data-i18n-preserve>${esc(item.label)}</h3><small>${esc(item.name)} · ${item.online ? 'متصل' : 'غير متصل'}</small></div>${badge(item.selected ? 'منفذ افتراضي' : item.online ? 'متصل' : 'يحتاج مراجعة', item.selected ? 'good' : item.online ? 'purple' : 'warn')}</div><div class="bot-workshop-checks"><span>${item.memberJoins ? '✓ استقبال الأعضاء' : '○ يحتاج استقبال الأعضاء'}</span><span>${item.messageContent ? '✓ محتوى الرسائل' : '○ محتوى الرسائل مغلق'}</span></div><div class="bot-workshop-assignments"><b>مهام هذا البوت المسجلة في ديسكوكو</b><span>${fmt(item.assignments?.commands?.length || 0)} أوامر ولوحات</span><span>${fmt(item.assignments?.scheduled || 0)} نشر مجدول</span><span>${item.assignments?.welcome ? '✓ الترحيب الحالي' : '— لا يدير الترحيب'}</span><span>${item.assignments?.logs ? '✓ سجلات النشاط' : '— لا يدير السجلات'}</span><span>${fmt(item.assignments?.modules || 0)} ميزات تفاعلية</span>${item.assignments?.commands?.length ? `<small>الأوامر: ${item.assignments.commands.slice(0, 3).map(command => `/${esc(command.name)}`).join('، ')}${item.assignments.commands.length > 3 ? '…' : ''}</small>` : ''}</div><div class="actions">${item.online && !item.selected ? `<button class="btn small primary" data-select-managed-bot="${esc(item.id)}">استخدامه للتنفيذ</button>` : ''}<button class="btn small secondary" data-manage-bot-commands="${esc(item.id)}">إدارة الأوامر واللوحات</button><button class="btn small secondary" data-settings-managed-bot="${esc(item.id)}">الهوية والصلاحيات</button></div></article>`).join('') || (publicBot ? '' : '<div class="panel"><p class="form-note">أضف بوت ديسكوكو إلى السيرفر أو اربط بوتك الخاص لتصميم اللوحات.</p></div>')}</div>
    <div class="section-title"><h3>أنواع اللوحات</h3><small>لكل لوحة إعداداتها وأفعالها. لا تُنشر أزرار قبل توصيلها بتنفيذ فعلي.</small></div>
    <div class="server-grid bot-design-gallery">${botWorkshopDesigns.map((design, index) => `<article class="server-card bot-design-card"><span class="bot-design-art" aria-hidden="true">${design.icon}</span><div><small>${design.tag}</small><h3>${design.title}</h3><p>${design.description}</p><small>${index === 4 ? 'الخيارات المعروضة' : 'الوظائف المتاحة'}: ${design.actions}</small></div>${index === 0 ? `<button class="btn primary" type="button" id="createMusicPanel" ${availableBots.length ? '' : 'disabled'}>${availableBots.length ? 'تصميم لوحة الموسيقى' : 'اربط بوتًا متصلًا أولًا'}</button>` : index === 1 ? `<button class="btn primary" type="button" id="createMovieClub" ${availableBots.length ? '' : 'disabled'}>${availableBots.length ? 'تصميم نادي الأفلام' : 'اربط بوتًا متصلًا أولًا'}</button>` : index === 2 ? `<button class="btn secondary" type="button" id="createYoutubePanel" ${availableBots.length ? '' : 'disabled'}>${availableBots.length ? 'إنشاء لوحة يوتيوب' : 'اربط بوتًا متصلًا أولًا'}</button>` : index === 3 ? `<button class="btn primary" type="button" id="createCommunityPanel" ${availableBots.length ? '' : 'disabled'}>${availableBots.length ? 'تصميم واجهة المجتمع' : 'اربط بوتًا متصلًا أولًا'}</button>` : '<div class="bot-game-list" aria-label="معاينة الألعاب المعلقة"><span>أسئلة سريعة</span><span>حجر ورقة مقص</span><span>تخمين رقم</span><span>تحدي معلومات</span></div><small class="form-note">معاينة فقط · الألعاب معلقة ولا تستجيب للضغط الآن.</small>'}</article>`).join('')}</div>
    <div class="bot-workshop-steps" aria-label="خطوات تجهيز اللوحة"><span class="${availableBots.length ? 'done' : 'current'}"><b>01</b> ربط البوت</span><span class="${availableBots.length ? 'done' : 'current'}"><b>02</b> اختيار البوت والقناة</span><span><b>03</b> تصميم اللوحة وتوصيل الأفعال</span></div>`;
  $('#botWorkshopRefresh').onclick = () => bots().catch(error => toast(error.message));
  $('#createMovieClub')?.addEventListener('click', () => openMovieClubDesigner(availableBots));
  $('#createCommunityPanel')?.addEventListener('click', () => openCommunityPanelDesigner(availableBots));
  if ($('#createMusicPanel')) $('#createMusicPanel').onclick = () => {
    const available = availableBots;
    modal('تصميم استديو الموسيقى', `<form id="musicPanelForm" class="form-grid"><p class="form-note">الأمر /موسيقى يضم خانتي «رابط» و«روم» معًا داخل Discord. بعد التنفيذ تظهر لوحة تشغيل بأزرار الإيقاف والتخطي ورفع الصوت وخفضه مباشرة؛ إدخال الرابط داخل بطاقة الرسالة نفسها غير مدعوم من Discord.</p><label>البوت الذي يشغّل الصوت<select id="musicPanelBot" required>${available.map(item => `<option data-i18n-preserve value="${esc(item.id)}" ${(panelEdit ? item.id === panelEdit.botId : item.selected) ? 'selected' : ''}>${esc(item.label)}</option>`).join('')}</select></label><label>الأمر بعد /<input id="musicPanelCommand" required maxlength="32" pattern="[-_\\p{L}\\p{N}]+" value="موسيقى"></label><label>عنوان اللوحة<input id="musicPanelTitle" required maxlength="100" value="استديو الموسيقى"></label><label>وصف قصير<input id="musicPanelDescription" maxlength="500" value="ضع الرابط واختر الروم في أمر /موسيقى، ثم تحكم من هذه اللوحة."></label><label>خلفية البطاقة (رابط مرفق Discord)<input id="musicPanelBanner" type="url" placeholder="https://cdn.discordapp.com/..."></label><label>صورة الغلاف بدل صورة YouTube (اختياري)<input id="musicPanelCover" type="url" placeholder="https://cdn.discordapp.com/..."></label><label>شعار البطاقة (رابط مرفق Discord)<input id="musicPanelLogo" type="url" placeholder="https://cdn.discordapp.com/..."></label><label>لون الهوية<input id="musicPanelColor" type="color" value="#8659e6"></label><label>طريقة العرض<select id="musicPanelLayout"><option value="wide">بنر عريض مع شعار</option><option value="compact">بطاقة مركزة</option></select></label><label>مستوى الصوت الابتدائي<input id="musicPanelVolume" type="number" min="1" max="100" value="80"></label><div class="music-panel-preview" id="musicPanelPreview" aria-label="معاينة لوحة الموسيقى"></div><p class="form-note">صورة الغلاف تظهر مكان صورة YouTube، والخلفية تظهر خلف البطاقة. ارفع الصور في Discord والصق روابط المرفقات. ألوان الأزرار محددة بما يتيحه Discord. ضع رابط فيديو YouTube عامًا أو رابط ملف صوتي. يظهر اسم المقطع تلقائيًا، وقد يتعذر تشغيل المقاطع المقيّدة أو غير المتاحة.</p></form>`, '<button class="btn secondary" type="button" id="musicPanelCancel">إلغاء</button><button class="btn primary" type="submit" form="musicPanelForm" id="musicPanelSave">إنشاء اللوحة والأمر</button>');
    $('#musicPanelCancel').onclick = closeDialog;
    $('#musicPanelColor').closest('label').insertAdjacentHTML('afterend', '<label>شكل الإطار<select id="musicPanelFrame"><option value="neon">نيون مضيء</option><option value="glass">زجاجي</option><option value="minimal">هادئ</option></select></label><label>لون أزرار Discord<select id="musicPanelControlStyle"><option value="2">رمادي</option><option value="1">بنفسجي</option><option value="3">أخضر</option></select></label>');
    $('#musicPanelPreview').innerHTML = '<div class="music-card-backdrop" id="musicPanelPreviewBanner"></div><div class="music-card-art" id="musicPanelPreviewCover">♫</div><div class="music-card-copy"><span class="music-card-status">NOW PLAYING</span><strong id="musicPanelPreviewTitle">استديو الموسيقى</strong><p id="musicPanelPreviewDescription">الأغنية التي تعمل في الروم</p><span class="music-card-progress"><i></i></span><span class="music-card-times">0:42 / 3:52 <b>VOL 80%</b></span></div><div class="music-card-brand"><span id="musicPanelPreviewLogo">dk</span><small>ACTIVITY</small></div><div class="music-card-buttons"><span>🔁</span><span>🔉</span><span>⏸️</span><span>🔊</span><span>⏭️</span><span>⏹️</span></div>';
    const preview = () => {
      $('#musicPanelPreviewTitle').textContent = $('#musicPanelTitle').value || 'استديو الموسيقى';
      $('#musicPanelPreviewDescription').textContent = $('#musicPanelDescription').value || '';
      $('#musicPanelPreview').style.setProperty('--music-accent', $('#musicPanelColor').value);
      $('#musicPanelPreview').classList.toggle('compact', $('#musicPanelLayout').value === 'compact');
      $('#musicPanelPreview').dataset.frame = $('#musicPanelFrame').value;
      $('#musicPanelPreview').dataset.controls = $('#musicPanelControlStyle').value;
      $('#musicPanelPreview').querySelector('.music-card-times b').textContent = 'VOL ' + $('#musicPanelVolume').value + '%';
      const image = value => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } };
      const showImage = (input, target, fallback) => {
        const url = image(input.value.trim());
        if (target.dataset.previewUrl === url) return;
        target.dataset.previewUrl = url;
        target.style.backgroundImage = '';
        target.textContent = !input.value.trim() ? fallback : url ? 'جارٍ تحميل الصورة…' : 'رابط صورة غير صالح';
        if (!url) return;
        const probe = new Image();
        probe.onload = () => { if (target.dataset.previewUrl === url) { target.style.backgroundImage = `url("${url}")`; target.textContent = ''; } };
        probe.onerror = () => { if (target.dataset.previewUrl === url) { target.textContent = target.id === 'musicPanelPreviewLogo' ? '!' : 'تعذر عرض البنر؛ استخدم رابط صورة متاحًا للعامة.'; target.title = 'افتح رابط الصورة وتأكد أنه متاح للعامة ولم تنتهِ صلاحيته.'; } };
        probe.src = url;
      };
      showImage($('#musicPanelBanner'), $('#musicPanelPreviewBanner'), '');
      showImage($('#musicPanelCover'), $('#musicPanelPreviewCover'), '♫');
      showImage($('#musicPanelLogo'), $('#musicPanelPreviewLogo'), 'dk');
    };
    $('#musicPanelForm').addEventListener('input', preview);
    $('#musicPanelForm').addEventListener('change', preview);
    preview();
    const loadMusicDesign = async () => {
      const botId = $('#musicPanelBot').value;
      const list = await api(`/api/ai/bots/${encodeURIComponent(botId)}/commands?guildId=${encodeURIComponent(guild)}`);
      const existing = (list.commands || []).find(item => item.response_kind === 'music_panel');
      if (!existing) return;
      const config = existing.panel_config || {};
      $('#musicPanelCommand').value = existing.name;
      for (const [field, key] of [['Title','title'],['Description','description'],['Banner','bannerUrl'],['Logo','logoUrl'],['Color','color'],['Layout','layout'],['Frame','frameStyle'],['ControlStyle','controlStyle'],['Cover','coverUrl'],['Volume','defaultVolume']]) {
        if (config[key] != null) $('#musicPanel' + field).value = config[key];
      }
      $('#musicPanelSave').textContent = 'حفظ تصميم اللوحة';
      preview();
    };
    $('#musicPanelBot').addEventListener('change', () => loadMusicDesign().catch(error => toast(error.message)));
    loadMusicDesign().catch(error => toast(error.message));
    $('#musicPanelForm').onsubmit = run(async event => {
      event.preventDefault();
      const button = $('#musicPanelSave'); button.disabled = true;
      try {
        const panelConfig = { title: $('#musicPanelTitle').value, description: $('#musicPanelDescription').value, bannerUrl: $('#musicPanelBanner').value.trim(), logoUrl: $('#musicPanelLogo').value.trim(), color: $('#musicPanelColor').value, layout: $('#musicPanelLayout').value, frameStyle: $('#musicPanelFrame').value, controlStyle: Number($('#musicPanelControlStyle').value), coverUrl: $('#musicPanelCover').value.trim(), defaultVolume: Number($('#musicPanelVolume').value) };
        const botId = $('#musicPanelBot').value;
        const name = $('#musicPanelCommand').value.trim();
        const list = await api(`/api/ai/bots/${encodeURIComponent(botId)}/commands?guildId=${encodeURIComponent(guild)}`);
        const existing = (list.commands || []).find(item => item.name === name);
        if (existing && existing.response_kind !== 'music_panel') throw Error('اسم الأمر مستخدم للوحة أخرى. اختر اسمًا مختلفًا.');
        const path = `/api/ai/bots/${encodeURIComponent(botId)}/commands`;
        await api(existing ? `${path}/${encodeURIComponent(name)}` : path, { method: existing ? 'PATCH' : 'POST', body: JSON.stringify({ guildId: guild, name, description: 'لوحة موسيقى صوتية تفاعلية', responseKind: 'music_panel', panelConfig }) });
        closeDialog(); toast(existing ? 'حُفظ تصميم لوحة الموسيقى.' : 'أنشئت لوحة الموسيقى. افتح الأمر في Discord وضع الرابط واختر الروم الصوتي.');
      } catch (error) { modalError(error); button.disabled = false; }
    });
  };
  if ($('#createYoutubePanel')) $('#createYoutubePanel').onclick = () => {
    const available = availableBots;
    modal('تصميم لوحة يوتيوب', `<form id="youtubePanelForm" class="form-grid"><p class="form-note">صمّم اللوحة مرة واحدة. عند استخدام الأمر في Discord يظهر زر «إضافة فيديو»؛ يدخل العضو الرابط هناك ثم تظهر بطاقة الفيديو وزر المشاهدة.</p><label>البوت الذي يعرض اللوحة<select id="youtubePanelBot" required>${available.map(item => `<option data-i18n-preserve value="${esc(item.id)}" ${(panelEdit ? item.id === panelEdit.botId : item.selected) ? 'selected' : ''}>${esc(item.label)}</option>`).join('')}</select></label><label>اسم أمر Discord بعد /<input id="youtubePanelCommand" required maxlength="32" pattern="[-_\\p{L}\\p{N}]+" value="يوتيوب"></label><label>عنوان اللوحة<input id="youtubePanelTitle" maxlength="100" required value="قاعة المشاهدة"></label><label>وصف اللوحة<input id="youtubePanelDescription" maxlength="500" value="أضف فيديو ثم افتحه بمشغّل YouTube الرسمي."></label><label>رابط بنر اللوحة HTTPS (اختياري)<input id="youtubePanelBanner" type="url" placeholder="https://..."></label><label>رابط شعار السيرفر HTTPS (اختياري)<input id="youtubePanelLogo" type="url" placeholder="https://..."></label><label>لون الإطار<input id="youtubePanelColor" type="color" value="#8659e6"></label><label>شكل البطاقة<select id="youtubePanelLayout"><option value="wide">بنر عريض وشعار جانبي</option><option value="compact">صورة الفيديو بحجم بارز</option></select></label><label>ترتيب أزرار الفيديو<select id="youtubePanelOrder"><option value="watch-first">المشاهدة ثم إضافة فيديو</option><option value="add-first">إضافة فيديو ثم المشاهدة</option></select></label><label>نص زر الإضافة<input id="youtubePanelAddLabel" maxlength="80" value="＋ إضافة فيديو"></label><label>نص زر المشاهدة<input id="youtubePanelWatchLabel" maxlength="80" value="▶ مشاهدة الفيديو"></label><label>نص زر العودة<input id="youtubePanelBackLabel" maxlength="80" value="↩ القائمة"></label><p class="form-note">البنر والشعار يظهران ضمن حدود بطاقة Discord. المشاهدة تفتح مشغّل YouTube الرسمي؛ تشغيل الصوت داخل قناة Discord يحتاج مصدر صوت مصرحًا ببثّه.</p></form>`, '<button class="btn secondary" type="button" id="youtubePanelCancel">إلغاء</button><button class="btn primary" type="submit" form="youtubePanelForm" id="youtubePanelSave">إنشاء اللوحة والأمر</button>');
    $('#youtubePanelCancel').onclick = closeDialog;
    let youtubeEditing = null;
    const loadYoutubeDesign = async () => {
      const botId = $('#youtubePanelBot').value;
      const list = await api(`/api/ai/bots/${encodeURIComponent(botId)}/commands?guildId=${encodeURIComponent(guild)}`);
      if (!$('#youtubePanelBot') || $('#youtubePanelBot').value !== botId) return;
      const existing = (list.commands || []).find(item => item.response_kind === 'youtube_panel');
      $('#youtubePanelForm').reset();
      $('#youtubePanelBot').value = botId;
      youtubeEditing = existing?.name || null;
      $('#youtubePanelCommand').disabled = Boolean(existing);
      $('#youtubePanelSave').textContent = existing ? 'حفظ تصميم اللوحة' : 'إنشاء اللوحة والأمر';
      if (!existing) return;
      $('#youtubePanelCommand').value = existing.name;
      const config = existing.panel_config || {};
      for (const [field, key] of [['Title','title'],['Description','description'],['Banner','bannerUrl'],['Logo','logoUrl'],['Color','color'],['Layout','layout'],['Order','buttonOrder'],['AddLabel','addLabel'],['WatchLabel','watchLabel'],['BackLabel','backLabel']]) {
        if (config[key] != null) $('#youtubePanel' + field).value = config[key];
      }
    };
    $('#youtubePanelBot').addEventListener('change', () => loadYoutubeDesign().catch(error => toast(error.message)));
    loadYoutubeDesign().catch(error => toast(error.message));
    $('#youtubePanelForm').onsubmit = run(async event => {
      event.preventDefault();
      const button = $('#youtubePanelSave'); button.disabled = true;
      try {
        const panelConfig = { title: $('#youtubePanelTitle').value, description: $('#youtubePanelDescription').value, bannerUrl: $('#youtubePanelBanner').value.trim(), logoUrl: $('#youtubePanelLogo').value.trim(), color: $('#youtubePanelColor').value, layout: $('#youtubePanelLayout').value, buttonOrder: $('#youtubePanelOrder').value, addLabel: $('#youtubePanelAddLabel').value, watchLabel: $('#youtubePanelWatchLabel').value, backLabel: $('#youtubePanelBackLabel').value };
        const path = `/api/ai/bots/${encodeURIComponent($('#youtubePanelBot').value)}/commands${youtubeEditing ? '/' + encodeURIComponent(youtubeEditing) : ''}`;
        await api(path, { method: youtubeEditing ? 'PATCH' : 'POST', body: JSON.stringify({ guildId: guild, name: youtubeEditing || $('#youtubePanelCommand').value, description: 'لوحة تفاعلية لإضافة ومشاهدة فيديو YouTube', responseKind: 'youtube_panel', panelConfig }) });
        closeDialog(); toast(youtubeEditing ? 'حُفظ تصميم لوحة يوتيوب.' : 'أُنشئت اللوحة. افتح الأمر في Discord ثم أضف رابط الفيديو من زر اللوحة.');
      } catch (error) { modalError(error); button.disabled = false; }
    });
  };
  if ($('#botWorkshopSelect')) $('#botWorkshopSelect').onclick = run(async event => {
    event.currentTarget.disabled = true;
    try { await api('/api/ai/bot-connection/selection', { method: 'POST', body: JSON.stringify({ guildId: guild, executor: 'custom' }) }); await bots(); toast('بوتك الخاص أصبح منفذ هذا السيرفر.'); }
    catch (error) { await bots(); throw error; }
  });
  if ($('#botWorkshopConnect')) $('#botWorkshopConnect').onclick = () => {
    modal('إضافة بوت خاص', `<p>أنشئ تطبيق بوت وأضفه إلى ${esc(state.data.guild.name)}، ثم ألصق رمزه هنا. لا ترسل الرمز في محادثة أو قناة. لن يتوقف أي بوت مرتبط عند إضافة هذا البوت.</p><label>رمز البوت<input id="workshopBotToken" type="password" autocomplete="off" spellcheck="false"></label><p class="form-note">للترحيب التلقائي فعّل Server Members Intent. لعرض نص الرسائل المحذوفة فعّل Message Content Intent.</p><a href="/ai-bot-guide.html" target="_blank" rel="noopener noreferrer">شرح الربط بالصور ↗</a>`, '<button class="btn secondary" id="workshopBotCancel" type="button">إلغاء</button><button class="btn primary" id="workshopBotSave" type="button">تحقق وأضف</button>');
    $('#workshopBotCancel').onclick = closeDialog;
    $('#workshopBotSave').onclick = run(async () => {
      const button = $('#workshopBotSave'); button.disabled = true;
      try { const result = await api('/api/ai/bots', { method: 'POST', body: JSON.stringify({ guildId: guild, token: $('#workshopBotToken').value }) }); closeDialog(); await bots(); toast(result.pending ? 'أُضيف البوت؛ سيتصل بعد انتهاء مهلة Discord.' : 'أُضيف بوتك الخاص. اختره للتنفيذ متى أردت.'); }
      catch (error) { modalError(error); if (error.inviteUrl?.startsWith('https://discord.com/oauth2/authorize?')) { const link = document.createElement('a'); link.href = error.inviteUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'أضف البوت إلى السيرفر ↗'; $('#dialogError').append(document.createElement('br'), link); } button.disabled = false; }
    });
  };
  document.querySelectorAll('[data-select-managed-bot]').forEach(button => button.onclick = run(async () => {
    button.disabled = true;
    try { await api('/api/ai/bots/select', { method: 'POST', body: JSON.stringify({ guildId: guild, botId: button.dataset.selectManagedBot }) }); await bots(); toast('هذا البوت أصبح منفذ المميزات الجديدة. اللوحات المنشورة بالبوتات الأخرى مستمرة.'); }
    catch (error) { await bots(); throw error; }
  }));
  document.querySelectorAll('[data-manage-bot-commands]').forEach(button => button.onclick = () => { sessionStorage.setItem(`diskoko-command-bot:${guild}`, button.dataset.manageBotCommands); location.hash = '#commands'; });
  if (panelEdit && availableBots.some(item => item.id === panelEdit.botId)) {
    sessionStorage.removeItem(`diskoko-panel-edit:${guild}`);
    if (panelEdit.kind === 'music_panel') $('#createMusicPanel')?.click();
    else if (panelEdit.kind === 'youtube_panel') $('#createYoutubePanel')?.click();
    else if (panelEdit.kind === 'movie_club') void openMovieClubDesigner(availableBots, panelEdit.botId);
    else if (panelEdit.kind === 'community_panel') void openCommunityPanelDesigner(availableBots, panelEdit.botId, panelEdit.name);
  }
  document.querySelectorAll('[data-settings-managed-bot]').forEach(button => button.onclick = () => {
    const item = managedBots.find(candidate => candidate.id === button.dataset.settingsManagedBot);
    if (!item) return;
    modal(`إعدادات ${esc(item.label)}`, `<div class="form-grid"><p>اسم تطبيق Discord: <b data-i18n-preserve>${esc(item.name)}</b> · ${item.online ? 'متصل' : 'غير متصل'}</p><label>اسم للتمييز داخل ديسكوكو<input id="workshopBotLabel" maxlength="80" value="${esc(item.label)}"></label><label>لقب البوت داخل هذا السيرفر<input id="workshopBotNickname" maxlength="32" placeholder="جارٍ قراءة اللقب من Discord…" disabled></label><button class="btn secondary" id="workshopBotNicknameSave" type="button" disabled>تغيير اللقب في Discord</button><div id="workshopBotPermissions" class="bot-workshop-permissions" role="status">جارٍ فحص صلاحيات البوت في السيرفر…</div><p class="form-note">اسم اللوحة للتمييز هنا فقط؛ اللقب يتغير فعلًا داخل السيرفر. صلاحيات القنوات الخاصة قد تختلف عن صلاحيات السيرفر. لتحديث الرمز، ألصقه مجددًا من صفحة إضافة بوت. للترحيب: ${item.memberJoins ? 'استقبال الأعضاء مفعّل' : 'فعّل Server Members Intent ثم حدّث الربط'}. لنص الرسائل المحذوفة: ${item.messageContent ? 'مفعّل' : 'فعّل Message Content Intent ثم حدّث الربط'}.</p><a href="/ai-bot-guide.html" target="_blank" rel="noopener noreferrer">شرح إعدادات Discord ↗</a></div>`, '<button class="btn secondary" id="workshopBotClose" type="button">إغلاق</button><button class="btn secondary" id="workshopBotRemove" type="button">فصل البوت</button><button class="btn primary" id="workshopBotLabelSave" type="button">حفظ اسم اللوحة</button>');
    $('#workshopBotClose').onclick = closeDialog;
    $('#workshopBotNicknameSave').insertAdjacentHTML('afterend', `<details class="bot-workshop-identity-editor"><summary>اسم البوت وصورته في جميع السيرفرات</summary><p class="form-note">هذا تغيير لهوية تطبيقك في Discord كله، وليس لهذا السيرفر فقط. يمكن لمالك الربط تغييره، وقد يطلب Discord الانتظار بين التغييرات.</p><label>الاسم العام للبوت<input id="workshopBotGlobalName" maxlength="32" value="${esc(item.name)}"></label><label>صورة البوت الجديدة (اختياري، حتى 250 كيلوبايت)<input id="workshopBotAvatar" type="file" accept="image/png,image/jpeg,image/webp"></label><label class="check-row"><input id="workshopBotIdentityConfirm" type="checkbox">أفهم أن الاسم والصورة سيتغيران في جميع السيرفرات</label><button class="btn secondary" id="workshopBotIdentitySave" type="button">تحديث الهوية في Discord</button></details>`);
    $('#workshopBotIdentitySave').onclick = run(async () => {
      const save = $('#workshopBotIdentitySave'); save.disabled = true;
      try {
        if (!$('#workshopBotIdentityConfirm').checked) throw Error('أكّد أنك فهمت أن تغيير هوية البوت يشمل جميع السيرفرات.');
        const file = $('#workshopBotAvatar').files?.[0];
        if (file && (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 250_000)) throw Error('اختر صورة PNG أو JPG أو WebP لا تتجاوز 250 كيلوبايت.');
        const avatar = file ? await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(Error('تعذر قراءة الصورة.')); reader.readAsDataURL(file); }) : null;
        const username = $('#workshopBotGlobalName').value.trim() === item.name ? '' : $('#workshopBotGlobalName').value.trim();
        if (!username && !avatar) throw Error('غيّر الاسم أو اختر صورة قبل الحفظ.');
        await api(`/api/ai/bots/${encodeURIComponent(item.id)}/identity`, { method: 'PATCH', body: JSON.stringify({ guildId: guild, username, avatar }) });
        closeDialog(); await bots(); toast('تحدث اسم البوت أو صورته في Discord.');
      } catch (error) { modalError(error); save.disabled = false; }
    });
    api(`/api/ai/bots/${encodeURIComponent(item.id)}/profile?guildId=${encodeURIComponent(guild)}`).then(profile => {
      const nickname = $('#workshopBotNickname'); if (!nickname) return;
      nickname.value = profile.nickname || ''; nickname.placeholder = 'بدون لقب خاص'; nickname.disabled = false;
      $('#workshopBotNicknameSave').disabled = false;
      const target = $('#workshopBotPermissions');
      if (target) target.innerHTML = profile.permissions ? `<b>صلاحيات السيرفر</b><div class="bot-workshop-checks">${[['administrator','Administrator'],['manageChannels','إدارة القنوات'],['manageRoles','إدارة الرتب'],['viewChannel','عرض القنوات'],['sendMessages','إرسال الرسائل'],['embedLinks','البطاقات والروابط']].map(([key, label]) => `<span class="${profile.permissions[key] ? 'good' : 'missing'}">${profile.permissions[key] ? '✓' : '○'} ${label}</span>`).join('')}</div><small>أعلى رتبة للبوت في الترتيب: ${fmt(profile.permissions.highestRolePosition)}. يجب أن تكون أعلى من الرتب التي سيعدلها.</small>` : 'تعذر فحص الصلاحيات الآن؛ تحقق من رتبة البوت داخل Discord.';
    }).catch(error => { const nickname = $('#workshopBotNickname'); if (nickname) nickname.placeholder = error.message; const target = $('#workshopBotPermissions'); if (target) target.textContent = error.message; });
    $('#workshopBotNicknameSave').onclick = run(async () => {
      const save = $('#workshopBotNicknameSave'); save.disabled = true;
      try { await api(`/api/ai/bots/${encodeURIComponent(item.id)}/nickname`, { method: 'PATCH', body: JSON.stringify({ guildId: guild, nickname: $('#workshopBotNickname').value }) }); toast('تغير لقب البوت داخل السيرفر في Discord.'); }
      catch (error) { modalError(error); }
      finally { save.disabled = false; }
    });
    $('#workshopBotLabelSave').onclick = run(async () => {
      const save = $('#workshopBotLabelSave'); save.disabled = true;
      try { await api(`/api/ai/bots/${encodeURIComponent(item.id)}`, { method: 'PATCH', body: JSON.stringify({ guildId: guild, label: $('#workshopBotLabel').value }) }); closeDialog(); await bots(); toast('حُفظ اسم البوت داخل لوحة التحكم.'); }
      catch (error) { modalError(error); save.disabled = false; }
    });
    $('#workshopBotRemove').onclick = () => confirmDialog('فصل هذا البوت؟', 'ستتوقف اللوحات والتفاعلات التي نشرها هذا البوت حتى تعيد ربطه. لن تُحذف رسائله السابقة من Discord.', 'فصل البوت', async () => {
      await api(`/api/ai/bots/${encodeURIComponent(item.id)}`, { method: 'DELETE', body: JSON.stringify({ guildId: guild }) });
      closeDialog(); await bots(); toast('فُصل البوت. يمكنك ربطه من جديد عند الحاجة.');
    });
  });

}
async function prepareAiImage(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw Error('اختر صورة PNG أو JPG أو WebP أصغر من 10 ميجابايت.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  for (const quality of [0.82, 0.68, 0.5]) {
    const data = canvas.toDataURL('image/jpeg', quality).split(',')[1];
    if (data.length < 460000) return { mime: 'image/jpeg', base64: data };
  }
  throw Error('الصورة كبيرة جدًا بعد الضغط. اختر صورة أصغر.');
}
function readyCounts(definition) { const categories = definition.categories.length, channels = definition.categories.reduce((n, group) => n + group.channels.length, 0), roles = definition.roles.length, features = ['welcome','ticket'].filter(kind => definition.features?.[kind]?.enabled).length + (definition.features?.logs?.enabled ? definition.features.logs.mode === 'routed' ? (definition.features.logs.routes || []).length : 1 : 0) + (definition.features?.guides?.length || 0) + (definition.features?.modules || []).filter(module => module.enabled).length; return { categories, channels, roles, features, units: roles + categories + channels + features }; }
function readyPreview(definition) {
  const roleNames = new Map(definition.roles.map(role => [role.key, role.name]));
  return `<div class="ready-discord" dir="rtl"><aside><strong>✦ ${esc(state.data.guild.name)}</strong>${definition.categories.map(group => `<div class="ready-discord-category"><b>⌄ ${esc(group.name)}</b>${group.channels.map(channel => `<div class="ready-discord-channel"><span>${channel.type === 2 ? '◖' : '#'}</span>${esc(channel.name)}${channel.access === 'private' ? '<small>🔒</small>' : ''}</div>`).join('')}</div>`).join('')}</aside><main><b>معاينة القنوات والبطاقات</b><p>شكل تقريبي داخل Discord؛ سيستخدم السيرفر اسمه وصورته الحقيقيين.</p>${definition.features?.welcome?.enabled ? `<div class="ready-preview-card" style="--ready-accent:${esc(definition.features.welcome.color || '#8d72e8')}">${definition.features.welcome.banner?.base64 ? `<img class="ready-banner" src="data:${esc(definition.features.welcome.banner.mime)};base64,${esc(definition.features.welcome.banner.base64)}" alt="صورة الترحيب">` : ''}<strong>${esc(definition.features.welcome.title)}</strong><p>${esc(definition.features.welcome.description.replaceAll('{member}', '@عضو جديد'))}</p><small>في #${esc(definition.categories.flatMap(group => group.channels).find(channel => channel.key === definition.features.welcome.channelKey)?.name || '')} · صورة العضو ${esc({ left: 'يسارًا', right: 'يمينًا', top: 'فوق النص' }[definition.features.welcome.avatarPosition] || 'يمينًا')}</small></div>` : ''}${definition.features?.ticket?.enabled ? `<div class="ready-preview-card"><strong>${esc(definition.features.ticket.title)}</strong><p>${esc(definition.features.ticket.description)}</p><button class="btn small primary" disabled>فتح تذكرة دعم</button></div>` : ''}<div class="ready-role-list"><b>الرتب وصلاحياتها</b>${definition.roles.map(role => `<span><i style="background:#${Number(role.color).toString(16).padStart(6, '0')}"></i>${esc(role.name)} <small>${esc(role.preset === 'moderator' ? 'إشراف محدود' : role.preset === 'support' ? 'دعم' : 'عضو')}</small></span>`).join('')}</div><p class="form-note">القنوات الخاصة لا يراها إلا أعضاء رتبة ${esc([...roleNames.values()].join('، '))} بحسب اختيارك. القنوات النصية للقراءة فقط تمنع رسائل الأعضاء.</p></main></div>`;
}
function readyDecoratePreview() {
  const [card, ticketCard] = document.querySelectorAll('#readyPreview .ready-preview-card');
  const welcome = state.readyDraft.features.welcome;
  if (card && welcome?.enabled) {
    const avatar = document.createElement('span'); avatar.className = `ready-avatar ready-avatar-${welcome.avatarPosition || 'right'}`; avatar.textContent = 'ع'; avatar.setAttribute('aria-label', 'صورة العضو الجديد');
    const banner = card.querySelector('.ready-banner');
    if (welcome.composite && banner) {
      const composite = document.createElement('div'); composite.className = 'ready-image-composite';
      banner.replaceWith(composite); composite.append(banner, avatar);
      const x = { left: 15.4, center: 50, right: 84.6 }[welcome.avatarPosition] || 84.6;
      avatar.style.left = `${x}%`; avatar.style.top = `${Number(welcome.avatarVertical ?? 50)}%`;
      avatar.style.setProperty('--avatar-size', `${Number(welcome.avatarRadius ?? 95) / 6}%`);
    } else { card.prepend(avatar); if (banner && welcome.bannerPosition !== 'above') card.append(banner); }
  }
  const support = state.readyDraft.features.ticket;
  const supportCard = welcome?.enabled ? ticketCard : card;
  if (supportCard && support?.enabled) {
    supportCard.style.setProperty('--ready-accent', support.color || '#8d72e8');
    const button = supportCard.querySelector('button'); if (button) button.textContent = support.buttonLabel || 'فتح تذكرة دعم';
    if (support.banner?.base64) {
      const image = document.createElement('img'); image.className = support.imageStyle === 'logo' ? 'ready-banner ready-support-logo' : 'ready-banner'; image.alt = 'صورة لوحة الدعم'; image.src = `data:${support.banner.mime};base64,${support.banner.base64}`;
      if (support.bannerPosition === 'above') supportCard.prepend(image); else supportCard.append(image);
    }
  }
  for (const [kind, source] of [['welcome', welcome?.enabled ? card : null], ['ticket', support?.enabled ? supportCard : null]]) {
    const local = $(`#ready-${kind}-inline-preview`);
    if (!local) continue;
    local.replaceChildren();
    const title = document.createElement('strong'); title.textContent = kind === 'welcome' ? 'معاينة الترحيب المباشرة' : 'معاينة لوحة الدعم المباشرة';
    local.append(title);
    if (source) local.append(source.cloneNode(true));
    else { const note = document.createElement('p'); note.textContent = 'فعّل هذا القسم لتظهر معاينته هنا.'; local.append(note); }
  }
  const logs = state.readyDraft.features.logs;
  if (logs?.enabled) {
    const channels = state.readyDraft.categories.flatMap(group => group.channels);
    const name = key => channels.find(channel => channel.key === key)?.name || 'قناة محذوفة';
    const box = document.createElement('div'); box.className = 'ready-log-preview';
    const heading = document.createElement('strong'); heading.textContent = 'مسار سجلات النشاط'; box.append(heading);
    const rules = logs.mode === 'routed' ? (logs.routes || []).map(rule => ({ sources: [...(rule.sourceKeys || []).map(name), ...(rule.sourceIds || []).map(id => state.data.channels?.find(channel => channel.id === id)?.name || 'قناة محذوفة')], target: name(rule.targetKey), events: (rule.events || logs.events || []).length })) : [{ sources: ['جميع القنوات'], target: name(logs.channelKey), events: (logs.events || []).length }];
    for (const rule of rules) {
      const row = document.createElement('p'); row.textContent = `${rule.sources.join('، ') || 'اختر قناة مصدر'} ← #${rule.target} · ${rule.events} أنواع أحداث`; box.append(row);
    }
    const note = document.createElement('small'); note.textContent = `${(logs.events || []).length} أنواع أحداث · نص المحذوف يظهر إذا سمح Discord للبوت بقراءته`; box.append(note);
    document.querySelector('#readyPreview .ready-discord main')?.append(box);
  }
  const guides = state.readyDraft.features.guides || [];
  const channels = state.readyDraft.categories.flatMap(group => group.channels);
  for (const module of state.readyDraft.features.modules || []) if (module.enabled) {
    const card = document.createElement('div'); card.className = 'ready-preview-card'; card.style.setProperty('--ready-accent', module.color || '#8d72e8');
    if (module.banner?.base64) { const img = document.createElement('img'); img.className = 'ready-banner'; img.alt = 'صورة الميزة'; img.src = `data:${module.banner.mime};base64,${module.banner.base64}`; card.append(img); }
    const title = document.createElement('strong'); title.textContent = module.title;
    const description = document.createElement('p'); description.textContent = module.description;
    const action = document.createElement('button'); action.className = 'btn small primary'; action.disabled = true; action.textContent = module.buttonLabel; action.style.background = ({ 1: '#5865f2', 2: '#4e5058', 3: '#248046', 4: '#da373c' })[Number(module.buttonStyle || 1)] || '#5865f2';
    const location = document.createElement('small'); location.textContent = `في #${channels.find(channel => channel.key === module.channelKey)?.name || 'اختر قناة'}`;
    card.append(title, description, action, location);
    document.querySelector('#readyPreview .ready-discord main')?.append(card);
  }
  for (const guide of guides) {
    const card = document.createElement('div'); card.className = 'ready-guide-preview';
    const title = document.createElement('strong'); title.textContent = guide.title;
    const description = document.createElement('p'); description.textContent = guide.description;
    const location = document.createElement('small'); location.textContent = `بطاقة بداية في #${channels.find(channel => channel.key === guide.channelKey)?.name || 'اختر قناة'}`;
    card.append(title, description, location);
    document.querySelector('#readyPreview .ready-discord main')?.append(card);
  }
}
function readySelectOptions(items, chosen) { return items.map(item => `<option data-i18n-preserve value="${esc(item.key)}" ${item.key === chosen ? 'selected' : ''}>${esc(item.name)}</option>`).join(''); }
async function readyTemplatesPage() {
  const epoch = state.epoch, guild = state.guild;
  $('#workspace').innerHTML = head('قوالب جاهزة لسيرفرك', 'اختر قالبًا، عدّل كل تفاصيله، ثم شاهد الفرق قبل أن يلمس البوت سيرفرك.') + '<div class="loading">نحمّل القوالب…</div>';
  const [catalog, runs, connected] = await Promise.all([state.readyCatalog ? Promise.resolve({ templates: state.readyCatalog }) : api('/api/ready-templates'), api(`/api/workspace/${encodeURIComponent(guild)}/ready-templates/runs`), api(`/api/ai/bot-connection?guildId=${encodeURIComponent(guild)}`)]);
  state.readyCatalog = catalog.templates;
  state.readyRuns = runs.runs || [];
  state.readyCustomBot = connected.bot;
  if (epoch !== state.epoch || guild !== state.guild || screen() !== 'ready-templates') return;
  const directKey = new URLSearchParams(location.search).get('template');
  if (!directKey && state.readyDraft) { readySaveDraft(); state.readyDraft = null; state.readyKey = null; }
  if (directKey && !state.readyDraft) {
    const template = state.readyCatalog.find(item => item.key === directKey);
    if (template) readyStart(template, false);
    else history.replaceState(null, '', url('ready-templates'));
  }
  renderReadyEditor();
}
function readyStart(template, navigate = true) {
  readySaveDraft();
  state.readyKey = template.key;
  let saved = state.readyDraftCache[readyDraftCacheKey(template.key)];
  try { saved ||= JSON.parse(sessionStorage.getItem(readyStorageKey(template.key)))?.definition; } catch {}
  state.readyDraft = structuredClone(saved?.categories && saved?.roles && saved?.features ? saved : template.definition);
  if (!Array.isArray(state.readyDraft.features.modules)) state.readyDraft.features.modules = structuredClone(template.definition.features.modules || []);
  state.readyMode = 'add';
  state.readyStep = 'identity';
  state.readyExecutor = state.readyCustomBot?.online ? 'custom' : 'diskoko';
  state.readyTicketDesignFile = null;
  state.readyTicketLogoFile = null;
  if (navigate) history.pushState(null, '', `${url('ready-templates').replace('#ready-templates', '')}&template=${encodeURIComponent(template.key)}#ready-templates`);
  renderReadyEditor();
}
function readyBackToLibrary() {
  readySaveDraft();
  state.readyDraft = null;
  state.readyKey = null;
  history.pushState(null, '', url('ready-templates'));
  renderReadyEditor();
}
function readyDraftUpdate(field, value) {
  const path = field.dataset.readyField?.split('.'); if (!path) return;
  let target = state.readyDraft;
  for (const part of path.slice(0, -1)) target = target[part];
  const key = path.at(-1);
  target[key] = field.type === 'checkbox' ? field.checked : field.type === 'number' || key === 'type' ? Number(value) : value;
  readySaveDraft();
  const preview = $('#readyPreview'); if (preview) { preview.innerHTML = readyPreview(state.readyDraft); readyDecoratePreview(); }
  const counts = $('#readyCounts'); if (counts) { const c = readyCounts(state.readyDraft); counts.textContent = `${fmt(c.units)} تغييرًا · ${fmt(c.categories)} تصنيفات · ${fmt(c.channels)} قنوات · ${fmt(c.roles)} رتب`; }
  const note = $('.ready-unit-note'); if (note) { const c = readyCounts(state.readyDraft); note.textContent = `الاستهلاك المتوقع: ${fmt(c.units)} تغييرًا = ${fmt(c.roles)} رتب + ${fmt(c.categories)} تصنيفات + ${fmt(c.channels)} قنوات + ${fmt(c.features)} ميزات وبطاقات. عند الإيقاف تُحسب الخطوات المكتملة فقط.`; }
}
function readyNewKey(prefix) { return `${prefix}-${Math.random().toString(36).slice(2, 9)}`; }
function readyRevision(key) { return state.readyCatalog?.find(item => item.key === key)?.revision || 1; }
function readyDraftCacheKey(key = state.readyKey) { return `${state.guild}:${key}:r${readyRevision(key)}`; }
function readyStorageKey(key = state.readyKey) { return `diskoko:template:${state.account?.user?.id}:${state.guild}:${key}${readyRevision(key) > 1 ? `:r${readyRevision(key)}` : ''}`; }
function readySaveDraft() {
  if (!state.readyKey || !state.readyDraft) return;
  state.readyDraftCache[readyDraftCacheKey()] = state.readyDraft;
  try {
    sessionStorage.setItem(readyStorageKey(), JSON.stringify({ definition: state.readyDraft }));
    if ($('#readyDraftStatus')) $('#readyDraftStatus').textContent = 'تعديلاتك محفوظة في هذه الجلسة؛ لم تُطبق على Discord.';
  } catch {
    if ($('#readyDraftStatus')) $('#readyDraftStatus').textContent = 'تعديلاتك محفوظة أثناء فتح الصفحة فقط. راجع القالب قبل تحديث الصفحة، خصوصًا الصور الكبيرة.';
  }
}
function botHierarchyNotice(context) {
  return `<div class="notice info bot-hierarchy-notice" role="note"><div><b>⚠ قبل ${context}: تأكد من صلاحيات البوت وترتيب رتبته</b><p>افتح Discord ← إعدادات السيرفر ← الرتب، وارفع رتبة <strong>البوت الذي اخترته للتنفيذ</strong> فوق الرتب التي سيُنشئها أو يعدّلها أو يحذفها. للتنصيب أو الاستبدال يحتاج إدارة القنوات وإدارة الرتب؛ ولنشر بطاقات الترحيب والدعم يحتاج أيضًا عرض القنوات وإرسال الرسائل والروابط المضمنة.</p><p>يمكن منح بوت موثوق صلاحية <strong>Administrator</strong> إذا أردت إعدادًا شاملًا، لكنها صلاحية واسعة واختيارية، ولا تُغني عن رفع رتبته فوق الرتب المستهدفة.</p><a href="https://support.discord.com/hc/en-us/articles/214836687-Discord-Roles-and-Permissions" target="_blank" rel="noopener noreferrer">شرح الرتب والصلاحيات في Discord ↗</a></div></div>`;
}
function readyCategory(template) {
  return template.category || (/gaming/.test(template.key) ? 'gaming' : /streamer/.test(template.key) ? 'streamer' : 'community');
}
const readyCategoryNames = { all: 'الكل', community: 'مجتمعات', gaming: 'ألعاب', streamer: 'صناع المحتوى', store: 'متاجر', esports: 'رياضات إلكترونية', academy: 'تعليم' };
const readyLanguageLabel = template => template?.language === 'ar-en' ? 'Arabic English' : template?.language === 'en' ? 'English' : 'Arabic';
function readyLibraryMarkup(templates) {
  const shown = templates.filter(template => (state.readyFilter === 'all' || readyCategory(template) === state.readyFilter) && (!state.readySearch || `${template.name} ${template.description}`.toLocaleLowerCase().includes(state.readySearch.toLocaleLowerCase()))).sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || Number(Boolean(b.highlights)) - Number(Boolean(a.highlights)));
  const cards = shown.map(template => {
    const c = readyCounts(template.definition), category = readyCategory(template);
    return `<article class="template ready-library-card"><div class="ready-library-art ready-library-art-${category}" aria-hidden="true"><span>${template.icon}</span><i></i><i></i><i></i></div><div class="ready-library-copy"><div class="ready-library-meta"><span class="ready-library-type">${readyCategoryNames[category]}${template.featured ? '<span class="ready-new-badge" lang="en">New</span>' : ''}</span><span class="ready-library-tags"><span class="ready-edition-badge" aria-label="رقم القالب">نسخة ${String(template.edition || 1).padStart(2, '0')}</span><span class="ready-language-badge" lang="en" aria-label="لغة القالب: ${esc(readyLanguageLabel(template))}">${esc(readyLanguageLabel(template))}</span></span></div><h3 data-i18n-preserve>${esc(template.name)}</h3><p>${esc(template.description)}</p>${template.highlights ? `<div class="ready-library-highlights">${template.highlights.map(item => `<span>${esc(item)}</span>`).join('')}</div>` : ''}<div class="ready-library-metrics"><span>${fmt(c.categories)} تصنيفات</span><span>${fmt(c.channels)} قنوات</span><span>${fmt(c.roles)} رتب</span></div><div class="ready-library-actions"><small>${fmt(c.units)} تغيير متوقع</small><button class="btn primary" data-ready-choose="${esc(template.key)}" type="button">استكشف القالب ←</button></div></div></article>`;
  }).join('');
  return `<section class="ready-library-hero"><div><span class="eyebrow">مكتبة Diskoko</span><h2>ابنِ مجتمعك كما تتخيله</h2><p>ابدأ بهيكل جاهز، ثم اضبط كل قناة ورتبة وميزة قبل التنصيب. ستشاهد القالب داخل معاينة Discord وتراجع الفروق قبل أي تغيير.</p></div><span class="ready-library-hero-mark" aria-hidden="true">▣</span></section><div class="ready-library-toolbar"><div class="ready-library-filters" role="group" aria-label="تصفية القوالب">${Object.entries(readyCategoryNames).map(([key,label]) => `<button class="ready-filter ${state.readyFilter === key ? 'active' : ''}" type="button" data-ready-filter="${key}">${label}</button>`).join('')}</div><label class="ready-library-search">ابحث في المكتبة<input type="search" id="readySearch" value="${esc(state.readySearch)}" placeholder="اسم القالب أو استخدامه"></label></div><div class="ready-library-result">${fmt(shown.length)} قوالب متاحة · القوالب الجديدة ستظهر هنا</div><div class="template-grid ready-library-grid">${cards || '<p class="ready-library-empty">لا توجد قوالب مطابقة. جرّب بحثًا آخر.</p>'}</div>`;
}
const readySteps = [['identity', 'الهوية'], ['roles', 'الرتب'], ['structure', 'القنوات'], ['features', 'الميزات'], ['platforms', 'المنصات'], ['install', 'التنصيب']];
const readyPlatforms = [
  { key: 'youtube', name: 'YouTube', icon: '▶', host: 'youtube.com', channel: '📺・يوتيوب' },
  { key: 'twitch', name: 'Twitch', icon: '◈', host: 'twitch.tv', channel: '🟣・تويتش' },
  { key: 'kick', name: 'Kick', icon: 'K', host: 'kick.com', channel: '🟢・كيك' },
  { key: 'tiktok', name: 'TikTok', icon: '♪', host: 'tiktok.com', channel: '🎬・تيك-توك' },
];
function readyPlatformMarkup() {
  return '<h3>مساحة منصاتك داخل السيرفر</h3><p class="form-note">أضف القنوات التي يحتاجها مجتمعك فقط. تُنشأ للقراءة، مع السماح لصانع المحتوى بالنشر إن كانت رتبته موجودة في القالب.</p><div class="notice info">هذه الخطوة تجهّز قناة ورابط منصتك. تنبيهات البث والمقاطع التلقائية غير مفعّلة هنا، وتحتاج ربط المنصة بخدمة تنبيهات مستقلة.</div><div class="ready-platforms">' + readyPlatforms.map(platform => {
    const channel = state.readyDraft.categories.flatMap(group => group.channels).find(item => item.key === `platform-${platform.key}`);
    return `<section class="ready-platform"><h3><span aria-hidden="true">${platform.icon}</span> ${platform.name}</h3><p>${channel ? 'القناة مضافة إلى القالب، ويمكن تعديلها في خطوة القنوات.' : 'قناة مخصصة لنشر محتواك يدويًا وروابط منصتك.'}</p><label>رابط حسابك (اختياري)<input type="url" dir="ltr" data-platform-url="${platform.key}" placeholder="https://${platform.host}/…" value="${esc(channel?.topic?.startsWith('https://') ? channel.topic : '')}"></label><button type="button" class="btn secondary" data-platform-add="${platform.key}">${channel ? 'تحديث رابط القناة' : '＋ إضافة قناة المنصة'}</button><small>التنبيهات التلقائية: غير مفعلة</small></section>`;
  }).join('') + '</div>';
}
function readyAddPlatform(key) {
  const platform = readyPlatforms.find(item => item.key === key);
  if (!platform) return;
  const link = document.querySelector(`[data-platform-url="${key}"]`).value.trim();
  if (link) {
    let parsed; try { parsed = new URL(link); } catch {}
    if (!parsed || parsed.protocol !== 'https:' || ![platform.host, `www.${platform.host}`].includes(parsed.hostname) || parsed.username || parsed.password) { toast(`اكتب رابط HTTPS من ${platform.host} لحسابك.`); return; }
  }
  const d = state.readyDraft;
  let channel = d.categories.flatMap(group => group.channels).find(item => item.key === `platform-${key}`);
  if (!channel) {
    if (d.categories.flatMap(group => group.channels).length >= 85) { toast('وصل القالب إلى الحد: 85 قناة. احذف قناة قبل الإضافة.'); return; }
    let group = d.categories.find(item => item.key === 'creator-platforms');
    if (!group) {
      if (d.categories.length >= 25) { toast('وصل القالب إلى الحد: 25 تصنيفًا. احذف تصنيفًا قبل الإضافة.'); return; }
      group = { key: 'creator-platforms', name: '📡・منصات صانع المحتوى', channels: [] }; d.categories.push(group);
    }
    channel = { key: `platform-${key}`, name: platform.channel, type: 0, access: 'read_only', ...(d.roles.some(role => role.key === 'streamer') ? { postRoleKey: 'streamer' } : {}) };
    group.channels.push(channel);
  }
  channel.topic = link || `محتوى ${platform.name} وروابطه — النشر يدوي، والتنبيهات التلقائية تحتاج تفعيل الربط.`;
  renderReadyEditor(); toast('حُفظت قناة المنصة في المسودة. ستُنشأ بعد المراجعة والتأكيد.');
}
function readySelectStep(key, scroll = false) {
  if (!readySteps.some(([id]) => id === key)) return;
  state.readyStep = key;
  document.querySelectorAll('[data-ready-step-pane]').forEach(pane => { pane.hidden = pane.dataset.readyStepPane !== key; });
  document.querySelectorAll('[data-ready-step]').forEach(button => {
    const selected = button.dataset.readyStep === key;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-current', selected ? 'step' : 'false');
  });
  const index = readySteps.findIndex(([id]) => id === key);
  const previous = $('#readyPreviousStep'), next = $('#readyNextStep');
  if (previous) previous.hidden = index === 0;
  if (next) { next.hidden = index === readySteps.length - 1; next.textContent = `التالي: ${readySteps[index + 1]?.[1] || ''} ←`; }
  if (scroll) $('.ready-detail-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function readyArrangeSteps() {
  const body = $('.ready-editor .panel-body'), layout = $('.ready-layout');
  if (!body || !layout) return;
  const panes = Object.fromEntries(readySteps.map(([key]) => {
    const pane = document.createElement('section'); pane.className = 'ready-step-pane'; pane.dataset.readyStepPane = key; pane.hidden = true;
    return [key, pane];
  }));
  let current = 'identity';
  for (const node of [...body.children]) {
    const heading = node.tagName === 'H3' ? node.textContent.trim() : '';
    if (heading === 'الرتب') current = 'roles';
    else if (heading === 'التصنيفات والقنوات') current = 'structure';
    else if (heading === 'التشغيل التلقائي' || heading === 'المميزات') current = 'features';
    else if (heading === 'طريقة التنصيب') current = 'install';
    panes[current].append(node);
  }
  body.append(...readySteps.map(([key]) => panes[key]));
  panes.platforms.innerHTML = readyPlatformMarkup();
  panes.platforms.querySelectorAll('[data-platform-add]').forEach(button => button.onclick = () => readyAddPlatform(button.dataset.platformAdd));
  const template = state.readyCatalog.find(item => item.key === state.readyKey);
  panes.identity.insertAdjacentHTML('afterbegin', `<h3>اجعل القالب مناسبًا لمجتمعك</h3><p class="form-note">${esc(template?.description || '')}</p><p class="form-note">هذا الاسم يعرّف مسودتك؛ لا يغيّر اسم سيرفرك. انتقل بين الخطوات بحرية، ولن يبدأ التنفيذ حتى تراجع التغييرات وتؤكدها.</p>`);
  panes.identity.insertAdjacentHTML('beforeend', `<div class="ready-identity-summary"><b>ما الذي تستطيع تخصيصه؟</b><p>أسماء الرتب وألوانها وصلاحياتها، ترتيب التصنيفات والقنوات وخصوصيتها، بطاقات الترحيب والدعم ومسارات سجلات النشاط.</p>${template?.source ? `<a href="${esc(template.source)}" target="_blank" rel="noopener noreferrer">مصدر الإلهام للقالب ↗</a>` : '<small>قالب أصلي من Diskoko</small>'}</div>`);
  const textChannels = state.readyDraft.categories.flatMap(group => group.channels).filter(channel => channel.type === 0);
  panes.features.insertAdjacentHTML('beforeend', `<section class="ready-guide-editor"><h4>بطاقات بداية مخصصة لهذا القالب</h4><p class="form-note">تُنشر هذه البطاقات مرة واحدة في القنوات المحددة بعد المراجعة. عدّل النصوص أو احذف البطاقة قبل التنصيب؛ كل بطاقة منشورة تُحسب تغييرًا واحدًا.</p>${(state.readyDraft.features.guides || []).map((guide, index) => `<div class="ready-guide-fields"><div class="ready-log-rule-head"><b>بطاقة ${fmt(index + 1)}</b><button class="btn text" type="button" data-ready-guide-remove="${index}">إزالة</button></div><label>العنوان<input data-ready-field="features.guides.${index}.title" maxlength="256" value="${esc(guide.title)}"></label><label>المحتوى<textarea data-ready-field="features.guides.${index}.description" maxlength="2000" rows="4">${esc(guide.description)}</textarea></label><label>قناة النشر<select data-ready-field="features.guides.${index}.channelKey">${readySelectOptions(textChannels, guide.channelKey)}</select></label></div>`).join('')}<button class="btn secondary" type="button" id="readyAddGuide" ${(state.readyDraft.features.guides || []).length >= 8 ? 'disabled' : ''}>＋ بطاقة بداية</button></section>`);
  const featureCards = [
    ['welcome', '👋', 'رسالة الترحيب', 'بطاقة وصورة العضو وقناة النشر'],
    ['ticket', '🛟', 'لوحة الدعم', 'زر التذكرة وفريق الاستجابة والتصميم'],
    ['logs', '📋', 'سجلات النشاط', 'سجل موحد أو مسارات مخصصة'],
    ['guides', '🧭', 'بطاقات البداية', 'إرشادات قابلة للتعديل داخل القنوات'],
  ];
  for (const [key, icon, title, subtitle] of featureCards) {
    const content = key === 'guides' ? panes.features.querySelector('.ready-guide-editor') : panes.features.querySelectorAll('.ready-feature')[['welcome', 'ticket', 'logs'].indexOf(key)];
    if (!content) continue;
    const details = document.createElement('details');
    details.className = 'ready-feature-card';
    details.dataset.readyFeatureCard = key;
    details.open = state.readyOpenFeature === key;
    const summary = document.createElement('summary');
    summary.innerHTML = `<span class="ready-feature-icon">${icon}</span><span><strong>${title}</strong><small>${subtitle}</small></span><span class="ready-feature-state">${key === 'guides' ? `${fmt(state.readyDraft.features.guides?.length || 0)} بطاقات` : state.readyDraft.features[key]?.enabled ? 'مفعّلة' : 'متوقفة'}</span>`;
    details.append(summary, content);
    details.addEventListener('toggle', () => { if (details.open) { state.readyOpenFeature = key; panes.features.querySelectorAll('.ready-feature-card').forEach(other => { if (other !== details) other.open = false; }); } else if (state.readyOpenFeature === key) state.readyOpenFeature = null; });
    panes.features.insertBefore(details, panes.features.querySelector('.ready-optional-integrations'));
  }
  const draft = state.readyDraft;
  const allTextChannels = draft.categories.flatMap(group => group.channels).filter(channel => channel.type === 0);
  const publicChannels = allTextChannels.filter(channel => channel.access !== 'private');
  const privateChannels = allTextChannels.filter(channel => channel.access === 'private');
  if (draft.features.modules?.length) panes.features.insertAdjacentHTML('beforeend', '<h4 class="ready-module-heading">مميزات إضافية لهذا القالب</h4><p class="form-note">اختر ما يناسب سيرفرك فقط. لا تُنشر الميزة ولا تُحسب من الرصيد حتى تفعّلها، ويمكنك معاينتها قبل التنصيب.</p>');
  for (const [index, module] of (draft.features.modules || []).entries()) {
    const meta = READY_MODULE_TYPES[module.kind]; if (!meta) continue;
    const details = document.createElement('details'); details.className = 'ready-feature-card ready-module-card'; details.open = state.readyOpenFeature === `module:${module.key}`;
    const summary = document.createElement('summary'); summary.innerHTML = `<span class="ready-feature-icon">${meta.icon}</span><span><strong>${esc(meta.label)}</strong><small>${esc(module.description || '')}</small></span><span class="ready-feature-state">${module.enabled ? 'مفعّلة' : 'اختيارية'}</span>`;
    details.append(summary);
    const body = document.createElement('div'); body.className = 'ready-module-fields';
    body.innerHTML = `<label class="check-row"><input type="checkbox" data-ready-field="features.modules.${index}.enabled" ${module.enabled ? 'checked' : ''}>تفعيل الميزة مع هذا القالب</label><label>عنوان اللوحة<input data-ready-field="features.modules.${index}.title" maxlength="256" value="${esc(module.title)}"></label><label>الوصف<textarea data-ready-field="features.modules.${index}.description" maxlength="2000" rows="3">${esc(module.description)}</textarea></label><label>نص الزر<input data-ready-field="features.modules.${index}.buttonLabel" maxlength="80" value="${esc(module.buttonLabel)}"></label><label>شكل الزر<select data-ready-field="features.modules.${index}.buttonStyle">${[[1,'بنفسجي'],[2,'رمادي'],[3,'أخضر'],[4,'أحمر']].map(([value,label]) => `<option value="${value}" ${Number(module.buttonStyle || 1) === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>قناة عرض اللوحة<select data-ready-field="features.modules.${index}.channelKey">${readySelectOptions(meta.staffOnly ? privateChannels : publicChannels, module.channelKey)}</select></label><label>لون اللوحة<input type="color" data-ready-field="features.modules.${index}.color" value="${esc(module.color || '#8d72e8')}"></label>${meta.form ? `<label>قناة مراجعة خاصة<select data-ready-field="features.modules.${index}.reviewChannelKey">${readySelectOptions(privateChannels, module.reviewChannelKey)}</select></label><label>اسم خانة الموضوع<input data-ready-field="features.modules.${index}.subjectLabel" maxlength="45" value="${esc(module.subjectLabel || 'الموضوع')}"></label><label>اسم خانة التفاصيل<input data-ready-field="features.modules.${index}.detailsLabel" maxlength="45" value="${esc(module.detailsLabel || 'التفاصيل أو الرابط')}"></label>` : ''}${meta.form || meta.staffOnly ? `<label>رتبة الفريق<select data-ready-field="features.modules.${index}.staffRoleKey">${readySelectOptions(draft.roles, module.staffRoleKey)}</select></label>` : ''}${meta.answer ? `<label>الإجابة التي تظهر عند الضغط<textarea data-ready-field="features.modules.${index}.answer" maxlength="1800" rows="4">${esc(module.answer || '')}</textarea></label>` : ''}${meta.role ? `<label>الرتبة العادية التي يستطيع العضو اختيارها<select data-ready-field="features.modules.${index}.roleKey">${readySelectOptions(draft.roles.filter(role => role.preset === 'member'), module.roleKey)}</select></label>` : ''}<label>صورة أو GIF للوحة (حتى 8 ميجابايت)<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-ready-module-image="${index}"></label>${module.banner ? `<button class="btn text" type="button" data-ready-module-image-remove="${index}">إزالة الصورة</button>` : ''}<div class="ready-module-live-preview"><strong>معاينة اللوحة</strong><div class="ready-preview-card" style="--ready-accent:${esc(module.color || '#8d72e8')}">${module.banner ? `<img class="ready-banner" src="data:${esc(module.banner.mime)};base64,${esc(module.banner.base64)}" alt="صورة الميزة">` : ''}<b>${esc(module.title)}</b><p>${esc(module.description)}</p><button class="btn small primary" disabled>${esc(module.buttonLabel)}</button></div></div>`;
    if (meta.form && READY_MODULE_FIELDS[module.kind]) {
      const [subject, detailsLabel, outcome] = READY_MODULE_FIELDS[module.kind];
      const subjectInput = body.querySelector(`[data-ready-field="features.modules.${index}.subjectLabel"]`);
      const detailsInput = body.querySelector(`[data-ready-field="features.modules.${index}.detailsLabel"]`);
      if (subjectInput && !module.subjectLabel) subjectInput.value = subject;
      if (detailsInput && !module.detailsLabel) detailsInput.value = detailsLabel;
      body.querySelector('.ready-module-live-preview').insertAdjacentHTML('beforebegin', `<p class="form-note">${esc(outcome)}</p>`);
    }
    if (meta.signup) {
      const date = module.startsAt ? new Date(module.startsAt) : null;
      const localDate = date && Number.isFinite(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
      body.querySelector('.ready-module-live-preview').insertAdjacentHTML('beforebegin', `<label>موعد الفعالية (اختياري)<input type="datetime-local" data-ready-module-start="${index}" value="${esc(localDate)}"></label><label>عدد الأماكن (صفر = بدون حد)<input type="number" min="0" max="10000" data-ready-field="features.modules.${index}.capacity" value="${Number(module.capacity || 0)}"></label>`);
    }
    details.append(body); details.addEventListener('toggle', () => { if (details.open) { state.readyOpenFeature = `module:${module.key}`; panes.features.querySelectorAll('.ready-feature-card').forEach(other => { if (other !== details) other.open = false; }); } else if (state.readyOpenFeature === `module:${module.key}`) state.readyOpenFeature = null; });
    panes.features.append(details);
  }
  if (template?.optionalIntegrations?.length) panes.features.insertAdjacentHTML('beforeend', `<section class="ready-optional-integrations" role="note"><h4>إضافات تحتاج ربطًا لاحقًا</h4><p>القنوات والرتب والميزات المعروضة أعلاه تُجهز مع القالب. الخيارات التالية غير مفعّلة بالتنصيب:</p><ul>${template.optionalIntegrations.map(item => `<li>${esc(item)}</li>`).join('')}</ul></section>`);
   const executor = $('.ready-executor-panel');
  if (executor) panes.install.prepend(executor);
  body.insertAdjacentHTML('beforeend', '<p id="readyDraftStatus" class="form-note" role="status"></p>');
  layout.insertAdjacentHTML('beforebegin', `<nav class="ready-steps" aria-label="مراحل إعداد القالب">${readySteps.map(([key,label],index) => `<button type="button" data-ready-step="${key}"><span>${fmt(index + 1)}</span>${label}</button>`).join('')}</nav>`);
  body.insertAdjacentHTML('beforeend', '<div class="ready-step-actions"><button class="btn secondary" id="readyPreviousStep" type="button">→ السابق</button><button class="btn primary" id="readyNextStep" type="button">التالي ←</button></div>');
  document.querySelectorAll('[data-ready-step]').forEach(button => button.onclick = () => readySelectStep(button.dataset.readyStep, true));
  $('#readyPreviousStep').onclick = () => readySelectStep(readySteps[Math.max(0, readySteps.findIndex(([id]) => id === state.readyStep) - 1)][0], true);
  $('#readyNextStep').onclick = () => readySelectStep(readySteps[Math.min(readySteps.length - 1, readySteps.findIndex(([id]) => id === state.readyStep) + 1)][0], true);
  readySelectStep(state.readyStep);
  readySaveDraft();
}
function renderReadyEditor() {
  if (screen() !== 'ready-templates') return;
  const templates = state.readyCatalog || [];
  const cards = readyLibraryMarkup(templates);
  const d = state.readyDraft;
  if (!d) {
    $('#workspace').innerHTML = head('مكتبة القوالب الجاهزة', 'تصفح القوالب واختر نقطة البداية المناسبة لسيرفرك.') + connectionNotice() + cards + panel('طريقة الاستخدام', '<p class="panel-body">اختر قالبًا لتفتح صفحة إعداداته ومعاينته. التنصيب يحتفظ بالموجود؛ الاستبدال ينشئ الجديد أولًا ثم يعرض ما سيُحذف للمراجعة. حذف القنوات يحذف رسائلها من Discord.</p>');
  } else {
    const channels = d.categories.flatMap(group => group.channels).filter(channel => channel.type === 0);
    const roleOptions = readySelectOptions(d.roles, '');
    const channelOptions = readySelectOptions(channels, '');
    const c = readyCounts(d);
    const template = templates.find(item => item.key === state.readyKey);
    const detailHeader = `<div class="ready-detail-heading"><button class="btn secondary" id="readyBack" type="button">→ مكتبة القوالب</button><span>${esc(template?.icon || '▣')} ${esc(template?.name || d.name)}</span><span class="ready-edition-badge">نسخة ${String(template?.edition || 1).padStart(2, '0')}</span><span class="ready-language-badge" lang="en" aria-label="لغة القالب: ${esc(readyLanguageLabel(template))}">${esc(readyLanguageLabel(template))}</span><small>${fmt(c.units)} تغيير متوقع · ${fmt(c.categories)} تصنيفات · ${fmt(c.channels)} قنوات</small><button class="btn text" id="readyReset" type="button">إعادة القالب الأصلي</button></div>`;
    $('#workspace').innerHTML = head('قوالب جاهزة لسيرفرك', 'عدّل الأسماء والترتيب والصلاحيات والميزات، ثم راجع الفروق والتطبيق.') + connectionNotice() + detailHeader + `<div class="ready-layout"><section class="panel ready-editor"><div class="panel-head"><h3>تفاصيل القالب</h3><span id="readyCounts" class="badge purple">${fmt(c.categories)} تصنيفات · ${fmt(c.channels)} قنوات · ${fmt(c.roles)} رتب</span></div><div class="panel-body"><label>اسم القالب في مراجعتك<input data-ready-field="name" maxlength="100" value="${esc(d.name)}"></label><h3>الرتب</h3><p class="form-note">لا يمنح أي قالب صلاحية Administrator. الرتب الإدارية محدودة للإشراف ويمكن تعديلها قبل التنفيذ.</p>${d.roles.map((role, i) => `<div class="ready-edit-row"><input aria-label="اسم الرتبة" data-ready-field="roles.${i}.name" maxlength="100" value="${esc(role.name)}"><select aria-label="صلاحيات الرتبة" data-ready-field="roles.${i}.preset">${[['member','عضو'],['vip','مميز'],['support','دعم'],['moderator','إشراف محدود']].map(([value,label]) => `<option value="${value}" ${role.preset === value ? 'selected' : ''}>${label}</option>`).join('')}</select><input aria-label="لون الرتبة" type="color" data-ready-field="roles.${i}.color" value="#${Number(role.color).toString(16).padStart(6, '0')}"><button class="btn text" data-ready-remove="role:${i}" title="إزالة الرتبة">×</button></div>`).join('')}<button class="btn secondary" data-ready-add="role">＋ رتبة</button><h3>التصنيفات والقنوات</h3>${d.categories.map((group, gi) => `<section class="ready-group"><div class="ready-group-head"><input aria-label="اسم التصنيف" data-ready-field="categories.${gi}.name" maxlength="100" value="${esc(group.name)}"><button class="btn text" data-ready-move="category:${gi}:-1" title="رفع التصنيف">↑</button><button class="btn text" data-ready-move="category:${gi}:1" title="تنزيل التصنيف">↓</button><button class="btn text" data-ready-remove="category:${gi}" title="إزالة التصنيف">×</button></div>${group.channels.map((channel, ci) => `<div class="ready-channel-row"><input aria-label="اسم القناة" data-ready-field="categories.${gi}.channels.${ci}.name" maxlength="100" value="${esc(channel.name)}"><select aria-label="نوع القناة" data-ready-field="categories.${gi}.channels.${ci}.type"><option value="0" ${channel.type === 0 ? 'selected' : ''}>نصية</option><option value="2" ${channel.type === 2 ? 'selected' : ''}>صوتية</option></select><select aria-label="وصول القناة" data-ready-field="categories.${gi}.channels.${ci}.access"><option value="public" ${!channel.access || channel.access === 'public' ? 'selected' : ''}>عامة</option><option value="read_only" ${channel.access === 'read_only' ? 'selected' : ''}>قراءة فقط</option><option value="private" ${channel.access === 'private' ? 'selected' : ''}>خاصة</option></select>${channel.access === 'private' ? `<select aria-label="رتبة القناة الخاصة" data-ready-field="categories.${gi}.channels.${ci}.roleKey">${readySelectOptions(d.roles, channel.roleKey)}</select>` : ''}<button class="btn text" data-ready-move="channel:${gi}:${ci}:-1" title="رفع القناة">↑</button><button class="btn text" data-ready-move="channel:${gi}:${ci}:1" title="تنزيل القناة">↓</button><button class="btn text" data-ready-remove="channel:${gi}:${ci}" title="إزالة القناة">×</button>${channel.type === 0 ? `<input class="ready-topic" aria-label="وصف القناة" placeholder="وصف القناة (اختياري)" maxlength="1024" data-ready-field="categories.${gi}.channels.${ci}.topic" value="${esc(channel.topic || '')}">` : ''}</div>`).join('')}<button class="btn text" data-ready-add="channel:${gi}">＋ قناة داخل التصنيف</button></section>`).join('')}<button class="btn secondary" data-ready-add="category">＋ تصنيف</button><h3>المميزات</h3><p class="form-note">افتح الميزة التي تريد تخصيصها، وشاهد معاينتها قبل التنصيب.</p><div class="ready-feature"><label class="check-row"><input type="checkbox" data-ready-field="features.welcome.enabled" ${d.features.welcome?.enabled ? 'checked' : ''}>بطاقة ترحيب لكل عضو جديد</label><label>العنوان<input data-ready-field="features.welcome.title" maxlength="256" value="${esc(d.features.welcome?.title || '')}"></label><label>الرسالة<textarea data-ready-field="features.welcome.description" maxlength="2000" rows="2">${esc(d.features.welcome?.description || '')}</textarea></label><label>قناة الترحيب<select data-ready-field="features.welcome.channelKey">${readySelectOptions(channels, d.features.welcome?.channelKey)}</select></label><label>لون البطاقة<input type="color" data-ready-field="features.welcome.color" value="${esc(d.features.welcome?.color || '#8d72e8')}"></label></div><div class="ready-feature"><label class="check-row"><input type="checkbox" data-ready-field="features.ticket.enabled" ${d.features.ticket?.enabled ? 'checked' : ''}>لوحة دعم بزر فتح تذكرة</label><label>العنوان<input data-ready-field="features.ticket.title" maxlength="256" value="${esc(d.features.ticket?.title || '')}"></label><label>الوصف<textarea data-ready-field="features.ticket.description" maxlength="2000" rows="2">${esc(d.features.ticket?.description || '')}</textarea></label><label>قناة لوحة الدعم<select data-ready-field="features.ticket.channelKey">${channelOptions.replace(`value="${esc(d.features.ticket?.channelKey)}"`, `value="${esc(d.features.ticket?.channelKey)}" selected`)}</select></label><label>رتبة الدعم<select data-ready-field="features.ticket.staffRoleKey">${roleOptions.replace(`value="${esc(d.features.ticket?.staffRoleKey)}"`, `value="${esc(d.features.ticket?.staffRoleKey)}" selected`)}</select></label></div><div class="ready-feature"><label class="check-row"><input type="checkbox" data-ready-field="features.logs.enabled" ${d.features.logs?.enabled ? 'checked' : ''}>سجلات نشاط السيرفر والأوامر</label><label>قناة السجل<select data-ready-field="features.logs.channelKey">${channelOptions.replace(`value="${esc(d.features.logs?.channelKey)}"`, `value="${esc(d.features.logs?.channelKey)}" selected`)}</select></label><p class="form-note">اختر الأحداث والقنوات التي تريد تسجيلها.</p></div><h3>طريقة التنصيب</h3><label class="check-row"><input type="radio" name="readyMode" value="add" ${state.readyMode === 'add' ? 'checked' : ''}>تنصيب بجانب القنوات والرتب الموجودة</label><label class="check-row"><input type="radio" name="readyMode" value="replace" ${state.readyMode === 'replace' ? 'checked' : ''}>استبدال الموجود بعد بناء القالب الجديد</label><p class="form-note">الاستبدال يحذف قنوات Discord ورسائلها ورتب الأعضاء القديمة؛ العناصر التي يحميها Discord أو تعلو رتبة البوت تبقى ويظهر اسمها في المراجعة.</p><button class="btn primary" id="readyReview" ${!state.data.connection.readable ? 'disabled' : ''}>معاينة التغييرات والمراجعة ←</button></div></section><section class="panel ready-preview-pane"><div class="panel-head"><h3>شكل القالب داخل Discord</h3></div><div id="readyPreview">${readyPreview(d)}</div></section></div>`;
  }
  const readyAnchor = $('#workspace .ready-detail-heading') || $('#workspace .template-grid');
   if (!d && state.readyRuns.length) readyAnchor?.insertAdjacentHTML('afterend', panel('المراجعات والتنفيذ السابق', `<div class="rows">${state.readyRuns.map(item => `<div class="row"><div class="row-main"><b data-i18n-preserve>${esc(item.name || templates.find(template => template.key === item.template_key)?.name || item.template_key)}</b><small>${item.mode === 'replace' ? 'استبدال' : 'تنصيب'} · ${date(item.updated_at)}${item.status === 'cancelled' ? ` · نُفّذ ${fmt(item.completed_units || 0)} تغييرًا وتوقّف الباقي` : ''}</small></div>${status(item.status)}<button class="btn secondary" data-ready-run="${esc(item.id)}">${['succeeded','cancelled','cancel_requested'].includes(item.status) ? 'التفاصيل' : 'متابعة'}</button>${['draft','running','failed','cancel_requested'].includes(item.status) ? `<button class="btn text" data-ready-cancel="${esc(item.id)}">${item.status === 'cancel_requested' ? 'إكمال الإيقاف' : 'إيقاف القالب'}</button>` : ''}</div>`).join('')}</div>`));
   if (d) readyAnchor?.insertAdjacentHTML('beforebegin', '<div class="ready-admin-banner" role="note"><strong>⚠️ قبل تنصيب القالب</strong><span>لإكمال الرتب والقنوات والإعدادات، امنح البوت المختار صلاحية Administrator وارفع رتبته فوق الرتب التي سيعدلها. صلاحية Administrator لا تتجاوز ترتيب الرتب.</span><a href="/account.html#bots">إعدادات البوت ↗</a></div>');
  if (d) readyAnchor?.insertAdjacentHTML('beforebegin', '<section class="ready-executor-panel" aria-label="اختيار بوت تنفيذ القالب"></section>');
  const botNotice = $('#workspace .ready-executor-panel');
  if (botNotice) {
    botNotice.innerHTML = `<div class="ready-executor-head"><div><span class="ready-executor-kicker">تخصيص القالب</span><h3>اختر بوت التنفيذ</h3><p>سيستخدم القالب البوت الذي تختاره لإنشاء القنوات والرتب وتشغيل الميزات.</p></div>${action(state.readyCustomBot ? 'إدارة ربط البوت' : 'ربط بوتك الخاص', 'settings')}</div><div class="ready-executor-options"><label class="ready-executor-option"><input type="radio" name="readyExecutor" value="diskoko" ${state.readyExecutor !== 'custom' ? 'checked' : ''}><span class="ready-executor-icon" aria-hidden="true"><img src="/assets/diskoko-logo.png" alt=""></span><span class="ready-executor-copy"><strong>بوت ديسكوكو</strong><small>${state.data.bot?.online ? 'متصل وجاهز' : 'سيُفحص الاتصال قبل التنفيذ'}</small></span></label><label class="ready-executor-option"><input type="radio" name="readyExecutor" value="custom" ${state.readyExecutor === 'custom' ? 'checked' : ''}><span class="ready-executor-icon" aria-hidden="true">🤖</span><span class="ready-executor-copy"><strong>بوتك الخاص</strong><small>${state.readyCustomBot ? `${esc(state.readyCustomBot.name)} · ${state.readyCustomBot.online ? 'متصل' : 'غير متصل'}` : 'اربط بوتك لتستخدمه في التنفيذ'}</small></span></label></div><p class="ready-executor-foot">لا يبدأ أي تغيير قبل مراجعتك، وسنتحقق من اتصال البوت وصلاحياته.</p>`;
  }
  document.querySelectorAll('input[name="readyExecutor"]').forEach(input => input.onchange = () => { state.readyExecutor = input.value; });
  document.querySelectorAll('[data-ready-choose]').forEach(button => button.onclick = () => { const template = templates.find(item => item.key === button.dataset.readyChoose); if (template) readyStart(template); });
  document.querySelectorAll('[data-ready-run]').forEach(button => button.onclick = run(async () => { const result = await api(`/api/workspace/${encodeURIComponent(state.guild)}/ready-templates/runs/${encodeURIComponent(button.dataset.readyRun)}`); readyReviewDialog(result); }));
   document.querySelectorAll('[data-ready-cancel]').forEach(button => button.onclick = () => confirmDialog('إيقاف هذا القالب؟', 'ستبقى العناصر التي نُفذت في Discord، وستتوقف الخطوات المتبقية. يُحتسب من رصيدك ما اكتمل فقط، ويمكنك إنشاء مراجعة جديدة لاحقًا.', 'نعم، أوقف القالب', async () => {
     const result = await api(`/api/workspace/${encodeURIComponent(state.guild)}/ready-templates/runs/${encodeURIComponent(button.dataset.readyCancel)}/cancel`, { method: 'POST', body: '{}' });
     closeDialog(); await readyTemplatesPage();
     toast(result.run.status === 'cancelled' ? `أُوقف القالب. اكتمل ${fmt(result.run.completed_units || 0)} تغييرًا، وتوقّف الباقي.` : 'وصل طلب الإيقاف. سيقف التنفيذ بعد الخطوة الجارية؛ افتح القائمة لتتابع الحالة.');
   }));
  $('#readyBack')?.addEventListener('click', readyBackToLibrary);
  $('#readyReset')?.addEventListener('click', () => confirmDialog('إعادة القالب الأصلي؟', 'ستُزال تعديلات هذه الصفحة فقط. لن يتغير سيرفرك في Discord.', 'إعادة الأصل', () => {
    try { sessionStorage.removeItem(readyStorageKey()); } catch {}
    delete state.readyDraftCache[readyDraftCacheKey()];
    state.readyDraft = structuredClone(templates.find(item => item.key === state.readyKey).definition);
    closeDialog(); renderReadyEditor();
  }));
  document.querySelectorAll('[data-ready-filter]').forEach(button => button.onclick = () => { state.readyFilter = button.dataset.readyFilter; renderReadyEditor(); });
  $('#readySearch')?.addEventListener('input', event => {
    state.readySearch = event.target.value;
    const start = event.target.selectionStart;
    renderReadyEditor();
    $('#readySearch')?.focus({ preventScroll: true });
    $('#readySearch')?.setSelectionRange(start, start);
  });
  if (!d) return;
  if ($('#readyCounts')) $('#readyCounts').textContent = `${fmt(readyCounts(d).units)} تغييرًا · ${fmt(readyCounts(d).categories)} تصنيفات · ${fmt(readyCounts(d).channels)} قنوات · ${fmt(readyCounts(d).roles)} رتب`;
  const modeTitle = [...document.querySelectorAll('.ready-editor h3')].find(node => node.textContent === 'طريقة التنصيب');
  if (modeTitle) {
    const modeBox = document.createElement('div'); modeBox.className = 'ready-mode-choice';
    modeTitle.after(modeBox);
    let next = modeBox.nextElementSibling;
    while (next && (next.matches('label.check-row') || next.matches('p.form-note'))) { const following = next.nextElementSibling; modeBox.append(next); next = following; }
    modeBox.querySelectorAll('label').forEach((label, index) => { label.innerHTML += `<small>${index === 0 ? 'يبقي كل القنوات والرتب الحالية ويضيف عناصر القالب فقط.' : 'ينشئ القالب أولًا، ثم يحذف القنوات والرتب القديمة التي تسمح صلاحيات البوت بحذفها. ستراجع قائمة الحذف قبل التأكيد.'}</small>`; });
  }
  $('#readyCounts')?.closest('.panel-head')?.insertAdjacentHTML('afterend', `<p class="form-note ready-unit-note">الاستهلاك المتوقع: ${fmt(readyCounts(d).units)} تغييرًا = ${fmt(readyCounts(d).roles)} رتب + ${fmt(readyCounts(d).categories)} تصنيفات + ${fmt(readyCounts(d).channels)} قنوات + ${fmt(readyCounts(d).features)} ميزات وبطاقات. عند الإيقاف تُحسب الخطوات المكتملة فقط.</p>`);
  const [welcomeSection, ticketSection, logsSection] = document.querySelectorAll('.ready-feature');
  document.querySelectorAll('.ready-edit-row').forEach((row, index) => row.insertAdjacentHTML('beforeend', `<button class="btn text" data-ready-move="role:${index}:-1" title="رفع الرتبة">↑</button><button class="btn text" data-ready-move="role:${index}:1" title="تنزيل الرتبة">↓</button>`));
  d.categories.forEach((group, gi) => group.channels.forEach((channel, ci) => {
    if (channel.type !== 0 || channel.access !== 'read_only') return;
    const accessField = document.querySelector(`[data-ready-field="categories.${gi}.channels.${ci}.access"]`);
    accessField?.closest('.ready-channel-row')?.insertAdjacentHTML('beforeend', `<label class="ready-post-role">من يستطيع النشر في هذه القناة؟<select data-ready-field="categories.${gi}.channels.${ci}.postRoleKey"><option value="">الإدارة والبوت فقط</option>${d.roles.map(role => `<option data-i18n-preserve value="${esc(role.key)}" ${channel.postRoleKey === role.key ? 'selected' : ''}>${esc(role.name)}</option>`).join('')}</select></label>`);
  }));
  welcomeSection.insertAdjacentHTML('beforeend', `<label>صورة الترحيب أو GIF (حتى 8 ميجابايت)<input id="readyWelcomeImage" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label><button class="btn text" id="readyRemoveImage" ${d.features.welcome?.banner ? '' : 'hidden'}>إزالة الصورة الحالية</button><label>موضع صورة العضو<select data-ready-field="features.welcome.avatarPosition"><option value="right" ${!d.features.welcome?.avatarPosition || d.features.welcome.avatarPosition === 'right' ? 'selected' : ''}>يمين</option><option value="left" ${d.features.welcome?.avatarPosition === 'left' ? 'selected' : ''}>يسار</option><option value="top" ${d.features.welcome?.avatarPosition === 'top' ? 'selected' : ''}>أعلى</option></select></label><label>موضع الصورة<select data-ready-field="features.welcome.bannerPosition"><option value="below" ${d.features.welcome?.bannerPosition !== 'above' ? 'selected' : ''}>أسفل البطاقة</option><option value="above" ${d.features.welcome?.bannerPosition === 'above' ? 'selected' : ''}>أعلى البطاقة</option></select></label>`);
  welcomeSection.insertAdjacentHTML('beforeend', `<label class="check-row"><input type="checkbox" data-ready-field="features.welcome.composite" ${d.features.welcome?.composite ? 'checked' : ''}>ضع صورة العضو داخل التصميم المرفوع</label><label>مكان صورة العضو داخل التصميم<select data-ready-field="features.welcome.avatarPosition"><option value="right" ${d.features.welcome?.avatarPosition === 'right' ? 'selected' : ''}>يمين</option><option value="center" ${d.features.welcome?.avatarPosition === 'center' ? 'selected' : ''}>الوسط</option><option value="left" ${d.features.welcome?.avatarPosition === 'left' ? 'selected' : ''}>يسار</option><option value="top" ${d.features.welcome?.avatarPosition === 'top' ? 'selected' : ''}>فوق البطاقة (بدون دمج)</option></select></label><label>تحريك صورة العضو أعلى وأسفل <output id="readyAvatarYValue">${Number(d.features.welcome?.avatarVertical ?? 50)}%</output><input type="range" min="15" max="85" data-ready-field="features.welcome.avatarVertical" value="${Number(d.features.welcome?.avatarVertical ?? 50)}"></label><label>حجم صورة العضو <output id="readyAvatarSizeValue">${Number(d.features.welcome?.avatarRadius ?? 95)}</output><input type="range" min="60" max="160" data-ready-field="features.welcome.avatarRadius" value="${Number(d.features.welcome?.avatarRadius ?? 95)}"></label><p class="form-note">عند الدمج تُستخدم صورة العضو الحقيقية عند انضمامه. معاينة الصورة هنا مثال. التصميم الثابت يُجهّز بمقاس 1200×480 تلقائيًا.</p>`);
  ticketSection.insertAdjacentHTML('beforeend', `<label>لون لوحة الدعم<input type="color" data-ready-field="features.ticket.color" value="${esc(d.features.ticket?.color || '#8d72e8')}"></label><label>نص زر الدعم<input data-ready-field="features.ticket.buttonLabel" maxlength="80" value="${esc(d.features.ticket?.buttonLabel || 'فتح تذكرة دعم')}"></label><label>صورة لوحة الدعم أو GIF (حتى 8 ميجابايت)<input id="readyTicketImage" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label><button class="btn text" id="readyRemoveTicketImage" ${d.features.ticket?.banner ? '' : 'hidden'}>إزالة صورة الدعم</button><label>موضع صورة الدعم<select data-ready-field="features.ticket.bannerPosition"><option value="below" ${d.features.ticket?.bannerPosition !== 'above' ? 'selected' : ''}>أسفل النص</option><option value="above" ${d.features.ticket?.bannerPosition === 'above' ? 'selected' : ''}>فوق النص</option></select></label>`);
  ticketSection.insertAdjacentHTML('beforeend', `<label>طريقة عرض صورة الدعم<select data-ready-field="features.ticket.imageStyle"><option value="normal" ${!['logo','design'].includes(d.features.ticket?.imageStyle) ? 'selected' : ''}>صورة عادية</option><option value="logo" ${d.features.ticket?.imageStyle === 'logo' ? 'selected' : ''}>شعار صغير داخل البطاقة</option><option value="design" ${d.features.ticket?.imageStyle === 'design' ? 'selected' : ''}>دمج شعار دائري داخل تصميمك</option></select></label><div id="readyTicketDesignControls" class="ready-design-controls" ${d.features.ticket?.imageStyle === 'design' ? '' : 'hidden'}><label>شعار السيرفر داخل التصميم<input id="readyTicketLogo" type="file" accept="image/png,image/jpeg,image/webp"></label><label>تحريك الشعار يمينًا ويسارًا <output id="readyTicketXValue">${Number(d.features.ticket?.logoX ?? 50)}%</output><input id="readyTicketX" type="range" min="10" max="90" value="${Number(d.features.ticket?.logoX ?? 50)}"></label><label>تحريك الشعار أعلى وأسفل <output id="readyTicketYValue">${Number(d.features.ticket?.logoY ?? 50)}%</output><input id="readyTicketY" type="range" min="25" max="75" value="${Number(d.features.ticket?.logoY ?? 50)}"></label><small class="form-note">ارفع تصميمًا ثابتًا وشعارًا، ثم حرّك موضع الشعار. تظهر النتيجة في المعاينة قبل النشر.</small></div>`);
  const logs = d.features.logs;
  const logTargets = d.categories.flatMap(group => group.channels).filter(channel => channel.type === 0);
  logsSection.querySelector('[data-ready-field="features.logs.channelKey"]').closest('label').classList.add('ready-log-unified-target');
   logsSection.querySelector('.form-note').textContent = 'اختر سجلًا واحدًا لكل الأحداث، أو وزّعها بقواعد تربط عدة قنوات مصدر بقناة سجل واحدة. نص الرسالة المحذوفة يظهر فقط إذا كان متاحًا للبوت من Discord، وتُجمع الإشعارات لتفادي الإرسال المفرط.';
  const logEventOptions = [['message_create','رسالة جديدة'],['message_update','تعديل رسالة'],['message_delete','حذف رسالة'],['voice_join','دخول صوتي'],['voice_leave','خروج صوتي'],['command','أوامر البوت']];
  logsSection.insertAdjacentHTML('beforeend', `<label>طريقة توزيع اللوقات<select id="readyLogMode"><option value="unified" ${logs.mode !== 'routed' ? 'selected' : ''}>سجل واحد يجمع كل الأحداث</option><option value="routed" ${logs.mode === 'routed' ? 'selected' : ''}>توزيع مخصص حسب القنوات ونوع الحدث</option></select></label>
    <div class="ready-log-events" ${logs.mode === 'routed' ? 'hidden' : ''}><b>الأحداث في السجل الموحد</b>${logEventOptions.map(([key,label]) => `<label class="check-row"><input type="checkbox" data-ready-log-event="${key}" ${(logs.events || []).includes(key) ? 'checked' : ''}>${label}</label>`).join('')}</div>
    <div id="readyLogRoutes" class="ready-log-routes" ${logs.mode === 'routed' ? '' : 'hidden'}><p class="form-note">لكل قاعدة اختر نوع اللوق والقنوات التي تراقبها وقناة الاستقبال. يمكن جمع عدة مصادر في سجل واحد، أو تخصيص سجل مستقل للقنوات الخاصة.</p>${(logs.routes || []).map((rule,index) => `<div class="ready-log-rule"><div class="ready-log-rule-head"><b>قاعدة اللوق ${fmt(index + 1)}</b><button class="btn text" type="button" data-ready-log-remove="${index}">إزالة</button></div><details ${index === 0 ? 'open' : ''}><summary>القنوات المصدر (${fmt((rule.sourceKeys || []).length + (rule.sourceIds || []).length)})</summary><div class="ready-log-sources">${d.categories.flatMap(group => group.channels).map(channel => `<label class="check-row"><input type="checkbox" data-ready-log-source="${index}:${esc(channel.key)}" ${(rule.sourceKeys || []).includes(channel.key) ? 'checked' : ''}>${channel.type === 2 ? '🔊' : '#'} ${esc(channel.name)}</label>`).join('')}</div></details><details class="ready-log-rule-events"><summary>أنواع الأحداث (${fmt((rule.events || logs.events || []).length)})</summary><div class="ready-log-events">${logEventOptions.map(([key,label]) => `<label class="check-row"><input type="checkbox" data-ready-log-route-event="${index}:${key}" ${(rule.events || logs.events || []).includes(key) ? 'checked' : ''}>${label}</label>`).join('')}</div></details><label>قناة استقبال هذا اللوق<select data-ready-field="features.logs.routes.${index}.targetKey">${logTargets.map(channel => `<option value="${esc(channel.key)}" ${channel.key === rule.targetKey ? 'selected' : ''}>${channel.access === 'private' ? '🔒 خاصة' : '# عامة'} ${esc(channel.name)}</option>`).join('')}</select></label><small class="form-note">لوق القناة الخاصة اختر له قناة استقبال 🔒 خاصة حتى لا يظهر للأعضاء.</small></div>`).join('')}<button class="btn secondary" type="button" id="readyAddLogRoute" ${(logs.routes || []).length >= 10 ? 'disabled' : ''}>＋ أضف قاعدة لوق</button></div>`);
  logsSection.querySelector('.ready-log-unified-target').hidden = logs.mode === 'routed';
  logsSection.querySelectorAll('.ready-log-rule').forEach((row, index) => {
    const sources = row.querySelector('.ready-log-sources');
    row.querySelector('summary').textContent = `القنوات المصدر (${fmt((logs.routes[index].sourceKeys || []).length + (logs.routes[index].sourceIds || []).length)})`;
    const existing = (state.data.channels || []).filter(channel => [0, 2, 5].includes(channel.type));
    if (!existing.length) return;
    sources.insertAdjacentHTML('beforeend', `<b>قنوات موجودة في السيرفر</b>${existing.map(channel => `<label class="check-row"><input type="checkbox" data-ready-log-existing="${index}:${esc(channel.id)}" ${(logs.routes[index].sourceIds || []).includes(channel.id) ? 'checked' : ''}>${channel.type === 2 ? '🔊' : '#'} ${esc(channel.name)}</label>`).join('')}`);
  });
  welcomeSection.querySelector('[data-ready-field="features.welcome.avatarPosition"]').closest('label').remove();
  for (const [section, kind] of [[welcomeSection, 'welcome'], [ticketSection, 'ticket']]) {
    section.classList.add('ready-feature-with-preview');
    const fields = document.createElement('div'); fields.className = 'ready-feature-fields';
    while (section.firstChild) fields.append(section.firstChild);
    const inline = document.createElement('aside'); inline.className = 'ready-feature-inline'; inline.id = `ready-${kind}-inline-preview`;
    inline.setAttribute('aria-live', 'polite');
    section.append(fields, inline);
  }
  readyDecoratePreview();
  readyArrangeSteps();
  $('#readyWelcomeImage').onchange = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 8 * 1024 * 1024) { toast('اختر صورة PNG أو JPG أو WebP أو GIF بحجم 8 ميجابايت أو أقل.'); event.target.value = ''; return; }
    const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
    d.features.welcome.banner = d.features.welcome.composite && file.type !== 'image/gif' ? await prepareWelcomeBackground(file) : { mime: file.type, base64: dataUrl.split(',')[1] };
    $('#readyPreview').innerHTML = readyPreview(d); readyDecoratePreview(); readySaveDraft(); $('#readyRemoveImage').hidden = false;
  };
  $('#readyRemoveImage').onclick = () => { d.features.welcome.banner = null; $('#readyWelcomeImage').value = ''; $('#readyPreview').innerHTML = readyPreview(d); readyDecoratePreview(); $('#readyRemoveImage').hidden = true; };
  let ticketArtworkVersion = 0;
  const updateTicketArtwork = async () => {
    const version = ++ticketArtworkVersion;
    const file = state.readyTicketDesignFile, logo = state.readyTicketLogoFile;
    if (!file) return;
    if (d.features.ticket.imageStyle === 'design') {
      if (!logo) return;
      if (file.type === 'image/gif') throw Error('دمج الشعار داخل التصميم يحتاج PNG أو JPG أو WebP. استخدم GIF في العرض العادي.');
      const image = await prepareWelcomeBackground(file, logo, d.features.ticket.logoX ?? 50, d.features.ticket.logoY ?? 50);
      if (version !== ticketArtworkVersion) return;
      d.features.ticket.banner = image;
    } else {
      const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
      if (version !== ticketArtworkVersion) return;
      d.features.ticket.banner = { mime: file.type, base64: dataUrl.split(',')[1] };
    }
    $('#readyPreview').innerHTML = readyPreview(d); readyDecoratePreview(); $('#readyRemoveTicketImage').hidden = false;
  };
  $('#readyTicketImage').onchange = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 8 * 1024 * 1024) { toast('اختر صورة PNG أو JPG أو WebP أو GIF بحجم 8 ميجابايت أو أقل.'); event.target.value = ''; return; }
    state.readyTicketDesignFile = file;
    try { await updateTicketArtwork(); } catch (error) { toast(error.message); }
  };
  $('#readyTicketLogo').onchange = async event => { state.readyTicketLogoFile = event.target.files?.[0] || null; try { await updateTicketArtwork(); } catch (error) { toast(error.message); } };
  for (const axis of ['X', 'Y']) $(`#readyTicket${axis}`).oninput = async event => { d.features.ticket[`logo${axis}`] = Number(event.target.value); $(`#readyTicket${axis}Value`).textContent = `${event.target.value}%`; try { await updateTicketArtwork(); } catch (error) { toast(error.message); } };
  $('#readyRemoveTicketImage').onclick = () => { ticketArtworkVersion++; d.features.ticket.banner = null; state.readyTicketDesignFile = null; state.readyTicketLogoFile = null; $('#readyTicketImage').value = ''; $('#readyTicketLogo').value = ''; $('#readyPreview').innerHTML = readyPreview(d); readyDecoratePreview(); $('#readyRemoveTicketImage').hidden = true; };
  document.querySelectorAll('[data-ready-field]').forEach(field => {
    const handler = () => {
      if (field.type === 'color' && field.dataset.readyField.endsWith('.color') && field.dataset.readyField.startsWith('roles.')) readyDraftUpdate(field, parseInt(field.value.slice(1), 16));
      else readyDraftUpdate(field, field.value);
      if (field.dataset.readyField.startsWith('features.logs.routes.') && field.dataset.readyField.endsWith('.targetKey')) {
        const index = Number(field.dataset.readyField.split('.')[3]);
        logs.routes[index].sourceKeys = (logs.routes[index].sourceKeys || []).filter(key => key !== field.value);
        renderReadyEditor();
        return;
      }
      if (field.dataset.readyField === 'features.welcome.avatarVertical') $('#readyAvatarYValue').textContent = `${field.value}%`;
      if (field.dataset.readyField === 'features.welcome.avatarRadius') $('#readyAvatarSizeValue').textContent = field.value;
      if (field.dataset.readyField === 'features.welcome.composite' && d.features.welcome.banner && d.features.welcome.banner.mime !== 'image/gif') toast('بعد تفعيل الدمج، أعد رفع التصميم ليُجهّز بمقاس البطاقة.');
      if (field.dataset.readyField === 'features.ticket.imageStyle') { $('#readyTicketDesignControls').hidden = field.value !== 'design'; void updateTicketArtwork().catch(error => toast(error.message)); }
      if (field.dataset.readyField.startsWith('features.modules.')) {
        const card = field.closest('.ready-module-card');
        const module = d.features.modules[Number(field.dataset.readyField.split('.')[2])];
        if (card && module) {
          card.querySelector('.ready-feature-state').textContent = module.enabled ? 'مفعّلة' : 'اختيارية';
          const preview = card.querySelector('.ready-module-live-preview .ready-preview-card');
          if (preview) { preview.style.setProperty('--ready-accent', module.color || '#8d72e8'); preview.querySelector('b').textContent = module.title; preview.querySelector('p').textContent = module.description; preview.querySelector('button').textContent = module.buttonLabel; preview.querySelector('button').style.background = ({ 1: '#5865f2', 2: '#4e5058', 3: '#248046', 4: '#da373c' })[Number(module.buttonStyle || 1)] || '#5865f2'; }
        }
      }
      if (field.dataset.readyField.endsWith('.access') || field.dataset.readyField.endsWith('.type')) renderReadyEditor();
    };
    field.addEventListener(field.tagName === 'SELECT' || field.type === 'checkbox' ? 'change' : 'input', handler);
  });
  document.querySelectorAll('[data-ready-module-image]').forEach(input => input.onchange = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 8 * 1024 * 1024) { toast('اختر صورة PNG أو JPG أو WebP أو GIF بحجم 8 ميجابايت أو أقل.'); input.value = ''; return; }
    const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
    d.features.modules[Number(input.dataset.readyModuleImage)].banner = { mime: file.type, base64: dataUrl.split(',')[1] };
    readySaveDraft(); renderReadyEditor();
  });
  document.querySelectorAll('[data-ready-module-start]').forEach(input => input.onchange = () => { d.features.modules[Number(input.dataset.readyModuleStart)].startsAt = input.value ? new Date(input.value).toISOString() : ''; readySaveDraft(); });
  document.querySelectorAll('[data-ready-module-image-remove]').forEach(button => button.onclick = () => { d.features.modules[Number(button.dataset.readyModuleImageRemove)].banner = null; readySaveDraft(); renderReadyEditor(); });
  $('#readyAddGuide')?.addEventListener('click', () => {
    d.features.guides ||= [];
    if (d.features.guides.length >= 8) return;
    d.features.guides.push({ key: readyNewKey('guide'), title: 'بطاقة جديدة', description: 'اكتب هنا معلومات مفيدة لأعضاء سيرفرك.', channelKey: d.categories.flatMap(group => group.channels).find(channel => channel.type === 0)?.key || '' });
    renderReadyEditor();
  });
  document.querySelectorAll('[data-ready-guide-remove]').forEach(button => button.onclick = () => { d.features.guides.splice(Number(button.dataset.readyGuideRemove), 1); renderReadyEditor(); });
  $('#readyLogMode').onchange = event => {
    logs.mode = event.target.value;
    if (logs.mode === 'routed' && !(logs.routes || []).length) logs.routes = [{ key: readyNewKey('log'), sourceKeys: [d.categories.flatMap(group => group.channels).find(channel => channel.key !== logs.channelKey)?.key].filter(Boolean), targetKey: logs.channelKey, events: [...logs.events] }];
    renderReadyEditor();
  };
  $('#readyAddLogRoute')?.addEventListener('click', () => {
    if ((logs.routes || []).length >= 10) return;
    logs.routes ||= [];
    logs.routes.push({ key: readyNewKey('log'), sourceKeys: [], targetKey: logs.channelKey, events: [...logs.events] });
    renderReadyEditor();
  });
  document.querySelectorAll('[data-ready-log-remove]').forEach(button => button.onclick = () => { logs.routes.splice(Number(button.dataset.readyLogRemove), 1); renderReadyEditor(); });
  document.querySelectorAll('[data-ready-log-source]').forEach(input => input.onchange = () => {
    const [index, key] = input.dataset.readyLogSource.split(':');
    const rule = logs.routes[Number(index)];
    rule.sourceKeys = input.checked ? [...new Set([...(rule.sourceKeys || []), key])] : (rule.sourceKeys || []).filter(item => item !== key);
    input.closest('details').querySelector('summary').textContent = `القنوات المصدر (${fmt(rule.sourceKeys.length + (rule.sourceIds || []).length)})`;
    readySaveDraft(); $('#readyPreview').innerHTML = readyPreview(d); readyDecoratePreview();
  });
  document.querySelectorAll('[data-ready-log-existing]').forEach(input => input.onchange = () => {
    const [index, id] = input.dataset.readyLogExisting.split(':');
    const rule = logs.routes[Number(index)];
    rule.sourceIds = input.checked ? [...new Set([...(rule.sourceIds || []), id])] : (rule.sourceIds || []).filter(item => item !== id);
    input.closest('details').querySelector('summary').textContent = `القنوات المصدر (${fmt((rule.sourceKeys || []).length + rule.sourceIds.length)})`;
    readySaveDraft(); $('#readyPreview').innerHTML = readyPreview(d); readyDecoratePreview();
  });
  document.querySelectorAll('[data-ready-log-event]').forEach(input => input.onchange = () => {
    logs.events = [...document.querySelectorAll('[data-ready-log-event]:checked')].map(item => item.dataset.readyLogEvent);
    readySaveDraft(); $('#readyPreview').innerHTML = readyPreview(d); readyDecoratePreview();
  });
  document.querySelectorAll('[data-ready-log-route-event]').forEach(input => input.onchange = () => {
    const [index, event] = input.dataset.readyLogRouteEvent.split(':');
    const rule = logs.routes[Number(index)];
    rule.events = input.checked ? [...new Set([...(rule.events || logs.events || []), event])] : (rule.events || logs.events || []).filter(item => item !== event);
    logs.events = [...new Set(logs.routes.flatMap(item => item.events || []))];
    input.closest('details').querySelector('summary').textContent = `أنواع الأحداث (${fmt(rule.events.length)})`;
    readySaveDraft(); $('#readyPreview').innerHTML = readyPreview(d); readyDecoratePreview();
  });
  document.querySelectorAll('input[name="readyMode"]').forEach(input => input.onchange = () => { state.readyMode = input.value; });
  document.querySelectorAll('[data-ready-add]').forEach(button => button.onclick = () => {
    const [kind, index] = button.dataset.readyAdd.split(':');
    if (kind === 'role') d.roles.push({ key: readyNewKey('role'), name: 'رتبة جديدة', preset: 'member', color: 0x99aab5 });
    if (kind === 'category') d.categories.push({ key: readyNewKey('category'), name: 'تصنيف جديد', channels: [] });
    if (kind === 'channel') d.categories[Number(index)].channels.push({ key: readyNewKey('channel'), name: 'قناة-جديدة', type: 0, access: 'public' });
    renderReadyEditor();
  });
  document.querySelectorAll('[data-ready-remove]').forEach(button => button.onclick = () => {
    const [kind, i, j] = button.dataset.readyRemove.split(':');
    if (kind === 'role') d.roles.splice(Number(i), 1);
    if (kind === 'category') d.categories.splice(Number(i), 1);
    if (kind === 'channel') d.categories[Number(i)].channels.splice(Number(j), 1);
    renderReadyEditor();
  });
  document.querySelectorAll('[data-ready-move]').forEach(button => button.onclick = () => {
    const [kind, a, b, c] = button.dataset.readyMove.split(':');
    const items = kind === 'category' ? d.categories : kind === 'role' ? d.roles : d.categories[Number(a)].channels;
    const index = Number(kind === 'category' || kind === 'role' ? a : b), next = index + Number(kind === 'category' || kind === 'role' ? b : c);
    if (next < 0 || next >= items.length) return;
    [items[index], items[next]] = [items[next], items[index]]; renderReadyEditor();
  });
  $('#readyReview').onclick = run(async () => {
    const button = $('#readyReview');
    if (button.disabled) return;
    button.disabled = true;
    const label = button.textContent;
    button.textContent = 'جارٍ تجهيز المراجعة…';
    try {
      readySaveDraft();
      const definition = structuredClone(d);
      for (const module of definition.features.modules || []) if (!module.enabled) module.banner = null;
      const result = await api(`/api/workspace/${encodeURIComponent(state.guild)}/ready-templates/review`, { method: 'POST', body: JSON.stringify({ templateKey: state.readyKey, mode: state.readyMode, executor: state.readyExecutor || 'diskoko', definition }) });
      readyReviewDialog(result);
    } finally { button.disabled = false; button.textContent = label; }
  });
}
function readyReviewDialog(data) {
  const review = data.run.review, replace = data.run.mode === 'replace';
  const toDelete = [...review.deletions.channels.map(item => `# ${item.name}`), ...review.deletions.roles.map(item => `رتبة ${item.name}`)];
  const protectedItems = [...(review.protectedChannels || []).map(item => `# ${item.name}`), ...(review.protectedRoles || []).map(item => `رتبة ${item.name}`)];
  const retainedChannels = review.retained?.channels || [];
  const welcomeImpact = review.welcomeImpact || { action: 'none' };
  const welcomeNotice = { replace: `سيستبدل هذا القالب ترحيبك الحالي «${esc(welcomeImpact.previousTitle || 'الترحيب الحالي')}» برسالته وقناته والبوت المحدد هنا، عند اكتمال خطوة الترحيب.`, create: 'سيضيف القالب ترحيبًا تلقائيًا جديدًا لهذا السيرفر.', remove: 'الترحيب غير مفعّل في القالب، لكن استبدال الهيكل سيحذف قناته القديمة؛ سيتوقف الترحيب الحالي.', keep: 'الترحيب غير مفعّل في القالب؛ سيبقى إعداد الترحيب الحالي كما هو.', none: 'الترحيب غير مفعّل في القالب، ولا يوجد ترحيب سابق ليتغير.' }[welcomeImpact.action] || '';
  const executorName = data.run.executor === 'custom' ? state.readyCustomBot?.name || 'بوتك الخاص' : 'بوت ديسكوكو';
  modal('مراجعة القالب قبل التنفيذ', `<div class="notice info"><div><b>${esc(review.guildName)}</b><p>${replace ? 'استبدال الهيكل القديم' : 'تنصيب القالب مع إبقاء الموجود'} · ${fmt(data.steps.length)} خطوات</p></div></div><div class="ready-review-list"><p class="notice ${['replace','remove'].includes(welcomeImpact.action) ? '' : 'info'}"><b>ماذا سيحدث للترحيب؟</b><br>${welcomeNotice}</p><h3>الهيكل الجديد</h3>${data.steps.filter(step => !step.kind.startsWith('delete-')).map(step => `<div class="row"><span class="row-icon">${step.kind === 'role' ? '◇' : step.kind === 'category' ? '▤' : step.kind === 'channel' ? '#' : '✦'}</span><div class="row-main"><b data-i18n-preserve>${esc(step.name)}</b><small>${esc(step.kind.replace('feature-', 'ميزة: '))}</small></div>${status(step.status)}</div>`).join('')}${replace ? `<h3>العناصر التي سيحذفها البوت بعد البناء (${fmt(toDelete.length)})</h3>${toDelete.length ? `<ul>${toDelete.map(name => `<li>${esc(name)}</li>`).join('')}</ul>` : '<p>لا توجد عناصر قديمة للحذف.</p>'}${protectedItems.length ? `<h3>عناصر محمية ستبقى (${fmt(protectedItems.length)})</h3><ul>${protectedItems.map(name => `<li>${esc(name)}</li>`).join('')}</ul>` : ''}<p class="form-note">حذف القنوات يمحو الرسائل نهائيًا من Discord، وحذف الرتب يزيلها من الأعضاء. لا يمكن استعادة المحتوى من هذه المعاينة.</p>` : '<p class="form-note">لن تُحذف القنوات أو الرتب الحالية.</p>'}</div><label class="check-row"><input type="checkbox" id="readyAcknowledge">راجعت الهيكل والصلاحيات وقائمة الحذف، وأوافق على التنفيذ.</label>${replace ? `<label>لتأكيد الاستبدال، اكتب اسم السيرفر كما يظهر: <b>${esc(review.guildName)}</b><input id="readyGuildName" autocomplete="off" placeholder="اسم السيرفر"></label>` : ''}`, `<button class="btn secondary" id="readyLater">لاحقًا</button><button class="btn primary" id="readyApply" disabled>نعم، نفّذ القالب</button>`);
  const details = (review.createOrReuse || []).map(item => `<div class="row"><div class="row-main"><b data-i18n-preserve>${esc(item.name)}</b><small>${item.kind === 'role' ? `رتبة · ${esc({ moderator: 'إشراف محدود', support: 'دعم', member: 'عضو', vip: 'مميز' }[item.preset] || '')} · لا صلاحية Administrator` : item.kind === 'channel' ? `${item.parent ? `${esc(item.parent)} · ` : ''}${esc({ public: 'عامة', read_only: 'قراءة فقط', private: 'خاصة' }[item.access] || '')}` : 'تصنيف'}</small></div>${badge(item.action === 'reuse' ? 'موجودة وتبقى' : item.action === 'update' ? 'تعديل' : 'إنشاء', item.action === 'reuse' ? 'neutral' : 'purple')}</div>`).join('');
  document.querySelector('.ready-review-list')?.insertAdjacentHTML('afterbegin', `<details><summary>تفاصيل كل قناة ورتبة وصلاحيتها (${fmt((review.createOrReuse || []).length)})</summary><div class="rows">${details}</div></details>`);
  document.querySelector('.ready-review-list')?.insertAdjacentHTML('afterbegin', `<p class="notice info">المنفّذ: ${esc(executorName)} · استهلاك القالب: ${fmt(review.usageUnits || 1)} تغييرًا، تشمل الرتب. عند الإيقاف تُحسب الخطوات المكتملة فقط.</p>`);
  if (review.guides?.length) document.querySelector('.ready-review-list')?.insertAdjacentHTML('beforeend', `<details class="ready-guide-review"><summary>بطاقات البداية التي سينشرها البوت (${fmt(review.guides.length)})</summary>${review.guides.map(guide => `<div class="ready-guide-preview"><strong>${esc(guide.title)}</strong><p>${esc(guide.description)}</p><small>في #${esc(guide.channel)}</small></div>`).join('')}</details>`);
  if (!replace && retainedChannels.length) document.querySelector('.ready-review-list')?.insertAdjacentHTML('beforeend', `<details class="ready-retained"><summary>قنوات موجودة ستبقى خارج القالب (${fmt(retainedChannels.length)})</summary><p class="form-note">لن ينقلها البوت إلى التصنيفات الجديدة. يمكنك ترتيبها لاحقًا من Discord، أو مراجعة خيار الاستبدال إذا أردت حذف القديم.</p><ul>${retainedChannels.map(item => `<li>${item.type === 4 ? 'تصنيف' : '#'} ${esc(item.name)}${item.uncategorized ? ' · خارج التصنيفات' : ''}</li>`).join('')}</ul></details>`);
  const reusedAdminRoles = (review.createOrReuse || []).filter(item => item.kind === 'role' && item.action === 'reuse' && item.hasAdministrator);
  if (reusedAdminRoles.length) document.querySelector('.ready-review-list')?.insertAdjacentHTML('afterbegin', `<p class="notice">تنبيه: الرتب الموجودة ${reusedAdminRoles.map(item => esc(item.name)).join('، ')} لديها صلاحية Administrator حاليًا. وضع التنصيب سيبقي صلاحياتها كما هي؛ راجعها في Discord.</p>`);
  if (replace && review.affectedTasks) document.querySelector('.ready-review-list')?.insertAdjacentHTML('beforeend', `<p class="notice">ستُلغى ${fmt(review.affectedTasks.schedules)} رسائل مجدولة، وتُوقف ${fmt(review.affectedTasks.giveaways)} جيف أوي، وتُزال ${fmt(review.affectedTasks.ticketPanels)} لوحات دعم مرتبطة بالقنوات القديمة.</p>`);
   if (['succeeded','cancelled','cancel_requested'].includes(data.run.status)) { $('#readyApply').remove(); $('#readyLater').textContent = 'إغلاق'; $('#readyLater').onclick = closeDialog; if (data.run.status === 'cancelled') document.querySelector('.ready-review-list')?.insertAdjacentHTML('afterbegin', `<p class="notice info">أُوقف هذا القالب. اكتمل ${fmt(data.run.completed_units || 0)} تغييرًا، ولن تُنفّذ الخطوات المتبقية.</p>`); return; }
  $('#readyLater').onclick = closeDialog;
  const toggle = () => { $('#readyApply').disabled = !$('#readyAcknowledge').checked || (replace && $('#readyGuildName').value !== review.guildName); };
  $('#readyAcknowledge').onchange = toggle; if (replace) $('#readyGuildName').oninput = toggle;
  $('#readyApply').onclick = run(async () => {
    $('#readyApply').disabled = true; $('#readyLater').disabled = true; $('#closeDialog').disabled = true;
    let result = data;
    try {
      do {
        $('#readyApply').textContent = `جارٍ التنفيذ… ${fmt(result.steps.filter(step => step.status === 'succeeded').length)} / ${fmt(result.steps.length)}`;
        result = await api(`/api/workspace/${encodeURIComponent(state.guild)}/ready-templates/runs/${encodeURIComponent(data.run.id)}/apply`, { method: 'POST', body: JSON.stringify({ confirmed: true, guildName: review.guildName, mode: data.run.mode }) });
      } while (result.run.status === 'running');
       closeDialog(); await loadGuild(); toast(result.run.status === 'cancelled' ? `أُوقف القالب بعد اكتمال ${fmt(result.run.completed_units || 0)} تغييرًا.` : 'اكتمل تنصيب القالب على سيرفرك.');
    } catch (error) {
      $('#closeDialog').disabled = false; $('#readyLater').disabled = false; $('#readyApply').disabled = false;
      if (error.status === 409 && error.message.startsWith('انتهت صلاحية مراجعة القالب:')) {
        $('#readyApply').textContent = 'تحديث المراجعة';
        $('#readyApply').onclick = run(async () => { closeDialog(); $('#readyReview')?.click(); });
      } else $('#readyApply').textContent = 'متابعة التنفيذ';
      modalError(error);
    }
  });
}
async function prepareWelcomeBackground(file, logoFile = null, logoX = 16, logoY = 50) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 25 * 1024 * 1024) throw Error('اختر تصميم PNG أو JPG أو WebP لا يتجاوز 25 ميجابايت.');
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 50_000_000) { bitmap.close(); throw Error('أبعاد الصورة كبيرة جدًا. استخدم صورة أقل من 50 مليون بكسل.'); }
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 480;
  const scale = Math.max(1200 / bitmap.width, 480 / bitmap.height);
  const width = bitmap.width * scale, height = bitmap.height * scale;
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, (1200 - width) / 2, (480 - height) / 2, width, height);
  bitmap.close();
  if (logoFile) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(logoFile.type) || logoFile.size > 25 * 1024 * 1024) throw Error('اختر شعار PNG أو JPG أو WebP حتى 25 ميجابايت.');
    const logo = await createImageBitmap(logoFile);
    const x = 1200 * Number(logoX) / 100, y = 480 * Number(logoY) / 100, radius = 72;
    context.fillStyle = '#bea0ff'; context.beginPath(); context.arc(x, y, radius + 7, 0, 2 * Math.PI); context.fill();
    context.save(); context.beginPath(); context.arc(x, y, radius, 0, 2 * Math.PI); context.clip();
    const logoScale = Math.max(2 * radius / logo.width, 2 * radius / logo.height);
    context.drawImage(logo, x - logo.width * logoScale / 2, y - logo.height * logoScale / 2, logo.width * logoScale, logo.height * logoScale);
    context.restore(); logo.close();
  }
  const base64 = canvas.toDataURL('image/png').split(',')[1];
  if (base64.length > 6_500_000) throw Error('التصميم كبير بعد التجهيز. استخدم صورة أبسط أو أصغر.');
  return { mime: 'image/png', base64 };
}
async function prepareWelcomeLogoOverlay(logoFile, logoX = 16, logoY = 50) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(logoFile?.type) || logoFile.size > 25 * 1024 * 1024) throw Error('اختر شعار PNG أو JPG أو WebP حتى 25 ميجابايت.');
  const logo = await createImageBitmap(logoFile);
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 480;
  const context = canvas.getContext('2d');
  const x = 1200 * Number(logoX) / 100, y = 480 * Number(logoY) / 100, radius = 72;
  context.fillStyle = '#bea0ff'; context.beginPath(); context.arc(x, y, radius + 7, 0, 2 * Math.PI); context.fill();
  context.save(); context.beginPath(); context.arc(x, y, radius, 0, 2 * Math.PI); context.clip();
  const scale = Math.max(2 * radius / logo.width, 2 * radius / logo.height);
  context.drawImage(logo, x - logo.width * scale / 2, y - logo.height * scale / 2, logo.width * scale, logo.height * scale);
  context.restore(); logo.close();
  const base64 = canvas.toDataURL('image/png').split(',')[1];
  if (base64.length > 6_500_000) throw Error('الشعار كبير جدًا بعد التجهيز. اختر صورة أبسط.');
  return { mime: 'image/png', base64 };
}
async function prepareCircleLogo(file, shape = 'circle') {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file?.type) || file.size > 25 * 1024 * 1024) throw Error('اختر صورة شعار PNG أو JPG أو WebP حتى 25 ميجابايت.');
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
  const context = canvas.getContext('2d');
  context.beginPath(); if (shape === 'square') context.rect(0,0,256,256); else if (shape === 'rounded') context.roundRect(0,0,256,256,32); else context.arc(128,128,124,0,2*Math.PI); context.clip();
  const scale = Math.max(256 / bitmap.width, 256 / bitmap.height);
  context.drawImage(bitmap, (256 - bitmap.width * scale) / 2, (256 - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale);
  bitmap.close();
  const base64 = canvas.toDataURL('image/png').split(',')[1];
  if (base64.length > 460000) throw Error('تعذر تجهيز الشعار. استخدم صورة أبسط.');
  return { mime: 'image/png', base64 };
}
async function prepareDesignedCard(backgroundFile, logoFile, logoX = 84, logoY = 50) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(backgroundFile?.type) || backgroundFile.size > 25 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(logoFile?.type) || logoFile.size > 25 * 1024 * 1024) throw Error('ارفع تصميمًا وشعارًا بصيغة PNG أو JPG أو WebP حتى 25 ميجابايت لكل صورة.');
  const [background, logo] = await Promise.all([createImageBitmap(backgroundFile), createImageBitmap(logoFile)]);
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 480;
  const context = canvas.getContext('2d');
  const cover = Math.max(1200 / background.width, 480 / background.height);
  context.drawImage(background, (1200 - background.width * cover) / 2, (480 - background.height * cover) / 2, background.width * cover, background.height * cover);
  const x = 1200 * Number(logoX) / 100, y = 480 * Number(logoY) / 100, radius = 96;
  context.fillStyle = '#bea0ff'; context.beginPath(); context.arc(x, y, radius + 8, 0, 2 * Math.PI); context.fill();
  context.save(); context.beginPath(); context.arc(x, y, radius, 0, 2 * Math.PI); context.clip();
  const scale = Math.max(2 * radius / logo.width, 2 * radius / logo.height);
  context.drawImage(logo, x - logo.width * scale / 2, y - logo.height * scale / 2, logo.width * scale, logo.height * scale);
  context.restore(); background.close(); logo.close();
  for (const quality of [0.82, 0.68, 0.5]) {
    const base64 = canvas.toDataURL('image/jpeg', quality).split(',')[1];
    if (base64.length < 460000) return { mime: 'image/jpeg', base64 };
  }
  throw Error('التصميم مع الشعار كبير بعد التجهيز. استخدم خلفية أبسط.');
}
const logoPlacementFields = (prefix, initial = 'right') => `<label>مكان الشعار المبدئي<select id="${prefix}LogoPosition"><option value="right" ${initial === 'right' ? 'selected' : ''}>يمين</option><option value="center" ${initial === 'center' ? 'selected' : ''}>الوسط</option><option value="left" ${initial === 'left' ? 'selected' : ''}>يسار</option></select></label><div class="form-grid two"><label>تحريك الشعار يمينًا ويسارًا <output id="${prefix}LogoXValue">${initial === 'left' ? 16 : initial === 'center' ? 50 : 84}%</output><input id="${prefix}LogoX" type="range" min="10" max="90" value="${initial === 'left' ? 16 : initial === 'center' ? 50 : 84}"></label><label>تحريك الشعار أعلى وأسفل <output id="${prefix}LogoYValue">50%</output><input id="${prefix}LogoY" type="range" min="25" max="75" value="50"></label></div>`;
function bindLogoPlacement(prefix, update) {
  const position = document.querySelector(`#${prefix}LogoPosition`), x = document.querySelector(`#${prefix}LogoX`), y = document.querySelector(`#${prefix}LogoY`);
  if (!position || !x || !y) return;
  position.onchange = () => { x.value = { left: 16, center: 50, right: 84 }[position.value]; update(); };
  const sync = () => { document.querySelector(`#${prefix}LogoXValue`).textContent = `${x.value}%`; document.querySelector(`#${prefix}LogoYValue`).textContent = `${y.value}%`; update(); };
  x.oninput = sync; y.oninput = sync;
}
const imageStyleFields = prefix => `<label>طريقة عرض الصورة<select id="${prefix}Style"><option value="normal">صورة عادية / Original</option><option value="square">صورة مربعة / Square</option><option value="rounded">زوايا مستديرة / Rounded</option><option value="circle">صورة دائرية / Circle</option><option value="logo">شعار دائري صغير داخل البطاقة</option><option value="design">شعار دائري داخل تصميمك</option></select></label><small class="form-note">GIF يبقى متحركًا في العرض العادي؛ دمج الشعار داخل التصميم يحتاج صورة ثابتة.</small><div id="${prefix}Design" hidden><label>صورة الشعار التي ستُدمج داخل التصميم<input id="${prefix}Logo" type="file" accept="image/png,image/jpeg,image/webp"></label>${logoPlacementFields(prefix)}</div>`;
const imageStylePreviewUrls = new WeakMap();
async function prepareStyledImage(file, prefix) {
  const sceneState=sceneReviewState.get(document.getElementById(prefix));
  if (sceneState?.enabled()) return renderDesignScene(sceneState.scene,file);
  const style = document.querySelector(`#${prefix}Style`)?.value || 'normal';
  if (!file) { if (style !== 'normal') throw Error('ارفع صورة ثابتة لاستخدام الشعار الدائري أو التصميم.'); return null; }
  if (file.type === 'image/gif') {
    if (style !== 'normal') throw Error('GIF المتحرك يُعرض كصورة عادية. اختر صورة ثابتة لدمج الشعار.');
    return prepareAiMedia(file);
  }
  if (['logo','circle','square','rounded'].includes(style)) return prepareCircleLogo(file,style === 'logo' ? 'circle' : style);
  if (style === 'design') return prepareDesignedCard(file, document.querySelector(`#${prefix}Logo`)?.files[0], document.querySelector(`#${prefix}LogoX`)?.value, document.querySelector(`#${prefix}LogoY`)?.value);
  return prepareAiImage(file);
}
async function prepareNativeEventCover(file) {
  if (!file) return null;
  if (file.type === 'image/gif') {
    if (!file.size || file.size > 2 * 1024 * 1024) throw Error('غلاف الحدث GIF يجب ألا يتجاوز 2 ميجابايت.');
    const media = await prepareAiMedia(file);
    return { mime: media.mime, base64: media.base64 };
  }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 25 * 1024 * 1024) throw Error('اختر غلاف PNG أو JPG أو WebP حتى 25 ميجابايت؛ سيُجهز للمقاس المناسب تلقائيًا.');
  const source = await createImageBitmap(file);
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 480;
  const context = canvas.getContext('2d');
  const scale = Math.max(canvas.width / source.width, canvas.height / source.height);
  context.drawImage(source, (canvas.width - source.width * scale) / 2, (canvas.height - source.height * scale) / 2, source.width * scale, source.height * scale);
  source.close();
  for (const quality of [0.88, 0.75, 0.6, 0.45]) {
    const base64 = canvas.toDataURL('image/jpeg', quality).split(',')[1];
    if (base64.length < 2_700_000) return { mime: 'image/jpeg', base64 };
  }
  throw Error('تعذر تجهيز غلاف الحدث ضمن الحجم المسموح. جرّب صورة أبسط.');
}
function updateStyledImagePreview(prefix, preview) {
  const styleControl = document.querySelector(`#${prefix}Style`);
  const gif = document.querySelector(`#${prefix}`)?.files?.[0]?.type === 'image/gif';
  if (gif && styleControl) styleControl.value = 'normal';
  const style = styleControl?.value || 'normal';
  const controls = document.querySelector(`#${prefix}Design`);
  if (controls) controls.hidden = style !== 'design';
  if (!preview) return;
  if (preview.tagName === 'IMG' && !preview.parentElement.classList.contains('ai-card-image-wrap')) {
    const wrapper = document.createElement('div'); wrapper.className = 'ai-card-image-wrap'; preview.before(wrapper); wrapper.append(preview);
  }
  preview.classList.toggle('ai-card-logo-preview', style === 'logo');
  preview.style.borderRadius = ['logo','circle'].includes(style) ? '50%' : style === 'rounded' ? '12%' : '0';
  preview.style.aspectRatio = ['logo','circle','square','rounded'].includes(style) ? '1' : '';
  preview.style.objectFit = 'cover';
  preview.classList.toggle('ai-card-design-preview', style === 'design');
  let overlay = preview.parentElement?.querySelector('.ai-card-logo-overlay');
  if (style === 'design' && preview.tagName === 'IMG') {
    if (!overlay) { overlay = document.createElement('img'); overlay.className = 'ai-card-logo-overlay'; preview.after(overlay); }
    const file = document.querySelector(`#${prefix}Logo`)?.files[0];
    if (file) { if (!imageStylePreviewUrls.has(file)) imageStylePreviewUrls.set(file, URL.createObjectURL(file)); overlay.src = imageStylePreviewUrls.get(file); }
    overlay.hidden = !file;
    overlay.style.left = `${document.querySelector(`#${prefix}LogoX`)?.value || 84}%`;
    overlay.style.top = `${document.querySelector(`#${prefix}LogoY`)?.value || 50}%`;
  } else if (overlay) overlay.hidden = true;
}
async function prepareAiMedia(file) {
  if (!['image/gif', 'video/mp4', 'video/quicktime'].includes(file.type) || !file.size || file.size > 20 * 1024 * 1024) throw Error('اختر GIF أو MP4 أو MOV بحجم لا يتجاوز 20 ميجابايت.');
  const encoded = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '').split(',')[1]); reader.onerror = () => reject(Error('تعذر قراءة الملف المتحرك.')); reader.readAsDataURL(file); });
  return { mime: file.type, base64: encoded };
}
function aiActionChoices(answer) {
  return String(answer || '').split('\n').map(line => line.trim().replace(/^\*+/, '').trim()).map(line => /^[0-9٠-٩۰-۹]{1,2}[.)،:\-]\s*(.{8,300})/.exec(line)?.[1]?.replace(/^\*+|\*+$/g, '').trim()).filter(Boolean).slice(0, 10);
}
const aiLibraryFlow = item => {
  if (item.kind === 'tickets') return 'حدد قناة اللوحة ورتبة الدعم ← راجع النص والبنر ← أكد النشر ← العميل يفتح تذكرة خاصة ← الفريق يستلمها ويتابعها';
  if (item.category === 'الجيف آواي' || item.title.includes('جيف آواي')) return 'حدد الجائزة والمدة والقناة ← راجع البطاقة والبنر ← أكد النشر ← يتفاعل الأعضاء مع زر المشاركة';
  if (item.kind === 'poll') return 'حدد السؤال والخيارات والصور ← راجع المعاينة ← انشر ← يصوّت الأعضاء وتظهر النتائج';
  if (item.kind === 'event') return 'جهز إعلان الفعالية ← فعّل زر التسجيل إن أردت ← راجع المعاينة ← انشر ويتحدث عدّاد المشاركين';
  if (item.kind === 'scheduled_event') return 'اختر قناة صوتية أو مكانًا آخر ← اضبط الموعد والغلاف ← راجع شكل الحدث ← أنشئه في Events داخل Discord';
  if (item.kind === 'welcome') return 'اختر قناة الترحيب والبطاقة ← راجع المعاينة ← فعّلها ← يرحّب البوت تلقائيًا بكل عضو جديد';
  if (item.kind === 'rules') return 'اختر القناة وعدّل القوانين ← اختر طريقة عرض البطاقة واللون والصورة ← راجع المعاينة ← انشر';
  return 'حدد القناة والنص والصورة إن وجدت ← راجع المحتوى وموضع الصورة ← أكد النشر في Discord';
};
async function assistant() {
  const guild = state.guild, epoch = state.epoch;
  const active = () => guild === state.guild && epoch === state.epoch && screen() === 'assistant';
  const storageKey = `diskoko-ai-conversation:${guild}`;
  let selected = sessionStorage.getItem(storageKey) || '';
  let conversations = [], messages = [], available = false, planEnabled = true, busy = false;
  $('#workspace').innerHTML = head('AI ديسكوكو', 'مساعدك لتنظيم السيرفر. محادثاتك محفوظة لهذا السيرفر ويمكنك الرجوع إليها.') + connectionNotice() + `<div class="ai-chat-layout"><aside class="panel ai-chat-sidebar"><section class="ai-bot-connect"><div class="ai-bot-connect-head"><span>✦ بوتك وهويتك</span><a href="/ai-bot-guide.html" target="_blank" rel="noopener noreferrer">شرح الربط ↗</a></div><h3>اربط بوتك الخاص بديسكوكو AI</h3><p>خلّ AI ينشر وينفذ باسم بوت سيرفرك بعد مراجعتك. يبقى بوت ديسكوكو الخيار الأساسي حتى تربط بوتك.</p><div id="aiBotConnection" role="status">جارٍ التحقق من الربط…</div></section><div class="panel-head"><h3>المحادثات</h3><button id="aiNew" class="btn small primary" type="button">+ جديدة</button></div><div id="aiConversations" class="ai-conversations"></div></aside><section class="panel ai-chat-main"><div class="panel-head"><div><h3 id="aiChatTitle">محادثة جديدة</h3><small>التغييرات على Discord تظهر للمراجعة قبل تطبيقها.</small></div><span id="aiStatus" class="badge neutral">جارٍ التحقق…</span></div><div id="aiMessages" class="ai-messages" role="log" aria-live="polite"></div><div id="aiNotice" class="ai-notice" role="status"></div><div id="aiRecording" class="ai-recording" role="status" hidden><span class="ai-recording-dot"></span><b>جارٍ تسجيل كلامك</b><span id="aiRecordingTime">00:00</span><button id="aiStopVoice" type="button" class="btn small secondary">إيقاف التسجيل</button></div><div id="aiAttachment" class="ai-attachment" hidden></div><form id="assistantForm" class="ai-composer"><label for="assistantPrompt" class="sr-only">رسالتك إلى AI ديسكوكو</label><textarea id="assistantPrompt" rows="2" maxlength="1500" placeholder="اكتب ما تحتاجه لسيرفرك…"></textarea><div class="ai-composer-tools"><button id="aiAttach" class="btn secondary" type="button" aria-label="إرفاق صورة أو ملف نصي">📎 <span>إرفاق</span></button><input id="aiFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif,.txt,text/plain" hidden><button id="aiVoice" class="btn secondary" type="button" aria-label="تسجيل صوت وتحويله إلى نص">🎙 <span>مايك</span></button><button id="aiSend" class="btn primary" type="submit">إرسال</button></div></form></section></div>`;
  $('#workspace .ai-chat-layout').insertAdjacentHTML('beforeend', `<aside class="panel ai-library"><div class="panel-head"><div><h3>مكتبة AI ديسكوكو</h3><small>${fmt(aiPromptLibrary.length)} إجراء قابل للمراجعة والتنفيذ</small></div></div><div class="ai-library-controls"><label for="aiLibrarySearch" class="sr-only">ابحث في الإجراءات</label><input id="aiLibrarySearch" type="search" placeholder="ابحث عن إجراء…"><div id="aiLibraryCategories" class="ai-library-categories"></div></div><div id="aiLibraryList" class="ai-library-list"></div><p class="ai-library-note">اختر وظيفة لفتح محررها مباشرة. خصّص المحتوى والمظهر، وراجع الوظيفة والقناة قبل التأكيد.</p></aside>`);
  $('#workspace .ai-library .panel-head').insertAdjacentHTML('beforeend', '<button id="aiLibraryExpand" class="btn small secondary" type="button" aria-expanded="false">توسيع المكتبة</button>');
  $('#aiLibraryExpand').onclick = () => { const expanded = $('#workspace .ai-chat-layout').classList.toggle('ai-library-expanded'); $('#aiLibraryExpand').textContent = expanded ? 'تصغير المكتبة' : 'توسيع المكتبة'; $('#aiLibraryExpand').setAttribute('aria-expanded', String(expanded)); };
  $('#workspace .page-head').classList.add('ai-page-head');
  $('#workspace .page-head').append($('#workspace .ai-bot-connect'));
  $('#workspace .page-head').insertAdjacentHTML('afterend', botHierarchyNotice('تنفيذ تعديلات AI على القنوات والرتب'));
  $('#assistantForm').insertAdjacentHTML('afterbegin', '<div id="aiTemplateDraft" class="ai-template-draft" hidden></div>');
  state.aiLanguageController?.disconnect();
  const aiLanguage=initializeAiLanguage($('#workspace'),$('#dialog'),state.account?.user.id || 'anonymous',aiPromptLibrary);
  state.aiLanguageController=aiLanguage;
  const list = $('#aiConversations'), thread = $('#aiMessages'), notice = $('#aiNotice'), input = $('#assistantPrompt');
  thread.addEventListener('click',event=>{const button=event.target.closest('[data-ai-interactive],[data-ai-message],[data-ai-module]');if(!button)return;const id=button.dataset.aiInteractive || button.dataset.aiMessage || button.dataset.aiModule;if(aiDraftVersions.has(id))aiReviewVersions.set(id,aiDraftVersions.get(id));},true);
  let connectedAiBot = null;
  const renderAiBotConnection = () => {
    state.aiEditorBotScope=connectedAiBot?.selected?connectedAiBot.id || connectedAiBot.name:'diskoko';
    const target = $('#aiBotConnection'); if (!target || !active()) return;
    state.aiBotName = connectedAiBot?.name || null;
    const retryAt = connectedAiBot?.retryAt && new Date(connectedAiBot.retryAt).getTime() > Date.now() ? `؛ المحاولة التالية ${siteDate(new Date(connectedAiBot.retryAt), "toLocaleString")}` : '';
    target.innerHTML = connectedAiBot ? `<div class="ai-bot-connected"><b>✓ ${esc(connectedAiBot.name)}</b><small>${connectedAiBot.online ? 'متصل؛ يعتمد النشر على صلاحياته في القناة' : `غير متصل الآن؛ لن يتم النشر حتى يعود${retryAt}`}</small>${!connectedAiBot.memberJoins ? '<small>للترحيب التلقائي: فعّل Server Members Intent وأعد الربط.</small>' : ''}${!connectedAiBot.messageContent ? '<small>لعرض نص الرسائل المحذوفة: فعّل Message Content Intent من إعدادات Bot ثم أعد الربط. <a href="/ai-bot-guide.html" target="_blank" rel="noopener noreferrer">الخطوات ↗</a></small>' : ''}</div><button id="aiBotDisconnect" class="btn small secondary" type="button">فصل البوت</button>` : '<button id="aiBotConnect" class="btn small primary" type="button">ربط بوتي</button>';
    target.insertAdjacentHTML('afterbegin', serverExecutorMarkup(connectedAiBot));
    target.querySelectorAll('input[name="serverExecutor"]').forEach(input => { input.onchange = run(async () => {
      target.querySelectorAll('input[name="serverExecutor"]').forEach(option => { option.disabled = true; });
      try {
        await api('/api/ai/bot-connection/selection', { method: 'POST', body: JSON.stringify({ guildId: guild, executor: input.value }) });
        if (connectedAiBot) connectedAiBot.selected = input.value === 'custom';
        renderAiBotConnection();
        toast(input.value === 'custom' ? 'سيستخدم AI بوتك الخاص بعد مراجعة الصلاحيات.' : 'سيستخدم AI بوت ديسكوكو بعد مراجعة الصلاحيات.');
      } catch (error) { renderAiBotConnection(); throw error; }
    }); });
    if (connectedAiBot) $('#aiBotDisconnect').onclick = run(async () => {
      if (!window.confirm('سيُفصل البوت الخاص عن هذا السيرفر. المنشورات التفاعلية السابقة قد تتوقف حتى تعيد ربطه. هل تريد المتابعة؟')) return;
      await api('/api/ai/bot-connection', { method: 'DELETE', body: JSON.stringify({ guildId: guild }) });
      connectedAiBot = null; renderAiBotConnection(); toast('فُصل بوتك الخاص. سيستخدم AI بوت ديسكوكو في المنشورات الجديدة.');
    });
    else $('#aiBotConnect').onclick = () => {
      modal('ربط بوتك الخاص', `<p>أنشئ بوتًا في Discord Developer Portal وأضفه إلى ${esc(state.data?.guild?.name || 'سيرفرك')}، ثم انسخ رمزه هنا. لن يظهر الرمز مجددًا بعد الحفظ.</p><label>رمز البوت<input id="aiBotToken" type="password" autocomplete="off" spellcheck="false" placeholder="ألصق Bot Token هنا"></label><p class="form-note">فعّل Message Content Intent لعرض نص الرسائل المحذوفة، وServer Members Intent للترحيب التلقائي. لا تضع الرمز في المحادثة أو في رسالة Discord.</p><a href="/ai-bot-guide.html" target="_blank" rel="noopener noreferrer">شرح الإنشاء والإضافة خطوة بخطوة ↗</a>`, '<button id="aiBotCancel" class="btn secondary" type="button">إلغاء</button><button id="aiBotSave" class="btn primary" type="button">تحقق واربط</button>');
      $('#aiBotCancel').onclick = closeDialog;
      $('#aiBotSave').onclick = run(async () => {
        const button = $('#aiBotSave'); button.disabled = true; button.textContent = 'جارٍ التحقق…';
        try { const result = await api('/api/ai/bot-connection', { method: 'POST', body: JSON.stringify({ guildId: guild, token: $('#aiBotToken').value }) }); connectedAiBot = result.bot; closeDialog(); renderAiBotConnection(); toast(result.pending ? `حُفظ ربط ${connectedAiBot.name}؛ سيتصل تلقائيًا بعد انتهاء مهلة Discord.` : `تم ربط ${connectedAiBot.name} بنجاح.`); }
        catch (error) { const message = $('#dialogError'); message.textContent = error.message; if (error.inviteUrl?.startsWith('https://discord.com/oauth2/authorize?')) { const link = document.createElement('a'); link.href = error.inviteUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'أضف البوت إلى السيرفر ↗'; message.append(document.createElement('br'), link); } message.hidden = false; button.disabled = false; button.textContent = 'تحقق واربط'; }
      });
    };
  };
  api(`/api/ai/bot-connection?guildId=${encodeURIComponent(guild)}`).then(result => { if (active()) { connectedAiBot = result.bot; renderAiBotConnection(); } }).catch(() => { if (active()) $('#aiBotConnection').textContent = 'تعذر التحقق من الربط الآن. حدّث الصفحة للمحاولة مجددًا.'; });
  let libraryCategory = 'الكل', selectedTemplate = null;
  const showStandaloneModule = async item => {
    let saved=null;
    if(item.editInstallId){try{saved=await api(`/api/workspace/${encodeURIComponent(guild)}/standalone-modules/${encodeURIComponent(item.editInstallId)}`);item={...item,draft:{...saved.config,kind:'module',moduleKind:saved.config.kind,sceneInitiallyDisabled:true,publishedDesign:true}};}catch(error){toast(error.message);return;}}
    const kind = item.moduleKind, meta = READY_MODULE_TYPES[kind];
    const draft = item.draft || null;
    if (!meta) return;
    const channels = (state.data?.channels || []).filter(channel => channel.type === 0);
    const roles = (state.data?.roles || []).filter(role => role.id !== guild && !role.managed);
    const channelOptions = `<option value="">اختر قناة</option>${channels.map(channel => `<option value="${esc(channel.id)}"># ${esc(channel.name)}</option>`).join('')}`;
    const roleOptions = `<option value="">اختر رتبة</option>${roles.map(role => `<option data-i18n-preserve value="${esc(role.id)}">${esc(role.name)}</option>`).join('')}`;
    const labels = READY_MODULE_FIELDS[kind];
    const moduleActions={...Object.fromEntries(libraryModuleExtensions.map(item=>[item.moduleKind,[item.action,item.actionEn]])),interests:['اختيار الرتبة','Choose role'],suggestions:['قدّم اقتراحًا','Suggest an idea'],reports:['أرسل بلاغًا خاصًا','Send private report'],events:['سجّل مشاركتك','Register'],applications:['قدّم طلبًا','Apply'],faq:['اعرض الإجابة','Show answer'],submissions:['أرسل مشاركتك','Submit your work'],orders:['أنشئ طلبًا','Start an order'],learning:['سجّل تقدمك','Record progress'],tasks:['أضف مهمة','Add task']};
    const englishFields={...Object.fromEntries(libraryModuleExtensions.map(item=>[item.moduleKind,[item.subjectEn,item.detailsEn]])),suggestions:['Suggestion title','Idea and its benefit'],reports:['Report subject','What happened and where?'],applications:['Role you are applying for','Experience and motivation'],submissions:['Submission title','Description and work link'],orders:['Product or service','Quantity and requirements'],learning:['Lesson or assignment','Progress and help needed'],tasks:['Task title','Requirements, owner and deadline']};

    const formFields = meta.form ? `<label>قناة مراجعة خاصة لا يراها الأعضاء<select id="moduleReviewChannel">${channelOptions}</select></label><label>رتبة الفريق<select id="moduleStaffRole">${roleOptions}</select></label><label>اسم خانة الموضوع<input id="moduleSubjectLabel" maxlength="45" value="${esc(labels?.[0] || 'الموضوع')}"></label><label>اسم خانة التفاصيل<input id="moduleDetailsLabel" maxlength="45" value="${esc(labels?.[1] || 'التفاصيل')}"></label>` : '';
    const extra = kind === 'interests' ? `<label>رتبة اهتمام عادية بلا صلاحيات<select id="moduleRole">${roleOptions}</select></label><p class="form-note">يضيف العضو هذه الرتبة أو يزيلها بنفسه. يجب أن تكون رتبة البوت أعلى منها.</p>` : kind === 'faq' ? '<label>الإجابة التي تظهر للعضو<textarea id="moduleAnswer" maxlength="1800" rows="4" placeholder="اكتب جوابًا واحدًا واضحًا"></textarea></label>' : kind === 'events' ? '<label>موعد إغلاق التسجيل (اختياري)<input id="moduleStartsAt" type="datetime-local"></label><label>عدد الأماكن؛ صفر يعني مفتوح<input id="moduleCapacity" type="number" min="0" max="10000" value="0"></label>' : '';
    modal(draft ? (aiLanguage.language()==='en' ? `Edit ${draft.title}` : `تعديل ${draft.title}`) : `تركيب ${meta.label}`, `<p class="form-note">الميزة مستقلة عن القوالب الجاهزة. راجع اللوحة والقنوات والصلاحيات قبل النشر؛ يُحسب تغيير واحد عند نجاح التركيب فقط.</p><div class="form-grid"><label>عنوان اللوحة<input id="moduleTitle" maxlength="256" value="${esc(meta.icon + ' ' + (aiLanguage.language()==='en'?item.titleEn:meta.label))}"></label><label>وصفها للأعضاء<textarea id="moduleDescription" maxlength="2000" rows="3">${esc(aiLanguage.language()==='en'?item.promptEn:item.prompt)}</textarea></label><label>نص الزر<input id="moduleButton" maxlength="80" value="${esc(aiLanguage.language()==='en'?item.titleEn:meta.label)}"></label><label>قناة عرض اللوحة<select id="moduleChannel">${channelOptions}</select></label>${formFields}${extra}<label>لون اللوحة<input id="moduleColor" type="color" value="#8d72e8"></label><label>شكل الزر<select id="moduleButtonStyle"><option value="1">بنفسجي</option><option value="2">رمادي</option><option value="3">أخضر</option><option value="4">أحمر</option></select></label></div>${labels ? `<p class="form-note">${esc(labels[2])}</p>` : ''}<p class="form-note">بوت التنفيذ: ${connectedAiBot?.selected ? `بوتك الخاص (${esc(connectedAiBot.name)})` : 'بوت ديسكوكو'}؛ يمكنك تغييره من الخيار أعلى صفحة AI.</p>`, '<button id="moduleCancel" class="btn secondary" type="button">إلغاء</button><button id="moduleReview" class="btn primary" type="button">مراجعة قبل النشر</button>');
    $('#moduleColor').closest('label').insertAdjacentHTML('afterend', '<label>صورة أو GIF للوحة (اختياري، حتى 8 ميجابايت)<input id="moduleBanner" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label><div id="moduleBannerPreview" class="form-note" role="status"></div>');
    $('#moduleBanner').onchange = event => { const file = event.target.files[0]; $('#moduleBannerPreview').textContent = file ? `${file.name} · ${Math.ceil(file.size / 1024)} كيلوبايت` : ''; };
    $('#dialogContent').querySelectorAll('input:not([type]),textarea').forEach(control=>control.dir='auto');
    if (draft) bindDesignScene(draft,'moduleBanner','moduleConfirmation','modulePublish',item.requestId);
    const english=aiLanguage.language()==='en';
    if(!draft)$('#moduleButton').value=moduleActions[kind]?.[english?1:0] || meta.label;
    if(!draft && english && meta.form){$('#moduleSubjectLabel').value=englishFields[kind]?.[0] || 'Subject';$('#moduleDetailsLabel').value=englishFields[kind]?.[1] || 'Details';}
    if(meta.form){
      for(const [prefix,ar,en,limit] of [['subject','الموضوع','Subject',120],['details','التفاصيل','Details',1000]]){
        const label=document.createElement('label');label.textContent=english?`${en} hint`:`إرشاد خانة ${ar}`;
        const input=document.createElement('input');input.id=`module${prefix}Placeholder`;input.maxLength=100;input.value=draft?.[prefix+'Placeholder'] || '';label.append(input);$('#moduleDetailsLabel').closest('label').after(label);
        const lengthLabel=document.createElement('label');lengthLabel.textContent=english?`${en} maximum length`:`الحد الأقصى لخانة ${ar}`;
        const number=document.createElement('input');number.id=`module${prefix}MaxLength`;number.type='number';number.min=1;number.max=limit;number.value=draft?.[prefix+'MaxLength'] ?? limit;lengthLabel.append(number);label.after(lengthLabel);
      }
    }
    const groups=[
      [english?'1. Content':'١. محتوى اللوحة',['moduleTitle','moduleDescription','moduleButton']],
      [english?'2. Member action and destination':'٢. وظيفة اللوحة ومكانها',['moduleChannel','moduleRole','moduleReviewChannel','moduleStaffRole','moduleSubjectLabel','moduleDetailsLabel','modulesubjectPlaceholder','moduledetailsPlaceholder','modulesubjectMaxLength','moduledetailsMaxLength','moduleAnswer','moduleStartsAt','moduleCapacity']],
      [english?'3. Appearance':'٣. شكل اللوحة',['moduleColor','moduleButtonStyle']],
    ];
    for(const [title,ids] of groups){const labels=ids.map(id=>$('#'+id)?.closest('label')).filter(Boolean);if(!labels.length)continue;const section=document.createElement('fieldset');section.className='ai-module-section';const legend=document.createElement('legend');legend.textContent=title;section.append(legend);labels[0].before(section);for(const label of labels)section.append(label);}
    const intro=$('#dialogContent').querySelector('.form-note');intro.textContent=english?'Customize the content and real member action, then inspect the Discord preview. Review does not publish; confirmation is the final step.':'عدّل المحتوى والوظيفة التي سيستخدمها العضو، ثم راجع المعاينة. فتح المراجعة لا ينشر؛ التنفيذ بعد التأكيد النهائي.';
    if (draft) {
      for (const [id,key] of [['moduleTitle','title'],['moduleDescription','description'],['moduleButton','buttonLabel'],['moduleColor','color'],['moduleButtonStyle','buttonStyle'],['moduleAnswer','answer'],['moduleSubjectLabel','subjectLabel'],['moduleDetailsLabel','detailsLabel'],['moduleCapacity','capacity']]) if ($('#'+id) && draft[key] !== undefined) $('#'+id).value = draft[key];
      const channel = channels.find(channel => channel.name === draft.channel);
      if (channel) $('#moduleChannel').value = channel.id;
      if(saved){$('#moduleChannel').value=saved.config.channelId;$('#moduleChannel').disabled=true;for(const [id,key] of [['moduleRole','roleId'],['moduleReviewChannel','reviewChannelId'],['moduleStaffRole','staffRoleId']])if($('#'+id))$('#'+id).value=saved.config[key] || '';if(saved.config.banner)$('#moduleBannerPreview').innerHTML=`<img style="max-width:100%" src="data:${esc(saved.config.banner.mime)};base64,${esc(saved.config.banner.base64)}" alt="الصورة الحالية للوحة">`;}
    }
    if ($('#moduleStartsAt') && !saved && draft?.startsAt && Number.isFinite(Date.parse(draft.startsAt))) {
      const date=new Date(draft.startsAt); date.setMinutes(date.getMinutes()-date.getTimezoneOffset()); $('#moduleStartsAt').value=date.toISOString().slice(0,16);
    }
    mountEditorPrototype($('#dialogContent'), { english, markdown: discordMarkdownPreview, botName: connectedAiBot?.selected ? connectedAiBot.name : 'ديسكوكو', initial:saved?.config || draft || {}, identity:{save:async config=>api(`/api/workspace/${encodeURIComponent(guild)}/design-identity`,{method:'POST',body:JSON.stringify({...config,executor:(connectedAiBot?.selected?'custom':'diskoko')})}),load:async()=> (await api(`/api/workspace/${encodeURIComponent(guild)}/design-identity?executor=${encodeURIComponent((connectedAiBot?.selected?'custom':'diskoko'))}`)).config}, workflow:english?(item.promptEn || aiPromptLibrary.find(entry=>entry.moduleKind===kind)?.promptEn || ''):labels?.[2] || (kind==='interests'?'يمنح العضو الرتبة العادية المختارة أو يزيلها.':kind==='faq'?'يعرض للعضو الإجابة المحددة.':'يسجل مشاركة العضو في هذه الفعالية.') });
    $('#moduleCancel').onclick = closeDialog;
    $('#moduleReview').onclick = run(async () => {
      const button = $('#moduleReview'); button.disabled = true;
      try {
        const payload = { kind, title: $('#moduleTitle').value, description: $('#moduleDescription').value, buttonLabel: $('#moduleButton').value, channelId: $('#moduleChannel').value, color: $('#moduleColor').value, buttonStyle: Number($('#moduleButtonStyle').value), executor: connectedAiBot?.selected ? 'custom' : 'diskoko' };
        Object.assign(payload,readEditorExtras($('#dialogContent')) || {links:saved?.config.links || draft?.links || [],imagePlacement:saved?.config.imagePlacement || draft?.imagePlacement || 'image'});
        if (item.requestId) payload.sourceRequestId = item.requestId;
        if(item.editInstallId)payload.editInstallId=item.editInstallId;
        if (meta.form) Object.assign(payload, { reviewChannelId: $('#moduleReviewChannel').value, staffRoleId: $('#moduleStaffRole').value, subjectLabel: $('#moduleSubjectLabel').value, detailsLabel: $('#moduleDetailsLabel').value });
        if(meta.form) for(const prefix of ['subject','details'])Object.assign(payload,{[prefix+'Placeholder']:$('#module'+prefix+'Placeholder').value,[prefix+'MaxLength']:Number($('#module'+prefix+'MaxLength').value)});
        if (kind === 'interests') payload.roleId = $('#moduleRole').value;
        if (kind === 'faq') payload.answer = $('#moduleAnswer').value;
        if (kind === 'events') Object.assign(payload, { startsAt: $('#moduleStartsAt').value ? new Date($('#moduleStartsAt').value).toISOString() : '', capacity: Number($('#moduleCapacity').value) });
        const banner = $('#moduleBanner').files[0];
        if (sceneEnabled('moduleBanner')) {payload.banner = await prepareStyledImage(banner,'moduleBanner');payload.designScene=normalizeDesignScene(sceneReviewState.get($('#moduleBanner')).scene);}
        else if (banner) {
          if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(banner.type) || banner.size > 8 * 1024 * 1024) throw Error('اختر PNG أو JPG أو WebP أو GIF بحجم لا يتجاوز 8 ميجابايت.');
          const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(Error('تعذر قراءة الصورة.')); reader.readAsDataURL(banner); });
          payload.banner = { mime: banner.type, base64: dataUrl.split(',')[1] };
        }
        else if(saved?.config.banner){payload.banner=saved.config.banner;if(saved.config.designScene)payload.designScene=saved.config.designScene;}
        const review = await api(`/api/workspace/${encodeURIComponent(guild)}/standalone-modules/review`, { method: 'POST', body: JSON.stringify(payload) });
        modal('مراجعة تركيب الميزة', `<div class="notice info"><div><b>${esc(review.config.title)}</b><p>${review.editing ? 'ستُعدّل اللوحة الحالية في' : 'ستُنشر لوحة في'} # ${esc(review.channelName)} بواسطة ${review.executor === 'custom' ? 'بوتك الخاص' : 'بوت ديسكوكو'}.</p></div></div><div class="ready-preview-card" style="--ready-accent:${esc(review.config.color)}">${payload.banner ? `<img class="ready-banner" src="data:${esc(payload.banner.mime)};base64,${esc(payload.banner.base64)}" alt="صورة اللوحة">` : ''}<b>${esc(review.config.title)}</b><p dir="auto">${discordMarkdownPreview(review.config.description)}</p><button class="btn small" style="background:${["","#5865f2","#4e5058","#248046","#da373c"][review.config.buttonStyle]}" disabled>${esc(review.config.buttonLabel)}</button></div><p class="form-note">${review.editing ? 'الإجراء الوحيد الآن: تعديل نفس الرسالة المنشورة؛ لا تُنشأ لوحة إضافية.' : 'الإجراء الوحيد الآن: نشر اللوحة التفاعلية.'} سيُحسب تغيير واحد بعد نجاح Discord، ولا ينشئ هذا الإجراء قنوات أو رتبًا جديدة.</p>`, '<button id="moduleLater" class="btn secondary" type="button">لاحقًا</button><button id="moduleApply" class="btn primary" type="button">نعم، انشر الميزة</button>');
        const reviewCard=$('#dialogContent .ready-preview-card');
        if(review.config.layout!=='image_first' && review.config.imagePlacement!=='thumbnail'){const image=reviewCard?.querySelector('img');if(image)reviewCard.querySelector('p').after(image);}
        const summary=document.createElement('section');summary.className='notice info';const summaryTitle=document.createElement('b');summaryTitle.textContent=english?'Configuration to publish':'الإعدادات التي ستُنشر';summary.append(summaryTitle);const details=document.createElement('p');details.textContent=[review.config.formFields?`${review.config.formFields.length} ${english?'form fields':'خانات'}: ${review.config.formFields.map(field=>field.label).join(' · ')}`:'',review.config.questions?`${review.config.questions.length} ${english?'questions':'أسئلة'}`:'',review.config.roleIds?`${review.config.roleIds.length} ${english?'roles; maximum':'رتب؛ أقصى اختيار'} ${review.config.maxRoles}`:'',review.config.waitlist?(english?'Waiting list enabled':'قائمة الانتظار مفعلة'):'',review.config.checkIn?(english?'Check-in enabled':'تأكيد الحضور مفعل'):'',review.config.reminderMinutes?`${english?'Channel reminder:':'تذكير في القناة:'} ${review.config.reminderMinutes} ${english?'minutes':'دقيقة'}`:'',review.config.notifyMember?(english?'Private status notifications enabled':'إشعارات الحالة الخاصة مفعلة'):'',review.config.reviewChannelId?`# ${channels.find(channel=>channel.id===review.config.reviewChannelId)?.name || review.config.reviewChannelId}`:''].filter(Boolean).join('\n');details.style.whiteSpace='pre-line';summary.append(details);reviewCard.before(summary);
        const before=saved?.config || draft;if(before){const changed=['title','description','buttonLabel','color','buttonStyle','footer','imagePlacement','layout','formFields','questions','roleIds','maxRoles','waitlist','checkIn','reminderMinutes','notifyMember','capacity','startsAt','links'].filter(key=>JSON.stringify(before[key])!==JSON.stringify(review.config[key]) && review.config[key]!==undefined);if(changed.length){const diff=document.createElement('details');const title=document.createElement('summary');title.textContent=english?'Changed settings':'الإعدادات المعدلة';diff.append(title);for(const key of changed){const line=document.createElement('p');const labels={title:'العنوان',description:'الوصف',buttonLabel:'نص الزر',color:'اللون',buttonStyle:'نمط الزر',footer:'التذييل',imagePlacement:'موضع الصورة',layout:'ترتيب العرض',formFields:'خانات النموذج',questions:'الأسئلة',roleIds:'الرتب',maxRoles:'حد الاختيار',waitlist:'الانتظار',checkIn:'الحضور',reminderMinutes:'التذكير',notifyMember:'الإشعارات',capacity:'السعة',startsAt:'الموعد',links:'الروابط'};const format=value=>typeof value==='object'?JSON.stringify(value).slice(0,200):String(value ?? '—').slice(0,200);line.textContent=`${english?key:labels[key]}: ${format(before[key])} → ${format(review.config[key])}`;diff.append(line);}summary.append(diff);}}
        if(review.config.footer){const footer=document.createElement('small');footer.textContent=review.config.footer;reviewCard.append(footer);}
        if(review.config.imagePlacement==='thumbnail' && reviewCard?.querySelector('img')) { const image=reviewCard.querySelector('img'); image.style.cssText='float:right;width:80px;height:80px;object-fit:contain;margin:0 0 12px 16px'; }
        for(const link of review.config.links || []){const element=document.createElement('span');element.className='ai-discord-button';element.style.background='#4e5058';element.textContent=link.label+' ↗';element.title=link.url;reviewCard.append(element);}
        $('#moduleLater').onclick = closeDialog;
        $('#moduleApply').onclick = run(async () => { const apply = $('#moduleApply'); apply.disabled = true; try { const result = await api(`/api/workspace/${encodeURIComponent(guild)}/standalone-modules/${encodeURIComponent(review.id)}/apply`, { method: 'POST', body: '{}' }); closeDialog(); const source=messages.find(message=>message.id===item.requestId); if(source){source.proposal.interactive={...source.proposal.interactive,title:review.config.title,description:review.config.description,buttonLabel:review.config.buttonLabel,color:review.config.color,buttonStyle:review.config.buttonStyle,designScene:review.config.designScene};Object.assign(source,{interactive_kind:'module',publication_state:'completed',interactive_message_id:result.messageId,interactive_channel_id:result.channelId || payload.channelId,module_install_id:item.editInstallId || review.id});renderMessages();} toast(result.editing?'عُدّلت اللوحة الحالية بنجاح دون إنشاء لوحة إضافية.':'نُشرت الميزة بنجاح وحُسب تغيير واحد.'); if (result.channelId && result.messageId) window.open(`https://discord.com/channels/${encodeURIComponent(guild)}/${encodeURIComponent(result.channelId)}/${encodeURIComponent(result.messageId)}`, '_blank', 'noopener'); } catch (error) { modalError(new Error(error.message+' — راجع حالة اللوحة قبل إعادة التنفيذ / Review panel state before retrying')); apply.disabled = true; } });
      } catch (error) { modalError(error); button.disabled = false; }
    });
  };
  const previewMemberRail = () => `<aside class="ai-discord-members"><b>الأعضاء ${Number.isFinite(Number(state.data?.onlineMembers)) && state.data?.onlineMembers !== null ? `— ${fmt(state.data.onlineMembers)} تقريبًا` : ''}</b>${state.data?.bot?.online ? '<div class="ai-discord-member"><span class="ai-discord-member-avatar">◈<i></i></span><span>ديسكوكو<small>BOT</small></span></div>' : ''}<p>أسماء المتصلين الفعلية تظهر في Discord؛ المعاينة لا تخمّنها.</p></aside>`;
  const renderLibrary = () => {
    $('#aiLibraryCategories').innerHTML = ['الكل', ...new Set(aiPromptLibrary.map(item => item.category))].map(category => `<button type="button" class="${category === libraryCategory ? 'active' : ''}" data-ai-category="${esc(category)}">${esc(category)}</button>`).join('');
    $('#aiLibraryCategories').querySelectorAll('[data-ai-category]').forEach(button => button.onclick = () => { libraryCategory = button.dataset.aiCategory; renderLibrary(); });
    const query = $('#aiLibrarySearch').value.trim().toLocaleLowerCase('ar');
    const matched = aiPromptLibrary.map((item, index) => ({ ...item, index })).filter(item => (libraryCategory === 'الكل' || item.category === libraryCategory) && (!query || `${item.title} ${item.titleEn} ${item.category} ${item.prompt} ${item.promptEn}`.toLocaleLowerCase('ar').includes(query)));
    $('#aiLibraryList').innerHTML = matched.length ? matched.map(item => `<button type="button" class="ai-library-item" data-ai-template="${item.index}"><span>${!!(item.kind || item.moduleKind)?(aiLanguage.language()==='en'?'✦ Open editor':'✦ افتح المحرر'):(aiLanguage.language()==='en'?'✦ Starter message':'✦ رسالة بداية')}</span><b>${esc(item.title)}</b><small>${esc(item.prompt)}</small><span class="ai-library-features">${libraryFeatures(item,aiLanguage.language()==='en').map(feature=>`<small>${esc(feature)}</small>`).join('')}</span><small>${!!(item.kind || item.moduleKind)?(aiLanguage.language()==='en'?'Open the preview, complete your details and confirm when ready.':'افتح المعاينة، أكمل بياناتك وعدّل الشكل، ثم أكد عند الجاهزية.'):(aiLanguage.language()==='en'?'Send and customize this request. AI builds an editable draft for your needs.':'أرسل الطلب وعدّله باحتياجك؛ يبني AI مسودة قابلة للتعديل.')}</small></button>`).join('') : '<p class="ai-library-empty">لا توجد نتائج. جرّب كلمة أخرى.</p>';
    $('#aiLibraryList').querySelectorAll('[data-ai-template]').forEach(button => button.onclick = () => {
      selectedTemplate = aiPromptLibrary[Number(button.dataset.aiTemplate)];
      const directEditor=!!(selectedTemplate.kind || selectedTemplate.moduleKind);
      if (selected && messages.length) {
        selected = ''; messages = []; sessionStorage.removeItem(storageKey); renderList(); renderMessages();
        notice.textContent = 'بدأت مسودة جديدة حتى لا تختلط المهمة بسياق محادثة سابقة.';
      }
      input.value = aiLanguage.language()==='en'?`Build a custom functional panel: ${selectedTemplate.promptEn}`:`جهز لي لوحة مخصصة قابلة للتعديل: ${selectedTemplate.prompt}`;
      $('#aiTemplateDraft').hidden = false;
      $('#aiTemplateDraft').innerHTML = `<div><b>مسودة: ${esc(selectedTemplate.title)}</b><small>${selectedTemplate.moduleKind ? 'أرسل الطلب أولًا، ثم سيرد ديسكوكو AI بخطوة إعداد هذه الميزة ومراجعتها.' : `${esc(aiLibraryFlow(selectedTemplate))}. تقدر ترسلها كما هي وتكمل التفاصيل في بطاقة المراجعة.`}</small></div><button id="aiClearTemplate" type="button" class="btn small secondary">مسح المسودة</button>`;
      $('#aiClearTemplate').onclick = () => { selectedTemplate = null; input.value = ''; $('#aiTemplateDraft').hidden = true; input.focus(); };
      if(directEditor){ attachedFile=null; $('#aiFile').value=''; showAttachment(); $('#assistantForm').requestSubmit(); return; }
      input.focus(); input.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    });
  };
  $('#aiLibrarySearch').oninput = renderLibrary;
  renderLibrary();
  const workshopKey = `diskoko-workshop-feature:${guild}`;
  const workshopSelection = sessionStorage.getItem(workshopKey);
  if (workshopSelection) {
    sessionStorage.removeItem(workshopKey);
    try {
      const { category, title } = JSON.parse(workshopSelection);
      const index = aiPromptLibrary.findIndex(item => item.category === category && item.title === title);
      if (index >= 0) {
        libraryCategory = category;
        renderLibrary();
        $('#aiLibraryList').querySelector(`[data-ai-template="${index}"]`)?.click();
      }
    } catch { /* تجاهل اختيارًا قديمًا غير صالح */ }
  }
  let attachedFile = null;
  let previewUrl = '';
  const showAttachment = () => { const bar = $('#aiAttachment'); if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = attachedFile?.type.startsWith('image/') ? URL.createObjectURL(attachedFile) : ''; bar.hidden = !attachedFile; bar.innerHTML = attachedFile ? `${previewUrl ? `<img src="${previewUrl}" alt="معاينة الصورة المرفقة">` : '📎'}<span>${esc(attachedFile.name)} · ${previewUrl ? 'الصورة مرجع للفهم فقط ولن تُنشر تلقائيًا. ارفع الصورة النهائية التي تريد استخدامها داخل بطاقة المراجعة.' : 'سيضاف محتواه إلى سؤالك'}</span><button id="aiRemoveFile" type="button" class="btn small secondary">إزالة</button>` : ''; if (attachedFile) $('#aiRemoveFile').onclick = () => { attachedFile = null; $('#aiFile').value = ''; showAttachment(); }; };
  $('#aiAttach').onclick = () => $('#aiFile').click();
  $('#aiFile').onchange = event => { const file = event.target.files[0]; if (!file) return; const limit = file.type === 'image/gif' ? 20 : 10; if (file.size > limit * 1024 * 1024) { toast(`الملف أكبر من ${limit} ميجابايت.`); event.target.value = ''; return; } attachedFile = file; showAttachment(); };
  const renderProposal = item => {
    if (['publishing','review_required'].includes(item.publication_state)) return '<div class="notice warning">حالة النشر غير مؤكدة وتحتاج مراجعة الإدارة. أُوقفت إعادة التنفيذ لمنع نشر لوحة مكررة.</div>';
    const proposal = item.status === 'completed' ? item.proposal : null;
    if (!proposal) return '';
    const superseded=!item.sent_message_id && !item.interactive_message_id && !item.interactive_kind && messages.slice(messages.indexOf(item)+1).some(next=>['pending','processing'].includes(next.status) || (next.status==='completed' && next.proposal));
    if(superseded)return `<div class="ai-action-card"><b>${aiLanguage.language()==='en'?'Previous draft':'نسخة سابقة'}</b><p>${aiLanguage.language()==='en'?'Open the latest draft below to review and publish your changes.':'افتح أحدث مسودة بالأسفل لمراجعة تعديلاتك ونشرها.'}</p></div>`;
    if (proposal.interactive?.kind === 'module') return `<div class="ai-action-card"><b>${esc(proposal.interactive.title)}</b><p>${esc(proposal.interactive.description)}</p><p>الزر: ${esc(proposal.interactive.buttonLabel)}</p>${item.interactive_message_id ? `<a class="btn small secondary" href="https://discord.com/channels/${encodeURIComponent(guild)}/${encodeURIComponent(item.interactive_channel_id)}/${encodeURIComponent(item.interactive_message_id)}" target="_blank" rel="noopener noreferrer">تم النشر · عرض في Discord</a>${item.module_install_id ? `<button class="btn small secondary" type="button" data-ai-module="${esc(item.id)}">تعديل إعدادات اللوحة</button>` : ''}` : `<button class="btn primary small" type="button" data-ai-module="${esc(item.id)}">تعديل المسودة والمعاينة ومراجعة النشر</button><small>اختر القناة والرتبة في المراجعة. لم يُنشر شيء بعد.</small>`}</div>`;
    const interactiveSummary = proposal.interactive?.kind === 'giveaway' ? `🎉 جيف آواي${proposal.interactive.prize ? `: ${esc(proposal.interactive.prize)}` : ' · أكمل الجائزة والمدة في بطاقة المراجعة'}${proposal.interactive.durationMinutes ? ` · ${esc(proposal.interactive.winnerCount)} فائز · ${esc(proposal.interactive.durationMinutes)} دقيقة` : ''}` : proposal.interactive?.kind === 'poll' ? `📊 استطلاع${proposal.interactive.question ? `: ${esc(proposal.interactive.question)}` : ' · أكمل السؤال والخيارات في بطاقة المراجعة'}` : proposal.interactive?.kind === 'scheduled_event' ? '🗓️ حدث Discord أصلي يظهر في Events' : proposal.interactive?.kind === 'event' ? '🎊 إعلان فعالية مع تسجيل اختياري' : proposal.interactive?.kind === 'welcome' ? '👋 ترحيب تلقائي لكل عضو جديد' : proposal.interactive?.kind === 'rules' ? '📜 بطاقة قوانين السيرفر · اختر طريقة العرض وراجعها' : proposal.interactive?.kind === 'channel_control' ? '⚙️ تحكم بالقناة · راجع الصلاحيات والتفاصيل' : `🎫 لوحة تذاكر${proposal.interactive?.title ? `: ${esc(proposal.interactive.title)}` : ' · أكمل العنوان والوصف في بطاقة المراجعة'}`;
    return `<div class="ai-action-card"><span class="ai-action-step">${item.sent_message_id || item.interactive_message_id || item.interactive_kind ? 'تم التنفيذ · الإعدادات متاحة للتعديل' : (proposal.draft || proposal.draftContract?.state === 'needs_setup') ? 'أكمل التفاصيل قبل التنفيذ' : 'الخطوة الأخيرة قبل التنفيذ'}</span><b>${item.sent_message_id || item.interactive_message_id || item.interactive_kind ? 'النتيجة في' : 'راجع ما سيتغير في'} ${esc(state.data?.guild?.name || 'سيرفرك')}</b><p><strong>طلبك:</strong> ${esc(proposal.review_request || item.prompt)}</p>${proposal.message ? `<p><strong>رسالة Discord:</strong> ${esc(proposal.message.content || 'حدد القناة واكتب النص النهائي في بطاقة المراجعة.')}</p>${item.sent_message_id ? `<a class="btn small secondary" href="https://discord.com/channels/${encodeURIComponent(guild)}/${encodeURIComponent(item.sent_channel_id)}/${encodeURIComponent(item.sent_message_id)}" target="_blank" rel="noopener noreferrer">تم الإرسال · عرض في Discord</a>` : `<button class="btn primary small" type="button" data-ai-message="${esc(item.id)}">مراجعة الرسالة وتأكيد النشر</button>`}` : ''}${proposal.interactive ? `${(item.interactive_message_id || item.interactive_kind === 'welcome') && ['tickets','event','poll','rules','giveaway','welcome'].includes(proposal.interactive.kind) ? `<button class="btn small secondary" data-ai-interactive="${esc(item.id)}" data-ai-edit="true">تعديل إعدادات اللوحة</button>` : ''}<p><strong>${proposal.interactive.kind === 'rules' ? 'بطاقة النشر' : 'النظام التفاعلي'}:</strong> ${interactiveSummary}${item.has_attachment && !proposal.interactive.referenceOnly && proposal.interactive.kind !== 'poll' ? ' · 🖼️ مع بنر' : ''}</p>${item.interactive_kind === 'channel_control' ? '<span class="badge good">تم تعديل القناة</span>' : item.interactive_kind === 'welcome' ? '<span class="badge good">الترحيب التلقائي مفعّل</span>' : item.interactive_kind === 'scheduled_event' && item.interactive_message_id ? `<a class="btn small secondary" href="https://discord.com/events/${encodeURIComponent(guild)}/${encodeURIComponent(item.interactive_message_id)}" target="_blank" rel="noopener noreferrer">تم الإنشاء · عرض الحدث في Discord</a>` : item.interactive_message_id ? `<a class="btn small secondary" href="https://discord.com/channels/${encodeURIComponent(guild)}/${encodeURIComponent(item.interactive_channel_id)}/${encodeURIComponent(item.interactive_message_id)}" target="_blank" rel="noopener noreferrer">تم النشر · عرض في Discord</a>${item.module_install_id ? `<button class="btn small secondary" type="button" data-ai-module="${esc(item.id)}">تعديل إعدادات اللوحة</button>` : ''}` : `<button class="btn primary small" type="button" data-ai-interactive="${esc(item.id)}">إكمال التفاصيل ومراجعة النشر</button>`}` : ''}<small>${item.sent_message_id || item.interactive_message_id || ['welcome', 'scheduled_event'].includes(item.interactive_kind) || item.change_set_status === 'succeeded' ? 'راجع العملية المنفذة في السجل.' : 'لم يُنفّذ شيء بعد. يمكنك مراجعة التفاصيل قبل التأكيد.'}</small></div>`;
  };
  const renderList = () => {
    list.innerHTML = conversations.length ? conversations.map(item => `<div class="ai-conversation-row ${item.id === selected ? 'active' : ''}"><button type="button" class="ai-conversation" data-ai-conversation="${esc(item.id)}"><b>${esc(item.title)}</b><small>${siteDate(new Date(item.updated_at), "toLocaleDateString")}</small></button><button type="button" class="ai-delete-conversation" data-ai-delete="${esc(item.id)}" aria-label="حذف محادثة ${esc(item.title)}" title="حذف المحادثة">⌫</button></div>`).join('') : '<p class="ai-empty-list">محادثاتك ستظهر هنا بعد أول رسالة.</p>';
    list.querySelectorAll('[data-ai-conversation]').forEach(button => button.onclick = () => { selected = button.dataset.aiConversation; sessionStorage.setItem(storageKey, selected); renderList(); loadMessages().catch(error => { notice.textContent = error.message; }); });
    list.querySelectorAll('[data-ai-delete]').forEach(button => button.onclick = () => {
      const conversation = conversations.find(item => item.id === button.dataset.aiDelete); if (!conversation) return;
      confirmDialog('حذف المحادثة؟', `ستُحذف محادثة «${conversation.title}» ورسائلها ومرفقاتها نهائيًا من ديسكوكو. لن تُحذف الرسائل أو الأنظمة التي سبق نشرها داخل Discord.`, 'حذف المحادثة', async () => {
        await api(`/api/ai/conversations/${encodeURIComponent(conversation.id)}`, { method: 'DELETE' });
        if (selected === conversation.id) { selected = ''; messages = []; sessionStorage.removeItem(storageKey); }
        closeDialog(); await refreshList(); renderMessages(); toast('حُذفت المحادثة.');
      });
    });
  };
  const renderMessages = () => {
    $('#aiChatTitle').textContent = conversations.find(item => item.id === selected)?.title || 'محادثة جديدة';
    thread.innerHTML = messages.length ? messages.map(item => `<div class="ai-turn"><div class="ai-bubble user"><b>أنت</b><div>${esc(item.prompt)}</div>${item.has_attachment ? `<img class="ai-sent-image" src="/api/ai/requests/${encodeURIComponent(item.id)}/attachment" alt="الصورة المرفقة بهذه الرسالة">` : ''}</div><div class="ai-bubble assistant"><b>AI ديسكوكو</b><div>${esc(item.status === 'completed' ? item.answer || '' : item.status === 'failed' ? item.error || 'تعذر توليد الرد. حاول مجددًا.' : 'جارٍ تجهيز الرد…')}</div>${item.status === 'completed' && item.library_mode === 'module' ? `<button class="btn small primary" type="button" data-ai-module="${esc(item.id)}">إعداد الميزة ومراجعتها</button>` : ''}${item.status === 'completed' && item.answer && !item.proposal && !item.sent_message_id && item.can_publish_answer !== false ? `<button class="btn small secondary" type="button" data-ai-publish-answer="${esc(item.id)}">حوّل الرد إلى رسالة للمراجعة</button>` : ''}${item.status === 'completed' && item.can_select_step && aiActionChoices(item.answer).length ? `<div class="ai-choice-list"><small>اختر فكرة أو خطوة لنجهز تطبيقها:</small>${aiActionChoices(item.answer).map((choice, index) => `<button class="btn small secondary" type="button" data-ai-choice="${esc(item.id)}" data-choice-index="${index}">${esc(choice.slice(0, 95))}</button>`).join('')}</div>` : ''}${item.sent_message_id && !item.proposal ? `<a class="btn small secondary" href="https://discord.com/channels/${encodeURIComponent(guild)}/${encodeURIComponent(item.sent_channel_id)}/${encodeURIComponent(item.sent_message_id)}" target="_blank" rel="noopener noreferrer">عرض الرسالة المنشورة في Discord</a>` : ''}</div>${renderProposal(item)}</div>`).join('') : `<div class="ai-welcome"><span>✦</span><h2>أهلًا، أنا AI ديسكوكو</h2><p>قل لي وش تحتاج في سيرفرك، وبساعدك بخطوات واضحة. تقدر تتابع معي في نفس المحادثة، وسأفهم سياق كلامنا.</p><div class="ai-suggestions"><button type="button" data-ai-suggestion="اقترح لي ترتيب رومات لسيرفر ألعاب">رتب لي الرومات</button><button type="button" data-ai-suggestion="اقترح رتب وصلاحيات مناسبة لمجتمعي">نظّم الرتب</button></div></div>`;
    thread.querySelectorAll('[data-ai-module]').forEach(button => button.onclick = () => {
      const message = messages.find(item => item.id === button.dataset.aiModule);
      const module = aiPromptLibrary.find(item => item.moduleKind && item.category === message?.library_category && item.title === message?.library_title);
      const draft = message?.proposal?.interactive;
      if (draft?.kind === 'module') showStandaloneModule({ moduleKind: draft.moduleKind, draft, requestId: message.id,editInstallId:message.interactive_message_id?message.module_install_id:undefined });
      else if (module) showStandaloneModule(module);
    });
    thread.querySelectorAll('.ai-turn').forEach((turn, index) => {
      const item = messages[index];
      if (item?.status !== 'completed' || !item.can_select_step || aiActionChoices(item.answer).length) return;
      const button = document.createElement('button'); button.className = 'btn small secondary'; button.type = 'button'; button.textContent = 'اختر خطوة قابلة للتطبيق';
      button.onclick = () => { input.value = `أريد تطبيق نتيجة «${item.library_title || item.prompt.slice(0, 80)}» في سيرفري. اختر معي خطوة فعلية محددة من الرد السابق، واعرض فقط ما يمكن للبوت تنفيذه للمراجعة. لا تنشر الخطة كاملة كرسالة، واسألني عن التفاصيل الضرورية إن نقصت.`.slice(0, 1500); input.focus(); input.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); };
      turn.querySelector('.ai-bubble.assistant')?.appendChild(button);
    });
    thread.querySelectorAll('[data-ai-suggestion]').forEach(button => button.onclick = () => { input.value = button.dataset.aiSuggestion; input.focus(); });
    thread.querySelectorAll('[data-ai-choice]').forEach(button => button.onclick = () => {
      const item = messages.find(entry => entry.id === button.dataset.aiChoice);
      const choice = aiActionChoices(item?.answer)[Number(button.dataset.choiceIndex)];
      if (!choice) return;
      input.value = `اخترت هذه الفكرة من خطتك: «${choice}». أريد تطبيقها في سيرفري. حدد الإجراء الحقيقي الذي يحققها، واعرض خطواته للمراجعة. لا تنشر شرح الفكرة نفسه كرسالة، ولا تستبدلها بفكرة مختلفة. اسألني عن التفاصيل الضرورية إن نقصت، ووضح إذا كان جزء منها غير مدعوم حاليًا.`.slice(0, 1500);
      input.focus(); input.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    });
    thread.querySelectorAll('[data-ai-publish-answer]').forEach(button => button.onclick = () => {
      const item = messages.find(entry => entry.id === button.dataset.aiPublishAnswer);
      if (!item?.answer || item.status !== 'completed') return;
      const textChannels = (state.data.channels || []).filter(channel => [0, 5].includes(channel.type));
      modal('حوّل الرد إلى رسالة', `<p class="form-note">هذا الرد لم يُنشر بعد. حرّر النص وحدد القناة؛ لن يرسل البوت شيئًا حتى تؤكد.</p><label>قناة النشر<select id="aiAnswerChannel"><option value="">اختر قناة نصية</option>${textChannels.map(channel => `<option value="${esc(channel.id)}">#${esc(channel.name)}</option>`).join('')}</select></label><label>النص النهائي<textarea id="aiAnswerContent" rows="8" maxlength="1800">${esc(item.answer.slice(0, 1800))}</textarea></label><label class="check-row"><input id="aiAnswerConfirmed" type="checkbox">راجعت النص والقناة وأوافق على نشره.</label>`, '<button class="btn secondary" id="aiAnswerCancel">إلغاء</button><button class="btn primary" id="aiAnswerSend" disabled>نعم، أؤكد النشر</button>');
      $('#aiAnswerCancel').onclick = closeDialog;
      $('#aiAnswerConfirmed').onchange = event => { $('#aiAnswerSend').disabled = !event.target.checked; };
      $('#aiAnswerSend').onclick = async event => { event.currentTarget.disabled = true; try {
        if (!$('#aiAnswerChannel').value) throw Error('اختر القناة التي ستُنشر فيها الرسالة.');
        await api(`/api/ai/requests/${encodeURIComponent(item.id)}/send-message`, { method: 'POST', body: JSON.stringify({ confirmed: true, publishAnswer: true, channelId: $('#aiAnswerChannel').value, content: $('#aiAnswerContent').value }) });
        closeDialog(); await loadMessages(); toast('نُشرت الرسالة في Discord.');
      } catch (error) { modalError(error); $('#aiAnswerSend').disabled = false; } };
    });
    thread.querySelectorAll('[data-ai-message]').forEach(button => button.onclick = () => {
      const item = messages.find(entry => entry.id === button.dataset.aiMessage);
      if (!item?.proposal?.message) return;
      const textChannels = (state.data.channels || []).filter(channel => [0, 5].includes(channel.type));
      modal('مراجعة الرسالة قبل إرسالها', `<label>قناة النشر<select id="aiMessageChannel"><option value="">اختر قناة نصية</option>${textChannels.map(channel => `<option value="${esc(channel.id)}" ${channel.name.toLowerCase() === item.proposal.message.channel.toLowerCase() ? 'selected' : ''}>#${esc(channel.name)}</option>`).join('')}</select></label><label>نص الرسالة<textarea id="aiMessageContent" rows="5" maxlength="1800">${esc(item.proposal.message.content)}</textarea></label>${item.has_attachment && !item.proposal.message.referenceOnly ? `<div class="ai-review-image"><img src="/api/ai/requests/${encodeURIComponent(item.id)}/attachment" alt="الصورة المرفقة مع طلبك"><span>ستُرسل هذه الصورة مع الرسالة إلى Discord</span></div>` : ''}<label>تغيير الصورة أو إرفاق صورة (اختياري)<input id="aiMessageImage" type="file" accept="image/png,image/jpeg,image/webp"></label><p class="form-note">ستُنشر مرة واحدة بواسطة بوت ديسكوكو، ولن تُرسل إشارات جماعية.</p><label class="check-row"><input id="aiMessageConfirmed" type="checkbox">راجعت الرسالة والقناة وأوافق على نشرها.</label>`, '<button class="btn secondary" id="aiMessageCancel">إلغاء</button><button class="btn primary" id="aiMessageSend" disabled>نعم، أؤكد التنفيذ</button>');
      $('#aiMessageContent').closest('label').insertAdjacentHTML('afterend', '<div class="ai-format-toolbar" role="toolbar" aria-label="تنسيق رسالة Discord"><button type="button" data-format="heading" title="عنوان كبير">عنوان</button><button type="button" data-format="bold" title="عريض"><b>عريض</b></button><button type="button" data-format="italic" title="مائل"><i>مائل</i></button><button type="button" data-format="underline" title="تسطير"><u>تسطير</u></button><button type="button" data-format="strike" title="يتوسطه خط"><s>شطب</s></button><button type="button" data-format="spoiler" title="نص مخفي">مخفي</button><button type="button" data-format="quote" title="اقتباس">اقتباس</button><button type="button" data-format="code" title="رمز برمجي">كود</button><button type="button" data-format="link" title="رابط باسم">رابط</button></div><small class="form-note">هذه أدوات تنسيق Discord الفعلية؛ نوع الخط وحجمه الحر لا يتغيران في الرسائل العادية.</small>');
      $('#aiMessageImage').accept = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime';
      $('#aiMessageImage').closest('label').firstChild.textContent = 'صورة حتى 10 ميجابايت أو GIF/فيديو MP4/MOV حتى 20 ميجابايت';
      $('#aiMessageImage').closest('label').insertAdjacentHTML('afterend', '<label>موضع الصورة في Discord<select id="aiMessageImagePosition"><option value="above">فوق النص</option><option value="below">تحت النص</option></select></label>');
      $('#aiMessageImagePosition').closest('label').insertAdjacentHTML('afterend', imageStyleFields('aiMessageImage'));
      $('#aiMessageImagePosition').closest('label').insertAdjacentHTML('afterend', `<section class="ai-discord-preview" aria-label="معاينة الرسالة داخل السيرفر"><div class="ai-discord-preview-head"><b>معاينة داخل ${esc(state.data?.guild?.name || 'سيرفرك')}</b><small>شكل تقريبي قبل الإرسال</small></div><div class="ai-discord-server"><aside class="ai-discord-server-channels"><b data-i18n-preserve>${esc(state.data?.guild?.name || 'السيرفر')}</b>${textChannels.slice(0, 7).map(channel => `<span data-preview-channel="${esc(channel.id)}"># ${esc(channel.name)}</span>`).join('')}</aside><div class="ai-discord-server-chat"><div class="ai-discord-channel-name" id="aiMessagePreviewChannel"></div><div class="ai-discord-bot-name">◈ ديسكوكو <small>BOT</small></div><div class="ai-message-preview-body"><p id="aiMessagePreviewText"></p>${item.has_attachment && !item.proposal.message.referenceOnly ? `<img class="ai-discord-banner" src="/api/ai/requests/${encodeURIComponent(item.id)}/attachment" alt="الصورة المرفقة">` : ''}</div></div>${previewMemberRail()}</div></section>`);
      let messagePreviewUrl = '';
      const updateMessagePreview = () => {
        const selectedChannel = $('#aiMessageChannel').selectedOptions[0]?.textContent || 'اختر قناة النشر';
        $('#aiMessagePreviewChannel').textContent = selectedChannel.startsWith('#') ? selectedChannel : `# ${selectedChannel}`;
        $('#aiMessagePreviewText').innerHTML = discordMarkdownPreview($('#aiMessageContent').value.trim() || 'اكتب نص الرسالة لترى المعاينة.');
        document.querySelectorAll('[data-preview-channel]').forEach(entry => entry.classList.toggle('active', entry.dataset.previewChannel === $('#aiMessageChannel').value));
        const body = $('.ai-message-preview-body'), banner = body.querySelector('.ai-discord-banner');
        if (banner) { const visual = banner.closest('.ai-card-image-wrap') || banner; $('#aiMessageImagePosition').value === 'above' ? body.prepend(visual) : body.append(visual); }
        updateStyledImagePreview('aiMessageImage', banner);
      };
      $('#aiMessageConfirmed').closest('label').insertAdjacentHTML('beforebegin', panelReviewFields(item.proposal.message, false));
      bindPanelReview(item.proposal.message, '.ai-message-preview-body', 'aiMessageConfirmed', 'aiMessageSend',item.id);
      $('#aiMessageContent').oninput = updateMessagePreview;
      document.querySelectorAll('.ai-format-toolbar [data-format]').forEach(formatButton => formatButton.onclick = () => {
        const field = $('#aiMessageContent'), start = field.selectionStart, end = field.selectionEnd;
        const selected = field.value.slice(start, end) || 'النص';
        const wrap = { bold: ['**', '**'], italic: ['*', '*'], underline: ['__', '__'], strike: ['~~', '~~'], spoiler: ['||', '||'], code: ['`', '`'], link: ['[', '](https://example.com)'] }[formatButton.dataset.format];
        const replacement = formatButton.dataset.format === 'heading' ? `# ${selected}` : formatButton.dataset.format === 'quote' ? `> ${selected}` : `${wrap[0]}${selected}${wrap[1]}`;
        field.setRangeText(replacement, start, end, 'select'); field.focus(); updateMessagePreview();
      });
      $('#aiMessageChannel').onchange = updateMessagePreview;
      $('#aiMessageImagePosition').onchange = updateMessagePreview;
      $('#aiMessageImageStyle').onchange = updateMessagePreview;
      $('#aiMessageImageLogo').onchange = updateMessagePreview;
      bindLogoPlacement('aiMessageImage', updateMessagePreview);
      $('#aiMessageImage').onchange = event => {
        if (messagePreviewUrl) URL.revokeObjectURL(messagePreviewUrl);
        const file = event.target.files[0]; if (!file) return;
        messagePreviewUrl = URL.createObjectURL(file);
        let banner = $('.ai-message-preview-body .ai-discord-banner');
        const video = file.type.startsWith('video/');
        if (banner && (banner.tagName === 'VIDEO') !== video) { (banner.closest('.ai-card-image-wrap') || banner).remove(); banner = null; }
        if (!banner) { banner = document.createElement(video ? 'video' : 'img'); banner.className = 'ai-discord-banner'; if (video) banner.controls = true; else banner.alt = 'معاينة الصورة'; $('.ai-message-preview-body').append(banner); }
        banner.src = messagePreviewUrl; updateMessagePreview();
      };
      updateMessagePreview();
      $('#aiMessageCancel').onclick = closeDialog;
      $('#aiMessageConfirmed').onchange = event => { $('#aiMessageSend').disabled = !event.target.checked; };
      $('#aiMessageSend').onclick = async event => { event.currentTarget.disabled = true; try {
        if (!$('#aiMessageChannel').value) throw Error('اختر القناة التي ستُنشر فيها الرسالة.');
        const file = $('#aiMessageImage').files[0];
        if (!file && $('#aiMessageImageStyle').value !== 'normal') throw Error('ارفع صورة للشعار أو التصميم أولًا.');
        const animated = file && (file.type === 'image/gif' || file.type.startsWith('video/'));
        if(animated && sceneEnabled('aiMessageImage'))throw Error('Flexible design requires a final static image / التصميم المرن يحتاج صورة ثابتة');
        if (animated && $('#aiMessageImageStyle').value !== 'normal') throw Error('الشعار الدائري يحتاج صورة PNG أو JPG أو WebP ثابتة.');
        const image = (file || sceneEnabled('aiMessageImage')) && !animated ? await prepareStyledImage(file, 'aiMessageImage') : undefined;
        const media = animated ? await prepareAiMedia(file) : undefined;
        await api(`/api/ai/requests/${encodeURIComponent(item.id)}/send-message`, { method: 'POST', body: JSON.stringify({ ...readPanelReview(), confirmed: true, channelId: $('#aiMessageChannel').value, content: $('#aiMessageContent').value, image, media, imagePosition: $('#aiMessageImageStyle').value === 'logo' ? 'logo' : $('#aiMessageImagePosition').value }) });
        closeDialog(); await loadMessages(); toast('نُشرت الرسالة في Discord.');
      } catch (error) { modalError(error); $('#aiMessageConfirmed').checked = false; $('#aiMessageSend').disabled = true; } };
    });
    const openNativeEventReview = (item, plan) => {
      const voice = (state.data.channels || []).filter(channel => channel.type === 2);
      const stages = (state.data.channels || []).filter(channel => channel.type === 13);
      const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(18, 0, 0, 0);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const local = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      const body = `<p class="form-note">هذا حدث Discord أصلي يظهر في تبويب Events أعلى السيرفر، وليس رسالة إعلان في قناة. يتيح للأعضاء إبداء اهتمامهم وتلقي تذكير من Discord.</p><div class="ai-native-event-layout"><div class="ai-native-event-fields"><label>مكان الحدث<select id="aiNativeType"><option value="voice">🔊 قناة صوتية</option>${stages.length ? '<option value="stage">🎙️ قناة Stage</option>' : ''}<option value="elsewhere">📍 مكان آخر: رابط أو قناة نصية أو موقع</option></select></label><label id="aiNativeChannelWrap">القناة<select id="aiNativeChannel"></select></label><label id="aiNativeLocationWrap" hidden>الرابط أو اسم المكان<input id="aiNativeLocation" maxlength="100" placeholder="رابط لقاء، #قناة نصية، أو عنوان المكان"></label><label>اسم الحدث<input id="aiNativeTitle" maxlength="100" value="${esc(plan.title || '')}" placeholder="مثال: لقاء المجتمع الأسبوعي"></label><div class="form-grid two"><label>البداية حسب توقيت جهازك<input id="aiNativeStart" type="datetime-local" value="${local(start)}"></label><label>النهاية حسب توقيت جهازك<input id="aiNativeEnd" type="datetime-local" value="${local(end)}"></label></div><label>تكرار الحدث<select id="aiNativeRepeat"><option value="none">مرة واحدة</option><option value="daily">يوميًا</option><option value="weekly">أسبوعيًا</option></select></label><label>الوصف (اختياري)<textarea id="aiNativeDescription" maxlength="1000" rows="4" placeholder="ماذا سيحدث؟ ماذا يحتاج المشارك؟ يمكن إضافة رابط هنا.">${esc(plan.description || '')}</textarea></label><label>غلاف الحدث (اختياري)<input id="aiNativeCover" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label><small class="form-note">الصور الثابتة تُجهز إلى 1200×480، وGIF يُرفع كما هو حتى 2 ميجابايت. قد يختلف عرضه داخل Events حسب تطبيق Discord.</small></div><section class="ai-native-event-preview" aria-label="معاينة حدث Discord"><div class="ai-native-event-server">${esc(state.data?.guild?.name || 'سيرفرك')} <span>⌄</span></div><div class="ai-native-event-heading">▣ &nbsp; Events <small>الأحداث القادمة</small></div><div class="ai-native-event-card"><div id="aiNativeCoverPreview" class="ai-native-event-cover">صورة غلاف الحدث</div><div class="ai-native-event-date" id="aiNativePreviewDate"></div><b id="aiNativePreviewTitle">اسم الحدث</b><span id="aiNativePreviewLocation"></span><p id="aiNativePreviewDescription"></p><span class="ai-native-event-interest">مهتم · تذكير من Discord</span></div><small>معاينة تقريبية. يعرض Discord الحدث وفق واجهته وأذونات السيرفر.</small></section></div><label class="check-row"><input id="aiNativeConfirmed" type="checkbox">راجعت مكان الحدث والوقت والغلاف وأوافق على إنشائه في Discord.</label>`;
      modal('إنشاء حدث Discord', body, '<button class="btn secondary" id="aiNativeCancel">إلغاء</button><button class="btn primary" id="aiNativeCreate" disabled>أنشئ الحدث في Discord</button>');
      let coverUrl = '';
      const update = () => {
        const type = $('#aiNativeType').value, channelSelect = $('#aiNativeChannel');
        const old = channelSelect.value;
        channelSelect.innerHTML = `<option value="">اختر ${type === 'stage' ? 'قناة Stage' : 'قناة صوتية'}</option>${(type === 'stage' ? stages : voice).map(channel => `<option data-i18n-preserve value="${esc(channel.id)}">${esc(channel.name)}</option>`).join('')}`;
        if ([...channelSelect.options].some(option => option.value === old)) channelSelect.value = old;
        $('#aiNativeChannelWrap').hidden = type === 'elsewhere'; $('#aiNativeLocationWrap').hidden = type !== 'elsewhere';
        $('#aiNativePreviewTitle').innerHTML = emojiPreviewText($('#aiNativeTitle').value.trim() || 'اسم الحدث');
        $('#aiNativePreviewDescription').innerHTML = discordMarkdownPreview($('#aiNativeDescription').value.trim() || 'تفاصيل الحدث ستظهر هنا.');
        $('#aiNativePreviewLocation').innerHTML = emojiPreviewText(type === 'elsewhere' ? `📍 ${$('#aiNativeLocation').value || 'مكان الحدث أو رابطه'}` : `${type === 'stage' ? '🎙️' : '🔊'} ${channelSelect.selectedOptions[0]?.textContent || 'اختر القناة'}`);
        const begin = new Date($('#aiNativeStart').value), finish = new Date($('#aiNativeEnd').value);
        $('#aiNativePreviewDate').textContent = Number.isFinite(begin.getTime()) && Number.isFinite(finish.getTime()) ? `${siteDate(begin, "toLocaleString", { dateStyle: 'medium', timeStyle: 'short' })} – ${siteDate(finish, "toLocaleTimeString", { timeStyle: 'short' })}${$('#aiNativeRepeat').value === 'none' ? '' : $('#aiNativeRepeat').value === 'daily' ? ' · يوميًا' : ' · أسبوعيًا'}` : 'حدد موعد البداية والنهاية';
      };
      $('#aiNativeType').onchange = update;
      $('#dialogContent').querySelectorAll('input,textarea,select').forEach(control => { if (control.id !== 'aiNativeType' && control.id !== 'aiNativeCover') { control.addEventListener('input', update); control.addEventListener('change', update); } });
      $('#aiNativeCover').onchange = () => { if (coverUrl) URL.revokeObjectURL(coverUrl); const file = $('#aiNativeCover').files[0]; coverUrl = file ? URL.createObjectURL(file) : ''; $('#aiNativeCoverPreview').innerHTML = coverUrl ? `<img src="${coverUrl}" alt="غلاف الحدث الذي رفعته">` : 'صورة غلاف الحدث'; };
      $('#aiNativeCancel').onclick = () => { if (coverUrl) URL.revokeObjectURL(coverUrl); closeDialog(); };
      $('#aiNativeConfirmed').onchange = event => { $('#aiNativeCreate').disabled = !event.target.checked; };
      $('#aiNativeCreate').onclick = async event => { event.currentTarget.disabled = true; try {
        const title = $('#aiNativeTitle').value.trim(), startTime = new Date($('#aiNativeStart').value), endTime = new Date($('#aiNativeEnd').value);
        if (!title || !Number.isFinite(startTime.getTime()) || !Number.isFinite(endTime.getTime()) || startTime <= new Date() || endTime <= startTime) throw Error('أكمل عنوان الحدث وحدد بداية مستقبلية ونهاية بعدها.');
        if ($('#aiNativeType').value === 'elsewhere' ? !$('#aiNativeLocation').value.trim() : !$('#aiNativeChannel').value) throw Error('حدد مكان الحدث أو قناته.');
        await api(`/api/ai/requests/${encodeURIComponent(item.id)}/create-scheduled-event`, { method: 'POST', body: JSON.stringify({ confirmed: true, title, description: $('#aiNativeDescription').value, locationType: $('#aiNativeType').value, location: $('#aiNativeLocation').value, channelId: $('#aiNativeChannel').value, startTime: startTime.toISOString(), endTime: endTime.toISOString(), recurrence: $('#aiNativeRepeat').value, image: await prepareNativeEventCover($('#aiNativeCover').files[0]) }) });
        if (coverUrl) URL.revokeObjectURL(coverUrl); closeDialog(); await loadMessages(); toast('أُنشئ الحدث في Events داخل Discord.');
      } catch (error) { modalError(error); $('#aiNativeCreate').disabled = false; } };
      update();
    };
    const openChannelControlReview = (item, plan) => {
      const channels = (state.data.channels || []).filter(channel => [0, 5].includes(channel.type));
      const roles = (state.data.roles || []).filter(role => role.id !== guild && !role.managed);
      const select = `<label>القناة التي تريد تعديلها<select id="aiControlChannel"><option value="">اختر قناة نصية أو قناة إعلانات</option>${channels.map(channel => `<option value="${esc(channel.id)}" ${channel.name.toLowerCase() === String(plan.channel || '').toLowerCase() ? 'selected' : ''}>#${esc(channel.name)}</option>`).join('')}</select></label>`;
      modal('تحكم بالقناة', `<p class="form-note">يُطبّق التغيير على القناة المحددة فقط. تبقى بقية صلاحيات القناة كما هي، ويمكنك تعديلها لاحقًا.</p>${select}<label>من يستطيع الكتابة؟<select id="aiControlMode"><option value="">اختر طريقة الكتابة</option><option value="open">الجميع</option><option value="locked">منع الأعضاء من الكتابة</option><option value="roles">الرتب التي أحددها فقط</option></select></label><div id="aiControlRoles" hidden><b>الرتب المسموح لها بالكتابة</b><div class="ai-control-role-list">${roles.map(role => `<label class="check-row"><input type="checkbox" data-control-role="${esc(role.id)}">${esc(role.name)}</label>`).join('')}</div><small>حد أقصى 25 رتبة. صلاحية Administrator واستثناءات الأعضاء المباشرة قد تتجاوز هذا القيد داخل Discord.</small></div><div class="form-grid two"><label>اسم القناة<input id="aiControlName" maxlength="100"></label><label>بطء المحادثة بالثواني<input id="aiControlSlowmode" type="number" min="0" max="21600"></label></div><label>وصف القناة<textarea id="aiControlTopic" maxlength="1024" rows="3"></textarea></label><label class="check-row"><input id="aiControlNsfw" type="checkbox">قناة للمحتوى الحساس (NSFW)</label><section class="ai-discord-preview" aria-label="معاينة تغييرات القناة"><div class="ai-discord-preview-head"><b>ما سيتغير في Discord</b><small>معاينة قبل التنفيذ</small></div><div id="aiControlPreview" class="ai-control-preview"></div></section><label class="check-row"><input id="aiControlConfirmed" type="checkbox">راجعت القناة والرتب والصلاحيات وأوافق على تعديلها.</label>`, '<button class="btn secondary" id="aiControlCancel">إلغاء</button><button class="btn primary" id="aiControlLaunch" disabled>تطبيق إعدادات القناة</button>');
      const channelSelect = $('#aiControlChannel');
      const fill = () => { const channel = channels.find(entry => entry.id === channelSelect.value); $('#aiControlName').value = channel?.name || ''; $('#aiControlTopic').value = channel?.topic || ''; $('#aiControlSlowmode').value = Number(channel?.rate_limit_per_user || 0); $('#aiControlNsfw').checked = channel?.nsfw === true; update(); };
      const update = () => {
        const mode = $('#aiControlMode').value;
        $('#aiControlRoles').hidden = mode !== 'roles';
        const selected = [...$('#aiControlRoles').querySelectorAll('[data-control-role]:checked')].map(box => box.closest('label').textContent.trim());
        $('#aiControlPreview').innerHTML = `<b>${esc(channelSelect.selectedOptions[0]?.textContent || 'اختر القناة')}</b><p>${mode === 'open' ? 'يسمح للجميع بالكتابة' : mode === 'locked' ? 'يُمنع الأعضاء من الكتابة' : mode === 'roles' ? `يسمح بالكتابة للرتب: ${esc(selected.join('، ') || 'اختر رتبة')}` : 'اختر من يستطيع الكتابة'}</p><p>الاسم: ${esc($('#aiControlName').value)} · بطء المحادثة: ${esc($('#aiControlSlowmode').value || '0')} ثانية · ${$('#aiControlNsfw').checked ? 'محتوى حساس' : 'محتوى عادي'}</p><p>الوصف: ${esc($('#aiControlTopic').value || 'دون وصف')}</p>`;
        $('#aiControlLaunch').disabled = !$('#aiControlConfirmed').checked || !channelSelect.value || !mode || (mode === 'roles' && !selected.length);
      };
      channelSelect.onchange = fill;
      $('#dialogContent').querySelectorAll('input,select,textarea').forEach(control => { if (control !== channelSelect) { control.addEventListener('input', update); control.addEventListener('change', update); } });
      $('#aiControlCancel').onclick = closeDialog;
      $('#aiControlLaunch').onclick = async event => { event.currentTarget.disabled = true; try {
        const roleIds = [...$('#aiControlRoles').querySelectorAll('[data-control-role]:checked')].map(box => box.dataset.controlRole);
        if (roleIds.length > 25) throw Error('يمكن اختيار 25 رتبة بحد أقصى.');
        await api(`/api/ai/requests/${encodeURIComponent(item.id)}/control-channel`, { method: 'POST', body: JSON.stringify({ confirmed: true, channelId: channelSelect.value, mode: $('#aiControlMode').value, roleIds, name: $('#aiControlName').value, topic: $('#aiControlTopic').value, slowmode: Number($('#aiControlSlowmode').value), nsfw: $('#aiControlNsfw').checked }) });
        closeDialog(); await loadMessages(); toast('تحدثت إعدادات القناة في Discord.');
      } catch (error) { modalError(error); $('#aiControlLaunch').disabled = false; } };
      $('#aiControlMode').value = ''; fill();
    };
    const openSpecialReview = (item, plan) => {
      const channels = (state.data.channels || []).filter(channel => [0, 5].includes(channel.type));
      const channelOptions = `<label>القناة<select id="aiSpecialChannel"><option value="">اختر قناة نصية</option>${channels.map(channel => `<option value="${esc(channel.id)}" ${channel.name.toLowerCase() === String(plan.channel || '').toLowerCase() ? 'selected' : ''}>#${esc(channel.name)}</option>`).join('')}</select></label>`;
      const format = `<div class="ai-format-toolbar" role="toolbar" aria-label="تنسيق Discord"><button type="button" data-special-format="bold">عريض</button><button type="button" data-special-format="italic">مائل</button><button type="button" data-special-format="underline">تسطير</button><button type="button" data-special-format="strike">شطب</button><button type="button" data-special-format="spoiler">مخفي</button><button type="button" data-special-format="quote">اقتباس</button><button type="button" data-special-format="code">كود</button></div><small class="form-note">هذه تنسيقات Discord المتاحة داخل البطاقة. حجم الخط وشكله يحدده تطبيق Discord.</small>`;
      const pollFields = `<label>سؤال الاستطلاع<input id="aiSpecialTitle" maxlength="180" value="${esc(plan.question || '')}"></label><label>توضيح السؤال (اختياري)<textarea id="aiSpecialDescription" maxlength="600" rows="2">${esc(plan.description || '')}</textarea></label>${format}<label>صورة أو GIF للسؤال (اختياري)<input id="aiQuestionImage" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label>${imageStyleFields('aiQuestionImage')}<div id="aiPollOptions"></div><button class="btn secondary" type="button" id="aiAddPollOption">＋ أضف خيارًا</button><p class="form-note">من خيارين إلى ٩ خيارات؛ يمكن وضع صورة أو GIF مصغّر لكل خيار. لكل عضو صوت واحد قابل للتغيير.</p>`;
      const eventFields = `<label>عنوان الفعالية<input id="aiSpecialTitle" maxlength="180" value="${esc(plan.title || '🎊 فعالية قادمة')}"></label><label>تفاصيل الفعالية وموعدها<textarea id="aiSpecialDescription" maxlength="1000" rows="4">${esc(plan.description || 'انضم إلينا في فعالية مجتمعنا!')}</textarea></label>${format}<label class="check-row"><input id="aiEventSignup" type="checkbox" checked>تفعيل زر تسجيل المشاركين والعدّاد</label><label>مسمى زر التسجيل<input id="aiEventButton" maxlength="80" value="${esc(plan.buttonLabel || 'سجّل مشاركتك')}"></label><label>صورة أو GIF أو فيديو للفعالية (اختياري)<input id="aiSpecialImage" type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime"></label>${imageStyleFields('aiSpecialImage')}`;
      const welcomeFields = `<label>عنوان بطاقة الترحيب<input id="aiSpecialTitle" maxlength="180" value="${esc(plan.title || '👋 أهلًا بك في مجتمعنا!')}"></label><label>رسالة كل عضو جديد<textarea id="aiSpecialDescription" maxlength="1000" rows="4">${esc(plan.description || 'مرحبًا {member}، سعداء بانضمامك إلينا!')}</textarea></label>${format}<small class="form-note">استخدم {member} لإشارة العضو و{name} لاسمه و{server} لاسم السيرفر و{memberCount} لعدد أعضائه.</small><label>تصميم الترحيب الخاص بسيرفرك<input id="aiSpecialImage" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label><label class="check-row"><input id="aiWelcomeComposite" type="checkbox">ضع صورة العضو داخل التصميم الذي رفعته</label><div class="form-grid two"><label>موضع صورة العضو<select id="aiWelcomeAvatarPosition"><option value="right">يمين</option><option value="center">الوسط</option><option value="left">يسار</option><option value="top">أعلى بطاقة Discord فقط</option></select></label><label>موضع التصميم عند استخدام بطاقة Discord<select id="aiWelcomeBannerPosition"><option value="below">تحت البطاقة</option><option value="above">فوق البطاقة</option></select></label></div><div id="aiWelcomeCompositeControls" class="form-grid two" hidden><label>شكل صورة العضو<select id="aiWelcomeAvatarShape"><option value="circle">دائرة / Circle</option><option value="square">مربع / Square</option><option value="rounded">زوايا مستديرة / Rounded</option></select></label><label>ارتفاع صورة العضو <output id="aiWelcomeVerticalValue">50%</output><input id="aiWelcomeAvatarVertical" type="range" min="15" max="85" value="50"></label><label>حجم صورة العضو <output id="aiWelcomeRadiusValue">95</output><input id="aiWelcomeAvatarRadius" type="range" min="60" max="160" value="95"></label><label>شعار السيرفر الدائري (اختياري)<input id="aiWelcomeServerLogo" type="file" accept="image/png,image/jpeg,image/webp"></label>${logoPlacementFields('aiWelcomeServer', 'left')}</div><small id="aiWelcomeGifNote" class="form-note">يمكن دمج صورة العضو داخل PNG أو JPG أو WebP أو GIF متحرك. الحد الأقصى للملف 20 ميجابايت. عند دمج صورة العضو، يلزم ألا يتجاوز GIF مئة إطار أو 60 مليون بكسل عبر الإطارات. للملفات الأكبر، أوقف الدمج وسيظهر GIF كما هو.</small>`;
      const rulesFields = `<label>عنوان بطاقة القوانين<input id="aiSpecialTitle" maxlength="180" value="${esc(plan.title || '📜 قوانين السيرفر')}"></label><label>مقدمة قصيرة (اختياري)<textarea id="aiSpecialDescription" maxlength="500" rows="2">${esc(plan.description || '')}</textarea></label><label>طريقة عرض القوانين<select id="aiRulesStyle"><option value="single" ${plan.style === 'single' ? 'selected' : ''}>بطاقة واحدة</option><option value="sections" ${plan.style === 'sections' ? 'selected' : ''}>أقسام داخل بطاقة واحدة</option><option value="cards" ${plan.style === 'cards' ? 'selected' : ''}>بطاقة مستقلة لكل قانون</option></select></label><div id="aiRulesSingleWrap"><label>نص البطاقة بالكامل<textarea id="aiRulesSingleText" maxlength="3500" rows="12" placeholder="اكتب القوانين وتنسيقها وترقيمها بطريقتك">${esc(plan.singleText || (plan.rules || []).map(rule => typeof rule === 'string' ? rule : rule.body || '').join('\n\n'))}</textarea></label><small class="form-note">بطاقة واحدة بنص حر متعدد الأسطر. الترقيم اختياري وتكتبه بنفسك. الحد الأقصى 3500 حرف.</small></div><div id="aiRulesEntriesWrap" hidden><div id="aiRulesEntries"></div><button class="btn secondary" type="button" id="aiRulesAdd">＋ أضف قسمًا أو قانونًا</button><small class="form-note">لكل قسم عنوان اختياري ونص متعدد الأسطر. يمكنك إضافة حتى 100 قسم، وتُقسّم البطاقات الطويلة تلقائيًا على رسائل متتابعة.</small></div>${format}<label>صورة أو GIF للقوانين (اختياري)<input id="aiSpecialImage" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label>${imageStyleFields('aiSpecialImage')}<label>موضع الصورة العادية<select id="aiRulesImagePosition"><option value="above">فوق بطاقة القوانين</option><option value="below">تحت بطاقة القوانين</option></select></label>`;
      const body = `${channelOptions}${plan.kind === 'poll' ? pollFields : plan.kind === 'event' ? eventFields : plan.kind === 'rules' ? rulesFields : welcomeFields}<label>لون البطاقة<input id="aiSpecialColor" type="color" value="${/^#[0-9a-f]{6}$/i.test(plan.color || '') ? esc(plan.color) : '#8b5cf6'}"></label><section class="ai-discord-preview" aria-label="معاينة داخل السيرفر"><div class="ai-discord-preview-head"><b>معاينة داخل ${esc(state.data?.guild?.name || 'سيرفرك')}</b><small>تتحدث مباشرة مع التعديل</small></div><div class="ai-discord-server"><aside class="ai-discord-server-channels"><b data-i18n-preserve>${esc(state.data?.guild?.name || 'السيرفر')}</b>${channels.slice(0, 7).map(channel => `<span data-preview-channel="${esc(channel.id)}"># ${esc(channel.name)}</span>`).join('')}</aside><div class="ai-discord-server-chat"><div class="ai-discord-channel-name" id="aiSpecialPreviewChannel"></div><div class="ai-discord-bot-name">◈ ديسكوكو <small>BOT</small></div><div class="ai-discord-embed" id="aiSpecialPreviewCard"><div id="aiWelcomePreviewAvatar" class="ai-welcome-preview-avatar" hidden aria-label="صورة العضو الجديد">ع</div><b id="aiSpecialPreviewTitle"></b><div id="aiSpecialPreviewImage"></div><p id="aiSpecialPreviewBody"></p><div id="aiSpecialPreviewOptions"></div></div><span class="ai-discord-button" id="aiSpecialPreviewButton"></span></div>${previewMemberRail()}</div></section><label class="check-row"><input id="aiSpecialConfirmed" type="checkbox">راجعت البطاقة والإعدادات وأوافق على ${plan.kind === 'welcome' ? 'تفعيل أو استبدال إعداد الترحيب التلقائي لهذا البوت' : 'النشر'}.</label>`;
      modal(plan.kind === 'poll' ? 'مراجعة الاستطلاع' : plan.kind === 'event' ? 'مراجعة إعلان الفعالية' : plan.kind === 'rules' ? 'مراجعة بطاقة القوانين' : 'بطاقة الترحيب التلقائي', body, '<button class="btn secondary" id="aiSpecialCancel">إلغاء</button><button class="btn primary" id="aiSpecialLaunch" disabled>تأكيد التنفيذ</button>');
      if (['event', 'rules'].includes(plan.kind)) { $('#aiSpecialColor').closest('label').insertAdjacentHTML('afterend', panelReviewFields(plan, plan.kind === 'event')); bindPanelReview(plan, '#aiSpecialPreviewButton', 'aiSpecialConfirmed', 'aiSpecialLaunch',item.id); }
      if (item.has_attachment && plan.referenceOnly && plan.kind !== 'welcome' && !['event', 'rules'].includes(plan.kind)) $('#aiSpecialColor').closest('label').insertAdjacentHTML('afterend', '<p class="notice info">الصورة المرفقة مرجع فقط ولن تُنشر. ارفع الصور النهائية.</p>');
      if (plan.kind === 'event') $('#aiEventSignup').checked = plan.signupEnabled !== false;
      if (plan.kind === 'rules' && ['above','below'].includes(plan.imagePosition)) $('#aiRulesImagePosition').value=plan.imagePosition;
      if (item.editExisting) { $('#aiSpecialChannel').value=item.interactive_channel_id; $('#aiSpecialChannel').disabled=true; $('#aiSpecialConfirmed').closest('label').insertAdjacentHTML('beforebegin','<p class="notice info">سيُعدّل هذا التأكيد إعدادات النظام أو رسالته الحالية في القناة نفسها، دون إنشاء لوحة جديدة. تبقى المشاركات والأصوات محفوظة.</p>'); }
      if (plan.kind === 'rules') $('#aiRulesEntriesWrap').insertAdjacentHTML('beforeend', '<strong id="aiRulesPageCount" class="form-note"></strong>');
      if (plan.kind === 'welcome') {
        { $('#aiWelcomeAvatarShape').value = plan.avatarShape || 'circle'; $('#aiWelcomeComposite').checked = plan.composite === true; $('#aiWelcomeAvatarVertical').value = plan.avatarVertical || 50; $('#aiWelcomeAvatarRadius').value = plan.avatarRadius || 95; }
        $('#aiWelcomeAvatarPosition').value = plan.avatarPosition || 'right';
        $('#aiWelcomeBannerPosition').value = plan.bannerPosition || 'below';
        if (plan.avatarPosition === 'center') $('#aiWelcomeComposite').checked = true;
        if (plan.referenceOnly) $('#aiSpecialImage').closest('label').insertAdjacentHTML('beforebegin', '<p class="notice info">الصورة المرفقة مرجع للتصميم فقط ولن تُنشر. عدّل النص واللون وصورة العضو هنا. توسيط صورة العضو يحتاج رفع خلفية للتصميم المركب. شكل بطاقة Discord وخطوطها يخضعان لحدود Discord.</p>');
      }
      const optionFiles = [];
      const previewUrls = new Map();
      const fileUrl = file => { if (!file) return ''; if (!previewUrls.has(file)) previewUrls.set(file, URL.createObjectURL(file)); return previewUrls.get(file); };
      const releasePreviews = () => { for (const value of previewUrls.values()) URL.revokeObjectURL(value); previewUrls.clear(); };
      const renderOptions = () => {
        if (plan.kind !== 'poll') return;
        $('#aiPollOptions').innerHTML = optionFiles.map((entry, index) => `<div class="ai-poll-option"><label>الخيار ${index + 1}<input data-poll-text="${index}" maxlength="70" value="${esc(entry.text)}"></label><label>صورة أو GIF صغير للخيار (اختياري)<input data-poll-image="${index}" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label><button type="button" class="btn small secondary" data-poll-remove="${index}" ${optionFiles.length <= 2 ? 'disabled' : ''}>حذف الخيار</button></div>`).join('');
        $('#aiPollOptions').querySelectorAll('[data-poll-text]').forEach(input => input.oninput = () => { optionFiles[Number(input.dataset.pollText)].text = input.value; update(); });
        $('#aiPollOptions').querySelectorAll('[data-poll-image]').forEach(input => input.onchange = () => { optionFiles[Number(input.dataset.pollImage)].file = input.files[0] || null; update(); });
        $('#aiPollOptions').querySelectorAll('[data-poll-remove]').forEach(button => button.onclick = () => { optionFiles.splice(Number(button.dataset.pollRemove), 1); renderOptions(); update(); });
        $('#aiAddPollOption').disabled = optionFiles.length >= 9;
        installAiEmojiPickers();
      };
      if (plan.kind === 'poll') { (plan.options?.length >= 2 ? plan.options : ['', '']).forEach(text => optionFiles.push({ text, file: null })); renderOptions(); $('#aiAddPollOption').onclick = () => { if (optionFiles.length < 9) { optionFiles.push({ text: '', file: null }); renderOptions(); update(); } }; }
      const ruleEntries = plan.kind === 'rules' ? (plan.rules || []).map(rule => typeof rule === 'string' ? { title: '', body: rule } : { title: String(rule.title || ''), body: String(rule.body || '') }) : [];
      if (plan.kind === 'rules' && !ruleEntries.length) ruleEntries.push({ title: '', body: '' });
      let activeRuleBody = null;
      const renderRuleEntries = () => {
        if (plan.kind !== 'rules') return;
        $('#aiRulesEntries').innerHTML = ruleEntries.map((entry, index) => `<div class="ai-rule-edit-box"><label>عنوان القسم أو القانون (اختياري)<input data-rule-title="${index}" maxlength="200" value="${esc(entry.title)}" placeholder="مثال: الاحترام"></label><label>نص القسم أو القانون<textarea data-rule-body="${index}" maxlength="1000" rows="4" placeholder="اكتب نص القانون هنا، ويمكنك استخدام أكثر من سطر">${esc(entry.body)}</textarea></label><div class="ai-rule-edit-actions"><button class="btn text" type="button" data-rule-move="${index}:-1" ${index === 0 ? 'disabled' : ''}>↑ رفع</button><button class="btn text" type="button" data-rule-move="${index}:1" ${index === ruleEntries.length - 1 ? 'disabled' : ''}>↓ تنزيل</button><button class="btn text" type="button" data-rule-remove="${index}" ${ruleEntries.length === 1 ? 'disabled' : ''}>حذف</button></div></div>`).join('');
        $('#aiRulesAdd').disabled = ruleEntries.length >= 100;
        $('#aiRulesEntries').querySelectorAll('[data-rule-title]').forEach(input => input.oninput = () => { ruleEntries[Number(input.dataset.ruleTitle)].title = input.value; update(); });
        $('#aiRulesEntries').querySelectorAll('[data-rule-body]').forEach(input => { input.oninput = () => { ruleEntries[Number(input.dataset.ruleBody)].body = input.value; update(); }; input.onfocus = () => { activeRuleBody = input; }; });
        $('#aiRulesEntries').querySelectorAll('[data-rule-remove]').forEach(button => button.onclick = () => { ruleEntries.splice(Number(button.dataset.ruleRemove), 1); activeRuleBody = null; renderRuleEntries(); update(); });
        $('#aiRulesEntries').querySelectorAll('[data-rule-move]').forEach(button => button.onclick = () => { const [index, delta] = button.dataset.ruleMove.split(':').map(Number); [ruleEntries[index], ruleEntries[index + delta]] = [ruleEntries[index + delta], ruleEntries[index]]; activeRuleBody = null; renderRuleEntries(); update(); });
        installAiEmojiPickers();
      };
      if (plan.kind === 'rules') { renderRuleEntries(); $('#aiRulesAdd').onclick = () => { if (ruleEntries.length >= 100) return; ruleEntries.push({ title: '', body: '' }); renderRuleEntries(); update(); [...$('#aiRulesEntries').querySelectorAll('[data-rule-body]')].at(-1)?.focus(); }; }
      const update = () => {
        const channel = $('#aiSpecialChannel').selectedOptions[0]?.textContent || 'اختر قناة النشر';
        $('#aiSpecialPreviewChannel').textContent = channel;
        document.querySelectorAll('[data-preview-channel]').forEach(entry => entry.classList.toggle('active', entry.dataset.previewChannel === $('#aiSpecialChannel').value));
        $('#aiSpecialPreviewCard').style.borderColor = $('#aiSpecialColor').value;
        if (plan.kind === 'rules') $('#aiSpecialPreviewOptions').style.setProperty('--rules-accent', $('#aiSpecialColor').value);
        const previewMemberText = value => value.replace(/\{(?:username|membername)\}/gi,'{name}').replace(/\{(?:servername|guildname)\}/gi,'{server}').replace(/\{membercount\}/gi,'{memberCount}').replaceAll('{member}', '@عضو جديد').replaceAll('{name}', 'عضو جديد').replaceAll('{server}', state.data?.guild?.name || 'السيرفر').replaceAll('{memberCount}', String(state.data?.guild?.memberCount ?? state.data?.guild?.member_count ?? 'عدد الأعضاء الحالي'));
        $('#aiSpecialPreviewTitle').dir='auto'; $('#aiSpecialPreviewTitle').innerHTML = emojiPreviewText(previewMemberText(($('#aiSpecialTitle').value || 'العنوان').replaceAll('{member}','عضو جديد')));
        if (plan.kind === 'rules') { $('#aiRulesSingleWrap').hidden = $('#aiRulesStyle').value !== 'single'; $('#aiRulesEntriesWrap').hidden = $('#aiRulesStyle').value === 'single'; }
        const ruleStyle = plan.kind === 'rules' ? $('#aiRulesStyle').value : '';
        const text = plan.kind === 'poll' ? `${$('#aiSpecialDescription').value}\nاختر إجابة واحدة. يمكنك تغيير صوتك.` : plan.kind === 'rules' && ruleStyle === 'single' ? [$('#aiSpecialDescription').value, $('#aiRulesSingleText').value].filter(Boolean).join('\n\n') : plan.kind === 'rules' ? $('#aiSpecialDescription').value : $('#aiSpecialDescription').value.replaceAll('{member}', '@عضو جديد').replaceAll('{name}', 'عضو جديد');
        $('#aiSpecialPreviewBody').dir='auto'; $('#aiSpecialPreviewBody').innerHTML = discordMarkdownPreview(previewMemberText(text));
        const previewOptions = $('#aiSpecialPreviewOptions');
        let rulePageSize = 0, rulePageLength = ($('#aiSpecialTitle').value || '').length + ($('#aiSpecialDescription').value || '').length;
        previewOptions.innerHTML = plan.kind === 'poll' ? optionFiles.map((entry, index) => `<div class="ai-poll-preview-option">${entry.file ? `<img src="${fileUrl(entry.file)}" alt="صورة الخيار ${index + 1}">` : ''}<span>${index + 1}. ${emojiPreviewText(entry.text || 'الخيار')}</span></div>`).join('') : plan.kind === 'rules' && ruleStyle !== 'single' ? ruleEntries.filter(entry => entry.body.trim()).map(entry => {
          const size = entry.title.length + entry.body.length;
          const nextPage = rulePageSize && (rulePageSize >= 8 || rulePageLength + size > 5000);
          if (nextPage) { rulePageSize = 0; rulePageLength = ($('#aiSpecialTitle').value || '').length; }
          rulePageSize++; rulePageLength += size;
          return `${nextPage ? '<div class="ai-rules-page-break">رسالة تالية في Discord</div>' : ''}<div class="${ruleStyle === 'cards' ? 'ai-rules-separate-card' : 'ai-rules-field'}">${entry.title.trim() ? `<b>${emojiPreviewText(entry.title)}</b>` : ''}<p>${discordMarkdownPreview(entry.body)}</p></div>`;
        }).join('') : '';
        if (plan.kind === 'rules') $('#aiRulesPageCount').textContent = `القوانين: ${ruleEntries.length} من 100 · النشر المتوقع: ${rulePageSize ? 1 + previewOptions.querySelectorAll('.ai-rules-page-break').length : 0} رسالة في Discord. لا يلزم حذف القوانين عند تجاوز بطاقة واحدة.`;
        if (plan.kind === 'rules') { if (ruleStyle === 'cards') $('#aiSpecialPreviewCard').after(previewOptions); else $('#aiSpecialPreviewCard').append(previewOptions); }
        const avatarPreview = $('#aiWelcomePreviewAvatar');
        const composite = plan.kind === 'welcome' && $('#aiWelcomeComposite').checked;
        avatarPreview.hidden = plan.kind !== 'welcome' || composite;
        if (plan.kind === 'welcome') {
          $('#aiWelcomeCompositeControls').hidden = !composite;
          $('#aiWelcomeAvatarVertical').closest('label').querySelector('output').textContent = `${$('#aiWelcomeAvatarVertical').value}%`;
          $('#aiWelcomeAvatarRadius').closest('label').querySelector('output').textContent = $('#aiWelcomeAvatarRadius').value;
          const positions = $('#aiWelcomeAvatarPosition');
          positions.querySelector('[value="right"]').textContent = composite ? 'يمين' : 'يمين — صورة جانبية';
          positions.querySelector('[value="left"]').textContent = composite ? 'يسار' : 'يسار — أيقونة بجوار الاسم';
          positions.querySelector('[value="top"]').disabled = composite;
          positions.querySelector('[value="center"]').disabled = !composite;
          if (composite && positions.value === 'top') positions.value = 'center';
          if (!composite && positions.value === 'center') positions.value = 'right';
          const position = $('#aiWelcomeAvatarPosition').value;
          $('#aiSpecialPreviewCard').dataset.avatarPosition = position;
          avatarPreview.textContent = 'ع';
          let authorName=$('#aiWelcomePreviewAuthor');
          if(!authorName){authorName=document.createElement('span');authorName.id='aiWelcomePreviewAuthor';authorName.className='ai-welcome-preview-author-name';avatarPreview.after(authorName);}
          authorName.textContent='عضو جديد';authorName.hidden=composite || position!=='left';
        }
        $('#aiSpecialPreviewButton').innerHTML = emojiPreviewText(plan.kind === 'poll' ? '📊 تصويت' : plan.kind === 'event' ? $('#aiEventSignup').checked ? `${($('#aiPanelButtonLabel') || $('#aiEventButton')).value || 'سجّل مشاركتك'} · المسجلون ٠` : 'دون زر تسجيل' : 'يُرسل تلقائيًا عند الانضمام');
        $('#aiSpecialPreviewButton').hidden = plan.kind === 'rules' || plan.kind === 'event' && !$('#aiEventSignup').checked;
        const file = plan.kind === 'poll' ? $('#aiQuestionImage').files[0] : $('#aiSpecialImage').files[0];
        const preview = $('#aiSpecialPreviewImage');
        if (composite && file?.type.startsWith('image/')) {
          const x = { left: 185, center: 600, right: 1015 }[$('#aiWelcomeAvatarPosition').value] / 12;
          const y = Number($('#aiWelcomeAvatarVertical').value);
          const diameter = Number($('#aiWelcomeAvatarRadius').value) / 6;
          preview.innerHTML = `<div class="ai-welcome-image-composite"><img src="${fileUrl(file)}" alt="تصميم الترحيب الذي رفعته"><span class="ai-welcome-image-avatar" style="left:${x}%;top:${y}%;width:${diameter}%;border-radius:${({circle:'50%',square:'0',rounded:'12%'})[$('#aiWelcomeAvatarShape').value]}" aria-label="مكان صورة العضو الجديد">👤</span></div><small class="form-note">صورة العضو هنا تجريبية؛ تُستخدم صورته الحقيقية عند انضمامه.</small>`;
          const logoFile = $('#aiWelcomeServerLogo').files[0];
          if (logoFile) preview.querySelector('.ai-welcome-image-composite').insertAdjacentHTML('beforeend', `<img class="ai-welcome-server-logo" src="${fileUrl(logoFile)}" style="left:${$('#aiWelcomeServerLogoX').value}%;top:${$('#aiWelcomeServerLogoY').value}%" alt="شعار سيرفرك">`);
        } else preview.innerHTML = file && file.type.startsWith('image/') ? `<img class="ai-special-preview-image" src="${fileUrl(file)}" alt="صورة البطاقة">` : file ? `📎 ${esc(file.name)}` : composite ? '<small class="form-note">ارفع تصميم سيرفرك لتظهر معاينته مع صورة العضو هنا.</small>' : item.editExisting && item.currentDesignImages?.[0]?.url ? `<img class="ai-special-preview-image" src="${esc(item.currentDesignImages[0].url)}" alt="الصورة الحالية للوحة">` : item.has_attachment && !plan.referenceOnly ? `<img class="ai-special-preview-image" src="/api/ai/requests/${encodeURIComponent(item.id)}/attachment" alt="الصورة المرفقة مع الطلب">` : '';
        if (plan.kind === 'poll') updateStyledImagePreview('aiQuestionImage', preview.querySelector('img'));
        if (['event', 'rules'].includes(plan.kind)) updateStyledImagePreview('aiSpecialImage', preview.querySelector('img'));
        if (plan.kind === 'rules') {
          const card = $('#aiSpecialPreviewCard');
          const logo = $('#aiSpecialImageStyle').value === 'logo';
          if (logo) card.insertBefore(preview, $('#aiSpecialPreviewTitle'));
          else if ($('#aiRulesImagePosition').value === 'below') (ruleStyle === 'cards' ? previewOptions : card).after(preview);
          else card.before(preview);
          preview.classList.toggle('ai-welcome-preview-banner', !logo);
        }
        if (plan.kind === 'welcome') {
          const card = $('#aiSpecialPreviewCard');
          if (composite) card.append(preview);
          else if ($('#aiWelcomeBannerPosition').value === 'above') card.before(preview); else card.after(preview);
          preview.classList.add('ai-welcome-preview-banner');
        }
      };
      $('#dialogContent').addEventListener('input', update); $('#dialogContent').addEventListener('change', update); update();
      if (plan.kind === 'welcome') bindLogoPlacement('aiWelcomeServer', update);
      if (plan.kind === 'poll') bindLogoPlacement('aiQuestionImage', update);
      if (['event', 'rules'].includes(plan.kind)) bindLogoPlacement('aiSpecialImage', update);
      $('#dialogContent').querySelectorAll('[data-special-format]').forEach(button => button.onclick = () => {
        const field = plan.kind === 'rules' ? ($('#aiRulesStyle').value === 'single' ? $('#aiRulesSingleText') : activeRuleBody || $('#aiRulesEntries [data-rule-body]')) : $('#aiSpecialDescription'), start = field.selectionStart, end = field.selectionEnd, selected = field.value.slice(start, end) || 'النص';
        const wrap = { bold: '**', italic: '*', underline: '__', strike: '~~', spoiler: '||', code: '`' }[button.dataset.specialFormat];
        field.setRangeText(button.dataset.specialFormat === 'quote' ? `> ${selected}` : `${wrap}${selected}${wrap}`, start, end, 'select'); field.focus(); update();
      });
      $('#aiSpecialCancel').onclick = () => { releasePreviews(); closeDialog(); };
      if (item.editExisting) loadPublishedDesignImage(item, '#aiSpecialPreviewImage', update);
      $('#aiSpecialConfirmed').onchange = event => { $('#aiSpecialLaunch').disabled = !event.target.checked; };
      $('#aiSpecialLaunch').onclick = async event => { event.currentTarget.disabled = true; try {
        if (!$('#aiSpecialChannel').value || !$('#aiSpecialTitle').value.trim()) throw Error('اختر القناة واكتب عنوان البطاقة.');
        if (plan.kind === 'poll' && [$('#aiQuestionImage').files[0], ...optionFiles.map(entry => entry.file)].filter(Boolean).reduce((total, file) => total + file.size, 0) > 20 * 1024 * 1024) throw Error('مجموع صور وGIF الاستطلاع يجب ألا يتجاوز 20 ميجابايت.');
        if(sceneEnabled('aiSpecialImage') && $('#aiSpecialImage')?.files[0]?.type==='image/gif')throw Error('Flexible design requires a final static image / التصميم المرن يحتاج صورة ثابتة');
        const payload = { editExisting: item.editExisting === true, ...(['event', 'rules'].includes(plan.kind) ? readPanelReview() : {}), confirmed: true, channelId: $('#aiSpecialChannel').value, color: $('#aiSpecialColor').value, ...(plan.kind === 'poll' ? { question: $('#aiSpecialTitle').value, description: $('#aiSpecialDescription').value, options: optionFiles.map(entry => entry.text.trim()), questionImage: await prepareStyledImage($('#aiQuestionImage').files[0], 'aiQuestionImage'), questionStyle: $('#aiQuestionImageStyle').value, optionImages: await Promise.all(optionFiles.map(entry => entry.file ? entry.file.type === 'image/gif' ? prepareAiMedia(entry.file) : prepareAiImage(entry.file) : null)) } : { title: $('#aiSpecialTitle').value, description: $('#aiSpecialDescription').value, ...(plan.kind === 'event' ? { signupEnabled: $('#aiEventSignup').checked, buttonLabel: ($('#aiPanelButtonLabel') || $('#aiEventButton')).value } : plan.kind === 'rules' ? { style: $('#aiRulesStyle').value, singleText: $('#aiRulesSingleText').value, rules: ruleEntries.map(entry => ({ title: entry.title, body: entry.body })) } : { avatarPosition: $('#aiWelcomeAvatarPosition').value, bannerPosition: $('#aiWelcomeBannerPosition').value, composite: $('#aiWelcomeComposite').checked, avatarVertical: Number($('#aiWelcomeAvatarVertical').value), avatarRadius: Number($('#aiWelcomeAvatarRadius').value), avatarShape: $('#aiWelcomeAvatarShape').value }) }) };
        if (plan.kind === 'rules' && (payload.style === 'single' ? !payload.singleText.trim() || payload.singleText.length > 3500 : payload.rules.length < 1 || payload.rules.length > 100 || payload.rules.some(rule => !rule.body.trim() || rule.body.length > 1000 || rule.title.length > 200))) throw Error('أكمل نص البطاقة، أو اكتب نص كل قسم. يمكن إضافة حتى ١٠٠ قسم، وكل مربع يقبل عدة أسطر.');
        if (plan.kind === 'poll' && (payload.options.some(value => !value) || new Set(payload.options.map(value => value.toLocaleLowerCase('ar'))).size !== payload.options.length)) throw Error('اكتب خيارات مختلفة دون ترك خيار فارغ.');
        const file = plan.kind !== 'poll' ? $('#aiSpecialImage').files[0] : null;
        if (plan.kind === 'welcome' && payload.composite && !file && !item.editExisting) throw Error('ارفع تصميم الترحيب الخاص بسيرفرك أولًا.');
        if (plan.kind === 'welcome' && payload.composite && $('#aiWelcomeServerLogo').files[0]) {
          const avatarX = { left: 185, center: 600, right: 1015 }[$('#aiWelcomeAvatarPosition').value];
          const dx = avatarX - Number($('#aiWelcomeServerLogoX').value) * 12;
          const dy = Number($('#aiWelcomeAvatarVertical').value) * 4.8 - Number($('#aiWelcomeServerLogoY').value) * 4.8;
          if (Math.hypot(dx, dy) < Number($('#aiWelcomeAvatarRadius').value) + 86) throw Error('حرّك شعار السيرفر بعيدًا عن صورة العضو حتى لا يتداخلا.');
        }
        if (['event', 'rules'].includes(plan.kind) && !file && !item.editExisting && $('#aiSpecialImageStyle').value !== 'normal') throw Error('ارفع صورة للشعار أو التصميم أولًا.');
        if (file) { if (plan.kind === 'welcome' && payload.composite && file.type === 'image/gif') { payload.media = await prepareAiMedia(file); if ($('#aiWelcomeServerLogo').files[0]) payload.logo = await prepareWelcomeLogoOverlay($('#aiWelcomeServerLogo').files[0], $('#aiWelcomeServerLogoX').value, $('#aiWelcomeServerLogoY').value); } else if (plan.kind === 'welcome' && payload.composite) payload.image = await prepareWelcomeBackground(file, $('#aiWelcomeServerLogo').files[0], $('#aiWelcomeServerLogoX').value, $('#aiWelcomeServerLogoY').value); else if (['image/gif', 'video/mp4', 'video/quicktime'].includes(file.type)) { if (['event', 'rules'].includes(plan.kind) && $('#aiSpecialImageStyle').value !== 'normal') throw Error('الشعار الدائري يحتاج صورة ثابتة.'); payload.media = await prepareAiMedia(file); } else payload.image = ['event', 'rules'].includes(plan.kind) ? await prepareStyledImage(file, 'aiSpecialImage') : await prepareAiImage(file); }
        if (['event', 'rules'].includes(plan.kind) && $('#aiSpecialImageStyle').value === 'logo') payload.imagePosition = 'logo';
        else if (plan.kind === 'rules') payload.imagePosition = $('#aiRulesImagePosition').value;
        await api(`/api/ai/requests/${encodeURIComponent(item.id)}/launch-interactive`, { method: 'POST', body: JSON.stringify(payload) });
        releasePreviews(); closeDialog(); await loadMessages(); toast(plan.kind === 'welcome' ? 'فُعّل الترحيب التلقائي للأعضاء الجدد.' : 'نُشرت البطاقة في Discord.');
      } catch (error) { modalError(error); $('#aiSpecialConfirmed').checked = false; $('#aiSpecialLaunch').disabled = true; } };
    };
    thread.querySelectorAll('[data-ai-interactive]').forEach(button => button.onclick = () => {
      const item = messages.find(entry => entry.id === button.dataset.aiInteractive);
      item.editExisting = button.dataset.aiEdit === 'true';
      const plan = item?.proposal?.interactive; if (!plan || !['giveaway', 'tickets', 'poll', 'event', 'welcome', 'scheduled_event', 'rules', 'channel_control'].includes(plan.kind)) return;
      if (plan.kind === 'scheduled_event') return openNativeEventReview(item, plan);
      if (plan.kind === 'channel_control') return openChannelControlReview(item, plan);
      if (['poll', 'event', 'welcome', 'rules'].includes(plan.kind)) return openSpecialReview(item, plan);
      const channels = (state.data.channels || []).filter(channel => [0, 5].includes(channel.type));
      const knownChannel = channels.some(channel => channel.name.toLowerCase() === String(plan.channel || '').toLowerCase());
      const channelField = `<label>قناة النشر<select id="aiInteractiveChannel"><option value="">اختر قناة نصية</option>${channels.map(channel => `<option value="${esc(channel.id)}" ${channel.name.toLowerCase() === String(plan.channel || '').toLowerCase() ? 'selected' : ''}>#${esc(channel.name)}</option>`).join('')}${plan.kind === 'tickets' ? `<option value="__create__" ${knownChannel ? '' : 'selected'}>＋ أنشئ قناة دعم جديدة</option>` : ''}</select></label>${plan.kind === 'tickets' ? `<label>اسم القناة الجديدة (إذا اخترت إنشاءها)<input id="aiNewSupportChannel" maxlength="100" value="${esc(!knownChannel && plan.channel ? plan.channel : 'الدعم')}"></label>` : ''}`;
      const fields = plan.kind === 'giveaway' ? `${channelField}<label>الجائزة<input id="aiPrize" maxlength="160" value="${esc(plan.prize)}"></label><div class="form-grid two"><label>المدة بالدقائق<input id="aiDuration" type="number" min="5" max="43200" value="${plan.durationMinutes ?? ''}"></label><label>عدد الفائزين<input id="aiWinners" type="number" min="1" max="20" value="${plan.winnerCount ?? ''}"></label></div><p class="form-note">ينشر البوت زر مشاركة ويسحب الفائزين عشوائيًا عند انتهاء المدة.</p>` : plan.kind === 'poll' ? `${channelField}<label>السؤال<input id="aiPollQuestion" maxlength="180" value="${esc(plan.question)}"></label>${[...plan.options,...Array(Math.max(0,2-plan.options.length)).fill('')].map((option, index) => `<label>الخيار ${index + 1}<input data-ai-poll-option maxlength="70" value="${esc(option)}"></label>`).join('')}<p class="form-note">يسمح الاستطلاع بصوت واحد لكل عضو، ويمكنه تغيير اختياره. تظهر النتائج له بعد التصويت.</p>` : `${channelField}<label>عنوان لوحة الدعم<input id="aiTicketTitle" maxlength="100" value="${esc(plan.title)}"></label><label>الوصف<textarea id="aiTicketDescription" maxlength="800" rows="3">${esc(plan.description)}</textarea></label><label>تصنيف التذاكر (اختياري)<select id="aiTicketCategory"><option value="">دون تصنيف</option>${(state.data.channels || []).filter(channel => channel.type === 4).map(channel => `<option data-i18n-preserve value="${esc(channel.id)}">${esc(channel.name)}</option>`).join('')}</select></label><label>رتبة فريق الدعم (مطلوبة)<select id="aiStaffRole"><option value="">اختر رتبة الدعم</option>${(state.data.roles || []).filter(role => role.id !== guild).map(role => `<option data-i18n-preserve value="${esc(role.id)}">${esc(role.name)}</option>`).join('')}</select></label><p class="form-note">يفتح زر الدعم قناة خاصة لكل عضو. التذكرة خاصة بصاحبها ورتبة الدعم المحددة.</p>`;
      modal(plan.kind === 'giveaway' ? 'مراجعة الجيف آواي' : plan.kind === 'poll' ? 'مراجعة الاستطلاع' : 'مراجعة لوحة تذاكر الدعم', `${fields}${plan.kind !== 'poll' ? '<label>بنر اختياري يظهر مع البطاقة<input id="aiInteractiveImage" type="file" accept="image/png,image/jpeg,image/webp"></label><label>موضع البنر<select id="aiInteractiveImagePosition"><option value="above">فوق التفاصيل</option><option value="below">تحت التفاصيل</option></select></label>' : ''}<section class="ai-discord-preview" aria-label="معاينة قبل النشر"><div class="ai-discord-preview-head"><b>معاينة داخل ${esc(state.data?.guild?.name || 'سيرفرك')}</b><small>شكل تقريبي يتحدث مع تعديل الحقول · لا ينشر شيئًا</small></div><div class="ai-discord-server"><aside class="ai-discord-server-channels"><b data-i18n-preserve>${esc(state.data?.guild?.name || 'السيرفر')}</b>${channels.slice(0, 7).map(channel => `<span data-preview-channel="${esc(channel.id)}"># ${esc(channel.name)}</span>`).join('')}</aside><div class="ai-discord-server-chat"><div class="ai-discord-channel-name" id="aiPreviewChannelName"># اختر قناة النشر</div><div class="ai-discord-bot-name">◈ ديسكوكو <small>BOT</small></div>${item.has_attachment && !plan.referenceOnly && plan.kind !== 'poll' ? `<img class="ai-discord-banner" src="/api/ai/requests/${encodeURIComponent(item.id)}/attachment" alt="البنر المرفق">` : ''}<div class="ai-discord-embed"><b id="aiPreviewTitle"></b><p id="aiPreviewDescription"></p><small id="aiPreviewMeta"></small></div><span class="ai-discord-button" id="aiPreviewButton"></span></div>${previewMemberRail()}</div></section><label class="check-row"><input id="aiInteractiveConfirmed" type="checkbox">راجعت الإعدادات وأوافق على النشر في Discord.</label>`, '<button class="btn secondary" id="aiInteractiveCancel">إلغاء</button><button class="btn primary" id="aiInteractiveLaunch" disabled>نعم، أؤكد التنفيذ</button>');
      $('#aiInteractiveConfirmed').closest('label').insertAdjacentHTML('beforebegin', panelReviewFields(plan));
      bindPanelReview(plan, '#aiPreviewButton', 'aiInteractiveConfirmed', 'aiInteractiveLaunch',item.id);
      if (item.editExisting) loadPublishedDesignImage(item, '.ai-discord-embed');
      if ($('#aiInteractiveImagePosition')) $('#aiInteractiveImagePosition').value = plan.imagePosition || 'above';
      if ($('#aiInteractiveImage')) $('#aiInteractiveImagePosition').closest('label').insertAdjacentHTML('afterend', imageStyleFields('aiInteractiveImage'));
      if (plan.kind === 'giveaway') {
        $('#aiPrize').closest('label').insertAdjacentHTML('beforebegin', `<label>عنوان الجيف آواي<input id="aiGiveawayTitle" maxlength="180" value="${esc(plan.title || (plan.prize ? `🎉 جيف آواي: ${plan.prize}` : '🎉 جيف آواي مميز'))}"></label><label>النص الذي سيظهر للأعضاء<textarea id="aiGiveawayDescription" maxlength="1000" rows="3">${esc(plan.description || 'شارك الآن بالضغط على الزر، ونتمنى لك حظًا سعيدًا!')}</textarea></label><label>لون بطاقة الجيف آواي<input id="aiGiveawayColor" type="color" value="#8b5cf6"></label>`);
      }
      if (plan.kind === 'tickets') $('#aiTicketDescription').closest('label').insertAdjacentHTML('afterend', '<label>لون بطاقة الدعم<input id="aiTicketColor" type="color" value="#8b5cf6"></label>');
      if ($('#aiTicketColor') || $('#aiGiveawayColor')) ($('#aiTicketColor') || $('#aiGiveawayColor')).value = /^#[0-9a-f]{6}$/i.test(plan.color || '') ? plan.color : '#8b5cf6';
      if (item.editExisting) { $('#aiInteractiveChannel').value=item.interactive_channel_id; $('#aiInteractiveChannel').disabled=true; $('#aiInteractiveConfirmed').closest('label').insertAdjacentHTML('beforebegin','<p class="notice info">سيُعدّل شكل اللوحة ورسالتها الحالية دون إعادة نشرها. تبقى المشاركات محفوظة؛ الجائزة والمدة وعدد الفائزين ثابتة.</p>'); if (plan.kind === 'giveaway') for (const id of ['aiPrize','aiDuration','aiWinners']) $('#'+id).disabled=true; if (plan.kind === 'tickets') { $('#aiStaffRole').value=plan.staffRoleId || ''; $('#aiTicketCategory').value=plan.categoryId || ''; } }
      installAiEmojiPickers();
      const descriptionField = plan.kind === 'giveaway' ? $('#aiGiveawayDescription') : plan.kind === 'tickets' ? $('#aiTicketDescription') : null;
      if (descriptionField) {
        descriptionField.closest('label').insertAdjacentHTML('afterend', '<div class="ai-format-toolbar" role="toolbar" aria-label="تنسيق نص البطاقة"><button type="button" data-card-format="bold">عريض</button><button type="button" data-card-format="italic">مائل</button><button type="button" data-card-format="underline">تسطير</button><button type="button" data-card-format="strike">شطب</button><button type="button" data-card-format="spoiler">مخفي</button><button type="button" data-card-format="quote">اقتباس</button><button type="button" data-card-format="code">كود</button></div>');
        $('#dialogContent').querySelectorAll('[data-card-format]').forEach(button => button.onclick = () => {
          const start = descriptionField.selectionStart, end = descriptionField.selectionEnd, selected = descriptionField.value.slice(start, end) || 'النص';
          const wrap = { bold: '**', italic: '*', underline: '__', strike: '~~', spoiler: '||', code: '`' }[button.dataset.cardFormat];
          descriptionField.setRangeText(button.dataset.cardFormat === 'quote' ? `> ${selected}` : `${wrap}${selected}${wrap}`, start, end, 'select'); descriptionField.focus(); descriptionField.dispatchEvent(new Event('input'));
        });
      }
      if (plan.kind === 'giveaway' || plan.kind === 'tickets') {
        $('#aiInteractiveImage').accept = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime';
        $('#aiInteractiveImage').closest('label').firstChild.textContent = 'صورة حتى 10 ميجابايت أو GIF/فيديو MP4/MOV حتى 20 ميجابايت';
      }
      if ($('#aiInteractiveImagePosition')) $('#aiInteractiveImagePosition').onchange = event => {
        const preview = $('.ai-discord-preview'), banner = preview.querySelector('.ai-discord-banner'), details = preview.querySelector('.ai-discord-embed');
        if (!banner) return;
        const visual = banner.closest('.ai-card-image-wrap') || banner;
        if (event.target.value === 'below') details.after(visual); else details.before(visual);
      };
      let previewImageUrl = '';
      if ($('#aiInteractiveImage')) $('#aiInteractiveImage').onchange = event => {
        if (previewImageUrl) URL.revokeObjectURL(previewImageUrl);
        const file = event.target.files[0]; if (!file) return;
        previewImageUrl = URL.createObjectURL(file);
        const video = file.type.startsWith('video/');
        let banner = $('.ai-discord-banner');
        if (!banner || banner.tagName.toLowerCase() !== (video ? 'video' : 'img')) { const replacement = document.createElement(video ? 'video' : 'img'); replacement.className = 'ai-discord-banner'; if (video) replacement.controls = true; else replacement.alt = 'معاينة البنر'; if (banner) (banner.closest('.ai-card-image-wrap') || banner).replaceWith(replacement); else $('.ai-discord-embed').before(replacement); banner = replacement; }
        banner.src = previewImageUrl;
        if (video) { $('#aiInteractiveImagePosition').value = 'below'; $('#aiInteractiveImagePosition').disabled = true; } else $('#aiInteractiveImagePosition').disabled = false;
        $('#aiInteractiveImagePosition').dispatchEvent(new Event('change'));
      };
      const updateInteractivePreview = () => {
        const value = selector => document.querySelector(selector)?.value?.trim() || '';
        const title = plan.kind === 'giveaway' ? value('#aiGiveawayTitle') || 'عنوان الجيف آواي' : plan.kind === 'poll' ? value('#aiPollQuestion') || 'سؤال الاستطلاع' : value('#aiTicketTitle') || 'عنوان لوحة الدعم';
        const description = plan.kind === 'giveaway' ? `${value('#aiGiveawayDescription')}\n\nالجائزة: ${value('#aiPrize') || '—'}\nمدة المشاركة: ${value('#aiDuration') || '—'} دقيقة · عدد الفائزين: ${value('#aiWinners') || '—'}\n👥 المشاركون: 0` : plan.kind === 'poll' ? [...document.querySelectorAll('[data-ai-poll-option]')].map((field, index) => `${index + 1}. ${field.value.trim()}`).join('\n') : value('#aiTicketDescription');
        const channel = $('#aiInteractiveChannel').selectedOptions[0]?.textContent || 'اختر قناة النشر';
        $('#aiPreviewChannelName').textContent = channel.startsWith('#') ? channel : `# ${channel}`;
        document.querySelectorAll('[data-preview-channel]').forEach(entry => entry.classList.toggle('active', entry.dataset.previewChannel === $('#aiInteractiveChannel').value));
        $('#aiPreviewTitle').innerHTML = emojiPreviewText(title);
        if (plan.kind === 'giveaway' || plan.kind === 'tickets') $('.ai-discord-embed').style.borderColor = (plan.kind === 'giveaway' ? $('#aiGiveawayColor') : $('#aiTicketColor')).value;
        $('#aiPreviewDescription').innerHTML = discordMarkdownPreview(description || 'سيظهر وصفك هنا.');
        $('#aiPreviewMeta').textContent = `قناة النشر: ${channel}`;
        $('#aiPreviewButton').textContent = $('#aiPanelButtonLabel')?.value || (plan.kind === 'giveaway' ? '🎉 مشاركة' : plan.kind === 'poll' ? '📊 تصويت' : '🎫 فتح تذكرة دعم');
        if ($('#aiInteractiveImageStyle')) {
          const banner = $('.ai-discord-banner'); updateStyledImagePreview('aiInteractiveImage', banner);
          if (banner) {
            const visual = banner.closest('.ai-card-image-wrap') || banner, details = $('.ai-discord-embed');
            if ($('#aiInteractiveImageStyle').value === 'logo') details.prepend(visual);
            else if ($('#aiInteractiveImagePosition').value === 'below') details.after(visual);
            else details.before(visual);
          }
        }
      };
      $('#dialogContent').addEventListener('input', updateInteractivePreview);
      $('#dialogContent').addEventListener('change', updateInteractivePreview);
      if (plan.kind !== 'poll') bindLogoPlacement('aiInteractiveImage', updateInteractivePreview);
      updateInteractivePreview();
      $('#aiInteractiveCancel').onclick = () => { if (previewImageUrl) URL.revokeObjectURL(previewImageUrl); closeDialog(); };
      $('#aiInteractiveConfirmed').onchange = event => { $('#aiInteractiveLaunch').disabled = !event.target.checked; };
      $('#aiInteractiveLaunch').onclick = async event => { event.currentTarget.disabled = true; try {
        const creatingSupportChannel = plan.kind === 'tickets' && $('#aiInteractiveChannel').value === '__create__';
        if (!$('#aiInteractiveChannel').value || (plan.kind === 'giveaway' && (!$('#aiPrize').value.trim() || !$('#aiDuration').value || !$('#aiWinners').value)) || (plan.kind === 'poll' && (!$('#aiPollQuestion').value.trim() || [...document.querySelectorAll('[data-ai-poll-option]')].some(field => !field.value.trim()))) || (plan.kind === 'tickets' && (!$('#aiTicketTitle').value.trim() || !$('#aiTicketDescription').value.trim() || !$('#aiStaffRole').value))) throw Error('أكمل الحقول المطلوبة في بطاقة المراجعة قبل النشر.');
        const imageFile = $('#aiInteractiveImage')?.files[0];
        const animated = imageFile && ['image/gif', 'video/mp4', 'video/quicktime'].includes(imageFile.type);
        if(animated && sceneEnabled('aiInteractiveImage'))throw Error('Flexible design requires a final static image / التصميم المرن يحتاج صورة ثابتة');
        if (!imageFile && !item.editExisting && $('#aiInteractiveImageStyle')?.value !== 'normal') throw Error('ارفع صورة للشعار أو التصميم أولًا.');
        if (animated && $('#aiInteractiveImageStyle')?.value !== 'normal') throw Error('الشعار الدائري يحتاج صورة ثابتة.');
        const body = { editExisting: item.editExisting === true, ...readPanelReview(), confirmed: true, channelId: creatingSupportChannel ? '' : $('#aiInteractiveChannel').value, imagePosition: $('#aiInteractiveImageStyle')?.value === 'logo' ? 'logo' : $('#aiInteractiveImagePosition')?.value || 'above', image: (imageFile || sceneEnabled('aiInteractiveImage')) && !animated ? await prepareStyledImage(imageFile, 'aiInteractiveImage') : undefined, media: animated ? await prepareAiMedia(imageFile) : undefined, ...(plan.kind === 'giveaway' ? { title: $('#aiGiveawayTitle').value, description: $('#aiGiveawayDescription').value, color: $('#aiGiveawayColor').value, prize: $('#aiPrize').value, durationMinutes: Number($('#aiDuration').value), winnerCount: Number($('#aiWinners').value) } : plan.kind === 'poll' ? { question: $('#aiPollQuestion').value, options: [...document.querySelectorAll('[data-ai-poll-option]')].map(field => field.value) } : { title: $('#aiTicketTitle').value, description: $('#aiTicketDescription').value, color: $('#aiTicketColor').value, categoryId: $('#aiTicketCategory').value, staffRoleId: $('#aiStaffRole').value, ...(creatingSupportChannel ? { createChannelName: $('#aiNewSupportChannel').value } : {}) }) };
        await api(`/api/ai/requests/${encodeURIComponent(item.id)}/launch-interactive`, { method: 'POST', body: JSON.stringify(body) });
        closeDialog(); await loadMessages(); toast('نُشر النظام التفاعلي في Discord.');
      } catch (error) { modalError(error); $('#aiInteractiveConfirmed').checked = false; $('#aiInteractiveLaunch').disabled = true; } };
    });
    thread.scrollTop = thread.scrollHeight;
  };
  const refreshList = async () => { const data = await api(`/api/ai/conversations?guildId=${encodeURIComponent(guild)}`); if (!active()) return; conversations = data.conversations || []; if (selected && !conversations.some(item => item.id === selected)) { selected = ''; sessionStorage.removeItem(storageKey); } renderList(); };
  const loadMessages = async () => { if (!selected) { messages = []; renderMessages(); return; } const current = selected; const data = await api(`/api/ai/conversations/${encodeURIComponent(current)}/messages`); if (!active() || current !== selected) return; messages = data.messages || [];for(const item of messages)if(item.proposal?.draftVersion)aiDraftVersions.set(item.id,item.proposal.draftVersion); renderMessages(); const pending = messages.find(item => ['pending', 'processing'].includes(item.status)); if (pending) poll(pending.id, current); };
  const poll = async (id, conversationId) => { for (let attempt = 0; attempt < 60 && active() && selected === conversationId; attempt++) { await new Promise(resolve => setTimeout(resolve, 3000)); if (!active() || selected !== conversationId) return; try { const { request } = await api(`/api/ai/requests/${id}`); if (['completed', 'failed'].includes(request.status)) { await loadMessages(); await refreshList(); return; } } catch (error) { notice.textContent = error.message; return; } } if (active()) notice.textContent = 'الرد ما زال قيد المعالجة. ستجده هنا عند العودة للمحادثة.'; };
  $('#aiNew').onclick = () => { selected = ''; sessionStorage.removeItem(storageKey); messages = []; notice.textContent = ''; renderList(); renderMessages(); input.focus(); };
  $('#assistantForm').onsubmit = run(async event => {
    event.preventDefault();
    if (busy) return;
    if (!planEnabled) { toast('طوّر باقتك لاستخدام AI ديسكوكو.'); return; }
    if (!available && !selectedTemplate) { toast('الجهاز المحلي غير متصل حاليًا. إجراءات المكتبة الجاهزة ما زالت متاحة.'); return; }
    let prompt = input.value.trim(); if (!prompt) return;
    if (attachedFile?.type === 'text/plain' || attachedFile?.name.toLowerCase().endsWith('.txt')) { const content = await attachedFile.text(); if (content.length > 800) { toast('الملف النصي طويل. الحد 800 حرف.'); return; } prompt = `${prompt}\n\nمحتوى الملف ${attachedFile.name}:\n${content}`; if (prompt.length > 1500) { toast('سؤالك مع الملف يتجاوز 1500 حرف. اختصر النص.'); return; } attachedFile = null; $('#aiFile').value = ''; showAttachment(); }
    busy = true; $('#aiSend').disabled = true; notice.textContent = '';
    try {
      const image = attachedFile?.type === 'image/gif' ? await prepareAiMedia(attachedFile) : attachedFile?.type.startsWith('image/') ? await prepareAiImage(attachedFile) : undefined;
      const result = await api('/api/ai/requests', { method: 'POST', body: JSON.stringify({ guildId: guild, conversationId: selected || undefined, prompt, image, language:aiLanguage.language(), ...(selectedTemplate?{libraryMode:selectedTemplate.moduleKind?'module':'execute',libraryTitle:selectedTemplate.title,libraryCategory:selectedTemplate.category}:{}) }) });
      if (!active()) return;
      selected = result.conversationId; sessionStorage.setItem(storageKey, selected); input.value = ''; selectedTemplate = null; $('#aiTemplateDraft').hidden = true; attachedFile = null; $('#aiFile').value = ''; showAttachment();
      messages.push({ id: result.id, prompt, status: 'pending', has_attachment: !!image }); renderMessages();
      try { await refreshList(); await loadMessages(); if(result.status==='completed')thread.querySelector(`[data-ai-module="${result.id}"],[data-ai-interactive="${result.id}"],[data-ai-message="${result.id}"]`)?.click(); }
      catch (error) { notice.textContent = 'حُفظت رسالتك، لكن تعذر تحديث السجل الآن. أعد فتح المحادثة بعد قليل.'; poll(result.id, selected); }
    } finally { busy = false; if (active()) $('#aiSend').disabled = false; }
  });
  input.onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('#assistantForm').requestSubmit(); } };
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null, recordingTimer = null, recordingStart = 0, recordingRequested = false, restartTimer = null, spokenBase = '', completedSpeech = '', sessionSpeech = '';
  const endRecordingUi = () => { clearInterval(recordingTimer); recordingTimer = null; $('#aiRecording').hidden = true; $('#aiVoice').classList.remove('recording'); };
  const stopRecognition = () => { recordingRequested = false; clearTimeout(restartTimer); recognition?.stop(); recognition = null; endRecordingUi(); notice.textContent = 'راجع النص ثم اضغط إرسال.'; input.focus(); };
  $('#aiStopVoice').onclick = stopRecognition;
  $('#aiVoice').onclick = async () => {
    if (recordingRequested) { stopRecognition(); return; }
    if (!navigator.mediaDevices?.getUserMedia) { notice.textContent = 'المايك غير متاح هنا. افتح الموقع في Chrome.'; return; }
    try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.getTracks().forEach(track => track.stop()); }
    catch (error) { notice.textContent = ['NotAllowedError','PermissionDeniedError'].includes(error.name) ? 'المايك محظور. اسمح له من أيقونة الموقع بجانب الرابط.' : error.name === 'NotFoundError' ? 'لا يوجد مايك متصل بالجهاز.' : 'تعذر تشغيل المايك. جرّب Chrome مباشرة.'; return; }
    if (!Recognition) { notice.textContent = 'تم السماح بالمايك، لكن تحويل الصوت غير مدعوم هنا.'; return; }
    let devices = []; try { devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audioinput'); } catch {}
    modal('اختيار الميكروفون', `<p class="form-note">يستخدم تحويل الكلام إلى نص ميكروفون المتصفح الافتراضي. إذا عندك أكثر من جهاز، اختر الميكروفون الافتراضي من إعدادات المتصفح أو النظام قبل البدء.</p><div class="ai-device-list">${devices.map(device => `<div>🎙 ${esc(device.label || 'ميكروفون')}</div>`).join('') || '<div>الميكروفون الافتراضي</div>'}</div><p class="form-note">بعد السماح، سيظهر شريط التسجيل والكلام المكتوب قبل أن تضغط إرسال.</p>`, '<button id="aiVoiceCancel" class="btn secondary" type="button">إلغاء</button><button id="aiVoiceStart" class="btn primary" type="button">ابدأ التسجيل</button>');
    $('#aiVoiceCancel').onclick = closeDialog;
    $('#aiVoiceStart').onclick = () => { closeDialog(); recordingRequested = true; spokenBase = input.value.trim(); completedSpeech = ''; recordingStart = Date.now(); startRecognition(); };
  };
  const startRecognition = () => {
    if (!recordingRequested || !active()) return;
    const current = new Recognition(); recognition = current; sessionSpeech = '';
    current.lang = aiLanguage.language()==='en'?'en-US':'ar-SA'; current.interimResults = true; current.continuous = true;
    current.onstart = () => { $('#aiVoice').classList.add('recording'); $('#aiRecording').hidden = false; if (!recordingTimer) recordingTimer = setInterval(() => { const seconds = Math.floor((Date.now() - recordingStart) / 1000); $('#aiRecordingTime').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }, 1000); notice.textContent = 'تكلّم الآن… سيظهر النص قبل الإرسال. اضغط إيقاف التسجيل عند الانتهاء.'; };
    current.onresult = event => { sessionSpeech = [...event.results].map(result => result[0].transcript).join(' ').trim(); input.value = [spokenBase, completedSpeech, sessionSpeech].filter(Boolean).join(' '); };
    current.onerror = event => { if (['not-allowed','service-not-allowed','audio-capture'].includes(event.error)) { recordingRequested = false; notice.textContent = event.error === 'audio-capture' ? 'تعذر الوصول إلى الميكروفون.' : 'اسمح للمتصفح باستخدام الميكروفون ثم حاول مجددًا.'; } };
    current.onend = () => { if (recognition !== current) return; recognition = null; completedSpeech = [completedSpeech, sessionSpeech].filter(Boolean).join(' '); sessionSpeech = ''; if (recordingRequested && active()) restartTimer = setTimeout(startRecognition, 300); else { endRecordingUi(); if (notice.textContent.startsWith('تكلّم')) notice.textContent = 'راجع النص ثم اضغط إرسال.'; input.focus(); } };
    try { current.start(); } catch { recordingRequested = false; recognition = null; endRecordingUi(); toast('تعذر بدء التسجيل الصوتي.'); }
  };
  try {
    const status = await api('/api/ai/status'); if (!active()) return;
    planEnabled = status.planEnabled; available = status.available && planEnabled;
    $('#aiStatus').className = `badge ${status.available ? 'good' : 'warn'}`;
    $('#aiStatus').textContent = status.available ? 'متصل' : 'الجهاز المحلي غير متصل';
    if (!planEnabled) notice.textContent = 'AI ديسكوكو متاح من باقة Starter. طوّر باقتك لتستخدمه.';
    else if (!status.available) notice.textContent = 'يمكنك قراءة محادثاتك السابقة. لإرسال رسالة جديدة، شغّل AI ديسكوكو على جهاز التشغيل.';
    try { await refreshList(); await loadMessages(); }
    catch (error) { notice.textContent = 'تعذر تحميل السجل من Discord الآن. أعد المحاولة بعد قليل.'; }
  } catch (error) { if (active()) notice.textContent = error.message; }
}
async function commands() {
  const guild = state.guild; const epoch = state.epoch;
  $('#workspace').innerHTML = head('الأوامر', 'اعرض أوامر كل بوت متصل وعدّل اللوحات من مكانها، أو اضبط أوامر ديسكوكو العامة.') + connectionNotice() + '<div class="loading" role="status">جارٍ قراءة إعدادات البوت…</div>';
  const [{ settings }, { commands: commandCatalog }, registry] = await Promise.all([api(`/api/guilds/${encodeURIComponent(guild)}/bot-settings`), api('/api/bots/commands'), api(`/api/ai/bots?guildId=${encodeURIComponent(guild)}`)]);
  if (guild !== state.guild || epoch !== state.epoch || screen() !== 'commands') return;
  const connectedBots = [registry.publicBot, ...(registry.bots || [])].filter(item => item?.online);
  const commands = commandCatalog.filter(command => command.status === 'available').map(command => [command.key, command.title, command.description]);
  const textChannels = state.data.channels?.filter(channel => [0, 5].includes(channel.type)) || [];
  $('#workspace').innerHTML = head('الأوامر', 'اعرض أوامر بوت ديسكوكو وبوتاتك الخاصة، وعدّل أو احذف كل أمر من البوت الذي ينفذه.') + connectionNotice() + `<section class="panel command-builder"><div class="panel-body form-grid"><div><h3>أوامر البوتات المتصلة</h3><p class="form-note">كل أوامر هذا السيرفر مرتبة حسب البوت. اختر بوتًا لإدارة أوامره؛ لوحات الموسيقى ويوتيوب ونادي الأفلام تُعدّل من «اللوحات التفاعلية».</p></div><div class="form-grid" id="allConnectedCommands">${connectedBots.map(item => `<div class="row"><span class="row-icon">${item.public ? '✦' : '🤖'}</span><div class="row-main"><b data-i18n-preserve>${esc(item.label)}</b><small>${item.assignments?.commands?.length ? item.assignments.commands.map(command => '/' + esc(command.name)).join('، ') : 'لا توجد أوامر مسجلة'}</small></div><button class="btn small secondary" type="button" data-open-command-bot="${esc(item.id)}">إدارة</button></div>`).join('') || '<p class="form-note">لا يوجد بوت متصل الآن.</p>'}</div>${connectedBots.length ? `<label>البوت المنفّذ<select id="customCommandBot">${connectedBots.map(item => `<option value="${esc(item.id)}" ${item.selected ? 'selected' : ''}>${esc(item.label)} · متصل</option>`).join('')}</select></label><div id="customCommandList" role="status">جارٍ تحميل أوامر البوت…</div><details id="customCommandCreate"><summary>＋ إنشاء أمر جديد</summary><form id="customCommandForm" class="form-grid"><div class="form-grid two"><label>اسم الأمر بعد /<input id="customCommandName" maxlength="32" required placeholder="مساعدة"></label><label>وصفه في Discord<input id="customCommandDescription" maxlength="100" required placeholder="يعرض لوحة المساعدة"></label></div><label>طريقة الرد<select id="customCommandKind"><option value="text">رسالة نصية</option><option value="card">لوحة بتنسيق وصورة وزر</option></select></label><label class="custom-command-card-field" hidden>عنوان اللوحة<input id="customCommandTitle" maxlength="256" placeholder="لوحة مجتمعك"></label><label>نص الرد أو وصف اللوحة<textarea id="customCommandResponse" maxlength="2000" rows="4" required></textarea></label><label class="custom-command-card-field" hidden>رابط الصورة (اختياري)<input id="customCommandImage" type="url" maxlength="500" placeholder="https://..."></label><div class="form-grid two custom-command-card-field" hidden><label>عنوان الزر<input id="customCommandButtonLabel" maxlength="80" placeholder="فتح الرابط"></label><label>رابط الزر<input id="customCommandButtonUrl" type="url" maxlength="500" placeholder="https://..."></label></div><label class="check-row"><input id="customCommandPrivate" type="checkbox">الرد لصاحب الأمر فقط</label><div id="customCommandPreview" class="preview" aria-live="polite"></div><button class="btn primary" type="submit">إنشاء الأمر في Discord</button></form></details>` : `<p>لا يوجد بوت متصل بهذا السيرفر. <a href="/studio?guild=${encodeURIComponent(guild)}#bots">افتح اللوحات التفاعلية ←</a></p>`}</div></section><details class="panel command-diskoko-settings"><summary>أوامر بوت ديسكوكو العام</summary><div class="grid-2">${panel('إعدادات Diskoko', `<form id="botForm" class="panel-body form-grid"><label class="check-row"><input id="botEnabled" type="checkbox" ${settings.enabled ? 'checked' : ''}>تفعيل أوامر Diskoko في هذا السيرفر</label><div class="form-grid two"><label>لغة الردود<select id="botLocale"><option value="ar" ${settings.locale === 'ar' ? 'selected' : ''}>العربية</option><option value="en" ${settings.locale === 'en' ? 'selected' : ''}>English</option></select></label><label>قناة سجل الأوامر<select id="logChannel"><option value="">دون سجل رسائل</option>${textChannels.map(channel => `<option value="${esc(channel.id)}" ${settings.log_channel_id === channel.id ? 'selected' : ''}># ${esc(channel.name)}</option>`).join('')}</select></label></div><div>${commands.map(([key, title, description]) => `<div class="row"><label class="check-row"><input class="command-check" type="checkbox" value="${key}" ${settings.command_keys.includes(key) ? 'checked' : ''}></label><div class="row-main"><b>${title} <code>/diskoko ${key}</code></b><small>${description}</small></div><button class="btn text" type="button" data-preview="${key}">معاينة</button></div>`).join('')}</div><div class="actions"><button class="btn primary" ${!state.data.connection.readable ? 'disabled' : ''}>حفظ إعدادات ديسكوكو</button></div></form>`)}${panel('معاينة رد ديسكوكو', '<div class="panel-body"><div class="preview"><b>◈ Diskoko</b> <span class="badge purple">مثال توضيحي</span><div class="message" id="botPreview">أهلًا! اعرض أوامر مجتمعك باستخدام /diskoko help.</div></div><p class="export-note">المعاينة لا ترسل رسالة إلى Discord.</p></div>')}</div></details>`;
  if ($('#customCommandBot')) {
    $('#customCommandButtonUrl').closest('.form-grid').insertAdjacentHTML('afterend', `<div id="customCommandExtraLinks" class="custom-command-card-field form-grid" hidden><small>روابط إضافية للوحة (حتى خمسة أزرار)</small>${[2,3,4,5].map(index => `<div class="form-grid two"><label>عنوان الرابط ${index}<input data-command-link-label="${index}" maxlength="80"></label><label>الرابط ${index}<input data-command-link-url="${index}" type="url" maxlength="500" placeholder="https://..."></label></div>`).join('')}</div>`);
    let privateRows = [], editingName = null;
    const resetPrivateEditor = () => { editingName = null; $('#customCommandForm').reset(); $('#customCommandName').disabled = false; $('#customCommandDescription').disabled = false; $('#customCommandCreate summary').textContent = '＋ إنشاء أمر جديد'; $('#customCommandSubmit').textContent = 'إنشاء الأمر في Discord'; $('#customCommandCancelEdit').hidden = true; $('#customCommandKind').onchange(); };
    const loadPrivate = async () => {
      const id = $('#customCommandBot')?.value, target = $('#customCommandList'); if (!id || !target) return;
      target.textContent = 'جارٍ تحميل أوامر البوت…';
      try {
        const { commands: rows, limit } = await api(`/api/ai/bots/${encodeURIComponent(id)}/commands?guildId=${encodeURIComponent(guild)}`);
        if (!target.isConnected || $('#customCommandBot')?.value !== id) return;
        privateRows = rows;
        const publicSelected = id === registry.publicBot?.id;
        const kindLabel = kind => ({ music_panel: 'لوحة موسيقى', youtube_panel: 'لوحة يوتيوب', movie_club: 'نادي أفلام', card: 'لوحة', text: 'نص' })[kind] || 'أمر';
        const panelKind = kind => ['music_panel', 'youtube_panel', 'movie_club'].includes(kind);
        target.innerHTML = rows.length ? rows.map(item => `<div class="row"><span class="row-icon">/</span><div class="row-main"><b data-i18n-preserve>/${esc(item.name)}</b><small><span data-i18n-preserve>${esc(item.description)}</span> · ${kindLabel(item.response_kind)} · ${item.ephemeral ? 'رد خاص' : 'رد ظاهر'}</small></div><button class="btn small secondary" type="button" data-edit-custom-command="${esc(item.name)}">${panelKind(item.response_kind) ? 'تعديل اللوحة' : 'تعديل'}</button>${panelKind(item.response_kind) ? '' : `<button class="btn small secondary" type="button" data-schedule-custom-command="${esc(item.name)}" ${item.ephemeral ? 'disabled title="الرد الخاص لا يصلح للنشر المجدول"' : ''}>جدولة</button>`}<button class="btn small secondary" type="button" data-delete-custom-command="${esc(item.name)}">حذف</button></div>`).join('') : '<p class="form-note">لا توجد أوامر لهذا البوت بعد.</p>';
        $('#customCommandCreate').hidden = publicSelected || rows.length >= limit && !editingName;
        target.querySelectorAll('[data-delete-custom-command]').forEach(button => button.onclick = () => confirmDialog('حذف الأمر؟', `سيُحذف /${button.dataset.deleteCustomCommand} من Discord.`, 'حذف الأمر', async () => { await api(`/api/ai/bots/${encodeURIComponent(id)}/commands/${encodeURIComponent(button.dataset.deleteCustomCommand)}`, { method: 'DELETE', body: JSON.stringify({ guildId: guild }) }); closeDialog(); await loadPrivate(); toast('حُذف الأمر.'); }));
      } catch (error) { target.textContent = error.message; }
    };
        $('#customCommandList').addEventListener('click', event => {
      const edit = event.target.closest('[data-edit-custom-command]');
      if (edit) {
        const item = privateRows.find(row => row.name === edit.dataset.editCustomCommand); if (!item) return;
        if (['music_panel', 'youtube_panel', 'movie_club', 'community_panel'].includes(item.response_kind)) {
          sessionStorage.setItem(`diskoko-panel-edit:${guild}`, JSON.stringify({ botId: $('#customCommandBot').value, kind: item.response_kind, name: item.name }));
          location.hash = '#bots';
          return;
        }
        editingName = item.name; $('#customCommandCreate').hidden = false; $('#customCommandCreate').open = true;
        $('#customCommandCreate summary').textContent = `تعديل /${item.name}`; $('#customCommandSubmit').textContent = 'حفظ التعديل'; $('#customCommandCancelEdit').hidden = false;
        $('#customCommandName').value = item.name; $('#customCommandName').disabled = true;
        $('#customCommandDescription').value = item.description; $('#customCommandDescription').disabled = true;
        $('#customCommandKind').value = item.response_kind || 'text'; $('#customCommandTitle').value = item.card_title || '';
        $('#customCommandResponse').value = item.response || ''; $('#customCommandImage').value = item.image_url || '';
        $('#customCommandPrivate').checked = Boolean(item.ephemeral);
        const links = Array.isArray(item.links) && item.links.length ? item.links : item.button_url ? [{ label: item.button_label, url: item.button_url }] : [];
        $('#customCommandButtonLabel').value = links[0]?.label || ''; $('#customCommandButtonUrl').value = links[0]?.url || '';
        [2,3,4,5].forEach(index => { $(`[data-command-link-label="${index}"]`).value = links[index - 1]?.label || ''; $(`[data-command-link-url="${index}"]`).value = links[index - 1]?.url || ''; });
        $('#customCommandKind').onchange(); $('#customCommandCreate').scrollIntoView({ block: 'nearest' }); return;
      }
      const button = event.target.closest('[data-schedule-custom-command]'); if (!button) return;
      const name = button.dataset.scheduleCustomCommand, botId = $('#customCommandBot').value;
      const channels = (state.data.channels || []).filter(channel => [0, 5].includes(channel.type));
      modal(`جدولة لوحة /${esc(name)}`, `<form id="customCommandScheduleForm" class="form-grid"><p>سينشر ${esc(connectedBots.find(item => item.id === botId)?.label || 'البوت')} النسخة الأحدث من هذه اللوحة في القناة المختارة. إذا عدّلت اللوحة قبل الموعد، سيظهر التعديل في النشر القادم.</p><label>قناة النشر<select id="customCommandScheduleChannel" required>${channels.map(channel => `<option value="${esc(channel.id)}"># ${esc(channel.name)}</option>`).join('')}</select></label><div class="form-grid two"><label>موعد أول نشر<input id="customCommandScheduleTime" type="datetime-local" required></label><label>التكرار<select id="customCommandScheduleRepeat"><option value="once">مرة واحدة</option><option value="daily">كل يوم</option><option value="weekly">كل أسبوع</option><option value="monthly">كل شهر</option></select></label></div><label class="check-row"><input id="customCommandScheduleConfirm" type="checkbox" required>راجعت البوت والقناة والموعد، وأوافق على النشر.</label></form>`, '<button class="btn secondary" id="customCommandScheduleCancel" type="button">إلغاء</button><button class="btn primary" form="customCommandScheduleForm" type="submit">تأكيد الجدولة</button>');
      $('#customCommandScheduleCancel').onclick = closeDialog;
      $('#customCommandScheduleForm').onsubmit = async submit => { submit.preventDefault(); submit.submitter.disabled = true; try { await api(`/api/workspace/${encodeURIComponent(guild)}/command-schedules`, { method: 'POST', body: JSON.stringify({ botId, commandName: name, channel_id: $('#customCommandScheduleChannel').value, run_at: new Date($('#customCommandScheduleTime').value).toISOString(), repeat: $('#customCommandScheduleRepeat').value, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, confirmed: $('#customCommandScheduleConfirm').checked }) }); closeDialog(); toast('حُفظ موعد نشر اللوحة. راجعه من الرسائل المجدولة.'); } catch (error) { modalError(error); submit.submitter.disabled = false; } };
    });
    $('#customCommandBot').onchange = () => { resetPrivateEditor(); void loadPrivate(); };
    document.querySelectorAll('[data-open-command-bot]').forEach(button => button.onclick = () => { $('#customCommandBot').value = button.dataset.openCommandBot; $('#customCommandBot').dispatchEvent(new Event('change')); $('#customCommandList').scrollIntoView({ block: 'nearest' }); });
    $('#customCommandKind').onchange = () => { const card = $('#customCommandKind').value === 'card'; document.querySelectorAll('.custom-command-card-field').forEach(field => { field.hidden = !card; }); $('#customCommandTitle').required = card; updatePrivatePreview(); };
    const commandLinks = () => [{ label: $('#customCommandButtonLabel').value, url: $('#customCommandButtonUrl').value }, ...[2,3,4,5].map(index => ({ label: $(`[data-command-link-label="${index}"]`).value, url: $(`[data-command-link-url="${index}"]`).value }))].filter(link => link.label || link.url);
    const updatePrivatePreview = () => { const preview = $('#customCommandPreview'); if (!preview) return; const card = $('#customCommandKind').value === 'card'; preview.innerHTML = `<b>${esc(card ? ($('#customCommandTitle').value || 'عنوان اللوحة') : `/${$('#customCommandName').value || 'الأمر'}`)}</b><div class="message">${esc($('#customCommandResponse').value || 'نص الرد سيظهر هنا…')}</div>${card && $('#customCommandImage').value ? `<small>🖼️ صورة مرفقة</small>` : ''}${card ? `<div class="actions">${commandLinks().map(link => `<span class="badge purple">${esc(link.label || 'رابط')} ↗</span>`).join('')}</div>` : ''}`; };
    $('#customCommandForm button[type="submit"]').id = 'customCommandSubmit';
    $('#customCommandSubmit').insertAdjacentHTML('afterend', '<button class="btn secondary" id="customCommandCancelEdit" type="button" hidden>إلغاء التعديل</button>');
    $('#customCommandCancelEdit').onclick = resetPrivateEditor;
    $('#customCommandForm').oninput = updatePrivatePreview; updatePrivatePreview();
    $('#customCommandForm').onsubmit = run(async event => { event.preventDefault(); const button = event.submitter; button.disabled = true; try { const botId = $('#customCommandBot').value; const body = { guildId: guild, name: $('#customCommandName').value, description: $('#customCommandDescription').value, response: $('#customCommandResponse').value, responseKind: $('#customCommandKind').value, cardTitle: $('#customCommandTitle').value, imageUrl: $('#customCommandImage').value, links: commandLinks(), ephemeral: $('#customCommandPrivate').checked }; if (editingName) await api(`/api/ai/bots/${encodeURIComponent(botId)}/commands/${encodeURIComponent(editingName)}`, { method: 'PATCH', body: JSON.stringify(body) }); else await api(`/api/ai/bots/${encodeURIComponent(botId)}/commands`, { method: 'POST', body: JSON.stringify(body) }); const updated = Boolean(editingName); resetPrivateEditor(); await loadPrivate(); toast(updated ? 'حُفظ تعديل اللوحة، وستستخدمه الجدولة القادمة.' : 'الأمر يعمل الآن على البوت المختار.'); } finally { button.disabled = false; } });
    const requestedBot = sessionStorage.getItem(`diskoko-command-bot:${guild}`);
    if (requestedBot) { sessionStorage.removeItem(`diskoko-command-bot:${guild}`); if (connectedBots.some(item => item.id === requestedBot)) $('#customCommandBot').value = requestedBot; }
    await loadPrivate();

  }
  const examples = Object.fromEntries(commandCatalog.map(command => [command.key, command.example]));
  document.querySelectorAll('[data-preview]').forEach(button => { button.onclick = () => { $('#botPreview').textContent = examples[button.dataset.preview]; }; });
  $('#botForm').onsubmit = run(async event => { event.preventDefault(); const button = event.submitter; button.disabled = true; try { await api(`/api/guilds/${encodeURIComponent(guild)}/bot-settings`, { method: 'PUT', body: JSON.stringify({ ...settings, enabled: $('#botEnabled').checked, locale: $('#botLocale').value, log_channel_id: $('#logChannel').value || null, command_keys: [...document.querySelectorAll('.command-check:checked')].map(input => input.value) }) }); toast('حُفظت إعدادات البوت لهذا السيرفر.'); } finally { button.disabled = false; } });
}
async function automation() {
  const guild = state.guild;
  $('#workspace').innerHTML = head('رسالتك، في وقتها.', 'جهّز إعلانًا أو تذكيرًا، وراجعه قبل الجدولة.') + '<div class="loading" role="status">جارٍ تحميل الرسائل المجدولة…</div>';
  const { schedules } = await api(`/api/workspace/${encodeURIComponent(guild)}/schedules`);
  if (guild !== state.guild || screen() !== 'automation') return;
  $('#workspace').innerHTML = head('رسالتك، في وقتها.', 'جهّز إعلانًا أو تذكيرًا، وراجعه قبل الجدولة.', `<button class="btn primary" id="newSchedule" ${!state.data.connection.readable ? 'disabled' : ''}>＋ رسالة مجدولة</button>`) + connectionNotice() + `<div class="notice info"><div><b>إرسال بعد موافقتك على الرسالة والموعد.</b><p>لا تُفعّل إشارات الجميع أو الرتب تلقائيًا. قد يتأخر الإرسال إذا توقفت خدمة الاستضافة.</p></div></div>` + panel('جدول الرسائل', schedules.length ? `<div class="rows">${schedules.map(job => `<div class="row"><span class="row-icon">◷</span><div class="row-main"><b>${esc(job.content.slice(0, 100))}</b><small># ${esc(state.data.channels?.find(channel => channel.id === job.channel_id)?.name || 'قناة غير متاحة')} · ${date(job.run_at)} · ${esc(job.timezone)} · ${{ once: 'مرة واحدة', daily: 'كل 24 ساعة', weekly: 'كل 7 أيام', monthly: 'كل شهر' }[job.repeat]}</small>${job.last_error ? `<small>${esc(job.last_error)}</small>` : ''}</div>${status(job.status)}${['scheduled', 'failed'].includes(job.status) ? `<button class="btn small secondary" data-cancel-job="${job.id}">إلغاء</button>` : ''}</div>`).join('')}</div>` : empty('لا توجد رسائل مجدولة', 'جهّز أول إعلان وحدد القناة والوقت. ستجد حالة إرساله هنا.'));
  $('#newSchedule').onclick = scheduleForm;
  document.querySelectorAll('[data-cancel-job]').forEach(button => { button.onclick = () => confirmDialog('إلغاء الرسالة المجدولة؟', 'ستبقى في السجل ولن تُرسل في الموعد القادم.', 'إلغاء الجدولة', async () => { await api(`/api/workspace/${encodeURIComponent(guild)}/schedules/${button.dataset.cancelJob}/cancel`, { method: 'POST', body: '{}' }); closeDialog(); await automation(); }); });
}
function scheduleForm() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  modal('جهّز رسالتك', `<form id="scheduleForm" class="form-grid"><label>القناة<select id="scheduleChannel" required>${(state.data.channels || []).filter(channel => [0, 5].includes(channel.type)).map(channel => `<option value="${esc(channel.id)}"># ${esc(channel.name)}</option>`).join('')}</select></label><label>نص الرسالة<textarea id="scheduleText" rows="4" required maxlength="2000" placeholder="ما الذي تريد إخبار مجتمعك به؟"></textarea></label><div class="form-grid two"><label>موعد الإرسال<input id="scheduleTime" type="datetime-local" required></label><label>التكرار<select id="scheduleRepeat"><option value="once">مرة واحدة</option><option value="daily">كل 24 ساعة</option><option value="weekly">كل 7 أيام</option></select></label></div><p class="form-note">الموعد حسب جهازك: ${esc(timezone)}. التكرار بفواصل زمنية ثابتة، وليس حسب تغيّر التوقيت الصيفي.</p><div class="preview"><b>معاينة الرسالة</b><div class="message" id="schedulePreview">ستظهر رسالتك هنا…</div></div><label class="check-row"><input id="scheduleConfirm" type="checkbox" required>أوافق على إرسال هذه الرسالة في القناة والموعد المحددين.</label></form>`, '<button class="btn primary" form="scheduleForm" type="submit">تأكيد الجدولة</button>');
  $('#scheduleText').oninput = event => { $('#schedulePreview').textContent = event.target.value || 'ستظهر رسالتك هنا…'; };
  $('#scheduleForm').onsubmit = async event => { event.preventDefault(); event.submitter.disabled = true; try { await api(`/api/workspace/${encodeURIComponent(state.guild)}/schedules`, { method: 'POST', body: JSON.stringify({ channel_id: $('#scheduleChannel').value, content: $('#scheduleText').value, run_at: new Date($('#scheduleTime').value).toISOString(), repeat: $('#scheduleRepeat').value, timezone, confirmed: $('#scheduleConfirm').checked }) }); closeDialog(); await automation(); toast('حُفظت الرسالة المجدولة.'); } catch (error) { modalError(error); event.submitter.disabled = false; } };
}
async function analytics() {
  const guild = state.guild; const days = state.days; const d = state.data;
  $('#workspace').innerHTML = head('تعرّف على نبض مجتمعك.', 'مؤشرات نشاط مفهومة، من البيانات التي يجمعها البوت.') + '<div class="loading" role="status">جارٍ قراءة النشاط…</div>';
  const data = await api(`/api/workspace/${encodeURIComponent(guild)}/analytics?days=${days}`);
  if (guild !== state.guild || screen() !== 'analytics' || days !== state.days) return;
  const max = Math.max(1, ...data.members.map(member => member.messages));
  $('#workspace').innerHTML = head('تعرّف على نبض مجتمعك.', 'العضو النشط هو من أرسل رسالة واحدة على الأقل خلال الفترة.', `<select id="period" class="filter-select" aria-label="فترة التحليلات">${[7, 14, 30].map(n => `<option value="${n}" ${days === n ? 'selected' : ''}>آخر ${n} أيام</option>`).join('')}</select>`) + (!d.preferences.analytics_enabled ? `<div class="notice info"><div><b>جمع النشاط غير مفعّل.</b><p>عند تفعيله نحتفظ بأعداد الرسائل وأسماء أصحابها لمدة 30 يومًا، دون تخزين محتوى الرسائل. لا نجلب رسائل الماضي.</p></div><button class="btn primary" id="enableAnalytics">تفعيل جمع النشاط</button></div>` : `<div class="notice info"><div><b>يُجمع النشاط منذ ${date(d.preferences.analytics_started_at)}</b><p>تُستبعد رسائل البوتات. تظهر القنوات التي يستطيع البوت استقبال أحداثها. حدود الأيام حسب UTC.</p></div>${badge('جمع النشاط مفعّل', 'good')}</div>`) + `<div class="metrics">${metric('أعضاء نشطون', data.totals.active_members, `خلال ${days} أيام`, '♧')}${metric('رسائل مسجلة', data.totals.messages, 'دون رسائل البوتات', '#')}${metric('إجمالي الأعضاء', d.members, 'العدد التقريبي الحالي', '◇')}${metric('متصلون الآن', d.onlineMembers, 'العدد التقريبي من Discord', '◉')}</div><div class="grid-2">${panel('الأعضاء الأكثر مشاركة', data.members.length ? `<div class="rows">${data.members.map((member, index) => `<div class="row"><span class="rank">${fmt(index + 1)}</span><div class="row-main"><b>${esc(member.display_name)}</b><small>${fmt(member.active_days)} أيام نشاط</small><div class="rank-bar"><span style="--width:${Math.round(member.messages / max * 100)}%"></span></div></div><span>${fmt(member.messages)} <small>رسالة</small></span></div>`).join('')}</div>` : empty('لا يوجد نشاط مسجل خلال هذه الفترة', d.preferences.analytics_enabled ? 'تبدأ النتائج مع وصول رسائل جديدة يراها البوت.' : 'فعّل جمع النشاط لبدء القياس.'))}${panel('القنوات الأكثر نشاطًا', data.channels.length ? `<div class="rows">${data.channels.map(channel => `<div class="row"><span class="row-icon">#</span><div class="row-main"><b data-i18n-preserve>${esc(d.channels?.find(item => item.id === channel.channel_id)?.name || 'قناة غير متاحة')}</b></div><span>${fmt(channel.messages)} <small>رسالة</small></span></div>`).join('')}</div>` : empty('لا توجد بيانات قنوات بعد', 'ستظهر القنوات بحسب عدد الرسائل المسجلة.'))}</div>${panel('النشاط اليومي', `<div class="panel-body">${data.daily.length ? `<div class="bars" role="img" aria-label="عدد الرسائل يوميًا">${data.daily.map(day => `<div class="bar" title="${esc(day.day)}: ${day.messages}" style="--height:${Math.max(3, day.messages / Math.max(...data.daily.map(item => item.messages)) * 100)}%"><span>${fmt(day.messages)}</span></div>`).join('')}</div><div class="chart-caption"><span>الأيام ذات النشاط المسجل</span><span>آخر ${days} أيام · UTC</span></div>` : '<p>لم تُسجّل رسائل بعد.</p>'}</div>`, '<button class="btn text" id="exportAnalytics">تصدير البيانات ↓</button>')}`;
  $('#period').onchange = run(event => { state.days = Number(event.target.value); return analytics(); });
  $('#enableAnalytics')?.addEventListener('click', () => confirmDialog('تفعيل قياس نشاط المجتمع', 'سيبدأ البوت بتجميع أعداد الرسائل وأسماء المشاركين من الآن. لا يتم حفظ محتوى الرسائل، وتُحفظ الإحصاءات لمدة 30 يومًا.', 'تفعيل جمع النشاط', async () => { await api(`/api/workspace/${encodeURIComponent(guild)}/preferences`, { method: 'PUT', body: JSON.stringify({ analytics_enabled: true }) }); closeDialog(); await loadGuild(); }));
  $('#exportAnalytics').onclick = () => download(`diskoko-activity-${days}-days.json`, { guild: { id: guild, name: d.guild.name }, exported_at: new Date().toISOString(), ...data });
}
function download(name, data) { const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = objectUrl; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000); }
function permissionSummary(value) { const bits = BigInt(value || '0'); const known = [[8n, 'تحكم كامل'], [32n, 'إدارة السيرفر'], [16n, 'إدارة القنوات'], [268435456n, 'إدارة الرتب'], [8192n, 'إدارة الرسائل'], [4n, 'حظر الأعضاء'], [2n, 'طرد الأعضاء'], [1099511627776n, 'إدارة الأعضاء']]; const names = known.filter(([bit]) => (bits & bit) !== 0n).map(([, name]) => name); return names.length ? names.join(' · ') : 'صلاحيات عادية'; }
function readableChangeError(value) {
  const message = String(value || '');
  if (!/Discord\s+\d{3}/i.test(message)) return message;
  if (/ترتيب/.test(message)) return 'تعذر تغيير ترتيب العنصر. راجع موضعه الحالي في السيرفر وصلاحية البوت، ثم أنشئ تغييرًا جديدًا. راجع الخطة لمعرفة أي تعديل اكتمل.';
  if (/Discord\s+403/i.test(message)) return 'تعذر التنفيذ بسبب صلاحيات البوت. ارفع رتبته فوق الرتبة المستهدفة وراجع صلاحياته، ثم أنشئ مراجعة جديدة.';
  if (/Discord\s+429/i.test(message)) return 'طلب Discord الانتظار مؤقتًا. لن نكرر هذه الخطة تلقائيًا؛ راجع حالتها قبل إنشاء تغيير جديد.';
  return 'تعذر تنفيذ الطلب. افتح الخطة لمعرفة ما اكتمل، ثم راجع الإعدادات وصلاحيات البوت قبل إنشاء تغيير جديد.';
}
function activity() {
  const names = { 'change_set.create': 'حُفظت خطة تغييرات', 'change_set.apply': 'طُبقت خطة تغييرات', 'change_set.failed': 'تعثر تطبيق خطة', 'change_set.cancel': 'أُوقف باقي تنفيذ خطة', 'bot.settings.update': 'حُدثت إعدادات البوت', 'guild.verify': 'تم التحقق من الربط', 'guild.rename': 'تغيّر اسم السيرفر', 'schedule.create': 'جُدولت رسالة', 'schedule.cancel': 'أُلغيت رسالة مجدولة', 'analytics.settings': 'حُدث إعداد جمع النشاط' };
  const publications = state.data.publications || [];
  const applied = (state.data.changeSets || []).filter(change => change.status === 'succeeded').map(change => ({ kind: 'plan', at: change.updated_at, name: changeName(change), id: change.id }));
  const published = publications.map(item => ({ kind: 'publication', at: item.published_at, name: item.interactive_kind === 'giveaway' ? `نُشر جيف آواي: ${item.proposal?.interactive?.prize || 'جائزة'}` : item.interactive_kind === 'tickets' ? `نُشرت لوحة تذاكر: ${item.proposal?.interactive?.title || 'الدعم'}` : item.interactive_kind === 'poll' ? `نُشر استطلاع: ${item.proposal?.interactive?.question || 'استطلاع'}` : item.interactive_kind === 'scheduled_event' ? `أُنشئ حدث Discord: ${item.proposal?.interactive?.title || 'حدث'}` : item.interactive_kind === 'event' ? `نُشرت فعالية: ${item.proposal?.interactive?.title || 'فعالية'}` : item.interactive_kind === 'welcome' ? `فُعّل الترحيب التلقائي: ${item.proposal?.interactive?.title || 'ترحيب'}` : item.interactive_kind === 'rules' ? `نُشرت قوانين السيرفر: ${item.proposal?.interactive?.title || 'القوانين'}` : 'نُشرت رسالة', channelId: item.interactive_channel_id || item.sent_channel_id, messageId: item.interactive_message_id || item.sent_message_id }));
  const completed = [...applied, ...published].sort((a, b) => new Date(b.at) - new Date(a.at));
  const completedRows = completed.length ? `<div class="rows">${completed.map(item => `<div class="row"><span class="row-icon">✓</span><div class="row-main"><b data-i18n-preserve>${esc(item.name)}</b><small>${date(item.at)}</small></div>${item.kind === 'plan' ? `<button class="btn text" data-plan="${esc(item.id)}">عرض ←</button>` : item.messageId ? `<a class="btn text" href="https://discord.com/channels/${encodeURIComponent(state.guild)}/${encodeURIComponent(item.channelId)}/${encodeURIComponent(item.messageId)}" target="_blank" rel="noopener noreferrer">عرض في Discord ↗</a>` : '<span class="badge good">مفعّل</span>'}</div>`).join('')}</div>` : empty('لا توجد تغييرات منفذة بعد', 'بعد تأكيد التنفيذ أو النشر ستظهر النتيجة هنا.');
  $('#workspace').innerHTML = head('كل تغيير في سجلك', 'كل خطة تبين ما خُطط له وما اكتمل فعليًا. المسودة أو المحاولة الفاشلة بلا تنفيذ لا تستهلك رصيدًا.', '<button class="btn secondary" id="exportActivity">تصدير السجل ↓</button>') + `<div class="notice info"><div><b>رصيد تغييرات هذا الشهر</b><p id="changeCreditStatus">جارٍ حساب المنفذ والمتبقي…</p></div></div>` + panel(`العمليات المنفذة · ${fmt(completed.length)}`, completedRows) + panel('كل خطط التغيير', changeRows(state.data.changeSets || [])) + panel('سجل إجراءاتك', state.data.activity.length ? `<div class="rows">${state.data.activity.map(event => `<div class="row"><span class="row-icon">◷</span><div class="row-main"><b>${esc(names[event.action] || 'إجراء على السيرفر')}</b><small>${date(event.created_at)}${event.details?.error ? ` · ${esc(readableChangeError(event.details.error))}` : ''}</small></div></div>`).join('')}</div>` : empty('لا توجد إجراءات مسجلة لك بعد', 'ستظهر هنا الإجراءات الجديدة التي تنفذها من لوحة السيرفر.'));
  bindPlans(); $('#exportActivity').onclick = () => download('diskoko-change-history.json', { guild: state.data.guild.name, changeSets: state.data.changeSets, publications, activity: state.data.activity });
  const guild = state.guild;
  api('/api/account/entitlements').then(account => { const target = $('#changeCreditStatus'); if (guild === state.guild && screen() === 'activity' && target) { const credit = account.usage.changeSetsPerMonth; target.textContent = `${fmt(credit.used)} مستخدمة من ${fmt(credit.limit)} · المتبقي ${fmt(Math.max(0, credit.limit - credit.used))}. يُحسب التنفيذ الناجح فقط؛ الإلغاء لا يعكس تغييرات طُبقت بالفعل.`; } }).catch(() => { const target = $('#changeCreditStatus'); if (target) target.textContent = 'تعذر تحديث الرصيد الآن. أعد فتح السجل للمحاولة.'; });
}

function safety() {
  const d = state.data; const roles = d.roles || []; const adminRoles = roles.filter(role => (BigInt(role.permissions || '0') & 8n) !== 0n);
  $('#workspace').innerHTML = head('وضوح الصلاحيات، بداية الأمان.', 'افحص بنية الصلاحيات وتحقق من التغييرات قبل تنفيذها.') + connectionNotice() + `<div class="safety-grid">${panel('مراجعة قبل التطبيق', '<div class="panel-body"><span class="badge good">ضمن رحلة التعديل</span><p>إضافة القنوات والرتب وتعديلها تمر بخطة محفوظة وتأكيد منك قبل التنفيذ. تظهر العمليات المكتملة والمتعثرة منفصلة.</p></div>')}${panel('حالة قراءة السيرفر', `<div class="panel-body">${badge(d.connection.readable ? 'القنوات والرتب متاحة' : 'تعذر التحقق', d.connection.readable ? 'good' : 'warn')}<p>نجاح القراءة لا يضمن صلاحية تعديل كل رتبة. يتحقق Discord من الصلاحيات وترتيب رتبة البوت أثناء التنفيذ.</p></div>`)}</div>${panel('رتب تملك صلاحية Administrator', !d.roles ? empty('تعذر قراءة الرتب', 'أكمل التحقق من الاتصال لعرض الصلاحيات.') : adminRoles.length ? `<div class="notice info"><div><b>${fmt(adminRoles.length)} رتب لديها صلاحية واسعة.</b><p>راجع الحاجة لهذه الصلاحية في Discord. لا يتم تعديلها تلقائيًا.</p></div></div><div class="rows">${adminRoles.map(role => `<div class="row"><span class="row-icon">◇</span><div class="row-main"><b data-i18n-preserve>${esc(role.name)}</b><small>${role.managed ? 'رتبة يديرها تطبيق' : 'رتبة في السيرفر'}</small></div>${badge('Administrator', 'warn')}</div>`).join('')}</div>` : empty('لا توجد رتب بهذه الصلاحية', 'هذا فحص للرتب المقروءة فقط، وليس تقييمًا كاملًا لأمان السيرفر.'))}<div class="notice info"><div><b>حماية الرسائل والسبام</b><p>استخدم AutoMod في Discord لإدارة قواعد منع السبام. هذه اللوحة لا تدّعي تشغيل حماية غير مفعلة.</p></div><a class="btn secondary" href="https://discord.com/channels/${encodeURIComponent(state.guild)}" target="_blank" rel="noopener">فتح السيرفر ↗</a></div>`;
}
function settings() {
  const d = state.data;
  $('#workspace').innerHTML = head('إعدادات مساحة مجتمعك.', 'اتصال السيرفر وتفضيلات النشاط، في مكان واحد.') + `<div class="steps"><span class="step done">✓ الحساب مرتبط</span><span class="step ${d.connection.status === 'installed' ? 'done' : ''}">${d.connection.status === 'installed' ? '✓' : '2'} ربط بوت التنفيذ</span><span class="step ${d.connection.readable ? 'done' : ''}">${d.connection.readable ? '✓' : '3'} قراءة السيرفر</span></div><div class="grid-2">${panel('الاتصال بـ Discord', `<div class="panel-body form-grid"><div class="server-title"><span class="server-image" data-i18n-preserve>${esc(d.guild.name.slice(0, 1))}</span><div><h3 data-i18n-preserve>${esc(d.guild.name)}</h3><small>${d.guild.owner ? 'أنت مالك السيرفر' : 'لديك صلاحية الإدارة'}</small></div></div><div class="row"><div class="row-main"><b>حالة الربط</b><small>آخر تحقق: ${date(d.connection.checked_at)}</small></div>${status(d.connection.status)}</div><div class="actions"><button class="btn primary" id="installBot">${d.connection.status === 'installed' ? 'مراجعة ربط البوت ↗' : 'إضافة Diskoko إلى السيرفر ↗'}</button><button class="btn secondary" id="verifyBot">إعادة التحقق</button></div><p class="form-note">بعد العودة من Discord سنعيد التحقق تلقائيًا. لا نطلب صلاحية Administrator.</p><details><summary>تفاصيل السيرفر</summary><p><code>${esc(state.guild)}</code></p><button class="btn text" id="copyGuild">نسخ المعرّف</button></details></div>`)}${panel('خصوصية إحصاءات النشاط', `<div class="panel-body form-grid"><div>${badge(d.preferences.analytics_enabled ? 'جمع النشاط مفعّل' : 'جمع النشاط غير مفعّل', d.preferences.analytics_enabled ? 'good' : 'neutral')}</div><p>يجمع البوت عدد الرسائل وأسماء المشاركين فقط، دون محتوى الرسائل، لمدة 30 يومًا. الإيقاف يمنع جمع أحداث جديدة.</p><button class="btn secondary" id="toggleAnalytics">${d.preferences.analytics_enabled ? 'إيقاف جمع النشاط' : 'تفعيل جمع النشاط'}</button>${action('عرض التحليلات', 'analytics', 'text')}</div>`)}</div>${panel('نسخة من البنية الحالية', '<div class="panel-body"><p>نزّل القنوات والرتب للمراجعة أو التوثيق. الملف لا يحتوي رسائل الأعضاء، ولا يوفّر استعادة تلقائية للسيرفر.</p><div class="actions" style="margin-top:18px"><button class="btn secondary" id="exportStructure">تصدير بنية السيرفر ↓</button></div></div>')}`;
  $('#workspace .grid-2').insertAdjacentHTML('beforebegin', panel('بوت التنفيذ لهذا السيرفر', '<div class="panel-body form-grid"><p>اختر بوت ديسكوكو أو اربط بوتك الخاص ليكون المنفذ الافتراضي لأدوات السيرفر. القوالب الجاهزة تتيح اختيار بوتها عند المراجعة.</p><div id="settingsBotConnection" role="status">جارٍ التحقق من البوت المختار…</div><a href="/ai-bot-guide.html" target="_blank" rel="noopener noreferrer">شرح إنشاء بوتك وربطه ↗</a></div>'));
  void loadSettingsBotConnection();
  $('#installBot').onclick = run(async () => { const result = await api(`/api/guilds/${encodeURIComponent(state.guild)}/install-url`); window.open(result.url, '_blank', 'noopener'); state.awaitingInstall = true; });
  $('#verifyBot').onclick = run(async event => { event.currentTarget.disabled = true; try { await loadGuild(); } finally { $('#verifyBot') && ($('#verifyBot').disabled = false); } });
  $('#copyGuild').onclick = run(async () => { await navigator.clipboard.writeText(state.guild); toast('نُسخ معرّف السيرفر.'); });
  $('#toggleAnalytics').onclick = () => confirmDialog(d.preferences.analytics_enabled ? 'إيقاف جمع النشاط؟' : 'تفعيل جمع النشاط؟', 'يؤثر التغيير في جمع أحداث الرسائل الجديدة. لا يُحفظ محتوى الرسائل، وتبقى الأعداد السابقة حتى نهاية مدة الاحتفاظ البالغة 30 يومًا.', 'تأكيد', async () => { await api(`/api/workspace/${encodeURIComponent(state.guild)}/preferences`, { method: 'PUT', body: JSON.stringify({ analytics_enabled: !d.preferences.analytics_enabled }) }); closeDialog(); await loadGuild(); });
  $('#exportStructure').disabled = !d.connection.readable;
  $('#exportStructure').onclick = () => download('diskoko-server-structure.json', { exported_at: new Date().toISOString(), guild: { id: state.guild, name: d.guild.name }, channels: d.channels, roles: d.roles });
}
function serverExecutorMarkup(bot) {
  const customSelected = Boolean(bot?.selected);
  const retry = bot?.retryAt && new Date(bot.retryAt).getTime() > Date.now() ? ` · المحاولة التالية ${date(bot.retryAt)}` : '';
  return `<div class="ready-executor-options"><label class="ready-executor-option"><input type="radio" name="serverExecutor" value="diskoko" ${customSelected ? '' : 'checked'}><span class="ready-executor-icon" aria-hidden="true"><img src="/assets/diskoko-logo.png" alt=""></span><span class="ready-executor-copy"><strong>بوت ديسكوكو</strong><small>${customSelected ? 'سيُفحص اتصاله عند اختياره' : state.data.bot?.online ? 'متصل وجاهز' : 'غير متصل الآن'}</small></span></label><label class="ready-executor-option"><input type="radio" name="serverExecutor" value="custom" ${customSelected ? 'checked' : ''} ${bot?.online ? '' : 'disabled'}><span class="ready-executor-icon" aria-hidden="true">🤖</span><span class="ready-executor-copy"><strong>بوتك الخاص</strong><small>${bot ? `${esc(bot.name)} · ${bot.online ? 'متصل وجاهز' : `غير متصل${retry}`}` : 'لم يُربط بهذا السيرفر بعد'}</small></span></label></div><p class="ready-executor-foot">اختيار السيرفر الافتراضي لأدوات الموقع. لا يرسل أي تعديل إلى Discord؛ سيُفحص الاتصال والصلاحيات عند التنفيذ.${!bot ? ` ${action('ربط بوتك الخاص', 'settings', 'text')}` : !bot.online ? ` ${action('راجع الربط والاتصال', 'settings', 'text')}` : ''}</p>`;
}
function bindServerExecutor(target, guild) {
  target.querySelectorAll('input[name="serverExecutor"]').forEach(input => { input.onchange = run(async () => {
    target.querySelectorAll('input[name="serverExecutor"]').forEach(option => { option.disabled = true; });
    try {
      await api('/api/ai/bot-connection/selection', { method: 'POST', body: JSON.stringify({ guildId: guild, executor: input.value }) });
      await loadGuild();
      toast(input.value === 'custom' ? 'بوتك الخاص أصبح بوت التنفيذ لهذا السيرفر.' : 'بوت ديسكوكو أصبح بوت التنفيذ لهذا السيرفر.');
    } catch (error) { await loadGuild(); throw error; }
  }); });
}
async function loadServerExecutor(targetId, view) {
  const guild = state.guild, epoch = state.epoch, target = document.getElementById(targetId);
  if (!target) return;
  try {
    const { bot } = await api(`/api/ai/bot-connection?guildId=${encodeURIComponent(guild)}`);
    if (guild !== state.guild || epoch !== state.epoch || screen() !== view || !target.isConnected) return;
    target.innerHTML = serverExecutorMarkup(bot);
    bindServerExecutor(target, guild);
  } catch (error) { if (target.isConnected && guild === state.guild && screen() === view) target.textContent = error.message; }
}
async function loadSettingsBotConnection() {
  const guild = state.guild, epoch = state.epoch, target = $('#settingsBotConnection');
  if (!target) return;
  try {
    const [{ bot }, registry] = await Promise.all([api(`/api/ai/bot-connection?guildId=${encodeURIComponent(guild)}`), api(`/api/ai/bots?guildId=${encodeURIComponent(guild)}`)]);
    if (guild !== state.guild || epoch !== state.epoch || screen() !== 'settings') return;
    target.innerHTML = serverExecutorMarkup(bot) + `<div class="row"><div class="row-main"><b>بوتات هذا السيرفر: ${fmt(registry.bots?.length || 0)}</b><small>رصيد حسابك: ${fmt(registry.quota?.used || 0)} من ${fmt(registry.quota?.limit || 0)} بوتات خاصة · اختر بوت التنفيذ أو أضف بوتات أخرى</small></div><a class="btn secondary" href="/studio?guild=${encodeURIComponent(guild)}#bots">إدارة بوتاتي ←</a></div>`;
    bindServerExecutor(target, guild);
  } catch (error) { if (guild === state.guild && screen() === 'settings') target.textContent = error.message; }
}
async function start() {
  try { state.account = await api('/api/account/overview'); await loadGuild(); }
  catch (error) { state.loading = false; state.error = error; render(); }
}
$('#guildSelect').onchange = event => { if (event.target.value) location.href = url('overview', event.target.value); };
$('#refresh').onclick = run(loadGuild);
$('#menuToggle').onclick = () => { const open = $('#sidebar').classList.toggle('open'); $('#menuToggle').setAttribute('aria-expanded', String(open)); };
document.addEventListener('click', event => { const link = event.target.closest('a[href]'); if (!link) return; const target = new URL(link.href, location.href); if (target.pathname === '/studio' && target.search === location.search) { $('#sidebar').classList.remove('open'); $('#menuToggle').setAttribute('aria-expanded', 'false'); } });
window.addEventListener('hashchange', () => { render(); $('#workspace').focus({ preventScroll: true }); });
window.addEventListener('popstate', () => {
  if (screen() !== 'ready-templates' || !state.readyCatalog) return;
  readySaveDraft();
  const key = new URLSearchParams(location.search).get('template');
  if (!key) { state.readyDraft = null; state.readyKey = null; renderReadyEditor(); return; }
  if (key !== state.readyKey || !state.readyDraft) {
    const template = state.readyCatalog.find(item => item.key === key);
    if (template) readyStart(template, false);
  }
});
window.addEventListener('pagehide', readySaveDraft);
window.addEventListener('focus', () => { if (state.awaitingInstall) { state.awaitingInstall = false; loadGuild(); } });
$('#dialog').addEventListener('cancel', event => { if ($('#applyPlan')?.textContent === 'جارٍ التطبيق…') event.preventDefault(); });
start();


