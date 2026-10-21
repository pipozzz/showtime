// The numbers at the top of /admin: how the instance is doing, at a glance.
import { count, eq, gte, sql } from 'drizzle-orm';
import { db, schema } from './db';

const { user, profile, accessRequest } = schema;
const DAYS = 14;

/** Per-day counts for the last DAYS days (oldest first, zeros filled in). */
const perDay = async (table: typeof user | typeof accessRequest) => {
  const since = new Date(Date.now() - (DAYS - 1) * 864e5);
  since.setUTCHours(0, 0, 0, 0);
  const rows = await db
    .select({ day: sql<string>`to_char(date_trunc('day', ${table.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`, n: count() })
    .from(table)
    .where(gte(table.createdAt, since))
    .groupBy(sql`1`);
  const byDay = new Map(rows.map((r) => [r.day, Number(r.n)]));
  return Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(since.getTime() + i * 864e5).toISOString().slice(0, 10);
    return { day: d, n: byDay.get(d) ?? 0 };
  });
};

export async function instanceOverview() {
  const [[users], [profiles], [published], requests, signups, asks] = await Promise.all([
    db.select({ n: count() }).from(user),
    db.select({ n: count() }).from(profile),
    db.select({ n: count() }).from(profile).where(eq(profile.published, true)),
    db.select({ status: accessRequest.status, n: count() }).from(accessRequest).groupBy(accessRequest.status),
    perDay(user),
    perDay(accessRequest),
  ]);
  const status = Object.fromEntries(requests.map((r) => [r.status, Number(r.n)])) as Record<string, number>;
  const invited = (status.invited ?? 0) + (status.joined ?? 0);
  return {
    users: Number(users.n),
    profiles: Number(profiles.n),
    published: Number(published.n),
    pending: status.pending ?? 0,
    invited: status.invited ?? 0,
    joined: status.joined ?? 0,
    /** Share of invites that turned into accounts. */
    conversion: invited ? Math.round(((status.joined ?? 0) / invited) * 100) : null,
    signups,
    requests: asks,
  };
}
