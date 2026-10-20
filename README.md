<p align="center">
  <img src="docs/screenshots/hero.png" alt="A Starring profile: a huge two-tone name, role and tagline on a black stage" width="100%" />
</p>

<h1 align="center"><img src="public/brand/logo.svg" alt="Starring" height="72" /></h1>

<p align="center">
  <b>Your developer career as a scroll story, including the work GitHub can't show.</b><br />
  Open source · one YAML file per person · free on GitHub Pages
</p>

<p align="center">
  <a href="https://pipozzz.github.io/starring/"><b>Live demo</b></a> ·
  <a href="https://pipozzz.github.io/starring/edit"><b>Try the editor</b></a> ·
  <a href="https://github.com/pipozzz/starring/generate"><b>Use this template</b></a> ·
  <a href="#your-own-starring-site-in-5-minutes">5-minute setup</a> ·
  <a href="#contributing">Contribute</a>
</p>

---

Most working developers' best code sits in private repos: client projects, the agency's self-hosted GitLab, work under NDA. Your GitHub profile shows only the small public part.

**Starring shows the whole career on one page.** It covers the clients you can name, the projects you can't show, your public repos, school and stack, and it's designed so people remember it.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/act-numbers.png" alt="Act I: years shipping, commits, clients, repositories, and the share of work in private repos" /></td>
    <td width="50%"><img src="docs/screenshots/act-clients.png" alt="Act II: a moving marquee of client names with NDA and public tags" /></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/act-work.png" alt="Act IV: a featured project under NDA with redaction bars and big impact numbers" /></td>
    <td><img src="docs/screenshots/act-activity.png" alt="Act V: contribution heatmap and public versus private commits per year" /></td>
  </tr>
</table>

> **Try it now:** open the [live demo](https://pipozzz.github.io/starring/) and type your GitHub username, or browse the sample profiles [Nova](https://pipozzz.github.io/starring/nova/) and [Milo](https://pipozzz.github.io/starring/milo/). Nothing is stored on a server.

## What you get

- **A scroll story in acts.** Hero, the numbers, the client wall, the timeline, featured work, activity, school and skills, and closing credits.
- **Proper NDA handling.** You name the client and describe the impact. The code, internal links and diagrams appear as redaction bars.
- **Public and private, side by side.** It shows "73% of this work lives in private repos" and makes that the headline instead of an excuse.
- **An instant draft from GitHub.** Type a username and get your name, links, top repos, languages and topics in seconds.
- **A visual editor with a live preview** at desktop, tablet and phone sizes. It has drag and drop, undo, validation and a "stage ready" score.
- **Your data stays a file.** A profile is one readable YAML file in your repo. There's no account and no lock-in.
- **Static and fast.** Built with Astro and no client JS on profile pages. It deploys to GitHub Pages with the included workflow.

<p align="center">
  <img src="docs/screenshots/editor.png" alt="The Starring editor: section list, form fields and a live preview of the profile" width="100%" />
</p>

## Your own Starring site in 5 minutes

1. Click **[Use this template](https://github.com/pipozzz/starring/generate)** to create your own repo.
2. Open the editor: use the [hosted one](https://pipozzz.github.io/starring/edit), or run it locally with `npm install && npm run dev` and open **`/edit`**.
3. Choose **Start from → GitHub profile** to get an instant draft. Then add the parts GitHub can't see: clients, NDA projects, your timeline, school.
4. Press **Export .yaml** (⌘S) and save the file as **`profiles/<your-handle>.yaml`**. With exactly one file in `profiles/`, your profile becomes the home page.
5. In your repo, open **Settings → Pages → Build and deployment** and set **Source: GitHub Actions**.
6. Push to `main`. The site goes live at `https://<user>.github.io/<repo>/`. Name the repo `<user>.github.io` to serve it from the root, or add a custom domain.

The Pages workflow reads the correct `site` and `base` from GitHub, so project pages, user pages and custom domains all work without editing config.

## Self-host it with accounts

Want a Starring instance where people **sign up, claim a handle and publish** without touching git? Run it in server mode with Postgres:

```bash
cp .env.example .env   # set BETTER_AUTH_URL, BETTER_AUTH_SECRET, POSTGRES_PASSWORD
docker compose up -d
```

You get email + password sign-up (GitHub and GitLab sign-in optional), autosave to the database, publish and unpublish, account deletion, and an `ALLOW_SIGNUP=false` switch for private instances. The editor and the scroll story are the same as in static mode.

For Dokploy, plain Node and all the settings, see **[docs/self-hosting.md](docs/self-hosting.md)**.

## Run it locally

```bash
npm install
npm run dev     # http://localhost:4321  (editor at /edit)
npm run build   # static site in dist/
```

Requires Node 22.22 or newer.

## A profile is one YAML file

```yaml
handle: nova
theme: acid            # any folder in src/themes/ — see /themes
profile:
  name: Nova Kováč
  role: Senior Frontend & Platform Engineer
  tagline: Eleven years shipping pixels for people who print money and stories.
clients:
  - { name: Northwind Pictures, sector: Film & TV, nda: true }
projects:
  - title: Premiere Night Streaming Hub
    client: Northwind Pictures
    visibility: nda    # public | private | nda
    blurb: Global launch platform for a blockbuster franchise.
    impact: [18M visits launch week, 99.98% uptime]
```

For a full example, see [`examples/nova.yaml`](examples/nova.yaml), which shows every section.

| `profiles/` contains | Home page shows |
| --- | --- |
| nothing | demo: the samples from `examples/` |
| one file | that profile, so the repo works as a personal site |
| several files | a directory of all profiles, each at `/<handle>` |

## Sharing, SEO and embeds

Every profile is ready to be shared:

- **A movie-poster preview image** (`/og/<handle>.png`, 1200×630). It's generated at build time, or on request in server mode, in the profile's theme colours, and it shows up on LinkedIn, X, Slack and Discord.
- **Search metadata:**
  - schema.org `ProfilePage` + `Person` JSON-LD (job title, `sameAs` links, skills, employer, schools, open-source repos),
  - canonical URLs,
  - `sitemap.xml` and `robots.txt`,
  - `noindex` on the editor and account pages.
- **An embeddable card** for blogs, portfolios and Notion:

  ```html
  <iframe src="https://<your-site>/<handle>/card/" width="600" height="340" style="border:0;max-width:100%" loading="lazy"></iframe>
  ```

  In server mode there's also an **oEmbed** endpoint (`/oembed?url=…`), so tools that support oEmbed can embed a profile from its URL.

## Themes

Six themes ship today: **Acid**, **Blood**, **Ice**, **Paper** (light, editorial serif), **VHS** (scanlines and chromatic edges) and **Broadway** (gold marquee bulbs). You can browse them in the [theme gallery](https://pipozzz.github.io/starring/themes) or try one in the editor.

<p align="center"><img src="docs/screenshots/themes.png" alt="Theme gallery: Broadway with marquee bulbs, Ice, Paper in italic serif, and VHS with scanlines" width="100%" /></p>

A theme is a folder with 7 colour tokens, 3 Google Fonts and optional CSS. To create one:

```bash
npm run new:theme -- noir "Film Noir"
```

It appears in the gallery and the editor straight away. See [CONTRIBUTING → Add a theme](CONTRIBUTING.md#add-a-theme).

## Visual editor

Open `/edit`, `/edit?new` for a blank profile, `/edit?from=<handle>` to edit an existing one, or `/edit?github=<username>` to start from GitHub.

- **Live preview.** The preview renders the same `ProfileStory` component as the published page. The layout uses container queries, so the phone view really reflows. Click any section in the preview to jump to its form.
- **Editing.** Cards can be dragged to reorder, duplicated, or deleted, and deletes can be undone. Tag inputs suggest clients you've already added. Picking an NDA client switches the project to NDA.
- **Validation and readiness.** Errors appear as you type, with a badge per section. A "Stage ready" checklist shows what's still missing.
- **Undo, import and export.** ⌘Z / ⇧⌘Z undo and redo, and drafts autosave in your browser. You can paste, pick or drop YAML/JSON to import. ⌘S exports `<handle>.yaml`.

## Importers

**GitHub** ([`src/lib/importers/github.ts`](src/lib/importers/github.ts)) runs in the browser or in Node. It talks only to `api.github.com`.
- It imports your profile, links, your top 4 own repos as featured projects (stars and forks become impact numbers), and your languages and topics as skills.
- With an optional `read:user` token, it also imports exact contributions per year, including the private count GitHub reports when *Include private contributions* is on. The token is never stored.
- **Merge into current** refreshes GitHub data and keeps your clients, timeline and NDA work.

**Planned:**
- GitLab, including self-hosted, Bitbucket and Gitea.
- JSON Resume.
- `npx starring scan ~/work`, a local CLI that counts *your* commits in private repos and keeps only dates and counts. Code, messages and repo names never leave your machine.

## Roadmap

- [x] Scroll story with acts, NDA redaction and public/private split
- [x] Visual editor with live, responsive preview
- [x] Instant draft from GitHub
- [x] GitHub Pages template workflow
- [x] Theme plugins (`src/themes/<id>`) and a theme gallery
- [x] Movie-poster Open Graph image per profile, JSON-LD, sitemap, embeddable card + oEmbed
- [ ] GitLab / Bitbucket / Gitea importers
- [ ] Local `starring scan` CLI for private repos
- [x] Server mode: sign up (email, GitHub, GitLab), claim a handle, autosave to Postgres, publish

### Architecture

The pages read profiles only through a `ProfileStore` interface (`src/lib/profiles.ts`). Today the store reads YAML files. Hosted mode will put the same JSON document in a database, so the pages and the editor won't change.

```
YAML files ─┐   ┌──────────────┐   ┌─► /<handle>   scroll story (static HTML)
            ├──►│ ProfileStore │───┤
Postgres  ──┘   └──────────────┘   └─► /            home: demo · personal · directory
(server mode)        ▲
                     │ same Profile model (src/lib/model.ts)
                /edit visual editor ── importers (GitHub, …)
```

## Contributing

Contributions of every size are welcome. Good places to start:

- **A theme.** Run `npm run new:theme -- <id>`, pick 7 colours and 3 fonts, and open a PR. This is the easiest first PR.
- **An importer**, for GitLab, Bitbucket, Gitea or JSON Resume. Each one is a small, self-contained module.
- **Translations** of the story labels.
- **Bug reports with a profile YAML** that renders wrong.

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and conventions. Issues labelled `good first issue` are a good starting point.

## A note on client names

Saying you worked on a project for a company is usually fine. Showing its logo or describing internals can breach an NDA or trademark rules. Starring renders client names as text only, and the `nda` flag removes links and details. Check your contracts.

## Brand

The mark is a star breaking out of a ring (STAR + RING), because your work is bigger than the circle GitHub can see. You'll find the assets in [`public/brand/`](public/brand/) (`logo.svg`, `logo-light.svg`, `mark.svg`, `app-icon.png`) and the [brand sheet](docs/brand/sheet.png). Run `npm run brand` to regenerate them.

## License

[MIT](LICENSE)
