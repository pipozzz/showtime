// `starring scan` output (starring-activity.json) → Starring profile.
// Merges counts only: per-year private commits, platforms, and daily activity for the heatmap.
import { blankProfile, type Contribution, type Platform, type Profile } from '../model';

export interface ActivityFile {
  kind: 'starring-activity';
  version: 1;
  totals: { commits: number; repos: number };
  years: { year: number; commits: number }[];
  days: Record<string, number>;
  platforms: { name: string; repos: number; commits: number }[];
}

const count = (v: unknown, path: string) => {
  if (!Number.isInteger(v) || (v as number) < 0) throw new Error(`${path} must be a whole number ≥ 0`);
  return v as number;
};

export const isActivityFile = (data: unknown): data is ActivityFile =>
  !!data && typeof data === 'object' && (data as { kind?: unknown }).kind === 'starring-activity';

/** Validate untrusted JSON and keep only the fields we use. */
export function parseActivity(data: unknown): ActivityFile {
  if (!isActivityFile(data)) throw new Error('Not a starring-activity file');
  if (data.version !== 1) throw new Error(`Unsupported activity file version ${String(data.version)} — update Starring`);
  const years = (Array.isArray(data.years) ? data.years : []).map((y, i) => ({
    year: count(y?.year, `years[${i}].year`),
    commits: count(y?.commits, `years[${i}].commits`),
  }));
  const rawDays = data.days && typeof data.days === 'object' ? Object.entries(data.days) : [];
  if (rawDays.length > 40 * 366) throw new Error('Too many days in activity file');
  const days: Record<string, number> = {};
  for (const [d, n] of rawDays) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`days["${d}"] is not a YYYY-MM-DD date`);
    days[d] = count(n, `days["${d}"]`);
  }
  const platforms = (Array.isArray(data.platforms) ? data.platforms : []).map((p, i) => ({
    name: String(p?.name ?? '').slice(0, 80) || 'Git',
    repos: count(p?.repos, `platforms[${i}].repos`),
    commits: count(p?.commits, `platforms[${i}].commits`),
  }));
  return { kind: 'starring-activity', version: 1, totals: { commits: count(data.totals?.commits ?? 0, 'totals.commits'), repos: count(data.totals?.repos ?? 0, 'totals.repos') }, years, days, platforms };
}

/**
 * Merge a scan into a profile. Scanned commits count as private work:
 * each year's `private` is replaced by the scan (marked verified), `public` is kept.
 * Scanned platforms are added as private; a scanned "GitHub" becomes "GitHub (private repos)"
 * so it doesn't clash with the public GitHub entry from the GitHub importer.
 */
export function importActivity(data: unknown, opts: { base?: Profile } = {}): { profile: Profile; notes: string[] } {
  const scan = parseActivity(data);
  const base = opts.base ?? blankProfile();
  const notes: string[] = [];

  const byYear = new Map<number, Contribution>((base.contributions ?? []).map((c) => [c.year, { ...c }]));
  for (const { year, commits } of scan.years) {
    const prev = byYear.get(year);
    byYear.set(year, { year, public: prev?.public ?? 0, private: commits, verified: true });
  }
  const contributions = [...byYear.values()].sort((a, b) => b.year - a.year);

  const platforms: Platform[] = [...(base.platforms ?? [])];
  for (const p of scan.platforms) {
    const name = p.name === 'GitHub' ? 'GitHub (private repos)' : p.name;
    const i = platforms.findIndex((x) => x.name === name && x.kind === 'private');
    const entry: Platform = { name, kind: 'private', repos: p.repos, commits: p.commits };
    if (i >= 0) platforms[i] = entry;
    else platforms.push(entry);
  }

  notes.push(`Imported ${scan.totals.commits.toLocaleString('en')} commits from ${scan.totals.repos} local repos as private work — only dates and counts.`);
  if (scan.platforms.some((p) => p.name === 'GitHub')) {
    notes.push('The scan included GitHub repos. If some are public, they may already be counted under public — re-scan with --exclude github.com to avoid double counting.');
  }
  return { profile: { ...base, contributions, platforms, activity: scan.days }, notes };
}
