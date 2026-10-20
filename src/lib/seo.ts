// Search and social metadata for profiles: meta description and schema.org JSON-LD.
import { THIS_YEAR, totals, type Profile } from './model';

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export const profileTitle = (p: Profile) => `${p.profile.name} — ${p.profile.role}`;

/** ~155 chars: who, what, proof. */
export const profileDescription = (p: Profile) => {
  const t = totals(p);
  const facts = [
    t.years > 0 && `${t.years} years shipping`,
    t.clients > 0 && `${t.clients} clients`,
    t.all > 0 && `${t.all.toLocaleString('en')} commits`,
  ].filter(Boolean);
  const lead = p.profile.tagline?.trim() || `${p.profile.role}${p.profile.location ? ` in ${p.profile.location}` : ''}.`;
  return clip(`${lead}${facts.length ? ` ${facts.join(' · ')}.` : ''}`, 158);
};

const isUrl = (v?: string) => !!v && /^https?:\/\//.test(v);

/** schema.org ProfilePage → Person, for rich results and knowledge panels. */
export const profileJsonLd = (p: Profile, url: string, image: string) => {
  const me = p.profile;
  const current = (p.experience ?? []).filter((e) => e.to === null);
  const skills = [...new Set(Object.values(p.skills ?? {}).flat())].slice(0, 30);
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url,
    name: profileTitle(p),
    mainEntity: {
      '@type': 'Person',
      '@id': `${url}#person`,
      name: me.name,
      jobTitle: me.role,
      description: me.tagline || undefined,
      url,
      image,
      ...(me.location && { address: { '@type': 'PostalAddress', addressLocality: me.location } }),
      sameAs: Object.values(me.links ?? {}).filter(isUrl),
      ...(skills.length && { knowsAbout: skills }),
      ...(current.length && { worksFor: current.map((e) => ({ '@type': 'Organization', name: e.company })) }),
      ...(p.education?.length && {
        alumniOf: p.education.map((e) => ({ '@type': 'EducationalOrganization', name: e.school })),
      }),
      ...(p.projects?.length && {
        subjectOf: p.projects
          .filter((pr) => pr.visibility === 'public' && isUrl(pr.url))
          .map((pr) => ({ '@type': 'SoftwareSourceCode', name: pr.title, description: pr.blurb, codeRepository: pr.url })),
      }),
    },
  };
};

export const siteJsonLd = (url: string) => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Showtime',
  url,
  description: "Developer careers as scroll stories — including the work GitHub can't show.",
});

export const copyrightYear = THIS_YEAR;
