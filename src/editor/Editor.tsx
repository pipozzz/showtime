import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { parse, stringify } from 'yaml';
import { blankProfile, totals, validate, type Profile } from '../lib/model';
import ProfileStory from '../story/ProfileStory';
import { importGithub } from '../lib/importers/github';
import { link } from '../lib/url';
import GithubDialog from './GithubDialog';
import { useServer, type SyncStatus } from './useServer';
import { getTheme, hasTheme } from '../themes';
import {
  ClientsSection, EducationSection, ExperienceSection, NumbersSection, PlatformsSection,
  ProfileSection, ProjectsSection, SkillsSection, type SectionProps,
} from './sections';
import './editor.css';

const DRAFT_KEY = 'showtime:draft:v1';

const SECTIONS: { id: string; label: string; short: string; act: string; C: (p: SectionProps) => ReactElement; prefix: string[] }[] = [
  { id: 'profile', label: 'Headliner', short: 'Hero', act: 'Hero', C: ProfileSection, prefix: ['handle', 'profile.'] },
  { id: 'contributions', label: 'Numbers', short: 'Nums', act: 'I · V', C: NumbersSection, prefix: ['contributions.'] },
  { id: 'clients', label: 'Clients', short: 'Clnt', act: 'II', C: ClientsSection, prefix: ['clients.'] },
  { id: 'experience', label: 'Timeline', short: 'Time', act: 'III', C: ExperienceSection, prefix: ['experience.'] },
  { id: 'projects', label: 'Featured work', short: 'Work', act: 'IV', C: ProjectsSection, prefix: ['projects.'] },
  { id: 'platforms', label: 'Platforms', short: 'Git', act: 'V', C: PlatformsSection, prefix: ['platforms.'] },
  { id: 'education', label: 'Education', short: 'Edu', act: 'VI', C: EducationSection, prefix: ['education.'] },
  { id: 'skills', label: 'Skills', short: 'Skill', act: 'VI', C: SkillsSection, prefix: ['skills'] },
];

const DEVICES = { desktop: 1280, tablet: 820, phone: 390 } as const;

const SYNC_LABEL: Record<SyncStatus, string> = {
  off: '', loading: 'Connecting…', anon: '', unclaimed: 'Not saved — claim a handle', saved: 'Saved', saving: 'Saving…',
  invalid: 'Fix highlighted fields to save', error: 'Save failed — retrying on next edit',
};
const SYNC_CLASS: Record<SyncStatus, string> = {
  off: '', loading: 'saving', anon: '', unclaimed: 'off', saved: 'saved', saving: 'saving', invalid: 'off', error: 'off',
};
type Device = keyof typeof DEVICES;

// ---------- helpers ----------

const normalize = (raw: unknown): Profile => {
  if (!raw || typeof raw !== 'object' || !('profile' in raw)) throw new Error('Not a Showtime profile: missing `profile:` block');
  const b = blankProfile();
  const r = raw as Profile;
  return { ...b, ...r, profile: { ...b.profile, ...r.profile } };
};

const toYaml = (p: Profile) =>
  `# Showtime profile — drop into profiles/${p.handle}.yaml\n# https://github.com/pipozzz/showtime\n` + stringify(p, { lineWidth: 0 });

const readiness = (p: Profile) => {
  const t = totals(p);
  const checks: [boolean, string, string][] = [
    [!!p.profile.tagline?.trim(), 'Write a tagline', 'profile'],
    [Object.values(p.profile.links ?? {}).some(Boolean), 'Add at least one link', 'profile'],
    [t.all > 0, 'Add your commit numbers', 'contributions'],
    [(p.clients?.length ?? 0) >= 3, 'List 3+ clients', 'clients'],
    [(p.experience?.length ?? 0) >= 2, 'Add 2+ roles', 'experience'],
    [(p.projects?.length ?? 0) >= 2, 'Feature 2+ projects', 'projects'],
    [(p.projects ?? []).some((x) => x.impact?.length), 'Give a project impact numbers', 'projects'],
    [(p.education?.length ?? 0) > 0, 'Add education', 'education'],
    [Object.keys(p.skills ?? {}).length > 0, 'Add skills', 'skills'],
  ];
  const done = checks.filter((c) => c[0]).length;
  return { score: Math.round((done / checks.length) * 100), todo: checks.filter((c) => !c[0]) };
};

// ---------- history (undo/redo with typing coalesced) ----------

function useHistory(initial: Profile) {
  const [h, setH] = useState({ past: [] as Profile[], present: initial, future: [] as Profile[] });
  const last = useRef({ key: '', at: 0 });
  const commit = useCallback((next: Profile, key = '') => {
    const now = Date.now();
    const coalesce = key && key === last.current.key && now - last.current.at < 900;
    last.current = { key, at: now };
    setH((s) => ({
      past: coalesce ? s.past : [...s.past.slice(-99), s.present],
      present: next,
      future: [],
    }));
  }, []);
  const undo = useCallback(() => setH((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s)), []);
  const redo = useCallback(() => setH((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s)), []);
  return { p: h.present, commit, undo, redo, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}

// ---------- editor ----------

interface Props { samples: Profile[] }

export default function Editor({ samples }: Props) {
  // opened with ?from / ?github / ?new: keep that draft even when signed in (it gets saved over the stored one)
  const keepLocal = useMemo(() => /[?&](from|github|new)\b/.test(location.search), []);
  const initial = useMemo<{ p: Profile; source: string }>(() => {
    const q = new URLSearchParams(location.search);
    const from = q.get('from');
    const sample = samples.find((s) => s.handle === from);
    const theme = q.get('theme');
    if (sample) {
      const p = structuredClone(sample);
      if (theme && hasTheme(theme)) p.theme = theme;
      return { p, source: theme ? `Loaded /${sample.handle} in ${getTheme(theme).name}` : `Loaded /${sample.handle}` };
    }
    if (q.has('new')) return { p: blankProfile(), source: 'Blank stage' };
    let draft: Profile | undefined;
    try {
      const d = localStorage.getItem(DRAFT_KEY);
      if (d) draft = normalize(JSON.parse(d));
    } catch { /* storage blocked or corrupt draft */ }
    // GitHub import replaces this after load; keeping the draft makes it undoable
    if (q.get('github')) return { p: draft ?? blankProfile(), source: `Reading github.com/${q.get('github')}…` };
    if (draft) return { p: draft, source: 'Draft restored' };
    return { p: samples[0] ? structuredClone(samples[0]) : blankProfile(), source: 'Sample loaded — make it yours' };
  }, [samples]);

  const { p, commit, undo, redo, canUndo, canRedo } = useHistory(initial.p);
  const server = useServer(p, (remote) => commit(normalize(remote)), keepLocal);
  const [active, setActive] = useState('profile');
  const [device, setDevice] = useState<Device>('desktop');
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit');
  const [toast, setToast] = useState<{ msg: string; undo?: boolean; id: number } | null>({ msg: initial.source, id: 0 });
  const [saved, setSaved] = useState<'saved' | 'saving' | 'off'>('saved');
  const [importOpen, setImportOpen] = useState(false);
  const [gh, setGh] = useState<{ open: boolean; user?: string; error?: string; busy?: boolean }>({ open: false });
  const [notes, setNotes] = useState<string[]>([]);
  const [menu, setMenu] = useState<'start' | 'ready' | null>(null);
  const [dropping, setDropping] = useState(false);
  const [paneW, setPaneW] = useState(900);

  const issues = useMemo(() => validate(p), [p]);
  const ready = useMemo(() => readiness(p), [p]);
  const issueCount = Object.keys(issues).length;

  const pane = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const formScroll = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const notify = useCallback((msg: string, withUndo = false) => setToast({ msg, undo: withUndo, id: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 6000 : 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // autosave
  useEffect(() => {
    setSaved('saving');
    const t = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(p)); setSaved('saved'); } catch { setSaved('off'); }
    }, 500);
    return () => clearTimeout(t);
  }, [p]);

  // preview sizing
  useEffect(() => {
    if (!pane.current) return;
    const ro = new ResizeObserver(([e]) => setPaneW(e.contentRect.width));
    ro.observe(pane.current);
    return () => ro.disconnect();
  }, []);
  const frameW = DEVICES[device];
  const zoom = Math.min(1, (paneW - 48) / frameW);

  // highlight + scroll preview to the active section
  const focusPreview = useCallback((id: string) => {
    const root = frame.current;
    if (!root) return;
    root.querySelectorAll('[data-section].is-active').forEach((el) => el.classList.remove('is-active'));
    const els = root.querySelectorAll(`[data-section="${id}"]`);
    els.forEach((el) => el.classList.add('is-active'));
    els[0]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  useEffect(() => { focusPreview(active); }, [active, device, focusPreview]);
  useEffect(() => {
    // keep highlight after re-render of the preview
    frame.current?.querySelectorAll(`[data-section="${active}"]`).forEach((el) => el.classList.add('is-active'));
  });

  const pick = (id: string) => {
    setActive(id);
    setMobileTab('edit');
    formScroll.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const up = useCallback((patch: Partial<Profile>) => commit({ ...p, ...patch }, active), [p, commit, active]);

  // ---------- import / export ----------
  const imported = (next: Profile, importNotes: string[], label: string) => {
    commit(next);
    setNotes(importNotes);
    setGh({ open: false });
    setActive('profile');
    notify(`${label} — Cmd+Z to undo`, true);
  };

  // /edit?github=<user>: build the draft straight away
  useEffect(() => {
    const user = new URLSearchParams(location.search).get('github');
    if (!user) return;
    setGh({ open: false, busy: true });
    importGithub(user)
      .then(({ profile, notes: n }) => imported(profile, n, `Imported @${profile.handle} from GitHub`))
      .catch((e) => setGh({ open: true, user, error: (e as Error).message }));
    history.replaceState(null, '', location.pathname);
  }, []);

  const load = (raw: string, label: string) => {
    try {
      const next = normalize(parse(raw));
      commit(next);
      notify(`${label} — Cmd+Z to undo`, true);
      setImportOpen(false);
    } catch (e) {
      notify(`Import failed: ${(e as Error).message}`);
    }
  };
  const loadFile = async (f: File) => load(await f.text(), `Imported ${f.name}`);
  const download = () => {
    const blob = new Blob([toYaml(p)], { type: 'text/yaml' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${p.handle}.yaml` });
    a.click();
    URL.revokeObjectURL(a.href);
    notify(`Saved ${p.handle}.yaml — put it in profiles/ and build`);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(toYaml(p)); notify('YAML copied to clipboard'); } catch { notify('Clipboard blocked by the browser'); }
  };

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) { if (e.key === 'Escape') { setMenu(null); setImportOpen(false); } return; }
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
      else if (k === 's') { e.preventDefault(); download(); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  // drag a YAML file anywhere onto the editor
  useEffect(() => {
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); setDropping(true); } };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setDropping(false); };
    const drop = (e: DragEvent) => {
      const f = e.dataTransfer?.files?.[0];
      setDropping(false);
      if (f) { e.preventDefault(); loadFile(f); }
    };
    addEventListener('dragover', over);
    addEventListener('dragleave', leave);
    addEventListener('drop', drop);
    return () => { removeEventListener('dragover', over); removeEventListener('dragleave', leave); removeEventListener('drop', drop); };
  });

  const section = SECTIONS.find((s) => s.id === active)!;
  const sectionIssues = (s: (typeof SECTIONS)[number]) => Object.keys(issues).filter((k) => s.prefix.some((pre) => k === pre || k.startsWith(pre))).length;
  const Section = section.C;

  return (
    <div
      className={`ed ed-tab-${mobileTab}`}
      style={{ ['--accent' as string]: getTheme(p.theme).tokens.accent, ['--accent-ink' as string]: getTheme(p.theme).tokens.accentInk }}
    >
      <header className="ed-top">
        <a href={link()} className="ed-logo display">Show<span className="accent">time</span></a>
        <span className="ed-sep" />
        <div className="ed-menu-wrap">
          <button type="button" className="ed-btn ghost" onClick={() => setMenu(menu === 'start' ? null : 'start')} aria-expanded={menu === 'start'}>
            <span className="mono muted">/</span>{p.handle} <span aria-hidden>▾</span>
          </button>
          {menu === 'start' && (
            <div className="ed-menu" onMouseLeave={() => setMenu(null)}>
              <p className="ed-menu-h mono">Start from</p>
              <button type="button" className="ed-menu-gh" onClick={() => { setGh({ open: true }); setMenu(null); }}>GitHub profile… <span className="muted">instant draft</span></button>
              <button type="button" onClick={() => { commit(blankProfile()); setMenu(null); notify('Blank stage — Cmd+Z to undo', true); }}>Blank stage</button>
              {samples.map((s) => (
                <button type="button" key={s.handle} onClick={() => { commit(structuredClone(s)); setMenu(null); notify(`Loaded /${s.handle} — Cmd+Z to undo`, true); }}>
                  Sample: {s.profile.name} <span className="muted">/{s.handle}</span>
                </button>
              ))}
              <hr />
              <button type="button" onClick={() => { setImportOpen(true); setMenu(null); }}>Import YAML…</button>
            </div>
          )}
        </div>
        {server.hosted && server.status !== 'anon' ? (
          <span className={`ed-status mono ${SYNC_CLASS[server.status]}`} title={server.error || 'Your profile on this Showtime instance'}>
            {SYNC_LABEL[server.status]}
          </span>
        ) : (
          <span className={`ed-status mono ${saved}`} title="Drafts live in this browser only">
            {saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Draft saved locally' : 'Not saved (storage blocked)'}
          </span>
        )}

        <div className="ed-top-mid">
          <div className="ed-seg small ed-devices" role="radiogroup" aria-label="Preview device">
            {(Object.keys(DEVICES) as Device[]).map((d) => (
              <button type="button" key={d} role="radio" aria-checked={device === d} className={device === d ? 'on' : ''} onClick={() => setDevice(d)}>
                {d === 'desktop' ? '▭' : d === 'tablet' ? '▯' : '▮'} <span>{d}</span>
              </button>
            ))}
          </div>
          <div className="ed-seg small ed-mtabs" role="tablist">
            <button type="button" className={mobileTab === 'edit' ? 'on' : ''} onClick={() => setMobileTab('edit')}>Edit</button>
            <button type="button" className={mobileTab === 'preview' ? 'on' : ''} onClick={() => setMobileTab('preview')}>Preview</button>
          </div>
        </div>

        <div className="ed-top-right">
          <button type="button" className="ed-icon" onClick={undo} disabled={!canUndo} title="Undo (⌘Z)" aria-label="Undo">↶</button>
          <button type="button" className="ed-icon" onClick={redo} disabled={!canRedo} title="Redo (⇧⌘Z)" aria-label="Redo">↷</button>
          <button type="button" className="ed-btn ghost hide-sm" onClick={copy}>Copy YAML</button>
          {server.hosted && server.status === 'anon' && (
            <a className="ed-btn" href={`${link('login')}?next=${encodeURIComponent(link('edit'))}`}>Sign in to save</a>
          )}
          {server.hosted && server.status === 'unclaimed' && (
            <button
              type="button"
              className="ed-btn"
              onClick={async () => {
                const r = await server.claim();
                if (r.ok) notify(`/${r.handle} is yours — autosave is on`);
                else { pick('profile'); notify(r.error); }
              }}
            >
              Claim /{p.handle}
            </button>
          )}
          {server.own && (
            <>
              <button
                type="button"
                className={`ed-btn${server.own.published ? ' ghost' : ''}`}
                onClick={async () => {
                  const r = await server.publish(!server.own!.published);
                  notify(r.ok ? (server.own!.published ? 'Unpublished — only you can see it' : `Live at /${server.own!.handle}`) : r.error);
                }}
                title={server.own.published ? 'Click to unpublish' : 'Make your stage public'}
              >
                {server.own.published ? '● Live' : 'Publish'}
              </button>
              <a className="ed-icon ed-avatar" href={link('account')} title={server.me?.user?.email ?? 'Account'} aria-label="Account">
                {(server.me?.user?.name || server.me?.user?.email || '?').slice(0, 1).toUpperCase()}
              </a>
            </>
          )}
          {!server.hosted && <button type="button" className="ed-btn" onClick={download} title="⌘S">Export .yaml</button>}
          {server.hosted && <button type="button" className="ed-btn ghost hide-sm" onClick={download} title="⌘S">.yaml</button>}
        </div>
      </header>

      <nav className="ed-nav" aria-label="Sections">
        <div className="ed-ready">
          <button type="button" className="ed-ready-btn" onClick={() => setMenu(menu === 'ready' ? null : 'ready')} aria-expanded={menu === 'ready'}>
            <span className="ed-ring" style={{ ['--v' as string]: ready.score }}><b>{ready.score}</b></span>
            <span><span className="mono">Stage ready</span><span className="ed-hint">{ready.todo.length ? `${ready.todo.length} to go` : 'Showtime!'}</span></span>
          </button>
          {menu === 'ready' && ready.todo.length > 0 && (
            <ul className="ed-menu ed-todo" onMouseLeave={() => setMenu(null)}>
              {ready.todo.map(([, msg, id]) => (
                <li key={msg}><button type="button" onClick={() => { pick(id); setMenu(null); }}>○ {msg}</button></li>
              ))}
            </ul>
          )}
        </div>
        <ol>
          {SECTIONS.map((s) => {
            const n = sectionIssues(s);
            return (
              <li key={s.id}>
                <button type="button" className={active === s.id ? 'on' : ''} onClick={() => pick(s.id)} aria-current={active === s.id}>
                  <span className="mono ed-act">{s.act}</span>
                  <span className="ed-long">{s.label}</span>
                  <span className="mono ed-short">{s.short}</span>
                  {n > 0 && <span className="ed-badge" title={`${n} issue${n > 1 ? 's' : ''}`}>{n}</span>}
                </button>
              </li>
            );
          })}
        </ol>
        <div className="ed-nav-foot mono">
          {issueCount ? <span className="ed-warn">{issueCount} field{issueCount > 1 ? 's' : ''} need attention</span> : <span className="accent">✓ All valid</span>}
          <a href={link(p.handle)} target="_blank" rel="noreferrer" className="muted">Live page ↗</a>
        </div>
      </nav>

      <main className="ed-form" ref={formScroll}>
        <div className="ed-form-head">
          <p className="mono accent">Act {section.act}</p>
          <h2 className="display">{section.label}</h2>
        </div>
        {notes.length > 0 && active === 'profile' && (
          <aside className="ed-notes">
            <div className="ed-notes-head">
              <p className="mono accent">Imported from GitHub — finish the story</p>
              <button type="button" aria-label="Dismiss" onClick={() => setNotes([])}>✕</button>
            </div>
            <ul>
              {notes.map((n) => <li key={n}>{n}</li>)}
              <li>GitHub can’t see your client work — add <button type="button" className="ed-link" onClick={() => pick('clients')}>clients</button>, <button type="button" className="ed-link" onClick={() => pick('experience')}>timeline</button> and <button type="button" className="ed-link" onClick={() => pick('projects')}>NDA projects</button>.</li>
            </ul>
          </aside>
        )}
        <Section p={p} up={up} issues={issues} notify={notify} />
        <div className="ed-form-next">
          {SECTIONS.findIndex((s) => s.id === active) < SECTIONS.length - 1 && (
            <button type="button" className="ed-btn ghost" onClick={() => pick(SECTIONS[SECTIONS.findIndex((s) => s.id === active) + 1].id)}>
              Next: {SECTIONS[SECTIONS.findIndex((s) => s.id === active) + 1].label} →
            </button>
          )}
        </div>
      </main>

      <section className={`ed-preview dev-${device}`} ref={pane} aria-label="Live preview">
        <div className="ed-frame" style={{ width: frameW, zoom }} ref={frame}>
          {device === 'phone' && <div className="ed-notch" aria-hidden="true" />}
          <ProfileStory p={p} preview onSection={pick} />
        </div>
        <p className="ed-preview-cap mono muted">{frameW}px{zoom < 1 ? ` · ${Math.round(zoom * 100)}%` : ''} · click any section to edit it</p>
      </section>

      {gh.open && <GithubDialog current={p} initialUser={gh.user} initialError={gh.error} onDone={imported} onClose={() => setGh({ open: false })} />}
      {gh.busy && <div className="ed-busy display" role="status">Reading GitHub<span className="accent">…</span></div>}
      {importOpen && (
        <div className="ed-modal" role="dialog" aria-modal="true" aria-label="Import YAML" onClick={(e) => e.target === e.currentTarget && setImportOpen(false)}>
          <form className="ed-modal-box" onSubmit={(e) => { e.preventDefault(); load(new FormData(e.currentTarget).get('yaml') as string, 'Imported'); }}>
            <h3 className="display">Import profile</h3>
            <p className="muted">Paste YAML or JSON, choose a file, or drop a file anywhere on the editor.</p>
            <textarea name="yaml" className="ed-input ed-code" rows={14} placeholder={'handle: you\nprofile:\n  name: …'} autoFocus />
            <div className="ed-modal-actions">
              <button type="button" className="ed-btn ghost" onClick={() => fileInput.current?.click()}>Choose file…</button>
              <span style={{ flex: 1 }} />
              <button type="button" className="ed-btn ghost" onClick={() => setImportOpen(false)}>Cancel</button>
              <button type="submit" className="ed-btn">Import</button>
            </div>
          </form>
        </div>
      )}
      <input ref={fileInput} type="file" accept=".yaml,.yml,.json" hidden onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} />

      {dropping && <div className="ed-drop display">Drop your YAML</div>}

      {toast && (
        <div className="ed-toast mono" role="status" key={toast.id}>
          {toast.msg}
          {toast.undo && canUndo && <button type="button" onClick={() => { undo(); setToast(null); }}>Undo</button>}
        </div>
      )}
    </div>
  );
}
