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
   BETTER_AUTH_URL=https://starring.dev
   BETTER_AUTH_SECRET=        # openssl rand -base64 32
   POSTGRES_PASSWORD=         # openssl rand -hex 24  (hex: it goes into a URL)
   ALLOW_SIGNUP=false         # private beta: you (first account), the allowlist and people you invite from /admin
   SIGNUP_ALLOWLIST=          # friend@example.com,other@example.com
   # optional
   STARRING_IMAGE_TAG=latest  # or sha-1a2b3c4 to pin a build
   PLAUSIBLE_SRC=             # https://plausible.example.com/js/pa-….js
   PLAUSIBLE_API_KEY=         # Stats API key → owners see their visitors on /account
   SMTP_HOST=                 # mail.example.com — for password reset emails
   SMTP_PORT=587
   SMTP_USER=
   SMTP_PASS=
   MAIL_FROM=Starring <hello@starring.dev>
   GITHUB_CLIENT_ID=
   GITHUB_CLIENT_SECRET=
   ```
3. **Domains** tab: set Service to `app`, Port to `4321` and the host to your domain, and turn HTTPS on (Let's Encrypt). In DNS, point the host at the server with an A record. If it's on Cloudflare, use **DNS only**.
4. **Deploy.** Migrations run automatically on start. Then open the domain and **create the first account**: on an empty instance it's always allowed, and that account is yours.
5. **Optional auto-deploy:** copy the compose service's **Deploy webhook** URL into the repository secret `DOKPLOY_DEPLOY_WEBHOOK`. After each `main` push, the image workflow pushes the new image and then triggers the redeploy, so you never deploy an image that's still building.
6. **Backups:** Postgres data lives in the `starring-db` volume. Back it up with your platform's volume backups (Dokploy/Nomploy volume backups to S3), or run `pg_dump` from the `db` container on a schedule.

To build on the server instead of pulling (for example from a fork without CI), replace `image:` and `pull_policy:` in the compose file with `build: .`.

## Email (SMTP)

Starring sends two kinds of email: **password reset** links and **address confirmation** after sign-up. It uses [nodemailer](https://nodemailer.com) with any SMTP server you already have, with no vendor lock-in.

```env
SMTP_HOST=mail.example.com
SMTP_PORT=587                 # 465 = implicit TLS (set automatically), 587 = STARTTLS
SMTP_USER=hello@example.com
SMTP_PASS=your-password       # any characters, no encoding needed
MAIL_FROM=Starring <hello@example.com>
# REQUIRE_EMAIL_VERIFICATION=true   # optional: no sign-in until the address is confirmed
```

Restart or redeploy after changing these. With no `SMTP_HOST`, nothing is sent: in development the link is printed to the server log, and in production a warning is logged.

### Common servers

| Server | `SMTP_HOST` | `SMTP_PORT` | Notes |
| --- | --- | --- | --- |
| Your own Postfix / Mailcow / Mailu | your mail host | 587 or 465 | Use a mailbox (or relay user) that is allowed to send as `MAIL_FROM` |
| Google Workspace / Gmail | `smtp.gmail.com` | 465 | Turn on 2-step verification and use an **App password** as `SMTP_PASS` |
| Microsoft 365 | `smtp.office365.com` | 587 | SMTP AUTH must be enabled for the mailbox |
| Zoho Mail | `smtp.zoho.eu` (or `.com`) | 465 | App-specific password if 2FA is on |
| Fastmail | `smtp.fastmail.com` | 465 | App password |
| A hosting mailbox (Websupport, Hetzner, …) | from your provider | 465 / 587 | Usually the mailbox address and password |

`SMTP_URL=smtps://user:pass@host:465` also works as a one-line alternative. If both are set, `SMTP_URL` wins. Special characters in the password must then be URL-encoded.

### Deliverability (keep it out of spam)

`MAIL_FROM` must be on a domain your SMTP server is allowed to send for. Add these records in DNS (e.g. Cloudflare):

- **SPF:** a `TXT` record on the domain that includes your mail server or provider, e.g. `v=spf1 include:_spf.google.com ~all` for Google, or `v=spf1 mx ~all` for your own server.
- **DKIM:** the `TXT` record your mail server or provider generates (Mailcow: *Configuration → ARC/DKIM keys*; Google: Admin → Gmail → Authenticate email).
- **DMARC:** start with `_dmarc` `TXT` `v=DMARC1; p=none; rua=mailto:you@example.com`, then tighten to `quarantine` once reports look clean.

Check the result with [mail-tester.com](https://www.mail-tester.com): send yourself a reset email there.

### Testing locally

`npm run db:up` also starts **Mailpit**, which catches all mail: `SMTP_HOST=127.0.0.1 SMTP_PORT=1025`, inbox at http://localhost:8025. CI uses the same setup, and `npm run test:e2e` with `MAILPIT_URL=http://127.0.0.1:8025` runs the full reset flow through a real email.

### Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `Invalid login` / `535` | Wrong user or password, or the provider needs an app password |
| `self signed certificate` / TLS errors | Wrong port/TLS pair: 465 needs implicit TLS, 587 needs STARTTLS. Set `SMTP_SECURE` explicitly |
| Mail arrives in spam | Missing SPF/DKIM/DMARC, or `MAIL_FROM` on a domain the server can't send for |
| Nothing arrives, no error | `SMTP_HOST` not set in the running container. Check the log for `SMTP is not configured` |

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
| `ALLOW_SIGNUP` | `true` | `false` makes the instance invite-only. The **first account on an empty instance is always allowed** (the owner), and so are emails on `SIGNUP_ALLOWLIST` and emails you invite from `/admin`. Visitors see **Request access** instead of *Create account*. See [Private beta](#private-beta-requests-and-invites). |
| `SIGNUP_ALLOWLIST` | none | Comma-separated emails that may sign up while `ALLOW_SIGNUP=false` |
| `AUTH_PASSWORD` | `true` | `false` turns off email + password and leaves only OAuth. |
| `GITHUB_CLIENT_ID` / `_SECRET` | none | Enables "Continue with GitHub". Callback: `<BETTER_AUTH_URL>/api/auth/callback/github` |
| `GITLAB_CLIENT_ID` / `_SECRET` | none | Enables "Continue with GitLab" (scope `read_user`). Callback: `…/api/auth/callback/gitlab` |
| `GITLAB_ISSUER` | `https://gitlab.com` | Your self-hosted GitLab URL |
| `DATABASE_POOL_MAX` | `10` | Postgres connections per app process |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | none / `587` | Outgoing mail for password reset and address verification, sent with nodemailer through any SMTP server: your own (Postfix, Mailcow…), Google Workspace, Zoho, Fastmail or your hosting's mailbox. Without `SMTP_HOST` nothing is sent; in development the reset link is printed to the server log. |
| `SMTP_SECURE` | auto | `true` for implicit TLS (port 465). Otherwise STARTTLS is used when the server offers it. |
| `SMTP_URL` | none | Alternative to the above as one URL, e.g. `smtps://user:pass@mail.example.com:465`. Special characters in the password must be URL-encoded. |
| `MAIL_FROM` | `Starring <no-reply@starring.dev>` | Sender address. Use a domain your provider has verified (SPF/DKIM). |
| `REQUIRE_EMAIL_VERIFICATION` | `false` | `true` blocks sign-in until the address is confirmed. Needs `SMTP_URL`. |
| `OPERATOR_NAME` / `OPERATOR_EMAIL` / `OPERATOR_ADDRESS` / `OPERATOR_COUNTRY` | none | Shown on `/terms` and `/privacy`. As the operator you are the data controller for your instance. |
| `ADMIN_EMAILS` | none | Comma-separated. These accounts can open `/admin`, hide reported profiles, receive report emails and claim blocked handles. |
| `BLOCKED_HANDLES` | none | Extra handles nobody may claim, added to the built-in list of brands and "official"-looking words |
| `REDIRECT_HOSTS` | none | Other hostnames that should send visitors to the public URL, comma-separated (e.g. `app.example.com,www.example.com`). Page loads get a 301 and the path is kept. Add those domains to the same service so the requests reach the app. |
| `TRUST_PROXY` | `false` (`true` in the Dokploy compose) | Use `X-Forwarded-For` for the visitor's IP (rate limits on reports and access requests) even when the proxy connects from a public address. It's always trusted from private addresses (a proxy on the same host or network). Leave it off if the app port is reachable directly. |
| `NOINDEX` | `false` | `true` adds `noindex` to every page and makes `robots.txt` block everything. Use it for a demo or mirror (e.g. a GitHub Pages copy) of a site that lives elsewhere. |
| `PLAUSIBLE_SRC` | none | Optional [Plausible](https://plausible.io) script URL (`https://…/js/….js`). It's cookieless, and nothing loads when this is unset. For static sites on GitHub Pages, set it as a repository **variable** with the same name instead. |
| `PLAUSIBLE_API_KEY` | none | A Plausible **Stats API** key (Plausible → Settings → API keys). When set, every owner sees the last 30 days of visitors to *their* page on `/account`: totals, a daily chart, top sources and countries. The key never leaves the server; numbers are cached for 5 minutes. |
| `PLAUSIBLE_API_HOST` | the `PLAUSIBLE_SRC` host | Where the Stats API lives, if it differs from the script host. |
| `PLAUSIBLE_SITE_ID` | hostname of `SITE_URL` / `BETTER_AUTH_URL` | The site name in Plausible (e.g. `starring.dev`). |

## Security notes

- Passwords are hashed by [Better Auth](https://www.better-auth.com). Sessions are HTTP-only cookies.
- Auth endpoints are rate-limited (30 requests per minute per IP).
- Every response carries security headers: a Content-Security-Policy that allows scripts only from this site (plus your `PLAUSIBLE_SRC` host), `X-Frame-Options: DENY` (except the embeddable `/<handle>/card`), `nosniff`, a strict Referrer-Policy and, behind HTTPS, HSTS.
- **Health check:** `GET /api/health` returns `200 {"ok":true,"db":true}` when the app can reach Postgres, and `503` when it can't. The Docker image and `docker-compose.dokploy.yml` use it, so Nomad and Dokploy restart a container that has lost its database.
- Profile writes require a session and are rejected from other origins.
- Profiles are validated on the server (same rules as the editor) and capped at 200 KB.
- Unpublished profiles return 404 to everyone, including search engines.
- Users can delete their account from `/account`, which also deletes their profile.
- **Email:** with `SMTP_HOST` (or `SMTP_URL`) set, there's "Forgot password?" (single-use link, valid 1 hour, signs out every other session) and a confirmation email on sign-up. `REQUIRE_EMAIL_VERIFICATION=true` makes that confirmation mandatory. The reset form answers the same way whether or not an account exists, so it can't be used to probe for addresses.

## Private beta: requests and invites

With `ALLOW_SIGNUP=false`, the landing page and `/login` offer **Request access**. The visitor leaves an email and, optionally, a name, a GitHub, LinkedIn or website link, and a note. Admins (`ADMIN_EMAILS`) get an email about each request when SMTP is configured.

On `/admin`, under **Access requests**:
- **Invite** sends the person an email with a sign-up link (`/login?mode=signup&invite=…`). The admin page always shows the link too, so you can copy and send it yourself. Without SMTP, that's the only way.
- **Invite any email** invites someone who never asked.
- **Decline** removes the request from the list.

An invite allows that **email address** to sign up, with a password or with GitHub or GitLab if the account uses the same email. No redeploy or `SIGNUP_ALLOWLIST` change is needed. Once the person signs up, the request is marked *joined*. It's included in their *Download my data* export and deleted with their account.

## Terms, privacy and moderation

- **`/terms` and `/privacy`** are templates written for an EU/GDPR context. They describe what Starring actually stores and does, and fill in `OPERATOR_*`. They're a solid starting point, **not legal advice**: have them reviewed for your situation before a public launch.
- **Impersonation:** handles of well-known brands and platforms (`google`, `github`, `warnerbros`, `the-economist`…) and anything that looks official (`admin`, `support`, `official-…`, `starring-…`) can't be claimed. Extend the list with `BLOCKED_HANDLES`. Admins can still claim them, for example for a company's real page.
- **Reports:** every public profile has a *Report* link (`/report?h=<handle>`) with a reason and optional details. Reports are rate-limited and emailed to `ADMIN_EMAILS` when SMTP is set.
- **Moderation (`/admin`):** review open reports and **hide** a profile. A hidden profile disappears from its page, the directory, the sitemap, OG and oEmbed, and the owner can't re-publish it. The owner sees the reason on their account page. You can also **dismiss** a report or **unhide** a profile.

## Local development in server mode

```bash
npm run db:up                                                     # Postgres on 127.0.0.1:5440
export DATABASE_URL=postgres://starring:starring@127.0.0.1:5440/starring
npm run db:migrate
npm run dev:server                                                # http://localhost:4321
# email: npm run db:up also starts Mailpit → SMTP_HOST=127.0.0.1 SMTP_PORT=1025, inbox at http://localhost:8025
```

After you change `src/server/db/schema.ts`, run `npm run db:generate` and commit the new file in `drizzle/`.
