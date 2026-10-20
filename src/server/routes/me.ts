import type { APIRoute } from 'astro';
import { getSession, instance, signupOffered } from '../auth';
import { json } from '../http';
import { getByUser } from '../profiles';

export const prerender = false;

/** Who is signed in, their profile (if claimed) and what this instance allows. */
export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  const features = { allowSignup: await signupOffered(), password: instance.passwordLogin, github: instance.github, gitlab: instance.gitlab };
  if (!session) return json({ user: null, profile: null, features });
  const { id, name, email, image } = session.user;
  return json({ user: { id, name, email, image }, profile: (await getByUser(id)) ?? null, features });
};
