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

export function installerNotes(info, tag, names) {
  const link = (name) =>
    `https://github.com/${REPO}/releases/download/${tag}/${encodeURIComponent(name)}`;
  const windows = names.find((n) => /windows-x86_64-nsis\.exe$/.test(n));
  const apple = names.find((n) => /_aarch64\.dmg$/.test(n));
  const intel = names.find((n) => /_x64\.dmg$/.test(n));
  if (!windows || !apple || !intel)
    throw new Error('The release must include a setup EXE and both Mac DMGs.');
  return `PhotoRequest commit ${info.shortCommit}, build ${info.buildNumber}.\n\n## Install PhotoRequest\n\n| Your computer | Installer |\n| --- | --- |\n| Windows 10 or 11, 64-bit | [Windows setup](${link(windows)}) |\n| Mac with an Apple M-series chip, macOS 12.3+ | [Mac Apple Silicon installer](${link(apple)}) |\n| Mac with an Intel processor, macOS 12.3+ | [Mac Intel installer](${link(intel)}) |\n\nWindows setup includes Microsoft's offline WebView2 runtime and installs it if needed. The C++ runtime is built into the app. Mac uses the runtime supplied by macOS. No Node.js, Rust, GitHub account, or developer tools are required.\n\n[Installation steps and troubleshooting](${link('INSTALLATION.txt')}) are included as a downloadable text file and inside the app. Permission prompts, OS upgrades, and managed-computer restrictions may require your action; the guide explains those steps.\n\nAlready installed? Open **Updates** and choose **Install and restart**. Updates are verified with the app's signing key and the active order is saved first.\n\nSource: https://github.com/${REPO}/commit/${info.commit}\n`;
}

export function findReleaseByTag(gh, tag) {
  // Drafts can exist before their Git tag does; the by-tag API then returns 404.
  // Listing releases includes drafts and gives us the stable release ID.
  const pages = JSON.parse(
    gh('api', `repos/${REPO}/releases?per_page=100`, '--paginate', '--slurp'),
  );
  const matches = pages.flat().filter((release) => release.tag_name === tag);
  if (matches.length > 1)
    throw new Error(`Multiple releases exist for ${tag}; refusing to publish ambiguously.`);
  return matches[0] || null;
}

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
  const help = join(output, 'INSTALLATION.txt');
  await copyFile(resolve('public/INSTALLATION.txt'), help);
  upload.push(help);
  const notes = join(output, 'release-notes.txt');
  await writeFile(
    notes,
    installerNotes(
      info,
      tag,
      upload.map((file) => basename(file)),
    ),
  );
  let release = findReleaseByTag(gh, tag);
  if (release && !release.draft) {
    console.log(`Release ${tag} is already published.`);
    return;
  }
  if (!release) {
    const request = join(output, 'create-release.json');
    await writeFile(
      request,
      JSON.stringify({
        tag_name: tag,
        target_commitish: info.commit,
        name: `Commit ${info.shortCommit} · build ${info.buildNumber}`,
        body: await readFile(notes, 'utf8'),
        draft: true,
      }),
    );
    release = JSON.parse(
      gh('api', '--method', 'POST', `repos/${REPO}/releases`, '--input', request),
    );
  }
  if (!Number.isSafeInteger(release.id))
    throw new Error('GitHub did not return a valid release ID.');
  const releaseEndpoint = `repos/${REPO}/releases/${release.id}`;
  gh('release', 'upload', tag, ...upload, '--repo', REPO, '--clobber');
  release = JSON.parse(gh('api', releaseEndpoint));
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
  gh('api', '--method', 'PATCH', releaseEndpoint, '-F', 'draft=false', '-f', 'make_latest=true');
  console.log(`Published signed update https://github.com/${REPO}/releases/tag/${tag}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await publish();
