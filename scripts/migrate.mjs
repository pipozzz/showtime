#!/usr/bin/env node
// Apply pending SQL migrations from ./drizzle. Safe to run on every start.
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
// Catch empty or unresolved variables early with a clear message: some deploy tools
// (e.g. Nomploy's Nomad translation) leave them empty instead of failing.
if (process.env.STARRING_MODE === 'server' && process.env.NODE_ENV === 'production') {
  const missing = ['BETTER_AUTH_URL', 'BETTER_AUTH_SECRET'].filter((k) => !process.env[k]?.trim());
  if (/:\/\/[^:]+:@/.test(url)) missing.push('POSTGRES_PASSWORD (DATABASE_URL has an empty password)');
  const unresolved = Object.entries(process.env).filter(([, v]) => /\$\{[A-Z_]+/.test(v ?? '')).map(([k]) => k);
  if (missing.length || unresolved.length) {
    if (missing.length) console.error(`✖ Missing required settings: ${missing.join(', ')}`);
    if (unresolved.length) console.error(`✖ Unresolved \${…} in: ${unresolved.join(', ')}`);
    process.exit(1);
  }
}
const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(sql), { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });
  console.log('✓ database is up to date');
} finally {
  await sql.end();
}
