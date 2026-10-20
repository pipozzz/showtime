// LinkedIn data export (Settings → Data privacy → Get a copy of your data) → Starring draft.
// Runs in the browser. From the ZIP only the profile files below are ever decompressed —
// messages, connections, invitations and everything else are skipped unread.
import { unzipSync } from 'fflate';
import { THIS_YEAR, blankProfile, type Education, type Experience, type Profile, type Project } from '../model';

export const LINKEDIN_FILES = ['Profile.csv', 'Positions.csv', 'Education.csv', 'Skills.csv', 'Projects.csv', 'Certifications.csv'] as const;
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
  const certs = table(files['Certifications.csv'], 'name').map((r) => r.name).filter(Boolean);

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
  if (certs.length) skills.Certifications = [...new Set([...(skills.Certifications ?? []), ...certs])].slice(0, 12);

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
  };

  const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
  notes.push(`From LinkedIn: ${[n(experience.length, 'role'), n(education.length, 'school'), n(skillNames.length, 'skill'), projects.length && n(projects.length, 'project')].filter(Boolean).join(', ')}.`);
  if (experience.length) notes.push('LinkedIn has no clients or stack per role — add them in the Timeline, and mark NDA work under Clients.');
  if (!files['Positions.csv']) notes.push('Positions.csv was not in the export — request "Positions" too for your career timeline.');
  return { profile, notes };
}
