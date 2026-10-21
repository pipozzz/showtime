// Custom domains: an owner points their own domain at the instance and their stage is served at
// its root (https://peter.dev/). Off unless CUSTOM_DOMAINS=true. Ownership is proven with a DNS
// TXT record; TLS for arbitrary domains is the proxy's job (see allowedDomain and the docs).
import { createHmac } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db, schema } from './db';

const { profile } = schema;
const env = process.env;

export const domainsEnabled = () => /^(1|true|yes)$/i.test(env.CUSTOM_DOMAINS ?? '');

const hostOf = (u?: string) => {
  try { return u ? new URL(u).hostname.toLowerCase() : ''; } catch { return ''; }
};
/** The instance's own hostname (starring.dev): never claimable, nor its subdomains. */
export const instanceHost = () => hostOf(env.SITE_URL) || hostOf(env.BETTER_AUTH_URL);

export class DomainError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/** "https://Peter.dev/" → "peter.dev". Throws DomainError for anything that can't be a public hostname. */
export function normalizeDomain(input: unknown, own = instanceHost()) {
  const raw = String(input ?? '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '');
  const labels = raw.split('.');
  if (!raw || raw.length > 253 || labels.length < 2 || !labels.every((l) => LABEL.test(l)) || /^\d+$/.test(labels.at(-1)!)) {
    throw new DomainError('Enter a domain like peter.dev or cv.peter.dev');
  }
  if (/^(localhost|local|internal|test|example|invalid)$/.test(labels.at(-1)!)) throw new DomainError('Use a public domain you own');
  if (own && (raw === own || raw.endsWith(`.${own}`))) throw new DomainError(`That's this site's own domain — your stage already lives at ${own}`);
  return raw;
}

/** The TXT record that proves an owner controls `domain` (stable per account + domain, no storage). */
export const verification = (userId: string, domain: string) => ({
  name: `_starring.${domain}`,
  value: `starring-verify=${createHmac('sha256', env.BETTER_AUTH_SECRET ?? 'dev').update(`${userId}:${domain}`).digest('hex').slice(0, 32)}`,
});

export interface DomainState {
  domain: string | null;
  verified: boolean;
  /** What to put in DNS. */
  txt?: { name: string; value: string };
  target?: string;
}

const stateOf = (userId: string, r?: { customDomain: string | null; domainVerifiedAt: Date | null }): DomainState =>
  r?.customDomain
    ? { domain: r.customDomain, verified: !!r.domainVerifiedAt, txt: verification(userId, r.customDomain), target: instanceHost() }
    : { domain: null, verified: false };

export async function getDomain(userId: string) {
  const [r] = await db.select({ customDomain: profile.customDomain, domainVerifiedAt: profile.domainVerifiedAt }).from(profile).where(eq(profile.userId, userId));
  return stateOf(userId, r);
}

export async function setDomain(userId: string, input: unknown) {
  const domain = normalizeDomain(input);
  const [mine] = await db.select({ handle: profile.handle, customDomain: profile.customDomain }).from(profile).where(eq(profile.userId, userId));
  if (!mine) throw new DomainError('Claim a handle first', 409);
  if (mine.customDomain === domain) return getDomain(userId);
  const [taken] = await db.select({ handle: profile.handle }).from(profile).where(eq(profile.customDomain, domain));
  if (taken) throw new DomainError('Another stage already uses that domain', 409);
  await db.update(profile).set({ customDomain: domain, domainVerifiedAt: null }).where(eq(profile.userId, userId));
  forget(mine.customDomain, domain);
  return getDomain(userId);
}

export async function removeDomain(userId: string) {
  const [mine] = await db.select({ customDomain: profile.customDomain }).from(profile).where(eq(profile.userId, userId));
  await db.update(profile).set({ customDomain: null, domainVerifiedAt: null }).where(eq(profile.userId, userId));
  forget(mine?.customDomain);
  return getDomain(userId);
}

/** Look up the TXT record; on a match the domain goes live. `lookup` is injectable for tests. */
export async function verifyDomain(userId: string, lookup: (name: string) => Promise<string[][]> = resolveTxt) {
  const state = await getDomain(userId);
  if (!state.domain || !state.txt) throw new DomainError('Add a domain first', 409);
  if (state.verified) return state;
  let records: string[] = [];
  try {
    records = (await lookup(state.txt.name)).map((chunks) => chunks.join(''));
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code !== 'ENOTFOUND' && code !== 'ENODATA') throw new DomainError("Couldn't reach DNS right now — try again in a minute", 503);
  }
  if (!records.some((r) => r.trim().toLowerCase() === state.txt!.value)) {
    throw new DomainError(records.length ? `Found a TXT record on ${state.txt.name}, but not the right value yet` : `No TXT record on ${state.txt.name} yet. DNS changes can take a few minutes.`, 422);
  }
  await db.update(profile).set({ domainVerifiedAt: new Date() }).where(eq(profile.userId, userId));
  forget(state.domain);
  return getDomain(userId);
}

// ---- serving: host → handle, cached so every request on a custom domain isn't a query ----

const TTL = 60_000; // a live domain
const MISS_TTL = 10_000; // an unknown host: short, so a freshly verified domain shows up fast
const cache = new Map<string, { at: number; handle: string | null }>();
const forget = (...hosts: (string | null | undefined)[]) => hosts.forEach((h) => h && cache.delete(h));

/** The published stage served on `host`, if `host` is a verified custom domain. */
export async function stageForHost(host: string): Promise<string | null> {
  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < (hit.handle ? TTL : MISS_TTL)) return hit.handle;
  const [r] = await db
    .select({ handle: profile.handle })
    .from(profile)
    .where(and(eq(profile.customDomain, host), isNotNull(profile.domainVerifiedAt), eq(profile.published, true), isNull(profile.hiddenAt)));
  const handle = r?.handle ?? null;
  cache.set(host, { at: Date.now(), handle });
  return handle;
}

/** A stage's verified domain — its canonical address when set. */
export async function domainForHandle(handle: string): Promise<string | null> {
  const [r] = await db.select({ d: profile.customDomain }).from(profile).where(and(eq(profile.handle, handle), isNotNull(profile.domainVerifiedAt)));
  return r?.d ?? null;
}

/** For the proxy's on-demand TLS check: issue a certificate only for live, verified domains. */
export const allowedDomain = async (host: string) => !!(await stageForHost(host));
