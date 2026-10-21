import type { APIRoute } from 'astro';
import { link } from '../lib/url';
import { publicBase } from '../lib/site';

export const GET: APIRoute = ({ site, url }) => {
  const base = publicBase(site, url);
  // NOINDEX=true (a demo or mirror of the real site): keep crawlers out entirely
  if (/^(1|true|yes)$/i.test(process.env.NOINDEX ?? '')) {
    return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
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
