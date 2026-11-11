import type { BuildInfo } from './build-info.mjs';
export const REQUIRED_PLATFORMS: string[];
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
