import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { blankProfile } from '../model';
import { GithubImportError, importGithub, usernameFrom } from './github';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const user = {
  login: 'Octo-Dev', name: 'Octo Dev', bio: 'Builds things.', location: 'Prague', blog: 'octo.dev',
  company: '@acme', html_url: 'https://github.com/Octo-Dev', twitter_username: 'octo', email: null, hireable: true, public_repos: 3,
};
const repos = [
  { name: 'star', description: 'Popular', language: 'TypeScript', topics: ['web-components'], stargazers_count: 120, forks_count: 10, fork: false, archived: false, html_url: 'https://github.com/Octo-Dev/star', pushed_at: '2025-03-01T00:00:00Z' },
  { name: 'forked', description: null, language: 'Go', stargazers_count: 999, forks_count: 0, fork: true, archived: false, html_url: 'x', pushed_at: '2025-01-01T00:00:00Z' },
  { name: 'old', description: null, language: 'Go', stargazers_count: 1, forks_count: 0, fork: false, archived: true, html_url: 'x', pushed_at: '2019-01-01T00:00:00Z' },
];

const mockFetch = (routes: Record<string, { status?: number; body: unknown }>) => {
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    const hit = Object.entries(routes).find(([k]) => url.includes(k));
    const r = hit?.[1] ?? { status: 404, body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as typeof fetch;
  return calls;
};

test('usernameFrom accepts handles and profile URLs', () => {
  assert.equal(usernameFrom('@octo'), 'octo');
  assert.equal(usernameFrom('https://github.com/octo/'), 'octo');
  assert.equal(usernameFrom('github.com/octo?tab=repositories'), 'octo');
  assert.equal(usernameFrom('www.github.com/octo'), 'octo');
});

test('builds a draft from public data without a token', async () => {
  const calls = mockFetch({ '/users/Octo-Dev/repos': { body: repos }, '/users/Octo-Dev': { body: user } });
  const { profile, notes } = await importGithub('Octo-Dev');
  assert.ok(calls.every((c) => c.startsWith('https://api.github.com/')), 'only talks to api.github.com');
  assert.equal(profile.handle, 'octo-dev');
  assert.equal(profile.profile.name, 'Octo Dev');
  assert.equal(profile.profile.links?.website, 'https://octo.dev');
  assert.equal(profile.profile.links?.x, 'https://x.com/octo');
  assert.deepEqual(profile.projects?.map((p) => p.title), ['star'], 'skips forks and archived repos');
  assert.deepEqual(profile.projects?.[0].impact, ['120 stars', '10 forks']);
  assert.deepEqual(profile.skills?.Languages, ['TypeScript']);
  assert.ok(notes.some((n) => /token/.test(n)));
  assert.ok(notes.some((n) => /acme/.test(n)));
});

test('merge keeps private/NDA work and clients', async () => {
  mockFetch({ '/users/Octo-Dev/repos': { body: repos }, '/users/Octo-Dev': { body: user } });
  const base = { ...blankProfile(), clients: [{ name: 'Globex', nda: true }], projects: [{ title: 'Secret', year: 2024, visibility: 'nda' as const, blurb: 'x' }] };
  const { profile } = await importGithub('Octo-Dev', { base });
  assert.deepEqual(profile.clients, base.clients);
  assert.deepEqual(profile.projects?.map((p) => p.title), ['star', 'Secret']);
});

test('unknown user and rate limits become readable errors', async () => {
  mockFetch({});
  await assert.rejects(importGithub('nobody-here'), (e) => e instanceof GithubImportError && /No GitHub user/.test(e.message));
  mockFetch({ '/users/x1': { status: 403, body: {} } });
  await assert.rejects(importGithub('x1'), /rate limit/);
  await assert.rejects(importGithub('not a user!'), /doesn’t look like/);
});
