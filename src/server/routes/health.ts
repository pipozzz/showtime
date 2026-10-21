// GET /api/health — liveness + readiness for Docker/Nomad/Dokploy health checks.
// 200 { ok: true, db: true } when the app can reach Postgres; 503 otherwise.
// version (the image's commit) and site (the public URL) make "is the new deploy live?" a curl away.
import type { APIRoute } from 'astro';
import { sql } from 'drizzle-orm';
import { db } from '../db';

export const prerender = false;

const VERSION = (process.env.STARRING_VERSION ?? 'dev').slice(0, 7);
const SITE = (() => {
  try { return new URL(process.env.SITE_URL || process.env.BETTER_AUTH_URL || '').origin; } catch { return null; }
})();

export const GET: APIRoute = async () => {
  const started = Date.now();
  let dbOk = false;
  try {
    await Promise.race([db.execute(sql`select 1`), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))]);
    dbOk = true;
  } catch { /* reported below */ }
  return new Response(JSON.stringify({ ok: dbOk, db: dbOk, ms: Date.now() - started, version: VERSION, site: SITE }), {
    status: dbOk ? 200 : 503,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
