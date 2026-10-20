import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HANDLE, RESERVED, THIS_YEAR, blankProfile, heatmap, totals, validate, type Profile } from './model';

const valid = (): Profile => ({
  ...blankProfile(),
  handle: 'jane-doe',
  profile: { name: 'Jane Doe', role: 'Engineer', links: { github: 'https://github.com/jane', email: 'mailto:jane@example.com' } },
});

test('a filled-in blank profile is valid', () => {
  assert.deepEqual(validate(valid()), {});
});

test('handles: lowercase, digits, dashes, 2–39 chars, not reserved', () => {
  for (const ok of ['ab', 'jane-doe', 'a1', 'x'.repeat(39)]) assert.ok(HANDLE.test(ok), ok);
  for (const bad of ['a', 'Jane', '-jane', 'jane_doe', 'x'.repeat(40), 'jane doe']) assert.ok(!HANDLE.test(bad), bad);
  for (const r of ['edit', 'api', 'themes', 'og', 'login']) {
    assert.ok(RESERVED.includes(r), r);
    assert.equal(validate({ ...valid(), handle: r }).handle, 'This handle is reserved');
  }
});

test('required fields and link schemes are enforced', () => {
  const p = valid();
  p.profile = { ...p.profile, name: ' ', links: { website: 'javascript:alert(1)' } };
  const issues = validate(p);
  assert.equal(issues['profile.name'], 'Required');
  assert.match(issues['profile.links.website'], /https:\/\/ or mailto:/);
});

test('NDA projects may not link to code', () => {
  const p = valid();
  p.projects = [{ title: 'Secret', blurb: 'x', year: 2024, visibility: 'nda', url: 'https://github.com/x/y' }];
  assert.match(validate(p)['projects.0.url'], /NDA/);
});

test('experience cannot end before it starts', () => {
  const p = valid();
  p.experience = [{ company: 'Acme', role: 'Dev', from: 2020, to: 2018 }];
  assert.equal(validate(p)['experience.0.to'], 'Ends before it starts');
});

test('totals add public and private commits and compute the private share', () => {
  const p = valid();
  p.contributions = [
    { year: 2024, public: 100, private: 300 },
    { year: 2025, public: 0, private: 100 },
  ];
  p.experience = [{ company: 'A', role: 'B', from: THIS_YEAR - 5, to: null }];
  const t = totals(p);
  assert.equal(t.all, 500);
  assert.equal(t.privateShare, 80);
  assert.equal(t.years, 5);
});

test('heatmap is deterministic, 53×7, levels 0–4, empty for zero', () => {
  const a = heatmap('jane', 2025, 1200);
  assert.equal(a.length, 53 * 7);
  assert.deepEqual(a, heatmap('jane', 2025, 1200));
  assert.ok(a.every((v) => v >= 0 && v <= 4));
  assert.ok(heatmap('jane', 2025, 0).every((v) => v === 0));
});
