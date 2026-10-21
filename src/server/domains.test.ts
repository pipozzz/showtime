import assert from 'node:assert/strict';
import { test } from 'node:test';

// the db module needs a URL to load; nothing here queries it
process.env.DATABASE_URL ??= 'postgres://unused@127.0.0.1:1/unused';
process.env.BETTER_AUTH_SECRET = 'test-secret';
const { DomainError, normalizeDomain, verification } = await import('./domains');

test('domains are normalised from whatever people paste', () => {
  assert.equal(normalizeDomain('peter.dev', 'starring.dev'), 'peter.dev');
  assert.equal(normalizeDomain('  https://CV.Peter.dev/about?x=1 ', 'starring.dev'), 'cv.peter.dev');
  assert.equal(normalizeDomain('peter.dev.', 'starring.dev'), 'peter.dev');
  assert.equal(normalizeDomain('peter.dev:443', 'starring.dev'), 'peter.dev');
  assert.equal(normalizeDomain('xn--bcher-kva.example.com', 'starring.dev'), 'xn--bcher-kva.example.com');
});

test('non-public, malformed and the instance’s own domains are refused', () => {
  for (const bad of ['', 'peter', 'localhost', 'peter.local', 'my.test', '127.0.0.1', '10.0.0.1', '-bad.dev', 'bad-.dev', 'a..dev', 'pe ter.dev', 'x'.repeat(64) + '.dev', 'starring.dev', 'evil.starring.dev']) {
    assert.throws(() => normalizeDomain(bad, 'starring.dev'), DomainError, bad);
  }
});

test('the TXT record is stable per account and domain, and differs otherwise', () => {
  const a = verification('user-1', 'peter.dev');
  assert.equal(a.name, '_starring.peter.dev');
  assert.match(a.value, /^starring-verify=[0-9a-f]{32}$/);
  assert.deepEqual(verification('user-1', 'peter.dev'), a);
  assert.notEqual(verification('user-2', 'peter.dev').value, a.value);
  assert.notEqual(verification('user-1', 'cv.peter.dev').value, a.value);
});
