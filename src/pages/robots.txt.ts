import type { APIRoute } from 'astro';
import { link } from '../lib/url';
import { publicBase } from '../lib/site';

export const GET: APIRoute = ({ site, url }) => {
  const base = publicBase(site, url);
  const body = `User-agent: *
Allow: /
Disallow: ${link('edit')}
Disallow: ${link('api/')}
Disallow: ${link('login')}
Disallow: ${link('account')}

Sitemap: ${new URL(link('sitemap.xml'), base).href}
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
