import crypto from 'node:crypto';

// Discord deduplicates an author's nonce for a few minutes. The durable
// publication_state barrier provides the longer-lived retry boundary.
export function publicationOptions(options, requestId, botId = 'public', page = 0) {
  const nonce = crypto.createHash('sha256').update(`${requestId}:${botId}:${page}`).digest('hex').slice(0, 25);
  const body = options.body;
  if (typeof body === 'string') return { ...options, body: JSON.stringify({ ...JSON.parse(body), nonce, enforce_nonce: true }) };
  if (body instanceof FormData) {
    body.set('payload_json', JSON.stringify({ ...JSON.parse(body.get('payload_json')), nonce, enforce_nonce: true }));
    return options;
  }
  throw new Error('Unsupported approved publication payload');
}

export function editPublicationOptions(options, previous, kind, imagePosition = 'above') {
  const form = options.body instanceof FormData ? options.body : null;
  const payload = JSON.parse(form ? form.get('payload_json') : options.body);
  delete payload.nonce; delete payload.enforce_nonce;
  const files = form ? [...form.entries()].filter(([key]) => /^files\[\d+\]$/.test(key)) : [];
  const safeImage = value => {
    try { const url = new URL(value?.url); return url.protocol === 'https:' && ['cdn.discordapp.com','media.discordapp.net'].includes(url.hostname) ? { url: url.href } : null; } catch { return null; }
  };
  if (kind === 'poll') {
    payload.embeds = (payload.embeds || []).map((embed, i) => {
      const old = previous.embeds?.[i] || {};
      return { ...(safeImage(old.image) ? { image: safeImage(old.image) } : {}), ...(safeImage(old.thumbnail) ? { thumbnail: safeImage(old.thumbnail) } : {}), ...embed };
    });
  } else if (!files.length) {
    const images = (previous.embeds || []).filter(embed => safeImage(embed.image)).map(embed => ({ image: safeImage(embed.image) }));
    const logo = (previous.embeds || []).map(embed => safeImage(embed.thumbnail)).find(Boolean);
    if (imagePosition === 'logo' && (logo || images[0])) payload.embeds[0].thumbnail = logo || images[0].image;
    else if (images.length) payload.embeds = imagePosition === 'below' ? [...payload.embeds, ...images] : [...images, ...payload.embeds];
    else if (logo && payload.embeds[0]) payload.embeds[0].thumbnail = logo;
  }
  const filenames = new Set(files.map(([,file]) => file.name));
  const retained = kind !== 'poll' && files.length ? [] : (previous.attachments || []).filter(file => !filenames.has(file.filename)).map(file => ({ id: file.id }));
  payload.attachments = [...retained, ...files.map(([key,file]) => ({ id: Number(key.match(/\d+/)[0]), filename: file.name }))];
  payload.allowed_mentions = { parse: [] };
  if (form) { form.set('payload_json', JSON.stringify(payload)); return { ...options, method: 'PATCH' }; }
  return { ...options, method: 'PATCH', body: JSON.stringify(payload) };
}
