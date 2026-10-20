// Profiles stored in Postgres (server mode). The `data` column holds the same
// Profile document as a YAML file; `handle` and `published` live beside it.
import { and, eq, isNull } from 'drizzle-orm';
import { HANDLE, RESERVED, validate, type Profile } from '../lib/model';
import { fileHandles } from '../lib/profiles';
import { hasTheme } from '../themes';
import { db, schema } from './db';
import { blockedReason } from './blocklist';

const { profile } = schema;

export interface OwnProfile {
  handle: string;
  published: boolean;
  hidden: boolean;
  hiddenReason?: string | null;
  updatedAt: string;
  data: Profile;
}

const toOwn = (r: typeof profile.$inferSelect): OwnProfile => ({
  handle: r.handle,
  published: r.published,
  hidden: !!r.hiddenAt,
  hiddenReason: r.hiddenReason,
  updatedAt: r.updatedAt.toISOString(),
  data: { ...r.data, handle: r.handle },
});

export const listPublished = async (): Promise<Profile[]> =>
  (await db.select().from(profile).where(and(eq(profile.published, true), isNull(profile.hiddenAt)))).map((r) => ({ ...r.data, handle: r.handle }));

export const getPublished = async (handle: string): Promise<Profile | undefined> => {
  const [r] = await db.select().from(profile).where(and(eq(profile.handle, handle), eq(profile.published, true), isNull(profile.hiddenAt)));
  return r && { ...r.data, handle: r.handle };
};

export const getByUser = async (userId: string): Promise<OwnProfile | undefined> => {
  const [r] = await db.select().from(profile).where(eq(profile.userId, userId));
  return r && toOwn(r);
};

export type HandleCheck = { ok: boolean; reason?: string };

export const checkHandle = async (handle: string, userId?: string, opts: { admin?: boolean } = {}): Promise<HandleCheck> => {
  if (!HANDLE.test(handle)) return { ok: false, reason: 'Use 2–39 lowercase letters, digits or dashes' };
  if (RESERVED.includes(handle)) return { ok: false, reason: 'This handle is reserved' };
  const blocked = !opts.admin && blockedReason(handle);
  if (blocked) return { ok: false, reason: blocked };
  if (fileHandles().includes(handle)) return { ok: false, reason: 'Already taken' };
  const [r] = await db.select({ userId: profile.userId }).from(profile).where(eq(profile.handle, handle));
  if (r && r.userId !== userId) return { ok: false, reason: 'Already taken' };
  return { ok: true };
};

export class ProfileError extends Error {
  constructor(message: string, public status = 400, public issues?: Record<string, string>) {
    super(message);
  }
}

const MAX_BYTES = 200_000;

/** Validate a document coming from the editor before it touches the DB. */
const clean = (data: unknown, handle: string): Profile => {
  if (!data || typeof data !== 'object' || !('profile' in data)) throw new ProfileError('Not a Starring profile');
  if (JSON.stringify(data).length > MAX_BYTES) throw new ProfileError('Profile is too large', 413);
  const p = { ...(data as Profile), handle };
  if (!hasTheme(p.theme)) p.theme = undefined;
  const issues = validate(p);
  delete issues.handle; // checked separately
  if (Object.keys(issues).length) throw new ProfileError('Some fields need attention', 422, issues);
  return p;
};

/** Create or update the user's profile. A changed handle is a rename. */
export const saveProfile = async (userId: string, input: { handle: string; data: unknown; published?: boolean }, opts: { admin?: boolean } = {}) => {
  const handle = input.handle.trim().toLowerCase();
  const check = await checkHandle(handle, userId, opts);
  if (!check.ok) throw new ProfileError(check.reason!, 409, { handle: check.reason! });
  const data = clean(input.data, handle);
  const existing = await getByUser(userId);
  if (existing?.hidden && input.published) throw new ProfileError('This profile was hidden by a moderator and can’t be published. Contact the operator.', 403);
  const now = new Date();
  if (!existing) {
    const [r] = await db
      .insert(profile)
      .values({ handle, userId, data, published: input.published ?? false, createdAt: now, updatedAt: now })
      .returning();
    return toOwn(r);
  }
  const [r] = await db
    .update(profile)
    .set({ handle, data, updatedAt: now, ...(input.published !== undefined && { published: input.published }) })
    .where(eq(profile.userId, userId))
    .returning();
  return toOwn(r);
};

export const setPublished = async (userId: string, published: boolean) => {
  if (published && (await getByUser(userId))?.hidden) throw new ProfileError('This profile was hidden by a moderator and can’t be published. Contact the operator.', 403);
  const [r] = await db.update(profile).set({ published, updatedAt: new Date() }).where(eq(profile.userId, userId)).returning();
  if (!r) throw new ProfileError('Claim a handle first', 404);
  return toOwn(r);
};

export const deleteProfile = (userId: string) => db.delete(profile).where(eq(profile.userId, userId));
