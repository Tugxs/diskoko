import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMusicInteraction, musicPanelMessage, musicRoomPicker, musicSourceTitle, normalizeMusicPanel, resolveMusicTrack, validateMusicSource } from '../lib/music-panel.js';
import { youtubeVideoId } from '../lib/youtube-panel.js';
import { describeYoutubeFailure } from '../lib/youtube-audio.js';

test('music panel validates identity and exposes controls only while playing', () => {
  const config = normalizeMusicPanel({ title: 'استديو', color: '#AA33CC', defaultVolume: 40, bannerUrl: 'https://example.com/banner.png', logoUrl: 'https://example.com/logo.png' });
  assert.equal(config.defaultVolume, 40);
  const idle = musicPanelMessage(config, 'موسيقى');
  assert.equal(idle.embeds[0].title, 'استديو');
  assert.equal(idle.components[0].components[0].type, 8);
  assert.equal(idle.embeds[0].image.url, 'https://example.com/banner.png');
  assert.equal(idle.embeds[0].thumbnail.url, 'https://example.com/logo.png');
  const playing = musicPanelMessage(config, 'موسيقى', { channelId: '123', queue: [{ title: 'مقطع' }], paused: false });
  assert.equal(playing.components.length, 2);
  assert.match(playing.embeds[0].description, /<#123>/);
  const youtube = musicPanelMessage(config, 'موسيقى', { channelId: '123', queue: [{ kind: 'youtube', id: 'jNQXAC9IVRw', title: 'Me at the zoo' }], paused: false });
  assert.equal(youtube.embeds[0].image.url, 'https://example.com/banner.png');
  const automaticArtwork = musicPanelMessage({}, 'موسيقى', { channelId: '123', queue: [{ kind: 'youtube', id: 'jNQXAC9IVRw', title: 'Me at the zoo' }], paused: false });
  assert.match(automaticArtwork.embeds[0].image.url, /jNQXAC9IVRw/);
});

test('audio source validates links and derives direct-file titles', async () => {
  assert.ok(validateMusicSource('https://cdn.discordapp.com/attachments/123/file.mp3'));
  assert.equal(validateMusicSource('https://youtube.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(validateMusicSource('https://localhost/audio.mp3'), null);
  assert.equal(validateMusicSource('http://cdn.discordapp.com/file.mp3'), null);
  assert.equal(musicSourceTitle('https://cdn.discordapp.com/attachments/123/My_Song-2026.mp3?x=1'), 'My Song 2026');
  assert.equal(youtubeVideoId('https://www.youtube.com/watch?v=jNQXAC9IVRw'), 'jNQXAC9IVRw');
  assert.equal(youtubeVideoId('https://youtu.be/0DLyn9D8LOk?si=MoUhqGSmqs0xc95T'), '0DLyn9D8LOk');
  assert.match(describeYoutubeFailure('ERROR: This video is unavailable'), /الرقم 0 والحرف O/);
  assert.deepEqual(await resolveMusicTrack('https://cdn.discordapp.com/attachments/123/file.mp3'), { kind: 'direct', url: 'https://cdn.discordapp.com/attachments/123/file.mp3', title: 'file' });
});

test('room choice opens a channel picker before asking for the audio URL', async () => {
  assert.equal(musicRoomPicker('موسيقى').components[0].components[0].custom_id, 'diskoko:music:room:موسيقى');
  const pool = { query: async () => ({ rows: [{ panel_config: {} }] }) };
  let reply;
  const interaction = { customId: 'diskoko:music:choose:موسيقى', guildId: 'guild', reply: async value => { reply = value; } };
  assert.equal(await handleMusicInteraction(interaction, pool, 'bot', {}), true);
  assert.equal(reply.components[0].components[0].type, 8);
  assert.equal(reply.components[0].components[0].custom_id, 'diskoko:music:room:موسيقى');
});

test('room selection requests the audio link only when the member can use that room', async () => {
  const pool = { query: async () => ({ rows: [{ panel_config: {} }] }) };
  const roomId = '123456789012345678';
  let modal;
  const interaction = { customId: 'diskoko:music:room:موسيقى', guildId: 'guild', values: [roomId], member: { voice: { channelId: roomId } }, showModal: async value => { modal = value; } };
  assert.equal(await handleMusicInteraction(interaction, pool, 'bot', {}), true);
  assert.equal(modal.custom_id, `diskoko:music:add:موسيقى:${roomId}`);
  assert.equal(modal.components.length, 1);
  assert.equal(modal.components[0].components[0].custom_id, 'audio_url');
});

test('an unsupported link is rejected before joining a voice channel', async () => {
  const pool = { query: async () => ({ rows: [{ panel_config: {} }] }) };
  const roomId = '123456789012345678';
  let reply;
  const interaction = { customId: `diskoko:music:add:موسيقى:${roomId}`, guildId: 'guild', member: { voice: { channelId: roomId } }, fields: { getTextInputValue: () => 'https://example.com/file.mp3' }, deferReply: async () => {}, editReply: async value => { reply = value; } };
  assert.equal(await handleMusicInteraction(interaction, pool, 'bot', {}), true);
  assert.match(reply, /الرابط غير صالح/);
});
