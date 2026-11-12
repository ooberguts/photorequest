import { Component, type ErrorInfo, type ReactNode } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';

export function missingRuntimeFeatures() {
  const missing: string[] = [];
  if (
    typeof HTMLDialogElement === 'undefined' ||
    typeof HTMLDialogElement.prototype.showModal !== 'function'
  )
    missing.push('Dialog windows');
  if (typeof structuredClone !== 'function') missing.push('Image and paper data handling');
  if (!globalThis.crypto?.randomUUID || !globalThis.crypto?.subtle)
    missing.push('Secure order and image verification');
  if (!globalThis.indexedDB) missing.push('Local draft storage');
  return missing;
}
export async function openInstallationHelp() {
  if (isTauri()) {
    try {
      await invoke('open_install_help');
      return;
    } catch {
      /* Local text is also served by the app. */
    }
  }
  window.location.assign('/INSTALLATION.txt');
}
export function StartupHelp({ missing = [], error = '' }: { missing?: string[]; error?: string }) {
  return (
    <main className="startup-support" role="alert">
      <h1>
        {missing.length
          ? 'A system component needs attention'
          : 'PhotoRequest could not finish opening'}
      </h1>
      <p>
        Your saved order has not been cleared. Follow the steps below, then reopen PhotoRequest.
      </p>
      <ol>
        <li>
          <strong>Windows:</strong> run the latest PhotoRequest setup again. It includes Microsoft
          Edge WebView2. If Windows asks for permission, allow the installer; on a managed computer,
          ask your administrator.
        </li>
        <li>
          <strong>Mac:</strong> install macOS 12.3 or newer using Software Update, then copy
          PhotoRequest into Applications.
        </li>
        <li>
          If storage is disabled or the computer is out of space, allow local storage and free some
          space before trying again.
        </li>
      </ol>
      {missing.length > 0 && <p>Needs attention: {missing.join('; ')}.</p>}
      <div>
        <button className="button primary" onClick={() => window.location.reload()}>
          Try opening again
        </button>
        <button className="button secondary" onClick={() => void openInstallationHelp()}>
          Open installation help
        </button>
      </div>
      {error && (
        <details>
          <summary>Technical details for support</summary>
          <pre>{error}</pre>
        </details>
      )}
    </main>
  );
}
export class StartupBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: unknown) {
    return {
      error:
        error instanceof Error
          ? error.message || 'Unexpected interface error'
          : String(error) || 'Unexpected interface error',
    };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('PhotoRequest interface failed to open', error, info.componentStack);
  }
  render() {
    return this.state.error ? <StartupHelp error={this.state.error} /> : this.props.children;
  }
}
