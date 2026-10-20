import type { APIRoute } from 'astro';
import { getSession } from '../auth';
import { json } from '../http';
import { checkHandle } from '../profiles';
import { isAdmin } from '../blocklist';

export const prerender = false;

/** GET /api/handle?h=<handle> → { ok } or { ok: false, reason } */
export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request);
  const h = (url.searchParams.get('h') ?? '').trim().toLowerCase();
  return json(await checkHandle(h, session?.user.id, { admin: isAdmin(session?.user.email) }));
};
