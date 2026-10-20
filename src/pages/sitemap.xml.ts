import type { APIRoute } from 'astro';
import { store } from '../lib/profiles';
import { pageLink } from '../lib/url';
import { publicBase } from '../lib/site';

// Static mode: written at build time. Server mode: rendered per request, so new
// published profiles appear without a rebuild.
export const GET: APIRoute = async ({ site, url }) => {
  const base = publicBase(site, url);
  const abs = (path: string) => new URL(pageLink(path), base).href;
  const mode = await store.mode();
  const profiles = await store.list();
  const pages = [
    { loc: abs(''), priority: '1.0' },
    ...(mode === 'personal' ? [] : [{ loc: abs('themes'), priority: '0.5' }]),
    ...profiles.map((p) => ({ loc: abs(p.handle), priority: '0.8' })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${p.loc}</loc><priority>${p.priority}</priority></url>`).join('\n')}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
};
