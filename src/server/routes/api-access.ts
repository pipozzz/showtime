// POST /api/access { email, name?, link?, note? } — ask for an account while sign-ups are closed.
import type { APIRoute } from 'astro';
import { publicBase } from '../../lib/site';
import { AccessError, requestAccess } from '../access';
import { clientIp, fail, json, sameOrigin } from '../http';
import { rateLimited } from '../moderation';

export const prerender = false;

export const POST: APIRoute = async ({ request, url, site, clientAddress }) => {
  if (!sameOrigin(request)) return fail(403, 'Cross-origin request blocked');
  const key = `access|${clientIp(request, clientAddress)}`;
  if (rateLimited(key, 5)) return fail(429, 'Too many requests — try again later');
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.website) return json({ ok: true, status: 'pending' }); // honeypot: bots fill every field
  try {
    const { status } = await requestAccess(body, publicBase(site, url).href);
    // same answer whether or not the email was already on the list
    return json({ ok: true, status: status === 'joined' ? 'joined' : 'pending' });
  } catch (e) {
    if (e instanceof AccessError) return fail(400, e.message);
    throw e;
  }
};
