#!/usr/bin/env node
// Postgres backups for server mode. Runs as its own container from the app image:
//   node scripts/backup.mjs            dump now, then every BACKUP_INTERVAL_HOURS; keep BACKUP_KEEP
//   node scripts/backup.mjs once       one dump, then exit
//   node scripts/backup.mjs check      exit 1 if the newest dump is older than 2 intervals (healthcheck)
//   node scripts/backup.mjs list       list dumps, newest first
//   node scripts/backup.mjs restore <file>   replace the database with a dump (stop the app first)
import { spawn } from 'node:child_process';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = process.env.BACKUP_DIR ?? '/backups';
const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP ?? 14));
const HOURS = Math.max(0.01, Number(process.env.BACKUP_INTERVAL_HOURS ?? 24));
const URL = process.env.DATABASE_URL;
const NAME = /^starring-\d{8}-\d{6}\.dump$/;

const log = (...a) => console.log(new Date().toISOString(), ...a);
const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))));
  });

/** Dumps, newest first. */
const dumps = async () => {
  const names = (await readdir(DIR).catch(() => [])).filter((n) => NAME.test(n)).sort().reverse();
  return Promise.all(names.map(async (n) => ({ name: n, path: join(DIR, n), ...(await stat(join(DIR, n))) })));
};

const backup = async () => {
  await mkdir(DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const file = join(DIR, `starring-${stamp}.dump`);
  // write to a temp name first, so a half-written dump is never mistaken for a good one
  await run('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', `--file=${file}.part`, `--dbname=${URL}`]);
  await rename(`${file}.part`, file);
  const all = await dumps();
  for (const old of all.slice(KEEP)) await rm(old.path);
  log(`backup ${file} (${(all[0].size / 1024).toFixed(0)} KiB), keeping ${Math.min(all.length, KEEP)}`);
};

const cmd = process.argv[2] ?? 'loop';
if (!URL && cmd !== 'list' && cmd !== 'check') {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

if (cmd === 'once') {
  await backup();
} else if (cmd === 'list') {
  for (const d of await dumps()) console.log(`${d.name}  ${(d.size / 1024).toFixed(0)} KiB`);
} else if (cmd === 'check') {
  const [latest] = await dumps();
  const age = latest ? (Date.now() - latest.mtimeMs) / 3.6e6 : Infinity;
  if (age > HOURS * 2) {
    console.error(latest ? `newest backup is ${age.toFixed(1)} h old` : 'no backups yet');
    process.exit(1);
  }
} else if (cmd === 'restore') {
  const name = process.argv[3];
  if (!name) {
    console.error('usage: node scripts/backup.mjs restore <file>   (see: node scripts/backup.mjs list)');
    process.exit(1);
  }
  const file = name.includes('/') ? name : join(DIR, name);
  log(`restoring ${file} — this replaces the current data`);
  await run('pg_restore', ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--single-transaction', `--dbname=${URL}`, file]);
  log('restored. Start the app again.');
} else if (cmd === 'loop') {
  log(`backups every ${HOURS} h into ${DIR}, keeping ${KEEP}`);
  for (;;) {
    await backup().catch((e) => log('backup failed:', e.message));
    await new Promise((r) => setTimeout(r, HOURS * 3.6e6));
  }
} else {
  console.error(`unknown command "${cmd}" — use once, list, check, restore <file>, or nothing to run on a schedule`);
  process.exit(1);
}
