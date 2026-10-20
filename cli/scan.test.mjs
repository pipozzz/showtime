import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { findRepos, scan } from './scan.mjs';

let root;
const git = (cwd, args, env = {}) =>
  execFileSync('git', args, { cwd, env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', ...env }, stdio: 'pipe' });

const commit = (repo, { email, date, msg }) => {
  writeFileSync(join(repo, 'f.txt'), `${msg}\n${Math.random()}`);
  git(repo, ['add', '.']);
  git(repo, ['commit', '-q', '-m', msg], {
    GIT_AUTHOR_NAME: 'X', GIT_AUTHOR_EMAIL: email, GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: 'X', GIT_COMMITTER_EMAIL: email, GIT_COMMITTER_DATE: date,
  });
};
const makeRepo = (path, remote) => {
  mkdirSync(path, { recursive: true });
  git(path, ['init', '-q', '-b', 'main']);
  if (remote) git(path, ['remote', 'add', 'origin', remote]);
  return path;
};

before(() => {
  root = mkdtempSync(join(tmpdir(), 'starring-scan-'));
  const client = makeRepo(join(root, 'clients', 'acme-secret-project'), 'git@gitlab.acme-corp.example:team/secret.git');
  commit(client, { email: 'me@agency.test', date: '2024-03-01T10:00:00Z', msg: 'TOP SECRET launch' });
  commit(client, { email: 'Me@Agency.test', date: '2024-03-01T15:00:00Z', msg: 'more secret' });
  commit(client, { email: 'someone@else.test', date: '2024-03-02T10:00:00Z', msg: 'not mine' });
  commit(client, { email: 'me@agency.test', date: '2025-07-04T09:00:00Z', msg: 'fix' });

  const oss = makeRepo(join(root, 'oss', 'public-lib'), 'https://github.com/me/public-lib.git');
  commit(oss, { email: 'me@personal.test', date: '2025-01-02T09:00:00Z', msg: 'oss' });

  // a second clone of the client repo must not double count
  git(root, ['clone', '-q', client, join(root, 'clones', 'acme-copy')]);
  mkdirSync(join(root, 'node_modules', 'pkg', '.git'), { recursive: true }); // skipped
});
after(() => rmSync(root, { recursive: true, force: true }));

test('finds repos, skips node_modules, does not descend into repos', () => {
  const repos = findRepos([root]).map((r) => r.slice(root.length));
  assert.deepEqual(repos, ['/clients/acme-secret-project', '/clones/acme-copy', '/oss/public-lib']);
});

test('counts only my commits (case-insensitive email), de-duplicated across clones', () => {
  const r = scan(findRepos([root]), { emails: ['me@agency.test', 'me@personal.test'] });
  assert.equal(r.kind, 'starring-activity');
  assert.equal(r.totals.commits, 4);
  assert.deepEqual(r.years, [{ year: 2025, commits: 2 }, { year: 2024, commits: 2 }]);
  assert.equal(r.days['2024-03-01'], 2);
  assert.deepEqual(r.platforms.map((p) => p.name).sort(), ['GitHub', 'GitLab (self-hosted)']);
});

test('output holds no code, messages, repo names, paths, hosts or emails', () => {
  const json = JSON.stringify(scan(findRepos([root]), { emails: ['me@agency.test'] }));
  for (const leak of ['SECRET', 'secret', 'acme', 'public-lib', root, 'agency.test', 'gitlab.acme-corp']) {
    assert.ok(!json.includes(leak), `output leaks "${leak}"`);
  }
});

test('--reveal-hosts names self-hosted servers; --exclude skips hosts', () => {
  const revealed = scan(findRepos([root]), { emails: ['me@agency.test'], revealHosts: true });
  assert.ok(revealed.platforms.some((p) => p.name === 'gitlab.acme-corp.example'));
  const excluded = scan(findRepos([root]), { emails: ['me@agency.test', 'me@personal.test'], exclude: ['github.com'] });
  assert.equal(excluded.totals.commits, 3);
  assert.equal(excluded.totals.reposExcluded, 1);
});

test('--since and a missing email', () => {
  assert.equal(scan(findRepos([root]), { emails: ['me@agency.test'], since: '2025-01-01' }).totals.commits, 1);
  assert.throws(() => scan([], { emails: [] }), /No author email/);
});
