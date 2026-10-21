import { useState } from 'react';
import { THIS_YEAR, type Issues, type Profile } from '../lib/model';
import { resolveSnippet } from '../lib/plausible';
import { link } from '../lib/url';
import { DEFAULT_THEME, THEMES, getTheme } from '../themes';
import ListEditor from './ListEditor';
import { Area, Chips, Combo, Num, Segmented, Text, Toggle } from './fields';

export interface SectionProps {
  p: Profile;
  up: (patch: Partial<Profile>) => void;
  issues: Issues;
  notify: (msg: string, undo?: boolean) => void;
}

const has = (issues: Issues, prefix: string) => Object.keys(issues).some((k) => k.startsWith(prefix));

const LINK_KEYS = ['github', 'gitlab', 'linkedin', 'website', 'x', 'email'];

export function ProfileSection({ p, up, issues }: SectionProps) {
  const me = p.profile;
  const set = (patch: Partial<Profile['profile']>) => up({ profile: { ...me, ...patch } });
  const links = me.links ?? {};
  const linkKeys = [...new Set([...LINK_KEYS.filter((k) => k in links || ['github', 'linkedin', 'email'].includes(k)), ...Object.keys(links)])];
  return (
    <>
      <div className="ed-grid">
        <Text label="Name" value={me.name} onChange={(name) => set({ name })} error={issues['profile.name']} hint="First word goes white, the rest gets the accent" wide />
        <Text label="Role" value={me.role} onChange={(role) => set({ role })} error={issues['profile.role']} wide />
        <Area label="Tagline" value={me.tagline} onChange={(tagline) => set({ tagline })} max={120} placeholder="One line people remember." wide />
        <Text label="Location" value={me.location} onChange={(location) => set({ location })} placeholder="City, Country" />
        <Text
          label="Handle"
          value={p.handle}
          onChange={(h) => up({ handle: h.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
          error={issues.handle}
          hint={`${location.host}${link(p.handle)}`}
        />
        <div className="wide">
          <Toggle label="Available for work" hint="Shows a badge in the hero" checked={me.available} onChange={(available) => set({ available })} />
        </div>
      </div>

      <h3 className="ed-sub">Theme</h3>
      <div className="ed-themes" role="radiogroup" aria-label="Theme">
        {THEMES.map((t) => {
          const on = (p.theme ?? DEFAULT_THEME) === t.id;
          return (
            <button
              type="button"
              role="radio"
              aria-checked={on}
              key={t.id}
              data-theme={t.id}
              className={`ed-theme${on ? ' on' : ''}`}
              onClick={() => up({ theme: t.id })}
              title={`${t.description} — by ${t.author.name}`}
            >
              <span className="ed-theme-sample display">{t.name}</span>
              <span className="ed-theme-chips" aria-hidden="true">
                <i style={{ background: t.tokens.fg }} />
                <i style={{ background: t.tokens.accent }} />
                <i style={{ background: t.tokens.muted }} />
              </span>
            </button>
          );
        })}
      </div>
      <p className="ed-hint ed-theme-more">
        {getTheme(p.theme).description} <a href={link('themes')} target="_blank" rel="noreferrer">All themes ↗</a>
      </p>

      <h3 className="ed-sub">Links</h3>
      <div className="ed-grid">
        {linkKeys.map((k) => (
          <Text
            key={k}
            label={k}
            value={links[k]}
            placeholder={k === 'email' ? 'mailto:you@example.com' : 'https://'}
            error={issues[`profile.links.${k}`]}
            onChange={(v) => {
              const next = { ...links, [k]: k === 'email' && v && !v.startsWith('mailto:') && v.includes('@') ? `mailto:${v}` : v };
              if (!v) delete next[k];
              set({ links: next });
            }}
          />
        ))}
      </div>

      <h3 className="ed-sub">Analytics — your own Plausible</h3>
      <p className="ed-hint">See who visits your stage in your <a href="https://plausible.io" target="_blank" rel="noreferrer">Plausible</a> (cloud or self-hosted). Add a site there, then paste the snippet it gives you — Starring reads the site and server out of it. Only a page view is sent; no script from your Plausible runs on this page.</p>
      <PlausibleSnippet onSite={(site) => up({ analytics: { plausible: site } })} />
      <div className="ed-grid">
        <Text
          label="Plausible site"
          value={p.analytics?.plausible?.domain}
          placeholder="starring.dev/you"
          error={issues['analytics.plausible.domain']}
          onChange={(domain) => up({ analytics: { plausible: { ...p.analytics?.plausible, domain: domain.trim() } } })}
        />
        <Text
          label="Plausible server"
          value={p.analytics?.plausible?.host}
          placeholder="https://plausible.io"
          hint="Leave empty for plausible.io"
          error={issues['analytics.plausible.host']}
          onChange={(host) => up({ analytics: { plausible: { domain: p.analytics?.plausible?.domain ?? '', ...(host.trim() && { host: host.trim() }) } } })}
        />
      </div>
    </>
  );
}

/** Paste Plausible's install snippet → fills the site and server fields below. */
function PlausibleSnippet({ onSite }: { onSite: (site: { domain: string; host?: string }) => void }) {
  const [text, setText] = useState('');
  const [state, setState] = useState<{ busy?: boolean; ok?: string; error?: string }>({});
  const read = async (value: string) => {
    if (!value.trim()) return setState({});
    setState({ busy: true });
    const r = await resolveSnippet(value);
    if ('error' in r) return setState({ error: r.error });
    onSite(r.site);
    setState({ ok: `Found ${r.site.domain} on ${r.site.host ?? 'plausible.io'}` });
  };
  return (
    <Area
      label="Plausible snippet"
      wide
      value={text}
      placeholder={'<script async src="https://plausible.io/js/pa-….js"></script>…'}
      error={state.error}
      hint={state.busy ? 'Reading…' : state.ok ? `✓ ${state.ok}` : 'Paste it here — or fill in the two fields below by hand'}
      onChange={(v) => { setText(v); void read(v); }}
    />
  );
}

export function NumbersSection({ p, up }: SectionProps) {
  const rows = [...(p.contributions ?? [])];
  const max = Math.max(1, ...rows.map((r) => (r.public || 0) + (r.private || 0)));
  const nextYear = rows.length ? Math.min(...rows.map((r) => r.year)) - 1 : THIS_YEAR - 1;
  return (
    <>
      <p className="ed-lead">Commits per year. Private = work in client or company repos that GitHub can't show. Importers will fill this automatically later.</p>
      <div className="ed-table">
        <div className="ed-tr ed-th"><span>Year</span><span>Public</span><span>Private</span><span>Imported</span><span /></div>
        {rows.map((r, i) => {
          const set = (patch: Partial<typeof r>) => up({ contributions: rows.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          return (
            <div className="ed-tr" key={i}>
              <input className="ed-input" type="number" value={r.year} onChange={(e) => set({ year: Number(e.target.value) })} aria-label="Year" />
              <input className="ed-input" type="number" min={0} value={r.public} onChange={(e) => set({ public: Number(e.target.value) })} aria-label="Public commits" />
              <input className="ed-input" type="number" min={0} value={r.private} onChange={(e) => set({ private: Number(e.target.value) })} aria-label="Private commits" />
              <input type="checkbox" checked={!!r.verified} onChange={(e) => set({ verified: e.target.checked })} aria-label="Imported" />
              <button type="button" className="ed-x" aria-label="Remove year" onClick={() => up({ contributions: rows.filter((_, j) => j !== i) })}>✕</button>
              <div className="ed-bar" aria-hidden="true">
                <span style={{ width: `${(r.public / max) * 100}%` }} className="pub" />
                <span style={{ width: `${(r.private / max) * 100}%` }} className="priv" />
              </div>
            </div>
          );
        })}
      </div>
      <button type="button" className="ed-add" onClick={() => up({ contributions: [...rows, { year: nextYear, public: 0, private: 0, verified: false }] })}>
        + Add {nextYear}
      </button>
    </>
  );
}

export function PlatformsSection({ p, up, notify }: SectionProps) {
  return (
    <ListEditor
      items={p.platforms ?? []}
      onChange={(platforms) => up({ platforms })}
      make={() => ({ name: 'GitLab', kind: 'private' as const, repos: 0, commits: 0 })}
      title={(x) => x.name}
      meta={(x) => `${x.commits.toLocaleString('en')} commits · ${x.kind}`}
      addLabel="Add platform"
      empty="Where does your code live? GitHub, self-hosted GitLab, Bitbucket…"
      onRemove={(x) => notify(`Removed ${x.name}`, true)}
      render={(x, set) => (
        <div className="ed-grid">
          <Combo label="Name" value={x.name} onChange={(name) => set({ name })} options={['GitHub', 'GitLab', 'GitLab (self-hosted)', 'Bitbucket', 'Azure DevOps', 'Gitea']} wide />
          <Segmented label="Visibility" value={x.kind} onChange={(kind) => set({ kind })} options={[{ id: 'public', label: 'Public' }, { id: 'private', label: 'Private' }]} />
          <Num label="Repositories" value={x.repos} min={0} onChange={(repos) => set({ repos })} />
          <Num label="Commits" value={x.commits} min={0} onChange={(commits) => set({ commits })} />
        </div>
      )}
    />
  );
}

export function ClientsSection({ p, up, issues, notify }: SectionProps) {
  return (
    <>
      <p className="ed-lead">Names only, as text — no logos. Mark NDA when you may say the name but not show the work.</p>
      <ListEditor
        items={p.clients ?? []}
        onChange={(clients) => up({ clients })}
        make={() => ({ name: '', sector: '', nda: true })}
        title={(x) => x.name}
        meta={(x) => (x.nda ? <span className="ed-pill">NDA</span> : <span className="ed-pill on">Public</span>)}
        addLabel="Add client"
        empty="Who trusted you with production?"
        invalid={(i) => has(issues, `clients.${i}.`)}
        onRemove={(x) => notify(`Removed ${x.name || 'client'}`, true)}
        render={(x, set, i) => (
          <div className="ed-grid">
            <Text label="Name" value={x.name} onChange={(name) => set({ name })} error={issues[`clients.${i}.name`]} />
            <Combo label="Sector" value={x.sector} onChange={(sector) => set({ sector })} options={['Film & TV', 'Media & Publishing', 'Fintech', 'Retail', 'Healthcare', 'Gaming', 'Telco', 'Aviation', 'Public sector']} />
            <div className="wide"><Toggle label="Under NDA" hint="Hides links on projects for this client" checked={x.nda} onChange={(nda) => set({ nda })} /></div>
          </div>
        )}
      />
    </>
  );
}

export function ExperienceSection({ p, up, issues, notify }: SectionProps) {
  const clientNames = (p.clients ?? []).map((c) => c.name).filter(Boolean);
  return (
    <ListEditor
      items={p.experience ?? []}
      onChange={(experience) => up({ experience })}
      make={() => ({ company: '', role: '', from: THIS_YEAR, to: null, summary: '', clients: [], stack: [] })}
      title={(x) => (x.role && x.company ? `${x.role} @ ${x.company}` : x.company || x.role)}
      meta={(x) => `${x.from}–${x.to ?? 'now'}`}
      addLabel="Add role"
      empty="Your timeline. Newest first works best."
      invalid={(i) => has(issues, `experience.${i}.`)}
      onRemove={(x) => notify(`Removed ${x.company || 'role'}`, true)}
      render={(x, set, i) => (
        <div className="ed-grid">
          <Text label="Company" value={x.company} onChange={(company) => set({ company })} error={issues[`experience.${i}.company`]} />
          <Text label="Role" value={x.role} onChange={(role) => set({ role })} error={issues[`experience.${i}.role`]} />
          <Num label="From" value={x.from} min={1970} max={THIS_YEAR} onChange={(from) => set({ from })} />
          {x.to === null ? (
            <div className="ed-field"><span className="ed-label">To</span><span className="ed-now">Present</span></div>
          ) : (
            <Num label="To" value={x.to} min={1970} max={THIS_YEAR} onChange={(to) => set({ to })} error={issues[`experience.${i}.to`]} />
          )}
          <div className="wide"><Toggle label="I still work here" checked={x.to === null} onChange={(now) => set({ to: now ? null : THIS_YEAR })} /></div>
          <Area label="Summary" value={x.summary} onChange={(summary) => set({ summary })} max={160} wide />
          <Chips label="Clients" value={x.clients} onChange={(clients) => set({ clients })} suggestions={clientNames} wide hint="Pick from your clients or type a new one" />
          <Chips label="Stack" value={x.stack} onChange={(stack) => set({ stack })} wide />
        </div>
      )}
    />
  );
}

export function ProjectsSection({ p, up, issues, notify }: SectionProps) {
  const clients = p.clients ?? [];
  return (
    <ListEditor
      items={p.projects ?? []}
      onChange={(projects) => up({ projects })}
      make={() => ({ title: '', client: '', year: THIS_YEAR, visibility: 'nda' as const, role: '', blurb: '', impact: [], stack: [] })}
      title={(x) => x.title}
      meta={(x) => <span className={`ed-pill${x.visibility === 'public' ? ' on' : ''}`}>{x.visibility}</span>}
      addLabel="Add project"
      empty="The work you're proudest of — public or not."
      invalid={(i) => has(issues, `projects.${i}.`)}
      onRemove={(x) => notify(`Removed ${x.title || 'project'}`, true)}
      render={(x, set, i) => (
        <div className="ed-grid">
          <Text label="Title" value={x.title} onChange={(title) => set({ title })} error={issues[`projects.${i}.title`]} wide />
          <Combo
            label="Client"
            value={x.client}
            options={clients.map((c) => c.name)}
            onChange={(client) => {
              const known = clients.find((c) => c.name === client);
              set(known?.nda && x.visibility === 'public' ? { client, visibility: 'nda' } : { client });
            }}
          />
          <Num label="Year" value={x.year} min={1970} max={THIS_YEAR + 1} onChange={(year) => set({ year })} />
          <Segmented
            label="Visibility"
            value={x.visibility}
            onChange={(visibility) => set(visibility === 'nda' ? { visibility, url: undefined } : { visibility })}
            options={[
              { id: 'public', label: 'Open source', hint: 'Links to the code' },
              { id: 'private', label: 'Private repo', hint: 'Code is closed, details are fine' },
              { id: 'nda', label: 'Under NDA', hint: 'Redacted bars, no links' },
            ]}
          />
          <Text label="Your role" value={x.role} onChange={(role) => set({ role })} />
          {x.visibility !== 'nda' && <Text label="URL" value={x.url} onChange={(url) => set({ url: url || undefined })} placeholder="https://" error={issues[`projects.${i}.url`]} />}
          <Area label="Blurb" value={x.blurb} onChange={(blurb) => set({ blurb })} max={180} error={issues[`projects.${i}.blurb`]} wide />
          <Chips label="Impact" value={x.impact} onChange={(impact) => set({ impact })} placeholder="18M visits, +23% conversion…" hint="Short and numeric hits hardest" wide />
          <Chips label="Stack" value={x.stack} onChange={(stack) => set({ stack })} wide />
        </div>
      )}
    />
  );
}

export function EducationSection({ p, up, issues, notify }: SectionProps) {
  return (
    <ListEditor
      items={p.education ?? []}
      onChange={(education) => up({ education })}
      make={() => ({ school: '', degree: '', from: THIS_YEAR - 4, to: THIS_YEAR })}
      title={(x) => x.school}
      meta={(x) => `${x.from}–${x.to}`}
      addLabel="Add school"
      empty="University, high school, bootcamp, certifications."
      invalid={(i) => has(issues, `education.${i}.`)}
      onRemove={(x) => notify(`Removed ${x.school || 'school'}`, true)}
      render={(x, set, i) => (
        <div className="ed-grid">
          <Text label="School" value={x.school} onChange={(school) => set({ school })} error={issues[`education.${i}.school`]} wide />
          <Text label="Degree / track" value={x.degree} onChange={(degree) => set({ degree })} wide />
          <Num label="From" value={x.from} onChange={(from) => set({ from })} />
          <Num label="To" value={x.to} onChange={(to) => set({ to })} />
        </div>
      )}
    />
  );
}

export function SkillsSection({ p, up, notify }: SectionProps) {
  const groups = Object.entries(p.skills ?? {}).map(([name, items]) => ({ name, items }));
  const save = (gs: { name: string; items: string[] }[]) =>
    up({ skills: Object.fromEntries(gs.map((g, i) => [g.name || `Group ${i + 1}`, g.items])) });
  return (
    <ListEditor
      items={groups}
      onChange={save}
      make={() => ({ name: `Group ${groups.length + 1}`, items: [] })}
      title={(g) => g.name}
      meta={(g) => `${g.items.length} skills`}
      addLabel="Add skill group"
      empty="Group skills, e.g. Frontend / Platform / Delivery."
      onRemove={(g) => notify(`Removed ${g.name}`, true)}
      render={(g, set) => (
        <div className="ed-grid">
          <Text label="Group" value={g.name} onChange={(name) => set({ name })} wide />
          <Chips label="Skills" value={g.items} onChange={(items) => set({ items })} wide />
        </div>
      )}
    />
  );
}
