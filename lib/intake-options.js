import {orderProducts,productPicker} from './order-products.js';
import {normalizeModuleFields} from './module-form-tools.js';

// Undefined settings preserve installed panels; new editors send explicit booleans.
export function intakeOptions(raw={}) {
  const result={};
  for(const key of ['choiceEnabled','detailsEnabled'])if(raw[key]!==undefined){if(typeof raw[key]!=='boolean')throw Error('Invalid intake toggle.');result[key]=raw[key];}
  if(raw.choices!==undefined)result.choices=orderProducts(raw.choices);
  for(const [key,max]of [['choicePrompt',150],['formTitle',45]])if(raw[key]!==undefined){const value=String(raw[key]).trim();if(value.length>max)throw Error('اكتب عنوان القائمة والنموذج ضمن الحد المسموح.');result[key]=value;}
  if(raw.choiceEnabled===true && (!result.choices?.length || !result.choicePrompt))throw Error('اكتب عنوان قائمة الاختيارات وأضف اختيارًا واحدًا على الأقل.');
  if(raw.detailsEnabled===true){if(!String(raw.formTitle || '').trim())throw Error('اكتب عنوان نموذج التفاصيل.');result.formFields=normalizeModuleFields(raw.formFields);}
  return result;
}
export function intakeChoices(config){return config.choiceEnabled===false?[]:config.choiceEnabled===true?orderProducts(config.choices):config.kind==='orders'?orderProducts(config.products):[];}
export function intakePicker(id,config,page=0,prefix='module') {
  const view=productPicker(id,intakeChoices(config),page);
  view.content=`${config.choicePrompt || 'اختر المنتج / Choose a product'} · ${page+1}/${Math.ceil(intakeChoices(config).length/25)}`;
  for(const row of view.components)for(const component of row.components)if(component.custom_id)component.custom_id=component.custom_id.replace('module-product:',prefix+'-product:').replace('module-products-page:',prefix+'-products-page:');
  return view;
}
