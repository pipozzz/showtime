export const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });

export const fail = (status: number, error: string, extra: object = {}) => json({ error, ...extra }, status);

const publicOrigins = [process.env.BETTER_AUTH_URL, process.env.SITE_URL]
  .filter(Boolean)
  .map((u) => new URL(u!).origin);

/**
 * Reject cross-site writes: the editor always calls from the instance's own origin.
 * Behind Docker or a reverse proxy request.url is the internal address, so the
 * configured public URL (BETTER_AUTH_URL / SITE_URL) counts as same-origin too.
 */
export const sameOrigin = (request: Request) => {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  return origin === new URL(request.url).origin || publicOrigins.includes(origin);
};

const PRIVATE_PEER = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|f[cd][0-9a-f]{2}:|fe80:)/i;

/**
 * The visitor's IP, for rate limits. Behind a reverse proxy the socket peer is the proxy, so
 * every visitor would share one bucket. When the peer is a private address (a proxy on the same
 * host or network) or TRUST_PROXY=true, use the right-most X-Forwarded-For entry: the address our
 * proxy saw. Entries to its left come from the client and can be forged.
 */
export const clientIp = (request: Request, peer?: string, env: NodeJS.ProcessEnv = process.env) => {
  const socket = (peer ?? '').replace(/^::ffff:/, '');
  const forwarded = request.headers.get('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean).at(-1)?.replace(/^::ffff:/, '');
  const trust = /^(1|true|yes)$/i.test(env.TRUST_PROXY ?? '') || !socket || PRIVATE_PEER.test(socket);
  return (trust && forwarded) || socket || 'unknown';
};
