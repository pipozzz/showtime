// POST /api/report { handle, reason, details? } — anyone may report a published profile.
import type { APIRoute } from 'astro';
import { publicBase } from '../../lib/site';
import { getSession } from '../auth';
import { fail, json, sameOrigin } from '../http';
import { REASONS, createReport, rateLimited } from '../moderation';
import { getPublished } from '../profiles';

export const prerender = false;

export const POST: APIRoute = async ({ request, url, site, clientAddress }) => {
  if (!sameOrigin(request)) return fail(403, 'Cross-origin request blocked');
  const key = `${clientAddress ?? request.headers.get('x-forwarded-for') ?? '?'}|${request.headers.get('user-agent') ?? ''}`;
  if (rateLimited(key)) return fail(429, 'Too many reports — try again later');
  const body = (await request.json().catch(() => ({}))) as { handle?: string; reason?: string; details?: string };
  const handle = (body.handle ?? '').trim().toLowerCase();
  if (!handle || !(await getPublished(handle))) return fail(404, 'No such public profile');
  if (!body.reason || !(body.reason in REASONS)) return fail(400, 'Pick a reason');
  const session = await getSession(request);
  await createReport({ handle, reason: body.reason, details: body.details, reporterUserId: session?.user.id }, publicBase(site, url).href);
  return json({ ok: true });
};
