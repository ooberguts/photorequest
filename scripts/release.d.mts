import type { BuildInfo } from './build-info.mjs';
export const REQUIRED_PLATFORMS: string[];
export function installerNotes(info: BuildInfo, tag: string, names: string[]): string;
export function findReleaseByTag(
  gh: (...args: string[]) => string,
  tag: string,
): { id: number; tag_name: string; draft: boolean; assets: { id: number; name: string }[] } | null;
export function platformForArtifact(path: string): string | null;
export function makeManifest(
  info: BuildInfo,
  artifacts: Record<string, { url: string; signature: string }>,
  publishedAt: string,
): {
  version: string;
  commit: string;
  buildNumber: number;
  pub_date: string;
  notes: string;
  platforms: Record<string, { url: string; signature: string }>;
};
