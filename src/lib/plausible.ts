// Turn the install snippet Plausible hands you into { domain, host } for analytics.plausible.
// New snippets (2025+) load a per-site /js/pa-<id>.js with the site and endpoint baked in;
// older ones carry data-domain (and maybe data-api) on a script.js tag. The owner's script
// never runs on Starring — we only read these values and send page views ourselves.
import { PLAUSIBLE_DOMAIN, isHttpsOrigin } from './model';

export type PlausibleSite = { domain: string; host?: string };
type Resolved = { site: PlausibleSite } | { error: string };
type Found = Resolved | { script: string };

const attr = (tag: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(tag)?.[1];

/** The events endpoint (https://x/api/event) → the host we store; undefined for plausible.io. */
const hostOf = (endpoint: string) => {
  const m = /^(https:\/\/[^?#]+?)\/api\/event\/?$/.exec(endpoint);
  if (!m || !isHttpsOrigin(m[1])) return null;
  return new URL(m[1]).origin === 'https://plausible.io' && new URL(m[1]).pathname === '/' ? undefined : m[1];
};

const site = (domain: string | undefined, endpoint: string): Resolved => {
  if (!domain || !PLAUSIBLE_DOMAIN.test(domain)) return { error: `Couldn't find a valid site name${domain ? ` (got "${domain}")` : ''}.` };
  const host = hostOf(endpoint);
  if (host === null) return { error: `Events go to ${endpoint}, which isn't an https://…/api/event address Starring can send to.` };
  return { site: { domain: domain.toLowerCase(), ...(host && { host }) } };
};

/** Read a pasted snippet (or just the script URL). */
export const fromSnippet = (text: string): Found => {
  const tags = [...text.matchAll(/<script\b[^>]*>/gi)].map((m) => m[0]);
  const bare = /^\s*(https:\/\/\S+\.js)\s*$/.exec(text)?.[1];
  const tag = tags.find((t) => /\bsrc\s*=/.test(t) && /plausible|\/js\/(pa-|script)/i.test(t)) ?? tags.find((t) => /\bsrc\s*=/.test(t));
  const src = bare ?? (tag && attr(tag, 'src'));
  if (!src) return { error: 'Paste the whole snippet from Plausible — the part with <script … src="…">.' };
  let url: URL;
  try { url = new URL(src); } catch { return { error: `"${src}" isn't a full https:// address.` }; }
  if (url.protocol !== 'https:') return { error: 'Your Plausible has to be served over https://.' };
  if (/\/js\/pa-[\w-]+\.js$/.test(url.pathname)) return { script: url.href };
  // legacy: <script defer data-domain="you.dev" src="https://host/js/script.js">
  const base = url.href.replace(/\/js\/[^/]+\.js$/, '');
  return site(tag && attr(tag, 'data-domain')?.split(',')[0].trim(), (tag && attr(tag, 'data-api')) ?? `${base}/api/event`);
};

/** Read the site and endpoint out of a pa-<id>.js script's source. */
export const fromScript = (source: string): Resolved => {
  const val = (key: string) => new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']+)["']`).exec(source)?.[1];
  const endpoint = val('endpoint');
  if (!endpoint) return { error: "That script doesn't look like a Plausible tracking script." };
  return site(val('domain'), endpoint);
};

/** Snippet → site, fetching the pa- script when needed (Plausible serves it with CORS *). */
export const resolveSnippet = async (text: string, get: typeof fetch = fetch): Promise<Resolved> => {
  const found = fromSnippet(text);
  if (!('script' in found)) return found;
  try {
    const res = await get(found.script);
    if (!res.ok) return { error: `Plausible answered ${res.status} for ${found.script} — is the site still there?` };
    return fromScript(await res.text());
  } catch {
    return { error: `Couldn't load ${found.script} — check the address, or enter the site and server by hand below.` };
  }
};
