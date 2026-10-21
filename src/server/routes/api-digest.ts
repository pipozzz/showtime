// POST /api/digest { weekly: boolean } — the signed-in owner's weekly email on or off.
import type { APIRoute } from 'astro';
import { getSession } from '../auth';
import { setWeeklyDigest } from '../digest';
import { fail, json, sameOrigin } from '../http';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!sameOrigin(request)) return fail(403, 'Cross-origin request blocked');
  const session = await getSession(request);
  if (!session) return fail(401, 'Sign in first');
  const { weekly } = (await request.json().catch(() => ({}))) as { weekly?: unknown };
  if (typeof weekly !== 'boolean') return fail(400, 'weekly must be true or false');
  await setWeeklyDigest(session.user.id, weekly);
  return json({ weekly });
};
