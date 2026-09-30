import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMusicInteraction, musicPanelMessage, normalizeMusicPanel, validateMusicSource } from '../lib/music-panel.js';

test('music panel validates identity and exposes controls only while playing', () => {
  const config = normalizeMusicPanel({ title: 'استديو', color: '#AA33CC', defaultVolume: 40 });
  assert.equal(config.defaultVolume, 40);
  const idle = musicPanelMessage(config, 'موسيقى');
  assert.equal(idle.embeds[0].title, 'استديو');
  assert.equal(idle.components[0].components.length, 1);
  const playing = musicPanelMessage(config, 'موسيقى', { channelId: '123', queue: [{ title: 'مقطع' }], paused: false });
  assert.equal(playing.components.length, 2);
  assert.match(playing.embeds[0].description, /<#123>/);
});

test('audio source accepts approved direct hosts and rejects YouTube and private endpoints', () => {
  assert.ok(validateMusicSource('https://cdn.discordapp.com/attachments/123/file.mp3'));
  assert.equal(validateMusicSource('https://youtube.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(validateMusicSource('https://localhost/audio.mp3'), null);
  assert.equal(validateMusicSource('http://cdn.discordapp.com/file.mp3'), null);
});

test('room choice opens a channel picker before asking for the audio URL', async () => {
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
  assert.equal(modal.components[0].components[0].custom_id, 'audio_url');
});

test('a YouTube page is rejected before joining a voice channel', async () => {
  const pool = { query: async () => ({ rows: [{ panel_config: {} }] }) };
  const roomId = '123456789012345678';
  let reply;
  const interaction = { customId: `diskoko:music:add:موسيقى:${roomId}`, guildId: 'guild', member: { voice: { channelId: roomId } }, fields: { getTextInputValue: key => key === 'audio_url' ? 'https://youtube.com/watch?v=dQw4w9WgXcQ' : 'أغنية' }, reply: async value => { reply = value; } };
  assert.equal(await handleMusicInteraction(interaction, pool, 'bot', {}), true);
  assert.match(reply.content, /YouTube/);
  assert.equal(reply.ephemeral, true);
});

