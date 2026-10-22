// LinkedIn data export (Settings → Data privacy → Get a copy of your data) → Starring draft.
// Runs in the browser. From the ZIP only the profile files below are ever decompressed —
// messages, connections, invitations and everything else are skipped unread.
import { unzipSync } from 'fflate';
import { THIS_YEAR, blankProfile, type Award, type Certification, type Education, type Experience, type Language, type Profile, type Project, type Talk, type Testimonial } from '../model';

export const LINKEDIN_FILES = [
  'Profile.csv', 'Positions.csv', 'Education.csv', 'Skills.csv', 'Projects.csv', 'Certifications.csv',
  'Honors.csv', 'Languages.csv', 'Publications.csv', 'Recommendations_Received.csv',
] as const;
type FileName = (typeof LINKEDIN_FILES)[number];
export type LinkedInFiles = Partial<Record<FileName, string>>;

// ---------- CSV ----------

/** RFC 4180-ish: quoted fields, "" escapes, newlines inside quotes, BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim()));
}

/** Rows as objects keyed by lower-cased header. Skips LinkedIn's "Notes:" preambles before the header. */
const table = (text: string | undefined, mustHave: string): Record<string, string>[] => {
  if (!text) return [];
  const rows = parseCsv(text);
  const h = rows.findIndex((r) => r.some((c) => c.trim().toLowerCase() === mustHave));
  if (h < 0) return [];
  const header = rows[h].map((c) => c.trim().toLowerCase());
  return rows.slice(h + 1).map((r) => Object.fromEntries(header.map((k, i) => [k, (r[i] ?? '').trim()])));
};

const year = (v: string | undefined): number | undefined => {
  const m = /(19|20)\d{2}/.exec(v ?? '');
  return m ? Number(m[0]) : undefined;
};

const clip = (s: string | undefined, n: number) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const sentence = t.slice(0, n).match(/^.*[.!?](?=\s|$)/)?.[0];
  return sentence && sentence.length > n * 0.5 ? sentence : `${t.slice(0, n - 1).trimEnd()}…`;
};

const websites = (raw: string | undefined) =>
  [...(raw ?? '').matchAll(/https?:\/\/[^\s,\]]+/g)].map((m) => m[0]);

// ---------- ZIP ----------

/** Pull only the known profile CSVs out of a LinkedIn export ZIP. */
export function readLinkedInZip(zip: Uint8Array): LinkedInFiles {
  const wanted = new Set<string>(LINKEDIN_FILES);
  const files = unzipSync(zip, { filter: (f) => wanted.has(f.name.split('/').pop() ?? '') });
  const out: LinkedInFiles = {};
  for (const [path, data] of Object.entries(files)) {
    out[path.split('/').pop() as FileName] = new TextDecoder().decode(data);
  }
  if (!Object.keys(out).length) throw new Error('No LinkedIn profile files found in this ZIP (expected Profile.csv, Positions.csv, …)');
  return out;
}

// ---------- mapping ----------

/**
 * Map the export to a profile. With `base` (merge), filled-in fields are kept and
 * career, education, projects and skills are appended without duplicates.
 */
export function importLinkedIn(files: LinkedInFiles, opts: { base?: Profile } = {}): { profile: Profile; notes: string[] } {
  const base = opts.base ?? blankProfile();
  const fresh = !opts.base;
  const notes: string[] = [];
  const blank = blankProfile().profile;
  const keep = (current: string | undefined, placeholder: string | undefined, next: string | undefined) =>
    !fresh && current && current !== placeholder ? current : next || current || '';

  const [me] = table(files['Profile.csv'], 'first name');
  const name = [me?.['first name'], me?.['last name']].filter(Boolean).join(' ');
  // Headlines are often "Role | skill | skill" or "Role at Company" — keep the role part.
  const headline = me?.headline?.split(/\s[|•·]\s|\sat\s|\s@\s/)[0]?.trim();
  const sites = websites(me?.websites);

  const experience: Experience[] = table(files['Positions.csv'], 'company name')
    .map((r) => ({
      company: r['company name'],
      role: r.title || 'Role',
      from: year(r['started on']) ?? THIS_YEAR,
      to: year(r['finished on']) ?? null,
      summary: clip(r.description, 160),
      clients: [],
      stack: [],
    }))
    .filter((e) => e.company);

  const education: Education[] = table(files['Education.csv'], 'school name')
    .map((r) => {
      const from = year(r['start date']) ?? year(r['end date']) ?? THIS_YEAR;
      return { school: r['school name'], degree: [r['degree name'], r.notes].filter(Boolean).join(' · ').slice(0, 120), from, to: year(r['end date']) ?? from };
    })
    .filter((e) => e.school);

  const projects: Project[] = table(files['Projects.csv'], 'title')
    .map((r) => {
      const url = websites(r.url)[0];
      return {
        title: r.title,
        year: year(r['started on']) ?? year(r['finished on']) ?? THIS_YEAR,
        visibility: url ? ('public' as const) : ('private' as const),
        blurb: clip(r.description, 180) || 'Describe what this project does.',
        impact: [],
        stack: [],
        ...(url && { url }),
      };
    })
    .filter((p) => p.title);

  const skillNames = table(files['Skills.csv'], 'name').map((r) => r.name).filter(Boolean);
  const link = (v: string | undefined) => websites(v)[0];

  const certifications: Certification[] = table(files['Certifications.csv'], 'name')
    .map((r) => ({ name: r.name, ...(r.authority && { issuer: r.authority }), ...(year(r['started on']) && { year: year(r['started on']) }), ...(link(r.url) && { url: link(r.url) }) }))
    .filter((c) => c.name);

  const awards: Award[] = table(files['Honors.csv'], 'title')
    .map((r) => ({ title: r.title, ...(year(r['issued on']) && { year: year(r['issued on']) }), ...(r.description && { note: clip(r.description, 140) }) }))
    .filter((a) => a.title);

  const talks: Talk[] = table(files['Publications.csv'], 'name')
    .map((r) => ({ title: r.name, kind: 'article' as const, ...(r.publisher && { venue: r.publisher }), ...(year(r['published on']) && { year: year(r['published on']) }), ...(link(r.url) && { url: link(r.url) }) }))
    .filter((t) => t.title);

  // LinkedIn levels: "Native or bilingual proficiency", "Full professional proficiency", …
  const LEVEL: [RegExp, string][] = [[/native|bilingual/i, 'Native'], [/full professional/i, 'Fluent'], [/professional working/i, 'Professional'], [/limited working/i, 'Conversational'], [/elementary/i, 'Basic']];
  const languages: Language[] = table(files['Languages.csv'], 'name')
    .map((r) => ({ name: r.name, ...(r.proficiency && { level: LEVEL.find(([re]) => re.test(r.proficiency))?.[1] ?? r.proficiency }) }))
    .filter((l) => l.name);

  // only recommendations that are visible on the LinkedIn profile already
  const testimonials: Testimonial[] = table(files['Recommendations_Received.csv'], 'text')
    .filter((r) => !r.status || /visible/i.test(r.status))
    .map((r) => ({ quote: clip(r.text, 380), name: [r['first name'], r['last name']].filter(Boolean).join(' '), ...(r['job title'] && { role: r['job title'] }), ...(r.company && { company: r.company }) }))
    .filter((t) => t.quote && t.name)
    .slice(0, 6);

  const key = (...v: (string | number | null | undefined)[]) => v.map((x) => String(x ?? '').toLowerCase()).join('|');
  const append = <T,>(a: T[], b: T[], k: (x: T) => string) => {
    const seen = new Set(a.map(k));
    return [...a, ...b.filter((x) => !seen.has(k(x)) && seen.add(k(x)))];
  };

  const skills = { ...(fresh ? {} : base.skills) };
  if (skillNames.length) {
    const group = Object.keys(skills).find((g) => g.toLowerCase() === 'skills') ?? 'Skills';
    skills[group] = [...new Set([...(skills[group] ?? []), ...skillNames])].slice(0, 24);
  }

  const profile: Profile = {
    ...base,
    profile: {
      ...base.profile,
      name: keep(base.profile.name, blank.name, name),
      role: keep(base.profile.role, blank.role, headline),
      tagline: keep(base.profile.tagline, '', clip(me?.summary, 120)),
      location: keep(base.profile.location, '', me?.['geo location']),
      links: { ...base.profile.links, ...(sites[0] && !base.profile.links?.website && { website: sites[0] }) },
    },
    experience: append(fresh ? [] : base.experience ?? [], experience, (e) => key(e.company, e.role, e.from)),
    education: append(fresh ? [] : base.education ?? [], education, (e) => key(e.school, e.from)),
    projects: append(base.projects ?? [], projects, (p) => key(p.title)),
    skills,
    certifications: append(fresh ? [] : base.certifications ?? [], certifications, (c) => key(c.name)),
    awards: append(fresh ? [] : base.awards ?? [], awards, (a) => key(a.title)),
    talks: append(fresh ? [] : base.talks ?? [], talks, (t) => key(t.title)),
    languages: append(fresh ? [] : base.languages ?? [], languages, (l) => key(l.name)),
    testimonials: append(fresh ? [] : base.testimonials ?? [], testimonials, (t) => key(t.name, t.quote.slice(0, 40))),
  };

  const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
  notes.push(`From LinkedIn: ${[
    n(experience.length, 'role'), n(education.length, 'school'), n(skillNames.length, 'skill'),
    projects.length && n(projects.length, 'project'), certifications.length && n(certifications.length, 'certification'),
    awards.length && n(awards.length, 'award'), talks.length && n(talks.length, 'publication'),
    languages.length && n(languages.length, 'language'), testimonials.length && n(testimonials.length, 'recommendation'),
  ].filter(Boolean).join(', ')}.`);
  if (testimonials.length) notes.push('Recommendations became testimonials — they were public on LinkedIn, but check the people are happy to be quoted here too.');
  if (experience.length) notes.push('LinkedIn has no clients or stack per role — add them in the Timeline, and mark NDA work under Clients.');
  if (!files['Positions.csv']) notes.push('Positions.csv was not in the export — request "Positions" too for your career timeline.');
  return { profile, notes };
}
