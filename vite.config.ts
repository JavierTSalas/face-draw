import { defineConfig } from 'vite';

// `base: './'` makes the build work from any sub-path
// (GitHub Pages project sites, Vercel, Netlify, a phone on your LAN, ...).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    sourcemap: true,
  },
  worker: {
    format: 'es',
  },
  server: {
    // Camera access needs a secure context. localhost counts as secure; for a
    // phone on your LAN use `npm run dev -- --https` with a tunnel, or deploy.
    host: true,
  },
});
