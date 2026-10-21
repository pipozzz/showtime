// Private beta: "request access" while sign-ups are closed, and admin invites.
// An invited email may sign up (see canSignUp in auth.ts); the invite link only pre-fills
// the form — the email itself is what's allowed, so GitHub/GitLab sign-up works too.
import { randomBytes } from 'node:crypto';
import { desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from './db';
import { adminEmails } from './blocklist';
import { mailEnabled, sendMail } from './mail';

const { accessRequest } = schema;
export type AccessStatus = 'pending' | 'invited' | 'joined' | 'declined';

const EMAIL = /^[^\s@<>()"',;]+@[^\s@<>()"',;]+\.[^\s@<>()"',;]{2,}$/;
const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) || null : null);
export const normEmail = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '');

export class AccessError extends Error {}

/** Validate and store a request. Asking twice is fine; an invited or joined email keeps its status. */
export async function requestAccess(input: { email?: unknown; name?: unknown; link?: unknown; note?: unknown }, baseUrl: string) {
  const email = normEmail(input.email);
  if (!EMAIL.test(email) || email.length > 254) throw new AccessError('Enter a valid email address');
  const link = clip(input.link, 300);
  if (link && !/^https:\/\/[^\s]+$/.test(link)) throw new AccessError('The link should start with https://');
  const [existing] = await db.select().from(accessRequest).where(eq(accessRequest.email, email));
  if (existing) return { status: existing.status as AccessStatus, created: false };
  await db.insert(accessRequest).values({ id: crypto.randomUUID(), email, name: clip(input.name, 120), link, note: clip(input.note, 1000) });
  const admins = adminEmails();
  if (mailEnabled && admins.length) {
    await Promise.allSettled(admins.map((to) => sendMail({
      to,
      subject: `Access request: ${email}`,
      heading: 'Someone wants a stage',
      body: [clip(input.name, 120), email, link, clip(input.note, 400) && `“${clip(input.note, 400)}”`].filter(Boolean).join(' · '),
      action: { label: 'Review in admin', url: new URL('admin', baseUrl).href },
      footer: 'Invite them from the admin page — they get an email with a sign-up link.',
    })));
  }
  return { status: 'pending' as AccessStatus, created: true };
}

/** May this email create an account? (Invited and not yet joined.) */
export const isInvited = async (email: string) => {
  const [r] = await db.select({ status: accessRequest.status }).from(accessRequest).where(eq(accessRequest.email, normEmail(email)));
  return r?.status === 'invited';
};

export const markJoined = (email: string) =>
  db.update(accessRequest).set({ status: 'joined', joinedAt: new Date() }).where(eq(accessRequest.email, normEmail(email)));

/** The email an invite link was made for, if the invite is still open. */
export const invitedEmail = async (token: string | null) => {
  if (!token || token.length > 100) return null;
  const [r] = await db.select({ email: accessRequest.email, status: accessRequest.status }).from(accessRequest).where(eq(accessRequest.token, token));
  return r?.status === 'invited' ? r.email : null;
};

export const listRequests = () =>
  db.select().from(accessRequest).where(inArray(accessRequest.status, ['pending', 'invited'])).orderBy(desc(accessRequest.createdAt)).limit(500);

export const inviteUrl = (token: string, baseUrl: string) => `${new URL('login', baseUrl).href}?mode=signup&invite=${token}`;

/** Invite a request (by id) or any email (adds it). Sends the email when SMTP is set; returns the link either way. */
export async function invite(target: { id?: string; email?: unknown }, baseUrl: string) {
  let row = target.id ? (await db.select().from(accessRequest).where(eq(accessRequest.id, target.id)))[0] : undefined;
  if (!row && target.email !== undefined) {
    const email = normEmail(target.email);
    if (!EMAIL.test(email)) throw new AccessError('Enter a valid email address');
    row = (await db.select().from(accessRequest).where(eq(accessRequest.email, email)))[0];
    if (!row) [row] = await db.insert(accessRequest).values({ id: crypto.randomUUID(), email }).returning();
  }
  if (!row) throw new AccessError('No such request');
  if (row.status === 'joined') throw new AccessError(`${row.email} already has an account`);
  const token = row.token ?? randomBytes(24).toString('base64url');
  await db.update(accessRequest).set({ status: 'invited', token, invitedAt: new Date() }).where(eq(accessRequest.id, row.id));
  const url = inviteUrl(token, baseUrl);
  let mailed = false;
  if (mailEnabled) {
    await sendMail({
      to: row.email,
      subject: 'Your Starring invite',
      heading: 'You’re in — claim your stage',
      body: 'Starring is in private beta and you’re invited. Create your account with this email address, then turn your career into a scroll story — including the work GitHub can’t show.',
      action: { label: 'Create your account', url },
      footer: `This invite is for ${row.email}. Didn’t ask for it? Just ignore this email.`,
    });
    mailed = true;
  }
  return { email: row.email, url, mailed };
}

export const decline = (id: string) => db.update(accessRequest).set({ status: 'declined', token: null }).where(eq(accessRequest.id, id));
