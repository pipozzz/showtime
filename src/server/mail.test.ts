import assert from 'node:assert/strict';
import { test } from 'node:test';
import { smtpConfig } from './mail';

test('SMTP config from separate variables', () => {
  assert.equal(smtpConfig({}), null);
  assert.deepEqual(smtpConfig({ SMTP_HOST: 'mail.example.com', SMTP_USER: 'me', SMTP_PASS: 'p@ss:w/rd' }), {
    host: 'mail.example.com', port: 587, secure: false, auth: { user: 'me', pass: 'p@ss:w/rd' },
  });
  assert.equal((smtpConfig({ SMTP_HOST: 'h', SMTP_PORT: '465' }) as { secure: boolean }).secure, true, '465 = implicit TLS');
  assert.equal((smtpConfig({ SMTP_HOST: 'h', SMTP_PORT: '2525', SMTP_SECURE: 'true' }) as { secure: boolean }).secure, true);
  assert.equal('auth' in (smtpConfig({ SMTP_HOST: 'h' }) as object), false, 'no auth for an open relay like Mailpit');
});

test('SMTP_URL wins when both are set', () => {
  assert.equal(smtpConfig({ SMTP_URL: 'smtps://u:p@x:465', SMTP_HOST: 'other' }), 'smtps://u:p@x:465');
});
