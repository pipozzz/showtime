import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { blankProfile } from '../model';
import { importLinkedIn, parseCsv, readLinkedInZip } from './linkedin';

const profileCsv = `First Name,Last Name,Maiden Name,Address,Birth Date,Headline,Summary,Industry,Zip Code,Geo Location,Twitter Handles,Websites,Instant Messengers
Jane,Doe,,,,"Platform Engineer | AWS | Kubernetes","Builds calm infrastructure for loud launches. Ex-agency, now independent. Loves boring deploys.",IT,,"Bratislava, Slovakia",,"[PERSONAL:https://jane.dev],[COMPANY:https://acme.example]",`;
const positionsCsv = `Company Name,Title,Description,Location,Started On,Finished On
Indie,Founder,"Platform work for media clients.
Second line.",Remote,Mar 2021,
Bright Agency,"Senior DevOps, Media",Kubernetes for streaming,Prague,Jan 2016,Feb 2021
`;
const educationCsv = `School Name,Start Date,End Date,Notes,Degree Name,Activities
Slovak University of Technology,2009,2014,,MSc Applied Informatics,
`;
const skillsCsv = `Name
AWS
Kubernetes
Terraform
`;
const connectionsCsv = `Notes:
"When exporting your connection data, you may notice…"

First Name,Last Name,URL,Email Address,Company,Position,Connected On
Secret,Person,https://linkedin.com/in/secret,secret@example.com,Acme,CEO,01 Jan 2020
`;

test('parseCsv handles quotes, commas, newlines and BOM', () => {
  assert.deepEqual(parseCsv('﻿a,b\n"x, y","he said ""hi""\nok"\n'), [['a', 'b'], ['x, y', 'he said "hi"\nok']]);
});

test('maps profile, positions, education and skills', () => {
  const { profile, notes } = importLinkedIn({ 'Profile.csv': profileCsv, 'Positions.csv': positionsCsv, 'Education.csv': educationCsv, 'Skills.csv': skillsCsv });
  assert.equal(profile.profile.name, 'Jane Doe');
  assert.equal(profile.profile.role, 'Platform Engineer', 'keeps the role part of the headline');
  assert.equal(profile.profile.tagline, 'Builds calm infrastructure for loud launches. Ex-agency, now independent. Loves boring deploys.');
  assert.equal(profile.profile.location, 'Bratislava, Slovakia');
  assert.equal(profile.profile.links?.website, 'https://jane.dev');
  assert.deepEqual(profile.experience?.map((e) => [e.company, e.role, e.from, e.to]), [
    ['Indie', 'Founder', 2021, null],
    ['Bright Agency', 'Senior DevOps, Media', 2016, 2021],
  ]);
  assert.deepEqual(profile.education?.[0], { school: 'Slovak University of Technology', degree: 'MSc Applied Informatics', from: 2009, to: 2014 });
  assert.deepEqual(profile.skills?.Skills, ['AWS', 'Kubernetes', 'Terraform']);
  assert.match(notes[0], /2 roles, 1 school, 3 skills/);
});

test('long summaries are cut at a sentence boundary', () => {
  const long = profileCsv.replace('Builds calm infrastructure for loud launches. Ex-agency, now independent. Loves boring deploys.', 'Builds calm infrastructure for loud launches across three continents and nine time zones. Ex-agency, now independent and very happy about it. Loves boring deploys.');
  const t = importLinkedIn({ 'Profile.csv': long }).profile.profile.tagline!;
  assert.ok(t.length <= 120, t);
  assert.equal(t, 'Builds calm infrastructure for loud launches across three continents and nine time zones.');
});

test('merge keeps what the draft already has and does not duplicate', () => {
  const base = { ...blankProfile(), profile: { ...blankProfile().profile, name: 'Peter G', role: 'DevOps & Platform Engineer', tagline: 'Mine.' }, clients: [{ name: 'Warner Bros.', nda: true }] };
  const once = importLinkedIn({ 'Profile.csv': profileCsv, 'Positions.csv': positionsCsv }, { base }).profile;
  const twice = importLinkedIn({ 'Profile.csv': profileCsv, 'Positions.csv': positionsCsv }, { base: once }).profile;
  assert.equal(twice.profile.name, 'Peter G');
  assert.equal(twice.profile.role, 'DevOps & Platform Engineer');
  assert.equal(twice.profile.tagline, 'Mine.');
  assert.equal(twice.experience?.length, 2);
  assert.deepEqual(twice.clients, base.clients);
});

test('ZIP: only profile files are read — connections and messages are never decompressed', () => {
  const zip = zipSync({
    'Basic_LinkedInDataExport/Profile.csv': strToU8(profileCsv),
    'Basic_LinkedInDataExport/Positions.csv': strToU8(positionsCsv),
    'Basic_LinkedInDataExport/Connections.csv': strToU8(connectionsCsv),
    'Basic_LinkedInDataExport/messages.csv': strToU8('CONVERSATION ID,FROM,CONTENT\n1,Secret,TOP SECRET MESSAGE'),
  });
  const files = readLinkedInZip(zip);
  assert.deepEqual(Object.keys(files).sort(), ['Positions.csv', 'Profile.csv']);
  assert.ok(!JSON.stringify(importLinkedIn(files)).includes('SECRET'));
  assert.throws(() => readLinkedInZip(zipSync({ 'other.txt': strToU8('x') })), /No LinkedIn profile files/);
});

test('honors, certifications, languages, publications and visible recommendations', () => {
  const { profile, notes } = importLinkedIn({
    'Profile.csv': profileCsv,
    'Honors.csv': 'Title,Description,Issued On\n"Best Developer Tool",Team award for the deploy dashboard,Nov 2024\n',
    'Certifications.csv': 'Name,Url,Authority,Started On,Finished On,License Number\nCKA,https://www.credly.com/badges/abc,CNCF,Mar 2022,,X1\n',
    'Languages.csv': 'Name,Proficiency\nSlovak,Native or bilingual proficiency\nEnglish,Full professional proficiency\nGerman,Elementary proficiency\n',
    'Publications.csv': 'Name,Published On,Description,Publisher,Url\nBoring deploys,May 2023,On calm releases,Pixel Press,https://example.com/boring\n',
    'Recommendations_Received.csv': 'First Name,Last Name,Company,Job Title,Text,Creation Date,Status\nMara,Lind,Northwind,CTO,"Jane made our launches calm.",01/02/24,VISIBLE\nHidden,Person,X,Y,"Not shown on LinkedIn",01/02/24,HIDDEN\n',
  });
  assert.deepEqual(profile.awards, [{ title: 'Best Developer Tool', year: 2024, note: 'Team award for the deploy dashboard' }]);
  assert.deepEqual(profile.certifications, [{ name: 'CKA', issuer: 'CNCF', year: 2022, url: 'https://www.credly.com/badges/abc' }]);
  assert.deepEqual(profile.languages, [{ name: 'Slovak', level: 'Native' }, { name: 'English', level: 'Fluent' }, { name: 'German', level: 'Basic' }]);
  assert.deepEqual(profile.talks, [{ title: 'Boring deploys', kind: 'article', venue: 'Pixel Press', year: 2023, url: 'https://example.com/boring' }]);
  assert.deepEqual(profile.testimonials, [{ quote: 'Jane made our launches calm.', name: 'Mara Lind', role: 'CTO', company: 'Northwind' }], 'hidden recommendations stay out');
  assert.equal(profile.skills?.Certifications, undefined, 'certifications are their own section now');
  assert.ok(notes.some((n) => /1 recommendation/.test(n)) && notes.some((n) => /happy to be quoted/.test(n)));
});
