import { totals, heatmap, type Profile, type Visibility } from '../lib/model';
import { link } from '../lib/url';
import './story.css';

const VIS_LABEL: Record<Visibility, string> = { public: 'Open source', private: 'Private repo', nda: 'Under NDA' };
const n = (v: number) => (v || 0).toLocaleString('en');

interface Props {
  p: Profile;
  /** Editor mode: everything visible at once, sections clickable. */
  preview?: boolean;
  onSection?: (id: string) => void;
}

/**
 * The scroll story. Rendered to static HTML on /[handle] and live in the editor,
 * so what you edit is exactly what ships. Sizes use container units (cqi) so
 * the editor's phone preview behaves like a real phone.
 */
export default function ProfileStory({ p, preview = false, onSection }: Props) {
  const t = totals(p);
  const me = p.profile ?? { name: '', role: '' };
  const [first, ...rest] = (me.name || ' ').split(' ');
  const contributions = [...(p.contributions ?? [])].sort((a, b) => b.year - a.year);
  const latest = contributions[0];
  const grid = latest ? heatmap(p.handle, latest.year, latest.public + latest.private) : [];
  const maxYear = Math.max(1, ...contributions.map((c) => c.public + c.private));
  const clients = (p.clients ?? []).filter((c) => c.name);
  const projects = p.projects ?? [];
  const experience = p.experience ?? [];
  const skills = Object.entries(p.skills ?? {}).filter(([, v]) => v?.length);
  const links = Object.entries(me.links ?? {}).filter(([, v]) => v);
  const platforms = (p.platforms ?? []).filter((pl) => pl.name);
  const hasActivity = !!latest && latest.public + latest.private > 0;

  const sec = (id: string) => ({
    'data-section': id,
    ...(onSection && {
      onClick: (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); onSection(id); },
      title: 'Click to edit',
    }),
  });
  let act = 0;
  const roman = () => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][act++];
  const Label = ({ children }: { children: string }) => (
    <div className="act-label mono"><span className="num">Act {roman()}</span><span>{children}</span></div>
  );

  return (
    <div className={`story${preview ? ' is-preview' : ''}`} data-theme={p.theme ?? 'acid'}>
      <header className="hero" {...sec('profile')}>
        <div className="hero-top mono">
          <a href={link()}>Starring</a>
          <span>{me.location}</span>
          {me.available && <span className="tag solid">Available for work</span>}
        </div>
        <h1 className="display hero-name">
          <span className="line">{first}</span>
          <span className="line accent">{rest.join(' ')}</span>
        </h1>
        <div className="hero-bottom">
          <p className="hero-role">{me.role}</p>
          <p className="muted hero-tag">{me.tagline}</p>
          <span className="mono scroll-cue">Scroll — the show starts ↓</span>
        </div>
      </header>

      {t.all > 0 && (
        <section className="act" id="numbers" {...sec('contributions')}>
          <Label>By the numbers</Label>
          <div className="stats">
            {[[t.years, 'years shipping'], [t.all, 'commits'], [t.clients, 'clients'], [t.repos, 'repositories']].map(([v, l]) => (
              <div className="stat reveal" key={l}><b className="display" data-count={v}>{n(v as number)}</b><span className="mono">{l}</span></div>
            ))}
          </div>
          <p className="iceberg reveal">
            <span className="display accent">{t.privateShare}%</span>
            of this work lives in private repos. GitHub only shows the tip.
          </p>
          <div className="split reveal" aria-label="Public versus private commits">
            <div className="split-pub" style={{ flex: t.public || 0.0001 }}><span className="mono">Public {n(t.public)}</span></div>
            <div className="split-priv" style={{ flex: t.private || 0.0001 }}><span className="mono">Private {n(t.private)}</span></div>
          </div>
        </section>
      )}

      {clients.length > 0 && (
        <section className="act act-clients" id="clients" {...sec('clients')}>
          <Label>Who trusted me with production</Label>
          <div className="marquee" aria-hidden="true">
            <div className="marquee-track display">
              {[...clients, ...clients].map((c, i) => <span className="client" key={i}>{c.name}<i>✦</i></span>)}
            </div>
          </div>
          <ul className="client-list">
            {clients.map((c, i) => (
              <li className="reveal" key={i}>
                <span className="client-name">{c.name}</span>
                <span className="muted">{c.sector}</span>
                {c.nda ? <span className="tag">NDA</span> : <span className="tag solid">Public</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {experience.length > 0 && (
        <section className="act" id="timeline" {...sec('experience')}>
          <Label>The road</Label>
          <ol className="timeline">
            {experience.map((e, i) => (
              <li className="tl-item reveal" key={i}>
                <div className="tl-year display">{e.from}<span className="muted">–{e.to ?? 'now'}</span></div>
                <div className="tl-body">
                  <h3>{e.role} <span className="muted">@ {e.company}</span></h3>
                  {e.summary && <p>{e.summary}</p>}
                  {e.clients?.length ? <p className="mono muted">Clients: {e.clients.join(' · ')}</p> : null}
                  <div className="chips">{e.stack?.map((s) => <span className="tag" key={s}>{s}</span>)}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {projects.length > 0 && (
        <section className="act" id="work" {...sec('projects')}>
          <Label>Featured work</Label>
          <div className="projects">
            {projects.map((pr, i) => (
              <article className={`project reveal vis-${pr.visibility}`} key={i}>
                <div className="project-meta mono">
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <span>{pr.year}</span>
                  <span className={pr.visibility === 'public' ? 'tag solid' : 'tag'}>{VIS_LABEL[pr.visibility]}</span>
                </div>
                <h3 className="display project-title">{pr.title}</h3>
                {pr.client && <p className="mono">for <span className="accent">{pr.client}</span>{pr.role && <> · {pr.role}</>}</p>}
                <p className="project-blurb">{pr.blurb}</p>
                {pr.visibility === 'nda' && (
                  <p className="redacted" title="Code and details under NDA">
                    <span>source code</span> <span>internal repo url</span> <span>architecture diagram</span>
                  </p>
                )}
                <ul className="impact">{pr.impact?.map((x) => <li className="display" key={x}>{x}</li>)}</ul>
                <div className="chips">{pr.stack?.map((s) => <span className="tag" key={s}>{s}</span>)}</div>
                {pr.url && pr.visibility !== 'nda' && <a className="mono project-link" href={pr.url}>View source ↗</a>}
              </article>
            ))}
          </div>
        </section>
      )}

      {(hasActivity || platforms.length > 0) && (
        <section className="act" id="activity" {...sec(hasActivity ? 'contributions' : 'platforms')}>
          <Label>{hasActivity ? 'Every commit counts' : 'Where the code lives'}</Label>
          {hasActivity && latest && (
            <>
              <h2 className="display big">{latest.year}<span className="muted"> / {n(latest.public + latest.private)} contributions</span></h2>
              <div className="heat reveal" role="img" aria-label={`Contribution heatmap for ${latest.year}`}>
                {grid.map((v, i) => <i className={`l${v}`} key={i} />)}
              </div>
              <div className="years">
                {contributions.map((c) => (
                  <div className="yr reveal" key={c.year}>
                    <span className="mono">{c.year}</span>
                    <div className="yr-bar">
                      <span className="pub" style={{ width: `${(c.public / maxYear) * 100}%` }} />
                      <span className="priv" style={{ width: `${(c.private / maxYear) * 100}%` }} />
                    </div>
                    <span className="mono muted">{c.verified ? '✓ imported' : 'self-reported'}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {platforms.length > 0 && (
            <ul className="platforms" {...sec('platforms')}>
              {platforms.map((pl, i) => (
                <li className="reveal" key={i}>
                  <span className="display">{n(pl.commits || pl.repos)}</span>
                  <span className="mono">{pl.name}</span>
                  <span className="mono muted">{pl.commits ? `${pl.repos} repos · ` : 'repositories · '}{pl.kind}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {((p.education?.length ?? 0) > 0 || skills.length > 0) && (
        <section className="act" id="training" {...sec('education')}>
          <Label>Training montage</Label>
          <div className="edu-skills">
            <ul className="edu">
              {p.education?.map((ed, i) => (
                <li className="reveal" key={i}>
                  <span className="mono muted">{ed.from}–{ed.to}</span>
                  <h3>{ed.school}</h3>
                  <p className="muted">{ed.degree}</p>
                </li>
              ))}
            </ul>
            <div className="skills" {...sec('skills')}>
              {skills.map(([group, items]) => (
                <div className="reveal" key={group}>
                  <p className="mono accent">{group}</p>
                  <p className="skill-items">{items.join(' / ')}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <footer className="credits" id="credits" {...sec('profile')}>
        <p className="mono muted">That's a wrap</p>
        <h2 className="display">Starring<br /><span className="accent">{me.name}</span></h2>
        <ul className="mono">
          {links.map(([k, v]) => <li key={k}><a href={v}>{k} ↗</a></li>)}
        </ul>
        <p className="mono muted">Made with Starring — open source</p>
      </footer>
    </div>
  );
}
