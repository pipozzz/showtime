import { useState } from 'react';
import type { Profile } from '../lib/model';
import { importGithub } from '../lib/importers/github';

interface Props {
  current: Profile;
  initialUser?: string;
  initialError?: string;
  onDone: (p: Profile, notes: string[], label: string) => void;
  onClose: () => void;
}

const TOKEN_URL = 'https://github.com/settings/tokens/new?description=Starring%20import&scopes=read:user';

export default function GithubDialog({ current, initialUser = '', initialError = '', onDone, onClose }: Props) {
  const [user, setUser] = useState(initialUser);
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [mode, setMode] = useState<'fresh' | 'merge'>('fresh');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const { profile, notes } = await importGithub(user, { token, base: mode === 'merge' ? current : undefined });
      onDone(profile, notes, `Imported @${profile.handle} from GitHub`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ed-modal" role="dialog" aria-modal="true" aria-label="Import from GitHub" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="ed-modal-box" onSubmit={(e) => { e.preventDefault(); if (user.trim()) run(); }}>
        <p className="mono accent">Instant draft</p>
        <h3 className="display">Import from GitHub</h3>
        <p className="muted">We read your public profile and repos and build a first draft: featured projects, languages, links. Nothing is saved anywhere but this browser.</p>

        <label className="ed-field">
          <span className="ed-label">GitHub username or profile URL</span>
          <div className="ed-gh-input">
            <span className="mono muted">github.com/</span>
            <input className="ed-input" value={user} onChange={(e) => setUser(e.target.value)} placeholder="octocat" autoFocus autoComplete="off" spellCheck={false} />
          </div>
        </label>

        {showToken ? (
          <label className="ed-field">
            <span className="ed-label">Token (optional)</span>
            <input className="ed-input" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghp_…" autoComplete="off" />
            <span className="ed-hint">
              Adds exact contributions per year, including the private count. Needs only <code>read:user</code>.{' '}
              <a href={TOKEN_URL} target="_blank" rel="noreferrer">Create one ↗</a> · Sent only to api.github.com, never stored.
            </span>
          </label>
        ) : (
          <button type="button" className="ed-link" onClick={() => setShowToken(true)}>+ Add a token for exact public + private contribution counts</button>
        )}

        <div className="ed-seg" role="radiogroup" aria-label="Import mode">
          <label className={mode === 'fresh' ? 'on' : ''}>
            <input type="radio" name="gh-mode" checked={mode === 'fresh'} onChange={() => setMode('fresh')} />Start fresh
          </label>
          <label className={mode === 'merge' ? 'on' : ''}>
            <input type="radio" name="gh-mode" checked={mode === 'merge'} onChange={() => setMode('merge')} />Merge into current
          </label>
        </div>
        <p className="ed-hint">{mode === 'fresh' ? 'Replaces the current draft (you can undo).' : 'Keeps your clients, timeline, education and NDA work; refreshes GitHub data.'}</p>

        {error && <p className="ed-error" role="alert">{error}</p>}

        <div className="ed-modal-actions">
          <span style={{ flex: 1 }} />
          <button type="button" className="ed-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="ed-btn" disabled={busy || !user.trim()}>{busy ? 'Importing…' : 'Build my draft'}</button>
        </div>
      </form>
    </div>
  );
}
