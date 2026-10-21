// POST /api/admin — ADMIN_EMAILS only.
//   moderation: { action: hide | dismiss | unhide, reportId?, handle?, reason? }
//   private beta: { action: invite, id? | email? } → { url, mailed }  ·  { action: decline, id }
import type { APIRoute } from 'astro';
import { getSession } from '../auth';
import { isAdmin } from '../blocklist';
import { fail, json, sameOrigin } from '../http';
import { moderate } from '../moderation';
import { AccessError, decline, invite } from '../access';
import { publicBase } from '../../lib/site';

export const prerender = false;

export const POST: APIRoute = async ({ request, url, site }) => {
  if (!sameOrigin(request)) return fail(403, 'Cross-origin request blocked');
  const session = await getSession(request);
  if (!session || !isAdmin(session.user.email)) return fail(403, 'Admins only');
  const body = (await request.json().catch(() => ({}))) as { action?: string; reportId?: string; handle?: string; reason?: string; id?: string; email?: string };
  if (body.action === 'invite') {
    try {
      return json(await invite({ id: body.id, email: body.email }, publicBase(site, url).href));
    } catch (e) {
      if (e instanceof AccessError) return fail(400, e.message);
      throw e;
    }
  }
  if (body.action === 'decline' && body.id) {
    await decline(body.id);
    return json({ ok: true });
  }
  if (!['hide', 'dismiss', 'unhide'].includes(body.action ?? '')) return fail(400, 'Unknown action');
  try {
    return json(await moderate(body.action as 'hide' | 'dismiss' | 'unhide', body));
  } catch (e) {
    return fail(400, (e as Error).message);
  }
};
