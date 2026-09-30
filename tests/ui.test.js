import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { account, fixtureResponse, guild, workspace } from './fixtures.js';
import { aiPromptLibrary } from '../ai-library-catalog.js';
import { READY_TEMPLATES } from '../lib/ready-templates.js';
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 5)); };
async function page(hash = 'overview', response = fixtureResponse, file = 'studio.html', script = 'workspace.js', setup = () => {}) {
  const dom = new JSDOM(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), { url: `https://diskoko.test/studio?guild=${guild.id}#${hash}`, runScripts: 'outside-only', pretendToBeVisual: true });
  const requests = [];
  dom.window.fetch = async (url, options = {}) => { requests.push({ url, options }); const body = response(url); return { ok: !body?.error, status: body?.error ? 502 : 200, json: async () => structuredClone(body) }; };
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  setup(dom.window);
  const source = fs.readFileSync(new URL(`../${script}`, import.meta.url), 'utf8');
  dom.window.eval(script === 'workspace.js' ? `const aiPromptLibrary = ${JSON.stringify(aiPromptLibrary)};\n${source.replace("import { aiPromptLibrary } from './ai-library-catalog.js';", '')}` : source); await settle();
  return { dom, requests, doc: dom.window.document };
}
test('voice recognition resumes after a browser pause and stops only when the user asks', async () => {
  const sessions = [];
  class Recognition {
    start() { sessions.push(this); this.onstart?.(); }
    stop() { this.onend?.(); }
  }
  const { dom, doc } = await page('assistant', fixtureResponse, 'studio.html', 'workspace.js', window => {
    window.SpeechRecognition = Recognition;
    Object.defineProperty(window.navigator, 'mediaDevices', { value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }), enumerateDevices: async () => [] } });
  });
  doc.querySelector('#aiVoice').click(); await settle();
  doc.querySelector('#aiVoiceStart').click();
  assert.equal(sessions.length, 1); assert.equal(sessions[0].continuous, true);
  sessions[0].onresult({ results: [[{ transcript: 'مرحبا' }]] });
  sessions[0].onend();
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(sessions.length, 2); assert.equal(doc.querySelector('#aiRecording').hidden, false);
  sessions[1].onresult({ results: [[{ transcript: 'يا جماعة' }]] });
  assert.match(doc.querySelector('#assistantPrompt').value, /مرحبا يا جماعة/);
  doc.querySelector('#aiStopVoice').click();
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(sessions.length, 2); assert.equal(doc.querySelector('#aiRecording').hidden, true);
  dom.window.close();
});
test('deep link opens the requested guild with true live data and one navigation controller', async () => {
  const { dom, doc, requests } = await page('builder');
  assert.match(doc.querySelector('h1').textContent, /القنوات والرتب/); assert.match(doc.body.textContent, /الدردشة/);
  assert.equal(doc.querySelectorAll('.nav-link').length, 12); assert.equal(requests.filter(r => r.url === '/api/account/overview').length, 1); dom.window.close();
});
test('channel and role editor exposes detailed permissions before review', async () => {
  const { dom, doc } = await page('builder');
  doc.querySelector('[data-edit="c2"]').click();
  assert.ok(doc.querySelector('#permissionTarget'));
  assert.ok(doc.querySelector('[data-channel-permission="ViewChannel"]'));
  assert.ok(doc.querySelector('#resourceSlowmode'));
  doc.querySelector('#closeDialog').click();
  doc.querySelector('[data-tab="roles"]').click();
  doc.querySelector('[data-edit="r1"]').click();
  assert.ok(doc.querySelector('[data-role-permission="Administrator"]'));
  assert.ok(doc.querySelector('#resourceHoist'));
  dom.window.close();
});
test('channel editor explains effective permissions and filters temporary tickets', async () => {
  const response = url => {
    const body = fixtureResponse(url);
    if (url !== `/api/workspace/${guild.id}`) return body;
    const copy = structuredClone(body);
    copy.channels.push({ id: 'ticket', name: 'ticket-123', type: 0, parent_id: copy.channels.find(channel => channel.type === 4)?.id || null, position: 8 });
    return copy;
  };
  const { dom, doc } = await page('builder', response);
  assert.equal(doc.querySelector('#channelFilter').value, 'permanent');
  assert.equal(doc.body.textContent.includes('ticket-123'), false);
  doc.querySelector('#channelFilter').value = 'tickets';
  doc.querySelector('#channelFilter').dispatchEvent(new dom.window.Event('change'));
  assert.match(doc.body.textContent, /ticket-123/);
  doc.querySelector('#channelFilter').value = 'all';
  doc.querySelector('#channelFilter').dispatchEvent(new dom.window.Event('change'));
  doc.querySelector('[data-edit="c2"]').click();
  assert.match(doc.querySelector('[data-permission-result="ViewChannel"]').textContent, /مسموح|ممنوع/);
  dom.window.close();
});
test('access preset stages only the selected channel permission changes', async () => {
  const { dom, doc } = await page('builder');
  doc.querySelector('[data-edit="c2"]').click();
  doc.querySelector('[data-access-preset="read"]').click();
  assert.equal(doc.querySelector('[data-channel-permission="ViewChannel"]').value, 'allow');
  assert.equal(doc.querySelector('[data-channel-permission="SendMessages"]').value, 'deny');
  doc.querySelector('#resourceForm').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.match(doc.querySelector('#draftBar').textContent, /عدد التغييرات المتوقع/);
  dom.window.close();
});
test('bulk editor stages a separate reviewed change for each selected channel', async () => {
  const { dom, doc } = await page('builder');
  const checks = [...doc.querySelectorAll('.resource-select')];
  assert.ok(checks.length >= 2);
  checks.slice(0, 2).forEach(check => { check.checked = true; check.dispatchEvent(new dom.window.Event('change')); });
  doc.querySelector('#batchEdit').click();
  doc.querySelector('#batchSlowSet').checked = true;
  doc.querySelector('#batchSlow').value = '15';
  doc.querySelector('#batchForm').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.match(doc.querySelector('#draftBar').textContent, /تغييرات/);
  dom.window.close();
});
test('dragging a channel inside its category stages an order change for review', async () => {
  const { dom, doc } = await page('builder');
  const source = doc.querySelector('[data-edit="c2"]')?.closest('.row');
  const target = doc.querySelector('[data-edit="c3"]')?.closest('.row');
  assert.ok(source && target);
  const transfer = { data: '', setData(_type, value) { this.data = value; }, getData() { return this.data; }, effectAllowed: '', dropEffect: '' };
  source.ondragstart({ dataTransfer: transfer });
  target.ondrop({ dataTransfer: transfer, preventDefault() {} });
  assert.match(doc.querySelector('#draftBar').textContent, /عدد التغييرات المتوقع/);
  dom.window.close();
});
test('access preview explains current channel access and updates by selected role', async () => {
  const { dom, doc } = await page('builder');
  doc.querySelector('[data-tab="access"]').click();
  assert.ok(doc.querySelector('#accessChannel'));
  assert.ok(doc.querySelector('#accessRole'));
  assert.match(doc.querySelector('#accessSummary').textContent, /يمكن رؤية القناة|لا يمكن رؤية القناة/);
  assert.ok(doc.querySelectorAll('#accessMatrix .access-result').length >= 20);
  assert.doesNotMatch(doc.querySelector('#accessMatrix').textContent, /كتم الأعضاء/);
  dom.window.close();
});
test('role appearance only enables server-supported enhancements', async () => {
  const response = url => {
    const body = fixtureResponse(url);
    if (url !== `/api/workspace/${guild.id}`) return body;
    return { ...body, guild: { ...body.guild, features: ['ROLE_ICONS', 'ENHANCED_ROLE_COLORS'] } };
  };
  const { dom, doc } = await page('builder', response);
  doc.querySelector('[data-tab="roles"]').click();
  doc.querySelector('[data-edit="r1"]').click();
  assert.equal(doc.querySelector('#resourceRoleEmoji').disabled, false);
  assert.equal(doc.querySelector('#resourceIconMode').disabled, false);
  assert.match(doc.querySelector('#resourceIconUpload').textContent, /64×64/);
  assert.equal(doc.querySelector('#resourceColorStyle option[value="gradient"]').disabled, false);
  dom.window.close();
});
test('channel draft counts settings changed rather than one channel', async () => {
  const { dom, doc } = await page('builder');
  doc.querySelector('[data-edit="c2"]').click();
  doc.querySelector('#resourceSlowmode').value = '10';
  const send = doc.querySelector('[data-channel-permission="SendMessages"]');
  send.value = 'deny'; send.dispatchEvent(new dom.window.Event('change'));
  doc.querySelector('#resourceForm').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.match(doc.querySelector('#draftBar').textContent, /عدد التغييرات المتوقع: ٢/);
  doc.querySelector('#reviewDraft').click();
  assert.match(doc.querySelector('#dialogContent').textContent, /إرسال الرسائل.*وراثة.*منع/s);
  dom.window.close();
});
test('channel order is shown from one and unchanged order is not staged', async () => {
  const { dom, doc } = await page('builder');
  doc.querySelector('[data-edit="c2"]').click();
  assert.equal(doc.querySelector('#resourcePosition').value, '1');
  doc.querySelector('#resourceSlowmode').value = '10';
  doc.querySelector('#resourceForm').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.match(doc.querySelector('#draftBar').textContent, /عدد التغييرات المتوقع: ١/);
  dom.window.close();
});
test('channel order follows its visible position within the category even when Discord positions repeat', async () => {
  const response = url => {
    const body = fixtureResponse(url);
    if (url !== `/api/workspace/${guild.id}`) return body;
    const copy = structuredClone(body);
    copy.channels.find(channel => channel.id === 'c3').position = 0;
    return copy;
  };
  const { dom, doc } = await page('builder', response);
  doc.querySelector('[data-edit="c3"]').click();
  assert.equal(doc.querySelector('#resourcePosition').value, '2');
  doc.querySelector('[data-channel-permission="SendMessages"]').value = 'deny';
  doc.querySelector('[data-channel-permission="SendMessages"]').dispatchEvent(new dom.window.Event('change'));
  doc.querySelector('#resourceForm').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.match(doc.querySelector('#draftBar').textContent, /عدد التغييرات المتوقع: ١/);
  dom.window.close();
});
test('ready templates open as an independent section with both sources and a Discord preview', async () => {
  const response = url => url === '/api/ready-templates' ? { templates: READY_TEMPLATES } : fixtureResponse(url);
  const { dom, doc } = await page('ready-templates', response, 'studio.html', 'workspace.js', window => { window.structuredClone = structuredClone; window.HTMLElement.prototype.scrollIntoView = () => {}; });
  assert.match(doc.body.textContent, /Server My Arabic/);
  assert.match(doc.body.textContent, /Streamer Community/);
  assert.match(doc.body.textContent, /Diskoko Gaming Arabic/);
  assert.match(doc.body.textContent, /Diskoko Streamer/);
  assert.equal(doc.querySelectorAll('.ready-library-card').length, 9);
  assert.equal(doc.querySelectorAll('.ready-library-card .ready-edition-badge').length, 9);
  const cards = [...doc.querySelectorAll('.ready-library-card')];
  assert.deepEqual(cards.slice(0, 2).map(card => card.querySelector('[data-ready-choose]').dataset.readyChoose), ['diskoko-store-ar', 'diskoko-academy']);
  assert.equal(doc.querySelectorAll('.ready-new-badge').length, 2);
  assert.equal(cards.find(card => card.querySelector('[data-ready-choose="diskoko-store-en"]')).querySelector('.ready-language-badge').textContent, 'English');
  doc.querySelector('[data-ready-filter="streamer"]').click();
  assert.equal(doc.querySelectorAll('.ready-library-card').length, 2);
  doc.querySelector('[data-ready-filter="all"]').click();
  doc.querySelector('[data-ready-filter="store"]').click();
  assert.equal(doc.querySelectorAll('.ready-library-card').length, 2);
  doc.querySelector('[data-ready-choose="diskoko-store-en"]').click();
  doc.querySelector('[data-ready-step="features"]').click();
  assert.match(doc.querySelector('.ready-optional-integrations').textContent, /Payment gateway.*not connected/);
  assert.equal(doc.querySelectorAll('.ready-guide-fields').length, 2);
  const guideTitle = doc.querySelector('[data-ready-field="features.guides.0.title"]');
  guideTitle.value = 'Order steps'; guideTitle.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.match(doc.querySelector('#readyPreview').textContent, /Order steps/);
  doc.querySelector('#readyBack').click();
  doc.querySelector('[data-ready-filter="all"]').click();
  assert.equal(doc.querySelector('.ready-executor-panel'), null);
  doc.querySelector('[data-ready-choose="server-my-arabic"]').click();
  assert.equal(doc.querySelector('.ready-detail-heading .ready-language-badge').textContent, 'Arabic English');
  assert.equal(doc.querySelectorAll('.ready-executor-option').length, 2);
  assert.match(doc.querySelector('.ready-executor-option strong').textContent, /ديسكوكو/);
  assert.match(doc.querySelector('.ready-admin-banner').textContent, /Administrator/);
  assert.equal(doc.querySelector('.ready-executor-option img')?.getAttribute('src'), '/assets/diskoko-logo.png');
  assert.ok(doc.querySelector('#readyPreview .ready-discord'));
  assert.ok(doc.querySelector('input[name="readyMode"][value="replace"]'));
  assert.equal(doc.querySelectorAll('#readyPreview .ready-discord-category').length, 7);
  assert.equal(doc.querySelectorAll('#readyPreview .ready-discord-channel').length, 23);
  assert.match(doc.querySelector('.ready-unit-note').textContent, /٣٩/);
  assert.equal(doc.querySelectorAll('.ready-edition-badge').length, 1);
  assert.ok(doc.querySelector('input[name="readyExecutor"][value="custom"]'));
  assert.ok(doc.querySelector('#readyTicketImage'));
  assert.match(doc.querySelector('#ready-welcome-inline-preview').textContent, /أهلًا بك/);
  assert.match(doc.querySelector('#ready-ticket-inline-preview').textContent, /فتح تذكرة دعم/);
  const welcomeTitle = doc.querySelector('[data-ready-field="features.welcome.title"]');
  welcomeTitle.value = 'أهلًا بالعضو'; welcomeTitle.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.match(doc.querySelector('#ready-welcome-inline-preview').textContent, /أهلًا بالعضو/);
  assert.ok(doc.querySelector('.ready-steps'));
  assert.equal(doc.querySelector('[data-ready-step-pane="identity"]').hidden, false);
  doc.querySelector('[data-ready-step="features"]').click();
  assert.equal(doc.querySelector('[data-ready-step-pane="features"]').hidden, false);
  assert.equal(doc.querySelector('[data-ready-step-pane="structure"]').hidden, true);
  doc.querySelector('#readyBack').click();
  assert.ok(doc.querySelector('.ready-library-grid'));
  doc.querySelector('[data-ready-choose="diskoko-streamer"]').click();
  assert.equal(doc.querySelector('[data-ready-field="categories.1.channels.0.postRoleKey"]').value, 'streamer');
  assert.equal(doc.querySelectorAll('#readyPreview .ready-discord-channel').length, 21);
  doc.querySelector('[data-ready-step="platforms"]').click();
  assert.match(doc.querySelector('[data-ready-step-pane="platforms"]').textContent, /التنبيهات التلقائية: غير مفعلة/);
  doc.querySelector('[data-platform-url="youtube"]').value = 'https://example.com/creator';
  doc.querySelector('[data-platform-add="youtube"]').click();
  assert.equal(doc.querySelectorAll('#readyPreview .ready-discord-channel').length, 21, 'unrelated URLs cannot be published as a platform link');
  doc.querySelector('[data-platform-url="youtube"]').value = 'https://www.youtube.com/@creator';
  doc.querySelector('[data-platform-add="youtube"]').click();
  assert.equal(doc.querySelectorAll('#readyPreview .ready-discord-channel').length, 22);
  assert.match(dom.window.sessionStorage.getItem(`diskoko:template:${account.user.id}:${guild.id}:diskoko-streamer:r2`), /platform-youtube/);
  doc.querySelector('#readyBack').click();
  doc.querySelector('[data-ready-choose="diskoko-streamer"]').click();
  assert.equal(doc.querySelectorAll('#readyPreview .ready-discord-channel').length, 22, 'returning to the template restores its saved draft');
  doc.querySelector('[data-ready-step="install"]').click();
  assert.ok(doc.querySelector('[data-ready-step-pane="install"] .ready-executor-panel'));
  dom.window.close();
});
test('updated template opens its current structure instead of an old saved draft', async () => {
  const response = url => url === '/api/ready-templates' ? { templates: READY_TEMPLATES } : fixtureResponse(url);
  const { dom, doc } = await page('ready-templates', response, 'studio.html', 'workspace.js', window => {
    window.structuredClone = structuredClone;
    window.HTMLElement.prototype.scrollIntoView = () => {};
    window.sessionStorage.setItem(`diskoko:template:${account.user.id}:${guild.id}:streamer-community`, JSON.stringify({
      definition: { name: 'old draft', roles: [{ key: 'old' }], categories: [{ key: 'old', channels: [] }], features: {} },
    }));
  });
  doc.querySelector('[data-ready-choose="streamer-community"]').click();
  assert.match(doc.querySelector('.ready-detail-heading').textContent, /Diskoko Streamer Community/);
  assert.equal(doc.querySelectorAll('#readyPreview .ready-discord-channel').length, 22);
  assert.match(doc.querySelector('.ready-detail-heading .ready-edition-badge').textContent, /01/);
  dom.window.close();
});
test('template features open one compact card at a time and optional modules update the preview and usage', async () => {
  const response = url => url === '/api/ready-templates' ? { templates: READY_TEMPLATES } : fixtureResponse(url);
  const { dom, doc } = await page('ready-templates', response, 'studio.html', 'workspace.js', window => { window.structuredClone = structuredClone; window.HTMLElement.prototype.scrollIntoView = () => {}; });
  doc.querySelector('[data-ready-choose="diskoko-store-ar"]').click();
  doc.querySelector('[data-ready-step="features"]').click();
  const cards = [...doc.querySelectorAll('.ready-feature-card')];
  assert.ok(cards.length >= 10);
  assert.equal(cards.filter(card => card.open).length, 0);
  const module = doc.querySelector('.ready-module-card');
  module.querySelector('summary').click(); await settle();
  assert.equal(module.open, true);
  const enabled = module.querySelector('[data-ready-field$=".enabled"]');
  const before = doc.querySelector('#readyCounts').textContent;
  enabled.checked = true; enabled.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.notEqual(doc.querySelector('#readyCounts').textContent, before);
  assert.match(doc.querySelector('#readyPreview').textContent, /الاقتراحات/);
  doc.querySelector('[data-ready-feature-card="ticket"] summary').click(); await settle();
  assert.equal(module.open, false);
  dom.window.close();
});
test('ready template history offers cancellation with a clear partial-work explanation', async () => {
  const response = url => url === '/api/ready-templates' ? { templates: READY_TEMPLATES }
    : url.endsWith('/ready-templates/runs') ? { runs: [{ id: 'run-1', name: 'Test Template', mode: 'replace', status: 'failed', completed_units: 2, updated_at: new Date().toISOString() }] }
    : url.endsWith('/ready-templates/runs/run-1/cancel') ? { run: { status: 'cancelled', completed_units: 2 }, steps: [] }
    : fixtureResponse(url);
  const { dom, doc, requests } = await page('ready-templates', response);
  assert.ok(doc.querySelector('[data-ready-cancel="run-1"]'));
  doc.querySelector('[data-ready-cancel="run-1"]').click();
  assert.match(doc.querySelector('#dialogContent').textContent, /ستبقى العناصر التي نُفذت/);
  doc.querySelector('#confirmAction').click(); await settle();
  assert.ok(requests.some(item => item.url.endsWith('/ready-templates/runs/run-1/cancel') && item.options.method === 'POST'));
  dom.window.close();
});
test('ready template log routes expose source, event type and destination and save the choice', async () => {
  const response = url => url === '/api/ready-templates' ? { templates: READY_TEMPLATES } : fixtureResponse(url);
  const { dom, doc } = await page('ready-templates', response, 'studio.html', 'workspace.js', window => { window.structuredClone = structuredClone; window.HTMLElement.prototype.scrollIntoView = () => {}; });
  doc.querySelector('[data-ready-choose="diskoko-gaming-1"]').click();
  doc.querySelector('[data-ready-step="features"]').click();
  doc.querySelector('#readyLogMode').value = 'routed';
  doc.querySelector('#readyLogMode').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(doc.querySelectorAll('.ready-log-rule').length, 1);
  assert.match(doc.querySelector('.ready-log-rule').textContent, /القنوات المصدر/);
  assert.match(doc.querySelector('.ready-log-rule').textContent, /أنواع الأحداث/);
  assert.match(doc.querySelector('.ready-log-rule').textContent, /قناة استقبال/);
  const event = doc.querySelector('[data-ready-log-route-event="0:message_delete"]');
  event.checked = false; event.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.doesNotMatch(dom.window.sessionStorage.getItem(`diskoko:template:${account.user.id}:${guild.id}:diskoko-gaming-1:r2`), /"message_delete"/);
  dom.window.close();
});
test('community alerts show actionable paused giveaways and failed schedules', async () => {
  const response = url => url === `/api/workspace/${guild.id}` ? { ...workspace, alerts: [
    { id: 'giveaway', kind: 'giveaway', title: 'توقف إعلان الجيف أوي', detail: 'الرسالة الأصلية غير متاحة', channelId: 'channel', retryable: false },
    { id: 'pending', kind: 'giveaway', title: 'تأخر إعلان الجيف أوي', detail: 'تنتظر إعادة محاولة', channelId: 'channel', stoppable: true },
    { id: '5', kind: 'schedule', title: 'توقفت رسالة مجدولة', detail: 'القناة غير متاحة', target: 'automation' },
  ] } : fixtureResponse(url);
  const { dom, doc } = await page('alerts', response);
  assert.match(doc.body.textContent, /توقف إعلان الجيف أوي/);
  assert.equal(doc.querySelectorAll('[data-alert-dismiss]').length, 3, 'all actionable alerts can be dismissed');
  assert.ok(doc.querySelector('[data-alert-pause="pending"]'));
  assert.ok(doc.querySelector('[data-alert-cancel="5"]'));
  assert.equal(doc.querySelector('[data-alert-retry]'), null, 'missing Discord messages cannot be retried');
  dom.window.close();
});
test('upstream failure renders retry, never empty guild list', async () => {
  const { dom, doc } = await page('overview', url => url.startsWith('/api/workspace/') ? { error: 'Discord unavailable' } : fixtureResponse(url));
  assert.match(doc.body.textContent, /Discord unavailable/); assert.ok(doc.querySelector('#retry')); assert.doesNotMatch(doc.body.textContent, /لا توجد سيرفرات/); dom.window.close();
});
test('adding a resource stages a guild-specific draft without calling mutation API', async () => {
  const { dom, doc, requests } = await page('builder'); doc.querySelector('#newResource').click();
  doc.querySelector('#resourceName').value = 'ترحيب'; doc.querySelector('#resourceForm').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(doc.querySelector('#draftBar').hidden, false); assert.match(dom.window.localStorage.getItem(`diskoko:review:1:${guild.id}`), /ترحيب/);
  assert.equal(requests.filter(req => req.options.method && req.options.method !== 'GET').length, 0); dom.window.close();
});
test('bot workshop separates connected bots from the three panel types', async () => {
  const { dom, doc } = await page('bots');
  assert.ok(doc.querySelector('#botWorkshopConnect'));
  assert.equal(doc.querySelectorAll('[data-create-bot]').length, 0);
  assert.equal(doc.querySelectorAll('[data-bot-feature]').length, 0);
  assert.equal(doc.querySelectorAll('.bot-design-card').length, 3);
  assert.match(doc.body.textContent, /اللوحات التفاعلية/);
  assert.match(doc.body.textContent, /لوحة الألعاب/);
  assert.equal(doc.querySelector('#createYoutubePanel').disabled, true);
  dom.window.close();
  const commandPage = await page('commands'); assert.equal(commandPage.doc.querySelectorAll('.command-check').length, 3); assert.equal(commandPage.doc.querySelector('#botEnabled').checked, true); commandPage.dom.window.close();
  const assistantPage = await page('assistant'); assert.match(assistantPage.doc.body.textContent, /الجهاز المحلي غير متصل/); assert.match(assistantPage.doc.body.textContent, /AI ديسكوكو/); assistantPage.dom.window.close();
});
test('private command builder chooses a bot and previews a link panel', async () => {
  const response = url => url === `/api/ai/bots?guildId=${guild.id}`
    ? { bots: [{ id: 'bot-1', name: 'بوت العميل', label: 'بوت الأفلام', online: true, selected: true }], quota: { used: 1, limit: 10 } }
    : url === `/api/ai/bots/bot-1/commands?guildId=${guild.id}` ? { commands: [], limit: 10 }
      : fixtureResponse(url);
  const { dom, doc } = await page('commands', response);
  assert.match(doc.querySelector('#customCommandBot').textContent, /بوت الأفلام/);
  doc.querySelector('#customCommandKind').value = 'card';
  doc.querySelector('#customCommandKind').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(doc.querySelector('#customCommandTitle').required, true);
  assert.equal(doc.querySelectorAll('[data-command-link-url]').length, 4);
  assert.equal(doc.querySelector('#customCommandExtraLinks').hidden, false);
  dom.window.close();
});
test('bot workshop creates a reusable YouTube panel without a setup-time video', async () => {
  const response = url => url === `/api/ai/bot-connection?guildId=${guild.id}`
    ? { bot: { id: 'bot-1', name: 'بوت السيرفر', online: true, selected: true, memberJoins: true, messageContent: true } }
    : url === `/api/ai/bots?guildId=${guild.id}`
      ? { bots: [{ id: 'bot-1', name: 'بوت السيرفر', label: 'بوت الترحيب', online: true, selected: true, memberJoins: true, messageContent: true }] }
    : fixtureResponse(url);
  const { dom, doc, requests } = await page('bots', response);
  assert.match(doc.querySelector('.bot-workshop-fleet').textContent, /بوت الترحيب/);
  doc.querySelector('#createYoutubePanel').click();
  assert.equal(doc.querySelector('#youtubePanelUrl'), null);
  doc.querySelector('#youtubePanelTitle').value = 'قاعة الأفلام';
  doc.querySelector('#youtubePanelBanner').value = 'https://example.com/banner.png';
  doc.querySelector('#youtubePanelForm').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await settle();
  const sent = requests.find(entry => entry.url === '/api/ai/bots/bot-1/commands' && entry.options.method === 'POST');
  assert.ok(sent);
  const body = JSON.parse(sent.options.body);
  assert.equal(body.responseKind, 'youtube_panel');
  assert.equal(body.panelConfig.title, 'قاعة الأفلام');
  assert.equal(body.panelConfig.bannerUrl, 'https://example.com/banner.png');
  assert.equal(body.links, undefined);
  dom.window.close();
});
test('AI bot card guides connection and sends the token only in the protected connect request', async () => {
  const response = url => url === `/api/ai/bot-connection?guildId=${guild.id}` ? { bot: null }
    : url === '/api/ai/bot-connection' ? { bot: { id: 'bot-1', name: 'بوت السيرفر', online: true } }
      : fixtureResponse(url);
  const { dom, doc, requests } = await page('assistant', response);
  assert.match(doc.querySelector('.ai-bot-connect').textContent, /اربط بوتك الخاص/);
  assert.equal(doc.querySelector('.ai-bot-connect a').getAttribute('href'), '/ai-bot-guide.html');
  doc.querySelector('#aiBotConnect').click();
  doc.querySelector('#aiBotToken').value = 'a'.repeat(60);
  doc.querySelector('#aiBotSave').click(); await settle();
  const sent = requests.find(entry => entry.url === '/api/ai/bot-connection' && entry.options.method === 'POST');
  assert.equal(JSON.parse(sent.options.body).guildId, guild.id);
  assert.equal(JSON.parse(sent.options.body).token, 'a'.repeat(60));
  assert.equal(doc.querySelector('#aiBotToken').value, '');
  assert.match(doc.querySelector('.ai-bot-connected').textContent, /بوت السيرفر/);
  assert.doesNotMatch(doc.body.textContent, /a{60}/);
  dom.window.close();
});

test('server settings direct multi-bot management to the workshop while Diskoko is offline', async () => {
  const response = url => url === `/api/ai/bot-connection?guildId=${guild.id}` ? { bot: null }
    : url === '/api/ai/bot-connection' ? { bot: { id: 'bot-1', name: 'بوت العميل', online: true } }
      : url === `/api/workspace/${guild.id}` ? { ...workspace, bot: { ...workspace.bot, online: false } }
        : fixtureResponse(url);
  const { dom, doc, requests } = await page('settings', response);
  assert.match(doc.body.textContent, /بوت التنفيذ لهذا السيرفر/);
  assert.match(doc.querySelector('#settingsBotConnection').textContent, /بوتات هذا السيرفر/);
  assert.match([...doc.querySelectorAll('#settingsBotConnection a.btn')].map(link => link.getAttribute('href')).join(' '), /#bots/);
  assert.equal(requests.some(entry => entry.options?.method === 'POST'), false);
  dom.window.close();
});

test('channels and roles clearly select the server executor without sending Discord changes', async () => {
  const response = url => url === `/api/ai/bot-connection?guildId=${guild.id}`
    ? { bot: { id: 'bot-1', name: 'بوت التجربة', online: true, selected: false } }
    : url === '/api/ai/bot-connection/selection' ? { executor: 'custom' }
      : fixtureResponse(url);
  const { dom, doc, requests } = await page('builder', response);
  assert.equal(doc.querySelector('#builderBotConnection input[value="diskoko"]').checked, true);
  assert.match(doc.querySelector('#builderBotConnection').textContent, /بوت التجربة/);
  const custom = doc.querySelector('#builderBotConnection input[value="custom"]');
  custom.checked = true;
  custom.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await settle();
  const sent = requests.find(entry => entry.url === '/api/ai/bot-connection/selection');
  assert.deepEqual(JSON.parse(sent.options.body), { guildId: guild.id, executor: 'custom' });
  assert.equal(requests.some(entry => entry.url.includes('/change-sets')), false);
  dom.window.close();
});

test('change history counts applied structure and published giveaway as two completed actions', async () => {
  const response = url => url === `/api/workspace/${guild.id}` ? {
    ...workspace,
    changeSets: [{ id: 5, template_key: 'custom', status: 'succeeded', plan: { name: 'تغييرات AI ديسكوكو' }, updated_at: '2026-09-23T08:00:00Z' }],
    publications: [{ id: 'request', interactive_kind: 'giveaway', proposal: { interactive: { prize: 'اشتراك' } }, interactive_channel_id: 'channel', interactive_message_id: 'message', published_at: '2026-09-23T08:01:00Z' }],
  } : fixtureResponse(url);
  const { dom, doc } = await page('activity', response);
  assert.match(doc.body.textContent, /العمليات المنفذة · ٢/);
  assert.match(doc.body.textContent, /نُشر جيف آواي: اشتراك/);
  assert.match(doc.body.textContent, /تغييرات AI ديسكوكو/);
  dom.window.close();
});
test('community ideas are selectable for follow-up without a publish-the-list button', async () => {
  const conversationId = '11111111-1111-4111-8111-111111111111';
  const response = url => {
    if (url === '/api/ai/status') return { available: true, planEnabled: true };
    if (url.startsWith('/api/ai/conversations?')) return { conversations: [{ id: conversationId, title: 'أفكار نشاط', updated_at: '2026-09-23T00:00:00Z' }] };
    if (url === `/api/ai/conversations/${conversationId}/messages`) return { messages: [{ id: '22222222-2222-4222-8222-222222222222', prompt: 'اقترح 10 أفكار لتنشيط الأعضاء', answer: '1. تحدي صورة الأسبوع\n2. استطلاع نشاط الأسبوع', status: 'completed', proposal: null, can_publish_answer: false, can_select_step: true }] };
    return fixtureResponse(url);
  };
  const { dom, doc } = await page('assistant', response);
  assert.match(doc.querySelector('.bot-hierarchy-notice').textContent, /رتبة.*البوت|Administrator/);
  doc.querySelector('.ai-conversation').click(); await settle();
  assert.equal(doc.querySelectorAll('[data-ai-choice]').length, 2);
  assert.equal(doc.querySelector('[data-ai-publish-answer]'), null);
  doc.querySelector('[data-ai-choice]').click();
  assert.match(doc.querySelector('#assistantPrompt').value, /تحدي صورة الأسبوع/);
  assert.match(doc.querySelector('#assistantPrompt').value, /لا تنشر شرح الفكرة نفسه/);
  dom.window.close();
});
test('an untouched library prompt with brackets can be submitted for an editable review card', async () => {
  const response = url => url === '/api/ai/status' ? { available: true, planEnabled: true }
    : url.startsWith('/api/ai/conversations?') ? { conversations: [] }
      : url === '/api/ai/requests' ? { id: '22222222-2222-4222-8222-222222222222', conversationId: '11111111-1111-4111-8111-111111111111' }
        : fixtureResponse(url);
  const { dom, doc, requests } = await page('assistant', response);
  doc.querySelector(`[data-ai-template="${aiPromptLibrary.findIndex(item => item.title === 'جيف آواي سريع')}"]`).click();
  doc.querySelector('#assistantForm').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await settle();
  const submitted = requests.find(entry => entry.url === '/api/ai/requests');
  assert.ok(submitted);
  const body = JSON.parse(submitted.options.body);
  assert.match(body.prompt, /\[القناة\]/);
  assert.equal(body.libraryTitle, 'جيف آواي سريع');
  assert.equal(body.libraryCategory, 'الجيف آواي');
  assert.equal(body.libraryMode, 'execute');
  dom.window.close();
});
test('AI module cards open their own setup and the library can expand', async () => {
  const { dom, doc } = await page('assistant', fixtureResponse);
  const index = aiPromptLibrary.findIndex(item => item.moduleKind === 'orders');
  doc.querySelector(`[data-ai-template="${index}"]`).click();
  assert.equal(doc.querySelector('#dialogContent').textContent.includes('طلبات المتجر'), false);
  assert.match(doc.querySelector('#assistantPrompt').value, /طلب منتج/);
  assert.match(doc.querySelector('#aiTemplateDraft').textContent, /أرسل الطلب أولًا/);
  doc.querySelector('#aiNew').click();
  doc.querySelector('#aiLibraryExpand').click();
  assert.equal(doc.querySelector('#aiLibraryExpand').getAttribute('aria-expanded'), 'true');
  assert.ok(doc.querySelector('.ai-chat-layout').classList.contains('ai-library-expanded'));
  dom.window.close();
});
test('completed AI module reply opens its specific editor only after the request was sent', async () => {
  const id = '22222222-2222-4222-8222-222222222222';
  const conversation = '11111111-1111-4111-8111-111111111111';
  const response = url => url === '/api/ai/status' ? { available: true, planEnabled: true }
    : url.startsWith('/api/ai/conversations?') ? { conversations: [{ id: conversation, title: 'مهام الفريق', updated_at: '2026-09-22T00:00:00Z' }] }
      : url === `/api/ai/conversations/${conversation}/messages` ? { messages: [{ id, prompt: 'أريد مهام فريق الإدارة', answer: 'جهزت الميزة. افتح الإعدادات.', status: 'completed', library_mode: 'module', library_category: 'مميزات السيرفر', library_title: 'مهام فريق الإدارة' }] }
        : fixtureResponse(url);
  const { dom, doc } = await page('assistant', response);
  doc.querySelector('.ai-conversation').click(); await settle();
  assert.ok(doc.querySelector('[data-ai-module]'));
  assert.equal(doc.querySelector('#moduleTitle'), null);
  doc.querySelector('[data-ai-module]').click();
  assert.match(doc.querySelector('#dialogContent').textContent, /مهام فريق الإدارة/);
  assert.equal(doc.querySelector('#moduleSubjectLabel').value, 'عنوان مهمة الفريق');
  dom.window.close();
});
test('AI chat exposes reviewed Discord actions, image attachment and voice transcription control', async () => {
  const conversationId = '11111111-1111-4111-8111-111111111111';
  const response = url => {
    if (url === '/api/ai/status') return { available: true, planEnabled: true };
    if (url.startsWith('/api/ai/conversations?')) return { conversations: [{ id: conversationId, title: 'رسالة ترحيب', updated_at: '2026-09-22T00:00:00Z' }] };
    if (url === `/api/ai/conversations/${conversationId}/messages`) return { messages: [{ id: '22222222-2222-4222-8222-222222222222', prompt: 'أرسل ترحيبًا', answer: 'جهزت الرسالة للمراجعة.', status: 'completed', proposal: { operations: [{ resource_type: 'role', name: 'عضو جديد', action: 'create' }], message: { channel: 'الدردشة', content: 'أهلًا بالجميع!' }, interactive: { kind: 'giveaway', prize: 'اشتراك', channel: 'الدردشة', durationMinutes: 60, winnerCount: 1 } } }] };
    return fixtureResponse(url);
  };
  const { dom, doc } = await page('assistant', response);
  doc.querySelector('.ai-conversation').click(); await settle();
  assert.ok(doc.querySelector('[data-ai-delete]'));
  assert.equal(doc.querySelectorAll('.ai-library-item').length, aiPromptLibrary.length);
  assert.equal(doc.querySelectorAll('.ai-library-item').length, doc.querySelectorAll('.ai-library-item span').length);
  assert.ok(doc.querySelector('#aiVoice'));
  assert.equal(doc.querySelector('[data-ai-plan]'), null);
  doc.querySelector('[data-ai-message]').click();
  assert.ok(doc.querySelector('#aiMessageImage'));
  assert.ok(doc.querySelector('#aiMessageImageStyle'));
  assert.ok(doc.querySelector('#aiMessageContent + .ai-emoji-trigger'));
  assert.ok(doc.querySelector('#aiMessageImageLogoX'));
  assert.ok(doc.querySelector('#aiMessageImageLogoY'));
  assert.equal(doc.querySelector('#aiMessageChannel').value, 'c2');
  assert.equal(doc.querySelector('#aiMessageSend').disabled, true);
  doc.querySelector('#aiMessageCancel').click();
  doc.querySelector('[data-ai-interactive]').click();
  assert.equal(doc.querySelector('#aiInteractiveChannel').value, 'c2');
  assert.ok(doc.querySelector('#aiPrize + .ai-emoji-trigger'));
  assert.match(doc.querySelector('.ai-discord-preview').textContent, /اشتراك/);
  assert.match(doc.querySelector('.ai-discord-server-channels').textContent, new RegExp(guild.name));
  assert.ok(doc.querySelector('.ai-discord-members'));
  doc.querySelector('#aiInteractiveImageStyle').value = 'design';
  doc.querySelector('#aiInteractiveImageStyle').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(doc.querySelector('#aiInteractiveImageDesign').hidden, false);
  doc.querySelector('#aiInteractiveImageLogoX').value = '30';
  doc.querySelector('#aiInteractiveImageLogoX').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  doc.querySelector('#aiInteractiveImageLogoY').value = '70';
  doc.querySelector('#aiInteractiveImageLogoY').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(doc.querySelector('#aiInteractiveImageLogoXValue').textContent, '30%');
  assert.equal(doc.querySelector('#aiInteractiveImageLogoYValue').textContent, '70%');
  dom.window.URL.createObjectURL = () => 'blob:design-preview';
  dom.window.URL.revokeObjectURL = () => {};
  Object.defineProperty(doc.querySelector('#aiInteractiveImage'), 'files', { value: [new dom.window.File(['design'], 'design.png', { type: 'image/png' })] });
  Object.defineProperty(doc.querySelector('#aiInteractiveImageLogo'), 'files', { value: [new dom.window.File(['logo'], 'logo.png', { type: 'image/png' })] });
  doc.querySelector('#aiInteractiveImage').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(doc.querySelector('.ai-card-logo-overlay').style.left, '30%');
  assert.equal(doc.querySelector('.ai-card-logo-overlay').style.top, '70%');
  doc.querySelector('#aiPrize').value = 'جائزة جديدة';
  doc.querySelector('#aiPrize').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.match(doc.querySelector('#aiPreviewDescription').textContent, /جائزة جديدة/);
  doc.querySelector('#aiGiveawayTitle').value = 'عنوان جديد';
  doc.querySelector('#aiGiveawayTitle').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.match(doc.querySelector('#aiPreviewTitle').textContent, /عنوان جديد/);
  assert.equal(doc.querySelector('#aiInteractiveLaunch').disabled, true);
  doc.querySelector('#aiInteractiveCancel').click();
  doc.querySelector(`[data-ai-template="${aiPromptLibrary.findIndex(item => item.title === 'جيف آواي سريع')}"]`).click();
  assert.match(doc.querySelector('#assistantPrompt').value, /جيف آواي/);
  assert.equal(doc.querySelector('#aiTemplateDraft').hidden, false);
  assert.match(doc.querySelector('#aiNotice').textContent, /مسودة جديدة/);
  dom.window.close();
});
test('retired staff template has no structure action in AI chat', async () => {
  const conversationId = '11111111-1111-4111-8111-111111111111';
  const response = url => {
    if (url === '/api/ai/status') return { available: true, planEnabled: true };
    if (url.startsWith('/api/ai/conversations?')) return { conversations: [{ id: conversationId, title: 'فريق خاص', updated_at: '2026-09-23T00:00:00Z' }] };
    if (url === `/api/ai/conversations/${conversationId}/messages`) return { messages: [{ id: '22222222-2222-4222-8222-222222222222', prompt: 'قسم فريق خاص', answer: 'هذا القالب من نسخة قديمة وأُزيل من المكتبة.', status: 'completed', library_mode: 'execute', library_title: 'قسم فريق خاص', library_category: 'بناء السيرفر', proposal: null }] };
    return fixtureResponse(url);
  };
  const { dom, doc } = await page('assistant', response);
  doc.querySelector('.ai-conversation').click(); await settle();
  assert.equal(doc.querySelector('[data-ai-structure]'), null);
  assert.match(doc.querySelector('#aiMessages').textContent, /أُزيل من المكتبة/);
  dom.window.close();
});
test('poll, event and welcome open distinct live review cards', async () => {
  const conversationId = '11111111-1111-4111-8111-111111111111';
  for (const kind of ['poll', 'event', 'welcome']) {
    const task = aiPromptLibrary.find(item => item.kind === kind);
    const interactive = kind === 'poll' ? { kind, channel: 'general', question: 'أي صورة تفضل؟', options: ['الأولى', 'الثانية'] } : { kind, channel: 'general', title: 'بطاقة مميزة', description: 'مرحبًا {member}' };
    const response = url => {
      if (url === '/api/ai/status') return { available: true, planEnabled: true };
      if (url.startsWith('/api/ai/conversations?')) return { conversations: [{ id: conversationId, title: task.title, updated_at: '2026-09-23T00:00:00Z' }] };
      if (url === `/api/ai/conversations/${conversationId}/messages`) return { messages: [{ id: '22222222-2222-4222-8222-222222222222', prompt: task.prompt, answer: 'بطاقة مراجعة', status: 'completed', library_mode: 'execute', library_title: task.title, library_category: task.category, proposal: { interactive, draft: true } }] };
      return fixtureResponse(url);
    };
    const { dom, doc } = await page('assistant', response);
    doc.querySelector('.ai-conversation').click(); await settle();
    doc.querySelector('[data-ai-interactive]').click();
    assert.ok(doc.querySelector('#aiSpecialColor'));
    assert.ok(doc.querySelector('#aiSpecialTitle + .ai-emoji-trigger'));
    assert.ok(doc.querySelector('#aiSpecialDescription + .ai-emoji-trigger'));
    assert.ok(doc.querySelector('.ai-discord-members'));
    doc.querySelector('#aiSpecialColor').value = '#123456';
    doc.querySelector('#aiSpecialColor').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    assert.equal(doc.querySelector('#aiSpecialPreviewCard').style.borderColor, 'rgb(18, 52, 86)');
    if (kind === 'poll') {
      doc.querySelector('#aiAddPollOption').click();
      assert.equal(doc.querySelectorAll('[data-poll-text]').length, 3);
      assert.ok(doc.querySelector('#aiQuestionImage'));
      assert.ok(doc.querySelector('#aiQuestionImageStyle'));
      assert.ok(doc.querySelector('#aiQuestionImageLogoX'));
      assert.ok(doc.querySelector('#aiQuestionImageLogoY'));
    } else if (kind === 'event') {
      assert.ok(doc.querySelector('#aiEventSignup'));
      assert.ok(doc.querySelector('#aiEventButton'));
      assert.ok(doc.querySelector('#aiSpecialImageStyle'));
      assert.ok(doc.querySelector('#aiSpecialImageLogoX'));
      assert.ok(doc.querySelector('#aiSpecialImageLogoY'));
    } else {
      assert.match(doc.querySelector('#aiSpecialPreviewBody').textContent, /@عضو جديد/);
      assert.ok(doc.querySelector('#aiWelcomeAvatarPosition'));
      doc.querySelector('#aiWelcomeAvatarPosition').value = 'top';
      doc.querySelector('#aiWelcomeAvatarPosition').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      assert.equal(doc.querySelector('#aiSpecialPreviewCard').dataset.avatarPosition, 'top');
      dom.window.URL.createObjectURL = () => 'blob:welcome-design';
      dom.window.URL.revokeObjectURL = () => {};
      Object.defineProperty(doc.querySelector('#aiSpecialImage'), 'files', { value: [new dom.window.File(['design'], 'design.png', { type: 'image/png' })] });
      doc.querySelector('#aiWelcomeComposite').checked = true;
      doc.querySelector('#aiWelcomeComposite').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      assert.equal(doc.querySelector('#aiWelcomeAvatarPosition').value, 'center');
      assert.equal(doc.querySelector('#aiWelcomeCompositeControls').hidden, false);
      assert.ok(doc.querySelector('#aiWelcomeServerLogo'));
      Object.defineProperty(doc.querySelector('#aiWelcomeServerLogo'), 'files', { value: [new dom.window.File(['logo'], 'logo.png', { type: 'image/png' })] });
      doc.querySelector('#aiWelcomeServerLogoX').value = '35';
      doc.querySelector('#aiWelcomeServerLogoX').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      doc.querySelector('#aiWelcomeServerLogoY').value = '65';
      doc.querySelector('#aiWelcomeServerLogoY').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      assert.match(doc.querySelector('.ai-welcome-server-logo').getAttribute('style'), /left:35%;top:65%/);
      assert.equal(doc.querySelector('.ai-welcome-image-composite img').getAttribute('src'), 'blob:welcome-design');
      doc.querySelector('#aiWelcomeAvatarPosition').value = 'left';
      doc.querySelector('#aiWelcomeAvatarPosition').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      assert.match(doc.querySelector('.ai-welcome-image-avatar').getAttribute('style'), /left:15\.416/);
    }
    dom.window.close();
  }
});
test('GIF is selectable throughout library reviews and welcome permits avatar compositing', async () => {
  const conversationId = '11111111-1111-4111-8111-111111111111';
  const task = aiPromptLibrary.find(item => item.kind === 'welcome');
  const response = url => {
    if (url === '/api/ai/status') return { available: true, planEnabled: true };
    if (url.startsWith('/api/ai/conversations?')) return { conversations: [{ id: conversationId, title: task.title, updated_at: '2026-09-23T00:00:00Z' }] };
    if (url === `/api/ai/conversations/${conversationId}/messages`) return { messages: [{ id: '22222222-2222-4222-8222-222222222222', prompt: task.prompt, answer: 'بطاقة مراجعة', status: 'completed', library_mode: 'execute', library_title: task.title, library_category: task.category, proposal: { interactive: { kind: 'welcome', channel: 'general', title: 'ترحيب', description: 'مرحبًا {member}' }, draft: true } }] };
    return fixtureResponse(url);
  };
  const { dom, doc } = await page('assistant', response);
  assert.match(doc.querySelector('#aiFile').accept, /image\/gif/);
  doc.querySelector('.ai-conversation').click(); await settle();
  doc.querySelector('[data-ai-interactive]').click();
  assert.match(doc.querySelector('#aiSpecialImage').accept, /image\/gif/);
  dom.window.URL.createObjectURL = () => 'blob:welcome-gif';
  dom.window.URL.revokeObjectURL = () => {};
  Object.defineProperty(doc.querySelector('#aiSpecialImage'), 'files', { value: [new dom.window.File(['GIF89a\0\0'], 'welcome.gif', { type: 'image/gif' })] });
  doc.querySelector('#aiWelcomeComposite').checked = true;
  doc.querySelector('#aiSpecialImage').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(doc.querySelector('#aiWelcomeComposite').checked, true);
  assert.equal(doc.querySelector('#aiWelcomeComposite').disabled, false);
  assert.equal(doc.querySelector('#aiSpecialPreviewImage img').getAttribute('src'), 'blob:welcome-gif');
  assert.equal(doc.querySelector('#aiWelcomePreviewAvatar').hidden, true);
  assert.equal(doc.querySelector('#aiWelcomeCompositeControls').hidden, false);
  dom.window.close();
});
test('rules review previews all three layouts before Discord publication', async () => {
  const conversationId = '11111111-1111-4111-8111-111111111111';
  const task = aiPromptLibrary.find(item => item.kind === 'rules');
  const response = url => {
    if (url === '/api/ai/status') return { available: true, planEnabled: true };
    if (url.startsWith('/api/ai/conversations?')) return { conversations: [{ id: conversationId, title: task.title, updated_at: '2026-09-24T00:00:00Z' }] };
    if (url === `/api/ai/conversations/${conversationId}/messages`) return { messages: [{ id: '22222222-2222-4222-8222-222222222222', prompt: task.prompt, answer: 'بطاقة مراجعة', status: 'completed', library_mode: 'execute', library_title: task.title, library_category: task.category, proposal: { interactive: { kind: 'rules', title: 'القوانين', description: 'اقرأ قبل المشاركة', rules: ['احترم الآخرين', 'تجنب الإزعاج'], style: 'single' }, draft: true } }] };
    return fixtureResponse(url);
  };
  const { dom, doc } = await page('assistant', response);
  doc.querySelector('.ai-conversation').click(); await settle();
  doc.querySelector('[data-ai-interactive]').click();
  assert.match(doc.querySelector('#aiSpecialPreviewBody').textContent, /احترم الآخرين/);
  assert.doesNotMatch(doc.querySelector('#aiSpecialPreviewBody').textContent, /القانون 1/);
  assert.match(doc.querySelector('#aiSpecialImage').accept, /image\/gif/);
  const style = doc.querySelector('#aiRulesStyle');
  style.value = 'sections'; style.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(doc.querySelectorAll('.ai-rules-field').length, 2);
  const firstTitle = doc.querySelector('[data-rule-title="0"]');
  const firstBody = doc.querySelector('[data-rule-body="0"]');
  firstTitle.value = 'الاحترام'; firstTitle.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  firstBody.value = 'احترم الآخرين\nحتى عند الاختلاف'; firstBody.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(doc.querySelectorAll('[data-rule-body]').length, 2);
  assert.match(doc.querySelector('.ai-rules-field').textContent, /حتى عند الاختلاف/);
  doc.querySelector('#aiRulesAdd').click();
  assert.equal(doc.querySelectorAll('[data-rule-body]').length, 3);
  style.value = 'cards'; style.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(doc.querySelectorAll('.ai-rules-separate-card').length, 2);
  assert.match(doc.querySelector('.ai-rules-separate-card').textContent, /الاحترام/);
  assert.equal(doc.querySelector('#aiSpecialPreviewButton').hidden, true);
  dom.window.close();
});
test('channel control library opens a channel-specific permission review', async () => {
  const conversationId = '11111111-1111-4111-8111-111111111111';
  const task = aiPromptLibrary.find(item => item.kind === 'channel_control');
  const response = url => {
    if (url === '/api/ai/status') return { available: true, planEnabled: true };
    if (url.startsWith('/api/ai/conversations?')) return { conversations: [{ id: conversationId, title: task.title, updated_at: '2026-09-24T00:00:00Z' }] };
    if (url === `/api/ai/conversations/${conversationId}/messages`) return { messages: [{ id: '22222222-2222-4222-8222-222222222222', prompt: task.prompt, answer: 'مراجعة القناة', status: 'completed', library_mode: 'execute', library_title: task.title, library_category: task.category, proposal: { interactive: { kind: 'channel_control', channel: 'general', mode: 'locked', roleIds: [] }, draft: true } }] };
    return fixtureResponse(url);
  };
  const { dom, doc } = await page('assistant', response);
  doc.querySelector('.ai-conversation').click(); await settle();
  doc.querySelector('[data-ai-interactive]').click();
  assert.match(doc.querySelector('#dialog').textContent, /تحكم بالقناة/);
  assert.ok(doc.querySelector('#aiControlChannel'));
  assert.equal(doc.querySelector('#aiControlLaunch').disabled, true);
  doc.querySelector('#aiControlMode').value = 'locked';
  doc.querySelector('#aiControlMode').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.match(doc.querySelector('#aiControlPreview').textContent, /يُمنع الأعضاء من الكتابة/);
  dom.window.close();
});
test('native Discord event opens location-aware editor with live preview', async () => {
  const conversationId = '11111111-1111-4111-8111-111111111111';
  const task = aiPromptLibrary.find(item => item.kind === 'scheduled_event');
  const response = url => {
    if (url === `/api/workspace/${guild.id}`) return { ...workspace, channels: [...workspace.channels, { id: '123456789012345678', name: 'لقاء المجتمع', type: 2 }], emojis: [{ id: '123456789012345678', name: 'party', animated: false }] };
    if (url === '/api/ai/status') return { available: true, planEnabled: true };
    if (url.startsWith('/api/ai/conversations?')) return { conversations: [{ id: conversationId, title: task.title, updated_at: '2026-09-24T00:00:00Z' }] };
    if (url === `/api/ai/conversations/${conversationId}/messages`) return { messages: [{ id: '22222222-2222-4222-8222-222222222222', prompt: task.prompt, answer: 'بطاقة مراجعة', status: 'completed', library_mode: 'execute', library_title: task.title, library_category: task.category, proposal: { interactive: { kind: 'scheduled_event', title: '', description: '' }, draft: true } }] };
    return fixtureResponse(url);
  };
  const { dom, doc } = await page('assistant', response);
  doc.querySelector('.ai-conversation').click(); await settle();
  doc.querySelector('[data-ai-interactive]').click();
  assert.match(doc.querySelector('#dialog').textContent, /حدث Discord أصلي/);
  assert.ok(doc.querySelector('#aiNativeChannel').textContent.includes('لقاء المجتمع'));
  assert.equal(doc.querySelector('#aiNativeLocationWrap').hidden, true);
  doc.querySelector('#aiNativeType').value = 'elsewhere';
  doc.querySelector('#aiNativeType').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(doc.querySelector('#aiNativeLocationWrap').hidden, false);
  assert.equal(doc.querySelector('#aiNativeChannelWrap').hidden, true);
  doc.querySelector('#aiNativeTitle').value = 'لقاء الجمعة';
  doc.querySelector('#aiNativeTitle').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.match(doc.querySelector('#aiNativePreviewTitle').textContent, /لقاء الجمعة/);
  assert.ok(doc.querySelector('#aiNativeTitle + .ai-emoji-trigger'));
  doc.querySelector('#aiNativeTitle').setSelectionRange(doc.querySelector('#aiNativeTitle').value.length, doc.querySelector('#aiNativeTitle').value.length);
  doc.querySelector('#aiNativeTitle + .ai-emoji-trigger').click();
  doc.querySelector('[data-emoji-tab="server"]').click();
  doc.querySelector('[data-emoji-value="<:party:123456789012345678>"]').click();
  assert.match(doc.querySelector('#aiNativeTitle').value, /<:party:123456789012345678>/);
  assert.match(doc.querySelector('#aiNativePreviewTitle').innerHTML, /cdn\.discordapp\.com\/emojis\/123456789012345678/);
  assert.equal(doc.querySelector('#aiNativeCreate').disabled, true);
  dom.window.close();
});
test('analytics opt-in is separate from viewing analytics', async () => {
  const { dom, doc, requests } = await page('analytics'); assert.ok(doc.querySelector('#enableAnalytics')); assert.match(doc.body.textContent, /دون تخزين محتوى الرسائل/); assert.equal(requests.filter(req => req.options.method === 'PUT').length, 0); dom.window.close();
});
test('hash navigation changes active section without losing guild context', async () => {
  const { dom, doc } = await page(); dom.window.location.hash = 'activity'; await settle(); assert.match(doc.querySelector('h1').textContent, /كل تغيير/); assert.equal(doc.querySelector('#guildSelect').value, guild.id); dom.window.close();
});
test('unreadable guild does not enable editing', async () => {
  const { dom, doc } = await page('builder', url => url === `/api/workspace/${guild.id}` ? { ...workspace, channels: null, roles: null, connection: { status: 'unavailable', readable: false } } : fixtureResponse(url));
  assert.equal(doc.querySelector('#newResource'), null); assert.match(doc.body.textContent, /ننتظر اكتمال الاتصال/); dom.window.close();
});
test('account offers one direct primary route per guild', async () => {
  const { dom, doc } = await page('servers', fixtureResponse, 'account.html', 'account.js');
  assert.equal(doc.querySelectorAll('.server-card a.btn.primary').length, 2);
  assert.equal(doc.querySelectorAll('.server-card button').length, 2);
  assert.match(doc.querySelector('.server-card a').href, /studio\?guild=.*#overview/);
  assert.match(doc.body.textContent, /ربط بوت ديسكوكو/);
  assert.match(doc.body.textContent, /إدارة البوتات الخاصة/);
  dom.window.close();
});
test('subscription page shows four plans, annual savings and real usage', async () => {
  const { dom, doc } = await page('subscription', fixtureResponse, 'account.html', 'account.js');
  assert.equal(doc.querySelectorAll('.billing-plan').length, 4);
  assert.match(doc.body.textContent, /التغييرات المنفذة/);
  assert.ok(doc.body.textContent.includes((15000).toLocaleString('ar-SA')));
  doc.querySelector('[data-interval="annual"]').click();
  assert.ok(doc.body.textContent.includes((2990).toLocaleString('ar-SA')));
  assert.match(doc.body.textContent, /شهران مجانًا/);
  dom.window.close();
});
test('projects page exposes create, bind, rename, duplicate and archive actions without prompts', async () => {
  const { dom, doc } = await page('projects', fixtureResponse, 'account.html', 'account.js');
  assert.match(doc.body.textContent, /مشروع المجتمع/);
  assert.ok(doc.querySelector('#createProject'));
  assert.ok(doc.querySelector('.bind-project'));
  assert.ok(doc.querySelector('.save-project'));
  assert.ok(doc.querySelector('.duplicate-project'));
  assert.ok(doc.querySelector('.archive-project'));
  dom.window.close();
});
test('admin dashboard renders all current plan totals without a missing element crash', async () => {
  const dom = new JSDOM(fs.readFileSync(new URL('../admin-console.html', import.meta.url), 'utf8'), { url: 'https://diskoko.test/admin.html', runScripts: 'outside-only', pretendToBeVisual: true });
  dom.window.alert = () => assert.fail('admin dashboard raised an alert');
  dom.window.fetch = async url => ({ ok: true, json: async () => url === '/api/me' ? { user: { isAdmin: true, username: 'owner', displayName: 'Owner' } } : url === '/api/admin/stats' ? { stats: { users: 4, active: 4, free: 1, starter: 1, growth: 1, business: 1, projects: 2, active_subscriptions: 3, revenue_month: 0, connected_servers: 2, active_bots: 2 } } : String(url).startsWith('/api/admin/users?') ? { users: [], pagination: { page: 1, pages: 1, total: 0 } } : url === '/api/admin/finance' ? { invoices: [], upgradeRequests: [] } : url === '/api/admin/coupons' ? { coupons: [] } : url === '/api/admin/reports' ? { reports: [] } : { token: 'test' } });
  dom.window.eval(fs.readFileSync(new URL('../admin-console.20260921.js', import.meta.url), 'utf8')); await settle();
  assert.match(dom.window.document.querySelector('#content').textContent, /إجمالي المستخدمين/);
  assert.match(dom.window.document.querySelector('#content').textContent, /اشتراكات نشطة/);
  assert.equal(dom.window.document.querySelectorAll('.admin-kpis .metric').length, 8);
  dom.window.close();
});
test('admin users search and pagination query the server', async () => {
  const dom = new JSDOM(fs.readFileSync(new URL('../admin-console.html', import.meta.url), 'utf8'), { url: 'https://diskoko.test/admin', runScripts: 'outside-only', pretendToBeVisual: true });
  const urls = [];
  dom.window.fetch = async url => {
    urls.push(String(url));
    const page = new URL(String(url), 'https://diskoko.test').searchParams.get('page');
    const body = String(url).startsWith('/api/admin/users?') ? { users: [{ id: page === '2' ? 2 : 1, username: page === '2' ? 'second' : 'first', plan: 'free', status: 'active', serverCount: 0, botCount: 0 }], pagination: { page: Number(page), pages: 2, total: 51 } }
      : url === '/api/me' ? { user: { isAdmin: true, username: 'owner' } }
      : url === '/api/admin/stats' ? { stats: { users: 51 } }
      : url === '/api/admin/finance' ? { invoices: [], upgradeRequests: [] }
      : url === '/api/admin/coupons' ? { coupons: [] }
      : url === '/api/admin/reports' ? { reports: [] } : { token: 'test' };
    return { ok: true, json: async () => body };
  };
  dom.window.eval(fs.readFileSync(new URL('../admin-console.20260921.js', import.meta.url), 'utf8'));
  await settle();
  dom.window.document.querySelector('[data-view="users"]').click();
  assert.match(dom.window.document.querySelector('#userTable').textContent, /first/);
  dom.window.document.querySelector('.admin-page[data-page="2"]').click();
  await settle();
  assert.match(dom.window.document.querySelector('#userTable').textContent, /second/);
  assert.ok(urls.some(url => url.includes('page=2')));
  dom.window.close();
});
test('admin dashboard remains usable when one section fails to load', async () => {
  const dom = new JSDOM(fs.readFileSync(new URL('../admin-console.html', import.meta.url), 'utf8'), { url: 'https://diskoko.test/admin', runScripts: 'outside-only', pretendToBeVisual: true });
  dom.window.fetch = async url => {
    if (url === '/api/admin/reports') throw new Error('temporary database failure');
    const body = url === '/api/me' ? { user: { isAdmin: true, username: 'owner' } }
      : url === '/api/admin/stats' ? { stats: { users: 2, active: 2, free: 2 } }
      : String(url).startsWith('/api/admin/users?') ? { users: [], pagination: { page: 1, pages: 1, total: 0 } }
      : url === '/api/admin/finance' ? { invoices: [], upgradeRequests: [] }
      : url === '/api/admin/coupons' ? { coupons: [] } : {};
    return { ok: true, json: async () => body };
  };
  dom.window.eval(fs.readFileSync(new URL('../admin-console.20260921.js', import.meta.url), 'utf8'));
  await settle();
  assert.match(dom.window.document.querySelector('#content').textContent, /إجمالي المستخدمين/);
  assert.match(dom.window.document.querySelector('#adminError').textContent, /تعذر تحميل بعض بيانات الإدارة/);
  dom.window.close();
});
test('admin audit view shows the actor, action and request ID', async () => {
  const dom = new JSDOM(fs.readFileSync(new URL('../admin-console.html', import.meta.url), 'utf8'), { url: 'https://diskoko.test/admin', runScripts: 'outside-only', pretendToBeVisual: true });
  dom.window.fetch = async url => {
    const body = url === '/api/me' ? { user: { isAdmin: true, username: 'owner' } }
      : String(url).startsWith('/api/admin/audit?') ? { logs: [{ id: 1, actor: 'owner', action: 'admin.subscription.update', target_type: 'user', target_id: '42', details: { requestId: 'req-123' }, created_at: '2026-09-21T00:00:00Z' }], pagination: { page: 1, pages: 1, total: 1 } }
      : url === '/api/admin/stats' ? { stats: {} }
      : String(url).startsWith('/api/admin/users?') ? { users: [], pagination: { page: 1, pages: 1, total: 0 } }
      : url === '/api/admin/finance' ? { invoices: [], upgradeRequests: [] }
      : url === '/api/admin/coupons' ? { coupons: [] }
      : url === '/api/admin/reports' ? { reports: [] } : {};
    return { ok: true, json: async () => body };
  };
  dom.window.eval(fs.readFileSync(new URL('../admin-console.20260921.js', import.meta.url), 'utf8'));
  await settle();
  dom.window.document.querySelector('[data-view="audit"]').click();
  assert.match(dom.window.document.querySelector('#content').textContent, /admin.subscription.update/);
  assert.match(dom.window.document.querySelector('#content').textContent, /req-123/);
  dom.window.close();
});

