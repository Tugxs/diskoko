import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMusicCommand, handleMusicInteraction, musicPanelMessage, musicSlashOptions, musicSourceTitle, normalizeMusicPanel, resolveMusicTrack, validateMusicSource } from '../lib/music-panel.js';
import { youtubeVideoId } from '../lib/youtube-panel.js';
import { describeYoutubeFailure } from '../lib/youtube-audio.js';

test('music panel validates identity and exposes controls only while playing', () => {
  const config = normalizeMusicPanel({ title: 'استديو', color: '#AA33CC', defaultVolume: 40, bannerUrl: 'https://example.com/banner.png', logoUrl: 'https://example.com/logo.png' });
  assert.equal(config.defaultVolume, 40);
  const idle = musicPanelMessage(config, 'موسيقى');
  assert.equal(idle.embeds[0].title, 'استديو');
  assert.equal(idle.components[0].components[0].type, 2);
  assert.match(idle.embeds[0].description, /رابط/);
  assert.equal(idle.embeds[0].image.url, 'https://example.com/banner.png');
  assert.equal(idle.embeds[0].thumbnail.url, 'https://example.com/logo.png');
  const playing = musicPanelMessage(config, 'موسيقى', { channelId: '123', queue: [{ title: 'مقطع' }], paused: false, volume: 0.4 });
  assert.equal(playing.components.length, 2);
  assert.deepEqual(playing.components[1].components.map(button => button.label), ['🔉 −10', '40%', '🔊 +10']);
  assert.match(playing.embeds[0].description, /<#123>/);
  const youtube = musicPanelMessage(config, 'موسيقى', { channelId: '123', queue: [{ kind: 'youtube', id: 'jNQXAC9IVRw', title: 'Me at the zoo' }], paused: false, volume: 0.8 });
  assert.equal(youtube.embeds[0].image.url, 'https://example.com/banner.png');
  const automaticArtwork = musicPanelMessage({}, 'موسيقى', { channelId: '123', queue: [{ kind: 'youtube', id: 'jNQXAC9IVRw', title: 'Me at the zoo' }], paused: false, volume: 0.8 });
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

test('music command accepts link and voice room together; panel button explains the shortcut', async () => {
  assert.deepEqual(musicSlashOptions.map(option => option.name), ['رابط', 'روم']);
  let panel;
  await handleMusicCommand({ options: { getString: () => null }, reply: async value => { panel = value; } }, {}, 'bot', 'موسيقى', {});
  assert.match(panel.embeds[0].description, /رابط/);
  const pool = { query: async () => ({ rows: [{ panel_config: {} }] }) };
  let reply;
  const interaction = { customId: 'diskoko:music:choose:موسيقى', guildId: 'guild', reply: async value => { reply = value; } };
  assert.equal(await handleMusicInteraction(interaction, pool, 'bot', {}), true);
  assert.match(reply.content, /رابط/);
  assert.equal(reply.ephemeral, true);
});

test('old room selector points members to the slash fields without opening a modal', async () => {
  const pool = { query: async () => ({ rows: [{ panel_config: {} }] }) };
  const roomId = '123456789012345678';
  let reply;
  const interaction = { customId: 'diskoko:music:room:موسيقى', guildId: 'guild', values: [roomId], member: { voice: { channelId: roomId } }, reply: async value => { reply = value; } };
  assert.equal(await handleMusicInteraction(interaction, pool, 'bot', {}), true);
  assert.match(reply.content, new RegExp(roomId));
  assert.match(reply.content, /رابط/);
});

test('an unsupported link is rejected before joining a voice channel', async () => {
  const pool = { query: async () => ({ rows: [{ panel_config: {} }] }) };
  const roomId = '123456789012345678';
  let reply;
  const interaction = { customId: `diskoko:music:add:موسيقى:${roomId}`, guildId: 'guild', member: { voice: { channelId: roomId } }, fields: { getTextInputValue: () => 'https://example.com/file.mp3' }, deferReply: async () => {}, editReply: async value => { reply = value; } };
  assert.equal(await handleMusicInteraction(interaction, pool, 'bot', {}), true);
  assert.match(reply, /الرابط غير صالح/);
});

