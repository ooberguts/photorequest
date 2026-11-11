import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getBuildInfo } from './build-info.mjs';

const args = process.argv.slice(2),
  info = getBuildInfo();
if (args[0] === 'build' || args[0] === 'dev') {
  args.push(
    '--config',
    JSON.stringify({
      version: info.version,
      bundle: { createUpdaterArtifacts: !!process.env.TAURI_SIGNING_PRIVATE_KEY },
    }),
  );
  console.log(
    `PhotoRequest commit ${info.shortCommit}, build ${info.buildNumber}${info.dirty ? ' (local changes)' : ''}`,
  );
}
const child = spawnSync(
  process.execPath,
  [fileURLToPath(new URL('../node_modules/@tauri-apps/cli/tauri.js', import.meta.url)), ...args],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      PHOTOREQUEST_GIT_SHA: info.commit,
      PHOTOREQUEST_BUILD_NUMBER: String(info.buildNumber),
      VITE_APP_VERSION: info.version,
      VITE_GIT_SHA: info.commit,
      VITE_BUILD_NUMBER: String(info.buildNumber),
      VITE_BUILD_DIRTY: String(info.dirty),
    },
  },
);
process.exit(child.status ?? 1);
