// The public base URL of this site — for canonical links, sitemaps, OG images, oEmbed.
// Static mode: Astro's `site` (SITE_URL at build time).
// Server mode: read at runtime, so one Docker image works on any domain.
export const publicBase = (site: URL | undefined, url: URL): URL => {
  if (import.meta.env.STARRING_MODE === 'server') {
    const env = process.env.SITE_URL || process.env.BETTER_AUTH_URL;
    return new URL(env || url.origin);
  }
  return site ?? new URL(url.origin);
};
