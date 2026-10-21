import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clientIp } from './http';

const req = (xff?: string) => new Request('http://app.test/', { headers: xff ? { 'x-forwarded-for': xff } : {} });

test('behind a proxy on a private address, the forwarded client IP is used', () => {
  assert.equal(clientIp(req('203.0.113.7'), '172.18.0.3', {}), '203.0.113.7');
  assert.equal(clientIp(req('6.6.6.6, 203.0.113.7'), '10.0.0.2', {}), '203.0.113.7', 'right-most entry: a client-forged prefix is ignored');
  assert.equal(clientIp(req('203.0.113.7'), '::ffff:127.0.0.1', {}), '203.0.113.7');
  assert.equal(clientIp(req('2001:db8::1'), 'fd00::5', {}), '2001:db8::1');
});

test('a public peer is the client: a spoofed X-Forwarded-For is ignored', () => {
  assert.equal(clientIp(req('1.2.3.4'), '198.51.100.9', {}), '198.51.100.9');
  assert.equal(clientIp(req(), '198.51.100.9', {}), '198.51.100.9');
});

test('TRUST_PROXY=true trusts the header even from a public peer (proxy on another host)', () => {
  assert.equal(clientIp(req('203.0.113.7'), '198.51.100.9', { TRUST_PROXY: 'true' }), '203.0.113.7');
});

test('no peer and no header', () => {
  assert.equal(clientIp(req(), undefined, {}), 'unknown');
});
