// /api/domain — the signed-in owner's custom domain (CUSTOM_DOMAINS=true only).
//   GET → state · PUT { domain } → set (unverified) · POST → verify the DNS TXT record · DELETE → remove
import type { APIRoute } from 'astro';
import { getSession } from '../auth';
import { DomainError, domainsEnabled, getDomain, removeDomain, setDomain, verifyDomain } from '../domains';
import { fail, json, sameOrigin } from '../http';

export const prerender = false;

const handle = (fn: (userId: string, request: Request) => Promise<unknown>, write = true): APIRoute => async ({ request }) => {
  if (!domainsEnabled()) return fail(404, 'Custom domains are not enabled on this instance');
  if (write && !sameOrigin(request)) return fail(403, 'Cross-origin request blocked');
  const session = await getSession(request);
  if (!session) return fail(401, 'Sign in first');
  try {
    return json(await fn(session.user.id, request));
  } catch (e) {
    if (e instanceof DomainError) return fail(e.status, e.message);
    throw e;
  }
};

export const GET = handle((id) => getDomain(id), false);
export const PUT = handle(async (id, request) => setDomain(id, ((await request.json().catch(() => ({}))) as { domain?: unknown }).domain));
export const POST = handle((id) => verifyDomain(id));
export const DELETE = handle((id) => removeDomain(id));
