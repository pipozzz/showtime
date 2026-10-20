# Self-hosting Starring

Starring runs in two modes from the same code:

| | **Static** (default) | **Server** |
| --- | --- | --- |
| Profiles | YAML files in `profiles/` | YAML files **and** user accounts in Postgres |
| Editing | Editor in the browser, then export `.yaml` | Sign up, claim a handle, autosave, publish |
| Hosting | GitHub Pages, Netlify, any static host | Docker / Node 22 + Postgres |
| Turn on | nothing | `STARRING_MODE=server` |

This guide covers **server mode**.

## Docker Compose (recommended)

```bash
git clone https://github.com/pipozzz/starring.git && cd starring
cp .env.example .env
#   BETTER_AUTH_URL / SITE_URL → the public URL, e.g. https://stage.example.com
#   BETTER_AUTH_SECRET          → openssl rand -base64 32
#   POSTGRES_PASSWORD           → anything long
docker compose up -d
```

Open `http://localhost:4321` (or the `PORT` you set), click **Create account**, claim a handle, and publish.

- Migrations run on every start (`scripts/migrate.mjs`), so updating is `git pull && docker compose up -d --build`.
- Postgres data lives in the `starring-db` volume. Back it up with `docker compose exec db pg_dump -U starring starring > backup.sql`.
- YAML profiles still work. `./profiles` is mounted read-only, and file handles can't be claimed by users.

## Dokploy

Use `docker-compose.dokploy.yml`. It pulls the prebuilt image `ghcr.io/pipozzz/starring`, which CI builds for amd64 and arm64 on every push to `main`, and runs it with its own Postgres. The file publishes no ports and has no Traefik labels, because Dokploy adds those from the domain you configure.

1. **Create Service → Compose.** Set Provider to **GitHub**, the repository to `pipozzz/starring` (or your fork), the branch to `main`, and **Compose Path** to `./docker-compose.dokploy.yml`.
2. **Environment** tab:
   ```env
   BETTER_AUTH_URL=https://app.starring.dev
   BETTER_AUTH_SECRET=        # openssl rand -base64 32
   POSTGRES_PASSWORD=         # openssl rand -hex 24  (hex: it goes into a URL)
   ALLOW_SIGNUP=false         # private beta: only the first account (you) + the allowlist
   SIGNUP_ALLOWLIST=          # friend@example.com,other@example.com
   # optional
   STARRING_IMAGE_TAG=latest  # or sha-1a2b3c4 to pin a build
   PLAUSIBLE_SRC=
   GITHUB_CLIENT_ID=
   GITHUB_CLIENT_SECRET=
   ```
3. **Domains** tab: set Service to `app`, Port to `4321` and the host to your domain, and turn HTTPS on (Let's Encrypt). In DNS, point the host at the server with an A record. If it's on Cloudflare, use **DNS only**.
4. **Deploy.** Migrations run automatically on start. Then open the domain and **create the first account**: on an empty instance it's always allowed, and that account is yours.
5. **Optional auto-deploy:** copy the compose service's **Deploy webhook** URL into the repository secret `DOKPLOY_DEPLOY_WEBHOOK`. After each `main` push, the image workflow pushes the new image and then triggers the redeploy, so you never deploy an image that's still building.
6. **Backups:** Postgres data lives in the `starring-db` volume. Add a volume backup in Dokploy, or run `pg_dump` from the `db` container on a schedule.

To build on the server instead of pulling (for example from a fork without CI), replace `image:` and `pull_policy:` in the compose file with `build: .`.

## Plain Node

```bash
npm ci
STARRING_MODE=server npm run build
DATABASE_URL=postgres://… BETTER_AUTH_URL=https://… BETTER_AUTH_SECRET=… npm start
```

`npm start` applies migrations, then serves `dist/server/entry.mjs` on `HOST`/`PORT` (default `0.0.0.0:4321`).

## Configuration

| Variable | Default | |
| --- | --- | --- |
| `STARRING_MODE` | `static` | `server` enables accounts and the DB. The Docker image sets it. |
| `DATABASE_URL` | none | Postgres connection string (set by compose) |
| `BETTER_AUTH_URL` | `http://localhost:4321` | Public URL. Used for OAuth callbacks, cookies and origin checks. |
| `SITE_URL` | same | Canonical URLs, sitemap and Open Graph |
| `BETTER_AUTH_SECRET` | none | **Required in production.** `openssl rand -base64 32` |
| `ALLOW_SIGNUP` | `true` | `false` makes the instance invite-only. The **first account on an empty instance is always allowed** (the owner), and so are emails on `SIGNUP_ALLOWLIST`. |
| `SIGNUP_ALLOWLIST` | none | Comma-separated emails that may sign up while `ALLOW_SIGNUP=false` |
| `AUTH_PASSWORD` | `true` | `false` turns off email + password and leaves only OAuth. |
| `GITHUB_CLIENT_ID` / `_SECRET` | none | Enables "Continue with GitHub". Callback: `<BETTER_AUTH_URL>/api/auth/callback/github` |
| `GITLAB_CLIENT_ID` / `_SECRET` | none | Enables "Continue with GitLab" (scope `read_user`). Callback: `…/api/auth/callback/gitlab` |
| `GITLAB_ISSUER` | `https://gitlab.com` | Your self-hosted GitLab URL |
| `DATABASE_POOL_MAX` | `10` | Postgres connections per app process |
| `PLAUSIBLE_SRC` | none | Optional [Plausible](https://plausible.io) script URL (`https://…/js/….js`). It's cookieless, and nothing loads when this is unset. For static sites on GitHub Pages, set it as a repository **variable** with the same name instead. |

## Security notes

- Passwords are hashed by [Better Auth](https://www.better-auth.com). Sessions are HTTP-only cookies.
- Auth endpoints are rate-limited (30 requests per minute per IP).
- Profile writes require a session and are rejected from other origins.
- Profiles are validated on the server (same rules as the editor) and capped at 200 KB.
- Unpublished profiles return 404 to everyone, including search engines.
- Users can delete their account from `/account`, which also deletes their profile.
- Email verification and password reset need an SMTP provider and aren't wired up yet. Until then, run invite-only (`ALLOW_SIGNUP=false`, plus `SIGNUP_ALLOWLIST` for people you invite).

## Local development in server mode

```bash
npm run db:up                                                     # Postgres on 127.0.0.1:5440
export DATABASE_URL=postgres://starring:starring@127.0.0.1:5440/starring
npm run db:migrate
npm run dev:server                                                # http://localhost:4321
```

After you change `src/server/db/schema.ts`, run `npm run db:generate` and commit the new file in `drizzle/`.
