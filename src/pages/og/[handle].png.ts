import type { APIRoute } from 'astro';
import { createElement } from 'react';
import { SERVER_MODE, store, type Profile } from '../../lib/profiles';
import { ProfilePoster } from '../../lib/og/poster';
import { pngResponse, renderPng } from '../../lib/og/render';
import { link } from '../../lib/url';
import { publicBase } from '../../lib/site';

export async function getStaticPaths() {
  return (await store.list()).map((p) => ({ params: { handle: p.handle }, props: { p } }));
}

export const GET: APIRoute = async ({ params, props, site, url }) => {
  const p = SERVER_MODE ? await store.get(params.handle!) : (props as { p: Profile }).p;
  if (!p) return new Response(null, { status: 404 });
  const host = publicBase(site, url).host + link().replace(/\/$/, '');
  return pngResponse(await renderPng(createElement(ProfilePoster, { p, host })), SERVER_MODE ? 600 : 3600);
};
