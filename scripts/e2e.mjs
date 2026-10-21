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
let password = randomBytes(18).toString('base64url');
const MAILPIT = process.env.MAILPIT_URL?.replace(/\/$/, '');
/** Wait for a message to `to` whose subject contains `subject`; returns Mailpit's message JSON. */
const inbox = async (to, subject) => {
  for (let i = 0; i < 40; i++) {
    const list = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`).then((r) => r.json());
    const hit = list.messages?.find((m) => m.Subject.includes(subject));
    if (hit) return fetch(`${MAILPIT}/api/v1/message/${hit.ID}`).then((r) => r.json());
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no "${subject}" email for ${to} within 10s`);
};
const handle = `e2e-${id}`;
const jars = { user: '', admin: '' };
let as = 'user';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;

const call = async (method, path, body, headers = {}, retry = true) => {
  const res = await fetch(BASE + path, {
    method,
    redirect: 'manual',
    headers: { Origin: ORIGIN, ...(body && { 'Content-Type': 'application/json' }), ...(jars[as] && { Cookie: jars[as] }), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  // Better Auth allows ~3 sign-ups/sign-ins per 10 s per IP; this script makes several in a row
  if (res.status === 429 && retry && path.startsWith('/api/auth/')) {
    await new Promise((r) => setTimeout(r, 11_000));
    return call(method, path, body, headers, false);
  }
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) jars[as] = set.map((c) => c.split(';')[0]).join('; ');
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
    for (const p of ['/', '/themes', '/explore', '/terms', '/privacy', '/robots.txt', '/sitemap.xml', '/og.png']) assert.equal((await call('GET', p)).status, 200, p);
  });
  await step('health check, security headers, branded 404', async () => {
    const health = await expect(await call('GET', '/api/health'), 200);
    assert.equal(health.db, true);
    const home = await call('GET', '/');
    assert.match(home.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
    assert.equal(home.headers.get('x-frame-options'), 'DENY');
    assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
    const card = await call('GET', '/nova/card/');
    assert.match(card.headers.get('content-security-policy') ?? '', /frame-ancestors \*/, 'embed card stays frameable');
    assert.equal(card.headers.get('x-frame-options'), null);
    const missing = await call('GET', '/no-such-stage-xyz');
    assert.equal(missing.status, 404);
    assert.match(await missing.text(), /Empty stage/);
  });
  await step('API refuses anonymous writes (401) and cross-origin writes (403)', async () => {
    assert.equal((await call('PUT', '/api/profile', { handle, data: profile })).status, 401);
    assert.equal((await call('PUT', '/api/profile', { handle, data: profile }, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await call('POST', '/api/import/github', {})).status, 401);
  });
  await step('sign up', async () => {
    await expect(await call('POST', '/api/auth/sign-up/email', { name: 'Eve Tester', email, password }), 200);
    const me = await expect(await call('GET', '/api/me'), 200);
    assert.equal(me.user.email, email);
    assert.equal(me.profile, null);
    assert.equal(me.user.githubLinked, false);
    const gh = await call('POST', '/api/import/github', {});
    assert.equal(gh.status, 404, 'email accounts have no GitHub token');
  });
  // Needs SMTP_URL on the server and MAILPIT_URL here (Mailpit catches the mail).
  if (MAILPIT) {
    await step('verification email is sent on sign-up', async () => {
      const msg = await inbox(email, 'Confirm your email');
      assert.match(msg.Text, /verify-email\?token=/);
    });
    await step('password reset by email: link → new password → old one stops working', async () => {
      await expect(await call('POST', '/api/auth/request-password-reset', { email, redirectTo: '/reset-password' }), 200);
      const msg = await inbox(email, 'Reset your Starring password');
      const url = /https?:\/\/\S+\/api\/auth\/reset-password\/\S+/.exec(msg.Text)?.[0];
      assert.ok(url, 'reset link in the email');
      const hop = await fetch(url.replace(/^https?:\/\/[^/]+/, BASE), { redirect: 'manual' });
      const token = new URL(hop.headers.get('location') ?? '', BASE).searchParams.get('token');
      assert.ok(token, `redirected to /reset-password with a token (got ${hop.headers.get('location')})`);
      const newPassword = randomBytes(18).toString('base64url');
      await expect(await call('POST', '/api/auth/reset-password', { newPassword, token }), 200);
      assert.equal((await call('POST', '/api/auth/sign-in/email', { email, password })).status, 401, 'old password rejected');
      await expect(await call('POST', '/api/auth/sign-in/email', { email, password: newPassword }), 200);
      password = newPassword;
    });
  }
  await step('change password (wrong current one fails) and download my data', async () => {
    const next = randomBytes(18).toString('base64url');
    assert.notEqual((await call('POST', '/api/auth/change-password', { currentPassword: 'wrong-password-123', newPassword: next })).status, 200);
    await expect(await call('POST', '/api/auth/change-password', { currentPassword: password, newPassword: next, revokeOtherSessions: true }), 200);
    password = next;
    assert.equal((await call('GET', '/account')).status, 200, 'still signed in on this device');
    const res = await call('GET', '/api/me/export');
    assert.match(res.headers.get('content-disposition') ?? '', /attachment; filename="starring-data-/);
    const data = await expect(res, 200);
    assert.equal(data.account.email, email);
    assert.ok(data.sessions.length >= 1);
    const raw = JSON.stringify(data);
    for (const leak of ['accessToken', 'refreshToken', 'idToken', '"password"', '$argon', 'scrypt']) assert.ok(!raw.includes(leak), `export must not include ${leak}`);
    const anon = jars.user; jars.user = '';
    assert.equal((await call('GET', '/api/me/export')).status, 401);
    jars.user = anon;
  });
  await step('reserved and file-owned handles are rejected', async () => {
    assert.equal((await call('PUT', '/api/profile', { handle: 'edit', data: profile })).status, 409);
    assert.equal((await call('PUT', '/api/profile', { handle: 'google', data: profile })).status, 409, 'brand handles are blocked');
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
    assert.match(await (await call('GET', '/explore')).text(), new RegExp(`/${handle}`), 'listed on /explore');
    const oe = await call('GET', `/oembed?url=${encodeURIComponent(`${BASE}/${handle}/`)}`);
    assert.equal(oe.status, 200);
    assert.equal((await oe.json()).type, 'rich');
  });
  await step('anyone can report a public profile', async () => {
    const saved = jars.user; jars.user = '';
    await expect(await call('POST', '/api/report', { handle, reason: 'spam', details: 'e2e' }), 200);
    assert.equal((await call('POST', '/api/report', { handle, reason: 'nope' })).status, 400);
    assert.equal((await call('POST', '/api/report', { handle: 'no-such-handle-xyz', reason: 'spam' })).status, 404);
    assert.equal((await call('GET', `/report?h=${handle}`)).status, 200);
    jars.user = saved;
  });
  if (ADMIN_EMAIL) {
    await step('admin hides a reported profile; the owner cannot re-publish; unhide restores', async () => {
      as = 'admin';
      await expect(await call('POST', '/api/auth/sign-up/email', { name: 'Admin', email: ADMIN_EMAIL, password: randomBytes(18).toString('base64url') }), 200);
      const page = await expect(await call('GET', '/admin'), 200);
      assert.match(page, new RegExp(`/${handle}`));
      await expect(await call('POST', '/api/admin', { action: 'hide', handle, reason: 'e2e' }), 200);
      as = 'user';
      assert.equal((await call('GET', `/${handle}`)).status, 404, 'hidden profile is gone');
      assert.equal((await call('PATCH', '/api/profile', { published: true })).status, 403, 'owner cannot re-publish');
      assert.equal((await call('POST', '/api/admin', { action: 'unhide', handle })).status, 403, 'non-admins cannot moderate');
      as = 'admin';
      await expect(await call('POST', '/api/admin', { action: 'unhide', handle }), 200);
      await expect(await call('POST', '/api/auth/delete-user', {}), 200);
      as = 'user';
      await expect(await call('PATCH', '/api/profile', { published: true }), 200);
    });
  }
  await step('request access: validation, honeypot, cross-origin', async () => {
    const saved = jars.user; jars.user = '';
    assert.equal((await call('POST', '/api/access', { email: 'not-an-email' })).status, 400);
    assert.equal((await call('POST', '/api/access', { email: `x-${id}@starring.test`, link: 'javascript:alert(1)' })).status, 400);
    assert.equal((await call('POST', '/api/access', { email: `x-${id}@starring.test` }, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await expect(await call('POST', '/api/access', { email: `bot-${id}@starring.test`, website: 'spam' }), 200)).status, 'pending');
    assert.equal((await call('GET', '/login?mode=request')).status, 200);
    jars.user = saved;
  });
  if (ADMIN_EMAIL) {
    await step('private beta: request → admin invites → invited email signs up', async () => {
      const guest = `guest-${id}@starring.test`;
      const saved = jars.user; jars.user = '';
      const asked = await expect(await call('POST', '/api/access', { email: guest, name: 'Gus Guest', link: 'https://github.com/example', note: 'e2e' }), 200);
      assert.equal(asked.status, 'pending');
      await expect(await call('POST', '/api/access', { email: guest.toUpperCase() }), 200); // asking twice is fine
      as = 'admin';
      await expect(await call('POST', '/api/auth/sign-up/email', { name: 'Admin', email: ADMIN_EMAIL, password: randomBytes(18).toString('base64url') }), 200);
      assert.match(await expect(await call('GET', '/admin'), 200), new RegExp(guest));
      const inv = await expect(await call('POST', '/api/admin', { action: 'invite', email: guest }), 200);
      assert.match(inv.url, /\/login\?mode=signup&invite=[\w-]{20,}/);
      as = 'user'; jars.user = '';
      assert.equal((await call('POST', '/api/admin', { action: 'invite', email: 'x@starring.test' })).status, 403, 'only admins invite');
      const page = await expect(await call('GET', new URL(inv.url).pathname + new URL(inv.url).search), 200);
      assert.match(page, new RegExp(`value="${guest}"`), 'invite link pre-fills the email');
      await expect(await call('POST', '/api/auth/sign-up/email', { name: 'Gus Guest', email: guest, password: randomBytes(18).toString('base64url') }), 200);
      const data = await expect(await call('GET', '/api/me/export'), 200);
      assert.equal(data.accessRequest.status, 'joined');
      await expect(await call('POST', '/api/auth/delete-user', {}), 200);
      as = 'admin';
      assert.doesNotMatch(await expect(await call('GET', '/admin'), 200), new RegExp(guest), 'request removed with the account');
      await expect(await call('POST', '/api/auth/delete-user', {}), 200);
      as = 'user'; jars.user = saved;
    });
  }
  await step('unpublish hides the page again', async () => {
    assert.equal((await call('PATCH', '/api/profile', { published: false })).status, 200);
    assert.equal((await call('GET', `/${handle}`)).status, 404);
  });
} finally {
  if (jars.user) {
    as = 'user';
    await step('delete account (cleans up the profile)', async () => {
      await expect(await call('POST', '/api/auth/delete-user', {}), 200);
      assert.equal((await call('GET', `/${handle}`)).status, 404);
    }).catch(() => {});
  }
}
if (!process.exitCode) console.log('✓ e2e passed');
