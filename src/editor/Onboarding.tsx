// First-run flow in server mode: bring your work in → pick a handle → claim it.
import { useEffect, useRef, useState } from 'react';
import { HANDLE, RESERVED, type Profile } from '../lib/model';
import { importGithub } from '../lib/importers/github';
import { mergeCv } from '../lib/importers/cv';
import { PROVIDER_LABEL, readCvRemote } from './CvDialog';

interface Props {
  p: Profile;
  githubLinked: boolean;
  /** 'anthropic' | 'openai' when the instance reads CVs with AI */
  cvProvider?: string | null;
  /** apply an imported draft (merges are done by the caller-provided base) */
  onImported: (p: Profile, notes: string[], label: string) => void;
  /** YAML / JSON Resume / scan / LinkedIn ZIP or CSVs */
  onFiles: (files: FileList) => Promise<void>;
  onClaim: (handle: string) => Promise<{ ok: boolean; error?: string }>;
  onSkip: () => void;
  host: string;
}

const LINKEDIN_EXPORT = 'https://www.linkedin.com/mypreferences/d/download-my-data';

const slug = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 39);

export default function Onboarding({ p, githubLinked, cvProvider, onImported, onFiles, onClaim, onSkip, host }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [done, setDone] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [ghUser, setGhUser] = useState('');
  const files = useRef<HTMLInputElement>(null);
  const linkedin = useRef<HTMLInputElement>(null);
  const cv = useRef<HTMLInputElement>(null);
  const [cvText, setCvText] = useState('');

  const mark = (what: string) => setDone((d) => [...new Set([...d, what])]);
  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    setError('');
    try {
      await fn();
      mark(what);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const importLinkedGithub = () =>
    run('GitHub', async () => {
      const res = await fetch('/api/import/github', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base: p }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onImported(data.profile, data.notes, 'Imported your GitHub');
    });
  const importGithubUser = () =>
    run('GitHub', async () => {
      const { profile, notes } = await importGithub(ghUser, { base: p });
      onImported(profile, notes, `Imported @${profile.handle} from GitHub`);
    });
  const importCv = (input: { file: File } | { text: string }) =>
    run('CV', async () => {
      const { profile, notes } = await readCvRemote(input);
      onImported(mergeCv(p, profile, 'merge'), notes, 'file' in input ? `Imported ${input.file.name}` : 'Imported your CV');
    });
  const pick = (what: string, input: HTMLInputElement | null) => {
    if (!input) return;
    input.onchange = () => input.files?.length && run(what, () => onFiles(input.files!));
    input.click();
  };

  // ---------- step 2: handle ----------
  const suggested = p.handle && p.handle !== 'your-handle' ? p.handle : slug(p.profile.name || '');
  const [handle, setHandle] = useState(suggested);
  const [check, setCheck] = useState<{ ok: boolean; reason?: string } | null>(null);
  useEffect(() => {
    if (step !== 2) return;
    const h = handle.trim();
    if (!HANDLE.test(h)) return setCheck({ ok: false, reason: 'Use 2–39 lowercase letters, digits or dashes' });
    if (RESERVED.includes(h)) return setCheck({ ok: false, reason: 'This handle is reserved' });
    setCheck(null);
    const t = setTimeout(async () => {
      const r = await fetch(`/api/handle?h=${encodeURIComponent(h)}`, { credentials: 'same-origin' }).then((x) => x.json()).catch(() => null);
      setCheck(r ?? { ok: false, reason: 'Could not check — try again' });
    }, 350);
    return () => clearTimeout(t);
  }, [handle, step]);

  const claim = () =>
    run('claim', async () => {
      const r = await onClaim(handle.trim());
      if (!r.ok) throw new Error(r.error ?? 'Could not claim that handle');
    });

  return (
    <div className="ed-modal ed-onboard" role="dialog" aria-modal="true" aria-label="Set up your stage">
      <div className="ed-modal-box">
        <p className="mono accent">Step {step} of 2</p>
        {step === 1 ? (
          <>
            <h3 className="display">Bring your work in</h3>
            <p className="muted">Start from what already exists — you can combine sources. {cvProvider ? 'Your CV is read by AI on this instance; everything else is converted in your browser.' : 'Everything is converted in your browser.'} You review it all before anything is public.</p>
            <ul className="ed-sources">
              {cvProvider && (
                <li className={done.includes('CV') ? 'done' : ''}>
                  <b>Your CV <span className="tag solid">fastest</span></b>
                  <span className="muted">Upload a PDF or Word file, or paste any text about your career. {PROVIDER_LABEL[cvProvider] ?? 'AI'} reads it into roles, clients, projects, school and skills — nothing is stored.</span>
                  <div className="ed-inline ed-cv-upload">
                    <input ref={cv} type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importCv({ file: f }); e.target.value = ''; }} />
                    <button type="button" className="ed-btn" disabled={!!busy} onClick={() => cv.current?.click()}>{busy === 'CV' ? 'Reading… (~30 s)' : 'Upload CV'}</button>
                  </div>
                  <form className="ed-inline ed-cv-paste" onSubmit={(e) => { e.preventDefault(); if (cvText.trim().length >= 40) importCv({ text: cvText }); }}>
                    <textarea className="ed-input" rows={2} placeholder="…or paste your CV / LinkedIn text" value={cvText} onChange={(e) => setCvText(e.target.value)} aria-label="Paste your CV or LinkedIn text" />
                    <button type="submit" className="ed-btn ghost" disabled={!!busy || cvText.trim().length < 40}>Read</button>
                  </form>
                </li>
              )}
              <li className={done.includes('GitHub') ? 'done' : ''}>
                <b>GitHub</b>
                <span className="muted">Repos, languages, links{githubLinked ? ', exact contributions incl. private counts' : ''}.</span>
                {githubLinked ? (
                  <button type="button" className="ed-btn" disabled={!!busy} onClick={importLinkedGithub}>{busy === 'GitHub' ? 'Importing…' : 'Import my GitHub'}</button>
                ) : (
                  <form className="ed-inline" onSubmit={(e) => { e.preventDefault(); if (ghUser.trim()) importGithubUser(); }}>
                    <input className="ed-input" placeholder="github username" value={ghUser} onChange={(e) => setGhUser(e.target.value)} />
                    <button type="submit" className="ed-btn" disabled={!!busy || !ghUser.trim()}>{busy === 'GitHub' ? '…' : 'Import'}</button>
                  </form>
                )}
              </li>
              <li className={done.includes('LinkedIn') ? 'done' : ''}>
                <b>LinkedIn</b>
                <span className="muted">
                  Roles, years, school, skills. <a href={LINKEDIN_EXPORT} target="_blank" rel="noreferrer">Request your export ↗</a> (Profile, Positions, Education, Skills — ~10 min), then add the ZIP. Messages and connections are never opened.
                </span>
                <button type="button" className="ed-btn ghost" disabled={!!busy} onClick={() => pick('LinkedIn', linkedin.current)}>{busy === 'LinkedIn' ? 'Reading…' : 'Add LinkedIn ZIP'}</button>
              </li>
              <li className={done.includes('File') ? 'done' : ''}>
                <b>Something else</b>
                <span className="muted">A Starring YAML, a JSON Resume, or <code>npx starring-cli scan</code> output for your private commits.</span>
                <button type="button" className="ed-btn ghost" disabled={!!busy} onClick={() => pick('File', files.current)}>Add file</button>
              </li>
            </ul>
            {error && <p className="ed-error" role="alert">{error}</p>}
            <div className="ed-modal-actions">
              <button type="button" className="ed-link" onClick={onSkip}>Skip — I’ll start blank</button>
              <span style={{ flex: 1 }} />
              <button type="button" className="ed-btn" onClick={() => { setHandle(p.handle && p.handle !== 'your-handle' ? p.handle : slug(p.profile.name || '')); setStep(2); }}>
                {done.length ? 'Next: pick your handle →' : 'Next →'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="display">Claim your stage</h3>
            <p className="muted">Your public address. You can change it later; nothing is public until you press Publish.</p>
            <label className="ed-field">
              <span className="ed-label">Handle</span>
              <div className="ed-gh-input">
                <span className="mono muted">{host}/</span>
                <input className="ed-input" value={handle} autoFocus autoComplete="off" spellCheck={false} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} />
              </div>
              <span className={check?.ok ? 'ed-hint accent' : 'ed-error'} aria-live="polite">
                {check === null ? 'Checking…' : check.ok ? '✓ Available' : check.reason}
              </span>
            </label>
            {error && <p className="ed-error" role="alert">{error}</p>}
            <div className="ed-modal-actions">
              <button type="button" className="ed-btn ghost" onClick={() => setStep(1)}>← Back</button>
              <span style={{ flex: 1 }} />
              <button type="button" className="ed-btn" disabled={!check?.ok || !!busy} onClick={claim}>{busy === 'claim' ? 'Claiming…' : `Claim ${host}/${handle}`}</button>
            </div>
          </>
        )}
        <input ref={linkedin} type="file" accept=".zip,.csv" multiple hidden />
        <input ref={files} type="file" accept=".yaml,.yml,.json" hidden />
      </div>
    </div>
  );
}
