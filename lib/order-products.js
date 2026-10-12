export function orderProducts(raw){
  if(raw===undefined)return [];
  if(!Array.isArray(raw) || raw.length>100)throw Error('يمكن إضافة حتى 100 منتج. / Up to 100 products.');
  const ids=new Set();
  return raw.map((item,index)=>{const id=String(item.id || 'product_'+(index+1)),name=String(item.name || '').trim(),description=String(item.description || '').trim();
    if(!/^[a-zA-Z0-9_-]{1,32}$/.test(id) || ids.has(id) || !name || name.length>100 || description.length>100)throw Error('راجع اسم المنتج ووصفه ومعرّفه الفريد. / Invalid product.');
    ids.add(id);return{id,name,description};
  });
}
export function productPicker(panelId,products,page=0){
  if(!Number.isInteger(page) || page<0 || page>=Math.ceil(products.length/25))throw Error('صفحة المنتجات غير صالحة.');
  return{content:`اختر المنتج / Choose a product · ${page+1}/${Math.ceil(products.length/25)}`,ephemeral:true,components:[{type:1,components:[{type:3,custom_id:`diskoko:module-product:${panelId}`,min_values:1,max_values:1,options:products.slice(page*25,page*25+25).map(product=>({label:product.name,value:product.id,...(product.description?{description:product.description}:{})}))}]},...(products.length>25?[{type:1,components:[{type:2,style:2,label:'السابق / Previous',custom_id:`diskoko:module-products-page:${panelId}:${page-1}`,disabled:page===0},{type:2,style:2,label:'التالي / Next',custom_id:`diskoko:module-products-page:${panelId}:${page+1}`,disabled:(page+1)*25>=products.length}]}]:[])]};
}
