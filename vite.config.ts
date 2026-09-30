import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig, type Plugin } from 'vite';

function hashFiles(dir: string, files: string[]) {
  const h = createHash('sha1');
  for (const f of files.sort()) {
    h.update(f);
    h.update(readFileSync(join(dir, f)));
  }
  return h.digest('hex').slice(0, 10);
}

/** Stamp content hashes into dist/sw.js so caches refresh only when needed. */
function serviceWorkerKeys(): Plugin {
  let outDir = 'dist';
  return {
    name: 'facedraw-sw-keys',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const sw = join(outDir, 'sw.js');
      if (!existsSync(sw)) return;
      const staticFiles = ['mediapipe', 'models'].flatMap((d) =>
        readdirSync(join(outDir, d)).map((f) => join(d, f)),
      );
      const appFiles = readdirSync(join(outDir, 'assets')).map((f) => join('assets', f));
      const src = readFileSync(sw, 'utf8')
        .replace('__STATIC_KEY__', hashFiles(outDir, staticFiles))
        .replace('__APP_KEY__', hashFiles(outDir, [...appFiles, 'index.html']));
      writeFileSync(sw, src);
    },
  };
}

// `base: './'` makes the build work from any sub-path
// (GitHub Pages project sites, Vercel, Netlify, a phone on your LAN, ...).
// `npm run dev:phone` serves over HTTPS (self-signed) so a phone on the same
// Wi-Fi can use the camera.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [serviceWorkerKeys(), ...(mode === 'phone' ? [basicSsl()] : [])],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    sourcemap: true,
  },
  worker: {
    format: 'es',
  },
  server: {
    host: true,
  },
}));
