// Local JSON Resume → Starring draft. No network requests or storage.
import { blankProfile, THIS_YEAR, type Award, type Certification, type Interest, type Language, type Profile, type Talk, type Testimonial } from '../model.ts';

type RecordValue = Record<string, unknown>;

const object = (value: unknown, path: string): RecordValue => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as RecordValue;
};

const text = (value: unknown, path: string): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`${path} must be text`);
  return value.trim() || undefined;
};

const strings = (value: unknown, path: string): string[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${path} must be a list`);
  return value.map((v, i) => text(v, `${path}[${i}]`)).filter((v): v is string => !!v);
};

const entries = (value: unknown, path: string): RecordValue[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${path} must be a list`);
  return value.map((v, i) => object(v, `${path}[${i}]`));
};

const url = (value: unknown, path: string): string | undefined => {
  const raw = text(value, path);
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return raw;
  } catch { /* actionable error below */ }
  throw new Error(`${path} must be a complete http:// or https:// URL`);
};

const dateYear = (value: unknown, path: string): number | undefined => {
  const raw = text(value, path);
  if (!raw) return undefined;
  if (!/^[1-2]\d{3}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(raw)) {
    throw new Error(`${path} must use YYYY, YYYY-MM or YYYY-MM-DD`);
  }
  return Number(raw.slice(0, 4));
};

const append = <T>(existing: T[], incoming: T[], key: (item: T) => string): T[] => {
  const seen = new Set(existing.map(key));
  return [...existing, ...incoming.filter((item) => {
    const id = key(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  })];
};

/** Imports parsed JSON Resume data. Merge mode keeps existing career and confidential work. */
export function importJsonResume(json: unknown, opts: { base?: Profile } = {}): { profile: Profile; notes: string[] } {
  const resume = object(json, 'JSON Resume');
  if (!('basics' in resume)) throw new Error('Not a JSON Resume: missing `basics` object');
  const basics = object(resume.basics, 'basics');
  const base = opts.base ?? blankProfile();
  const notes: string[] = [];
  const required = (value: unknown, path: string, fallback: string) => {
    const result = text(value, path);
    if (result) return result;
    notes.push(`${path} is missing — review the “${fallback}” placeholder.`);
    return fallback;
  };
  const startYear = (value: unknown, path: string, fallback = THIS_YEAR) => {
    const year = dateYear(value, path);
    if (year !== undefined) return year;
    notes.push(`${path} is missing — ${fallback} is a placeholder year; update it before publishing.`);
    return fallback;
  };

  const links = { ...base.profile.links };
  const website = url(basics.url, 'basics.url');
  const email = text(basics.email, 'basics.email');
  if (website) links.website = website;
  if (email) links.email = `mailto:${email}`;
  for (const [i, entry] of entries(basics.profiles, 'basics.profiles').entries()) {
    const href = url(entry.url, `basics.profiles[${i}].url`);
    const network = text(entry.network, `basics.profiles[${i}].network`);
    if (href && network) {
      const key = network.toLowerCase() === 'twitter' ? 'x' : network.toLowerCase();
      Object.defineProperty(links, key, { value: href, enumerable: true, configurable: true, writable: true });
    }
  }
  const location = basics.location === undefined ? undefined : object(basics.location, 'basics.location');
  const locationText = location && [text(location.city, 'basics.location.city'), text(location.countryCode, 'basics.location.countryCode')].filter(Boolean).join(', ');
  const summary = text(basics.summary, 'basics.summary');
  const tagline = summary && (summary.length > 120 ? `${summary.slice(0, 117)}…` : summary);
  if (summary && summary.length > 120) notes.push('The summary was shortened to fit the 120-character tagline — review it before publishing.');

  const experience = entries(resume.work, 'work').map((entry, i) => {
    const path = `work[${i}]`;
    const to = dateYear(entry.endDate, `${path}.endDate`) ?? null;
    const from = startYear(entry.startDate, `${path}.startDate`, to ?? THIS_YEAR);
    if (to !== null && to < from) throw new Error(`${path}.endDate is before startDate`);
    return {
      company: required(entry.name, `${path}.name`, 'Company'),
      role: required(entry.position, `${path}.position`, 'Role'),
      from, to,
      summary: [text(entry.summary, `${path}.summary`), ...strings(entry.highlights, `${path}.highlights`)].filter(Boolean).join('\n'),
    };
  });

  const education = entries(resume.education, 'education').map((entry, i) => {
    const path = `education[${i}]`;
    const end = dateYear(entry.endDate, `${path}.endDate`);
    const from = startYear(entry.startDate, `${path}.startDate`, end ?? THIS_YEAR);
    const to = end ?? THIS_YEAR;
    if (to < from) throw new Error(`${path}.endDate is before startDate`);
    if (end === undefined) notes.push(`${path} has no end date — Starring uses ${THIS_YEAR}; review it before publishing.`);
    return {
      school: required(entry.institution, `${path}.institution`, 'School'),
      degree: [text(entry.studyType, `${path}.studyType`), text(entry.area, `${path}.area`)].filter(Boolean).join(' · '),
      from, to,
    };
  });

  const projects = entries(resume.projects, 'projects').map((entry, i) => {
    const path = `projects[${i}]`;
    const href = url(entry.url, `${path}.url`);
    return {
      title: required(entry.name, `${path}.name`, 'Project'),
      year: startYear(entry.startDate ?? entry.endDate, `${path}.startDate`),
      visibility: href ? 'public' as const : 'private' as const,
      blurb: required(entry.description, `${path}.description`, 'Describe what this project does.'),
      role: strings(entry.roles, `${path}.roles`).join(', '),
      impact: strings(entry.highlights, `${path}.highlights`),
      stack: strings(entry.keywords, `${path}.keywords`),
      ...(href && { url: href }),
    };
  });

  const skills = { ...base.skills };
  for (const [i, entry] of entries(resume.skills, 'skills').entries()) {
    const name = text(entry.name, `skills[${i}].name`);
    const keywords = strings(entry.keywords, `skills[${i}].keywords`);
    const group = name ?? 'Skills';
    const previous = Object.hasOwn(skills, group) ? skills[group] : [];
    const values = [...new Set([...previous, ...(keywords.length ? keywords : name ? [name] : [])])];
    Object.defineProperty(skills, group, { value: values, enumerable: true, configurable: true, writable: true });
  }

  const awards: Award[] = entries(resume.awards, 'awards').flatMap((e, i) => {
    const title = text(e.title, `awards[${i}].title`);
    if (!title) return [];
    const by = text(e.awarder, `awards[${i}].awarder`), year = dateYear(e.date, `awards[${i}].date`), note = text(e.summary, `awards[${i}].summary`);
    return [{ title, ...(by && { by }), ...(year && { year }), ...(note && { note: note.slice(0, 160) }) }];
  });
  const certifications: Certification[] = entries(resume.certificates, 'certificates').flatMap((e, i) => {
    const name = text(e.name, `certificates[${i}].name`);
    if (!name) return [];
    const issuer = text(e.issuer, `certificates[${i}].issuer`), year = dateYear(e.date, `certificates[${i}].date`), link = url(e.url, `certificates[${i}].url`);
    return [{ name, ...(issuer && { issuer }), ...(year && { year }), ...(link && { url: link }) }];
  });
  const talks: Talk[] = entries(resume.publications, 'publications').flatMap((e, i) => {
    const title = text(e.name, `publications[${i}].name`);
    if (!title) return [];
    const venue = text(e.publisher, `publications[${i}].publisher`), year = dateYear(e.releaseDate, `publications[${i}].releaseDate`), link = url(e.url, `publications[${i}].url`);
    return [{ title, kind: 'article' as const, ...(venue && { venue }), ...(year && { year }), ...(link && { url: link }) }];
  });
  const languages: Language[] = entries(resume.languages, 'languages').flatMap((e, i) => {
    const name = text(e.language, `languages[${i}].language`);
    const level = text(e.fluency, `languages[${i}].fluency`);
    return name ? [{ name, ...(level && { level }) }] : [];
  });
  const interests: Interest[] = entries(resume.interests, 'interests').flatMap((e, i) => {
    const name = text(e.name, `interests[${i}].name`);
    const keywords = strings(e.keywords, `interests[${i}].keywords`);
    return name ? [{ name, ...(keywords.length && { note: keywords.join(', ') }) }] : [];
  });
  const testimonials: Testimonial[] = entries(resume.references, 'references').flatMap((e, i) => {
    const name = text(e.name, `references[${i}].name`);
    const quote = text(e.reference, `references[${i}].reference`);
    return name && quote ? [{ name, quote: quote.length > 400 ? `${quote.slice(0, 399).trimEnd()}…` : quote }] : [];
  });

  const profile: Profile = {
    ...base,
    profile: {
      ...base.profile,
      name: text(basics.name, 'basics.name') ?? base.profile.name,
      role: text(basics.label, 'basics.label') ?? base.profile.role,
      ...(tagline && { tagline }),
      ...(locationText && { location: locationText }),
      links,
    },
    experience: append(base.experience ?? [], experience, (item) => JSON.stringify([item.company, item.role, item.from])),
    education: append(base.education ?? [], education, (item) => JSON.stringify([item.school, item.degree, item.from])),
    projects: append(base.projects ?? [], projects, (item) => item.title),
    skills,
    awards: append(base.awards ?? [], awards, (x) => x.title.toLowerCase()),
    certifications: append(base.certifications ?? [], certifications, (x) => x.name.toLowerCase()),
    talks: append(base.talks ?? [], talks, (x) => x.title.toLowerCase()),
    languages: append(base.languages ?? [], languages, (x) => x.name.toLowerCase()),
    interests: append(base.interests ?? [], interests, (x) => x.name.toLowerCase()),
    testimonials: append(base.testimonials ?? [], testimonials, (x) => `${x.name}|${x.quote.slice(0, 40)}`.toLowerCase()),
  };
  if (!opts.base) notes.push('Choose your Starring handle and review the imported draft before publishing.');
  const skipped = ['volunteer'].filter((key) => Array.isArray(resume[key]) && resume[key].length);
  if (skipped.length) notes.push(`Not imported (no matching Starring fields): ${skipped.join(', ')}.`);
  return { profile, notes };
}
