// Better Auth handles everything under /api/auth/* (sign up, sign in, OAuth callbacks, sign out).
import type { APIRoute } from 'astro';
import { auth } from '../auth';

export const prerender = false;
export const ALL: APIRoute = ({ request }) => auth.handler(request);
