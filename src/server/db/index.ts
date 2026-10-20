import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set — required when STARRING_MODE=server');

// One pool per process; reused across requests (and hot reloads in dev).
const g = globalThis as unknown as { __starringSql?: ReturnType<typeof postgres> };
const sql = (g.__starringSql ??= postgres(url, { max: Number(process.env.DATABASE_POOL_MAX ?? 10) }));

export const db = drizzle(sql, { schema });
export { schema };
