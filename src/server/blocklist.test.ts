import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blockedReason, isAdmin } from './blocklist';

test('brands and staff words are blocked, ordinary names are not', () => {
  for (const h of ['google', 'warnerbros', 'the-economist', 'admin', 'starring-support', 'official-peter', 'support']) assert.ok(blockedReason(h), h);
  for (const h of ['peter', 'nova', 'jane-doe', 'googler-not', 'supporter', 'starringfan']) assert.equal(blockedReason(h), null, h);
});

test('BLOCKED_HANDLES extends the list; ADMIN_EMAILS identifies admins', () => {
  process.env.BLOCKED_HANDLES = 'acme, globex';
  assert.ok(blockedReason('globex'));
  process.env.ADMIN_EMAILS = 'Owner@Example.com';
  assert.ok(isAdmin('owner@example.com'));
  assert.ok(!isAdmin('someone@example.com'));
  delete process.env.BLOCKED_HANDLES; delete process.env.ADMIN_EMAILS;
});
