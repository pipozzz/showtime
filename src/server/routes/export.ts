// GET /api/me/export — everything this instance stores about the signed-in user (GDPR Art. 15/20),
// as one JSON download. OAuth tokens and password hashes are never included.
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { getSession } from '../auth';
import { db, schema } from '../db';
import { fail } from '../http';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return fail(401, 'Sign in first');
  const id = session.user.id;
  const [user] = await db.select().from(schema.user).where(eq(schema.user.id, id));
  const accounts = await db
    .select({ provider: schema.account.providerId, accountId: schema.account.accountId, scope: schema.account.scope, createdAt: schema.account.createdAt })
    .from(schema.account)
    .where(eq(schema.account.userId, id));
  const sessions = await db
    .select({ createdAt: schema.session.createdAt, expiresAt: schema.session.expiresAt, ipAddress: schema.session.ipAddress, userAgent: schema.session.userAgent })
    .from(schema.session)
    .where(eq(schema.session.userId, id));
  const [profile] = await db.select().from(schema.profile).where(eq(schema.profile.userId, id));
  const reports = await db
    .select({ handle: schema.report.handle, reason: schema.report.reason, details: schema.report.details, status: schema.report.status, createdAt: schema.report.createdAt })
    .from(schema.report)
    .where(eq(schema.report.reporterUserId, id));

  const body = {
    exportedAt: new Date().toISOString(),
    account: { id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified, createdAt: user.createdAt, updatedAt: user.updatedAt },
    signInMethods: accounts.map((a) => ({ ...a, provider: a.provider === 'credential' ? 'email + password' : a.provider })),
    sessions,
    profile: profile ? { handle: profile.handle, published: profile.published, hidden: !!profile.hiddenAt, hiddenReason: profile.hiddenReason, createdAt: profile.createdAt, updatedAt: profile.updatedAt, data: profile.data } : null,
    reportsYouFiled: reports,
  };
  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="starring-data-${day}.json"`,
      'Cache-Control': 'no-store',
    },
  });
};
