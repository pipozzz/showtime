#!/usr/bin/env node
// End-to-end check of server mode against a running instance.
//   E2E_URL=http://localhost:4321 npm run test:e2e
// Creates a throwaway account, walks sign-up → claim → save → publish → share,
// checks the security guards, then deletes the account again.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const BASE = (process.env.E2E_URL ?? 'http://localhost:4321').replace(/\/$/, '');
const ORIGIN = new URL(BASE).origin;
const id = randomBytes(4).toString('hex');
const email = `e2e-${id}@starring.test`;
const password = randomBytes(18).toString('base64url');
const handle = `e2e-${id}`;
let cookie = '';

const call = async (method, path, body, headers = {}) => {
  const res = await fetch(BASE + path, {
    method,
    redirect: 'manual',
    headers: { Origin: ORIGIN, ...(body && { 'Content-Type': 'application/json' }), ...(cookie && { Cookie: cookie }), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
  return res;
};
/** Assert the status, then return the parsed body (read once). */
const expect = async (res, status) => {
  const text = await res.text();
  assert.equal(res.status, status, `${res.url} → ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return text; }
};
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✖ ${name}\n    ${e.message}`);
    process.exitCode = 1;
    throw e;
  }
};

const profile = {
  handle,
  theme: 'paper',
  profile: { name: 'Eve Tester', role: 'End-to-end Engineer', tagline: 'Tests the whole show.', links: { github: 'https://github.com/example' } },
  contributions: [{ year: 2025, public: 120, private: 480 }],
  clients: [{ name: 'Northwind Pictures', nda: true }],
  projects: [{ title: 'Premiere Hub', client: 'Northwind Pictures', year: 2024, visibility: 'nda', blurb: 'Launch platform.' }],
};

console.log(`Starring e2e → ${BASE}`);
try {
  await step('home, themes, robots and sitemap respond', async () => {
    for (const p of ['/', '/themes', '/robots.txt', '/sitemap.xml', '/og.png']) assert.equal((await call('GET', p)).status, 200, p);
  });
  await step('API refuses anonymous writes (401) and cross-origin writes (403)', async () => {
    assert.equal((await call('PUT', '/api/profile', { handle, data: profile })).status, 401);
    assert.equal((await call('PUT', '/api/profile', { handle, data: profile }, { Origin: 'https://evil.example' })).status, 403);
  });
  await step('sign up', async () => {
    await expect(await call('POST', '/api/auth/sign-up/email', { name: 'Eve Tester', email, password }), 200);
    const me = await expect(await call('GET', '/api/me'), 200);
    assert.equal(me.user.email, email);
    assert.equal(me.profile, null);
  });
  await step('reserved and file-owned handles are rejected', async () => {
    assert.equal((await call('PUT', '/api/profile', { handle: 'edit', data: profile })).status, 409);
    const nova = await call('GET', '/api/handle?h=nova');
    assert.equal((await nova.json()).ok, false);
  });
  await step('server-side validation rejects broken profiles (422)', async () => {
    const bad = { ...profile, profile: { ...profile.profile, name: '' } };
    assert.equal((await call('PUT', '/api/profile', { handle, data: bad })).status, 422);
  });
  await step('claim handle and save (unpublished → 404)', async () => {
    const saved = await expect(await call('PUT', '/api/profile', { handle, data: profile }), 200);
    assert.equal(saved.published, false);
    assert.equal((await call('GET', `/${handle}`)).status, 404);
  });
  await step('publish → page, poster, card, sitemap, oEmbed', async () => {
    assert.equal((await call('PATCH', '/api/profile', { published: true })).status, 200);
    const page = await call('GET', `/${handle}`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Eve Tester/);
    assert.match(html, /application\/ld\+json/);
    assert.match(html, /og:image/);
    const og = await call('GET', `/og/${handle}.png`);
    assert.equal(og.status, 200);
    assert.equal(og.headers.get('content-type'), 'image/png');
    assert.equal((await call('GET', `/${handle}/card`)).status, 200);
    assert.match(await (await call('GET', '/sitemap.xml')).text(), new RegExp(handle));
    const oe = await call('GET', `/oembed?url=${encodeURIComponent(`${BASE}/${handle}/`)}`);
    assert.equal(oe.status, 200);
    assert.equal((await oe.json()).type, 'rich');
  });
  await step('unpublish hides the page again', async () => {
    assert.equal((await call('PATCH', '/api/profile', { published: false })).status, 200);
    assert.equal((await call('GET', `/${handle}`)).status, 404);
  });
} finally {
  if (cookie) {
    await step('delete account (cleans up the profile)', async () => {
      await expect(await call('POST', '/api/auth/delete-user', {}), 200);
      assert.equal((await call('GET', `/${handle}`)).status, 404);
    }).catch(() => {});
  }
}
if (!process.exitCode) console.log('✓ e2e passed');
