export type BuildInfo = {
  version: string;
  commit: string;
  shortCommit: string;
  buildNumber: number;
  dirty: boolean;
};
declare const __APP_BUILD__: BuildInfo;
export const BUILD: BuildInfo = __APP_BUILD__;
