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

export const onRequest = defineMiddleware(async (ctx, next) => {
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
  return res;
});
