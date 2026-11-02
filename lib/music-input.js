export function musicSearchQuery(value){
 const query=String(value || '').trim().replace(/\s+/g,' ');
 if(!query || query.length>200 || /[\x00-\x1f\x7f]/.test(query) || /^[a-z][a-z\d+.-]*:/i.test(query) || /^(?:www\.|\S+\.(?:com|net|org)\/)/i.test(query))return null;
 return `ytsearch:${query}`;
}
export function musicJoinFailure(error){
 const status=Number(error?.status || error?.statusCode)||null;
 const diagnostic={name:typeof error?.name==='string'?error.name.slice(0,50):'UnknownError',status,code:typeof error?.code==='number'?error.code:undefined,hasMessage:typeof error?.message==='string',staleSession:status===404};
 const message=status===404?'انتهت جلسة خادم الموسيقى أو لم تعد موجودة. أعد المحاولة لبدء اتصال جديد؛ المشكلة ليست دليلًا على نقص صلاحيات الروم.':status===429?'خادم الموسيقى قيّد الاتصالات مؤقتًا. انتظر قليلًا قبل إعادة المحاولة.':status===401 || status===403?'خادم الموسيقى رفض اتصال الخدمة. تحتاج الإدارة مراجعة إعدادات خادم الصوت.':'تعذر إنشاء جلسة الصوت على خادم الموسيقى. سُجل نوع الإخفاق للمراجعة؛ لا يعني ذلك أن صلاحياتك ناقصة.';
 return {diagnostic,message};
}
