// GET /api/health — liveness + readiness for Docker/Nomad/Dokploy health checks.
// 200 { ok: true, db: true } when the app can reach Postgres; 503 otherwise.
import type { APIRoute } from 'astro';
import { sql } from 'drizzle-orm';
import { db } from '../db';

export const prerender = false;

export const GET: APIRoute = async () => {
  const started = Date.now();
  let dbOk = false;
  try {
    await Promise.race([db.execute(sql`select 1`), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))]);
    dbOk = true;
  } catch { /* reported below */ }
  return new Response(JSON.stringify({ ok: dbOk, db: dbOk, ms: Date.now() - started }), {
    status: dbOk ? 200 : 503,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
