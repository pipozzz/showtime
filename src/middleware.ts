// Security headers for every response in server mode. (Static hosts set their own headers;
// GitHub Pages can't, so this only runs when there is a server.)
import { defineMiddleware } from 'astro:middleware';

const SERVER = import.meta.env.STARRING_MODE === 'server';

const origin = (url?: string) => {
  try { return url ? new URL(url).origin : ''; } catch { return ''; }
};

/**
 * Scripts and styles: our own plus inline (Astro inlines small page scripts), the instance's
 * Plausible script host, and Google Fonts. No other script host can load — so a profile's
 * content can never pull in a foreign script.
 * connect-src https: is for the editor's GitHub import and profile owners' own Plausible.
 */
const csp = (frameable: boolean) =>
  [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${origin(process.env.PLAUSIBLE_SRC)}`.trim(),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self' https:",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    `frame-ancestors ${frameable ? '*' : "'none'"}`,
  ].join('; ');

/**
 * Old or extra hostnames (REDIRECT_HOSTS=app.starring.dev,www.starring.dev) send visitors to the
 * public URL with the same path: 301 for page loads, 308 for anything else so form posts keep
 * their method. Explicit list on purpose — health checks hit the container by IP and must not move.
 */
const redirectHosts = new Set((process.env.REDIRECT_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
const canonical = origin(process.env.SITE_URL) || origin(process.env.BETTER_AUTH_URL);
const movedTo = (request: Request, url: URL) => {
  if (!SERVER || !canonical || !redirectHosts.size) return null;
  const host = (request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host).split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
  if (!redirectHosts.has(host) || host === new URL(canonical).hostname) return null;
  const status = request.method === 'GET' || request.method === 'HEAD' ? 301 : 308;
  return new Response(null, { status, headers: { Location: canonical + url.pathname + url.search, 'Cache-Control': 'public, max-age=86400' } });
};

/**
 * gzip text responses: the Node adapter sends everything uncompressed and not every proxy
 * compresses (Nomploy's Traefik doesn't). A profile's HTML goes from ~31 KB to ~7 KB.
 * Hashed /_astro assets are served by the adapter before this runs; they're small and cached for a year.
 */
const COMPRESSIBLE = /^(text\/|application\/(json|xml|javascript|manifest\+json|rss\+xml)|image\/svg\+xml)/;
const gzip = (request: Request, res: Response) => {
  const type = res.headers.get('content-type') ?? '';
  const length = Number(res.headers.get('content-length') ?? Infinity);
  if (!res.body || request.method === 'HEAD' || res.status < 200 || res.status === 204 || res.status === 206 || res.status >= 300 && res.status < 400) return res;
  if (res.headers.has('content-encoding') || !COMPRESSIBLE.test(type) || length < 1024) return res;
  if (!/\bgzip\b/.test(request.headers.get('accept-encoding') ?? '')) return res;
  const headers = new Headers(res.headers);
  headers.set('Content-Encoding', 'gzip');
  headers.append('Vary', 'Accept-Encoding');
  headers.delete('Content-Length');
  return new Response(res.body.pipeThrough(new CompressionStream('gzip')), { status: res.status, statusText: res.statusText, headers });
};

export const onRequest = defineMiddleware(async (ctx, next) => {
  const moved = movedTo(ctx.request, ctx.url);
  if (moved) return moved;
  const res = await next();
  if (!SERVER) return res;
  // embeddable card: /<handle>/card — meant to be framed by other sites
  const frameable = /^\/[^/]+\/card\/?$/.test(ctx.url.pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ''), ''));
  const h = res.headers;
  if (!h.has('Content-Security-Policy')) h.set('Content-Security-Policy', csp(frameable));
  else if (frameable) h.set('Content-Security-Policy', csp(true));
  if (!frameable) h.set('X-Frame-Options', 'DENY');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  h.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  const https = ctx.url.protocol === 'https:' || ctx.request.headers.get('x-forwarded-proto') === 'https' || (process.env.BETTER_AUTH_URL ?? '').startsWith('https:');
  if (https) h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return gzip(ctx.request, res);
});
