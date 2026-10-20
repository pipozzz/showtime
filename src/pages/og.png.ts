import type { APIRoute } from 'astro';
import { createElement } from 'react';
import { SitePoster } from '../lib/og/poster';
import { pngResponse, renderPng } from '../lib/og/render';

export const GET: APIRoute = async ({ site, url }) =>
  pngResponse(await renderPng(createElement(SitePoster, { host: (site ?? url).host })), 86400);
