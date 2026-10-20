// Browser-safe profile model: types, derived numbers, validation.
// Shared by the static pages and the visual editor.

export type Visibility = 'public' | 'private' | 'nda';
/** A theme id — a folder in src/themes/. */
export type Theme = string;

export interface Contribution { year: number; public: number; private: number; verified?: boolean }
export interface Platform { name: string; kind: 'public' | 'private'; repos: number; commits: number }
export interface Client { name: string; sector?: string; nda?: boolean }
export interface Experience {
  company: string;
  role: string;
  from: number;
  to: number | null;
  summary?: string;
  clients?: string[];
  stack?: string[];
}
export interface Project {
  title: string;
  client?: string;
  year: number;
  visibility: Visibility;
  role?: string;
  blurb: string;
  impact?: string[];
  stack?: string[];
  url?: string;
}
export interface Education { school: string; degree: string; from: number; to: number }

export interface Profile {
  handle: string;
  theme?: Theme;
  profile: {
    name: string;
    role: string;
    location?: string;
    tagline?: string;
    available?: boolean;
    links?: Record<string, string>;
  };
  contributions?: Contribution[];
  platforms?: Platform[];
  clients?: Client[];
  experience?: Experience[];
  projects?: Project[];
  education?: Education[];
  skills?: Record<string, string[]>;
}


export const HANDLE = /^[a-z0-9][a-z0-9-]{1,38}$/;
/** Handles that would collide with app routes. */
export const RESERVED = ['edit', 'api', 'login', 'logout', 'settings', 'examples', 'profiles', 'assets', 'admin', 'new', 'themes', 'og', 'oembed', 'sitemap', 'robots', 'favicon'];
export const THIS_YEAR = new Date().getFullYear();

export const blankProfile = (): Profile => ({
  handle: 'your-handle',
  theme: 'acid',
  profile: { name: 'Your Name', role: 'What you do', tagline: '', location: '', available: true, links: {} },
  contributions: [{ year: THIS_YEAR - 1, public: 0, private: 0, verified: false }],
  platforms: [],
  clients: [],
  experience: [],
  projects: [],
  education: [],
  skills: {},
});

// ---------- validation ----------

export type Issues = Record<string, string>;

/** Returns path → message, e.g. { 'projects.2.title': 'Required' }. Empty = valid. */
export const validate = (p: Profile): Issues => {
  const out: Issues = {};
  const req = (path: string, v: unknown) => {
    if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) out[path] = 'Required';
  };
  if (!HANDLE.test(p.handle ?? '')) out.handle = 'Lowercase letters, digits and dashes, 2–39 chars';
  else if (RESERVED.includes(p.handle)) out.handle = 'This handle is reserved';
  req('profile.name', p.profile?.name);
  req('profile.role', p.profile?.role);
  Object.entries(p.profile?.links ?? {}).forEach(([k, v]) => {
    if (v && !/^(https?:|mailto:)/.test(v)) out[`profile.links.${k}`] = 'Must start with https:// or mailto:';
  });
  p.experience?.forEach((e, i) => {
    req(`experience.${i}.company`, e.company);
    req(`experience.${i}.role`, e.role);
    if (e.to !== null && e.to < e.from) out[`experience.${i}.to`] = 'Ends before it starts';
  });
  p.projects?.forEach((pr, i) => {
    req(`projects.${i}.title`, pr.title);
    req(`projects.${i}.blurb`, pr.blurb);
    if (pr.url && !/^https?:/.test(pr.url)) out[`projects.${i}.url`] = 'Must start with https://';
    if (pr.url && pr.visibility === 'nda') out[`projects.${i}.url`] = 'NDA projects should not link to code';
  });
  p.clients?.forEach((c, i) => req(`clients.${i}.name`, c.name));
  p.education?.forEach((e, i) => req(`education.${i}.school`, e.school));
  return out;
};

// ---------- derived numbers ----------

export const totals = (p: Profile) => {
  const c = p.contributions ?? [];
  const pub = c.reduce((s, y) => s + (y.public || 0), 0);
  const priv = c.reduce((s, y) => s + (y.private || 0), 0);
  const years = (p.experience ?? []).map((e) => e.from).filter(Boolean);
  const start = years.length ? Math.min(...years) : THIS_YEAR;
  return {
    public: pub,
    private: priv,
    all: pub + priv,
    privateShare: pub + priv ? Math.round((priv / (pub + priv)) * 100) : 0,
    years: THIS_YEAR - start,
    clients: p.clients?.length ?? 0,
    repos: (p.platforms ?? []).reduce((s, x) => s + (x.repos || 0), 0),
  };
};

/**
 * Turn a yearly total into a 53x7 heatmap. Deterministic per (handle, year)
 * so builds are stable. Real importers will replace this with daily data.
 */
export const heatmap = (handle: string, year: number, total: number): number[] => {
  let seed = [...`${handle}${year}`].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const weights = Array.from({ length: 53 * 7 }, (_, i) => {
    const weekday = i % 7;
    const base = weekday === 0 || weekday === 6 ? 0.15 : 1;
    return rnd() < 0.12 ? 0 : base * rnd() ** 1.6;
  });
  if (!total) return weights.map(() => 0);
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const days = weights.map((w) => (w / sum) * total);
  const max = Math.max(...days) || 1;
  return days.map((d) => (d === 0 ? 0 : Math.min(4, Math.ceil((d / max) * 4))));
};
