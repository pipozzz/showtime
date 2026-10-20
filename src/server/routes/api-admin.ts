// POST /api/admin { action: hide | dismiss | unhide, reportId?, handle?, reason? } — ADMIN_EMAILS only.
import type { APIRoute } from 'astro';
import { getSession } from '../auth';
import { isAdmin } from '../blocklist';
import { fail, json, sameOrigin } from '../http';
import { moderate } from '../moderation';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!sameOrigin(request)) return fail(403, 'Cross-origin request blocked');
  const session = await getSession(request);
  if (!session || !isAdmin(session.user.email)) return fail(403, 'Admins only');
  const body = (await request.json().catch(() => ({}))) as { action?: string; reportId?: string; handle?: string; reason?: string };
  if (!['hide', 'dismiss', 'unhide'].includes(body.action ?? '')) return fail(400, 'Unknown action');
  try {
    return json(await moderate(body.action as 'hide' | 'dismiss' | 'unhide', body));
  } catch (e) {
    return fail(400, (e as Error).message);
  }
};
