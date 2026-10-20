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
