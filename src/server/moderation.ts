// Reports from visitors and the moderator actions behind /admin.
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { fileHandles } from '../lib/profiles';
import { db, schema } from './db';
import { adminEmails } from './blocklist';
import { mailEnabled, sendMail } from './mail';

const { report, profile } = schema;

export const REASONS = {
  impersonation: 'Pretends to be someone else or a company',
  false: 'False or misleading claims',
  confidential: 'Reveals confidential or NDA information',
  ip: 'Uses logos, trademarks or content without rights',
  harassment: 'Harassment, hate or illegal content',
  spam: 'Spam or not a real profile',
  other: 'Something else',
} as const;
export type Reason = keyof typeof REASONS;

// In-memory rate limit per client (IP + user agent): enough to stop casual flooding.
const hits = new Map<string, number[]>();
export const rateLimited = (key: string, max = 5, windowMs = 60 * 60 * 1000) => {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > max;
};

export async function createReport(input: { handle: string; reason: string; details?: string; reporterUserId?: string }, baseUrl: string) {
  if (!(input.reason in REASONS)) throw new Error('Pick a reason');
  const id = crypto.randomUUID();
  const details = input.details?.trim().slice(0, 2000) || null;
  await db.insert(report).values({ id, handle: input.handle, reason: input.reason, details, reporterUserId: input.reporterUserId ?? null });
  const admins = adminEmails();
  if (mailEnabled && admins.length) {
    await Promise.allSettled(admins.map((to) => sendMail({
      to,
      subject: `Report: /${input.handle} — ${REASONS[input.reason as Reason]}`,
      heading: `/${input.handle} was reported`,
      body: `${REASONS[input.reason as Reason]}.${details ? ` “${details.slice(0, 400)}”` : ''}`,
      action: { label: 'Review in admin', url: new URL('/admin', baseUrl).href },
      footer: `Profile: ${new URL(`/${input.handle}`, baseUrl).href}`,
    })));
  }
  return id;
}

/** Open reports, newest first. Reports on profiles that no longer exist (account or profile deleted) are closed on the way. */
export async function openReports() {
  const open = await db.select().from(report).where(eq(report.status, 'open')).orderBy(desc(report.createdAt)).limit(200);
  if (!open.length) return open;
  const live = new Set([...(await db.select({ handle: profile.handle }).from(profile)).map((p) => p.handle), ...fileHandles()]);
  const gone = open.filter((r) => !live.has(r.handle)).map((r) => r.id);
  if (gone.length) await db.update(report).set({ status: 'dismissed', resolvedAt: new Date() }).where(inArray(report.id, gone));
  return open.filter((r) => live.has(r.handle));
}

export const hiddenProfiles = () =>
  db.select({ handle: profile.handle, hiddenAt: profile.hiddenAt, hiddenReason: profile.hiddenReason }).from(profile).where(isNotNull(profile.hiddenAt)).orderBy(desc(profile.hiddenAt));

/** hide: take the profile off every public surface; dismiss: close the report; unhide: restore. */
export async function moderate(action: 'hide' | 'dismiss' | 'unhide', target: { reportId?: string; handle?: string; reason?: string }) {
  let handle = target.handle;
  if (target.reportId) {
    const [r] = await db.select().from(report).where(eq(report.id, target.reportId));
    if (!r) throw new Error('No such report');
    handle ??= r.handle;
  }
  if (!handle) throw new Error('No profile given');
  const now = new Date();
  if (action === 'hide') {
    await db.update(profile).set({ hiddenAt: now, hiddenReason: target.reason?.slice(0, 300) || 'Hidden by a moderator', published: false }).where(eq(profile.handle, handle));
    await db.update(report).set({ status: 'actioned', resolvedAt: now }).where(and(eq(report.handle, handle), eq(report.status, 'open')));
  } else if (action === 'unhide') {
    await db.update(profile).set({ hiddenAt: null, hiddenReason: null }).where(eq(profile.handle, handle));
  } else if (target.reportId) {
    await db.update(report).set({ status: 'dismissed', resolvedAt: now }).where(eq(report.id, target.reportId));
  }
  return { handle, action };
}
