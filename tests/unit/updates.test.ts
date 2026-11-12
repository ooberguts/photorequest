import { describe, expect, it, vi } from 'vitest';
import { getBuildInfo, versionForCommit } from '../../scripts/build-info.mjs';
import {
  findReleaseByTag,
  makeManifest,
  platformForArtifact,
  REQUIRED_PLATFORMS,
} from '../../scripts/release.mjs';

describe('commit build versions', () => {
  it('uses the commit count as a numeric version component and retains the full SHA', () => {
    expect(versionForCommit('0.3.0', 17)).toBe('0.3.17');
    expect(versionForCommit('0.3.0', 18)).toBe('0.3.18');
    const info = getBuildInfo();
    expect(info.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(info.shortCommit).toBe(info.commit.slice(0, 7));
    expect(info.version).toBe(`0.3.${info.buildNumber}`);
  });
  it('rejects invalid versions and build counts incompatible with Windows installers', () => {
    for (const count of [-1, NaN, 1.5, 65536])
      expect(() => versionForCommit('0.3.0', count)).toThrow();
    expect(() => versionForCommit('a-version', 2)).toThrow();
  });
});

describe('signed private release manifests', () => {
  it('finds an existing unpublished draft across paginated releases without a tag lookup', () => {
    const draft = { id: 42, tag_name: 'commit-3-example', draft: true, assets: [] };
    const gh = vi.fn(() => JSON.stringify([[{ id: 1, tag_name: 'older', draft: false }], [draft]]));
    expect(findReleaseByTag(gh, draft.tag_name)).toEqual(draft);
    expect(gh).toHaveBeenCalledWith(
      'api',
      'repos/ooberguts/photorequest/releases?per_page=100',
      '--paginate',
      '--slurp',
    );
    expect(findReleaseByTag(gh, 'new-tag')).toBeNull();
  });
  it('does not mistake an API failure or ambiguous drafts for a new release', () => {
    expect(() =>
      findReleaseByTag(() => {
        throw new Error('GitHub 403');
      }, 'tag'),
    ).toThrow('GitHub 403');
    expect(() =>
      findReleaseByTag(() => JSON.stringify([[{ tag_name: 'tag' }, { tag_name: 'tag' }]]), 'tag'),
    ).toThrow('Multiple releases');
  });
  const info = {
    version: '0.3.42',
    commit: 'a'.repeat(40),
    shortCommit: 'a'.repeat(7),
    buildNumber: 42,
    dirty: false,
  };
  const artifacts = Object.fromEntries(
    REQUIRED_PLATFORMS.map((p, i) => [
      p,
      {
        url: `https://api.github.com/repos/ooberguts/photorequest/releases/assets/${i + 1}`,
        signature: 'signature',
      },
    ]),
  );
  it('requires signed update packages for both Mac architectures and Windows installers', () => {
    const manifest = makeManifest(info, artifacts, '2026-11-11T00:00:00Z');
    expect(manifest.commit).toBe(info.commit);
    expect(manifest.version).toBe('0.3.42');
    expect(Object.keys(manifest.platforms)).toHaveLength(5);
    expect(manifest.platforms['windows-x86_64']).toEqual(artifacts['windows-x86_64-nsis']);
    const incomplete = { ...artifacts };
    delete incomplete['darwin-x86_64'];
    expect(() => makeManifest(info, incomplete, '')).toThrow('darwin-x86_64');
  });
  it('rejects missing signatures and URLs outside this repository asset API', () => {
    expect(() =>
      makeManifest(
        info,
        { ...artifacts, 'darwin-aarch64': { ...artifacts['darwin-aarch64'], signature: '' } },
        '',
      ),
    ).toThrow();
    expect(() =>
      makeManifest(
        info,
        {
          ...artifacts,
          'darwin-aarch64': {
            ...artifacts['darwin-aarch64'],
            url: 'https://evil.example/app.tar.gz',
          },
        },
        '',
      ),
    ).toThrow();
  });
  it('identifies payload platforms while ignoring signatures and disk images', () => {
    expect(
      platformForArtifact('PhotoRequest-aarch64-apple-darwin/macos/PhotoRequest.app.tar.gz'),
    ).toBe('darwin-aarch64');
    expect(
      platformForArtifact('PhotoRequest-x86_64-apple-darwin/macos/PhotoRequest.app.tar.gz'),
    ).toBe('darwin-x86_64');
    expect(platformForArtifact('PhotoRequest-x86_64-pc-windows-msvc\\nsis\\PhotoRequest.exe')).toBe(
      'windows-x86_64-nsis',
    );
    expect(platformForArtifact('PhotoRequest-x86_64-pc-windows-msvc/msi/PhotoRequest.msi')).toBe(
      'windows-x86_64-msi',
    );
    expect(platformForArtifact('PhotoRequest.app.tar.gz.sig')).toBeNull();
    expect(platformForArtifact('PhotoRequest.dmg')).toBeNull();
  });
});
