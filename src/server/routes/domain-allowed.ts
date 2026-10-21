// GET /api/domain/allowed?domain=peter.dev — for a reverse proxy's on-demand TLS check
// (Caddy `on_demand_tls { ask … }`): 200 only for a verified domain of a live stage.
import type { APIRoute } from 'astro';
import { allowedDomain, domainsEnabled } from '../domains';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const domain = (url.searchParams.get('domain') ?? '').trim().toLowerCase();
  const ok = domainsEnabled() && !!domain && (await allowedDomain(domain));
  return new Response(ok ? 'ok' : 'no', { status: ok ? 200 : 404, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
};
