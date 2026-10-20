import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';

// Two modes, one codebase:
//   SHOWTIME_MODE=static (default) — YAML profiles, static HTML, GitHub Pages / any static host
//   SHOWTIME_MODE=server           — Node server + Postgres: registration, profiles in the DB
const MODE = process.env.SHOWTIME_MODE === 'server' ? 'server' : 'static';

// Server-only routes live in src/server/ and are injected only in server mode,
// so the static build never sees endpoints that need a request.
const serverRoutes = () => ({
  name: 'showtime-server-routes',
  hooks: {
    'astro:config:setup': ({ injectRoute }) => {
      if (MODE !== 'server') return;
      const routes = {
        '/api/auth/[...all]': 'src/server/routes/auth.ts',
        '/api/me': 'src/server/routes/me.ts',
        '/api/profile': 'src/server/routes/profile.ts',
        '/api/handle': 'src/server/routes/handle.ts',
        '/login': 'src/server/routes/login.astro',
        '/account': 'src/server/routes/account.astro',
        '/oembed': 'src/server/routes/oembed.ts',
      };
      for (const [pattern, entrypoint] of Object.entries(routes)) injectRoute({ pattern, entrypoint });
    },
  },
});

// GitHub Pages sets these in .github/workflows/pages.yml:
//   SITE_URL  = https://<user>.github.io        (or your custom domain)
//   BASE_PATH = /<repo>   for project pages,  /  for <user>.github.io or a custom domain
export default defineConfig({
  site: process.env.SITE_URL || 'http://localhost:4321',
  base: process.env.BASE_PATH || '/',
  output: MODE,
  adapter: MODE === 'server' ? node({ mode: 'standalone' }) : undefined,
  integrations: [react(), serverRoutes()],
  vite: {
    define: { 'import.meta.env.SHOWTIME_MODE': JSON.stringify(MODE) },
  },
});
