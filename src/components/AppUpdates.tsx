import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauri, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Check, Download, GitCommitHorizontal, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { BUILD, type BuildInfo } from '../lib/build';

type UpdateResult = {
  status: 'current' | 'available' | 'auth_required' | 'no_release';
  credentialSource: 'public' | 'saved_token' | 'github_cli' | 'none';
  message: string;
  version?: string;
  commit?: string;
  buildNumber?: number;
  notes?: string;
};
type Progress = { stage: 'downloading' | 'installing'; downloaded: number; total: number | null };
type Props = {
  ready: boolean;
  disabled: boolean;
  beforeInstall: () => Promise<void>;
  afterInstallError: () => void;
};

function UpdateDialog({
  build,
  result,
  checking,
  error,
  onClose,
  onCheck,
  beforeInstall,
  afterInstallError,
}: {
  build: BuildInfo;
  result: UpdateResult | null;
  checking: boolean;
  error: string;
  onClose: () => void;
  onCheck: () => Promise<void>;
  beforeInstall: () => Promise<void>;
  afterInstallError: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [localError, setLocalError] = useState('');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [automatic, setAutomatic] = useState(
    () => localStorage.getItem('photorequest-auto-updates') !== 'false',
  );
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const unlisten = listen<Progress>('updater-progress', (e) => setProgress(e.payload)).then(
      (stop) => {
        if (disposed) stop();
        return stop;
      },
    );
    return () => {
      disposed = true;
      void unlisten.then((stop) => stop());
    };
  }, []);
  async function saveToken() {
    setSaving(true);
    setLocalError('');
    try {
      await invoke('save_update_token', { token });
      setToken('');
      await onCheck();
    } catch (err) {
      setLocalError(String(err));
    } finally {
      setSaving(false);
    }
  }
  async function install() {
    if (!result?.commit) return;
    setInstalling(true);
    setLocalError('');
    try {
      await beforeInstall();
      await invoke('install_app_update', { expectedCommit: result.commit });
    } catch (err) {
      setLocalError(String(err));
      setInstalling(false);
      afterInstallError();
    }
  }
  const blocked = saving || installing;
  const percent = progress?.total
    ? Math.min(100, Math.floor((progress.downloaded / progress.total) * 100))
    : null;
  return (
    <dialog
      ref={dialog}
      className="updates-dialog"
      aria-labelledby="updates-title"
      onCancel={(e) => {
        if (blocked) e.preventDefault();
        else onClose();
      }}
    >
      <header className="dialog-header">
        <div>
          <span className="eyebrow">APPLICATION</span>
          <h2 id="updates-title">Updates</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close updates"
          disabled={blocked}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <div className="updates-body">
        <div className="installed-build">
          <GitCommitHorizontal size={23} />
          <div>
            <strong>Commit {build.shortCommit}</strong>
            <span>
              Build {build.buildNumber} · {build.version}
              {BUILD.dirty ? ' · local development changes' : ''}
            </span>
          </div>
        </div>
        <p className="update-source">
          Update source: <strong>ooberguts/photorequest</strong> on GitHub
        </p>
        {result && (
          <div className={`update-result ${result.status}`}>
            <strong>
              {result.status === 'available'
                ? `Update available: commit ${result.commit?.slice(0, 7)}`
                : result.status === 'current'
                  ? 'Up to date'
                  : result.status === 'auth_required'
                    ? 'GitHub sign-in required'
                    : 'No update published'}
            </strong>
            <p>{result.message}</p>
            {result.status === 'available' && (
              <span>
                Build {result.buildNumber} · {result.version}
              </span>
            )}
          </div>
        )}
        {result?.notes && <pre className="update-release-notes">{result.notes}</pre>}
        <label className="checkbox-label auto-update-toggle">
          <input
            type="checkbox"
            checked={automatic}
            disabled={blocked}
            onChange={(e) => {
              setAutomatic(e.target.checked);
              localStorage.setItem('photorequest-auto-updates', String(e.target.checked));
              window.dispatchEvent(new Event('photorequest-update-preference'));
            }}
          />
          Automatically check on startup and every 12 hours
        </label>
        <p className="micro-note">
          Signed updates are downloaded from GitHub. Install and restart saves your active order
          first. Your images and orders are not uploaded.
        </p>
        <p className="micro-note">
          Public updates work without a GitHub account or additional software.
        </p>
        <details
          className="update-auth"
          open={result?.status === 'auth_required' || result?.credentialSource === 'saved_token'}
        >
          <summary>Optional GitHub access settings</summary>
          <p>
            {result?.credentialSource === 'github_cli'
              ? 'Using your existing GitHub CLI sign-in.'
              : result?.credentialSource === 'saved_token'
                ? 'Using a token saved in your system credential store.'
                : 'No sign-in is needed for public updates. A saved token or an existing GitHub CLI sign-in can be used if access is restricted.'}
          </p>
          <label>
            GitHub access token
            <input
              type="password"
              aria-label="GitHub update token"
              autoComplete="off"
              spellCheck={false}
              value={token}
              disabled={blocked}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Fine-grained token · Contents: read"
            />
          </label>
          <div className="update-auth-buttons">
            <button
              className="button secondary"
              disabled={!token.trim() || blocked || !isTauri()}
              onClick={() => void saveToken()}
            >
              {saving ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />} Save
              token securely
            </button>
            <button
              className="text-button"
              disabled={blocked || !isTauri()}
              onClick={() => {
                void invoke('forget_update_token')
                  .then(onCheck)
                  .catch((err) => setLocalError(String(err)));
              }}
            >
              Remove saved token
            </button>
          </div>
          <p className="micro-note">
            Tokens stay in macOS Keychain or Windows Credential Manager. They are never stored in
            orders, ZIPs, or the app bundle.
          </p>
        </details>
        {(error || localError) && (
          <p role="alert" className="inline-error">
            {localError || error}
          </p>
        )}
        {installing && (
          <div role="status" className="update-install-progress">
            <LoaderCircle size={18} className="spin" />
            <span>
              {progress?.stage === 'installing'
                ? 'Installing and restarting…'
                : progress
                  ? `Downloading update${percent !== null ? ` · ${percent}%` : '…'}`
                  : 'Saving your order…'}
            </span>
          </div>
        )}
      </div>
      <footer className="dialog-footer">
        <button
          className="button secondary"
          disabled={checking || blocked || !isTauri()}
          onClick={() => void onCheck()}
        >
          <RefreshCw size={15} className={checking ? 'spin' : ''} />
          {checking ? 'Checking…' : 'Check for updates'}
        </button>
        {result?.status === 'available' && (
          <button
            className="button primary"
            disabled={blocked || checking}
            onClick={() => void install()}
          >
            <Download size={15} /> Install and restart
          </button>
        )}
      </footer>
    </dialog>
  );
}

export default function AppUpdates({ ready, disabled, beforeInstall, afterInstallError }: Props) {
  const [open, setOpen] = useState(false);
  const [build, setBuild] = useState<BuildInfo>(BUILD);
  const [result, setResult] = useState<UpdateResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const check = useCallback(async () => {
    if (!isTauri() || inFlight.current) return;
    inFlight.current = true;
    setChecking(true);
    setError('');
    try {
      setResult(await invoke<UpdateResult>('check_app_update'));
    } catch (err) {
      setResult(null);
      setError(String(err));
    } finally {
      setChecking(false);
      inFlight.current = false;
    }
  }, []);
  useEffect(() => {
    if (isTauri())
      void invoke<BuildInfo>('get_build_info')
        .then((info) => setBuild({ ...BUILD, ...info }))
        .catch(() => {});
  }, []);
  useEffect(() => {
    if (!ready || !isTauri()) return;
    let initial: ReturnType<typeof setTimeout> | undefined,
      interval: ReturnType<typeof setInterval> | undefined;
    const schedule = () => {
      clearTimeout(initial);
      clearInterval(interval);
      if (localStorage.getItem('photorequest-auto-updates') === 'false') return;
      initial = setTimeout(() => void check(), 3000);
      interval = setInterval(() => void check(), 12 * 60 * 60 * 1000);
    };
    schedule();
    window.addEventListener('photorequest-update-preference', schedule);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
      window.removeEventListener('photorequest-update-preference', schedule);
    };
  }, [ready, check]);
  return (
    <>
      <button
        className={`updates-sidebar-button ${result?.status === 'available' ? 'available' : ''}`}
        disabled={!ready || disabled}
        onClick={() => {
          setOpen(true);
          if (!result && !error) void check();
        }}
      >
        <RefreshCw size={14} className={checking ? 'spin' : ''} />
        <span>{result?.status === 'available' ? 'Update available' : 'Updates'}</span>
        <span className="update-commit">{build.shortCommit}</span>
      </button>
      {open && (
        <UpdateDialog
          build={build}
          result={result}
          checking={checking}
          error={error || (!isTauri() ? 'Install the desktop app to use automatic updates.' : '')}
          onClose={() => setOpen(false)}
          onCheck={check}
          beforeInstall={beforeInstall}
          afterInstallError={afterInstallError}
        />
      )}
    </>
  );
}
