import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function versionForCommit(baseVersion, buildNumber) {
  const match = /^(\d+)\.(\d+)\.\d+$/.exec(baseVersion);
  if (!match || !Number.isSafeInteger(buildNumber) || buildNumber < 0 || buildNumber > 65535)
    throw new Error('A numeric version and a commit count between 0 and 65535 are required.');
  return `${match[1]}.${match[2]}.${buildNumber}`;
}

export function getBuildInfo(cwd = fileURLToPath(new URL('..', import.meta.url))) {
  const base = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ).version;
  const git = (...args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  try {
    const commit = git('rev-parse', 'HEAD');
    const buildNumber = Number(git('rev-list', '--count', 'HEAD'));
    return {
      version: versionForCommit(base, buildNumber),
      commit,
      shortCommit: commit.slice(0, 7),
      buildNumber,
      dirty: !!git('status', '--porcelain'),
    };
  } catch {
    return {
      version: base,
      commit: 'development',
      shortCommit: 'development',
      buildNumber: 0,
      dirty: true,
    };
  }
}
