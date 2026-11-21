import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// The Android versionName, so her app can tell Rishu's dashboard which version it runs.
let appVersion = 'web';
try { appVersion = (readFileSync(new URL('./android/app/build.gradle', import.meta.url), 'utf8').match(/versionName\s+"([^"]+)"/) || [])[1] || 'web'; } catch { /* web build */ }

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  base: './',
  build: { outDir: 'dist', target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 900 },
  server: { host: true, port: 5173 },
});
