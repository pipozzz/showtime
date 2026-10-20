import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankProfile, type Profile } from './model';
import { profileDescription, profileJsonLd, profileTitle } from './seo';

const p: Profile = {
  ...blankProfile(),
  handle: 'jane',
  profile: {
    name: 'Jane Doe',
    role: 'Staff Engineer',
    tagline: 'Ships calm software for loud businesses.',
    location: 'Lisbon',
    links: { github: 'https://github.com/jane', email: 'mailto:jane@example.com' },
  },
  contributions: [{ year: 2025, public: 100, private: 900 }],
  clients: [{ name: 'Acme' }, { name: 'Globex', nda: true }],
  experience: [{ company: 'Initech', role: 'Staff Engineer', from: 2019, to: null }],
  education: [{ school: 'TU Wien', degree: 'MSc', from: 2012, to: 2017 }],
  skills: { Backend: ['Go', 'Postgres'] },
  projects: [
    { title: 'open-thing', year: 2024, visibility: 'public', blurb: 'OSS', url: 'https://github.com/jane/open-thing' },
    { title: 'Secret', year: 2023, visibility: 'nda', blurb: 'Classified' },
  ],
};

test('title and description', () => {
  assert.equal(profileTitle(p), 'Jane Doe — Staff Engineer');
  const d = profileDescription(p);
  assert.ok(d.length <= 158, `description is ${d.length} chars`);
  assert.match(d, /Ships calm software/);
  assert.match(d, /2 clients/);
});

test('JSON-LD describes a Person without leaking NDA work or mailto links', () => {
  const ld = profileJsonLd(p, 'https://example.com/jane/', 'https://example.com/og/jane.png') as any;
  assert.equal(ld['@type'], 'ProfilePage');
  const person = ld.mainEntity;
  assert.equal(person['@type'], 'Person');
  assert.equal(person.jobTitle, 'Staff Engineer');
  assert.deepEqual(person.sameAs, ['https://github.com/jane']);
  assert.deepEqual(person.knowsAbout, ['Go', 'Postgres']);
  assert.equal(person.worksFor[0].name, 'Initech');
  assert.equal(person.alumniOf[0].name, 'TU Wien');
  assert.deepEqual(person.subjectOf.map((s: any) => s.name), ['open-thing']);
});
