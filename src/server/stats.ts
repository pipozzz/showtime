// Visitor numbers for a profile owner, read from the instance's own Plausible (the one
// PLAUSIBLE_SRC loads on every page) through the Stats API v2. Off unless PLAUSIBLE_API_KEY
// is set. The key stays on the server and owners only ever see their own page.

export interface OwnerStats {
  days: number;
  visitors: number;
  pageviews: number;
  /** Visitors per day, oldest first, one entry per day (zeros filled in). */
  daily: { date: string; visitors: number }[];
  sources: { name: string; visitors: number }[];
  countries: { name: string; visitors: number }[];
}

const origin = (u?: string) => {
  try { return u ? new URL(u).origin : undefined; } catch { return undefined; }
};
const hostname = (u?: string) => {
  try { return u ? new URL(u).hostname : undefined; } catch { return undefined; }
};

/** Where to ask, and for which site. null = not configured. */
export const statsConfig = (env: NodeJS.ProcessEnv = process.env) => {
  const key = env.PLAUSIBLE_API_KEY?.trim();
  if (!key) return null;
  const host = origin(env.PLAUSIBLE_API_HOST) ?? origin(env.PLAUSIBLE_SRC) ?? 'https://plausible.io';
  const site = env.PLAUSIBLE_SITE_ID?.trim() || hostname(env.SITE_URL) || hostname(env.BETTER_AUTH_URL);
  return site ? { key, host, site } : null;
};

const DAYS = 30;
const TTL = 5 * 60_000;
const cache = new Map<string, { at: number; value: OwnerStats }>();

/** A profile's page in both spellings — Plausible records whatever the visitor's URL was. */
const spellings = (page: string) => [page.replace(/\/?$/, '/'), page.replace(/\/$/, '')];

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** `page` is the profile's path, e.g. pageLink(handle). */
export const ownerStats = async (page: string, get: typeof fetch = fetch, env = process.env): Promise<OwnerStats | null> => {
  const cfg = statsConfig(env);
  if (!cfg) return null;
  const hit = cache.get(page);
  if (hit && Date.now() - hit.at < TTL) return hit.value;

  const query = async (extra: object) => {
    const res = await get(`${cfg.host}/api/v2/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_id: cfg.site, date_range: `${DAYS}d`, filters: [['is', 'event:page', spellings(page)]], ...extra }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Plausible ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return ((await res.json()) as { results: { metrics: number[]; dimensions: string[] }[] }).results;
  };
  const top = (dimension: string) =>
    query({ metrics: ['visitors'], dimensions: [dimension], order_by: [['visitors', 'desc']], pagination: { limit: 5 } }).then((r) =>
      r.map((x) => ({ name: x.dimensions[0] || 'Direct / none', visitors: x.metrics[0] })),
    );

  const [totals, perDay, sources, countries] = await Promise.all([
    query({ metrics: ['visitors', 'pageviews'] }),
    query({ metrics: ['visitors'], dimensions: ['time:day'] }),
    top('visit:source'),
    top('visit:country_name'),
  ]);
  const byDay = new Map(perDay.map((x) => [x.dimensions[0], x.metrics[0]]));
  const today = new Date();
  const daily = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (DAYS - 1 - i)));
    return { date: isoDay(d), visitors: byDay.get(isoDay(d)) ?? 0 };
  });
  const value: OwnerStats = { days: DAYS, visitors: totals[0]?.metrics[0] ?? 0, pageviews: totals[0]?.metrics[1] ?? 0, daily, sources, countries };
  cache.set(page, { at: Date.now(), value });
  return value;
};
