// oEmbed provider (server mode): https://oembed.com
// GET /oembed?url=<profile url>&maxwidth=&maxheight=  → rich iframe embed of /<handle>/card
import type { APIRoute } from 'astro';
import { store } from '../../lib/profiles';
import { link, pageLink } from '../../lib/url';
import { fail, json } from '../http';

export const prerender = false;

export const GET: APIRoute = async ({ url, site }) => {
  const base = site ?? new URL(url.origin);
  const target = url.searchParams.get('url');
  if (!target) return fail(400, 'url is required');
  if ((url.searchParams.get('format') ?? 'json') !== 'json') return new Response('Only JSON', { status: 501 });
  let u: URL;
  try { u = new URL(target); } catch { return fail(400, 'Invalid url'); }
  if (u.host !== base.host) return fail(404, 'Not a profile on this instance');
  const prefix = link();
  const handle = u.pathname.startsWith(prefix) ? u.pathname.slice(prefix.length).replace(/\/(card)?\/?$/, '') : '';
  const p = handle && !handle.includes('/') ? await store.get(handle) : undefined;
  if (!p) return fail(404, 'No such profile');
  const width = Math.min(Number(url.searchParams.get('maxwidth')) || 600, 800);
  const height = Math.min(Number(url.searchParams.get('maxheight')) || 340, 600);
  const src = new URL(link(`${p.handle}/card`), base).href;
  return json(
    {
      version: '1.0',
      type: 'rich',
      provider_name: 'Showtime',
      provider_url: new URL(link(), base).href,
      title: `${p.profile.name} — ${p.profile.role}`,
      author_name: p.profile.name,
      author_url: new URL(pageLink(p.handle), base).href,
      thumbnail_url: new URL(link(`og/${p.handle}.png`), base).href,
      thumbnail_width: 1200,
      thumbnail_height: 630,
      width,
      height,
      html: `<iframe src="${src}" width="${width}" height="${height}" style="border:0;max-width:100%" loading="lazy" title="${p.profile.name.replace(/"/g, '&quot;')} on Showtime"></iframe>`,
    },
    200,
    { 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' },
  );
};
