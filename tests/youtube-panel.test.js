import test from 'node:test';
import assert from 'node:assert/strict';
import { handleYoutubePanelInteraction, normalizeYoutubePanel, youtubePanelMessage, youtubeVideoId } from '../lib/youtube-panel.js';

test('YouTube panel accepts only official HTTPS video links', () => {
  assert.equal(youtubeVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeVideoId('https://evil.example/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(youtubeVideoId('http://youtube.com/watch?v=dQw4w9WgXcQ'), null);
});

test('panel shows add action first and watch action only after a video is chosen', () => {
  const config = normalizeYoutubePanel({ title: 'قاعة الأفلام', bannerUrl: 'https://example.com/banner.png', logoUrl: 'https://example.com/logo.png', buttonOrder: 'add-first' });
  const home = youtubePanelMessage(config, 'يوتيوب');
  assert.equal(home.embeds[0].title, 'قاعة الأفلام');
  assert.equal(home.embeds[0].image.url, config.bannerUrl);
  assert.equal(home.components[0].components.length, 1);
  const video = youtubePanelMessage(config, 'يوتيوب', { id: 'dQw4w9WgXcQ', title: 'فيديو تجريبي' });
  assert.equal(video.components[0].components[0].custom_id, 'diskoko:yt:add:يوتيوب');
  assert.match(video.components[0].components[1].url, /watch\.html\?v=dQw4w9WgXcQ/);
});

test('Discord add button asks for the video inside Discord', async () => {
  let modal;
  const pool = { query: async () => ({ rows: [{ panel_config: { title: 'لوحة' } }] }) };
  const interaction = { customId: 'diskoko:yt:add:يوتيوب', guildId: 'guild', showModal: async value => { modal = value; } };
  assert.equal(await handleYoutubePanelInteraction(interaction, pool, 'bot'), true);
  assert.equal(modal.components[0].components[0].custom_id, 'video_url');
});

