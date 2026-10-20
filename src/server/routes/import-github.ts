// POST /api/import/github — import the signed-in user's GitHub profile using the OAuth
// token from "Continue with GitHub". The token stays on the server; only the resulting
// draft goes back. Body: { base?: Profile } to merge into the current draft.
import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import type { Profile } from '../../lib/model';
import { GithubImportError, importGithub } from '../../lib/importers/github';
import { getSession } from '../auth';
import { db, schema } from '../db';
import { fail, json, sameOrigin } from '../http';

export const prerender = false;

/** The GitHub OAuth token linked to this user, if they signed in with GitHub. */
export const githubToken = async (userId: string) => {
  const [acc] = await db
    .select({ token: schema.account.accessToken })
    .from(schema.account)
    .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, 'github')));
  return acc?.token ?? undefined;
};

export const POST: APIRoute = async ({ request }) => {
  if (!sameOrigin(request)) return fail(403, 'Cross-origin request blocked');
  const session = await getSession(request);
  if (!session) return fail(401, 'Sign in first');
  const token = await githubToken(session.user.id);
  if (!token) return fail(404, 'No GitHub account linked — use “Continue with GitHub”, or import by username');
  try {
    const me = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
    if (me.status === 401) return fail(401, 'GitHub access expired — sign in with GitHub again');
    if (!me.ok) return fail(502, `GitHub API error ${me.status}`);
    const { login } = (await me.json()) as { login: string };
    const body = (await request.json().catch(() => ({}))) as { base?: Profile };
    return json(await importGithub(login, { token, base: body.base }));
  } catch (e) {
    if (e instanceof GithubImportError) return fail(502, e.message);
    console.error(e);
    return fail(500, 'GitHub import failed');
  }
};
