import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db, schema } from './db';

const env = process.env;
const flag = (v: string | undefined, fallback: boolean) => (v === undefined ? fallback : /^(1|true|yes)$/i.test(v));

/** Instance settings a self-hoster controls with environment variables. */
export const instance = {
  allowSignup: flag(env.ALLOW_SIGNUP, true),
  passwordLogin: flag(env.AUTH_PASSWORD, true),
  github: !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
  gitlab: !!(env.GITLAB_CLIENT_ID && env.GITLAB_CLIENT_SECRET),
};

if (!env.BETTER_AUTH_SECRET && env.NODE_ENV === 'production') {
  throw new Error('BETTER_AUTH_SECRET is required in production (openssl rand -base64 32)');
}

export const auth = betterAuth({
  appName: 'Showtime',
  baseURL: env.BETTER_AUTH_URL || env.SITE_URL || 'http://localhost:4321',
  basePath: '/api/auth',
  secret: env.BETTER_AUTH_SECRET || 'dev-only-insecure-secret-change-me-0123456789',
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: {
    enabled: instance.passwordLogin,
    disableSignUp: !instance.allowSignup,
    minPasswordLength: 10,
  },
  socialProviders: {
    ...(instance.github && {
      github: { clientId: env.GITHUB_CLIENT_ID!, clientSecret: env.GITHUB_CLIENT_SECRET!, disableSignUp: !instance.allowSignup },
    }),
    ...(instance.gitlab && {
      gitlab: {
        clientId: env.GITLAB_CLIENT_ID!,
        clientSecret: env.GITLAB_CLIENT_SECRET!,
        issuer: env.GITLAB_ISSUER || 'https://gitlab.com',
        disableSignUp: !instance.allowSignup,
      },
    }),
  },
  user: { deleteUser: { enabled: true } },
  rateLimit: { enabled: true, window: 60, max: 30 },
});

export type Session = typeof auth.$Infer.Session;

export const getSession = (request: Request) => auth.api.getSession({ headers: request.headers });
