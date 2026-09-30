// Copies the MediaPipe WASM runtime into public/ so it is served from our own
// origin (no CDN dependency, cacheable by the service worker).
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const dst = join(root, 'public/mediapipe');

if (!existsSync(src)) {
  console.warn('[copy-wasm] @mediapipe/tasks-vision not installed yet, skipping');
  process.exit(0);
}
mkdirSync(dst, { recursive: true });
for (const f of [
  'vision_wasm_module_internal.js',
  'vision_wasm_module_internal.wasm',
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]) {
  cpSync(join(src, f), join(dst, f));
}
console.log('[copy-wasm] copied MediaPipe wasm to public/mediapipe');
