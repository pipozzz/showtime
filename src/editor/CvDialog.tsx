import { useRef, useState } from 'react';
import type { Profile } from '../lib/model';
import { mergeCv } from '../lib/importers/cv';

/** Send a CV (file or pasted text) to the instance, which reads it with AI. */
export async function readCvRemote(input: { file: File } | { text: string }): Promise<{ profile: Profile; notes: string[] }> {
  let init: RequestInit;
  if ('file' in input) {
    const form = new FormData();
    form.append('file', input.file);
    init = { method: 'POST', body: form };
  } else {
    init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: input.text }) };
  }
  const res = await fetch('/api/import/cv', { ...init, credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Import failed (${res.status})`);
  return data;
}

export const PROVIDER_LABEL: Record<string, string> = { anthropic: 'Claude (Anthropic)', openai: 'OpenAI' };

interface Props {
  current: Profile;
  provider: string;
  signedIn: boolean;
  onDone: (p: Profile, notes: string[], label: string) => void;
  onClose: () => void;
}

export default function CvDialog({ current, provider, signedIn, onDone, onClose }: Props) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'fresh' | 'merge'>('merge');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const picker = useRef<HTMLInputElement>(null);

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const { profile, notes } = await readCvRemote(file ? { file } : { text });
      onDone(mergeCv(current, profile, mode), notes, file ? `Imported ${file.name}` : 'Imported your CV');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ed-modal" role="dialog" aria-modal="true" aria-labelledby="cv-title" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="ed-modal-box" onSubmit={(e) => { e.preventDefault(); if (file || text.trim()) run(); }}>
        <p className="mono accent">Fastest start</p>
        <h3 className="display" id="cv-title">From your CV</h3>
        <p className="muted">
          Upload your CV or paste any text about your career — a résumé, your LinkedIn “About” and experience, a bio. AI turns it into a draft: roles, clients, projects, school, skills, certifications.
        </p>
        {!signedIn ? (
          <p className="ed-error">Sign in first — CV import runs on this instance.</p>
        ) : (
          <>
            <div className="ed-cv-drop">
              <input ref={picker} type="file" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(''); }} />
              <button type="button" className="ed-btn ghost" onClick={() => picker.current?.click()} disabled={busy}>{file ? 'Choose another file' : 'Choose a PDF or Word file'}</button>
              {file ? <span className="mono">{file.name} <button type="button" className="ed-link" onClick={() => setFile(null)}>remove</button></span> : <span className="muted">or paste below</span>}
            </div>
            {!file && (
              <label className="ed-field">
                <span className="ed-label">Paste text</span>
                <textarea className="ed-input ed-area" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder="Senior Platform Engineer, 12 years… Warner Bros. (via Agency X), 2019–2022: built…" />
              </label>
            )}
            <div className="ed-seg" role="radiogroup" aria-label="Import mode">
              <label className={mode === 'merge' ? 'on' : ''}><input type="radio" name="cv-mode" checked={mode === 'merge'} onChange={() => setMode('merge')} />Add to my draft</label>
              <label className={mode === 'fresh' ? 'on' : ''}><input type="radio" name="cv-mode" checked={mode === 'fresh'} onChange={() => setMode('fresh')} />Start fresh</label>
            </div>
            <p className="ed-hint">
              Read by {PROVIDER_LABEL[provider] ?? 'AI'} and sent only for this — nothing is stored. It uses only what the document says; you review everything before it's public, and Undo works.
            </p>
          </>
        )}
        {error && <p className="ed-error" role="alert">{error}</p>}
        <div className="ed-modal-actions">
          <span style={{ flex: 1 }} />
          <button type="button" className="ed-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          {signedIn && <button type="submit" className="ed-btn" disabled={busy || (!file && text.trim().length < 40)}>{busy ? 'Reading your CV… (~30 s)' : 'Build my draft'}</button>}
        </div>
      </form>
    </div>
  );
}
