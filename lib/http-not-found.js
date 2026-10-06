const safePath = value => String(value || '/').split('?')[0]
  .replace(/[\u0000-\u001f\u007f]/g, '')
  .replace(/\/[\da-f]{8}-[\da-f-]{27,}(?=\/|$)/gi, '/:id')
  .replace(/\/\d{5,}(?=\/|$)/g, '/:id')
  .slice(0, 180);

export function createNotFoundReporter({ allowedOrigins = new Set(), log = console.warn, now = Date.now, maxPerMinute = 30 } = {}) {
  let windowStart = now();
  const seen = new Set();
  return (req, res, next) => {
    const pathname = safePath(req.path);
    res.once('finish', () => {
      if (res.statusCode !== 404) return;
      if (now() - windowStart >= 60_000) { seen.clear(); windowStart = now(); }
      let from = '';
      try {
        const referer = new URL(req.get('referer') || '');
        if (allowedOrigins.has(referer.origin)) from = safePath(referer.pathname);
      } catch { /* external or absent referrer */ }
      const method = String(req.method || '').slice(0, 10);
      const key = JSON.stringify([method, pathname, from]);
      if (seen.has(key) || seen.size >= maxPerMinute) return;
      seen.add(key);
      log('HTTP route not found', { method, path: pathname, ...(from ? { from } : {}) });
    });
    next();
  };
}
