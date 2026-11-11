import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { getBuildInfo } from './scripts/build-info.mjs';

export default defineConfig({
  define: {
    __APP_BUILD__: JSON.stringify(
      process.env.VITE_GIT_SHA
        ? {
            version: process.env.VITE_APP_VERSION,
            commit: process.env.VITE_GIT_SHA,
            shortCommit: process.env.VITE_GIT_SHA.slice(0, 7),
            buildNumber: Number(process.env.VITE_BUILD_NUMBER),
            dirty: process.env.VITE_BUILD_DIRTY === 'true',
          }
        : getBuildInfo(),
    ),
  },
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  build: { target: ['es2022', 'chrome105', 'safari15.4'] },
});
