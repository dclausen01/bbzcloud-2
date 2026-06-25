import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Migrated from Create React App (react-scripts).
//
// Notes specific to this project:
// - The renderer source still uses .js files that contain JSX (CRA allowed
//   this). esbuild is told to parse src/*.js(x) as JSX, and the dependency
//   optimizer is told to treat .js as jsx, so no files had to be renamed.
// - base: './' replaces CRA's `PUBLIC_URL=./` so asset URLs are relative and
//   resolve under Electron's file:// protocol in the packaged app.
// - outDir 'build' keeps electron-builder's config and electron.js's
//   `../build/index.html` / `../build/splash.html` paths unchanged.
// - publicDir defaults to 'public', which is also where the Electron
//   main-process files (electron.js, preload.js, services/, splash.html,
//   webview.html) live; Vite copies them verbatim to build/, exactly as CRA
//   did. Only index.html moved out of public/ to the project root.
// - server.port 3000 matches the URLs electron.js loads in development
//   (http://localhost:3000, .../splash.html, .../webview.html).
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 3000,
    strictPort: true,
  },
  build: {
    outDir: 'build',
    chunkSizeWarningLimit: 2000,
  },
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { '.js': 'jsx' },
    },
  },
});
