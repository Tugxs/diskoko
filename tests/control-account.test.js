import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { applyEffect, boostProgress, controlPanelPayload, handleControlInteraction, safeDiscordCdnUrl } from '../lib/control-account.js';

test('Control Account has three independent tool menus and branded art', async () => {
  const payload = await controlPanelPayload();
  assert.equal(payload.components.length, 3);
  assert.deepEqual(payload.components.map(row => row.toJSON().components[0].options.length), [6, 4, 2]);
  assert.ok(payload.files[0].attachment.length > 10_000);
});

test('boost timeline uses the server boost start and never unlocks early', () => {
  const now = new Date('2026-09-29T00:00:00Z');
  const result = boostProgress(new Date('2026-07-29T00:00:00Z'), now);
  assert.deepEqual(result.reached, [1, 2]);
  assert.equal(result.next, 3);
  assert.equal(result.progress, 0);
  assert.equal(boostProgress(null), null);
});

test('download URLs cannot target another host or private network', () => {
  assert.ok(safeDiscordCdnUrl('https://cdn.discordapp.com/attachments/123/file.mp4'));
  for (const url of ['http://cdn.discordapp.com/a', 'https://127.0.0.1/a', 'https://cdn.discordapp.com.evil.test/a', 'https://user@cdn.discordapp.com/a']) assert.equal(safeDiscordCdnUrl(url), null);
});

test('image upload opens a file and effect picker modal', async () => {
  const target = { customId: 'diskoko-control:image', guildId: '1298703504273047552', values: ['upload'],
    isButton: () => false, isStringSelectMenu: () => true, isModalSubmit: () => false,
    async showModal(modal) { this.modal = modal.toJSON(); } };
  assert.equal(await handleControlInteraction(target), true);
  assert.equal(target.modal.components[0].component.type, 19);
  assert.equal(target.modal.components[1].component.options.length, 10);
});

test('every image effect produces a downloadable PNG', async () => {
  const source = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#8058eb' } }).png().toBuffer();
  for (const effect of ['original', 'blur', 'gray', 'sepia', 'sharp', 'negative', 'purple', 'cyan', 'vintage', 'glitch']) {
    const output = await applyEffect(source, effect);
    assert.equal((await sharp(output).metadata()).format, 'png', effect);
  }
});
