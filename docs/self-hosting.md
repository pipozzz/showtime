# Self-hosting Showtime

Showtime runs in two modes from the same code:

| | **Static** (default) | **Server** |
| --- | --- | --- |
| Profiles | YAML files in `profiles/` | YAML files **and** user accounts in Postgres |
| Editing | Editor in the browser, then export `.yaml` | Sign up, claim a handle, autosave, publish |
| Hosting | GitHub Pages, Netlify, any static host | Docker / Node 22 + Postgres |
| Turn on | nothing | `SHOWTIME_MODE=server` |

This guide covers **server mode**.

## Docker Compose (recommended)

```bash
git clone https://github.com/pipozzz/showtime.git && cd showtime
cp .env.example .env
#   BETTER_AUTH_URL / SITE_URL → the public URL, e.g. https://stage.example.com
#   BETTER_AUTH_SECRET          → openssl rand -base64 32
#   POSTGRES_PASSWORD           → anything long
docker compose up -d
```

Open `http://localhost:4321` (or the `PORT` you set), click **Create account**, claim a handle, and publish.

- Migrations run on every start (`scripts/migrate.mjs`), so updating is `git pull && docker compose up -d --build`.
- Postgres data lives in the `showtime-db` volume. Back it up with `docker compose exec db pg_dump -U showtime showtime > backup.sql`.
- YAML profiles still work. `./profiles` is mounted read-only, and file handles can't be claimed by users.

## Dokploy

1. Create an **Application** from your fork's Git URL with **Build type: Dockerfile**, or a **Compose** service that points at `docker-compose.yml`.
2. If you use *Application*, add a **Postgres** database in the same project and set `DATABASE_URL` to its internal connection string.
3. Set the environment variables from `.env.example`. `BETTER_AUTH_URL` and `SITE_URL` must be the public HTTPS domain.
4. Add the domain with port **4321** and HTTPS on. Traefik in front is fine: same-origin checks use `BETTER_AUTH_URL`.

## Plain Node

```bash
npm ci
SHOWTIME_MODE=server npm run build
DATABASE_URL=postgres://… BETTER_AUTH_URL=https://… BETTER_AUTH_SECRET=… npm start
```

`npm start` applies migrations, then serves `dist/server/entry.mjs` on `HOST`/`PORT` (default `0.0.0.0:4321`).

## Configuration

| Variable | Default | |
| --- | --- | --- |
| `SHOWTIME_MODE` | `static` | `server` enables accounts and the DB. The Docker image sets it. |
| `DATABASE_URL` | none | Postgres connection string (set by compose) |
| `BETTER_AUTH_URL` | `http://localhost:4321` | Public URL. Used for OAuth callbacks, cookies and origin checks. |
| `SITE_URL` | same | Canonical URLs, sitemap and Open Graph |
| `BETTER_AUTH_SECRET` | none | **Required in production.** `openssl rand -base64 32` |
| `ALLOW_SIGNUP` | `true` | `false` makes the instance private: existing accounts can still sign in. |
| `AUTH_PASSWORD` | `true` | `false` turns off email + password and leaves only OAuth. |
| `GITHUB_CLIENT_ID` / `_SECRET` | none | Enables "Continue with GitHub". Callback: `<BETTER_AUTH_URL>/api/auth/callback/github` |
| `GITLAB_CLIENT_ID` / `_SECRET` | none | Enables "Continue with GitLab" (scope `read_user`). Callback: `…/api/auth/callback/gitlab` |
| `GITLAB_ISSUER` | `https://gitlab.com` | Your self-hosted GitLab URL |
| `DATABASE_POOL_MAX` | `10` | Postgres connections per app process |

## Security notes

- Passwords are hashed by [Better Auth](https://www.better-auth.com). Sessions are HTTP-only cookies.
- Auth endpoints are rate-limited (30 requests per minute per IP).
- Profile writes require a session and are rejected from other origins.
- Profiles are validated on the server (same rules as the editor) and capped at 200 KB.
- Unpublished profiles return 404 to everyone, including search engines.
- Users can delete their account from `/account`, which also deletes their profile.
- Email verification and password reset need an SMTP provider and aren't wired up yet. Until then, run invite-only (`ALLOW_SIGNUP=false` after you sign up) if that matters to you.

## Local development in server mode

```bash
npm run db:up                                                     # Postgres on 127.0.0.1:5440
export DATABASE_URL=postgres://showtime:showtime@127.0.0.1:5440/showtime
npm run db:migrate
npm run dev:server                                                # http://localhost:4321
```

After you change `src/server/db/schema.ts`, run `npm run db:generate` and commit the new file in `drizzle/`.
