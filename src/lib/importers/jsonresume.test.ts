import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { importJsonResume } from './jsonresume.ts';
import { blankProfile, THIS_YEAR, validate } from '../model.ts';

// Official MIT-licensed JSON Resume sample, fetched from:
// https://github.com/jsonresume/resume-schema/blob/master/sample.resume.json
const sample = JSON.parse(readFileSync(new URL('./fixtures/sample.resume.json', import.meta.url), 'utf8'));

test('imports the official sample into a valid Starring profile', () => {
  const { profile, notes } = importJsonResume(sample);
  assert.deepEqual(validate(profile), {});
  assert.equal(profile.profile.name, 'Richard Hendriks');
  assert.equal(profile.profile.role, 'Programmer');
  assert.equal(profile.profile.tagline, `${sample.basics.summary.trim().slice(0, 117)}…`);
  assert.ok((profile.profile.tagline?.length ?? 0) <= 120);
  assert.ok(notes.some((note) => note.includes('summary was shortened')));
  assert.equal(profile.profile.location, 'San Francisco, US');
  assert.equal(profile.profile.links?.email, 'mailto:richard.hendriks@mail.com');
  assert.equal(profile.profile.links?.x, 'https://www.twitter.com');
  assert.equal(profile.profile.links?.soundcloud, 'https://soundcloud.example.com/dandymusicnl');
  assert.equal(profile.experience?.[0].from, 2013);
  assert.equal(profile.experience?.[0].to, 2014);
  assert.match(profile.experience?.[0].summary ?? '', /Successfully won Techcrunch Disrupt/);
  assert.equal(profile.education?.[0].degree, 'Bachelor · Information Technology');
  assert.equal(profile.projects?.[0].visibility, 'public');
  assert.equal(profile.projects?.[0].year, 2016);
  assert.deepEqual(profile.skills?.Compression, ['Mpeg', 'MP4', 'GIF']);
  assert.ok(notes.some((note) => note.includes('Not imported')));
});

test('merge preserves clients, confidential projects, timeline and unrelated profile data without mutation', () => {
  const base = blankProfile();
  base.handle = 'existing-handle';
  base.theme = 'paper';
  base.clients = [{ name: 'Fictional Client', nda: true }];
  base.projects = [{ title: 'Confidential work', year: 2024, visibility: 'nda', blurb: 'Redacted' }];
  base.experience = [{ company: 'Existing company', role: 'Engineer', from: 2020, to: null, clients: ['Fictional Client'] }];
  base.education = [{ school: 'Existing school', degree: 'BSc', from: 2015, to: 2019 }];
  base.profile.links = { github: 'https://github.com/example' };
  base.skills = { Compression: ['Existing skill'] };
  base.platforms = [{ name: 'GitHub', kind: 'public', repos: 2, commits: 4 }];
  const before = structuredClone(base);
  const result = importJsonResume(sample, { base }).profile;
  assert.deepEqual(base, before);
  assert.equal(result.handle, base.handle);
  assert.equal(result.theme, base.theme);
  assert.deepEqual(result.clients, base.clients);
  assert.deepEqual(result.projects?.[0], base.projects[0]);
  assert.deepEqual(result.experience?.[0], base.experience[0]);
  assert.deepEqual(result.education?.[0], base.education[0]);
  assert.equal(result.experience?.length, 2);
  assert.equal(result.education?.length, 2);
  assert.deepEqual(result.platforms, base.platforms);
  assert.equal(result.profile.links?.github, base.profile.links.github);
  assert.deepEqual(result.skills?.Compression, ['Existing skill', 'Mpeg', 'MP4', 'GIF']);
  assert.deepEqual(importJsonResume(sample, { base: result }).profile, result);
});

test('merge never replaces a confidential project with a public project of the same title', () => {
  const base = blankProfile();
  base.projects = [{ title: 'Same title', year: 2020, visibility: 'nda', blurb: 'Redacted' }];
  const { profile } = importJsonResume({ basics: {}, projects: [{ name: 'Same title', description: 'Public description', url: 'https://example.com', startDate: '2024' }] }, { base });
  assert.deepEqual(profile.projects, base.projects);
});

test('supports partial dates, current employment, private projects and missing date notes', () => {
  const { profile, notes } = importJsonResume({ basics: { name: 'Example', summary: 'Short summary.' }, work: [{ name: 'Example Co', position: 'Engineer', startDate: '2020-02' }], projects: [{ name: 'Offline project', description: 'A private draft' }], education: [{ institution: 'Example school', startDate: '2022' }] });
  assert.equal(profile.profile.tagline, 'Short summary.');
  assert.ok(!notes.some((note) => note.includes('summary was shortened')));
  assert.equal(profile.experience?.[0].from, 2020);
  assert.equal(profile.experience?.[0].to, null);
  assert.equal(profile.projects?.[0].visibility, 'private');
  assert.equal(profile.projects?.[0].url, undefined);
  assert.equal(profile.projects?.[0].year, THIS_YEAR);
  assert.equal(profile.education?.[0].to, THIS_YEAR);
  assert.ok(notes.some((n) => n.includes('placeholder year')));
  assert.ok(notes.some((n) => n.includes('no end date')));
});

test('an incomplete basics object keeps existing fields and links in merge mode', () => {
  const base = blankProfile();
  base.profile = { name: 'Existing name', role: 'Existing role', location: 'Somewhere', links: { website: 'https://example.com' } };
  assert.deepEqual(importJsonResume({ basics: {} }, { base }).profile.profile, base.profile);
});

test('reports actionable errors for invalid input, field shapes and dates', () => {
  for (const input of [null, [], 'resume', {}]) assert.throws(() => importJsonResume(input), /object|basics/);
  assert.throws(() => importJsonResume({ basics: [] }), /basics must be an object/);
  assert.throws(() => importJsonResume({ basics: {}, work: 'company' }), /work must be a list/);
  assert.throws(() => importJsonResume({ basics: {}, work: [null] }), /work\[0\]/);
  assert.throws(() => importJsonResume({ basics: {}, work: [{ startDate: 'yesterday' }] }), /YYYY/);
  assert.throws(() => importJsonResume({ basics: {}, work: [{ startDate: '2024', endDate: '2020' }] }), /before startDate/);
  assert.throws(() => importJsonResume({ basics: {}, skills: [{ keywords: [1] }] }), /keywords\[0\] must be text/);
});

test('rejects links that cannot safely render as Starring web links', () => {
  for (const url of ['javascript:alert(1)', 'ftp://example.com', 'not a url']) {
    assert.throws(() => importJsonResume({ basics: { url } }), /http/);
    assert.throws(() => importJsonResume({ basics: {}, projects: [{ url }] }), /http/);
  }
});

test('unusual imported group names remain own data properties', () => {
  const { profile } = importJsonResume({ basics: { profiles: [{ network: '__proto__', url: 'https://example.com' }] }, skills: [{ name: '__proto__', keywords: ['Safe'] }] });
  assert.deepEqual(profile.skills?.['__proto__'], ['Safe']);
  assert.equal(profile.profile.links?.['__proto__'], 'https://example.com');
  assert.equal(Object.getPrototypeOf(profile.skills), Object.prototype);
});
