export function publicError(error, requestId) {
  const candidate = Number(error?.status);
  const status = Number.isInteger(candidate) && candidate >= 400 && candidate < 600 ? candidate : 500;
  const message = status === 500 ? 'حدث خطأ غير متوقع' : status >= 500 && !error?.expose ? 'الخدمة الخارجية غير متاحة مؤقتًا' : error.message;
  const retry=Number(error?.retryAfter);
  return { status, body: { error: message, requestId, ...(Number.isFinite(retry) && retry>=1 && retry<=3600?{retryAfter:Math.ceil(retry)}:{}), ...(error?.code ? { code: error.code } : {}), ...(error?.capacity ? { capacity: error.capacity } : {}) } };
}
