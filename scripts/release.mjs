import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getBuildInfo } from './build-info.mjs';

const REPO = 'ooberguts/photorequest';
export const REQUIRED_PLATFORMS = [
  'darwin-aarch64',
  'darwin-x86_64',
  'windows-x86_64-nsis',
  'windows-x86_64-msi',
];

export function platformForArtifact(path) {
  const normalized = path.replaceAll('\\', '/');
  if (normalized.includes('aarch64-apple-darwin') && path.endsWith('.app.tar.gz'))
    return 'darwin-aarch64';
  if (normalized.includes('x86_64-apple-darwin') && path.endsWith('.app.tar.gz'))
    return 'darwin-x86_64';
  if (normalized.includes('x86_64-pc-windows-msvc') && path.endsWith('.exe'))
    return 'windows-x86_64-nsis';
  if (normalized.includes('x86_64-pc-windows-msvc') && path.endsWith('.msi'))
    return 'windows-x86_64-msi';
  return null;
}

export function makeManifest(info, artifacts, publishedAt) {
  if (
    !/^[a-f0-9]{40}$/.test(info.commit) ||
    !Number.isSafeInteger(info.buildNumber) ||
    info.buildNumber < 1
  )
    throw new Error('A real commit and positive build number are required.');
  const platforms = {};
  for (const platform of REQUIRED_PLATFORMS) {
    const artifact = artifacts[platform];
    if (
      !artifact?.signature ||
      !new RegExp(`^https://api\\.github\\.com/repos/${REPO}/releases/assets/\\d+$`).test(
        artifact.url,
      )
    )
      throw new Error(`Missing or invalid signed update for ${platform}.`);
    platforms[platform] = artifact;
  }
  platforms['windows-x86_64'] = platforms['windows-x86_64-nsis'];
  return {
    version: info.version,
    commit: info.commit,
    buildNumber: info.buildNumber,
    pub_date: publishedAt,
    notes: `Commit ${info.shortCommit} · build ${info.buildNumber}\nhttps://github.com/${REPO}/commit/${info.commit}`,
    platforms,
  };
}

async function filesUnder(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? filesUnder(join(folder, entry.name)) : [join(folder, entry.name)],
    ),
  );
  return nested.flat();
}

async function publish() {
  if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY !== REPO)
    throw new Error('Release publishing is restricted to the configured repository.');
  const info = getBuildInfo();
  if (info.dirty) throw new Error('Only a clean committed checkout may be released.');
  const gh = (...args) =>
    execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const head = gh('api', `repos/${REPO}/commits/main`, '--jq', '.sha');
  if (head !== info.commit) {
    console.log('A newer main commit exists; this release is superseded.');
    return;
  }
  const root = resolve(process.argv[2] || '.release/downloads');
  const output = resolve('.release/publish');
  await mkdir(output, { recursive: true });
  const input = await filesUnder(root),
    payloads = {},
    upload = [];
  for (const file of input) {
    const platform = platformForArtifact(file);
    if (platform) {
      if (payloads[platform]) throw new Error(`Duplicate update artifact for ${platform}.`);
      const signature = (await readFile(`${file}.sig`, 'utf8')).trim();
      if (!signature || signature.length < 64)
        throw new Error(`Missing signature for ${platform}.`);
      const extension = file.endsWith('.app.tar.gz')
        ? '.app.tar.gz'
        : file.endsWith('.msi')
          ? '.msi'
          : '.exe';
      const name = `PhotoRequest-${info.shortCommit}-${platform}${extension}`,
        destination = join(output, name);
      await copyFile(file, destination);
      await writeFile(`${destination}.sig`, `${signature}\n`);
      payloads[platform] = { name, signature };
      upload.push(destination, `${destination}.sig`);
    } else if (file.endsWith('.dmg')) {
      const destination = join(output, basename(file));
      await copyFile(file, destination);
      upload.push(destination);
    }
  }
  for (const platform of REQUIRED_PLATFORMS)
    if (!payloads[platform]) throw new Error(`No signed payload found for ${platform}.`);
  const tag = `commit-${info.buildNumber}-${info.shortCommit}`;
  const notes = join(output, 'release-notes.txt');
  await writeFile(
    notes,
    `PhotoRequest commit ${info.shortCommit}, build ${info.buildNumber}.\n\nSource: https://github.com/${REPO}/commit/${info.commit}\n\nInstallers and update packages are generated from this commit. The in-app updater verifies the package signature before installation.\n`,
  );
  let release;
  try {
    release = JSON.parse(gh('api', `repos/${REPO}/releases/tags/${tag}`));
  } catch {
    /* New release. */
  }
  if (release && !release.draft) {
    console.log(`Release ${tag} is already published.`);
    return;
  }
  if (!release)
    gh(
      'release',
      'create',
      tag,
      '--repo',
      REPO,
      '--target',
      info.commit,
      '--title',
      `Commit ${info.shortCommit} · build ${info.buildNumber}`,
      '--notes-file',
      notes,
      '--draft',
    );
  gh('release', 'upload', tag, ...upload, '--repo', REPO, '--clobber');
  release = JSON.parse(gh('api', `repos/${REPO}/releases/tags/${tag}`));
  const artifacts = {};
  for (const platform of REQUIRED_PLATFORMS) {
    const payload = payloads[platform],
      asset = release.assets.find((a) => a.name === payload.name);
    if (!asset) throw new Error(`GitHub did not return the uploaded asset for ${platform}.`);
    artifacts[platform] = {
      signature: payload.signature,
      url: `https://api.github.com/repos/${REPO}/releases/assets/${asset.id}`,
    };
  }
  const manifest = join(output, 'latest.json');
  await writeFile(
    manifest,
    `${JSON.stringify(makeManifest(info, artifacts, new Date().toISOString()), null, 2)}\n`,
  );
  gh('release', 'upload', tag, manifest, '--repo', REPO, '--clobber');
  if (gh('api', `repos/${REPO}/commits/main`, '--jq', '.sha') !== info.commit) {
    console.log('A newer commit superseded this draft; leaving it unpublished.');
    return;
  }
  gh('release', 'edit', tag, '--repo', REPO, '--draft=false', '--latest');
  console.log(`Published signed update https://github.com/${REPO}/releases/tag/${tag}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await publish();
