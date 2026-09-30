import test from 'node:test';
import assert from 'node:assert/strict';
import { movieClubMessage, normalizeMovieClub, normalizeMovieItem, safeMovieUrl } from '../lib/movie-club.js';

test('movie club keeps external viewing links and never embeds account access', () => {
  const item = normalizeMovieItem({ title: 'مثال', kind: 'movie', year: 2024, summary: 'وصف', posterUrl: 'https://images.example.com/poster.jpg', links: [{ service: 'خدمة المشاهدة', url: 'https://watch.example.com/title/1' }], status: 'published' });
  const message = movieClubMessage({ title: 'نادي الأفلام', color: '#8659e6' }, [{ ...item, status: 'published' }]);
  assert.match(message.embeds[0].description, /كل عضو يستخدم حسابه الخاص/);
  assert.equal(message.components[0].components.length, 3);
  assert.equal(message.embeds[0].title, 'نادي الأفلام');
});

test('movie catalog rejects unsafe links and requires a viewing link to publish', () => {
  for (const url of ['http://watch.example.com/x', 'https://127.0.0.1/x', 'https://localhost/x', 'https://user:pass@watch.example.com/x']) assert.equal(safeMovieUrl(url), null);
  assert.throws(() => normalizeMovieItem({ title: 'عمل', year: 2024, status: 'published' }), /رابط مشاهدة/);
  assert.equal(normalizeMovieItem({ title: 'عمل', year: 2024, status: 'draft' }).status, 'draft');
  assert.throws(() => normalizeMovieClub({ bannerUrl: 'http://example.com/p.jpg' }), /غير آمن/);
});
