export type BuildInfo = {
  version: string;
  commit: string;
  shortCommit: string;
  buildNumber: number;
  dirty: boolean;
};
export function versionForCommit(baseVersion: string, buildNumber: number): string;
export function getBuildInfo(cwd?: string): BuildInfo;
